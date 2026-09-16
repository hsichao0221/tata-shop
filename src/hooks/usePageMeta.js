import { useEffect } from "react";

// 依頁面資料設定title/meta description。
// 有填seoTitle/seoDescription就用管理員自己填的，沒填就自動退回頁面標題，
// 確保沒有特別設定SEO的頁面，還是有基本的title，不會是空的或沿用上一頁殘留的title。
// 做法沿用ProductPage.jsx已經在用、驗證過的模式：直接操作document.title跟meta標籤，
// 離開這個頁面時還原成進入前的值，避免影響到其他頁面。
export function usePageMeta(page) {
  useEffect(() => {
    if (!page) return;
    const prevTitle = document.title;
    const title = page.seoTitle || page.title;
    document.title = title ? `${title} | TATA` : document.title;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    const prevDesc = metaDesc.getAttribute("content");
    if (page.seoDescription) metaDesc.setAttribute("content", page.seoDescription);

    return () => {
      document.title = prevTitle;
      if (metaDesc && prevDesc !== null) metaDesc.setAttribute("content", prevDesc);
    };
  }, [page]);
}
