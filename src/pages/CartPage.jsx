import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../CartContext.jsx";

export default function CartPage() {
  const { items, updateQty, removeItem, totalPrice } = useCart();
  const navigate = useNavigate();

  if (items.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <div style={{ fontSize: 16, color: "#999", marginBottom: 16 }}>
          購物車是空的
        </div>
        <Link to="/" style={{ color: "#c0392b", fontSize: 14 }}>
          去逛逛商品 →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>購物車</h1>

      {items.map((item) => (
        <div
          key={item.key}
          style={{
            display: "flex",
            gap: 14,
            padding: "16px 0",
            borderBottom: "1px solid #f0f0f0",
            alignItems: "center",
          }}
        >
          <div
            style={{
              width: 70,
              height: 90,
              background: "#f5f5f5",
              borderRadius: 6,
              flexShrink: 0,
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ccc",
              fontSize: 10,
            }}
          >
            {item.image ? (
              <img src={item.image} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              "無圖片"
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, marginBottom: 2 }}>{item.name}</div>
            {item.variantName && (
              <div style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>
                款式：{item.variantName}
              </div>
            )}
            <div style={{ fontSize: 14, fontWeight: 700, color: "#c0392b" }}>
              NT${item.price}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => updateQty(item.key, item.qty - 1)}
              style={{
                width: 26,
                height: 26,
                border: "1px solid #ddd",
                background: "#fff",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              −
            </button>
            <span style={{ minWidth: 20, textAlign: "center", fontSize: 13 }}>{item.qty}</span>
            <button
              onClick={() => updateQty(item.key, item.qty + 1)}
              style={{
                width: 26,
                height: 26,
                border: "1px solid #ddd",
                background: "#fff",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              +
            </button>
          </div>

          <button
            onClick={() => removeItem(item.key)}
            style={{
              background: "none",
              border: "none",
              color: "#bbb",
              cursor: "pointer",
              fontSize: 18,
              flexShrink: 0,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </div>
      ))}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          padding: "20px 0",
          fontSize: 16,
        }}
      >
        <span>總計</span>
        <span style={{ fontSize: 22, fontWeight: 700 }}>NT${totalPrice}</span>
      </div>

      <button
        onClick={() => navigate("/checkout")}
        style={{
          width: "100%",
          padding: "14px 0",
          background: "#222",
          color: "#fff",
          border: "none",
          borderRadius: 6,
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        前往結帳
      </button>
    </div>
  );
}
