import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  fetchHomepageBlocks,
  fetchFeaturedProducts,
  fetchAllProducts,
  fetchCategories,
  filterProductsByCategory,
} from "../supabase.js";
import ProductCard from "../components/ProductCard.jsx";

// 首頁完全交給「首頁編輯器」管理（ERP後台「🏠 首頁編輯」分頁），
// 這個元件只負責「讀取」區塊設定並依序渲染，不應該在這裡寫任何編輯/儲存邏輯——
// 編輯都集中在ERP那邊，跟分類管理、送貨設定同一套架構原則。
export default function HomePage() {
  const [blocks, setBlocks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [blockProducts, setBlockProducts] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchHomepageBlocks(), fetchCategories()])
      .then(async ([blockList, cats]) => {
        const enabledBlocks = (blockList || []).filter((b) => b.enabled !== false);
        setCategories(cats);
        setBlocks(enabledBlocks);

        // 每個「商品輪播」區塊要先把對應的商品資料準備好，
        // 來源是「精選新品」就用輕量版API，是「指定分類」才需要抓完整商品清單來篩選
        const carouselBlocks = enabledBlocks.filter((b) => b.type === "product_carousel");
        if (carouselBlocks.length > 0) {
          const needsFullList = carouselBlocks.some((b) => b.source === "category");
          const allProducts = needsFullList ? await fetchAllProducts() : null;

          const productsMap = {};
          for (const b of carouselBlocks) {
            if (b.source === "category" && b.categoryId) {
              const cat = cats.find((c) => c.id === b.categoryId);
              productsMap[b.id] = filterProductsByCategory(allProducts || [], cat).slice(0, b.limit || 12);
            } else {
              productsMap[b.id] = await fetchFeaturedProducts(b.limit || 12);
            }
          }
          setBlockProducts(productsMap);
        }
        setLoading(false);
      })
      .catch((e) => {
        console.error("讀取首頁區塊失敗:", e);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div style={{ textAlign: "center", padding: 80, color: "#999" }}>載入中...</div>;
  }

  return (
    <div>
      {blocks.map((b) => (
        <HomepageBlock key={b.id} block={b} categories={categories} products={blockProducts[b.id] || []} />
      ))}
      {blocks.length === 0 && (
        <div style={{ textAlign: "center", padding: 80, color: "#999" }}>首頁尚未設定任何內容</div>
      )}
    </div>
  );
}

function HomepageBlock({ block, categories, products }) {
  switch (block.type) {
    case "hero_banner":
      return <HeroBannerBlock block={block} />;
    case "image_row":
      return <ImageRowBlock block={block} />;
    case "category_grid":
      return <CategoryGridBlock block={block} categories={categories} />;
    case "product_carousel":
      return <ProductCarouselBlock block={block} products={products} />;
    case "text_block":
      return <TextBlockSection block={block} />;
    case "spacer":
      return <div style={{ height: block.height || 32 }} />;
    default:
      return null;
  }
}

function HeroBannerBlock({ block }) {
  const h = Number(block.height) || null;
  const content = (
    <div
      style={{
        textAlign: "center",
        padding: h ? "0 16px" : "48px 16px",
        height: h || undefined,
        display: h ? "flex" : "block",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: block.imageUrl ? "#222" : "#fafafa",
        backgroundImage: block.imageUrl ? `url(${block.imageUrl})` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        marginBottom: 32,
        overflow: "hidden",
      }}
    >
      <h1
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: 3,
          margin: 0,
          color: block.imageUrl ? "#fff" : "#222",
        }}
      >
        {block.title}
      </h1>
      {block.subtitle && (
        <p style={{ color: block.imageUrl ? "#eee" : "#888", fontSize: 14, marginTop: 8 }}>{block.subtitle}</p>
      )}
    </div>
  );
  return block.linkUrl ? (
    <Link to={block.linkUrl} style={{ textDecoration: "none", display: "block" }}>
      {content}
    </Link>
  ) : (
    content
  );
}

function ImageRowBlock({ block }) {
  const images = (block.images || []).filter((img) => img.imageUrl);
  if (images.length === 0) return null;
  const ratio = block.ratio || "1:1";
  const aspect = ratio === "auto" ? undefined : ratio.replace(":", "/");
  return (
    <div style={{ display: "flex", gap: 8, padding: "0 16px", marginBottom: 32, maxWidth: 1200, margin: "0 auto 32px" }}>
      {images.map((img, i) => {
        const inner = (
          <div style={{ position: "relative" }}>
            <img
              src={img.imageUrl}
              alt={img.caption || ""}
              style={{ width: "100%", aspectRatio: aspect, objectFit: "cover", display: "block", borderRadius: 4 }}
            />
            {img.caption && (
              <div
                style={{
                  position: "absolute",
                  bottom: 8,
                  left: 8,
                  color: "#fff",
                  fontSize: 12,
                  textShadow: "0 1px 3px rgba(0,0,0,0.7)",
                }}
              >
                {img.caption}
              </div>
            )}
          </div>
        );
        return (
          <div key={i} style={{ flex: 1, minWidth: 0 }}>
            {img.linkUrl ? <Link to={img.linkUrl}>{inner}</Link> : inner}
          </div>
        );
      })}
    </div>
  );
}

function CategoryGridBlock({ block, categories }) {
  const ids = (block.categoryIds || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const items = ids.map((id) => categories.find((c) => c.id === id)).filter(Boolean);
  if (items.length === 0) return null;
  const columns = block.columns || 4;
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto 32px", padding: "0 16px" }}>
      {block.title && (
        <h2 style={{ fontSize: 16, fontWeight: 700, textAlign: "center", marginBottom: 16, letterSpacing: 1 }}>
          {block.title}
        </h2>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 10 }}>
        {items.map((cat) => (
          <Link
            key={cat.id}
            to={`/products?category=${cat.id}`}
            style={{
              display: "block",
              textAlign: "center",
              padding: "16px 8px",
              background: "#fafafa",
              borderRadius: 6,
              textDecoration: "none",
              color: "#333",
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {cat.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ProductCarouselBlock({ block, products }) {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto 32px", padding: "0 16px" }}>
      {block.title && (
        <h2 style={{ fontSize: 18, fontWeight: 700, textAlign: "center", marginBottom: 24, letterSpacing: 1 }}>
          {block.title}
        </h2>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
        {products.map((p) => (
          <ProductCard key={p.id || p.sku} product={p} />
        ))}
      </div>
      {products.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>目前尚無符合的商品</div>
      )}
      <div style={{ textAlign: "center", marginTop: 32 }}>
        <Link
          to={block.source === "category" && block.categoryId ? `/products?category=${block.categoryId}` : "/products"}
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
    </div>
  );
}

function TextBlockSection({ block }) {
  return (
    <div
      style={{
        maxWidth: 800,
        margin: "0 auto 32px",
        padding: "0 16px",
        textAlign: block.align === "left" ? "left" : "center",
      }}
    >
      {block.title && <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>{block.title}</h2>}
      {block.body && (
        <p style={{ color: "#555", fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-wrap" }}>{block.body}</p>
      )}
    </div>
  );
}
