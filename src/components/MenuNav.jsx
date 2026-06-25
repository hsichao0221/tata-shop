import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { fetchMenu } from "../supabase.js";

// 把選單項目的type/target轉成實際的連結路徑
function resolveTarget(item) {
  if (item.type === "page") return item.target ? `/pages/${item.target}` : "/";
  if (item.type === "category") return `/products?category=${item.target || ""}`;
  return item.target || "#";
}

// 頭部導覽選單：讀取ERP「網店設計→🧭編輯目錄」設定的內容，全站共用。
// 桌機橫向排列、群組用滑鼠hover顯示下拉；vertical=true時(手機選單面板)改成垂直排列、
// 群組改成點擊展開/收合(手機沒有hover，用點擊比較合理)。
export default function MenuNav({ vertical = false }) {
  const [menu, setMenu] = useState([]);
  const [openGroupId, setOpenGroupId] = useState(null);

  useEffect(() => {
    fetchMenu()
      .then(setMenu)
      .catch(() => setMenu([]));
  }, []);

  if (menu.length === 0) return null;

  if (vertical) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {menu.map((item) => {
          if (item.type === "group") {
            const isOpen = openGroupId === item.id;
            return (
              <div key={item.id}>
                <button
                  onClick={() => setOpenGroupId(isOpen ? null : item.id)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#222",
                    fontSize: 14,
                    cursor: "pointer",
                    padding: "6px 0",
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    width: "100%",
                    textAlign: "left",
                  }}
                >
                  {item.label} <span style={{ fontSize: 10 }}>{isOpen ? "▴" : "▾"}</span>
                </button>
                {isOpen && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 14 }}>
                    {(item.children || []).map((c) => (
                      <Link
                        key={c.id}
                        to={resolveTarget(c)}
                        style={{ color: "#666", fontSize: 13, textDecoration: "none", padding: "6px 0" }}
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          }
          return (
            <Link
              key={item.id}
              to={resolveTarget(item)}
              style={{ textDecoration: "none", color: "#222", fontSize: 14, padding: "6px 0" }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      {menu.map((item) => {
        if (item.type === "group") {
          const isOpen = openGroupId === item.id;
          return (
            <div
              key={item.id}
              style={{ position: "relative" }}
              onMouseEnter={() => setOpenGroupId(item.id)}
              onMouseLeave={() => setOpenGroupId((prev) => (prev === item.id ? null : prev))}
            >
              <button
                onClick={() => setOpenGroupId(isOpen ? null : item.id)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#222",
                  fontSize: 14,
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                {item.label} <span style={{ fontSize: 10 }}>▾</span>
              </button>
              {isOpen && (item.children || []).length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    background: "#fff",
                    border: "1px solid #eee",
                    borderRadius: 6,
                    boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
                    minWidth: 140,
                    padding: 6,
                    zIndex: 20,
                  }}
                >
                  {item.children.map((c) => (
                    <Link
                      key={c.id}
                      to={resolveTarget(c)}
                      onClick={() => setOpenGroupId(null)}
                      style={{
                        display: "block",
                        padding: "8px 12px",
                        color: "#333",
                        fontSize: 13,
                        textDecoration: "none",
                        borderRadius: 4,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        }
        return (
          <Link key={item.id} to={resolveTarget(item)} style={{ textDecoration: "none", color: "#222", fontSize: 14 }}>
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
