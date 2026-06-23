import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { fetchAuthSettings } from "../supabase.js";

export default function LoginPage() {
  const { user, signUpWithEmail, signInWithEmail, signInWithProvider } = useAuth();
  const navigate = useNavigate();

  const [authSettings, setAuthSettings] = useState(null);
  const [mode, setMode] = useState("login"); // login | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [signupNotice, setSignupNotice] = useState(null); // 註冊成功後的畫面內提示，取代alert

  useEffect(() => {
    fetchAuthSettings().then(setAuthSettings);
  }, []);

  // 已經登入的人不需要再看到登入頁，直接導去「我的訂單」
  useEffect(() => {
    if (user) navigate("/account");
  }, [user]);

  // 切換login/signup模式時，清空表單和提示，避免殘留上一次的輸入或訊息
  function switchMode(newMode) {
    setMode(newMode);
    setError(null);
    setSignupNotice(null);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleEmailSubmit(e) {
    e.preventDefault();
    setError(null);
    setSignupNotice(null);

    if (mode === "signup" && password !== confirmPassword) {
      setError("兩次輸入的密碼不一致，請重新確認");
      return;
    }

    setSubmitting(true);

    if (mode === "login") {
      const { error } = await signInWithEmail(email, password);
      if (error) {
        setError(error.message === "Invalid login credentials" ? "帳號或密碼錯誤" : error.message);
        setSubmitting(false);
      }
      // 登入成功的話，user state 會自動更新，上面的 useEffect 會處理導頁
    } else {
      const { data, error } = await signUpWithEmail(email, password);
      if (error) {
        setError(error.message);
        setSubmitting(false);
        return;
      }
      // 依照真實的 session 狀態判斷：有 session 代表 Supabase 後台關閉了 Email 驗證信，
      // 已經自動完成登入；沒有 session 代表開啟了驗證信，要請顧客先去信箱確認。
      if (data?.session) {
        // user state 會自動更新，上面的 useEffect 會處理導頁，這裡不需要額外動作
      } else {
        // 用畫面內的提示區塊取代 alert()，避免在部分手機瀏覽器上彈窗顯示異常，
        // 也讓提示文字能持續顯示在畫面上，不會一閃而過讓人誤以為沒反應。
        setSignupNotice(
          "帳號已建立成功。系統設定上需要 Email 驗證才能登入，但目前驗證信寄送服務尚在設定中，請聯絡客服協助開通帳號。"
        );
        setMode("login");
        setSubmitting(false);
      }
    }
  }

  async function handleProviderLogin(provider) {
    setError(null);
    const { error } = await signInWithProvider(provider);
    if (error) setError(error.message);

  }

  if (!authSettings) {
    return <div style={{ textAlign: "center", padding: 60, color: "#999" }}>載入中...</div>;
  }

  const methods = authSettings.enabledAuthMethods;

  return (
    <div style={{ maxWidth: 360, margin: "0 auto", padding: "40px 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 24 }}>
        {mode === "login" ? "會員登入" : "註冊新會員"}
      </h1>

      {/* 社群登入按鈕：只顯示後台設定裡開啟的選項，不寫死 */}
      {(methods.facebook || methods.google) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
          {methods.facebook && (
            <button
              onClick={() => handleProviderLogin("facebook")}
              style={{
                padding: "12px 0",
                background: "#1877F2",
                color: "#fff",
                border: "none",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              使用 Facebook 繼續
            </button>
          )}
          {methods.google && (
            <button
              onClick={() => handleProviderLogin("google")}
              style={{
                padding: "12px 0",
                background: "#fff",
                color: "#222",
                border: "1px solid #ddd",
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              使用 Google 繼續
            </button>
          )}
        </div>
      )}

      {(methods.facebook || methods.google) && methods.email && (
        <div style={{ textAlign: "center", color: "#bbb", fontSize: 12, margin: "16px 0" }}>
          或使用 Email
        </div>
      )}

      {signupNotice && (
        <div
          style={{
            background: "#fff8e1",
            border: "1px solid #f0d56b",
            borderRadius: 6,
            padding: "12px 14px",
            color: "#7a5c00",
            fontSize: 13,
            marginBottom: 16,
            lineHeight: 1.5,
          }}
        >
          {signupNotice}
        </div>
      )}

      {methods.email && (
        <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14 }}
          />
          <input
            type="password"
            placeholder="密碼（至少6個字元）"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14 }}
          />
          {mode === "signup" && (
            <input
              type="password"
              placeholder="確認密碼"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={6}
              style={{ padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14 }}
            />
          )}

          {error && <div style={{ color: "#c0392b", fontSize: 12 }}>{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "12px 0",
              background: "#222",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 700,
              cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "處理中..." : mode === "login" ? "登入" : "註冊"}
          </button>
        </form>
      )}

      <div style={{ textAlign: "center", marginTop: 20, fontSize: 13 }}>
        {mode === "login" ? (
          <span>
            還沒有帳號？
            <button
              onClick={() => switchMode("signup")}
              style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", padding: 0, marginLeft: 4 }}
            >
              立即註冊
            </button>
          </span>
        ) : (
          <span>
            已經有帳號？
            <button
              onClick={() => switchMode("login")}
              style={{ background: "none", border: "none", color: "#c0392b", cursor: "pointer", padding: 0, marginLeft: 4 }}
            >
              登入
            </button>
          </span>
        )}
      </div>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link to="/" style={{ color: "#999", fontSize: 12 }}>
          不想加入會員，先去逛逛 →
        </Link>
      </div>
    </div>
  );
}
