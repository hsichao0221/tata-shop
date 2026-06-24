import { useEffect, useState } from "react";
import { fetchPages, fetchCategories, resolveBlockProducts } from "../supabase.js";
import PageBlocksRenderer from "../components/PageBlocks.jsx";

// 首頁現在是「頁面清單」裡被標記為isHomepage的那一頁，不再是獨立的特殊系統，
// 跟Shopline的設計一致：首頁只是「被指定為預設主頁」的其中一個頁面。
// 編輯都在ERP後台的「網店設計」進行，這裡只負責讀取後渲染。
export default function HomePage() {
  const [blocks, setBlocks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [blockProducts, setBlockProducts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchPages(), fetchCategories()])
      .then(async ([pages, cats]) => {
        const homePage = pages.find((p) => p.isHomepage) || pages[0];
        const enabledBlocks = (homePage?.blocks || []).filter((b) => b.enabled !== false);
        setCategories(cats);
        setBlocks(enabledBlocks);
        setBlockProducts(await resolveBlockProducts(enabledBlocks, cats));
        setLoading(false);
      })
      .catch((e) => {
        console.error("讀取首頁失敗:", e);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80, color: "#999" }}>載入中...</div>;
  }

  return <PageBlocksRenderer blocks={blocks} categories={categories} blockProducts={blockProducts} />;
}
