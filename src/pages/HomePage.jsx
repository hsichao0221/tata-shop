import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchAllProducts, filterActiveProducts } from "../supabase.js";

export default function HomePage() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchAllProducts()
      .then((all) => {
        const active = filterActiveProducts(all);
        setProducts(active);
        setLoading(false);
      })
      .catch((e) => {
        console.error("讀取商品失敗:", e);
        setError("商品載入失敗，請稍後再試");
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 16px" }}>
      <header style={{ padding: "24px 0", textAlign: "center" }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, letterSpacing: 2, margin: 0 }}>
          TATA
        </h1>
        <p style={{ color: "#888", fontSize: 13, marginTop: 4 }}>
          台灣女裝童裝品牌
        </p>
      </header>

      {loading && (
        <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
          載入中...
        </div>
      )}

      {error && (
        <div style={{ textAlign: "center", padding: 60, color: "#c0392b" }}>
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div style={{ color: "#999", fontSize: 13, marginBottom: 16 }}>
            共 {products.length} 件商品上架中
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: 16,
              paddingBottom: 40,
            }}
          >
            {products.map((p) => (
              <Link
                key={p.id || p.sku}
                to={`/products/${p.sku}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 8,
                    overflow: "hidden",
                    transition: "box-shadow 0.2s",
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
                    {p.images?.[0] ? (
                      <img
                        src={p.images[0]}
                        alt={p.name}
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
                      {p.name}
                    </div>
                    <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 6 }}>
                      {p.salePrice ? (
                        <>
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#c0392b" }}>
                            NT${p.salePrice}
                          </span>
                          <span
                            style={{
                              fontSize: 12,
                              color: "#999",
                              textDecoration: "line-through",
                            }}
                          >
                            NT${p.price}
                          </span>
                        </>
                      ) : (
                        <span style={{ fontSize: 14, fontWeight: 700 }}>
                          NT${p.price}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {products.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: "#999" }}>
              目前尚無上架商品
            </div>
          )}
        </>
      )}
    </div>
  );
}
