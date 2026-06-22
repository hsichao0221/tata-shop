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

// ════════════════════════════════════════════════════════════════
// 分類管理（shop_categories）
// 對應 ERP 商品的 category 欄位，或人工挑選的企劃集合（如「俐落OL上班族」）。
// 存放在 erp_settings 的獨立 key，跟商品資料、首頁區塊設定完全分開存放，
// 修改分類不會影響商品資料，也不會影響首頁其他區塊的設定。
// ════════════════════════════════════════════════════════════════

// 預設分類清單：對應 ERP 商品本身就有的 category 欄位，
// 這是「讀不到自訂分類時」的安全 fallback，確保網站一定有基本的分類可用。
const DEFAULT_CATEGORIES = [
  { id: "all", label: "所有商品", filterMode: "all", order: 0, showInMenu: true },
  { id: "tops", label: "上衣", filterMode: "category", filterValue: "上衣", order: 10, showInMenu: true },
  { id: "skirts", label: "裙子", filterMode: "category", filterValue: "裙子", order: 11, showInMenu: true },
  { id: "trousers", label: "褲子", filterMode: "category", filterValue: "褲子", order: 12, showInMenu: true },
  { id: "tshirts", label: "T恤", filterMode: "category", filterValue: "T恤", order: 13, showInMenu: true },
  { id: "outwears", label: "外套", filterMode: "category", filterValue: "外套", order: 14, showInMenu: true },
  { id: "coats", label: "大衣", filterMode: "category", filterValue: "大衣", order: 15, showInMenu: true },
  { id: "dresses", label: "洋裝/套裝", filterMode: "category", filterValue: "洋裝/套裝", order: 16, showInMenu: true },
  { id: "knitwears", label: "針織上衣", filterMode: "category", filterValue: "針織上衣", order: 17, showInMenu: true },
  { id: "accessories", label: "配件", filterMode: "category", filterValue: "配件", order: 18, showInMenu: true },
  { id: "kids", label: "童裝", filterMode: "group", filterValue: "童裝", order: 20, showInMenu: true },
];

// 讀取分類清單：讀不到自訂分類時，回傳上面這份預設清單，確保網站一定能正常顯示分類選單
export async function fetchCategories() {
  const saved = await loadSetting("shop_categories");
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return DEFAULT_CATEGORIES;
}

// 寫入分類清單（之後 ShopAdmin 在 ERP 裡編輯分類時會呼叫這個）
export async function saveCategories(categories, token) {
  try {
    await fetch(SUPABASE_URL + "/rest/v1/erp_settings", {
      method: "POST",
      headers: {
        ...HEADERS,
        "Authorization": "Bearer " + (token || SUPABASE_ANON_KEY),
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        key: "shop_categories",
        value: categories,
        updated_at: new Date().toISOString(),
      }),
    });
    return true;
  } catch (e) {
    console.warn("saveCategories failed:", e);
    return false;
  }
}

// 依照分類定義，從完整商品清單裡篩出符合的商品。
// 這個函式是「分類系統」跟「商品資料」真正串接起來的地方：
// 給定一個分類定義（filterMode + filterValue），回傳所有符合條件的上架商品。
export function filterProductsByCategory(products, category) {
  const active = filterActiveProducts(products);
  if (!category || category.filterMode === "all") return active;

  if (category.filterMode === "category") {
    return active.filter((p) => p.category === category.filterValue);
  }
  if (category.filterMode === "group") {
    return active.filter((p) => p.group === category.filterValue);
  }
  if (category.filterMode === "tag") {
    return active.filter((p) => p.tag === category.filterValue);
  }
  if (category.filterMode === "on_sale") {
    return active.filter((p) => p.salePrice);
  }
  if (category.filterMode === "sku_list") {
    const skuSet = new Set(category.skuList || []);
    return active.filter((p) => skuSet.has(p.sku));
  }
  // 未知的 filterMode，安全 fallback 回傳全部上架商品，不讓畫面整片空白
  return active;
}
