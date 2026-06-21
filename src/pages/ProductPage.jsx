import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchAllProducts } from "../supabase.js";

export default function ProductPage() {
  const { sku } = useParams();
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVariant, setSelectedVariant] = useState(null);

  useEffect(() => {
    fetchAllProducts().then((all) => {
      const found = all.find((p) => p.sku === sku);
      setProduct(found || null);
      setLoading(false);
    });
  }, [sku]);

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
          {product.images?.[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            "無圖片"
          )}
        </div>

        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
            {product.name}
          </h1>
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
            disabled={variants.length > 0 && !selectedVariant}
            style={{
              width: "100%",
              padding: "14px 0",
              background:
                variants.length > 0 && !selectedVariant ? "#ddd" : "#222",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              fontSize: 15,
              fontWeight: 700,
              cursor:
                variants.length > 0 && !selectedVariant ? "not-allowed" : "pointer",
            }}
          >
            加入購物車
          </button>

          {availableVariants.length === 0 && variants.length > 0 && (
            <div style={{ color: "#c0392b", fontSize: 12, marginTop: 8, textAlign: "center" }}>
              此商品目前全部款式缺貨
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
