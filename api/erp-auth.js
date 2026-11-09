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

// ── 登入憑證(session)：登入成功後由伺服器簽發，之後呼叫帳號管理這類敏感動作時一併帶上 ──
// 用HMAC-SHA256簽章，金鑰從SUPABASE_SERVICE_ROLE_KEY衍生(不需要新增環境變數)，12小時有效。
// 憑證裡只放員工id/角色/到期時間，伺服器每次都會用資料庫裡的最新狀態再確認(帳號是否仍啟用、
// 是否仍是管理員)，所以被停用或降權的帳號，舊憑證馬上就失效。
const SESSION_TTL_MS = 12 * 3600 * 1000;
const TICKET_TTL_MS = 5 * 60 * 1000;
function signingKey() {
  return crypto.createHash("sha256").update("erp-session|" + (process.env.SUPABASE_SERVICE_ROLE_KEY || "")).digest();
}
function signPayload(obj) {
  const body = Buffer.from(JSON.stringify(obj)).toString("base64url");
  const sig = crypto.createHmac("sha256", signingKey()).update(body).digest("base64url");
  return body + "." + sig;
}
function verifyPayload(token, purpose) {
  if (typeof token !== "string" || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const expect = crypto.createHmac("sha256", signingKey()).update(body).digest("base64url");
  const a = Buffer.from(sig || ""), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (obj.p !== purpose || !obj.exp || Date.now() > obj.exp) return null;
    return obj;
  } catch (e) { return null; }
}

// 回傳給瀏覽器的員工資料：絕對不含密碼雜湊、驗證秘鑰、PIN雜湊、邀請碼
function toSafeUser(u) {
  const { pw_hash, invite_token_hash, totp_secret, pin, ...rest } = u;
  return { ...rest, totp_enabled: !!(u.totp_enabled && totp_secret), has_pin: !!pin };
}

// 簡單的失敗次數限制(記憶體內、每個伺服器實例各自計算，擋掉一般的連續猜測；不是萬無一失)
const _fails = new Map();
function throttled(key, max = 8, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const e = _fails.get(key);
  if (!e || now > e.reset) return false;
  return e.n >= max;
}
function noteFail(key, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const e = _fails.get(key);
  if (!e || now > e.reset) _fails.set(key, { n: 1, reset: now + windowMs });
  else e.n++;
}

// PIN雜湊：沿用ERP/POS原本的格式(SHA-256 + 鹽)，讓已存的PIN不用重設就能比對
function hashPinLegacy(pin, userId) {
  return crypto.createHash("sha256").update("tata-pos-salt-" + userId + "-" + pin).digest("hex");
}
function pinMatches(stored, pin, userId) {
  if (!stored) return { ok: false };
  if (/^[0-9a-f]{64}$/.test(stored)) return { ok: hashPinLegacy(pin, userId) === stored };
  return { ok: stored === pin, upgrade: stored === pin }; // 舊明文格式，比對成功順便升級
}

