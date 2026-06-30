// 把客人填的Facebook/Google OAuth App金鑰透過Supabase Management API直接設定到專案的
// Auth Provider，客人不用自己切去Supabase後台填表單。
// 文件參考：https://supabase.com/docs/guides/auth/social-login/auth-facebook、auth-google
// (PATCH /v1/projects/{ref}/config/auth，欄位是 external_{provider}_enabled/client_id/secret)

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const PROJECT_REF = "vsqdzntwavegnwctzzgx";
const SUPPORTED_PROVIDERS = ["facebook", "google"];

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({
      error: "尚未設定SUPABASE_ACCESS_TOKEN環境變數，請先到Supabase帳號設定建立Personal Access Token並貼到Vercel環境變數。",
    });
    return;
  }

  try {
    const { provider, clientId, secret, enabled } = req.body || {};
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: "不支援的登入方式" });
      return;
    }
    if (enabled !== false && (!clientId || !secret)) {
      res.status(400).json({ error: "請填寫Client ID跟Client Secret" });
      return;
    }

    const body = {
      [`external_${provider}_enabled`]: enabled !== false,
    };
    if (clientId) body[`external_${provider}_client_id`] = clientId.trim();
    if (secret) body[`external_${provider}_secret`] = secret;

    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
    const supaRes = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await supaRes.json().catch(() => ({}));

    if (!supaRes.ok) {
      res.status(supaRes.status).json({ error: data?.message || "設定失敗，請確認填寫的金鑰是否正確" });
      return;
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error("supabase-oauth error:", e);
    res.status(500).json({ error: "設定時發生錯誤，請稍後再試" });
  }
}
