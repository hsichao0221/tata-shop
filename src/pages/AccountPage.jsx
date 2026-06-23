import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase.js";

export default function AccountPage() {
  const { user, member, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (!user?.email) return;
    fetch(
      `${SUPABASE_URL}/rest/v1/pos_orders?store_id=eq.web&member_name=eq.${encodeURIComponent(user.email)}&order=date.desc,time.desc&select=*`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } }
    )
      .then((r) => r.json())
      .then((data) => {
        setOrders(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        console.error("讀取訂單失敗:", e);
        setLoading(false);
      });
  }, [user]);

  if (authLoading || !user) {
    return <div style={{ textAlign: "center", padding: 60, color: "#999" }}>載入中...</div>;
  }

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>我的帳戶</h1>
          <div style={{ color: "#999", fontSize: 13, marginTop: 4 }}>{user.email}</div>
        </div>
        <button
          onClick={signOut}
          style={{
            background: "none",
            border: "1px solid #ddd",
            borderRadius: 6,
            padding: "8px 16px",
            fontSize: 13,
            cursor: "pointer",
            color: "#666",
          }}
        >
          登出
        </button>
      </div>

      {member && (
        <div
          style={{
            background: "#fafafa",
            borderRadius: 8,
            padding: "16px 20px",
            marginBottom: 24,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ color: "#999", fontSize: 12 }}>累積消費</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>NT${member.total_spend || 0}</div>
          </div>
          <div>
            <div style={{ color: "#999", fontSize: 12 }}>消費次數</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{member.order_count || 0} 次</div>
          </div>
        </div>
      )}

      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>我的訂單</h2>

      {loading && <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>}

      {!loading && orders.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
          目前還沒有訂單紀錄
        </div>
      )}

      {!loading &&
        orders.map((o) => (
          <div
            key={o.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 8,
              padding: "14px 16px",
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#666" }}>{o.id}</span>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: o.type === "sale" ? "#27ae60" : o.type === "pending" ? "#e67e22" : "#999",
                }}
              >
                {o.type === "sale" ? "已完成付款" : o.type === "pending" ? "待付款" : o.type}
              </span>
            </div>
            <div style={{ color: "#999", fontSize: 12, marginBottom: 8 }}>
              {o.date} {o.time}
            </div>
            {(o.items || []).map((item, i) => (
              <div key={i} style={{ fontSize: 13, color: "#444" }}>
                {item.name} {item.variant && `（${item.variant}）`} x{item.qty}
              </div>
            ))}
            <div style={{ textAlign: "right", fontWeight: 700, marginTop: 8 }}>
              NT${o.total}
            </div>
          </div>
        ))}
    </div>
  );
}
