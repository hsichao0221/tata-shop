// 把官網目前實際的網址設定到Supabase的Site URL，這個設定值會決定驗證信/忘記密碼信裡
// 連結指向哪個網址，如果沒改過會停留在Supabase的預設值localhost，導致客人點信裡的連結
// 出現「無法連上這個網站」。跟supabase-smtp.js/supabase-oauth.js是同一套自助連接模式。
// 文件參考：https://supabase.com/docs/guides/auth/redirect-urls

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const PROJECT_REF = "vsqdzntwavegnwctzzgx"; // tata-shop對應的Supabase專案，從SUPABASE_URL固定取得

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
      error: "尚未設定SUPABASE_ACCESS_TOKEN環境變數，請先到Supabase帳號設定(Account → Access Tokens)建立一組Personal Access Token並貼到Vercel環境變數。",
    });
    return;
  }

  try {
    const { siteUrl } = req.body || {};
    if (!siteUrl || !siteUrl.trim()) {
      res.status(400).json({ error: "請填寫網站網址" });
      return;
    }
    // 去掉結尾的斜線，避免變成 https://example.com// 這種格式問題
    const cleanUrl = siteUrl.trim().replace(/\/+$/, "");

    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
    const supaRes = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        site_url: cleanUrl,
        // 同時把這個網址(含常見的auth相關路徑)加進允許清單，避免之後某些驗證流程的
        // redirect_to被擋下來；重設密碼會用到 /update-password 這個路徑(對應AuthContext.jsx)
        uri_allow_list: `${cleanUrl},${cleanUrl}/*`,
      }),
    });
    const data = await supaRes.json().catch(() => ({}));

    if (!supaRes.ok) {
      res.status(supaRes.status).json({ error: data?.message || "設定失敗，請確認填寫的網址是否正確" });
      return;
    }

    res.status(200).json({ success: true, site_url: data.site_url });
  } catch (e) {
    console.error("supabase-site-url error:", e);
    res.status(500).json({ error: "設定時發生錯誤，請稍後再試" });
  }
}
