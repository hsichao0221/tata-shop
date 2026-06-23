import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function ForgotPasswordPage() {
  const { resetPasswordForEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error } = await resetPasswordForEmail(email);
    setSubmitting(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div style={{ maxWidth: 360, margin: "0 auto", padding: "60px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>重設密碼信已送出</div>
        <div style={{ color: "#999", fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
          請查看 {email} 的信箱，點擊信中連結設定新密碼。
          若您未在5-10分鐘內收到信，可能是寄送服務尚未設定完成，請聯絡客服協助。
        </div>
        <Link to="/login" style={{ color: "#c0392b", fontSize: 13 }}>
          返回登入頁 →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 360, margin: "0 auto", padding: "40px 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 12 }}>
        忘記密碼
      </h1>
      <div style={{ color: "#999", fontSize: 13, textAlign: "center", marginBottom: 24 }}>
        輸入您註冊時使用的 Email，我們會寄送重設密碼的連結給您
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14 }}
        />

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
          {submitting ? "處理中..." : "送出重設信"}
        </button>
      </form>

      <div style={{ textAlign: "center", marginTop: 16 }}>
        <Link to="/login" style={{ color: "#999", fontSize: 12 }}>
          返回登入頁 →
        </Link>
      </div>
    </div>
  );
}
