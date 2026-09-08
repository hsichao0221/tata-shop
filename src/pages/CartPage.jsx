import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { useCart } from "../CartContext.jsx";
import { useAuth } from "../AuthContext.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase.js";
import { findUsableCoupons } from "../couponUtils.js";
import { combinePromotionDiscounts, getAppliedPromotions } from "../promotionUtils.js";

export default function CartPage() {
  const { items, updateQty, removeItem, totalPrice } = useCart();
  const { member } = useAuth();
  const navigate = useNavigate();
  const [usableCount, setUsableCount] = useState(0);
  const [promotionActivities, setPromotionActivities] = useState([]);
  const totalQty = items.reduce((sum, i) => sum + (i.qty || 0), 0);

  // 檢查會員手上有沒有「已達最低消費門檻、還沒使用」的優惠券，主動提示，
  // 不用等客人自己想到要去帳戶頁面翻優惠券
  useEffect(() => {
    if (!member?.id || totalPrice <= 0) { setUsableCount(0); return; }
    fetch(
      `${SUPABASE_URL}/rest/v1/member_coupons?member_id=eq.${encodeURIComponent(member.id)}&status=eq.unused&select=*,coupons(*)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const mapped = (Array.isArray(data) ? data : []).map((mc) => ({ ...mc, coupon: mc.coupons }));
        setUsableCount(findUsableCoupons(mapped, totalPrice).length);
      })
      .catch(() => {});
  }, [member?.id, totalPrice]);

  // 促銷活動(滿額折/滿件折/階梯折扣)：不需要登入，任何訪客都能自動享有
  useEffect(() => {
    fetch(
      `${SUPABASE_URL}/rest/v1/promotions?active=eq.true&channel_online=eq.true&select=*`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPromotionActivities(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);
  const appliedPromotions = getAppliedPromotions(promotionActivities, totalPrice, totalQty);
  const promotionDiscount = combinePromotionDiscounts(promotionActivities, totalPrice, totalQty);

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

      {appliedPromotions.length > 0 && (
        <div
          style={{
            background: "#eaf7ee",
            border: "1px solid #2e7d32",
            borderRadius: 8,
            padding: "12px 16px",
            marginTop: 16,
            fontSize: 13,
            color: "#1b5e20",
          }}
        >
          🎉 已自動套用「{appliedPromotions.map((p) => p.name).join("、")}」，折抵 NT${promotionDiscount}
        </div>
      )}

      {usableCount > 0 && (
        <div
          style={{
            background: "#fdf3ec",
            border: "1px solid #e8a33d",
            borderRadius: 8,
            padding: "12px 16px",
            marginTop: 16,
            fontSize: 13,
            color: "#a05a00",
          }}
        >
          🎟️ 你有 {usableCount} 張優惠券已達使用門檻，前往結帳即可選用折抵
        </div>
      )}

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
