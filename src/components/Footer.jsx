import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFooter } from "../supabase.js";

// 全站共用的頁尾，編輯在ERP「網店設計→📜編輯頁尾」，這裡只負責讀取後渲染。
export default function Footer() {
  const [footer, setFooter] = useState(null);

  useEffect(() => {
    fetchFooter()
      .then(setFooter)
      .catch(() => setFooter(null));
  }, []);

  if (!footer) return null;
  const columns = footer.columns || [];
  const socialIcons = (footer.socialIcons || []).filter((s) => s.iconUrl);
  if (columns.length === 0 && socialIcons.length === 0 && !footer.copyrightText) return null;

  return (
    <footer style={{ background: "#f5f3f0", marginTop: 40, padding: "40px 16px 24px" }}>
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(columns.length, 1)}, 1fr)`,
          gap: 24,
          textAlign: "center",
        }}
      >
        {columns.map((col) => (
          <div key={col.id}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 12 }}>{col.title}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(col.links || []).map((link) =>
                /^https?:\/\//.test(link.url || "") ? (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#666", fontSize: 12, textDecoration: "none" }}
                  >
                    {link.label}
                  </a>
                ) : (
                  <Link
                    key={link.id}
                    to={link.url || "#"}
                    style={{ color: "#666", fontSize: 12, textDecoration: "none" }}
                  >
                    {link.label}
                  </Link>
                )
              )}
            </div>
          </div>
        ))}
      </div>

      {socialIcons.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 28 }}>
          {socialIcons.map((s) => (
            <a
              key={s.id}
              href={s.linkUrl || "#"}
              target="_blank"
              rel="noreferrer"
              style={{ display: "inline-flex", opacity: 0.85, transition: "opacity 0.2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
            >
              <img src={s.iconUrl} alt="" style={{ width: 28, height: 28, objectFit: "contain", display: "block" }} />
            </a>
          ))}
        </div>
      )}

      {footer.copyrightText && (
        <div style={{ textAlign: "center", color: "#999", fontSize: 11, marginTop: 28 }}>{footer.copyrightText}</div>
      )}
    </footer>
  );
}


