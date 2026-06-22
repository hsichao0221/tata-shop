import { Link } from "react-router-dom";

export default function ProductCard({ product }) {
  return (
    <Link
      to={`/products/${product.sku}`}
      style={{ textDecoration: "none", color: "inherit" }}
    >
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 8,
          overflow: "hidden",
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
            fontSize: 12,
            overflow: "hidden",
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
        <div style={{ padding: "8px 10px" }}>
          <div
            style={{
              fontSize: 13,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {product.name}
          </div>
          <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 6 }}>
            {product.salePrice ? (
              <>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#c0392b" }}>
                  NT${product.salePrice}
                </span>
                <span style={{ fontSize: 12, color: "#999", textDecoration: "line-through" }}>
                  NT${product.price}
                </span>
              </>
            ) : (
              <span style={{ fontSize: 14, fontWeight: 700 }}>NT${product.price}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
