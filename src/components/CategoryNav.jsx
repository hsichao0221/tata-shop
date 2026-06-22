import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCategories } from "../supabase.js";

// 分類導覽選單：讀取 shop_categories 設定，依 order 排序，
// 只顯示 showInMenu 為 true 的項目，依分類點擊後導向 /products?category=分類id，
// 讓 ProductListPage 之後可以依照網址參數，套用對應的篩選條件。
//
// 響應式設計：桌面版（≥768px）顯示橫向選單列；
// 手機版（<768px）改成漢堡選單icon，點擊後從左側滑出垂直清單，
// 參考TATA現有官網（tata-style.com）手機版的呈現方式。
export default function CategoryNav() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    fetchCategories()
      .then((list) => {
        const menuItems = (list || [])
          .filter((c) => c.showInMenu)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        setCategories(menuItems);
        setLoading(false);
      })
      .catch((e) => {
        console.warn("讀取分類選單失敗:", e);
        setLoading(false);
      });
  }, []);

  // 讀取中或讀取失敗時，不顯示任何東西，不影響 NavBar 其他部分正常運作
  if (loading || categories.length === 0) return null;

  const linkTo = (c) => (c.id === "all" ? "/products" : `/products?category=${c.id}`);

  return (
    <>
      {/* 桌面版：橫向選單列。用 CSS class 搭配 media query 控制顯示/隱藏，
          避免用 JS 判斷視窗寬度（之前處理 ERP 系統時學到，CSS 方式更穩定可靠）。*/}
      <div
        className="category-nav-desktop"
        style={{
          display: "flex",
          gap: 18,
          padding: "8px 20px",
          borderBottom: "1px solid #f0f0f0",
          overflowX: "auto",
          whiteSpace: "nowrap",
        }}
      >
        {categories.map((c) => (
          <Link
            key={c.id}
            to={linkTo(c)}
            style={{ textDecoration: "none", color: "#444", fontSize: 13, flexShrink: 0 }}
          >
            {c.label}
          </Link>
        ))}
      </div>

      {/* 手機版：漢堡選單icon */}
      <div
        className="category-nav-mobile-bar"
        style={{
          display: "none",
          padding: "8px 20px",
          borderBottom: "1px solid #f0f0f0",
        }}
      >
        <button
          onClick={() => setMobileMenuOpen(true)}
          style={{
            background: "none",
            border: "none",
            fontSize: 18,
            cursor: "pointer",
            padding: 0,
          }}
          aria-label="開啟分類選單"
        >
          ☰ 分類
        </button>
      </div>

      {/* 手機版：點擊漢堡icon後，從左側滑出的垂直選單 */}
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
            {categories.map((c) => (
              <Link
                key={c.id}
                to={linkTo(c)}
                onClick={() => setMobileMenuOpen(false)}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "#222",
                  fontSize: 16,
                  padding: "14px 20px",
                  borderBottom: "1px solid #f5f5f5",
                }}
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 767px) {
          .category-nav-desktop { display: none !important; }
          .category-nav-mobile-bar { display: block !important; }
        }
      `}</style>
    </>
  );
}
