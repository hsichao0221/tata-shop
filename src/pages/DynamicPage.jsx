import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchPages, fetchCategories, resolveBlockProducts } from "../supabase.js";
import PageBlocksRenderer from "../components/PageBlocks.jsx";

// 任何自訂頁面（網址 /pages/:slug）都會走這個元件，對應ERP後台「網店設計」頁面清單裡
// 除了首頁以外的其他頁面。進階分頁用跟首頁同一套區塊渲染器；文字分頁用簡單的標題+內文版面。
export default function DynamicPage() {
  const { slug } = useParams();
  const [page, setPage] = useState(null);
  const [categories, setCategories] = useState([]);
  const [blockProducts, setBlockProducts] = useState({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    Promise.all([fetchPages(), fetchCategories()])
      .then(async ([pages, cats]) => {
        const found = pages.find((p) => p.slug === slug && p.enabled !== false);
        if (!found) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        setPage(found);
        setCategories(cats);
        if (found.type === "advanced") {
          const enabledBlocks = (found.blocks || []).filter((b) => b.enabled !== false);
          setBlockProducts(await resolveBlockProducts(enabledBlocks, cats));
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error("讀取頁面失敗:", e);
        setLoading(false);
      });
  }, [slug]);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80, color: "#999" }}>載入中...</div>;
  }

  if (notFound) {
    return (
      <div style={{ textAlign: "center", padding: 80 }}>
        <div style={{ color: "#999", marginBottom: 16 }}>找不到這個頁面</div>
        <Link to="/" style={{ color: "#222", textDecoration: "underline", fontSize: 13 }}>
          回到首頁
        </Link>
      </div>
    );
  }

  if (page.type === "advanced") {
    const enabledBlocks = (page.blocks || []).filter((b) => b.enabled !== false);
    return <PageBlocksRenderer blocks={enabledBlocks} categories={categories} blockProducts={blockProducts} />;
  }

  // 文字分頁：簡單的標題+內文呈現，適合條款/關於我們這類純文字內容
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 16px" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, textAlign: "center" }}>{page.title}</h1>
      {page.textContent?.imageUrl && (
        <img
          src={page.textContent.imageUrl}
          alt=""
          style={{ width: "100%", borderRadius: 6, marginBottom: 24, display: "block" }}
        />
      )}
      {page.textContent?.body && (
        <div style={{ color: "#444", fontSize: 14, lineHeight: 2, whiteSpace: "pre-wrap" }}>
          {page.textContent.body}
        </div>
      )}
    </div>
  );
}
