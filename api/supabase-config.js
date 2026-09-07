// Supabase Auth自助設定：查詢狀態/OAuth登入/SMTP驗證信/Site URL，合併成一個檔案，
// 取代原本supabase-oauth-status.js/supabase-oauth.js/supabase-smtp.js/supabase-site-url.js
// 四個獨立檔案。這是為了節省Vercel免費方案「每次部署最多12個伺服器端函式」的名額。
// GET=查詢目前狀態；POST時用body裡的type欄位("oauth"/"smtp"/"siteUrl")區分要設定哪一項。
// 文件參考：
//   OAuth：https://supabase.com/docs/guides/auth/social-login/auth-facebook、auth-google
//   SMTP：https://supabase.com/docs/guides/auth/auth-smtp
//   Site URL：https://supabase.com/docs/guides/auth/redirect-urls

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const PROJECT_REF = "vsqdzntwavegnwctzzgx"; // tata-shop對應的Supabase專案，從SUPABASE_URL固定取得
const SUPPORTED_PROVIDERS = ["facebook", "google"];

async function patchAuthConfig(accessToken, body) {
  const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
  const supaRes = await fetch(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await supaRes.json().catch(() => ({}));
  return { ok: supaRes.ok, status: supaRes.status, data };
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  if (!accessToken) {
    res.status(500).json({
      error: "尚未設定SUPABASE_ACCESS_TOKEN環境變數，請先到Supabase帳號設定(Account → Access Tokens)建立一組Personal Access Token並貼到Vercel環境變數。",
    });
    return;
  }

  // ── GET：查詢目前狀態(Facebook/Google/SMTP/Site URL) ─────────────
  if (req.method === "GET") {
    try {
      const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
      const supaRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await supaRes.json().catch(() => ({}));

      if (!supaRes.ok) {
        res.status(supaRes.status).json({ error: data?.message || "查詢失敗" });
        return;
      }

      // 注意：絕對不能把client_secret原樣回傳給前端，這裡只挑出「有沒有開啟/有沒有填過ID」這兩個布林值
      res.status(200).json({
        facebook: { enabled: !!data.external_facebook_enabled, hasClientId: !!data.external_facebook_client_id },
        google: { enabled: !!data.external_google_enabled, hasClientId: !!data.external_google_client_id },
        smtp: { enabled: !!data.smtp_host, host: data.smtp_host || "" },
        siteUrl: data.site_url || "",
      });
    } catch (e) {
      console.error("supabase-config status error:", e);
      res.status(500).json({ error: "查詢時發生錯誤" });
    }
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { type } = req.body || {};

  // ── POST type=oauth：設定Facebook/Google登入 ─────────────────────
  if (type === "oauth") {
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
      const body = { [`external_${provider}_enabled`]: enabled !== false };
      if (clientId) body[`external_${provider}_client_id`] = clientId.trim();
      if (secret) body[`external_${provider}_secret`] = secret;

      const result = await patchAuthConfig(accessToken, body);
      if (!result.ok) {
        res.status(result.status).json({ error: result.data?.message || "設定失敗，請確認填寫的金鑰是否正確" });
        return;
      }
      res.status(200).json({ success: true });
    } catch (e) {
      console.error("supabase-config oauth error:", e);
      res.status(500).json({ error: "設定時發生錯誤，請稍後再試" });
    }
    return;
  }

  // ── POST type=smtp：設定驗證信SMTP ────────────────────────────────
  if (type === "smtp") {
    try {
      const { host, port, user, pass, senderEmail, senderName } = req.body || {};
      if (!host || !port || !user || !pass || !senderEmail) {
        res.status(400).json({ error: "請完整填寫SMTP主機、連接埠、帳號、密碼、寄件人Email" });
        return;
      }
      const result = await patchAuthConfig(accessToken, {
        external_email_enabled: true,
        mailer_autoconfirm: false,
        smtp_host: host.trim(),
        smtp_port: String(port).trim(),
        smtp_user: user.trim(),
        smtp_pass: pass,
        smtp_admin_email: senderEmail.trim(),
        smtp_sender_name: senderName?.trim() || "TATA",
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.data?.message || "設定SMTP失敗，請確認填寫的資訊是否正確" });
        return;
      }
      res.status(200).json({ success: true });
    } catch (e) {
      console.error("supabase-config smtp error:", e);
      res.status(500).json({ error: "設定SMTP時發生錯誤，請稍後再試" });
    }
    return;
  }

  // ── POST type=siteUrl：設定Site URL ───────────────────────────────
  if (type === "siteUrl") {
    try {
      const { siteUrl } = req.body || {};
      if (!siteUrl || !siteUrl.trim()) {
        res.status(400).json({ error: "請填寫網站網址" });
        return;
      }
      const cleanUrl = siteUrl.trim().replace(/\/+$/, "");
      const result = await patchAuthConfig(accessToken, {
        site_url: cleanUrl,
        uri_allow_list: `${cleanUrl},${cleanUrl}/**`,
      });
      if (!result.ok) {
        res.status(result.status).json({ error: result.data?.message || "設定失敗，請確認填寫的網址是否正確" });
        return;
      }
      res.status(200).json({ success: true, site_url: result.data.site_url });
    } catch (e) {
      console.error("supabase-config siteUrl error:", e);
      res.status(500).json({ error: "設定時發生錯誤，請稍後再試" });
    }
    return;
  }

  res.status(400).json({ error: "請提供正確的type欄位(oauth/smtp/siteUrl)" });
}
