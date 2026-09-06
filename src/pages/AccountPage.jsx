import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase.js";

const inputStyle = { padding: "10px 12px", border: "1px solid #ddd", borderRadius: 6, fontSize: 14, width: "100%", boxSizing: "border-box" };
const labelStyle = { color: "#999", fontSize: 12, marginBottom: 4 };
const btnPrimary = { padding: "10px 20px", background: "#222", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" };
const btnSecondary = { padding: "9px 16px", background: "none", border: "1px solid #ddd", borderRadius: 6, fontSize: 13, cursor: "pointer", color: "#666" };
const sectionCard = { border: "1px solid #eee", borderRadius: 8, padding: "18px 20px" };

export default function AccountPage() {
  const { user, member, loading: authLoading, signOut, updateEmail, updateMemberProfile } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [levelSettings, setLevelSettings] = useState(null);

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

  // 讀取會員分級設定，用來算「距離下一等級還差多少」的升級進度
  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/pos_member_settings?key=eq.member_levels`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setLevelSettings(Array.isArray(d) && d[0]?.value ? d[0].value : { levels: [] }))
      .catch(() => setLevelSettings({ levels: [] }));
  }, []);

  if (authLoading || !user) {
    return <div style={{ textAlign: "center", padding: 60, color: "#999" }}>載入中...</div>;
  }

  const TABS = [
    { id: "profile", label: "個人資訊" },
    { id: "credit", label: "商店購物金" },
    { id: "coupons", label: "優惠券" },
    { id: "orders", label: "訂單" },
    { id: "wishlist", label: "追蹤清單" },
    { id: "addresses", label: "地址簿" },
  ];

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "24px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{member?.name || user.email}</h1>
          {member?.member_level && (
            <span style={{ background: "#e8a33d", color: "#fff", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12 }}>
              {member.member_level}
            </span>
          )}
        </div>
        <button onClick={signOut} style={btnSecondary}>登出</button>
      </div>

      <UpgradeBanner member={member} levelSettings={levelSettings} />

      <div style={{ display: "flex", gap: 4, margin: "20px 0", borderBottom: "1px solid #eee", flexWrap: "wrap" }}>
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

      {tab === "profile" && <PersonalInfoTab user={user} member={member} updateEmail={updateEmail} updateMemberProfile={updateMemberProfile} />}
      {tab === "credit" && <StoreCreditTab member={member} />}
      {tab === "coupons" && <CouponsTab member={member} />}
      {tab === "orders" && <OrdersTab orders={orders} loading={loading} />}
      {tab === "wishlist" && <WishlistTab member={member} />}
      {tab === "addresses" && <AddressesTab member={member} />}
    </div>
  );
}

// 升級進度橫幅：算出目前消費距離下一個等級還差多少，找不到設定或已經是最高等級時不顯示
function UpgradeBanner({ member, levelSettings }) {
  if (!member || !levelSettings?.levels?.length) return null;
  const spend = member.total_spend || 0;
  const sorted = [...levelSettings.levels].sort((a, b) => (a.upgrade_amount || 0) - (b.upgrade_amount || 0));
  const next = sorted.find((l) => (l.upgrade_amount || 0) > spend);
  if (!next) return null; // 已經是最高等級，或還沒設定任何門檻
  const diff = (next.upgrade_amount || 0) - spend;
  return (
    <div style={{ background: "#f5f5f5", borderRadius: 8, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
      <div style={{ fontSize: 13, color: "#444" }}>
        🏅 升級至 <b>{next.name}</b>：單次消費滿 NT${(next.upgrade_amount || 0).toLocaleString()} 即可升級，還差 NT${diff.toLocaleString()}
      </div>
      <Link to="/products" style={{ fontSize: 12, color: "#c0392b" }}>繼續逛逛 →</Link>
    </div>
  );
}

// 個人資訊：合併姓名/電話/生日/性別編輯、Email(含驗證標記)、密碼修改入口、訂閱偏好
function PersonalInfoTab({ user, member, updateEmail, updateMemberProfile }) {
  const [form, setForm] = useState({
    name: member?.name || "",
    phone: member?.phone || "",
    birthday: member?.birthday || "",
    gender: member?.gender || "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);

  const [subs, setSubs] = useState({ email_subscribe: !!member?.email_subscribe, sms_subscribe: !!member?.sms_subscribe });
  const [subsSaving, setSubsSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const { error } = await updateMemberProfile({
      name: form.name.trim(),
      phone: form.phone.trim(),
      birthday: form.birthday,
      gender: form.gender,
    });
    setSaving(false);
    setMsg(error ? { type: "error", text: error.message } : { type: "success", text: "個人資料已更新" });
  }

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

  async function toggleSub(key) {
    const next = { ...subs, [key]: !subs[key] };
    setSubs(next);
    setSubsSaving(true);
    await updateMemberProfile({ [key]: next[key] });
    setSubsSaving(false);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }}>
      <div style={sectionCard}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>會員資料</h3>
        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 420 }}>
          <div>
            <div style={labelStyle}>姓名</div>
            <input style={inputStyle} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
          </div>
          <div>
            <div style={labelStyle}>電郵</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ ...inputStyle, background: "#f8f8f8", color: "#999" }}>{user.email}</div>
              <span style={{ fontSize: 11, color: "#2e7d32", whiteSpace: "nowrap" }}>✓ 驗證完成</span>
            </div>
          </div>
          <div>
            <div style={labelStyle}>手機號碼</div>
            <input style={inputStyle} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          </div>
          <div>
            <div style={labelStyle}>性別</div>
            <select style={inputStyle} value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}>
              <option value="">不透露</option>
              <option value="female">女</option>
              <option value="male">男</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div>
            <div style={labelStyle}>生日日期</div>
            <input type="date" style={inputStyle} value={form.birthday} onChange={(e) => setForm((p) => ({ ...p, birthday: e.target.value }))} />
          </div>
          <div>
            <div style={labelStyle}>密碼</div>
            <Link to="/update-password" style={{ fontSize: 13, color: "#c0392b" }}>設定新的密碼</Link>
          </div>
          {msg && <div style={{ fontSize: 12, color: msg.type === "error" ? "#c0392b" : "#2e7d32" }}>{msg.text}</div>}
          <button type="submit" disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, alignSelf: "flex-start" }}>
            {saving ? "儲存中..." : "儲存變更"}
          </button>
        </form>
      </div>

      <div style={sectionCard}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 6 }}>變更登入信箱</h3>
        <div style={{ color: "#999", fontSize: 12, marginBottom: 12 }}>目前登入信箱：{user.email}</div>
        <form onSubmit={handleEmailSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 380 }}>
          <input type="email" placeholder="輸入新的Email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={inputStyle} />
          {emailMsg && <div style={{ fontSize: 12, color: emailMsg.type === "error" ? "#c0392b" : "#2e7d32", lineHeight: 1.5 }}>{emailMsg.text}</div>}
          <button type="submit" disabled={emailSaving || !newEmail.trim()} style={{ ...btnPrimary, opacity: (emailSaving || !newEmail.trim()) ? 0.5 : 1, alignSelf: "flex-start" }}>
            {emailSaving ? "處理中..." : "更新Email"}
          </button>
        </form>
      </div>

      <div style={sectionCard}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 0, marginBottom: 16 }}>訂閱偏好</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[
            ["email_subscribe", "優惠宣傳 Email 通知"],
            ["sms_subscribe", "優惠宣傳簡訊通知"],
          ].map(([key, label]) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "#444", cursor: "pointer" }}>
              <input type="checkbox" checked={!!subs[key]} disabled={subsSaving} onChange={() => toggleSub(key)} />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// 商店購物金：顯示目前餘額 + 完整收支明細(來自pos_credit_logs)
function StoreCreditTab({ member }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const memberId = member?.id;

  const typeLabel = { issue: "發放", deduct: "扣除", birthday: "生日禮", expire: "到期", welcome: "新會員禮", renew: "續卡禮", upgrade: "升等禮", referral: "推薦好友" };

  useEffect(() => {
    if (!memberId) return;
    fetch(`${SUPABASE_URL}/rest/v1/pos_credit_logs?member_id=eq.${encodeURIComponent(memberId)}&order=created_at.desc&limit=100`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setLogs(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [memberId]);

  return (
    <div>
      <div style={{ ...sectionCard, marginBottom: 20, textAlign: "center" }}>
        <div style={{ color: "#999", fontSize: 12 }}>目前購物金餘額</div>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6 }}>NT${(member?.deposit_balance || 0).toLocaleString()}</div>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>明細紀錄</h3>
      {loading && <div style={{ textAlign: "center", padding: 30, color: "#999" }}>載入中...</div>}
      {!loading && logs.length === 0 && (
        <div style={{ textAlign: "center", padding: 30, color: "#999" }}>目前沒有任何購物金紀錄</div>
      )}
      {!loading &&
        logs.map((log) => (
          <div key={log.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{typeLabel[log.type] || log.type}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{log.note}</div>
              <div style={{ fontSize: 11, color: "#bbb", marginTop: 2 }}>{new Date(log.created_at).toLocaleDateString()}{log.expire_date ? ` ・有效期至 ${log.expire_date}` : ""}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: log.type === "deduct" || log.type === "expire" ? "#c0392b" : "#2e7d32" }}>
              {log.type === "deduct" || log.type === "expire" ? "-" : "+"}NT${Math.abs(log.amount || 0).toLocaleString()}
            </div>
          </div>
        ))}
    </div>
  );
}

// 優惠券：顯示會員擁有的所有優惠券(member_coupons join coupons)，區分未使用/已使用/已過期
function CouponsTab({ member }) {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const memberId = member?.id;

  useEffect(() => {
    if (!memberId) return;
    fetch(
      `${SUPABASE_URL}/rest/v1/member_coupons?member_id=eq.${encodeURIComponent(memberId)}&select=*,coupons(*)&order=issued_at.desc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setCoupons(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [memberId]);

  function formatDiscount(c) {
    if (!c) return "";
    return c.discount_type === "percent" ? `${c.discount_value} 折` : `折抵 NT$${c.discount_value}`;
  }

  const statusLabel = { unused: "可使用", used: "已使用", expired: "已過期" };

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>;

  return (
    <div>
      {coupons.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#999" }}>目前沒有任何優惠券</div>}
      {coupons.map((mc) => {
        const c = mc.coupons;
        const isUsable = mc.status === "unused";
        return (
          <div
            key={mc.id}
            style={{
              border: `1px solid ${isUsable ? "#c0392b" : "#eee"}`,
              borderRadius: 8,
              padding: "14px 16px",
              marginBottom: 10,
              opacity: isUsable ? 1 : 0.5,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c?.name}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: isUsable ? "#c0392b" : "#999", marginTop: 4 }}>{formatDiscount(c)}</div>
              {c?.min_spend > 0 && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>消費滿 NT${c.min_spend} 可用</div>}
              {c?.expire_date && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>有效期至 {c.expire_date}</div>}
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 10, background: isUsable ? "#fdecea" : "#f0f0f0", color: isUsable ? "#c0392b" : "#999" }}>
              {statusLabel[mc.status] || mc.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// 追蹤清單(收藏商品)：存的是product_sku(款號層級)，跟商品頁/商品卡連結方式一致
function WishlistTab({ member }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const memberId = member?.id;

  function loadWishlist() {
    if (!memberId) return;
    setLoading(true);
    fetch(`${SUPABASE_URL}/rest/v1/member_wishlist?member_id=eq.${encodeURIComponent(memberId)}&order=added_at.desc`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => {
    loadWishlist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId]);

  async function handleRemove(id) {
    await fetch(`${SUPABASE_URL}/rest/v1/member_wishlist?id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    });
    loadWishlist();
  }

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#999" }}>載入中...</div>;

  return (
    <div>
      {items.length === 0 && <div style={{ textAlign: "center", padding: 40, color: "#999" }}>還沒有追蹤任何商品</div>}
      {items.map((item) => (
        <div key={item.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #eee", borderRadius: 8, padding: "12px 16px", marginBottom: 10 }}>
          <Link to={`/products/${item.product_sku}`} style={{ color: "#222", textDecoration: "none", fontSize: 13, fontWeight: 700 }}>
            貨號：{item.product_sku}
          </Link>
          <button onClick={() => handleRemove(item.id)} style={{ ...btnSecondary, padding: "5px 10px", fontSize: 12, color: "#c0392b" }}>取消追蹤</button>
        </div>
      ))}
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
