import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchCategories } from "../supabase.js";

// 分類導覽：只在商品列表頁(ProductListPage)使用，不是全站都顯示，避免跟頭部MenuNav的選單重複。
// 桌面版：左側sticky側邊欄，滾動商品列表時側邊欄會跟著黏住，不用滑回最上面才能切換分類。
// 手機版：右下角浮動按鈕，同樣固定位置(position:fixed)，滾動到哪都點得到，點開後從左側滑出選單。
export default function CategoryNav() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const activeId = searchParams.get("category") || "all";

  useEffect(() => {
    fetchCategories()
      .then((list) => {
        const menuItems = (list || [])
          .filter((c) => c.showInMenu !== false)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        setCategories(menuItems);
        setLoading(false);
      })
      .catch((e) => {
        console.warn("讀取分類選單失敗:", e);
        setLoading(false);
      });
  }, []);

  if (loading || categories.length === 0) return null;

  const linkTo = (c) => (c.id === "all" ? "/products" : `/products?category=${c.id}`);

  return (
    <>
      {/* 桌面版：左側sticky側邊欄 */}
      <div
        className="category-nav-desktop"
        style={{
          position: "sticky",
          top: 16,
          alignSelf: "flex-start",
          width: 160,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {categories.map((c) => {
          const isActive = c.id === activeId;
          return (
            <Link
              key={c.id}
              to={linkTo(c)}
              style={{
                textDecoration: "none",
                color: isActive ? "#fff" : "#444",
                background: isActive ? "#222" : "transparent",
                fontSize: 13,
                padding: "8px 12px",
                borderRadius: 6,
                fontWeight: isActive ? 700 : 400,
              }}
            >
              {c.label}
            </Link>
          );
        })}
      </div>

      {/* 手機版：右下角浮動按鈕，固定位置不會隨頁面滾動跑掉 */}
      <button
        className="category-nav-mobile-fab"
        onClick={() => setMobileMenuOpen(true)}
        aria-label="開啟分類選單"
        style={{
          display: "none",
          position: "fixed",
          right: 16,
          bottom: 24,
          zIndex: 90,
          background: "#222",
          color: "#fff",
          border: "none",
          borderRadius: 24,
          padding: "12px 18px",
          fontSize: 14,
          fontWeight: 700,
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          cursor: "pointer",
        }}
      >
        ☰ 分類
      </button>

      {/* 手機版：點擊浮動按鈕後，從左側滑出的垂直選單 */}
      {mobileMenuOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 100,
          }}
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: "80%",
              maxWidth: 320,
              background: "#fff",
              overflowY: "auto",
              padding: "16px 0",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 16px 8px" }}>
              <button
                onClick={() => setMobileMenuOpen(false)}
                style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer" }}
                aria-label="關閉選單"
              >
                ×
              </button>
            </div>
            {categories.map((c) => {
              const isActive = c.id === activeId;
              return (
                <Link
                  key={c.id}
                  to={linkTo(c)}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    display: "block",
                    textDecoration: "none",
                    color: isActive ? "#fff" : "#222",
                    background: isActive ? "#222" : "transparent",
                    fontSize: 16,
                    padding: "14px 20px",
                    borderBottom: "1px solid #f5f5f5",
                  }}
                >
                  {c.label}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 767px) {
          .category-nav-desktop { display: none !important; }
          .category-nav-mobile-fab { display: block !important; }
        }
      `}</style>
    </>
  );
}
