// 解析臺灣銀行「牌告匯率 CSV」(https://rate.bot.com.tw/xrt/flcsv/0/YYYY-MM-DD)。
// 實際抓回來確認過的格式(2026/10/02那份)：
//   表頭：幣別,匯率,現金,即期,遠期10天,...,匯率,現金,即期,遠期10天,...
//   資料：CNY,本行買入,<現金買>,<即期買>,<遠期買x7>,本行賣出,<現金賣>,<即期賣>,<遠期賣x7>,
//   也就是 0=幣別 1="本行買入" 2=現金買入 3=即期買入 4~10=遠期買入 11="本行賣出" 12=現金賣出 13=即期賣出 14~20=遠期賣出
// 注意：網路上常見的教學文章取第13個欄位(index 12)那是「現金賣出」，不是即期；這裡取的即期賣出是index 13。
// 為了避免台銀哪天調整欄位順序造成「悄悄讀到別的欄位」這種最難發現的錯誤，
// 先核對第2欄、第12欄的文字是不是預期的「本行買入／本行賣出」，對不上就直接回傳null，寧可查不到也不要給錯的匯率。
export function parseBotCsvRate(text, code = "CNY") {
  if (!text) return null;
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const line of lines) {
    const c = line.split(",");
    if ((c[0] || "").trim() !== code) continue;
    if ((c[1] || "").trim() !== "本行買入" || (c[11] || "").trim() !== "本行賣出") return null;
    const num = (v) => {
      const n = Number(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    };
    const r = { cashBuy: num(c[2]), spotBuy: num(c[3]), cashSell: num(c[12]), spotSell: num(c[13]) };
    return r.spotSell ? r : null;
  }
  return null;
}
