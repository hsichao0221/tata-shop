import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";

export default function UpdatePasswordPage() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  function getPasswordError(pwd) {
    if (pwd.length < 6) return "密碼至少需要6個字元";
    if (!/[a-zA-Z]/.test(pwd)) return "密碼必須包含至少一個英文字母";
    if (/^\d+$/.test(pwd)) return "密碼不能是純數字，請混合英文字母";
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    const pwdError = getPasswordError(password);
    if (pwdError) {
      setError(pwdError);
      return;
    }
    if (password !== confirmPassword) {
      setError("兩次輸入的密碼不一致，請重新確認");
      return;
    }

    setSubmitting(true);
    const { error } = await updatePassword(password);
    setSubmitting(false);

    if (error) {
      setError(error.message);
    } else {
      alert("密碼已更新成功，請使用新密碼登入");
      navigate("/login");
    }
  }

  return (
    <div style={{ maxWidth: 360, margin: "0 auto", padding: "40px 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 24 }}>
        設定新密碼
      </h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="password"
          placeholder="新密碼（需含英文字母，不可純數字）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          style={{ padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14 }}
        />
        <div style={{ color: "#999", fontSize: 11, marginTop: -6 }}>
          至少6個字元，需包含英文字母，不能是純數字
        </div>
        <input
          type="password"
          placeholder="確認新密碼"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          minLength={6}
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
          {submitting ? "處理中..." : "更新密碼"}
        </button>
      </form>
    </div>
  );
}
