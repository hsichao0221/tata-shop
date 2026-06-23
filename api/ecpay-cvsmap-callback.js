// 綠界「門市電子地圖」選完門市後，會用POST把門市資訊送回這裡（ServerReplyURL）。
// 這支API負責：把選到的門市資訊暫存進shop_cvs_selections（用draftId當key），
// 再用redirect把瀏覽器導回結帳頁，結帳頁會用同一個draftId去查剛剛存的門市資訊。
// 注意：這裡完全不影響/不會碰到既有的ecpay-checkout.js、ecpay-notify.js付款流程，
// 是結帳流程「選門市」這一個獨立步驟，純新增檔案。

const SUPABASE_URL = "https://vsqdzntwavegnwctzzgx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcWR6bnR3YXZlZ253Y3R6emd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjEyOTMsImV4cCI6MjA5Mzc5NzI5M30.vkZTXD-XnDH07AYrYTA0k8quTWInwLN_s4oMr70u7nY";

const CARRIER_LABEL = {
  UNIMART: "7-11",
  UNIMARTFREEZE: "7-11（冷凍店取）",
  FAMI: "全家",
  HILIFE: "萊爾富",
};

export default async function handler(req, res) {
  try {
    const data = req.body || {};
    // ExtraData跟MerchantTradeNo帶的是同一個編號，哪個有值就用哪個，提高比對成功率
    const draftId = data.ExtraData || data.MerchantTradeNo || "";
    const carrier = CARRIER_LABEL[data.LogisticsSubType] || data.LogisticsSubType || "";

    if (draftId) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/shop_cvs_selections`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": "Bearer " + SUPABASE_ANON_KEY,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
          },
          body: JSON.stringify({
            draft_id: draftId,
            store_id: data.CVSStoreID || "",
            store_name: data.CVSStoreName || "",
            address: data.CVSAddress || "",
            telephone: data.CVSTelephone || "",
            carrier,
          }),
        });
      } catch (e) {
        // 暫存失敗也要讓顧客回到結帳頁（只是門市資訊會是空的，顧客可以重新選一次），
        // 不能讓顧客卡在綠界頁面上沒有退路
        console.warn("寫入門市選擇暫存失敗:", e);
      }
    }

    res.redirect(302, `/checkout?cvsDraft=${encodeURIComponent(draftId)}`);
  } catch (e) {
    console.error("ecpay-cvsmap-callback error:", e);
    res.redirect(302, "/checkout");
  }
}
