// 把客人填的SMTP資訊(從Resend/SendGrid申請的)透過Supabase Management API直接設定到專案的
// Auth服務，客人不用自己切去Supabase後台填表單，跟ERP的「網域設定」是同一套自助連接模式。
// 文件參考：https://supabase.com/docs/guides/auth/auth-smtp (PATCH /v1/projects/{ref}/config/auth)

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
      error:
        "尚未設定SUPABASE_ACCESS_TOKEN環境變數，請先到Supabase帳號設定(Account → Access Tokens)建立一組Personal Access Token並貼到Vercel環境變數，才能使用自動設定SMTP功能。",
    });
    return;
  }

  try {
    const { host, port, user, pass, senderEmail, senderName } = req.body || {};
    if (!host || !port || !user || !pass || !senderEmail) {
      res.status(400).json({ error: "請完整填寫SMTP主機、連接埠、帳號、密碼、寄件人Email" });
      return;
    }

    const url = `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`;
    const supaRes = await fetch(url, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        external_email_enabled: true,
        mailer_autoconfirm: false,
        smtp_host: host.trim(),
        smtp_port: String(port).trim(),
        smtp_user: user.trim(),
        smtp_pass: pass,
        smtp_admin_email: senderEmail.trim(),
        smtp_sender_name: senderName?.trim() || "TATA",
      }),
    });
    const data = await supaRes.json().catch(() => ({}));

    if (!supaRes.ok) {
      res.status(supaRes.status).json({ error: data?.message || "設定SMTP失敗，請確認填寫的資訊是否正確" });
      return;
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error("supabase-smtp error:", e);
    res.status(500).json({ error: "設定SMTP時發生錯誤，請稍後再試" });
  }
}
