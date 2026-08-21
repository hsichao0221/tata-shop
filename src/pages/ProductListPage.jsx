import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchAllProducts, fetchCategories, filterProductsByCategory, filterActiveProducts } from "../supabase.js";
import ProductCard from "../components/ProductCard.jsx";
import CategoryNav from "../components/CategoryNav.jsx";

const PAGE_SIZE = 30;

const SORT_OPTIONS = [
  { value: "newest", label: "最新上架" },
  { value: "default", label: "商品原始順序" },
  { value: "price_asc", label: "價格低到高" },
  { value: "price_desc", label: "價格高到低" },
];

// 判斷商品是否還有庫存：任何一個款式還有庫存(qty>0且沒被標記斷貨)，就算是有庫存。
// 沒有任何款式資料的商品(舊資料/單一商品無款式)，預設視為有庫存，避免誤判成缺貨。
function isInStock(product) {
  if (!Array.isArray(product.variants) || product.variants.length === 0) return true;
  return product.variants.some((v) => !v.discontinued && Number(v.qty) > 0);
}

// 排序函式：newest 用 createdAt(沒有的舊商品視為最舊，排在最後面，不會出錯或消失)
function sortProducts(products, sortBy) {
  const list = [...products];
  if (sortBy === "newest") {
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } else if (sortBy === "price_asc") {
    list.sort((a, b) => (a.salePrice ?? a.price ?? 0) - (b.salePrice ?? b.price ?? 0));
  } else if (sortBy === "price_desc") {
    list.sort((a, b) => (b.salePrice ?? b.price ?? 0) - (a.salePrice ?? a.price ?? 0));
  }
  // 缺貨商品一律排到最後，不管顧客選的是哪一種排序方式，這一層都會套用在最上面，
  // 避免顧客點進一堆缺貨商品覺得沒東西可買，把還有貨的商品優先呈現出來
  list.sort((a, b) => (isInStock(a) === isInStock(b) ? 0 : isInStock(a) ? -1 : 1));
  return list;
}

export default function ProductListPage() {
  const [searchParams] = useSearchParams();
  const categoryId = searchParams.get("category");

  const [allProducts, setAllProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sortBy, setSortBy] = useState("newest");

  useEffect(() => {
    Promise.all([fetchAllProducts(), fetchCategories()])
      .then(([products, cats]) => {
        // 暫時偵錯用：確認商品資料到底有沒有抓到、篩選前後數量對不對，
        // 排查完「官網看不到新商品」這個問題後會移除
        console.log("[偵錯] 原始商品總數:", products.length);
        console.log("[偵錯] 有沒有T2F-S10036系列:", products.filter(p=>(p.sku||"").includes("T2F-S10036")||(p.name||"").includes("T2F-S10036")));
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

  // 切換分類或搜尋字時，重新從頭顯示，不延續上一個分類的「已顯示數量」
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [categoryId, searchParams.get("q")]);

  // 依網址上的 category 參數，找到對應的分類定義；找不到就視為「全部」，
  // filterProductsByCategory 在找不到分類定義時本身也有 fallback 回傳全部上架商品，雙重保險
  const activeCategory = categories.find((c) => c.id === categoryId);
  const searchQuery = (searchParams.get("q") || "").trim();
  // 有搜尋字的話，用商品名稱/貨號模糊比對(不分大小寫)，取代原本的分類篩選；
  // 沒有搜尋字才照原本邏輯依分類篩選。搜尋結果一樣會套用缺貨排最後等排序規則。
  const baseFiltered = searchQuery
    ? filterActiveProducts(allProducts).filter((p) => {
        const kw = searchQuery.toLowerCase();
        return (
          (p.name || "").toLowerCase().includes(kw) ||
          (p.sku || "").toLowerCase().includes(kw) ||
          (p.variants || []).some((v) => (v.sku || "").toLowerCase().includes(kw))
        );
      })
    : filterProductsByCategory(allProducts, activeCategory);
  const filteredProducts = sortProducts(baseFiltered, sortBy);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProducts.length;
  const pageTitle = searchQuery ? `搜尋「${searchQuery}」的結果` : (activeCategory?.label || "所有商品");

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px 60px", display: "flex", gap: 24 }}>
      {/* 分類側邊欄：桌機sticky在左側，手機版變成右下角浮動按鈕，detail邏輯都在CategoryNav元件內 */}
      <CategoryNav />

      <div style={{ flex: 1, minWidth: 0 }}>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 8 }}>
              <div style={{ color: "#999", fontSize: 13 }}>
                共 {filteredProducts.length} 件商品上架中
              </div>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ padding: "6px 10px", fontSize: 13, border: "1px solid #ddd", borderRadius: 4, background: "#fff", color: "#333", cursor: "pointer" }}
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
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
    </div>
  );
}
