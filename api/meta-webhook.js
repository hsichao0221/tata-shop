// Facebook/Instagram串接：處理兩件事(比LINE少一件，Meta目前沒有做「客人自己連結帳號」的綁定流程，
// 陌生訪客的訊息一律先存起來，member_id留空，之後真的有需要再仿照LINE Login的模式另外做)。
// (1) Meta平台POST過來的：客人傳訊息給Facebook粉專/Instagram帳號時，Meta會呼叫這個網址(要設定在
//     Meta for Developers後台「Webhooks」訂閱、同一個App底下Facebook跟Instagram可以共用同一個
//     Webhook網址，用payload裡的object欄位("page"=Facebook / "instagram"=Instagram)分辨)，
//     這裡驗證簽章、存進pos_social_messages。
// (2) ERP呼叫這裡(action=send-reply)：客服在訊息中心回覆時，透過Meta的Send API真正把訊息送到
//     客人的Messenger/Instagram，成功後也把這則回覆存進對話紀錄。
//
// 憑證(粉專存取權杖/App Secret/Webhook驗證字串)不寫死在程式碼裡，是從erp_settings讀取，
// 每個使用這套系統的品牌都在ERP後台的「管道設定」自己填自己的憑證，符合公版設計。
//
// 重要提醒：這個功能需要TATA自己申請Meta開發者App、通過審核(pages_messaging等權限)才能真正上線，
// Shopline原本的Meta App授權不能沿用。這支程式碼先寫好備用，實際能不能動要等審核通過。

import crypto from "crypto";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Hub-Signature-256");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST" && req.method !== "GET") {
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

  async function getMetaConfig() {
    const r = await sbFetch("/erp_settings?key=eq.metaConfig&select=value");
    const d = r.ok ? await r.json().catch(() => []) : [];
    return d?.[0]?.value || null;
  }

  // ── ERP端叫用：發送客服回覆給客人的Messenger/Instagram ──────────────────
  if (req.method === "POST" && req.body?.action === "send-reply") {
    try {
      const { externalUserId, message, senderName, channel } = req.body;
      if (!externalUserId || !message) {
        res.status(400).json({ error: "缺少必要參數(externalUserId/message)" });
        return;
      }
      const config = await getMetaConfig();
      if (!config?.pageAccessToken) {
        res.status(500).json({ error: "尚未設定Meta憑證，請先到訊息中心的「管道設定」填入" });
        return;
      }
      // Facebook粉專、Instagram官方帳號的Send API網址跟參數格式一樣，都是呼叫同一個
      // /me/messages端點，差別只在Page Access Token是綁哪個帳號產生的，不用分成兩套邏輯。
      const metaRes = await fetch(`https://graph.facebook.com/v19.0/me/messages?access_token=${encodeURIComponent(config.pageAccessToken)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipient: { id: externalUserId }, message: { text: message } }),
      });
      if (!metaRes.ok) {
        const errData = await metaRes.json().catch(() => ({}));
        console.error("Meta發送失敗:", errData);
        res.status(500).json({ error: "發送失敗，請確認「管道設定」裡的憑證是否正確，且對話對象在24小時互動視窗內(超過24小時Meta限制一般訊息不能主動發送)" });
        return;
      }
      const newMsg = {
        id: `SOC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        channel: channel === "instagram" ? "instagram" : "facebook",
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
        console.warn("send-reply: 已送出，但寫入對話紀錄失敗");
      }
      res.status(200).json({ success: true, message: newMsg });
    } catch (e) {
      console.error("send-reply error:", e);
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  // ── Meta平台呼叫：訂閱Webhook時的驗證請求 ──────────────────────────────
  if (req.method === "GET") {
    try {
      const config = await getMetaConfig();
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];
      if (mode === "subscribe" && config?.verifyToken && token === config.verifyToken) {
        res.status(200).send(challenge);
      } else {
        res.status(403).json({ error: "verify_token不符，請確認Meta後台設定的字串跟「管道設定」裡填的一致" });
      }
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  // ── Meta平台呼叫：客人傳訊息進來 ──────────────────────────────────────
  try {
    const config = await getMetaConfig();
    if (!config?.appSecret) {
      // 還沒在「管道設定」填過憑證，沒辦法驗證簽章，先安全地回200避免Meta一直重試，
      // 但不處理內容。
      res.status(200).json({ ok: true });
      return;
    }

    // 驗證簽章：確認這個請求真的是Meta平台送來的，不是別人偽造的
    const signature = req.headers["x-hub-signature-256"];
    const rawBody = JSON.stringify(req.body);
    const hash = "sha256=" + crypto.createHmac("sha256", config.appSecret).update(rawBody).digest("hex");
    if (signature !== hash) {
      console.warn("meta-webhook: 簽章驗證失敗，忽略此請求");
      res.status(200).json({ ok: true });
      return;
    }

    // object欄位分辨這是Facebook粉專("page")還是Instagram("instagram")送來的事件
    const isInstagram = req.body?.object === "instagram";
    const channel = isInstagram ? "instagram" : "facebook";
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      const messagingEvents = entry.messaging || [];
      for (const event of messagingEvents) {
        if (!event.message?.text) continue; // 先只處理純文字訊息，貼圖/圖片之後有需要再擴充
        const senderId = event.sender?.id;
        if (!senderId) continue;

        // 嘗試找出這位訪客對應到哪個會員——目前系統還沒有「客人自己連結FB/IG帳號」的綁定流程，
        // 大多數情況這裡都會查不到人、member_id留空，先當成陌生訪客的訊息存起來。
        let memberId = null;
        let senderName = "客人";
        try {
          const field = isInstagram ? "instagram" : "facebook";
          const memRes = await sbFetch(`/pos_members?channel_identities->>${field}=eq.${encodeURIComponent(senderId)}&select=id,name&limit=1`);
          const mem = memRes.ok ? (await memRes.json().catch(() => []))?.[0] : null;
          if (mem) { memberId = mem.id; senderName = mem.name || senderName; }
        } catch (e) {
          console.warn("查詢對應會員失敗(不影響訊息本身正常存入):", e);
        }

        const newMsg = {
          id: `SOC-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          channel,
          external_user_id: senderId,
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
          console.error("meta-webhook: 寫入訊息失敗", await saveRes.text().catch(() => ""));
        }
      }
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("meta-webhook error:", e);
    // 即使處理過程出錯，還是回200，避免Meta平台誤判成失敗而一直重試同一個事件
    res.status(200).json({ ok: true });
  }
}
