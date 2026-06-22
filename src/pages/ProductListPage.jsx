import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchAllProducts, fetchCategories, filterProductsByCategory } from "../supabase.js";
import ProductCard from "../components/ProductCard.jsx";

const PAGE_SIZE = 30;

export default function ProductListPage() {
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get("category");

  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  useEffect(() => {
    Promise.all([fetchAllProducts(), fetchCategories()])
      .then(([products, cats]) => {
        setAllProducts(products);
        setCategories(cats);
        setLoading(false);
      })
      .catch((e) => {
        console.error("讀取商品失敗:", e);
        setError("商品載入失敗，請稍後再試");
        setLoading(false);
      });
  }, []);

  // 切換分類時，重新從頭顯示，不延續上一個分類的「已顯示數量」
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [categoryId]);

  // 依網址上的 category 參數，找到對應的分類定義；找不到就視為「全部」，
  // filterProductsByCategory 在找不到分類定義時本身也有 fallback 回傳全部上架商品，雙重保險
  const activeCategory = categories.find((c) => c.id === categoryId);
  const filteredProducts = filterProductsByCategory(allProducts, activeCategory);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;
  const pageTitle = activeCategory?.label || "所有商品";

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 60px" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{pageTitle}</h1>

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
            共 {filteredProducts.length} 件商品上架中
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

          {filteredProducts.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
              目前此分類尚無上架商品
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
                載入更多（已顯示 {visibleProducts.length} / {filteredProducts.length}）
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
