// 把客戶在ERP填的Facebook/Google App ID/Secret，自動串接到這個Supabase專案的Auth Provider設定，
// 不用客戶自己跑去Supabase後台貼一次（跟Shopline「商家把金鑰貼在Shopline自己後台」的體驗一致）。
// 文件參考：https://supabase.com/docs/guides/auth/social-login/auth-facebook
//          https://supabase.com/docs/guides/auth/social-login/auth-google

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// 目前Supabase原生支援的OAuth提供者裡沒有LINE，所以只開放facebook/google走自動串接，
// LINE維持手動設定提示（不接受這支API）。
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

  const token = process.env.SUPABASE_MANAGEMENT_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;

  if (!token || !projectRef) {
    res.status(500).json({
      error:
        "尚未設定SUPABASE_MANAGEMENT_TOKEN/SUPABASE_PROJECT_REF環境變數，請先到Vercel專案設定補上，才能使用自動串接功能。",
    });
    return;
  }

  try {
    const { provider, clientId, clientSecret, enabled } = req.body || {};
    if (!SUPPORTED_PROVIDERS.includes(provider)) {
      res.status(400).json({ error: `不支援的登入方式：${provider}（目前只支援facebook/google自動串接）` });
      return;
    }
    if (enabled && (!clientId || !clientSecret)) {
      res.status(400).json({ error: "要開啟這個登入方式，必須同時填寫Client ID跟Client Secret" });
      return;
    }

    const body = {
      [`external_${provider}_enabled`]: !!enabled,
    };
    // 關閉時不強制覆蓋已存在的ID/Secret(避免使用者只是想暫時關閉、之後又要開回來時金鑰被洗掉)，
    // 只有在有填值時才一併更新
    if (clientId) body[`external_${provider}_client_id`] = clientId;
    if (clientSecret) body[`external_${provider}_secret`] = clientSecret;

    const url = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;
    const supaRes = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await supaRes.json().catch(() => ({}));

    if (!supaRes.ok) {
      res.status(supaRes.status).json({ error: data?.message || data?.error || "串接失敗，請確認金鑰格式正確" });
      return;
    }

    res.status(200).json({ success: true, provider, enabled: !!enabled });
  } catch (e) {
    console.error("auth-provider-connect error:", e);
    res.status(500).json({ error: "串接時發生錯誤，請稍後再試" });
  }
}
