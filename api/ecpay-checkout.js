import { generateCheckMacValue } from "./_ecpayUtils.js";

// ECPay 測試環境設定（官方公開測試值，任何開發者都能用來測試串接流程）
// 等正式申請好商家帳號後，把下面三個值換成正式的，即可切換成正式收款環境
const MERCHANT_ID = "2000132";
const HASH_KEY = "5294y06JbISpM5x9";
const HASH_IV = "v77hoKGq4kWxNNIS";
const ECPAY_CHECKOUT_URL = "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";

// 共用 fashion-erp 同一個 Supabase 專案
const SUPABASE_URL = "https://vsqdzntwavegnwctzzgx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcWR6bnR3YXZlZ253Y3R6emd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjEyOTMsImV4cCI6MjA5Mzc5NzI5M30.vkZTXD-XnDH07AYrYTA0k8quTWInwLN_s4oMr70u7nY";

function formatDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    const { items, totalAmount, orderId } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "購物車是空的" });
      return;
    }
    if (!totalAmount || totalAmount <= 0) {
      res.status(400).json({ error: "金額不正確" });
      return;
    }

    const now = new Date();

    // 先把完整訂單明細（含商品清單）以「待付款」狀態寫入 pos_orders，
    // 因為 ECPay 之後通知付款結果時，只會帶回訂單編號、金額，不會帶回購物車明細，
    // 所以要先在這裡保留完整資料，等 ecpay-notify 收到付款成功通知時，
    // 用同一個訂單編號去更新這筆訂單的狀態即可，不需要重新組裝商品明細。
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/pos_orders`, {
        method: "POST",
        headers: {
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": "Bearer " + SUPABASE_ANON_KEY,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({
          id: orderId,
          date: formatDate(now).split(" ")[0],
          time: formatDate(now).split(" ")[1],
          store_id: "web",
          store_name: "TATA 官網",
          staff: "線上訂單",
          items: items.map((i) => ({ name: i.name, qty: i.qty, sku: i.sku || "", variant: i.variantName || "" })),
          subtotal: Math.round(totalAmount),
          discount: 0,
          total: Math.round(totalAmount),
          disc_mode: "none",
          disc_pct: 100,
          disc_amt: 0,
          promo_code: null,
          pay_method: "credit",
          pay_slots: null,
          deposit_used: 0,
          cash_input: 0,
          change_amount: 0,
          member_id: null,
          member_name: null,
          note: "ECPay待付款",
          type: "pending", // 待付款狀態，收到ecpay-notify確認付款成功後才會更新成 sale
        }),
      });
    } catch (e) {
      // 寫入暫存訂單失敗不應該阻擋顧客結帳，記錄log即可，
      // 之後若notify收到付款成功通知時找不到對應訂單，會在那裡另外處理
      console.warn("寫入待付款訂單失敗:", e);
    }

    // 商品名稱用 # 分隔（ECPay 規定的多商品顯示格式）
    const itemName = items.map((i) => `${i.name} x${i.qty}`).join("#");

    const baseUrl = `https://${req.headers.host}`;

    const params = {
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: orderId, // 訂單編號，須為英數字、20字以內、不可重複
      MerchantTradeDate: formatDate(now),
      PaymentType: "aio",
      TotalAmount: Math.round(totalAmount),
      TradeDesc: "TATA線上商店訂單",
      ItemName: itemName,
      ReturnURL: `${baseUrl}/api/ecpay-notify`, // ECPay 背景通知付款結果
      ChoosePayment: "Credit", // 先只開信用卡，之後可視需要開放其他付款方式
      EncryptType: 1, // 1 = SHA256
      OrderResultURL: `${baseUrl}/api/order-result`, // 顧客付款完成後，ECPay會用POST方式回傳到這個後端API，
      // 不能直接指向前端頁面（會收到405錯誤），這個API會再轉導向真正的成功頁面
    };

    const checkMacValue = generateCheckMacValue(params, HASH_KEY, HASH_IV);

    res.status(200).json({
      checkoutUrl: ECPAY_CHECKOUT_URL,
      params: { ...params, CheckMacValue: checkMacValue },
    });
  } catch (e) {
    console.error("ECPay checkout error:", e);
    res.status(500).json({ error: "建立訂單失敗，請稍後再試" });
  }
}