// 伺服器端驗證TOTP(RFC 6238：SHA-1、6位數、30秒，前後各容許一個時間步)
function verifyTotpServer(secret, token) {
  try {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const c of String(secret).toUpperCase()) {
      const i = chars.indexOf(c);
      if (i >= 0) bits += i.toString(2).padStart(5, "0");
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    const key = Buffer.from(bytes);
    const step = Math.floor(Date.now() / 1000 / 30);
    for (const t of [step, step - 1, step + 1]) {
      const msg = Buffer.alloc(8);
      msg.writeUInt32BE(Math.floor(t / 4294967296), 0);
      msg.writeUInt32BE(t >>> 0, 4);
      const h = crypto.createHmac("sha1", key).update(msg).digest();
      const off = h[19] & 0xf;
      const otp = (((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3]) % 1000000;
      if (String(otp).padStart(6, "0") === String(token)) return true;
    }
    return false;
  } catch (e) { return false; }
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

      if (req.body && req.body.v === 2) {
        // 新版登入：有開兩步驟驗證的帳號，這裡不回傳員工資料與憑證，只給一張5分鐘的驗證券，
        // 要再用驗證碼呼叫verify-totp才會拿到憑證。驗證秘鑰從此不會傳到瀏覽器。
        if (u.totp_enabled && u.totp_secret) {
          res.status(200).json({ success: true, needTotp: true, ticket: signPayload({ p: "totp", uid: u.id, exp: Date.now() + TICKET_TTL_MS }) });
          return;
        }
        res.status(200).json({ success: true, user: toSafeUser(u), session: signPayload({ p: "session", uid: u.id, exp: Date.now() + SESSION_TTL_MS }) });
        return;
      }
      // 舊版前端(還沒更新的快取頁面)：維持原本的回傳格式，只是額外附上憑證
      const { pw_hash, invite_token_hash, ...safeUser } = u;
      res.status(200).json({ success: true, user: safeUser, session: signPayload({ p: "session", uid: u.id, exp: Date.now() + SESSION_TTL_MS }) });
    } catch (e) {
      console.error("login error:", e);
      res.status(500).json({ error: "登入時發生錯誤，請稍後再試" });
    }
    return;
  }

  // ═══ 以下是帳號管理相關動作：取代ERP/POS過去直接用公開金鑰讀寫pos_users的作法 ═══
  async function getUserById(id) {
    const r = await sbFetch(`/pos_users?id=eq.${encodeURIComponent(id)}&select=*`);
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : null;
  }
  // 驗證憑證，並用資料庫最新狀態確認帳號仍啟用；requireAdmin時還要是系統管理員
  async function authSession(requireAdmin) {
    const sess = verifyPayload((req.body || {}).session, "session");
    if (!sess) { res.status(401).json({ error: "登入已逾時，請重新登入" }); return null; }
    const me = await getUserById(sess.uid);
    if (!me || !me.active) { res.status(401).json({ error: "帳號已停用，請重新登入" }); return null; }
    if (requireAdmin && me.role !== "admin") { res.status(403).json({ error: "只有系統管理員可以執行這個操作" }); return null; }
    return me;
  }
  const clientIp = String((req.headers && (req.headers["x-forwarded-for"] || "")) || "").split(",")[0].trim() || "unknown";

  // 兩步驟驗證：用登入時拿到的驗證券＋手機上的6位數驗證碼，換取登入憑證
  if (action === "verify-totp") {
    try {
      const { ticket, code } = req.body || {};
      const t = verifyPayload(ticket, "totp");
      if (!t) { res.status(200).json({ success: false, error: "驗證已逾時，請重新登入" }); return; }
      if (throttled("totp:" + t.uid)) { res.status(429).json({ success: false, error: "嘗試次數過多，請稍後再試" }); return; }
      const u = await getUserById(t.uid);
      if (!u || !u.active || !u.totp_secret) { res.status(200).json({ success: false, error: "驗證失敗，請重新登入" }); return; }
      if (!verifyTotpServer(u.totp_secret, String(code || ""))) {
        noteFail("totp:" + t.uid);
        res.status(200).json({ success: false, error: "驗證碼錯誤，請重試" });
        return;
      }
      res.status(200).json({ success: true, user: toSafeUser(u), session: signPayload({ p: "session", uid: u.id, exp: Date.now() + SESSION_TTL_MS }) });
    } catch (e) { console.error("verify-totp error:", e); res.status(500).json({ error: "驗證時發生錯誤" }); }
    return;
  }

  // 員工清單(管理員)：不含密碼雜湊、驗證秘鑰、PIN雜湊
  if (action === "list-users") {
    try {
      const me = await authSession(true); if (!me) return;
      const r = await sbFetch(`/pos_users?select=*&order=created_at.asc`);
      const rows = await r.json();
      res.status(200).json({ success: true, users: (Array.isArray(rows) ? rows : []).map(toSafeUser) });
    } catch (e) { console.error("list-users error:", e); res.status(500).json({ error: "讀取員工清單失敗" }); }
    return;
  }

  // 修改員工：只允許白名單欄位
  if (action === "update-user") {
    try {
      const me = await authSession(true); if (!me) return;
      const { id, fields } = req.body || {};
      if (!id || !fields || typeof fields !== "object") { res.status(400).json({ error: "缺少參數" }); return; }
      const ALLOWED = ["role", "store_id", "active", "mod_permissions", "name"];
      const body = {};
      ALLOWED.forEach(k => { if (fields[k] !== undefined) body[k] = fields[k]; });
      body.updated_at = new Date().toISOString();
      body.last_action_by = me.name || me.email || "系統";
      body.last_action_reason = String(fields.reason || "更新帳號").slice(0, 200);
      const r = await sbFetch(`/pos_users?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
      if (!r.ok) { res.status(500).json({ error: (await r.text()) || "更新失敗" }); return; }
      res.status(200).json({ success: true });
    } catch (e) { console.error("update-user error:", e); res.status(500).json({ error: "更新失敗" }); }
    return;
  }

  // 新增員工(管理員)
  if (action === "create-user") {
    try {
      const me = await authSession(true); if (!me) return;
      const nu = (req.body || {}).user || {};
      if (!nu.name || !nu.role) { res.status(400).json({ error: "缺少姓名或角色" }); return; }
      const r = await sbFetch(`/pos_users`, {
        method: "POST", headers: { Prefer: "return=representation" },
        body: JSON.stringify({ email: nu.email || null, name: nu.name, role: nu.role, store_id: nu.store_id || ["all"], active: true, mod_permissions: nu.mod_permissions || {} }),
      });
      const rows = await r.json();
      if (!r.ok || !Array.isArray(rows) || !rows[0]) { res.status(500).json({ error: "新增失敗" }); return; }
      res.status(200).json({ success: true, user: toSafeUser(rows[0]) });
    } catch (e) { console.error("create-user error:", e); res.status(500).json({ error: "新增失敗" }); }
    return;
  }

  // 設定/重設員工PIN(管理員)：傳入6位數字，伺服器雜湊後存，瀏覽器不再經手雜湊
  if (action === "set-pin") {
    try {
      const me = await authSession(true); if (!me) return;
      const { id, pin } = req.body || {};
      if (!id || !/^\d{6}$/.test(String(pin || ""))) { res.status(400).json({ error: "PIN必須是6位數字" }); return; }
      const r = await sbFetch(`/pos_users?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ pin: hashPinLegacy(String(pin), id), updated_at: new Date().toISOString(), last_action_by: me.name || me.email || "系統", last_action_reason: "重設PIN" }),
      });
      if (!r.ok) { res.status(500).json({ error: "PIN儲存失敗" }); return; }
      res.status(200).json({ success: true });
    } catch (e) { console.error("set-pin error:", e); res.status(500).json({ error: "PIN儲存失敗" }); }
    return;
  }

  // 啟用兩步驟驗證(管理員)：伺服器確認手機上的驗證碼正確才會存入秘鑰
  if (action === "totp-enable") {
    try {
      const me = await authSession(true); if (!me) return;
      const { id, secret, code } = req.body || {};
      if (!id || !secret || !verifyTotpServer(secret, String(code || ""))) { res.status(200).json({ success: false, error: "驗證碼錯誤，請重試" }); return; }
      const r = await sbFetch(`/pos_users?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ totp_secret: secret, totp_enabled: true, updated_at: new Date().toISOString(), last_action_by: me.name || me.email || "系統", last_action_reason: "啟用兩步驟驗證" }),
      });
      if (!r.ok) { res.status(500).json({ error: "啟用失敗" }); return; }
      res.status(200).json({ success: true });
    } catch (e) { console.error("totp-enable error:", e); res.status(500).json({ error: "啟用失敗" }); }
    return;
  }

  // 關閉兩步驟驗證(管理員)
  if (action === "totp-disable") {
    try {
      const me = await authSession(true); if (!me) return;
      const { id } = req.body || {};
      if (!id) { res.status(400).json({ error: "缺少參數" }); return; }
      const r = await sbFetch(`/pos_users?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ totp_secret: null, totp_enabled: false, updated_at: new Date().toISOString(), last_action_by: me.name || me.email || "系統", last_action_reason: "關閉兩步驟驗證" }),
      });
      if (!r.ok) { res.status(500).json({ error: "關閉失敗" }); return; }
      res.status(200).json({ success: true });
    } catch (e) { console.error("totp-disable error:", e); res.status(500).json({ error: "關閉失敗" }); }
    return;
  }

  // POS選人畫面用：只回傳啟用中、有設PIN的店員姓名與門市，不含PIN
  if (action === "pos-staff") {
    try {
      const r = await sbFetch(`/pos_users?active=eq.true&select=id,name,pin,store_id,role`);
      const rows = await r.json();
      const list = (Array.isArray(rows) ? rows : []).filter(u => u.pin).map(u => ({ id: u.id, name: u.name, store_id: u.store_id, role: u.role }));
      res.status(200).json({ success: true, staff: list });
    } catch (e) { console.error("pos-staff error:", e); res.status(500).json({ error: "讀取店員清單失敗" }); }
    return;
  }

  // POS店員PIN登入：伺服器比對PIN(不再把所有人的PIN雜湊傳到瀏覽器)
  if (action === "pin-login" || action === "pin-check") {
    try {
      const { userId, storeId, pin } = req.body || {};
      if (!/^\d{6}$/.test(String(pin || ""))) { res.status(200).json({ success: false, error: "PIN格式錯誤" }); return; }
      const rl = "pin:" + clientIp + ":" + (userId || storeId || "");
      if (throttled(rl, 10)) { res.status(429).json({ success: false, error: "嘗試次數過多，請稍後再試" }); return; }
      let candidates = [];
      if (action === "pin-login") {
        const u = userId ? await getUserById(userId) : null;
        if (u && u.active) candidates = [u];
      } else {
        const r = await sbFetch(`/pos_users?active=eq.true&select=*`);
        const rows = await r.json();
        candidates = (Array.isArray(rows) ? rows : []).filter(u => {
          const st = Array.isArray(u.store_id) ? u.store_id : [u.store_id];
          return u.pin && st.some(x => x === storeId || x === "all");
        });
      }
      let matched = null, upgrade = false;
      for (const u of candidates) {
        const m = pinMatches(u.pin, String(pin), u.id);
        if (m.ok) { matched = u; upgrade = !!m.upgrade; break; }
      }
      if (!matched) { noteFail(rl); res.status(200).json({ success: false, error: "PIN錯誤" }); return; }
      if (upgrade) {
        sbFetch(`/pos_users?id=eq.${encodeURIComponent(matched.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ pin: hashPinLegacy(String(pin), matched.id) }) }).catch(() => {});
      }
      res.status(200).json({
        success: true,
        user: { id: matched.id, name: matched.name, role: matched.role, store_id: matched.store_id },
        ...(action === "pin-login" ? { session: signPayload({ p: "session", uid: matched.id, exp: Date.now() + SESSION_TTL_MS }) } : {}),
      });
    } catch (e) { console.error("pin error:", e); res.status(500).json({ error: "PIN驗證時發生錯誤" }); }
    return;
  }

  res.status(400).json({ error: "請提供正確的action參數" });
}
