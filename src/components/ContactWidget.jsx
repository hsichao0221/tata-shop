import { useEffect, useState } from "react";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../supabase.js";

// 官網右下角的客服快速導流按鈕。讀取ERP後台「管道設定→官網客服快速導流按鈕」
// 填的連結，只顯示真的有設定的管道；LINE/Facebook/Instagram都只是導流連結，
// 客人點了會離開官網、跳到各自的APP/網頁對話，不是站內即時聊天視窗。
// 完全沒設定任何管道時，直接不顯示這個按鈕(不會顯示一個空的選單)。
//
// 圖示用簡化的SVG圖形語言呈現各平台識別度(不是逐像素複製官方商標)，
// 比純emoji更有質感、更專業。

function LineIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26">
      <rect width="26" height="26" rx="7" fill="#06C755" />
      <path
        d="M13 6.5c-4.14 0-7.5 2.72-7.5 6.08 0 3.01 2.67 5.53 6.27 6.01.24.05.58.16.66.37.08.19.05.49.03.68l-.11.66c-.03.19-.15.75.66.41.81-.34 4.36-2.57 5.95-4.4 1.1-1.2 1.62-2.43 1.62-3.73 0-3.36-3.36-6.08-7.58-6.08z"
        fill="#fff"
      />
    </svg>
  );
}

function MessengerIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26">
      <defs>
        <linearGradient id="msgr-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#00B2FF" />
          <stop offset="0.5" stopColor="#006FFF" />
          <stop offset="1" stopColor="#2100E7" />
        </linearGradient>
      </defs>
      <circle cx="13" cy="13" r="13" fill="url(#msgr-g)" />
      <path
        d="M13 7c-3.5 0-6.2 2.4-6.2 5.8 0 1.9 1 3.6 2.6 4.7v2.1l2.2-1.2c.4.1.9.2 1.4.2 3.5 0 6.2-2.4 6.2-5.8S16.5 7 13 7z"
        fill="#fff"
      />
      <path
        d="M9.4 14l2-2.9 1.8 1.4L15.2 10l-2 3-1.8-1.4L9.4 14z"
        fill="#006FFF"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26">
      <defs>
        <linearGradient id="ig-g" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#FFD600" />
          <stop offset="0.4" stopColor="#FF3D8A" />
          <stop offset="1" stopColor="#8B3DFF" />
        </linearGradient>
      </defs>
      <rect width="26" height="26" rx="7" fill="url(#ig-g)" />
      <rect x="7" y="7" width="12" height="12" rx="4" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="13" cy="13" r="3.2" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="17" cy="9" r="1" fill="#fff" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26">
      <rect width="26" height="26" rx="7" fill="#555" />
      <path d="M6.5 9.5h13v7.5h-13z" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M6.5 9.5 13 14l6.5-4.5" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const CHANNEL_META = {
  lineAddFriend: { label: "LINE 諮詢", Icon: LineIcon },
  facebookMessenger: { label: "Facebook 私訊", Icon: MessengerIcon },
  instagramDm: { label: "Instagram 私訊", Icon: InstagramIcon },
  contactEmail: { label: "寄信給我們", Icon: EmailIcon },
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
            bottom: 64,
            right: 0,
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 6px 24px rgba(0,0,0,0.16)",
            overflow: "hidden",
            minWidth: 200,
          }}
        >
          {channels.map((key) => {
            const meta = CHANNEL_META[key];
            const Icon = meta.Icon;
            return (
              <button
                key={key}
                onClick={() => openChannel(key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "13px 16px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid #f0f0f0",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#333",
                  textAlign: "left",
                }}
              >
                <Icon />
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
          width: 54,
          height: 54,
          borderRadius: "50%",
          background: links.buttonColor || "#222",
          color: "#fff",
          border: "none",
          fontSize: 24,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(0,0,0,0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {open ? (
          "✕"
        ) : (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
            <path
              d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"
              stroke="#fff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
