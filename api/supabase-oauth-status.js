// 查詢目前Supabase專案的Facebook/Google登入開啟狀態，給ERP「會員登入設定」畫面顯示用。
// 跟supabase-oauth.js(寫入)是一組，沿用同樣的環境變數(SUPABASE_ACCESS_TOKEN)跟PROJECT_REF。
// 注意：絕對不能把client_secret原樣回傳給前端，這支API只挑出「有沒有開啟/有沒有填過ID」這兩個布林值。

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const PROJECT_REF = "vsqdzntwavegnwctzzgx"; // tata-shop對應的Supabase專案，從SUPABASE_URL固定取得

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({ error: "尚未設定SUPABASE_ACCESS_TOKEN環境變數" });
    return;
  }

  try {
    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
    const supaRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await supaRes.json().catch(() => ({}));

    if (!supaRes.ok) {
      res.status(supaRes.status).json({ error: data?.message || "查詢失敗" });
      return;
    }

    res.status(200).json({
      facebook: { enabled: !!data.external_facebook_enabled, hasClientId: !!data.external_facebook_client_id },
      google: { enabled: !!data.external_google_enabled, hasClientId: !!data.external_google_client_id },
      smtp: { enabled: !!data.smtp_host, host: data.smtp_host || "" },
    });
  } catch (e) {
    console.error("supabase-oauth-status error:", e);
    res.status(500).json({ error: "查詢時發生錯誤" });
  }
}
