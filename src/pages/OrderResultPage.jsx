import { Link, useSearchParams } from "react-router-dom";
import { useCart } from "../CartContext.jsx";
import { useEffect } from "react";

export default function OrderResultPage() {
  const { clearCart } = useCart();
  const [searchParams] = useSearchParams();
  const isSuccess = searchParams.get("success") === "1";
  const orderId = searchParams.get("orderId");

  // 只有真正付款成功才清空購物車；付款失敗時保留購物車內容，
  // 讓顧客可以重新嘗試結帳，不會因為這次失敗就要重新挑選商品
  useEffect(() => {
    if (isSuccess) {
      clearCart();
    }
  }, [isSuccess]);

  if (!isSuccess) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <div style={{ fontSize: 40, marginBottom: 16, color: "#c0392b" }}>✕</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          付款未完成
        </div>
        <div style={{ color: "#999", fontSize: 13, marginBottom: 24 }}>
          您的訂單尚未付款成功，購物車內容已為您保留，請重新嘗試結帳
        </div>
        <Link to="/cart" style={{ color: "#c0392b", fontSize: 14 }}>
          返回購物車 →
        </Link>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", padding: 80 }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>✓</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
        訂單已送出
      </div>
      <div style={{ color: "#999", fontSize: 13, marginBottom: 8 }}>
        感謝您的購買，我們會盡快為您處理訂單
      </div>
      {orderId && (
        <div style={{ color: "#bbb", fontSize: 12, marginBottom: 24 }}>
          訂單編號：{orderId}
        </div>
      )}
      <Link to="/" style={{ color: "#c0392b", fontSize: 14 }}>
        返回首頁繼續購物 →
      </Link>
    </div>
  );
}
