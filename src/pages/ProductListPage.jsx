import { useEffect, useState } from "react";
import { fetchAllProducts, filterActiveProducts } from "../supabase.js";
import ProductCard from "../components/ProductCard.jsx";

const PAGE_SIZE = 30;

export default function ProductListPage() {
  const [allProducts, setAllProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    fetchAllProducts()
      .then((all) => {
        setAllProducts(filterActiveProducts(all));
        setLoading(false);
      })
      .catch((e) => {
        console.error("讀取商品失敗:", e);
        setError("商品載入失敗，請稍後再試");
        setLoading(false);
      });
  }, []);

  const visibleProducts = allProducts.slice(0, visibleCount);
  const hasMore = visibleCount < allProducts.length;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 60px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>所有商品</h1>

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
          載入中，商品數量較多，請稍候...
        </div>
      )}

      {error && (
        <div style={{ textAlign: "center", padding: 60, color: "#c0392b" }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div style={{ color: "#999", fontSize: 13, marginBottom: 16 }}>
            共 {allProducts.length} 件商品上架中
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 16,
            }}
          >
            {visibleProducts.map((p) => (
              <ProductCard key={p.id || p.sku} product={p} />
            ))}
          </div>

          {allProducts.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
              目前尚無上架商品
            </div>
          )}

          {hasMore && (
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                style={{
                  padding: "12px 32px",
                  border: "1px solid #222",
                  background: "#fff",
                  color: "#222",
                  fontSize: 13,
                  letterSpacing: 1,
                  cursor: "pointer",
                }}
              >
                載入更多（已顯示 {visibleProducts.length} / {allProducts.length}）
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
