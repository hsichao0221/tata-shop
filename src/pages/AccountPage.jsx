import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase.js";

const inputStyle = { padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box" };
const labelStyle = { color: "#999", fontSize: 12, marginBottom: 4 };
const btnPrimary = { padding: "10px 20px", background: "#222", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" };
const btnSecondary = { padding: "9px 16px", background: "none", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: "pointer", color: "#666" };

export default function AccountPage() {
  const { user, member, loading: authLoading, signOut, updateEmail, updateMemberProfile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/login");
    }
  }, [authLoading, user]);

  useEffect(() => {
    if (!user?.email) return;
    const orFilter = member?.id
      ? `or=(member_id.eq.${encodeURIComponent(member.id)},customer_email.eq.${encodeURIComponent(user.email)})`
      : `customer_email=eq.${encodeURIComponent(user.email)}`;
    fetch(
      `${SUPABASE_URL}/rest/v1/pos_orders?store_id=eq.web&${orFilter}&order=date.desc,time.desc&select=*`,
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
  }, [user, member]);

  if (authLoading || !user) {
    return <div style={{ textAlign: "center", padding: 60, color: "#999" }}>載入中...</div>;
  }

  const TABS = [
    { id: "orders", label: "我的訂單" },
    { id: "profile", label: "個人資料" },
    { id: "addresses", label: "地址簿" },
    { id: "security", label: "帳號安全" },
  ];

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>我的帳戶</h1>
          <div style={{ color: "#999", fontSize: 13, marginTop: 4 }}>{user.email}</div>
        </div>
        <button onClick={signOut} style={btnSecondary}>登出</button>
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

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #eee", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "10px 14px",
              background: "none",
              border: "none",
              borderBottom: tab === t.id ? "2px solid #222" : "2px solid transparent",
              fontSize: 13,
              fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? "#222" : "#999",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <OrdersTab orders={orders} loading={loading} />
      )}
      {tab === "profile" && (
        <ProfileTab member={member} updateMemberProfile={updateMemberProfile} />
      )}
      {tab === "addresses" && (
        <AddressesTab member={member} />
      )}
      {tab === "security" && (
        <SecurityTab user={user} updateEmail={updateEmail} />
      )}
    </div>
  );
}

function OrdersTab({ orders, loading }) {
  return (
    <div>
      {loading && <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>}
      {!loading && orders.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#999" }}>目前還沒有訂單紀錄</div>
      )}
      {!loading &&
        orders.map((o) => (
          <div key={o.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontFamily: "monospace", fontSize: 13, color: "#666" }}>{o.id}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: o.type === "sale" ? "#27ae60" : o.type === "pending" ? "#e67e22" : "#999" }}>
                {o.type === "sale" ? "已完成付款" : o.type === "pending" ? "待付款" : o.type}
              </span>
            </div>
            <div style={{ color: "#999", fontSize: 12, marginBottom: 8 }}>{o.date} {o.time}</div>
            {(o.items || []).map((item, i) => (
              <div key={i} style={{ fontSize: 13, color: "#444" }}>
                {item.name} {item.variant && `（${item.variant}）`} x{item.qty}
              </div>
            ))}
            <div style={{ textAlign: "right", fontWeight: 700, marginTop: 8 }}>NT${o.total}</div>
          </div>
        ))}
    </div>
  );
}

function ProfileTab({ member, updateMemberProfile }) {
  const [form, setForm] = useState({ name: member?.name || "", phone: member?.phone || "", birthday: member?.birthday || "" });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const { error } = await updateMemberProfile({ name: form.name.trim(), phone: form.phone.trim(), birthday: form.birthday });
    setSaving(false);
    setMsg(error ? { type: "error", text: error.message } : { type: "success", text: "個人資料已更新" });
  }

  return (
    <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 400 }}>
      <div>
        <div style={labelStyle}>姓名</div>
        <input style={inputStyle} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
      </div>
      <div>
        <div style={labelStyle}>電話</div>
        <input style={inputStyle} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
      </div>
      <div>
        <div style={labelStyle}>生日</div>
        <input type="date" style={inputStyle} value={form.birthday} onChange={(e) => setForm((p) => ({ ...p, birthday: e.target.value }))} />
      </div>
      {msg && <div style={{ fontSize: 12, color: msg.type === "error" ? "#c0392b" : "#2e7d32" }}>{msg.text}</div>}
      <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, alignSelf: "flex-start" }}>
        {saving ? "儲存中..." : "儲存變更"}
      </button>
    </form>
  );
}

function emptyAddressForm() {
  return { recipient_name: "", recipient_phone: "", address1: "", city: "", region: "", postal_code: "", is_default: false };
}

