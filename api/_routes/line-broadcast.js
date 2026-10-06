// LINE廣播：呼叫LINE官方Multicast API，一次發送訊息給多位已綁定LINE的會員。
// 沿用line-webhook.js既有的LINE憑證讀取方式(從erp_settings的lineConfig讀)，
// 不重新發明一套設定，管道設定頁面填一次，訊息中心的客服回覆、這裡的廣播都共用同一組憑證。
// LINE Multicast API一次最多接受500個userId，超過的話要自己分批送，這裡有處理分批。

const SUPABASE_URL = process.env.SUPABASE_URL || "https://vsqdzntwavegnwctzzgx.supabase.co";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_SERVICE_KEY) {
    res.status(500).json({ error: "尚未設定SUPABASE_SERVICE_ROLE_KEY環境變數，請先到Vercel環境變數設定" });
    return;
  }

  try {
    const { userIds, message } = req.body || {};
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      res.status(400).json({ error: "缺少收件人清單" });
      return;
    }
    if (!message || !message.trim()) {
      res.status(400).json({ error: "缺少訊息內容" });
      return;
    }

    // 讀取LINE憑證，跟line-webhook.js的getLineConfig()是同一份資料來源(erp_settings.lineConfig)
    const cfgRes = await fetch(`${SUPABASE_URL}/rest/v1/erp_settings?key=eq.lineConfig&select=value`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const cfgData = cfgRes.ok ? await cfgRes.json().catch(() => []) : [];
    const channelAccessToken = cfgData?.[0]?.value?.channelAccessToken;
    if (!channelAccessToken) {
      res.status(500).json({ error: "尚未設定LINE憑證，請先到訊息中心的「管道設定」填入" });
      return;
    }

    // 去除重複、空值，並分批(每批最多500個，LINE Multicast API的上限)
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    const BATCH_SIZE = 500;
    const batches = [];
    for (let i = 0; i < uniqueIds.length; i += BATCH_SIZE) batches.push(uniqueIds.slice(i, i + BATCH_SIZE));

    let sent = 0, failed = 0;
    const errors = [];
    for (const batch of batches) {
      try {
        const lineRes = await fetch("https://api.line.me/v2/bot/message/multicast", {
          method: "POST",
          headers: { Authorization: `Bearer ${channelAccessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ to: batch, messages: [{ type: "text", text: message }] }),
        });
        if (lineRes.ok) {
          sent += batch.length;
        } else {
          failed += batch.length;
          const errData = await lineRes.json().catch(() => ({}));
          errors.push(errData.message || "未知錯誤");
        }
      } catch (e) {
        failed += batch.length;
        errors.push(String(e));
      }
    }

    res.status(200).json({ success: sent > 0, sent, failed, errors: errors.length ? errors : undefined });
  } catch (e) {
    console.error("line-broadcast error:", e);
    res.status(500).json({ error: "發送LINE廣播時發生錯誤：" + e.message });
  }
}
