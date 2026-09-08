import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase.js";

export default function CouponCenterPage() {
  const { user, member } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [myCouponIds, setMyCouponIds] = useState([]); // 我已經領過的優惠券id清單，用來顯示「已領取」
  const [claimingId, setClaimingId] = useState(null); // 目前正在處理領取請求的優惠券id，避免重複點擊
  const [message, setMessage] = useState(null); // 領取結果的提示訊息
  const [autoClaimHandled, setAutoClaimHandled] = useState(false);

  // 是否符合「首購限定」資格：還沒有任何消費紀錄(累積消費0且消費次數0)才算首購會員
  function isFirstPurchaseEligible() {
    return member && (member.total_spend || 0) === 0 && (member.order_count || 0) === 0;
  }

  function loadCoupons() {
    setLoading(true);
    const now = new Date().toISOString();
    fetch(
      `${SUPABASE_URL}/rest/v1/coupons?show_in_center=eq.true&active=eq.true&or=(display_start.is.null,display_start.lte.${now})&select=*`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        // display_end的篩選在前端做(PostgREST的or條件語法在混合is.null跟lte比較兩個不同欄位時較難一次寫完，
        // 這裡資料量不大，前端再篩一次end time更直覺、不容易寫錯)
        const nowDate = new Date();
        const filtered = (Array.isArray(data) ? data : []).filter((c) => {
          if (c.display_end && new Date(c.display_end) < nowDate) return false;
          return true;
        });
        setCoupons(filtered);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadCoupons();
  }, []);

  // 載入會員自己已經領過的優惠券id清單，用來在畫面上正確顯示「已領取」而不是重複顯示「領取」按鈕
  useEffect(() => {
    if (!member?.id) { setMyCouponIds([]); return; }
    fetch(`${SUPABASE_URL}/rest/v1/member_coupons?member_id=eq.${encodeURIComponent(member.id)}&select=coupon_id`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMyCouponIds((Array.isArray(data) ? data : []).map((mc) => mc.coupon_id)))
      .catch(() => {});
  }, [member?.id]);

  async function claimCoupon(couponId) {
    if (!member?.id) return;
    setClaimingId(couponId);
    setMessage(null);
    try {
      const mcId = "MC-" + couponId + "-" + member.id;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/claim_coupon_atomic`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_coupon_id: couponId, p_member_id: member.id, p_mc_id: mcId }),
      });
      const data = await res.json();
      if (data?.success) {
        setMessage({ type: "success", text: "🎉 領取成功！可以到「我的帳戶→優惠券」查看" });
        setMyCouponIds((prev) => [...prev, couponId]);
        loadCoupons(); // 重新載入，讓已領取數量即時更新
      } else if (data?.error === "sold_out") {
        setMessage({ type: "error", text: "手慢了，這張優惠券剛好被搶完了" });
        loadCoupons();
      } else if (data?.error === "already_claimed") {
        setMessage({ type: "error", text: "你已經領過這張優惠券了" });
        setMyCouponIds((prev) => (prev.includes(couponId) ? prev : [...prev, couponId]));
      } else {
        setMessage({ type: "error", text: data?.error || "領取失敗，請稍後再試" });
      }
    } catch (e) {
      setMessage({ type: "error", text: "領取時發生錯誤，請稍後再試" });
    }
    setClaimingId(null);
  }

  function handleClaimClick(coupon) {
    if (!user) {
      // 訪客：導去登入頁，網址帶著return_to，登入成功後會自動導回這裡並帶著autoclaim參數，
      // 頁面下面的useEffect會偵測到並自動完成領取，客人不用登入後自己再點一次
      const returnTo = `/coupon-center?autoclaim=${encodeURIComponent(coupon.id)}`;
      navigate(`/login?return_to=${encodeURIComponent(returnTo)}`);
      return;
    }
    claimCoupon(coupon.id);
  }

  // 偵測網址上的autoclaim參數(通常是剛登入完，從登入頁導回來的)，自動完成領取，
  // 完成後把參數從網址清掉，避免重新整理頁面時又觸發一次
  useEffect(() => {
    const autoClaimId = searchParams.get("autoclaim");
    if (!autoClaimId || autoClaimHandled || !member?.id) return;
    setAutoClaimHandled(true);
    claimCoupon(autoClaimId).then(() => {
      searchParams.delete("autoclaim");
      setSearchParams(searchParams, { replace: true });
    });
  }, [searchParams, member?.id, autoClaimHandled]);

  function formatDiscount(c) {
    return c.discount_type === "percent" ? `${c.discount_value} 折` : `折抵 NT$${c.discount_value}`;
  }

  function audienceLabel(c) {
    if (c.target_audience === "member") return "會員限定";
    if (c.target_audience === "first_purchase") return "首購限定";
    return null;
  }

  if (loading) return <div style={{ textAlign: "center", padding: 60, color: "#999" }}>載入中...</div>;

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>🎟️ 領券中心</h1>
      <div style={{ color: "#999", fontSize: 13, marginBottom: 20 }}>領取優惠券，結帳時自動可用</div>

      {message && (
        <div
          style={{
            background: message.type === "success" ? "#eaf7ee" : "#fdecea",
            border: `1px solid ${message.type === "success" ? "#2e7d32" : "#c0392b"}`,
            borderRadius: 8,
            padding: "12px 16px",
            marginBottom: 16,
            fontSize: 13,
            color: message.type === "success" ? "#1b5e20" : "#c0392b",
          }}
        >
          {message.text}
        </div>
      )}

      {coupons.length === 0 && (
        <div style={{ textAlign: "center", padding: 60, color: "#999" }}>目前沒有開放領取的優惠券，晚點再回來看看</div>
      )}

      {coupons.map((c) => {
        const isSoldOut = c.total_quantity != null && (c.claimed_count || 0) >= c.total_quantity;
        const alreadyClaimed = myCouponIds.includes(c.id);
        const ineligible =
          (c.target_audience === "member" && !user) ||
          (c.target_audience === "first_purchase" && user && !isFirstPurchaseEligible());
        const label = audienceLabel(c);

        return (
          <div
            key={c.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 10,
              padding: "18px 20px",
              marginBottom: 14,
              opacity: isSoldOut ? 0.55 : 1,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{c.name}</div>
                {label && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#c0392b", background: "#fdecea", padding: "2px 8px", borderRadius: 10 }}>
                    {label}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#c0392b", marginTop: 6 }}>{formatDiscount(c)}</div>
              {c.min_spend > 0 && <div style={{ fontSize: 12, color: "#999", marginTop: 4 }}>消費滿 NT${c.min_spend} 可用</div>}
              {c.expire_date && <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>有效期至 {c.expire_date}</div>}
              {c.total_quantity != null && (
                <div style={{ fontSize: 12, color: isSoldOut ? "#c0392b" : "#999", marginTop: 2, fontWeight: isSoldOut ? 700 : 400 }}>
                  {isSoldOut ? "已搶完" : `剩餘 ${c.total_quantity - (c.claimed_count || 0)} / ${c.total_quantity} 張`}
                </div>
              )}
            </div>

            {isSoldOut ? (
              <div style={{ padding: "10px 20px", background: "#f0f0f0", color: "#999", borderRadius: 6, fontSize: 13, fontWeight: 700 }}>
                已搶完
              </div>
            ) : alreadyClaimed ? (
              <div style={{ padding: "10px 20px", background: "#eaf7ee", color: "#2e7d32", borderRadius: 6, fontSize: 13, fontWeight: 700 }}>
                ✓ 已領取
              </div>
            ) : ineligible ? (
              <div style={{ fontSize: 12, color: "#999", textAlign: "right", maxWidth: 140 }}>
                {c.target_audience === "first_purchase" ? "限首次購買會員" : "登入會員限定"}
              </div>
            ) : (
              <button
                onClick={() => handleClaimClick(c)}
                disabled={claimingId === c.id}
                style={{
                  padding: "10px 24px",
                  background: "#222",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: claimingId === c.id ? "default" : "pointer",
                  opacity: claimingId === c.id ? 0.6 : 1,
                  whiteSpace: "nowrap",
                }}
              >
                {claimingId === c.id ? "領取中..." : user ? "立即領取" : "登入領取"}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
