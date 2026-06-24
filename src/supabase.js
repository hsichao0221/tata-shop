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
    await fetch(SUPABASE_URL + "/rest/v1/erp_settings?on_conflict=key", {
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

// ════════════════════════════════════════════════════════════════
// 官網設定（shop_settings）
// 公版化原則：「要開放哪些會員登入方式」是商家自己的選擇，不寫死在程式碼裡，
// 存放在這裡，未來在 ERP 的 ShopAdmin.jsx 介面可以用開關調整，
// 不需要改動任何前端程式碼，調整完官網會自動套用新設定。
// ════════════════════════════════════════════════════════════════

// 預設只開放 Email 登入，因為這是唯一「不需要額外向第三方平台申請金鑰」就能運作的方式，
// 確保即使商家還沒去 Facebook/Google 申請好應用程式，會員系統依然能正常運作，不會整個壞掉。
const DEFAULT_AUTH_SETTINGS = {
  enabledAuthMethods: {
    email: true,
    facebook: false,
    google: false,
    line: false,
  },
};

export async function fetchAuthSettings() {
  const saved = await loadSetting("shop_auth_settings");
  if (saved && typeof saved === "object" && saved.enabledAuthMethods) {
    // 合併預設值，確保即使商家只存了部分欄位，其他登入方式的開關狀態不會因此消失或變成 undefined
    return { ...DEFAULT_AUTH_SETTINGS, ...saved, enabledAuthMethods: { ...DEFAULT_AUTH_SETTINGS.enabledAuthMethods, ...saved.enabledAuthMethods } };
  }
  return DEFAULT_AUTH_SETTINGS;
}

// 輔助判斷「這個Email是否已經註冊過」。
// 背景：Supabase 出於防止帳號枚舉攻擊的安全考量，當「Confirm Email」開啟時，
// 對已註冊過的Email再次呼叫signUp()，會回傳一個偽造的成功結果，不會給出明確錯誤，
// 這是Supabase官方刻意的設計，不是bug。
// 所以這裡改用查詢 pos_members 資料表的方式輔助判斷，雖然查的是會員資料表不是Supabase Auth本身，
// 但對「提醒顧客這個Email已經用過」這個情境已經足夠實用。
// ════════════════════════════════════════════════════════════════
// 首頁區塊編輯器（shop_homepage_blocks）
// 整個首頁版面交給這套區塊系統管理，原本寫死的「品牌主視覺+精選新品」
// 變成預設區塊內容（DEFAULT_HOMEPAGE_BLOCKS），讀不到自訂設定時會用這份預設值，
// 確保首頁一定有東西可以顯示，不會因為沒設定過而整頁空白。
// ════════════════════════════════════════════════════════════════

const DEFAULT_HOMEPAGE_BLOCKS = [
  {
    id: "default-hero",
    type: "hero_banner",
    enabled: true,
    title: "TATA",
    subtitle: "台灣女裝童裝品牌・全館2件9折 滿2500折100",
    imageUrl: "",
    linkUrl: "",
  },
  {
    id: "default-products",
    type: "product_carousel",
    enabled: true,
    title: "New Arrivals",
    source: "featured",
    categoryId: "",
    limit: 12,
  },
];

export async function fetchHomepageBlocks() {
  const saved = await loadSetting("shop_homepage_blocks");
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return DEFAULT_HOMEPAGE_BLOCKS;
}

const DEFAULT_FOOTER = { columns: [], social: {}, copyrightText: "" };

// 頁尾(shop_footer)：全站共用一份，不分頁面。編輯在ERP「網店設計→📜編輯頁尾」，這裡是唯讀。
export async function fetchFooter() {
  const saved = await loadSetting("shop_footer");
  if (saved && typeof saved === "object") return saved;
  return DEFAULT_FOOTER;
}

// ════════════════════════════════════════════════════════════════
// 頁面清單（shop_pages）：仿Shopline的「網店分頁」，可以自由新增/刪除頁面，
// 任何一頁都能被指定為首頁，每頁都用區塊編輯器管理內容。
// 編輯都在ERP後台的「網店設計」進行；這裡是唯讀，給官網渲染用。
// ════════════════════════════════════════════════════════════════
export async function fetchPages() {
  const saved = await loadSetting("shop_pages");
  if (Array.isArray(saved) && saved.length > 0) return saved;
  // 還沒建立過頁面清單時，用舊版「首頁編輯器」留下的資料(shop_homepage_blocks)
  // 自動組成一個「首頁」頁面，確保已經設定好的首頁內容不會憑空消失
  const legacyBlocks = await fetchHomepageBlocks();
  return [
    {
      id: "page-home",
      slug: "",
      title: "首頁",
      type: "advanced",
      isHomepage: true,
      enabled: true,
      blocks: legacyBlocks,
    },
  ];
}

// 共用的「商品輪播」資料準備邏輯：找出區塊清單裡所有product_carousel類型的區塊，
// 依各自的來源設定(精選新品/指定分類)抓好商品資料，回傳 {blockId: products[]} 的對照表。
// 首頁跟自訂頁面共用同一套邏輯，不重複寫。
export async function resolveBlockProducts(blocks, categories) {
  const carouselBlocks = (blocks || []).filter((b) => b.type === "product_carousel");
  if (carouselBlocks.length === 0) return {};
  const needsFullList = carouselBlocks.some((b) => b.source === "category");
  const allProducts = needsFullList ? await fetchAllProducts() : null;
  const productsMap = {};
  for (const b of carouselBlocks) {
    if (b.source === "category" && b.categoryId) {
      const cat = categories.find((c) => c.id === b.categoryId);
      productsMap[b.id] = filterProductsByCategory(allProducts || [], cat).slice(0, b.limit || 12);
    } else {
      productsMap[b.id] = await fetchFeaturedProducts(b.limit || 12);
    }
  }
  return productsMap;
}

export async function checkEmailExists(email) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/pos_members?email=eq.${encodeURIComponent(email)}&select=id&limit=1`,
      { headers: HEADERS }
    );
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    console.warn("checkEmailExists failed:", e);
    return false; // 查詢失敗時，不要阻擋使用者繼續，寧可放行也不要誤擋
  }
}

// ════════════════════════════════════════════════════════════════
// 配送方式（shop_shipping_methods）
// 結帳頁顯示的配送選項，由ERP後台「送貨設定」分頁管理，
// 跟分類管理不同，這個是獨立的資料表（非erp_settings key-value），方便個別欄位編輯。
// ════════════════════════════════════════════════════════════════

// 讀不到資料時的安全fallback，確保結帳頁至少有「宅配到府」可以選，不會整頁空白
const DEFAULT_SHIPPING_METHODS = [
  { id: "home_delivery", name: "宅配到府", method_type: "home_delivery", ecpay_subtype: null, fee_amount: 100, enabled: true, sort_order: 1 },
];

export async function fetchShippingMethods() {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/shop_shipping_methods?select=*&enabled=eq.true&order=sort_order.asc`,
      { headers: HEADERS }
    );
    if (!r.ok) return DEFAULT_SHIPPING_METHODS;
    const d = await r.json();
    return Array.isArray(d) && d.length > 0 ? d : DEFAULT_SHIPPING_METHODS;
  } catch (e) {
    console.warn("fetchShippingMethods failed:", e);
    return DEFAULT_SHIPPING_METHODS;
  }
}
