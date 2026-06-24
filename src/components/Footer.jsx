import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchFooter } from "../supabase.js";

// 社群圖標：用SVG畫成圓形彩色背景+白色品牌icon，取代原本的emoji（看起來比較像正式的官網頁尾，
// 不會因為不同手機/瀏覽器的emoji字型差異而長得不一樣）
function SocialIcon({ platform }) {
  const BRAND_COLOR = { facebook: "#1877F2", instagram: "#E1306C", line: "#06C755", youtube: "#FF0000" };
  const ICON_PATH = {
    facebook: "M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.5.3v2.3h-1.4c-1.4 0-1.8.8-1.8 1.7V12h3l-.5 2.9h-2.5v7A10 10 0 0 0 22 12z",
    instagram:
      "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4zM16.9 5.6a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4zM21.9 7.4a6 6 0 0 0-1.6-4.3 6 6 0 0 0-4.3-1.6c-1.7-.1-6.9-.1-8.6 0a6 6 0 0 0-4.3 1.6A6 6 0 0 0 1.5 7.4c-.1 1.7-.1 6.9 0 8.6a6 6 0 0 0 1.6 4.3 6 6 0 0 0 4.3 1.6c1.7.1 6.9.1 8.6 0a6 6 0 0 0 4.3-1.6 6 6 0 0 0 1.6-4.3c.1-1.7.1-6.9 0-8.6zm-2.2 10.7a4 4 0 0 1-2.2 2.2c-1.6.6-5.4.5-7.5.5s-5.9.1-7.5-.5a4 4 0 0 1-2.2-2.2c-.6-1.6-.5-5.4-.5-7.5s-.1-5.9.5-7.5a4 4 0 0 1 2.2-2.2c1.6-.6 5.4-.5 7.5-.5s5.9-.1 7.5.5a4 4 0 0 1 2.2 2.2c.6 1.6.5 5.4.5 7.5s.1 5.9-.5 7.5z",
    line:
      "M12 2C6.5 2 2 5.8 2 10.4c0 4.1 3.5 7.5 8.3 8.2.3.1.7.2.8.5.1.3 0 .7 0 .9l-.1.8c0 .2-.2.9.8.5 1-.4 5.5-3.2 7.5-5.5C20.7 13.6 22 12.1 22 10.4 22 5.8 17.5 2 12 2zM8.7 12.8H6.9c-.3 0-.5-.2-.5-.5V8.6c0-.3.2-.5.5-.5s.5.2.5.5v3.2h1.3c.3 0 .5.2.5.5s-.2.5-.5.5zm1.6-.5c0 .3-.2.5-.5.5s-.5-.2-.5-.5V8.6c0-.3.2-.5.5-.5s.5.2.5.5v3.7zm4.3 0c0 .2-.1.4-.4.5-.1 0-.2 0-.3-.1l-1.9-2.5v2.1c0 .3-.2.5-.5.5s-.5-.2-.5-.5V8.6c0-.2.1-.4.4-.5h.1c.1 0 .3 0 .4.2l1.9 2.5V8.6c0-.3.2-.5.5-.5s.5.2.5.5v3.7zm3.4-2.7h-1.3v.9h1.3c.3 0 .5.2.5.5s-.2.5-.5.5h-1.3v.9h1.3c.3 0 .5.2.5.5s-.2.5-.5.5h-1.8c-.3 0-.5-.2-.5-.5V8.6c0-.3.2-.5.5-.5h1.8c.3 0 .5.2.5.5s-.2.5-.5.5z",
    youtube:
      "M21.6 7.2s-.2-1.5-.8-2.2c-.8-.8-1.7-.8-2.1-.9C15.9 4 12 4 12 4h0s-3.9 0-6.7.1c-.4 0-1.3.1-2.1.9-.6.7-.8 2.2-.8 2.2S2.2 9 2.2 10.7v1.5c0 1.8.2 3.5.2 3.5s.2 1.5.8 2.2c.8.8 1.8.8 2.3.9 1.6.2 6.5.2 6.5.2s3.9 0 6.7-.2c.4 0 1.3-.1 2.1-.9.6-.7.8-2.2.8-2.2s.2-1.8.2-3.5v-1.5c0-1.8-.2-3.5-.2-3.5zM9.9 14.6V8.9l5.4 2.9-5.4 2.8z",
  };
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
      <circle cx="12" cy="12" r="12" fill={BRAND_COLOR[platform] || "#999"} />
      <path d={ICON_PATH[platform]} transform={platform === "facebook" ? "scale(1)" : undefined} />
    </svg>
  );
}

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
  const socialEntries = Object.entries(footer.social || {}).filter(([, url]) => url);
  if (columns.length === 0 && socialEntries.length === 0 && !footer.copyrightText) return null;

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

      {socialEntries.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 28 }}>
          {socialEntries.map(([platform, url]) => (
            <a
              key={platform}
              href={url}
              target="_blank"
              rel="noreferrer"
              style={{ display: "inline-flex", opacity: 0.85, transition: "opacity 0.2s" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.85")}
            >
              <SocialIcon platform={platform} />
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

