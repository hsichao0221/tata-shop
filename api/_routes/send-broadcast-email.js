// 廣播中心 - Email 發送端點。呼叫 Resend 的 Email API 批次寄送行銷信件給選定的會員名單。
// 跟現有的 supabase-smtp.js（設定Supabase帳號系統通知信用的SMTP）是分開的用途：
// 這裡是「廣播中心主動發送的行銷信」，用 Resend 的 REST API（不是SMTP），需要一組獨立的
// Resend API Key，設定在 Vercel 環境變數 RESEND_API_KEY。
// Resend 申請 API Key 的地方：https://resend.com/api-keys

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

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

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        "尚未設定RESEND_API_KEY環境變數，請先到 https://resend.com/api-keys 建立一組API Key，並貼到Vercel環境變數(Settings → Environment Variables)，才能使用廣播中心的Email發送功能。",
    });
    return;
  }

  try {
    const { recipients, subject, html, senderEmail, senderName } = req.body || {};
    if (!Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: "缺少收件人名單" });
      return;
    }
    if (!subject || !html) {
      res.status(400).json({ error: "缺少信件主旨或內容" });
      return;
    }
    if (!senderEmail) {
      res.status(400).json({ error: "缺少寄件人Email，請先在後台設定寄件人信箱(需與Resend驗證過的網域一致)" });
      return;
    }

    // Resend 一次呼叫最多支援 100 位收件人。多人時用bcc隱藏收件人名單(避免會員彼此看到email)，
    // 但只有1位收件人時(例如測試發送)直接放在to欄位，不用bcc搭配假的to，
    // 這種寫法在部分收信端(如Gmail)容易被判定成可疑郵件、更容易進垃圾信匣或被直接過濾掉
    const BATCH = 50;
    const results = { sent: 0, failed: 0, errors: [] };
    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH);
      try {
        const payload = batch.length === 1
          ? {
              from: `${senderName || "TATA"} <${senderEmail}>`,
              to: batch,
              subject,
              html,
            }
          : {
              from: `${senderName || "TATA"} <${senderEmail}>`,
              to: [senderEmail], // 主收件人放自己，實際收件人用bcc隱藏，避免會員彼此看到email
              bcc: batch,
              subject,
              html,
            };
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        const data = await r.json().catch(() => ({}));
        if (r.ok) {
          results.sent += batch.length;
        } else {
          results.failed += batch.length;
          results.errors.push(data?.message || `第${i + 1}批寄送失敗`);
        }
      } catch (e) {
        results.failed += batch.length;
        results.errors.push(String(e));
      }
    }

    res.status(200).json({ success: true, ...results });
  } catch (e) {
    console.error("send-broadcast-email error:", e);
    res.status(500).json({ error: "寄送廣播信件時發生錯誤，請稍後再試" });
  }
}
