import { generateCheckMacValue } from "./_ecpayUtils.js";

const HASH_KEY = "5294y06JbISpM5x9";
const HASH_IV = "v77hoKGq4kWxNNIS";

const SUPABASE_URL = "https://vsqdzntwavegnwctzzgx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcWR6bnR3YXZlZ253Y3R6emd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjEyOTMsImV4cCI6MjA5Mzc5NzI5M30.vkZTXD-XnDH07AYrYTA0k8quTWInwLN_s4oMr70u7nY";

export default async function handler(req, res) {
  // ECPay 是用 server-to-server 的方式 POST 通知付款結果，
  // 不管驗證成功或失敗，HTTP status 都必須回 200，
  // 這是 ECPay 官方規定的協定，不能用 4xx/5xx 回應，否則 ECPay 會持續重試通知。
  try {
    const data = req.body;
    const receivedCheckMac = data.CheckMacValue;

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
