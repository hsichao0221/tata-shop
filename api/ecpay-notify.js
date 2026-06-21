import { generateCheckMacValue } from "./_ecpayUtils.js";

const HASH_KEY = "5294y06JbISpM5x9";
const HASH_IV = "v77hoKGq4kWxNNIS";

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
      // 付款失敗
      console.warn("ECPay 付款失敗:", data.MerchantTradeNo, data.RtnMsg);
      res.status(200).send("1|OK"); // 即使付款失敗，回應 ECPay 的格式仍要是 1|OK，代表「我方已收到通知」
      return;
    }

    // 付款成功，這裡之後會把訂單正式寫入 Supabase 的 pos_orders（用 SHOP- 前綴），
    // 目前先記錄 log，待購物車跟結帳頁面串接完整測試過後，再接上正式的寫入邏輯
    console.log("ECPay 付款成功:", {
      orderId: data.MerchantTradeNo,
      amount: data.TradeAmt,
      paymentDate: data.PaymentDate,
    });

    res.status(200).send("1|OK");
  } catch (e) {
    console.error("ECPay notify error:", e);
    // 即使發生錯誤，也要回 200，避免 ECPay 因為收不到正確格式而一直重試
    res.status(200).send("0|FAIL");
  }
}
