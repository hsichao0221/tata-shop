import { generateCheckMacValue } from "./_ecpayUtils.js";

const DEFAULT_HASH_KEY = "5294y06JbISpM5x9";
const DEFAULT_HASH_IV = "v77hoKGq4kWxNNIS";

const SUPABASE_URL = "https://vsqdzntwavegnwctzzgx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcWR6bnR3YXZlZ253Y3R6emd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjEyOTMsImV4cCI6MjA5Mzc5NzI5M30.vkZTXD-XnDH07AYrYTA0k8quTWInwLN_s4oMr70u7nY";

// 必須跟 ecpay-checkout.js 讀取同一組設定，否則驗證碼會不一致而被誤判為偽造請求
async function loadEcpayConfig() {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/erp_settings?key=eq.ecpayConfig&select=value`, {
      headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY },
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const cfg = rows && rows[0] && rows[0].value;
    if (cfg && typeof cfg === "object" && cfg.merchantId && cfg.hashKey && cfg.hashIV) return cfg;
    return null;
  } catch (e) {
    console.warn("讀取金流設定失敗，改用預設測試金鑰:", e);
    return null;
  }
}

// 官網賣出商品時，扣減真實庫存(pos_inventory_stock)。
// 一定會扣官網(web)自己的庫存；如果後台「總倉庫存同步設定」(hqSyncEnabled)是開啟的，
// 同時也扣總倉(hq)的庫存，讓總倉的數字能反映「這批貨已經被賣掉」，不是只有增加、沒有減少。
// 任何一個貨號扣庫存失敗都只記錄log，不會讓整個付款流程失敗(訂單本身已經成立，庫存問題事後可以用「手動校正」補救)。
async function deductInventoryForOrder(items, orderId) {
  const hdrs = {
    "apikey": SUPABASE_ANON_KEY,
    "Authorization": "Bearer " + SUPABASE_ANON_KEY,
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
  };

  let hqSyncEnabled = false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/erp_settings?key=eq.hqSyncEnabled&select=value`, { headers: hdrs });
    const d = r.ok ? await r.json() : [];
    hqSyncEnabled = !!d?.[0]?.value;
  } catch (e) {
    console.warn("讀取總倉庫存同步設定失敗，預設不同步:", e);
  }

  for (const item of items) {
    if (!item.sku || !item.qty) continue;
    // 扣官網庫存
    try {
      const curRes = await fetch(
        `${SUPABASE_URL}/rest/v1/pos_inventory_stock?sku=eq.${encodeURIComponent(item.sku)}&store_id=eq.web&select=qty`,
        { headers: hdrs }
      );
      const curRows = curRes.ok ? await curRes.json() : [];
      const curQty = curRows?.[0]?.qty || 0;
      await fetch(`${SUPABASE_URL}/rest/v1/pos_inventory_stock?on_conflict=sku,store_id`, {
        method: "POST",
        headers: hdrs,
        body: JSON.stringify({
          sku: item.sku, store_id: "web", store_name: "TATA 官網",
          qty: Math.max(0, curQty - item.qty), product_name: item.name || "",
          updated_at: new Date().toISOString(),
        }),
      });
      await fetch(`${SUPABASE_URL}/rest/v1/pos_stock_logs`, {
        method: "POST", headers: hdrs,
        body: JSON.stringify({ store_id: "web", sku: item.sku, type: "web_sale", qty_change: -item.qty, ref_id: orderId, created_at: new Date().toISOString() }),
      });
    } catch (e) {
      console.warn("扣減官網庫存失敗:", item.sku, e);
    }

    // 如果開啟總倉同步，一併扣總倉庫存
    if (hqSyncEnabled) {
      try {
        const curHqRes = await fetch(
          `${SUPABASE_URL}/rest/v1/pos_inventory_stock?sku=eq.${encodeURIComponent(item.sku)}&store_id=eq.hq&select=qty`,
          { headers: hdrs }
        );
        const curHqRows = curHqRes.ok ? await curHqRes.json() : [];
        const curHqQty = curHqRows?.[0]?.qty || 0;
        await fetch(`${SUPABASE_URL}/rest/v1/pos_inventory_stock?on_conflict=sku,store_id`, {
          method: "POST",
          headers: hdrs,
          body: JSON.stringify({
            sku: item.sku, store_id: "hq", store_name: "中央倉",
            qty: Math.max(0, curHqQty - item.qty), product_name: item.name || "",
            updated_at: new Date().toISOString(),
          }),
        });
        await fetch(`${SUPABASE_URL}/rest/v1/pos_stock_logs`, {
          method: "POST", headers: hdrs,
          body: JSON.stringify({ store_id: "hq", sku: item.sku, type: "web_sale_sync", qty_change: -item.qty, ref_id: orderId, created_at: new Date().toISOString() }),
        });
      } catch (e) {
        console.warn("同步扣減總倉庫存失敗:", item.sku, e);
      }
    }
  }
}

