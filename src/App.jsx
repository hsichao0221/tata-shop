import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { useState } from "react";
import { CartProvider, useCart } from "./CartContext.jsx";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import Footer from "./components/Footer.jsx";
import MenuNav from "./components/MenuNav.jsx";
import HomePage from "./pages/HomePage.jsx";
import DynamicPage from "./pages/DynamicPage.jsx";
import ProductListPage from "./pages/ProductListPage.jsx";
import ProductPage from "./pages/ProductPage.jsx";
import CartPage from "./pages/CartPage.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import OrderResultPage from "./pages/OrderResultPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import AccountPage from "./pages/AccountPage.jsx";
import ForgotPasswordPage from "./pages/ForgotPasswordPage.jsx";
import UpdatePasswordPage from "./pages/UpdatePasswordPage.jsx";

// 注意：選單現在統一由MenuNav管理(讀取ERP「網店設計→🧭編輯目錄」的設定)，
// 不再自動列出所有頁面——要顯示在導覽列的頁面，需要在ERP的網店目錄裡手動加進去，
// 這樣才能控制顯示順序、是否要放進下拉群組等。

function NavBar() {
  const { totalQty } = useCart();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <nav
      style={{
        borderBottom: "1px solid #eee",
        position: "sticky",
        top: 0,
        background: "#fff",
        zIndex: 10,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* 手機版漢堡按鈕：點開才看到選單項目，不會跟Logo/購物車擠成一團 */}
          <button
            className="navbar-hamburger"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="開啟選單"
            style={{ display: "none", background: "none", border: "none", fontSize: 22, padding: 0, cursor: "pointer" }}
          >
            ☰
          </button>
          <Link to="/" style={{ textDecoration: "none", color: "#222", fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>
            TATA
          </Link>
        </div>
        <div className="navbar-desktop-items" style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <MenuNav />
          <Link to={user ? "/account" : "/login"} style={{ textDecoration: "none", color: "#222", fontSize: 14 }}>
            {user ? "我的帳戶" : "登入"}
          </Link>
        </div>
        <Link to="/cart" style={{ textDecoration: "none", color: "#222", fontSize: 14, position: "relative" }}>
          🛒 購物車
          {totalQty > 0 && (
            <span
              style={{
                position: "absolute",
                top: -8,
                right: -14,
                background: "#c0392b",
                color: "#fff",
                borderRadius: 10,
                fontSize: 11,
                padding: "1px 6px",
                fontWeight: 700,
              }}
            >
              {totalQty}
            </span>
          )}
        </Link>
      </div>

      {/* 手機版：點漢堡按鈕後展開的選單面板，垂直排列不會擠在一起 */}
      {mobileOpen && (
        <div
          className="navbar-mobile-panel"
          style={{ borderTop: "1px solid #f0f0f0", padding: "12px 20px", display: "flex", flexDirection: "column", gap: 14 }}
        >
          <MenuNav vertical />
          <Link
            to={user ? "/account" : "/login"}
            onClick={() => setMobileOpen(false)}
            style={{ textDecoration: "none", color: "#222", fontSize: 14 }}
          >
            {user ? "我的帳戶" : "登入"}
          </Link>
        </div>
      )}

      <style>{`
        @media (max-width: 767px) {
          .navbar-hamburger { display: block !important; }
          .navbar-desktop-items { display: none !important; }
        }
      `}</style>
    </nav>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <BrowserRouter>
          <NavBar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/pages/:slug" element={<DynamicPage />} />
            <Route path="/products" element={<ProductListPage />} />
            <Route path="/products/:sku" element={<ProductPage />} />
            <Route path="/cart" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/order-result" element={<OrderResultPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/update-password" element={<UpdatePasswordPage />} />
          </Routes>
          <Footer />
        </BrowserRouter>
      </CartProvider>
    </AuthProvider>
  );
}
