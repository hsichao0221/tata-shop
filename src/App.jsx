import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { CartProvider, useCart } from "./CartContext.jsx";
import HomePage from "./pages/HomePage.jsx";
import ProductPage from "./pages/ProductPage.jsx";
import CartPage from "./pages/CartPage.jsx";
import CheckoutPage from "./pages/CheckoutPage.jsx";
import OrderResultPage from "./pages/OrderResultPage.jsx";

function NavBar() {
  const { totalQty } = useCart();
  return (
    <nav
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: "1px solid #eee",
        position: "sticky",
        top: 0,
        background: "#fff",
        zIndex: 10,
      }}
    >
      <Link to="/" style={{ textDecoration: "none", color: "#222", fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>
        TATA
      </Link>
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
    </nav>
  );
}

export default function App() {
  return (
    <CartProvider>
      <BrowserRouter>
        <NavBar />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/products/:sku" element={<ProductPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-result" element={<OrderResultPage />} />
        </Routes>
      </BrowserRouter>
    </CartProvider>
  );
}
