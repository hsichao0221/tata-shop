import { Link } from "react-router-dom";
import { useCart } from "../CartContext.jsx";
import { useEffect } from "react";

export default function OrderResultPage() {
  const { clearCart } = useCart();

  // 顧客成功被導回這個頁面，代表付款流程已經跑完，清空購物車
  useEffect(() => {
    clearCart();
  }, []);

  return (
    <div style={{ textAlign: "center", padding: 80 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        訂單已送出
      </div>
      <div style={{ color: "#999", fontSize: 13, marginBottom: 24 }}>
        感謝您的購買，我們會盡快為您處理訂單
      </div>
      <Link to="/" style={{ color: "#c0392b", fontSize: 14 }}>
        返回首頁繼續購物 →
      </Link>
    </div>
  );
}