export default async function handler(req, res) {
  // ECPay 是用 server-to-server 的方式 POST 通知付款結果，
  // 不管驗證成功或失敗，HTTP status 都必須回 200，
  // 這是 ECPay 官方規定的協定，不能用 4xx/5xx 回應，否則 ECPay 會持續重試通知。
  try {
    const data = req.body;
    const receivedCheckMac = data.CheckMacValue;

    const cfg = await loadEcpayConfig();
    const HASH_KEY = cfg?.hashKey || DEFAULT_HASH_KEY;
    const HASH_IV = cfg?.hashIV || DEFAULT_HASH_IV;

    // 驗證檢查碼：把收到的參數（除了 CheckMacValue 本身）重新計算一次，
    // 比對是否跟 ECPay 傳來的一致，確認這個通知真的是 ECPay 發出的，不是偽造的請求
    const paramsToVerify = { ...data };
    delete paramsToVerify.CheckMacValue;
    const expectedCheckMac = generateCheckMacValue(paramsToVerify, HASH_KEY, HASH_IV);

    if (expectedCheckMac !== receivedCheckMac) {
      console.warn("ECPay 通知檢查碼不符，可能是偽造請求:", data.MerchantTradeNo);
      res.status(200).send("0|FAIL");
      return;
    }

    if (data.RtnCode !== "1") {
      // 付款失敗：訂單在 pos_orders 裡會繼續停留在 pending 狀態，
      // 不更新成 sale，不會被誤計入正式業績統計
      console.warn("ECPay 付款失敗:", data.MerchantTradeNo, data.RtnMsg);
      res.status(200).send("1|OK"); // 即使付款失敗，回應 ECPay 的格式仍要是 1|OK，代表「我方已收到通知」
      return;
    }

    // 付款成功，把之前在 ecpay-checkout 階段已寫入的 pending 訂單，更新成正式的 sale 狀態，
    // 這樣 ERP 那邊的所有銷售分析功能，就會自動把這筆訂單納入計算，不需要額外修改 ERP 任何程式碼。
    try {
      // 先查詢這筆訂單目前的狀態跟商品明細。ECPay官方協定會在沒收到200回應時持續重試通知，
      // 所以同一筆訂單有可能收到不只一次「付款成功」通知——一定要先確認「目前還是pending」
      // 才能扣庫存，避免同一筆訂單被重複扣兩次庫存(這是防重複扣款的關鍵保護)。
      const orderRes = await fetch(
        `${SUPABASE_URL}/rest/v1/pos_orders?id=eq.${data.MerchantTradeNo}&select=type,items`,
        { headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY } }
      );
      const orderRows = orderRes.ok ? await orderRes.json() : [];
      const order = orderRows?.[0];
      const isFirstTimeConfirm = order && order.type === "pending";

      const updateRes = await fetch(
        `${SUPABASE_URL}/rest/v1/pos_orders?id=eq.${data.MerchantTradeNo}`,
        {
          method: "PATCH",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": "Bearer " + SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "sale",
            note: `ECPay付款成功，交易序號:${data.TradeNo || ""}`,
          }),
        }
      );
      if (!updateRes.ok) {
        console.error("更新訂單狀態失敗:", data.MerchantTradeNo, await updateRes.text());
      } else {
        console.log("ECPay 付款成功，訂單已更新:", data.MerchantTradeNo, data.TradeAmt);
      }

      // 只有「第一次」從pending確認成sale，才扣庫存；如果是ECPay重複通知(訂單已經是sale了)，
      // 這裡就跳過，不會重複扣。
      if (isFirstTimeConfirm && Array.isArray(order.items) && order.items.length > 0) {
        await deductInventoryForOrder(order.items, data.MerchantTradeNo);
      }
    } catch (e) {
      console.error("更新訂單狀態時發生錯誤:", e);
    }

    res.status(200).send("1|OK");
  } catch (e) {
    console.error("ECPay notify error:", e);
    // 即使發生錯誤，也要回 200，避免 ECPay 因為收不到正確格式而一直重試
    res.status(200).send("0|FAIL");
  }
}
