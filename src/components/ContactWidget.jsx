import { useEffect, useState } from "react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase.js";

// 官網右下角的客服快速導流按鈕。讀取ERP後台「管道設定→官網客服快速導流按鈕」
// 填的連結，只顯示真的有設定的管道；LINE/Facebook/Instagram都只是導流連結，
// 客人點了會離開官網、跳到各自的APP/網頁對話，不是站內即時聊天視窗。
// 完全沒設定任何管道時，直接不顯示這個按鈕(不會顯示一個空的選單)。

const CHANNEL_META = {
  lineAddFriend: { label: "LINE 諮詢", icon: "💬", color: "#06C755" },
  facebookMessenger: { label: "Facebook 私訊", icon: "📘", color: "#0084FF" },
  instagramDm: { label: "Instagram 私訊", icon: "📷", color: "#E1306C" },
  contactEmail: { label: "寄信給我們", icon: "✉️", color: "#555" },
};

export default function ContactWidget() {
  const [links, setLinks] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/erp_settings?key=eq.quickContactLinks&select=value`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: "Bearer " + SUPABASE_ANON_KEY },
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setLinks(d?.[0]?.value || {}))
      .catch(() => setLinks({}));
  }, []);

  if (!links) return null;
  const channels = Object.keys(CHANNEL_META).filter((k) => links[k]);
  if (channels.length === 0) return null;

  function openChannel(key) {
    const url = links[key];
    if (key === "contactEmail") {
      window.location.href = `mailto:${url}`;
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
    setOpen(false);
  }

  return (
    <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 999 }}>
      {open && (
        <div
          style={{
            position: "absolute",
            bottom: 60,
            right: 0,
            background: "#fff",
            borderRadius: 10,
            boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
            overflow: "hidden",
            minWidth: 180,
          }}
        >
          {channels.map((key) => {
            const meta = CHANNEL_META[key];
            return (
              <button
                key={key}
                onClick={() => openChannel(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  width: "100%",
                  padding: "12px 16px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid #f0f0f0",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#333",
                  textAlign: "left",
                }}
              >
                <span style={{ fontSize: 16 }}>{meta.icon}</span>
                {meta.label}
              </button>
            );
          })}
        </div>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="聯絡客服"
        style={{
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: "#222",
          color: "#fff",
          border: "none",
          fontSize: 22,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.25)",
        }}
      >
        {open ? "✕" : "💬"}
      </button>
    </div>
  );
}
