import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../CartContext.jsx";
import { useAuth } from "../AuthContext.jsx";

// 產生一個不重複的訂單編號：時間戳記 + 隨機碼，符合 ECPay 規定（英數字、20字以內）
function generateOrderId() {
  const now = Date.now().toString().slice(-10);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SHOP${now}${rand}`;
}

export default function CheckoutPage() {
  const { items, totalPrice } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function handleCheckout() {
    if (items.length === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const orderId = generateOrderId();
      const res = await fetch("/api/ecpay-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({ name: i.name, qty: i.qty })),
          totalAmount: totalPrice,
          orderId,
          memberEmail: user?.email || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "建立訂單失敗，請稍後再試");
        setSubmitting(false);
        return;
      }

      // 動態建立一個表單，把 ECPay 要求的參數塞進去，自動送出跳轉到付款頁面
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.checkoutUrl;
      Object.entries(data.params).forEach(([key, value]) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (e) {
      console.error("結帳失敗:", e);
      setError("網路連線異常，請稍後再試");
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <div style={{ color: "#999" }}>購物車是空的，無法結帳</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>確認訂單</h1>

      {items.map((item) => (
        <div
          key={item.key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: "10px 0",
            borderBottom: "1px solid #f0f0f0",
            fontSize: 13,
          }}
        >
          <span>
            {item.name} {item.variantName && `（${item.variantName}）`} x{item.qty}
          </span>
          <span>NT${item.price * item.qty}</span>
        </div>
      ))}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "16px 0",
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        <span>應付金額</span>
        <span style={{ color: "#c0392b" }}>NT${totalPrice}</span>
      </div>

      {error && (
        <div style={{ color: "#c0392b", fontSize: 13, marginBottom: 12, textAlign: "center" }}>
          {error}
        </div>
      )}

      <button
        onClick={handleCheckout}
        disabled={submitting}
        style={{
          width: "100%",
          padding: "14px 0",
          background: submitting ? "#999" : "#222",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontSize: 15,
          fontWeight: 700,
          cursor: submitting ? "default" : "pointer",
        }}
      >
        {submitting ? "處理中，請稍候..." : "前往付款"}
      </button>

      <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#bbb" }}>
        付款由綠界科技（ECPay）提供安全金流服務
      </div>
    </div>
  );
}
