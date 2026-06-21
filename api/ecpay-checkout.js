import { generateCheckMacValue } from "./_ecpayUtils.js";

// ECPay 測試環境設定（官方公開測試值，任何開發者都能用來測試串接流程）
// 等正式申請好商家帳號後，把下面三個值換成正式的，即可切換成正式收款環境
const MERCHANT_ID = "2000132";
const HASH_KEY = "5294y06JbISpM5x9";
const HASH_IV = "v77hoKGq4kWxNNIS";
const ECPAY_CHECKOUT_URL = "https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5";

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

    // 商品名稱用 # 分隔（ECPay 規定的多商品顯示格式）
    const itemName = items.map((i) => `${i.name} x${i.qty}`).join("#");

    const baseUrl = `https://${req.headers.host}`;

    const params = {
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: orderId, // 訂單編號，須為英數字、20字以內、不可重複
      MerchantTradeDate: formatDate(new Date()),
      PaymentType: "aio",
      TotalAmount: Math.round(totalAmount),
      TradeDesc: "TATA線上商店訂單",
      ItemName: itemName,
      ReturnURL: `${baseUrl}/api/ecpay-notify`, // ECPay 背景通知付款結果
      ChoosePayment: "Credit", // 先只開信用卡，之後可視需要開放其他付款方式
      EncryptType: 1, // 1 = SHA256
      OrderResultURL: `${baseUrl}/order-result`, // 顧客付款完成後，瀏覽器導回的頁面
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
