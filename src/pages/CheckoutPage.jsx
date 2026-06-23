import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../CartContext.jsx";

// 產生一個不重複的訂單編號：時間戳記 + 隨機碼，符合 ECPay 規定（英數字、20字以內）
function generateOrderId() {
  const now = Date.now().toString().slice(-10);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SHOP${now}${rand}`;
}

// 訂購人資訊表單欄位共用樣式
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14,
  border: "1px solid #ddd",
  borderRadius: 6,
  outline: "none",
  boxSizing: "border-box",
};

export default function CheckoutPage() {
  const { items, totalPrice } = useCart();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // 訂購人/收件資訊：新增的表單欄位，purely additive，不影響上面既有的購物車/金流邏輯。
  // shipMethod 預設「宅配到府」，地址欄只在宅配時才需要填寫。
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    phone: "",
    email: "",
    shipMethod: "宅配到府",
    address: "",
  });

  function updCustomerInfo(key, value) {
    setCustomerInfo((prev) => ({ ...prev, [key]: value }));
  }

  // 送出前的基本檢查：姓名、電話必填；選擇宅配時地址也必填，避免資料缺漏導致無法出貨
  function validateCustomerInfo() {
    if (!customerInfo.name.trim()) return "請填寫訂購人姓名";
    if (!customerInfo.phone.trim()) return "請填寫聯絡電話";
    if (customerInfo.shipMethod === "宅配到府" && !customerInfo.address.trim()) {
      return "請填寫收件地址";
    }
    return null;
  }

  async function handleCheckout() {
    if (items.length === 0) return;
    const validationError = validateCustomerInfo();
    if (validationError) {
      setError(validationError);
      return;
    }
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
          customerName: customerInfo.name.trim(),
          customerPhone: customerInfo.phone.trim(),
          customerEmail: customerInfo.email.trim(),
          shipMethod: customerInfo.shipMethod,
          shipAddress: customerInfo.address.trim(),
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

      {/* 訂購人/收件資訊：新增區塊，purely additive，放在金額下方、付款按鈕上方 */}
      <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>訂購人資訊</h2>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
            姓名
          </label>
          <input
            type="text"
            value={customerInfo.name}
            onChange={(e) => updCustomerInfo("name", e.target.value)}
            placeholder="請輸入訂購人姓名"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
            聯絡電話
          </label>
          <input
            type="tel"
            value={customerInfo.phone}
            onChange={(e) => updCustomerInfo("phone", e.target.value)}
            placeholder="請輸入聯絡電話"
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
            Email（選填）
          </label>
          <input
            type="email"
            value={customerInfo.email}
            onChange={(e) => updCustomerInfo("email", e.target.value)}
            placeholder="請輸入Email"
            style={inputStyle}
          />
        </div>

        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>配送方式</h2>

        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          {["宅配到府", "門市自取"].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => updCustomerInfo("shipMethod", m)}
              style={{
                flex: 1,
                padding: "10px 0",
                borderRadius: 6,
                border:
                  customerInfo.shipMethod === m ? "2px solid #222" : "1px solid #ddd",
                background: customerInfo.shipMethod === m ? "#222" : "#fff",
                color: customerInfo.shipMethod === m ? "#fff" : "#333",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          ))}
        </div>

        {customerInfo.shipMethod === "宅配到府" && (
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "block", fontSize: 12, color: "#666", marginBottom: 4 }}>
              收件地址
            </label>
            <input
              type="text"
              value={customerInfo.address}
              onChange={(e) => updCustomerInfo("address", e.target.value)}
              placeholder="請輸入完整收件地址"
              style={inputStyle}
            />
          </div>
        )}
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
