// ════════════════════════════════════════════════════════════════
// 子網域租戶解析模組（多品牌SaaS平台用）
// 用途：依瀏覽器目前的網址(hostname)，判斷應該連到哪個客戶的 Supabase 資料庫。
//
// 設計原則：
// - TATA 自己的網域(tata-style.com 及其Vercel預設網域)永遠直接回傳寫死的TATA連線資料，
//   完全不用打任何網路請求，行為與現在完全一致、零風險。
// - 只有「不是TATA網域」時，才會去讀取「租戶對照表」找出對應的客戶連線資料。
// - 租戶對照表目前先借用TATA自己的Supabase(erp_settings表, key="platform_tenants")當作
//   「平台租戶名冊」使用，不用另外開一個專案，之後真的客戶多了、需要獨立主控台管理時，
//   再考慮拆成獨立的平台資料庫。
// ════════════════════════════════════════════════════════════════

const TATA_SUPABASE_URL = "https://vsqdzntwavegnwctzzgx.supabase.co";
const TATA_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcWR6bnR3YXZlZ253Y3R6emd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjEyOTMsImV4cCI6MjA5Mzc5NzI5M30.vkZTXD-XnDH07AYrYTA0k8quTWInwLN_s4oMr70u7nY";

// TATA自己的正式網域＋Vercel預設網域，符合這些的一律直接走原本邏輯，不查租戶名冊
const TATA_HOSTNAMES = [
  "tata-style.com",
  "www.tata-style.com",
  "tata-shop-eta.vercel.app",
  "localhost",
];

// 平台子網域的母體網域(之後買了kaipu.io要換成正式的)
const PLATFORM_ROOT_DOMAIN = "kaipu.io";

// 從hostname判斷屬於哪個「租戶」(客戶)：
// - 符合TATA自訂網域清單 → 回傳 null，代表「用預設TATA連線，不用查名冊」
// - 是 xxx.kaipu.io 這種子網域格式 → 回傳 "xxx" 這個子網域名稱
// - 其他情況(例如未來客戶自己的網域，不是kaipu.io子網域) → 回傳完整hostname本身當作查詢鍵，
//   讓租戶名冊也能用「客戶自訂網域」當作對照鍵，不限定一定要走子網域
export function extractTenantKey(hostname) {
  const host = String(hostname || "").toLowerCase().trim();
  if (!host) return null;
  if (TATA_HOSTNAMES.includes(host)) return null;
  if (host.endsWith("." + PLATFORM_ROOT_DOMAIN)) {
    const sub = host.slice(0, -(PLATFORM_ROOT_DOMAIN.length + 1));
    return sub || null;
  }
  // 不是TATA網域、也不是平台子網域格式 → 視為客戶的自訂網域，直接拿完整hostname去查名冊
  return host;
}

// 查詢租戶名冊，找出對應客戶的 Supabase 連線資料。
// fetchTenantRegistry 是外部傳入的函式(實際打API的部分)，方便測試時可以用假資料替換，
// 不用真的發網路請求也能驗證邏輯正確性。
export async function resolveTenantConfig(hostname, fetchTenantRegistry) {
  const tenantKey = extractTenantKey(hostname);

  // TATA自己的網域，直接回傳寫死的連線資料，不查名冊、零網路延遲
  if (tenantKey === null) {
    return { url: TATA_SUPABASE_URL, anonKey: TATA_SUPABASE_ANON_KEY, tenant: "tata", isDefault: true };
  }

  try {
    const registry = await fetchTenantRegistry();
    const match = (registry || []).find(
      (t) => t.subdomain === tenantKey || t.customDomain === tenantKey
    );
    if (match && match.supabaseUrl && match.supabaseAnonKey) {
      return { url: match.supabaseUrl, anonKey: match.supabaseAnonKey, tenant: match.subdomain || tenantKey, isDefault: false };
    }
  } catch (e) {
    console.warn("讀取租戶名冊失敗，退回TATA預設連線:", e);
  }

  // 名冊裡找不到對應客戶、或讀取失敗 → 安全fallback，退回TATA自己的連線，
  // 避免一個沒設定好的網域讓網站整個打不開
  return { url: TATA_SUPABASE_URL, anonKey: TATA_SUPABASE_ANON_KEY, tenant: "tata", isDefault: true };
}
