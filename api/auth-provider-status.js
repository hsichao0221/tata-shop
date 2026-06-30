// 查詢目前Supabase專案的Facebook/Google登入開啟狀態，給ERP畫面顯示用。
// 注意：絕對不能把client_secret原樣回傳給前端，這支API只挑出「有沒有開啟」這個布林值。

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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

  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;

  if (!token || !projectRef) {
    res.status(500).json({ error: "尚未設定SUPABASE_MANAGEMENT_TOKEN/SUPABASE_PROJECT_REF環境變數" });
    return;
  }

  try {
    const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
    const supaRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await supaRes.json().catch(() => ({}));

    if (!supaRes.ok) {
      res.status(supaRes.status).json({ error: data?.message || "查詢失敗" });
      return;
    }

    res.status(200).json({
      facebook: { enabled: !!data.external_facebook_enabled, hasClientId: !!data.external_facebook_client_id },
      google: { enabled: !!data.external_google_enabled, hasClientId: !!data.external_google_client_id },
    });
  } catch (e) {
    console.error("auth-provider-status error:", e);
    res.status(500).json({ error: "查詢時發生錯誤" });
  }
}
