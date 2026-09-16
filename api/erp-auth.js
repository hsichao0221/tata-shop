// ERP員工帳號認證：處理邀請信發送、員工自己設定密碼、登入驗證。
// 密碼用bcrypt加密，比對一律在伺服器端做(不會把雜湊值傳到瀏覽器)。
// 現有帳號的舊明文密碼採用「登入時悄悄升級」策略：偵測到還是明文格式時，
// 驗證通過的當下就順便轉換成bcrypt雜湊存回去，員工完全不會察覺任何差異，
// 不需要強制大家重設密碼(這是業界處理這類遷移的標準做法)。
// 邀請碼本身也是雜湊後存進資料庫(不是存明文邀請碼)，72小時有效、一次性使用，
// 重新發送邀請會讓舊的邀請碼失效。

import bcrypt from "bcryptjs";
import crypto from "crypto";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// bcrypt雜湊值固定以$2a$/$2b$/$2y$開頭，用這個判斷資料庫裡存的是不是已經是
// 正確加密過的格式，還是舊系統遺留的明文密碼
function looksLikeBcryptHash(v) {
  return typeof v === "string" && /^\$2[aby]\$/.test(v);
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

const INVITE_EXPIRE_HOURS = 72;

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
  const RESEND_API_KEY = process.env.RESEND_API_KEY;

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

  const { action } = req.body || {};

  // ── 發送通知信：訊息中心的訂單通知功能用，重用同一套RESEND_API_KEY設定 ──
  // 通用端點，主旨/內文由呼叫端傳入，不寫死特定通知內容，方便未來其他
  // 通知事件(不只出貨)也能共用同一個端點。
  if (action === "send-notification") {
    try {
      const { to, subject, body } = req.body || {};
      if (!to || !subject || !body) {
        res.status(400).json({ error: "缺少必要參數(to/subject/body)" });
        return;
      }
      // 安全防護：收件人必須是系統裡真實存在的會員信箱才允許發送，
      // 避免這個端點被拿去對任意信箱發送任意內容、濫用成垃圾郵件轉發站。
      const memCheck = await sbFetch(`/pos_members?email=eq.${encodeURIComponent(to)}&select=id&limit=1`);
      const memFound = memCheck.ok ? await memCheck.json() : [];
      if (!Array.isArray(memFound) || memFound.length === 0) {
        res.status(403).json({ error: "收件人不是系統內的會員信箱，拒絕發送" });
        return;
      }
      if (!RESEND_API_KEY) {
        res.status(500).json({ error: "尚未設定RESEND_API_KEY環境變數" });
        return;
      }
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "TATA <noreply@mail.tata-style.com>",
          to: [to],
          subject,
          html: `<div style="white-space:pre-wrap;font-family:sans-serif;">${body}</div>`,
        }),
      });
      if (!emailRes.ok) {
        const errData = await emailRes.json().catch(() => ({}));
        console.error("send-notification: 寄送失敗", errData);
        res.status(500).json({ error: "寄送失敗" });
        return;
      }
      res.status(200).json({ success: true });
    } catch (e) {
      console.error("send-notification error:", e);
      res.status(500).json({ error: String(e) });
    }
    return;
  }

  // ── 發送邀請信：後台建立員工帳號時呼叫，不設密碼，改寄邀請信 ──────────
  if (action === "invite") {
    try {
      const { userId, email, name, loginUrl } = req.body || {};
      if (!userId || !email) {
        res.status(400).json({ error: "缺少員工id或email" });
        return;
      }
      if (!RESEND_API_KEY) {
        res.status(500).json({ error: "尚未設定RESEND_API_KEY環境變數，無法寄送邀請信" });
        return;
      }

      const token = generateToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + INVITE_EXPIRE_HOURS * 3600 * 1000).toISOString();

      const updateRes = await sbFetch(`/pos_users?id=eq.${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify({ invite_token_hash: tokenHash, invite_expires_at: expiresAt }),
      });
      if (!updateRes.ok) {
        res.status(500).json({ error: "寫入邀請碼失敗" });
        return;
      }

      const setPasswordUrl = `${loginUrl || "https://fashion-erp-ten.vercel.app"}?invite=${token}&email=${encodeURIComponent(email)}`;
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "TATA ERP <noreply@mail.tata-style.com>",
          to: [email],
          subject: "你的 TATA ERP 帳號邀請",
          html: `<p>您好 ${name || ""}，</p><p>已經幫您建立 TATA ERP 後台帳號，請點擊下方連結設定您的登入密碼(連結72小時內有效)：</p><p><a href="${setPasswordUrl}">${setPasswordUrl}</a></p>`,
        }),
      });
      if (!emailRes.ok) {
        const errData = await emailRes.json().catch(() => ({}));
        res.status(500).json({ error: "邀請信寄送失敗：" + (errData?.message || "請確認RESEND_API_KEY設定正確") });
        return;
      }

      res.status(200).json({ success: true });
    } catch (e) {
      console.error("invite error:", e);
      res.status(500).json({ error: "發送邀請時發生錯誤，請稍後再試" });
    }
    return;
  }

  // ── 忘記密碼：員工自己在登入頁申請，不需要管理員手動觸發 ──────────────
  // 重用跟invite完全一樣的token產生/寄信機制，差別在於用email查帳號(不是userId，
  // 因為申請的人自己不會知道自己的userId)。不管有沒有找到符合的帳號，都回傳一樣的
  // 成功訊息，避免這個端點被用來測試哪些email有在系統裡註冊過(業界標準做法)。
  if (action === "forgot-password") {
    try {
      const { email, loginUrl } = req.body || {};
      if (!email) {
        res.status(400).json({ error: "請輸入email" });
        return;
      }
      const genericSuccess = () => res.status(200).json({ success: true });

      if (!RESEND_API_KEY) {
        // 內部設定問題不該讓使用者知道帳號存不存在，但也不能假裝成功卻什麼都沒發生，
        // 這種情況記錄下來讓開發者事後排查，前端一樣顯示成功訊息
        console.error("forgot-password: 尚未設定RESEND_API_KEY環境變數");
        genericSuccess();
        return;
      }

      const findRes = await sbFetch(
        `/pos_users?email=eq.${encodeURIComponent(email)}&active=eq.true&select=id,name,email`
      );
      const found = findRes.ok ? await findRes.json() : [];
      const u = found?.[0];

      if (!u) {
        genericSuccess(); // 查無此帳號，一樣回傳成功，不洩漏帳號是否存在
        return;
      }

      const token = generateToken();
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + INVITE_EXPIRE_HOURS * 3600 * 1000).toISOString();

      const updateRes = await sbFetch(`/pos_users?id=eq.${encodeURIComponent(u.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ invite_token_hash: tokenHash, invite_expires_at: expiresAt }),
      });
      if (!updateRes.ok) {
        console.error("forgot-password: 寫入重設碼失敗", u.id);
        genericSuccess(); // 內部失敗一樣不洩漏給前端，但已經記錄下來
        return;
      }

      const setPasswordUrl = `${loginUrl || "https://fashion-erp-ten.vercel.app"}?invite=${token}&email=${encodeURIComponent(u.email)}`;
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "TATA ERP <noreply@mail.tata-style.com>",
          to: [u.email],
          subject: "重設你的 TATA ERP 密碼",
          html: `<p>您好 ${u.name || ""}，</p><p>收到您的密碼重設申請，請點擊下方連結設定新密碼(連結72小時內有效，如果不是您本人申請，請忽略這封信)：</p><p><a href="${setPasswordUrl}">${setPasswordUrl}</a></p>`,
        }),
      });
      if (!emailRes.ok) {
        const errData = await emailRes.json().catch(() => ({}));
        console.error("forgot-password: 重設信寄送失敗", errData);
        genericSuccess(); // 寄信失敗一樣不洩漏給前端，但已經記錄下來方便排查
        return;
      }

      genericSuccess();
    } catch (e) {
      console.error("forgot-password error:", e);
      res.status(200).json({ success: true }); // 就算發生錯誤，也不洩漏任何帳號存在與否的資訊
    }
    return;
  }

  // ── 驗證邀請碼是否有效：設定密碼頁面載入時先呼叫這個，確認連結沒過期 ────
  if (action === "check-invite") {
    try {
      const { token, email } = req.body || {};
      if (!token || !email) {
        res.status(400).json({ error: "缺少驗證資訊" });
        return;
      }
      const tokenHash = hashToken(token);
      const userRes = await sbFetch(`/pos_users?email=eq.${encodeURIComponent(email)}&invite_token_hash=eq.${tokenHash}&select=id,invite_expires_at`);
      const users = await userRes.json();
      const u = Array.isArray(users) ? users[0] : null;

      if (!u) {
        res.status(200).json({ valid: false, reason: "邀請連結無效，可能已經被使用過" });
        return;
      }
      if (new Date(u.invite_expires_at) < new Date()) {
        res.status(200).json({ valid: false, reason: "邀請連結已過期，請聯絡管理者重新發送" });
        return;
      }
      res.status(200).json({ valid: true });
    } catch (e) {
      console.error("check-invite error:", e);
      res.status(500).json({ error: "驗證時發生錯誤" });
    }
    return;
  }

  // ── 員工設定自己的密碼：驗證邀請碼後，把新密碼bcrypt加密存進去，邀請碼失效 ──
  if (action === "set-password") {
    try {
      const { token, email, newPassword } = req.body || {};
      if (!token || !email || !newPassword) {
        res.status(400).json({ error: "請提供完整資訊" });
        return;
      }
      if (newPassword.length < 8) {
        res.status(400).json({ error: "密碼至少需要8個字元" });
        return;
      }
      // 密碼必須包含至少一個中文字或英文字母，不能是純數字/符號組成(例如12345678這種)
      if (!/[a-zA-Z\u4e00-\u9fff]/.test(newPassword)) {
        res.status(400).json({ error: "密碼需包含至少一個中文字或英文字母，不能是純數字" });
        return;
      }
      const tokenHash = hashToken(token);
      const userRes = await sbFetch(`/pos_users?email=eq.${encodeURIComponent(email)}&invite_token_hash=eq.${tokenHash}&select=id,invite_expires_at`);
      const users = await userRes.json();
      const u = Array.isArray(users) ? users[0] : null;

      if (!u) {
        res.status(400).json({ error: "邀請連結無效" });
        return;
      }
      if (new Date(u.invite_expires_at) < new Date()) {
        res.status(400).json({ error: "邀請連結已過期，請聯絡管理者重新發送" });
        return;
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      const updateRes = await sbFetch(`/pos_users?id=eq.${encodeURIComponent(u.id)}`, {
        method: "PATCH",
        // 設定成功後把邀請碼清空(一次性使用)，避免同一個連結被重複拿來改密碼
        body: JSON.stringify({ pw_hash: newHash, invite_token_hash: null, invite_expires_at: null }),
      });
      if (!updateRes.ok) {
        res.status(500).json({ error: "儲存密碼失敗" });
        return;
      }
      res.status(200).json({ success: true });
    } catch (e) {
      console.error("set-password error:", e);
      res.status(500).json({ error: "設定密碼時發生錯誤" });
    }
    return;
  }

  // ── 登入驗證：比對密碼一律在伺服器端做，順便悄悄把舊明文密碼升級成bcrypt ──
  if (action === "login") {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: "請輸入帳號密碼" });
        return;
      }
      const userRes = await sbFetch(`/pos_users?email=eq.${encodeURIComponent(email)}&select=*`);
      const users = await userRes.json();
      const u = Array.isArray(users) ? users[0] : null;

      if (!u || !u.active) {
        res.status(200).json({ success: false, error: "帳號或密碼錯誤" });
        return;
      }

      let passOk = false;
      if (looksLikeBcryptHash(u.pw_hash)) {
        passOk = await bcrypt.compare(password, u.pw_hash);
      } else {
        // 還是舊的明文密碼格式：直接比對，通過的話順便悄悄升級成bcrypt雜湊，
        // 使用者完全不會察覺任何差異，這是業界處理密碼加密遷移的標準做法
        passOk = u.pw_hash === password;
        if (passOk) {
          const newHash = await bcrypt.hash(password, 12);
          await sbFetch(`/pos_users?id=eq.${encodeURIComponent(u.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ pw_hash: newHash }),
          }).catch(() => {}); // 升級失敗不影響這次登入，下次登入還是會再嘗試升級
        }
      }

      if (!passOk) {
        res.status(200).json({ success: false, error: "帳號或密碼錯誤" });
        return;
      }

      // 絕對不能把pw_hash欄位回傳給前端
      const { pw_hash, invite_token_hash, ...safeUser } = u;
      res.status(200).json({ success: true, user: safeUser });
    } catch (e) {
      console.error("login error:", e);
      res.status(500).json({ error: "登入時發生錯誤，請稍後再試" });
    }
    return;
  }

  res.status(400).json({ error: "請提供正確的action參數" });
}
