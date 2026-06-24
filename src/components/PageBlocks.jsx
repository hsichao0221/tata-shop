import { Link } from "react-router-dom";
import ProductCard from "./ProductCard.jsx";

// 共用的區塊渲染器：首頁跟任何自訂頁面（/pages/:slug）都呼叫這個元件來顯示區塊內容，
// 避免同一套區塊類型的渲染邏輯在多個頁面元件裡重複維護。
// 編輯都在ERP後台的「網店設計」進行，這裡只負責「讀取後渲染」。
export default function PageBlocksRenderer({ blocks, categories, blockProducts }) {
  return (
    <div>
      {blocks.map((b) => (
        <PageBlock key={b.id} block={b} categories={categories} products={blockProducts[b.id] || []} />
      ))}
      {blocks.length === 0 && (
        <div style={{ textAlign: "center", padding: 80, color: "#999" }}>這個頁面尚未設定任何內容</div>
      )}
    </div>
  );
}

function PageBlock({ block, categories, products }) {
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

const RATIO_MAP = { portrait: "3/4", square: "1/1", landscape: "4/3", auto: undefined };

function ImageRowBlock({ block }) {
  const images = (block.images || []).filter((img) => img.imageUrl);
  if (images.length === 0) return null;

  // 向下相容：舊資料只有單一ratio欄位(用"寬:高"字串格式)時，轉換成新的桌機/手機分開格式
  const legacy = block.ratio
    ? block.ratio === "auto"
      ? "auto"
      : block.ratio === "3:4" || block.ratio === "2:3"
      ? "portrait"
      : block.ratio === "1:1"
      ? "square"
      : "landscape"
    : null;
  const ratioDesktop = RATIO_MAP[block.ratioDesktop || legacy || "square"];
  const ratioMobile = RATIO_MAP[block.ratioMobile || legacy || "square"];
  const perRowDesktop = Math.max(1, Math.min(block.perRowDesktop || 3, images.length));
  const perRowMobile = Math.max(1, Math.min(block.perRowMobile || 2, images.length));
  const justify = block.textAlign === "left" ? "flex-start" : block.textAlign === "right" ? "flex-end" : "center";
  const alignV = block.verticalAlign === "top" ? "flex-start" : block.verticalAlign === "middle" ? "center" : "flex-end";
  const cls = `ir-${block.id}`;

  return (
    <div
      className={cls}
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${perRowDesktop}, 1fr)`,
        gap: 8,
        maxWidth: 1200,
        margin: "0 auto 32px",
        padding: `${block.marginTop || 0}px ${block.marginRight || 16}px 0 ${block.marginLeft || 16}px`,
      }}
    >
      {images.map((img, i) => {
        const inner = (
          <div className={`${cls}-img`} style={{ position: "relative" }}>
            <img
              src={img.imageUrl}
              alt={img.caption || ""}
              style={{ width: "100%", aspectRatio: ratioDesktop, objectFit: "cover", display: "block", borderRadius: 4 }}
            />
            {img.caption && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: alignV,
                  alignItems: justify,
                  padding: 16,
                }}
              >
                <div style={{ color: "#fff", fontSize: 13, textShadow: "0 1px 3px rgba(0,0,0,0.7)", textAlign: block.textAlign || "center" }}>
                  {img.caption}
                </div>
              </div>
            )}
          </div>
        );
        return <div key={i}>{img.linkUrl ? <Link to={img.linkUrl}>{inner}</Link> : inner}</div>;
      })}
      {/* 手機螢幕用真正的CSS media query切換成手機版的每排張數跟比例，桌機/手機可以設定成不同樣式 */}
      <style>{`
        @media (max-width: 767px) {
          .${cls} { grid-template-columns: repeat(${perRowMobile}, 1fr) !important; }
          .${cls}-img img { aspect-ratio: ${ratioMobile || "auto"} !important; }
        }
      `}</style>
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
