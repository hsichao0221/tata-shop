import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCart } from "../CartContext.jsx";
import { useAuth } from "../AuthContext.jsx";
import { fetchShippingMethods, SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase.js";
import { resolveValidSelection, canAddCoupon, calcDiscount, findUsableCoupons } from "../couponUtils.js";

// 產生一個不重複的訂單編號：時間戳記 + 隨機碼，符合 ECPay 規定（英數字、20字以內）
function generateOrderId() {
  const now = Date.now().toString().slice(-10);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SHOP${now}${rand}`;
}

// 暫存草稿用的localStorage key：客人去綠界選門市，選完繞回我們網站時，
// 用這個key把姓名/電話/Email/選擇的配送方式還原回表單，不用重新填一次
const DRAFT_KEY = "tata_checkout_draft";

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
  const { user, member } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // 配送方式清單：從ERP後台「送貨設定」動態讀取，不再寫死選項
  const [shipMethods, setShipMethods] = useState([]);
  const [shipMethodsLoading, setShipMethodsLoading] = useState(true);

  // 優惠券：會員擁有的所有未使用優惠券、目前已選取要套用的優惠券
  const [memberCoupons, setMemberCoupons] = useState([]);
  const [selectedCoupons, setSelectedCoupons] = useState([]);
  const [couponsLoading, setCouponsLoading] = useState(false);

  // 訂購人/收件資訊：如果有登入會員，姓名/Email會先帶入會員資料，客人仍可自行修改
  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    phone: "",
    email: "",
    shipMethodId: "",
    address: "",
  });
  const [prefilledFromMember, setPrefilledFromMember] = useState(false);

  // 客人在綠界門市地圖選好的門市資訊（只有選超商取貨時才會用到）
  const [cvsStore, setCvsStore] = useState(null);

  function updCustomerInfo(key, value) {
    setCustomerInfo((prev) => ({ ...prev, [key]: value }));
  }

  // 會員資料載入後，如果表單還是空的（代表客人還沒手動填過、也不是剛從綠界繞回來），
  // 就用會員資料預先帶入姓名/Email/電話，省去重複輸入
  useEffect(() => {
    if (prefilledFromMember) return;
    if (!member && !user) return;
    setCustomerInfo((prev) => {
      if (prev.name || prev.phone || prev.email) return prev; // 已經有值（手動填過或從草稿還原），不要覆蓋
      return {
        ...prev,
        name: member?.name || "",
        email: member?.email || user?.email || "",
        phone: member?.phone || "",
      };
    });
    setPrefilledFromMember(true);
  }, [member, user, prefilledFromMember]);

  // 載入會員擁有的所有未使用優惠券，供結帳時選擇套用
  useEffect(() => {
    if (!member?.id) return;
    setCouponsLoading(true);
    fetch(
      `${SUPABASE_URL}/rest/v1/member_coupons?member_id=eq.${encodeURIComponent(member.id)}&status=eq.unused&select=*,coupons(*)`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const mapped = (Array.isArray(data) ? data : []).map((mc) => ({ ...mc, coupon: mc.coupons }));
        setMemberCoupons(mapped);
        setCouponsLoading(false);
      })
      .catch(() => setCouponsLoading(false));
  }, [member?.id]);

  function toggleCoupon(mc) {
    setSelectedCoupons((prev) => {
      const already = prev.find((c) => c.id === mc.id);
      if (already) return prev.filter((c) => c.id !== mc.id);
      if (!canAddCoupon(mc.coupon, prev)) return prev; // 違反疊加規則，不允許加入
      return [...prev, mc];
    });
  }

  // 載入配送方式清單，並處理「客人剛從綠界門市地圖選完店繞回來」的情境
  useEffect(() => {
    fetchShippingMethods().then((list) => {
      setShipMethods(list);
      setShipMethodsLoading(false);
      setCustomerInfo((prev) => ({
        ...prev,
        shipMethodId: prev.shipMethodId || list[0]?.id || "",
      }));
    });

    const params = new URLSearchParams(window.location.search);
    const cvsDraft = params.get("cvsDraft");
    if (!cvsDraft) return;

    // 還原選店之前填好的姓名/電話/Email/配送方式（這個來自localStorage，比會員資料優先，
    // 因為代表客人剛剛已經手動確認過這些內容）
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (saved) {
        setCustomerInfo((prev) => ({ ...prev, ...saved }));
        setPrefilledFromMember(true); // 避免會員預填邏輯之後又覆蓋回去
      }
    } catch (e) {
      console.warn("還原結帳草稿失敗:", e);
    }

    // 去後端暫存資料表撈剛剛選好的門市資訊
    fetch(
      `${SUPABASE_URL}/rest/v1/shop_cvs_selections?draft_id=eq.${encodeURIComponent(cvsDraft)}&select=*`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY } }
    )
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const row = rows?.[0];
        if (row && row.store_id) {
          setCvsStore({
            storeId: row.store_id,
            storeName: row.store_name,
            address: row.address,
            telephone: row.telephone,
            carrier: row.carrier,
          });
        } else {
          setError("門市選擇似乎沒有成功，請重新選擇一次取貨門市");
        }
      })
      .catch(() => setError("讀取門市資訊失敗，請重新選擇一次取貨門市"));

    // 清掉網址上的cvsDraft參數，避免重新整理頁面時又觸發一次
    window.history.replaceState({}, "", "/checkout");
  }, []);

  const selectedMethod = shipMethods.find((m) => m.id === customerInfo.shipMethodId) || null;
  const shippingFee = selectedMethod?.fee_amount || 0;
  // 疊加規則可能因為使用者操作順序讓selectedCoupons出現不合法組合(理論上toggleCoupon已經擋掉，
  // 這裡再保險計算一次合法子集合，確保實際折抵金額一定符合疊加規則)
  const validSelectedCoupons = resolveValidSelection(selectedCoupons);
  const discountAmount = calcDiscount(totalPrice, validSelectedCoupons);
  const grandTotal = totalPrice + shippingFee - discountAmount;
  const usableCoupons = findUsableCoupons(memberCoupons, totalPrice);

  // 切換配送方式時，舊的門市選擇就不適用了，清掉避免送出時帶著錯的門市資訊
  function handleSelectShipMethod(method) {
    updCustomerInfo("shipMethodId", method.id);
    if (method.method_type !== "cvs") setCvsStore(null);
  }

  // 把目前表單狀態存進localStorage，然後整頁導去綠界門市電子地圖選店，
  // 選完店後綠界會把結果POST回我們的/api/ecpay-cvsmap-callback，再導回這個頁面
  function handleChooseStore(method) {
    // 綠界ExtraData欄位上限20字元，用短編號（時間戳記末6碼+4碼亂數，共10字元）避免超長被截斷或清空，
    // MerchantTradeNo也帶同一個編號當備援，兩個欄位都會被綠界原值回傳，提高比對成功率
    const draftId = Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 6);
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...customerInfo, shipMethodId: method.id }));

    const form = document.createElement("form");
    form.method = "POST";
    // 測試環境網址；正式上線且ECPay物流也切換正式商家編號後，這裡要改成 https://logistics.ecpay.com.tw/Express/map
    form.action = "https://logistics-stage.ecpay.com.tw/Express/map";
    const fields = {
      MerchantID: "2000132",
      MerchantTradeNo: draftId,
      LogisticsType: "CVS",
      LogisticsSubType: method.ecpay_subtype,
      IsCollection: "N",
      ServerReplyURL: `${window.location.origin}/api/ecpay-cvsmap-callback`,
      ExtraData: draftId,
      Device: "1",
    };
    Object.entries(fields).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });
    document.body.appendChild(form);
    form.submit();
  }

  // 送出前的基本檢查：姓名、電話必填；宅配要填地址；超商取貨要已經選好門市
  function validateCustomerInfo() {
    if (!customerInfo.name.trim()) return "請填寫訂購人姓名";
    if (!customerInfo.phone.trim()) return "請填寫聯絡電話";
    if (!selectedMethod) return "請選擇配送方式";
    if (selectedMethod.method_type === "home_delivery" && !customerInfo.address.trim()) {
      return "請填寫收件地址";
    }
    if (selectedMethod.method_type === "cvs" && !cvsStore) {
      return "請選擇取貨門市";
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
          // 修正：原本只存name跟qty，導致訂單明細完全沒有款號/圖片/規格/單價這些資訊，
          // 客人在「我的帳戶」查看訂單時只看得到商品名稱，沒有圖片也不知道買的是哪個規格。
          // 這些欄位在購物車items裡本來就有(CartContext.jsx的addItem已經存了)，只是結帳
          // 送出時被丟掉，現在完整保留下來。
          items: items.map((i) => ({ name: i.name, sku: i.sku, variant: i.variantName, qty: i.qty, price: i.price, image: i.image })),
          totalAmount: totalPrice,
          discountAmount,
          couponIds: validSelectedCoupons.map((c) => c.id),
          shippingFee,
          orderId,
          customerName: customerInfo.name.trim(),
          customerPhone: customerInfo.phone.trim(),
          customerEmail: customerInfo.email.trim(),
          memberEmail: user?.email || null,
          memberId: member?.id || null,
          shipMethod: selectedMethod.name,
          shipMethodType: selectedMethod.method_type,
          shipAddress: customerInfo.address.trim(),
          cvsStoreId: cvsStore?.storeId,
          cvsStoreName: cvsStore?.storeName,
          cvsStoreAddress: cvsStore?.address,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "建立訂單失敗，請稍後再試");
        setSubmitting(false);
        return;
      }

      localStorage.removeItem(DRAFT_KEY);

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

      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontSize: 13, color: "#666" }}>
        <span>商品小計</span>
        <span>NT${totalPrice}</span>
      </div>
      {selectedMethod && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 10px", fontSize: 13, color: "#666" }}>
          <span>運費（{selectedMethod.name}）</span>
          <span>{shippingFee > 0 ? `NT$${shippingFee}` : "免運"}</span>
        </div>
      )}

      {member && (
        <div style={{ padding: "10px 0", borderTop: "1px dashed #eee" }}>
          {usableCoupons.length === 0 && couponsLoading === false && memberCoupons.length === 0 && (
            <div style={{ fontSize: 12, color: "#999" }}>目前沒有可使用的優惠券</div>
          )}
          {usableCoupons.length === 0 && memberCoupons.length > 0 && (
            <div style={{ fontSize: 12, color: "#999" }}>目前商品金額還沒達到任何優惠券的使用門檻</div>
          )}
          {usableCoupons.map((mc) => {
            const isSelected = !!selectedCoupons.find((c) => c.id === mc.id);
            const wouldViolateStack = !isSelected && !canAddCoupon(mc.coupon, selectedCoupons);
            return (
              <label
                key={mc.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 0",
                  fontSize: 13,
                  cursor: wouldViolateStack ? "not-allowed" : "pointer",
                  opacity: wouldViolateStack ? 0.4 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  disabled={wouldViolateStack}
                  onChange={() => toggleCoupon(mc)}
                />
                <span style={{ flex: 1 }}>
                  {mc.coupon.name}
                  {mc.coupon.stackable && <span style={{ marginLeft: 6, fontSize: 10, color: "#2e7d32" }}>可疊加</span>}
                  {wouldViolateStack && <span style={{ marginLeft: 6, fontSize: 11, color: "#bbb" }}>（已選其他券，無法同時使用）</span>}
                </span>
                <span style={{ color: "#c0392b", fontWeight: 700 }}>
                  {mc.coupon.discount_type === "percent" ? `${mc.coupon.discount_value}折` : `-NT$${mc.coupon.discount_value}`}
                </span>
              </label>
            );
          })}
        </div>
      )}

      {discountAmount > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0 10px", fontSize: 13, color: "#c0392b" }}>
          <span>優惠券折抵</span>
          <span>-NT${discountAmount}</span>
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "10px 0",
          fontSize: 16,
          fontWeight: 700,
          borderTop: "1px solid #f0f0f0",
        }}
      >
        <span>應付金額</span>
        <span style={{ color: "#c0392b" }}>NT${grandTotal}</span>
      </div>

      {/* 訂購人/收件資訊 */}
      <div style={{ borderTop: "1px solid #f0f0f0", paddingTop: 16, marginTop: 4 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>
          訂購人資訊{user && <span style={{ fontSize: 11, color: "#999", fontWeight: 400 }}>（已登入，資料已自動帶入，可修改）</span>}
        </h2>

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

        {shipMethodsLoading ? (
          <div style={{ color: "#999", fontSize: 13, marginBottom: 12 }}>載入配送方式中...</div>
        ) : (
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            {shipMethods.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSelectShipMethod(m)}
                style={{
                  flex: "1 1 30%",
                  minWidth: 100,
                  padding: "10px 6px",
                  borderRadius: 6,
                  border: customerInfo.shipMethodId === m.id ? "2px solid #222" : "1px solid #ddd",
                  background: customerInfo.shipMethodId === m.id ? "#222" : "#fff",
                  color: customerInfo.shipMethodId === m.id ? "#fff" : "#333",
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        {selectedMethod?.method_type === "home_delivery" && (
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

        {selectedMethod?.method_type === "cvs" && (
          <div style={{ marginBottom: 8 }}>
            {cvsStore ? (
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 6,
                  padding: "10px 12px",
                  fontSize: 13,
                  background: "#fafafa",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {cvsStore.carrier}　{cvsStore.storeName}
                </div>
                <div style={{ color: "#666", marginBottom: 8 }}>{cvsStore.address}</div>
                <button
                  type="button"
                  onClick={() => handleChooseStore(selectedMethod)}
                  style={{
                    background: "none",
                    border: "1px solid #999",
                    borderRadius: 6,
                    padding: "6px 12px",
                    fontSize: 12,
                    color: "#333",
                    cursor: "pointer",
                  }}
                >
                  重新選擇門市
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => handleChooseStore(selectedMethod)}
                style={{
                  width: "100%",
                  padding: "12px 0",
                  background: "#fff",
                  border: "1px solid #222",
                  borderRadius: 6,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#222",
                  cursor: "pointer",
                }}
              >
                📍 選擇取貨門市
              </button>
            )}
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