function AddressesTab({ member }) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyAddressForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const memberId = member?.id;

  function loadAddresses() {
    if (!memberId) return;
    setLoading(true);
    fetch(`${SUPABASE_URL}/rest/v1/member_addresses?member_id=eq.${encodeURIComponent(memberId)}&order=is_default.desc,created_at.desc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setAddresses(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  function startNew() {
    setForm(emptyAddressForm());
    setEditing("new");
    setError(null);
  }

  function startEdit(addr) {
    setForm({
      recipient_name: addr.recipient_name || "",
      recipient_phone: addr.recipient_phone || "",
      address1: addr.address1 || "",
      city: addr.city || "",
      region: addr.region || "",
      postal_code: addr.postal_code || "",
      is_default: !!addr.is_default,
    });
    setEditing(addr.id);
    setError(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.recipient_name.trim() || !form.recipient_phone.trim() || !form.address1.trim()) {
      setError("請填寫收件人姓名、電話、地址");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (form.is_default) {
        await fetch(`${SUPABASE_URL}/rest/v1/member_addresses?member_id=eq.${encodeURIComponent(memberId)}`, {
          method: "PATCH",
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ is_default: false }),
        });
      }
      if (editing === "new") {
        const id = "ADDR-" + Date.now();
        const res = await fetch(`${SUPABASE_URL}/rest/v1/member_addresses`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ id, member_id: memberId, ...form }),
        });
        if (!res.ok) throw new Error("新增失敗");
      } else {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/member_addresses?id=eq.${encodeURIComponent(editing)}`, {
          method: "PATCH",
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (!res.ok) throw new Error("更新失敗");
      }
      setEditing(null);
      loadAddresses();
    } catch (e) {
      setError(String(e.message || e));
    }
    setSaving(false);
  }

  async function handleDelete(id) {
    if (!window.confirm("確定要刪除這筆地址嗎？")) return;
    await fetch(`${SUPABASE_URL}/rest/v1/member_addresses?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    });
    loadAddresses();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>;

  return (
    <div>
      {!editing && (
        <>
          {addresses.length === 0 && (
            <div style={{ textAlign: "center", padding: 30, color: "#999", marginBottom: 16 }}>還沒有儲存任何地址</div>
          )}
          {addresses.map((addr) => (
            <div key={addr.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: "14px 16px", marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {addr.recipient_name} {addr.is_default && <span style={{ fontSize: 11, color: "#c0392b", fontWeight: 700 }}>（預設）</span>}
                  </div>
                  <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>{addr.recipient_phone}</div>
                  <div style={{ color: "#666", fontSize: 13, marginTop: 2 }}>
                    {addr.postal_code} {addr.region}{addr.city}{addr.address1}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => startEdit(addr)} style={{ ...btnSecondary, padding: "5px 10px", fontSize: 12 }}>編輯</button>
                  <button onClick={() => handleDelete(addr.id)} style={{ ...btnSecondary, padding: "5px 10px", fontSize: 12, color: "#c0392b" }}>刪除</button>
                </div>
              </div>
            </div>
          ))}
          <button onClick={startNew} style={btnPrimary}>+ 新增地址</button>
        </>
      )}

      {editing && (
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 420 }}>
          <div>
            <div style={labelStyle}>收件人姓名</div>
            <input style={inputStyle} value={form.recipient_name} onChange={(e) => setForm((p) => ({ ...p, recipient_name: e.target.value }))} />
          </div>
          <div>
            <div style={labelStyle}>收件人電話</div>
            <input style={inputStyle} value={form.recipient_phone} onChange={(e) => setForm((p) => ({ ...p, recipient_phone: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <div style={labelStyle}>縣市</div>
              <input style={inputStyle} value={form.region} onChange={(e) => setForm((p) => ({ ...p, region: e.target.value }))} placeholder="例：台北市" />
            </div>
            <div>
              <div style={labelStyle}>鄉鎮區</div>
              <input style={inputStyle} value={form.city} onChange={(e) => setForm((p) => ({ ...p, city: e.target.value }))} placeholder="例：信義區" />
            </div>
          </div>
          <div>
            <div style={labelStyle}>郵遞區號</div>
            <input style={inputStyle} value={form.postal_code} onChange={(e) => setForm((p) => ({ ...p, postal_code: e.target.value }))} />
          </div>
          <div>
            <div style={labelStyle}>詳細地址</div>
            <input style={inputStyle} value={form.address1} onChange={(e) => setForm((p) => ({ ...p, address1: e.target.value }))} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#444" }}>
            <input type="checkbox" checked={form.is_default} onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))} />
            設為預設地址
          </label>
          {error && <div style={{ color: "#c0392b", fontSize: 12 }}>{error}</div>}
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1 }}>{saving ? "儲存中..." : "儲存"}</button>
            <button type="button" onClick={() => setEditing(null)} style={btnSecondary}>取消</button>
          </div>
        </form>
      )}
    </div>
  );
}

function SecurityTab({ user, updateEmail }) {
  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);

  async function handleEmailSubmit(e) {
    e.preventDefault();
    if (!newEmail.trim() || newEmail.trim() === user.email) return;
    setEmailSaving(true);
    setEmailMsg(null);
    const { error } = await updateEmail(newEmail.trim());
    setEmailSaving(false);
    setEmailMsg(
      error
        ? { type: "error", text: error.message }
        : { type: "success", text: "已寄出確認信到新信箱，請點擊信裡的連結完成變更。變更完成前，請繼續使用目前的信箱登入。" }
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, maxWidth: 400 }}>
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>登入密碼</h3>
        <div style={{ color: "#999", fontSize: 12, marginBottom: 10 }}>基於安全考量，修改密碼會另外跳轉到專屬頁面進行。</div>
        <Link to="/update-password">
          <button type="button" style={btnSecondary}>修改密碼</button>
        </Link>
      </div>

      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>登入信箱</h3>
        <div style={{ color: "#999", fontSize: 12, marginBottom: 10 }}>目前登入信箱：{user.email}</div>
        <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="email"
            placeholder="輸入新的Email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            style={inputStyle}
          />
          {emailMsg && <div style={{ fontSize: 12, color: emailMsg.type === "error" ? "#c0392b" : "#2e7d32", lineHeight: 1.5 }}>{emailMsg.text}</div>}
          <button type="submit" disabled={emailSaving || !newEmail.trim()} style={{ ...btnPrimary, opacity: (emailSaving || !newEmail.trim()) ? 0.5 : 1, alignSelf: "flex-start" }}>
            {emailSaving ? "處理中..." : "更新Email"}
          </button>
        </form>
      </div>
    </div>
  );
}
