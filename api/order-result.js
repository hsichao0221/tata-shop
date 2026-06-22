// ECPay 的 OrderResultURL，官方規定是用 POST 方式回傳付款結果參數，
// 不能直接指向一個純前端的 React 頁面（會收到405錯誤，因為前端頁面只接受GET請求）。
// 這個後端 API 負責接收這個 POST 請求，取出關鍵的付款結果資訊，
// 再用 redirect 的方式，把瀏覽器導向真正的前端成功頁面（/order-result），
// 並把訂單編號、付款狀態以網址參數帶過去，讓前端頁面可以顯示對應的訊息。
export default async function handler(req, res) {
  try {
    const data = req.body || {};
    const orderId = data.MerchantTradeNo || "";
    const rtnCode = data.RtnCode || "";

    // 用 302 redirect 導向前端的訂單結果頁，帶上訂單編號和付款狀態
    const redirectUrl = `/order-result?orderId=${encodeURIComponent(orderId)}&success=${rtnCode === "1" ? "1" : "0"}`;
    res.redirect(302, redirectUrl);
  } catch (e) {
    console.error("order-result API error:", e);
    // 即使發生錯誤，也導向結果頁，避免顧客卡在錯誤畫面
    res.redirect(302, "/order-result");
  }
}
