import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFeaturedProducts } from "../supabase.js";
import ProductCard from "../components/ProductCard.jsx";

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // 首頁只抓「精選新品」這一小批，不抓全部商品，避免首頁載入過慢
    fetchFeaturedProducts(12)
      .then((items) => {
        setProducts(items);
        setLoading(false);
      })
      .catch((e) => {
        console.error("讀取商品失敗:", e);
        setError("商品載入失敗，請稍後再試");
        setLoading(false);
      });
  }, []);

  return (
    <div>
      {/* 品牌主視覺區塊 */}
      <div
        style={{
          textAlign: "center",
          padding: "48px 16px",
          background: "#fafafa",
          marginBottom: 32,
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: 3, margin: 0 }}>
          TATA
        </h1>
        <p style={{ color: "#888", fontSize: 14, marginTop: 8 }}>
          台灣女裝童裝品牌・全館2件9折 滿2500折100
        </p>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px 60px" }}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 700,
            textAlign: "center",
            marginBottom: 24,
            letterSpacing: 1,
          }}
        >
          New Arrivals
        </h2>

        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
            載入中...
          </div>
        )}

        {error && (
          <div style={{ textAlign: "center", padding: 60, color: "#c0392b" }}>
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: 16,
              }}
            >
              {products.map((p) => (
                <ProductCard key={p.id || p.sku} product={p} />
              ))}
            </div>

            {products.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
                目前尚無上架商品
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: 32 }}>
              <Link
                to="/products"
                style={{
                  display: "inline-block",
                  padding: "12px 32px",
                  border: "1px solid #222",
                  color: "#222",
                  textDecoration: "none",
                  fontSize: 13,
                  letterSpacing: 1,
                }}
              >
                查看更多
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
