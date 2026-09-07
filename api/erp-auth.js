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
          from: "TATA ERP <onboarding@resend.dev>",
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
