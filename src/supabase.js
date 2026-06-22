// 共用 fashion-erp 同一個 Supabase 專案
// 官網（tata-shop）跟 ERP（fashion-erp）是兩個獨立的程式碼專案，
// 但連到同一個資料庫，讓商品/訂單/會員資料能互通。
export const SUPABASE_URL = "https://vsqdzntwavegnwctzzgx.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcWR6bnR3YXZlZ253Y3R6emd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjEyOTMsImV4cCI6MjA5Mzc5NzI5M30.vkZTXD-XnDH07AYrYTA0k8quTWInwLN_s4oMr70u7nY";

const HEADERS = {
  "apikey": SUPABASE_ANON_KEY,
  "Authorization": "Bearer " + SUPABASE_ANON_KEY,
  "Content-Type": "application/json",
};

// 讀取 erp_settings 表裡某個 key 對應的 value（跟 ERP 那邊的 loadSetting 邏輯一致）
async function loadSetting(key) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/erp_settings?key=eq.${key}&select=value`,
      { headers: HEADERS }
    );
    const d = await r.json();
    return d?.[0]?.value || null;
  } catch (e) {
    console.warn("loadSetting failed:", key, e);
    return null;
  }
}

// 讀取完整商品清單（商品資料分批存在 products_0, products_1... 這幾個 key，
// 這裡負責把它們依序讀出來拼成一個完整陣列）
export async function fetchAllProducts() {
  const batchCount = Number(await loadSetting("products_batches")) || 0;

  if (batchCount >= 1) {
    const batches = await Promise.all(
      Array.from({ length: batchCount }, (_, i) => loadSetting(`products_${i}`))
    );
    return batches.flat().filter((p) => p && typeof p === "object");
  }

  // 向下相容：如果沒有分批資訊，嘗試讀取舊版單一 key
  const p = await loadSetting("products");
  return Array.isArray(p) ? p : [];
}

// 只取「上架中」的商品（active === true 或舊資料沒有 active 欄位時暫時保留顯示，
// 與 ERP 那邊 activeProducts 的判斷邏輯一致，確保兩邊行為對齊）
export function filterActiveProducts(products) {
  return products.filter((p) => p.active === true || p.active === undefined);
}

// 首頁「精選新品」用的輕量版讀取：只抓第一個批次（最多300筆），
// 不像 fetchAllProducts 要把全部批次抓完，大幅減少首頁的網路請求次數跟等待時間。
// 商品列表頁（看全部商品）才需要用 fetchAllProducts 抓完整資料。
export async function fetchFeaturedProducts(limit = 12) {
  const firstBatch = await loadSetting("products_0");
  const list = Array.isArray(firstBatch) ? firstBatch : [];
  const active = filterActiveProducts(list);
  return active.slice(0, limit);
}
