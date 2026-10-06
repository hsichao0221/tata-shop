// 人民幣→台幣匯率查詢：抓臺灣銀行牌告匯率「歷史收盤價」(指定日期)，給ERP採購管理的大陸款成本換算用。
// 為什麼放在伺服器端而不是ERP瀏覽器直接抓：台銀網站不一定允許瀏覽器跨網域直接讀取，
// 其他API(綠界、LINE...)也都是這個模式，由這邊代抓再回傳JSON，並順便把查到的結果做快取。
//
// 用法：GET /api/fx-rate?date=2026-09-24
//   回傳 { ok:true, currency:"CNY", requestedDate, rateDate, source, spotSell, cashSell, spotBuy, cashBuy }
//   spotSell(即期賣出)＝銀行賣人民幣給你的價格，付款給大陸賣家等於是在「買入人民幣」，所以用賣出價。
//   rateDate可能比requestedDate早：指定日期如果是假日、或當天還沒收盤，台銀沒有那一天的資料，
//   會往前找最近一個有資料的營業日(最多往前7天)，並把「實際用的是哪一天」回傳，不會假裝是當天的匯率。
import { parseBotCsvRate } from "../_fxParse.js";

const BOT_CSV = "https://rate.bot.com.tw/xrt/flcsv/0/";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
function taipeiToday() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(ds, n) {
  const d = new Date(ds + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
async function fetchWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; tata-erp-fx/1.0)" } });
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ ok: false, error: "Method not allowed" }); return; }

  const today = taipeiToday();
  let date = String(req.query?.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(date + "T00:00:00Z").getTime())) date = today;
  if (date > today) date = today; // 未來日期沒有匯率可查，當成今天

  const started = Date.now();
  for (let i = 0; i <= 7; i++) {
    if (Date.now() - started > 8000) break; // 函式有執行時間上限，不要把整個請求拖到被砍掉
    const d = addDays(date, -i);
    try {
      const r = await fetchWithTimeout(BOT_CSV + d, 4000);
      if (!r.ok) continue;
      const rate = parseBotCsvRate(await r.text(), "CNY");
      if (!rate) continue;
      res.setHeader("Cache-Control", d < today ? "public, s-maxage=86400, stale-while-revalidate=604800" : "public, s-maxage=300");
      res.status(200).json({
        ok: true, currency: "CNY", requestedDate: date, rateDate: d,
        source: "臺灣銀行牌告匯率(歷史收盤價)", ...rate,
      });
      return;
    } catch (e) {
      // 單一天逾時或連線失敗：換前一天再試，不整個放棄
    }
  }
  res.status(404).json({ ok: false, error: `查不到 ${date} 前後的人民幣牌告匯率` });
}
