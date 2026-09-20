// LINE Messaging API串接：處理兩個方向的訊息。
// (1) LINE平台POST過來的：客人傳訊息給官方帳號時，LINE會呼叫這個網址(要設定在
//     LINE Developers後台的Webhook URL)，這裡驗證簽章、存進pos_social_messages、
//     嘗試對應到既有會員(用channel_identities.line欄位比對)。
// (2) ERP呼叫這裡(action=send-reply)：客服在訊息中心回覆時，透過LINE的push API
//     真正把訊息送到客人的LINE，成功後也把這則回覆存進對話紀錄。
//
// 憑證(頻道存取權杖/頻道密鑰)不寫死在程式碼裡，是從erp_settings讀取，
// 每個使用這套系統的品牌都在ERP後台的「管道設定」自己填自己的憑證，符合公版設計。

import crypto from "crypto";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Line-Signature");
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

  const SUPABASE_URL = process.env.SUPABASE_URL || "https://vsqdzntwavegnwctzzgx.supabase.co";
  const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_SERVICE_KEY) {
    res.status(500).json({ error: "尚未設定SUPABASE_SERVICE_ROLE_KEY環境變數，請先到Supabase專案設定(Settings→API)複製service_role金鑰並貼到Vercel環境變數。" });
    return;
  }

  async function sbFetch(path, opts = {}) {
    return fetch(`${SUPABASE_URL}/rest/v1${path}`, {
      ...opts,
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
  }

  async function getLineConfig() {
    const r = await sbFetch("/erp_settings?key=eq.lineConfig&select=value");
    const d = r.ok ? await r.json().catch(() => []) : [];
    return d?.[0]?.value || null;
  }

  // ── ERP端叫用：發送客服回覆給客人的LINE ──────────────────────────
  if (req.body?.action === "send-reply") {
    try {
      const { externalUserId, message, senderName } = req.body;
      if (!externalUserId || !message) {
        res.status(400).json({ error: "缺少必要參數(externalUserId/message)" });
        return;
      }
      const config = await getLineConfig();
      if (!config?.channelAccessToken) {
        res.status(500).json({ error: "尚未設定LINE憑證，請先到訊息中心的「管道設定」填入" });
        return;
      }
      const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
        method: "POST",
        headers: { Authorization: `Bearer ${config.channelAccessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ to: externalUserId, messages: [{ type: "text", text: message }] }),
      });
      if (!lineRes.ok) {
        const errData = await lineRes.json().catch(() => ({}));
        console.error("LINE發送失敗:", errData);
        res.status(500).json({ error: "LINE發送失敗，請確認「管道設定」裡的憑證是否正確" });
        return;
      }
      const newMsg = {
        id: `SOC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        channel: "line",
        external_user_id: externalUserId,
        sender: "staff",
        sender_name: senderName || "客服",
        message,
        read_by_staff: true,
      };
      const saveRes = await sbFetch("/pos_social_messages", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(newMsg),
      });
      if (!saveRes.ok) {
        console.warn("send-reply: LINE已送出，但寫入對話紀錄失敗");
      }
      res.status(200).json({ success: true, message: newMsg });
    } catch (e) {
      console.error("send-reply error:", e);
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  // ── LINE平台叫用：收到客人傳來的訊息(webhook) ─────────────────────
  try {
    const config = await getLineConfig();
    if (!config?.channelSecret) {
      // 還沒在「管道設定」填過憑證，沒辦法驗證簽章，先安全地回200避免LINE一直重試，
      // 但不處理內容(不能在沒有密鑰的情況下驗證這是不是真的LINE送來的)。
      res.status(200).json({ ok: true });
      return;
    }

    // 驗證簽章：確認這個請求真的是LINE平台送來的，不是別人偽造的
    const signature = req.headers["x-line-signature"];
    const rawBody = JSON.stringify(req.body);
    const hash = crypto.createHmac("SHA256", config.channelSecret).update(rawBody).digest("base64");
    if (signature !== hash) {
      console.warn("line-webhook: 簽章驗證失敗，忽略此請求");
      res.status(200).json({ ok: true });
      return;
    }

    const events = req.body?.events || [];
    for (const event of events) {
      if (event.type === "message" && event.message?.type === "text") {
        const userId = event.source?.userId;
        if (!userId) continue;

        // 嘗試找出這個LINE使用者對應到哪個會員(如果客人之前已經連結過LINE)，
        // 對應不到就先當成陌生訪客的訊息存起來，member_id留空。
        let memberId = null;
        let senderName = "客人";
        try {
          const memRes = await sbFetch(`/pos_members?channel_identities->>line=eq.${encodeURIComponent(userId)}&select=id,name&limit=1`);
          const mem = memRes.ok ? (await memRes.json().catch(() => []))?.[0] : null;
          if (mem) {
            memberId = mem.id;
            senderName = mem.name || senderName;
          }
        } catch (e) {
          console.warn("查詢對應會員失敗(不影響訊息本身正常存入):", e);
        }

        const newMsg = {
          id: `SOC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          channel: "line",
          external_user_id: userId,
          member_id: memberId,
          sender: "customer",
          sender_name: senderName,
          message: event.message.text,
          read_by_staff: false,
        };
        const saveRes = await sbFetch("/pos_social_messages", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify(newMsg),
        });
        if (!saveRes.ok) {
          console.error("line-webhook: 寫入訊息失敗", await saveRes.text().catch(() => ""));
        }
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("line-webhook error:", e);
    // 即使處理過程出錯，還是回200，避免LINE平台誤判成失敗而一直重試同一個事件
    res.status(200).json({ ok: true });
  }
}
