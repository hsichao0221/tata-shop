import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCategories } from "../supabase.js";

// 分類導覽選單：讀取 shop_categories 設定，依 order 排序，
// 只顯示 showInMenu 為 true 的項目，依分類點擊後導向 /products?category=分類id，
// 讓 ProductListPage 之後可以依照網址參數，套用對應的篩選條件。
export default function CategoryNav() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div
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
          to={c.id === "all" ? "/products" : `/products?category=${c.id}`}
          style={{
            textDecoration: "none",
            color: "#444",
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {c.label}
        </Link>
      ))}
    </div>
  );
}
