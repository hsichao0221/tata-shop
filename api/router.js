// 統一入口：把「不需要獨立網址身分」的 API 合併成一支 Vercel Function，
// 避免超過 Hobby 方案「單次部署最多 12 支函式」的上限。
// 對外網址完全不變（/api/fx-rate 等），由 vercel.json 的 rewrites 轉進來。
// 實際處理邏輯放在 api/_routes/（底線開頭的資料夾 Vercel 不會當成獨立函式）。
import fxRate from "./_routes/fx-rate.js";
import einvoiceAllowance from "./_routes/einvoice-allowance.js";
import einvoiceVoid from "./_routes/einvoice-void.js";
import lineBroadcast from "./_routes/line-broadcast.js";
import translate from "./_routes/translate.js";

// 白名單：只有這裡列出的名稱才會被執行，路由名稱不會被拿去組檔案路徑。
const ROUTES = {
  "fx-rate": fxRate,
  "einvoice-allowance": einvoiceAllowance,
  "einvoice-void": einvoiceVoid,
  "line-broadcast": lineBroadcast,
  "translate": translate,
};

function pickRoute(req) {
  const q = req.query?.route;
  if (typeof q === "string" && q) return q;
  const path = String(req.url || "").split("?")[0];
  return path.split("/").filter(Boolean).pop() || "";
}

export default async function handler(req, res) {
  const name = pickRoute(req);
  if (name === "router-probe") {
    res.status(200).json({ ok: true, routes: Object.keys(ROUTES) });
    return;
  }
  const fn = Object.prototype.hasOwnProperty.call(ROUTES, name) ? ROUTES[name] : null;
  if (!fn) {
    res.status(404).json({ ok: false, error: "Unknown API route" });
    return;
  }
  return fn(req, res);
}
