import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchAllProducts } from "../supabase.js";
import { useCart } from "../CartContext.jsx";

// 依商品資料設定頁面SEO(title/description/keywords)。
// 有填seoTitle/seoDescription/seoKeywords就用客戶自己填的，沒填就自動退回商品名稱/描述前150字，
// 確保沒有特別去後台設定SEO的商品，頁面還是有基本的meta資訊，不會是空的。
function useProductSeo(product) {
  useEffect(() => {
    if (!product) return;
    const prevTitle = document.title;
    const title = product.seoTitle || product.name;
    document.title = title ? `${title} | TATA` : document.title;

    const desc = product.seoDescription || product.summary || (product.description || "").slice(0, 150);
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) { metaDesc = document.createElement("meta"); metaDesc.setAttribute("name", "description"); document.head.appendChild(metaDesc); }
    const prevDesc = metaDesc.getAttribute("content");
    if (desc) metaDesc.setAttribute("content", desc);

    let metaKw = document.querySelector('meta[name="keywords"]');
    if (product.seoKeywords) {
      if (!metaKw) { metaKw = document.createElement("meta"); metaKw.setAttribute("name", "keywords"); document.head.appendChild(metaKw); }
      metaKw.setAttribute("content", product.seoKeywords);
    }

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.setAttribute("content", prevDesc);
    };
  }, [product]);
}

export default function ProductPage() {
  const { sku } = useParams();
  const { addItem } = useCart();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [justAdded, setJustAdded] = useState(false);
  const [activeImg, setActiveImg] = useState(0);

  useProductSeo(product);

  useEffect(() => {
    fetchAllProducts().then((all) => {
      const found = all.find((p) => p.sku === sku);
      setProduct(found || null);
      setLoading(false);
    });
  }, [sku]);

  useEffect(() => {
    setActiveImg(0);
  }, [sku]);

  function handleAddToCart() {
    if (!product) return;
    addItem(product, selectedVariant);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
  }

  if (loading) {
    return <div style={{ textAlign: "center", padding: 60, color: "#999" }}>載入中...</div>;
  }

  if (!product) {
    return (
      <div style={{ textAlign: "center", padding: 60 }}>
        <div style={{ color: "#999", marginBottom: 16 }}>找不到這個商品</div>
        <Link to="/" style={{ color: "#c0392b" }}>返回首頁</Link>
      </div>
    );
  }

  const variants = product.variants || [];
  const availableVariants = variants.filter((v) => !v.discontinued && v.qty > 0);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <Link to="/" style={{ color: "#999", fontSize: 13, textDecoration: "none" }}>
        ← 返回商品列表
      </Link>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
          marginTop: 16,
        }}
      >
        <div>
          <div
            style={{
              aspectRatio: "3/4",
              background: "#f5f5f5",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ccc",
              overflow: "hidden",
              borderRadius: 8,
            }}
          >
            {product.images?.[activeImg] ? (
              <img
                src={product.images[activeImg]}
                alt={(product.imageAlts && product.imageAlts[activeImg]) || product.name}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              "無圖片"
            )}
          </div>
          {product.images && product.images.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              {product.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  style={{
                    width: 56, height: 56, padding: 0, overflow: "hidden",
                    borderRadius: 6, cursor: "pointer",
                    border: activeImg === i ? "2px solid #c0392b" : "1px solid #ddd",
                    background: "#f5f5f5",
                  }}
                >
                  <img
                    src={img}
                    alt={(product.imageAlts && product.imageAlts[i]) || `${product.name} ${i + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
            {product.name}
          </h1>
          {product.summary && (
            <div style={{ color: "#666", fontSize: 13, marginBottom: 8, lineHeight: 1.5 }}>
              {product.summary}
            </div>
          )}
          <div style={{ color: "#999", fontSize: 12, marginBottom: 16 }}>
            貨號：{product.sku}
          </div>

          <div style={{ marginBottom: 20, display: "flex", alignItems: "baseline", gap: 10 }}>
            {product.salePrice ? (
              <>
                <span style={{ fontSize: 24, fontWeight: 700, color: "#c0392b" }}>
                  NT${product.salePrice}
                </span>
                <span style={{ fontSize: 15, color: "#999", textDecoration: "line-through" }}>
                  NT${product.price}
                </span>
              </>
            ) : (
              <span style={{ fontSize: 24, fontWeight: 700 }}>
                NT${product.price}
              </span>
            )}
          </div>

          {variants.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: "#666", marginBottom: 8 }}>選擇款式</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {variants.map((v) => {
                  const isAvailable = !v.discontinued && v.qty > 0;
                  const isSelected = selectedVariant === v.name;
                  return (
                    <button
                      key={v.name}
                      disabled={!isAvailable}
                      onClick={() => setSelectedVariant(v.name)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 6,
                        border: isSelected ? "2px solid #c0392b" : "1px solid #ddd",
                        background: isAvailable ? "#fff" : "#f5f5f5",
                        color: isAvailable ? "#333" : "#bbb",
                        cursor: isAvailable ? "pointer" : "not-allowed",
                        fontSize: 13,
                        textDecoration: isAvailable ? "none" : "line-through",
                      }}
                    >
                      {v.name}
                      {!isAvailable && "（缺貨）"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            disabled={(variants.length > 0 && !selectedVariant) || justAdded}
            onClick={handleAddToCart}
            style={{
              width: "100%",
              padding: "14px 0",
              background: justAdded
                ? "#27ae60"
                : variants.length > 0 && !selectedVariant
                ? "#ddd"
                : "#222",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 15,
              fontWeight: 700,
              cursor:
                variants.length > 0 && !selectedVariant ? "not-allowed" : "pointer",
              transition: "background 0.2s",
            }}
          >
            {justAdded ? "✓ 已加入購物車" : "加入購物車"}
          </button>

          {availableVariants.length === 0 && variants.length > 0 && (
            <div style={{ color: "#c0392b", fontSize: 12, marginTop: 8, textAlign: "center" }}>
              此商品目前全部款式缺貨
            </div>
          )}
        </div>
      </div>

      {product.description && (
        <div style={{ marginTop: 40, paddingTop: 24, borderTop: "1px solid #eee" }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>商品描述</h2>
          <div style={{ color: "#444", fontSize: 14, lineHeight: 1.9 }}>
            {product.description.split("\n").map((line, i) =>
              line.trim() ? <p key={i} style={{ margin: "0 0 10px" }}>{line}</p> : <br key={i} />
            )}
          </div>
        </div>
      )}

      {product.moreImages && product.moreImages.length > 0 && (
        <div style={{ marginTop: 40, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
          {product.moreImages.map((img, i) => (
            <img
              key={i}
              src={img}
              alt={(product.moreImageAlts && product.moreImageAlts[i]) || `${product.name} 細節圖 ${i + 1}`}
              style={{ width: "100%", display: "block", marginBottom: 16, borderRadius: 4 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
