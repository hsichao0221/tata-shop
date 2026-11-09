// 顧客登入憑證攔截：顧客登入後，對資料庫(Supabase REST)的請求統一改帶「顧客自己的登入憑證」，
// 不再用公開金鑰。資料庫之後就能判斷「這是哪一位顧客」，只讓他看到自己的資料。
// - 沒登入(訪客)：原樣使用公開金鑰，只能讀公開內容(商品、優惠券活動等)。
// - 憑證從Supabase登入狀態(localStorage)讀取；快過期時退回公開金鑰，等Supabase自動換新憑證。
const SUPA_REST = "https://vsqdzntwavegnwctzzgx.supabase.co/rest/v1/";
const STORE_KEY = "sb-vsqdzntwavegnwctzzgx-auth-token";

function customerToken() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return "";
    const s = JSON.parse(raw);
    const tok = s && (s.access_token || (s.currentSession && s.currentSession.access_token));
    const exp = s && (s.expires_at || (s.currentSession && s.currentSession.expires_at));
    if (!tok) return "";
    if (exp && exp * 1000 < Date.now() + 10000) return "";
    return tok;
  } catch (e) { return ""; }
}

if (typeof window !== "undefined" && !window.__customerAuthPatched) {
  window.__customerAuthPatched = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    let url = "";
    try { url = typeof input === "string" ? input : (input && input.url) || ""; } catch (e) {}
    if (!url.startsWith(SUPA_REST) || typeof input !== "string") return origFetch(input, init);
    const tok = customerToken();
    if (!tok) return origFetch(input, init);
    const headers = new Headers((init && init.headers) || {});
    headers.set("Authorization", "Bearer " + tok);
    return origFetch(input, { ...(init || {}), headers });
  };
}
