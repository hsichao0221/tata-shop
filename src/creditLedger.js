// 購物金帳本：依發放/使用紀錄依時間順序模擬，算出「有效購物金 / 即將到期 / 已過期 / 訂金(無期限)」。
// 純函式，沒有任何副作用，ERP、POS 共用；官網(tata-shop)有一份相同邏輯的拷貝，修改時要同步。
//
// 資料來源：
//   pos_credit_logs  : 免費購物金(發放類 type 有 issue/birthday/welcome/renew/upgrade/referral，可帶 expire_date)
//                      與 ERP 手動扣除(deduct)
//   pos_deposit_logs : POS 儲值訂金 type "in"(存入、無期限) / "used"(結帳使用，amount 為負數)
//   balance          : pos_members.deposit_balance (實際餘額，以此為準對帳)
//
// 扣用順序(業界慣例，對客人最有利)：最早到期的購物金 → 無期限購物金 → 訂金。
// 結帳當天仍在有效期內(expire_date >= 當天)才可被扣用。
export const CREDIT_GRANT_TYPES = ["issue", "birthday", "welcome", "renew", "upgrade", "referral"];

// 日期一律轉成 YYYY-MM-DD 再比較：實際資料裡 expire_date 有 2026-06-09、2026/06/09、20260914 等多種寫法，
// 直接用字串比大小會誤判(例如 "2026/06/09" > "2026-10-15")，導致已過期的購物金被當成有效。
const dayOf = (x) => {
  const m = String(x || "").match(/(\d{4})\D?(\d{1,2})\D?(\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : "";
};
const addDays = (ymd, n) => {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function computeCreditStatus({ creditLogs = [], depositLogs = [], balance = 0, today, soonDays = 7 } = {}) {
  const todayStr = today || new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10); // 台灣日期
  const soonEnd = addDays(todayStr, Math.max(0, Number(soonDays) || 0));

  const events = [];
  (creditLogs || []).forEach((l) => {
    const amt = Math.abs(Number(l.amount) || 0);
    if (!amt) return;
    const t = dayOf(l.created_at || l.date);
    if (CREDIT_GRANT_TYPES.includes(l.type)) {
      events.push({ t, kind: "grant", lot: { kind: "credit", exp: l.expire_date ? dayOf(l.expire_date) : null, left: amt, orig: amt, note: l.note || "" } });
    } else if (l.type === "deduct") {
      events.push({ t, kind: "use", amt });
    }
    // type "expire" 目前系統沒有寫入；若日後有，因為效期由本函式依日期判斷，這裡刻意不重複計算
  });
  (depositLogs || []).forEach((l) => {
    const amt = Math.abs(Number(l.amount) || 0);
    if (!amt) return;
    const t = dayOf(l.date || l.created_at);
    if (l.type === "in") events.push({ t, kind: "grant", lot: { kind: "deposit", exp: null, left: amt, orig: amt, note: l.note || "" } });
    else if (l.type === "used") events.push({ t, kind: "use", amt });
  });

  events.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.kind === b.kind ? 0 : a.kind === "grant" ? -1 : 1));

  const lots = [];
  // 扣用優先順序：有期限且最早到期 → 無期限購物金 → 訂金
  const rank = (lot) => (lot.kind === "deposit" ? 2 : lot.exp ? 0 : 1);
  const order = (a, b) => rank(a) - rank(b) || (a.exp || "") .localeCompare(b.exp || "");
  const consume = (amt, t) => {
    let need = amt;
    const usable = lots.filter((l) => l.left > 0 && (!l.exp || l.exp >= t)).sort(order);
    for (const l of usable) {
      if (need <= 0) break;
      const take = Math.min(l.left, need);
      l.left -= take;
      need -= take;
    }
    return need; // 還沒扣完的部分(舊資料沒有對應發放紀錄)
  };

  events.forEach((e) => {
    if (e.kind === "grant") lots.push(e.lot);
    else consume(e.amt, e.t);
  });

  const sum = (arr) => arr.reduce((a, l) => a + l.left, 0);
  const ledgerTotal = sum(lots);
  const bal = Number(balance) || 0;
  let unlogged = 0; // 餘額比帳本多：沒有發放紀錄的舊餘額，視為無期限
  let drift = 0;
  if (bal > ledgerTotal) unlogged = bal - ledgerTotal;
  else if (bal < ledgerTotal) {
    drift = ledgerTotal - bal; // 餘額比帳本少：有未入帳的扣用，今天補扣
    consume(drift, todayStr);
  }

  const valid = lots.filter((l) => l.left > 0 && (!l.exp || l.exp >= todayStr));
  const expiredLots = lots.filter((l) => l.left > 0 && l.exp && l.exp < todayStr);
  const creditValid = sum(valid.filter((l) => l.kind === "credit"));
  const deposit = sum(valid.filter((l) => l.kind === "deposit"));
  const expired = sum(expiredLots);
  const soonLots = valid.filter((l) => l.kind === "credit" && l.exp && l.exp <= soonEnd).sort((a, b) => a.exp.localeCompare(b.exp));
  const soon = sum(soonLots);

  return {
    balance: bal,
    available: creditValid + deposit + unlogged, // 目前真正可折抵
    creditValid, // 有效購物金(含無期限的免費購物金)
    deposit, // 訂金(無期限)
    unlogged, // 查無來源紀錄的餘額(視為無期限)
    expired, // 已過期但還留在餘額裡的金額
    soon, // 提醒天數內到期
    soonLots: soonLots.map((l) => ({ exp: l.exp, amt: l.left, note: l.note })),
    nextExpiry: valid.filter((l) => l.kind === "credit" && l.exp).map((l) => l.exp).sort()[0] || null,
    drift,
  };
}

// 一次算全部會員(按 member_id 分組，避免 O(會員×紀錄))
export function computeAllCreditStatus({ members = [], creditLogs = [], depositLogs = [], today, soonDays = 7 } = {}) {
  const cBy = {};
  const dBy = {};
  creditLogs.forEach((l) => (cBy[l.member_id] = cBy[l.member_id] || []).push(l));
  depositLogs.forEach((l) => (dBy[l.member_id] = dBy[l.member_id] || []).push(l));
  const out = {};
  members.forEach((m) => {
    out[m.id] = computeCreditStatus({ creditLogs: cBy[m.id], depositLogs: dBy[m.id], balance: m.deposit_balance, today, soonDays });
  });
  return out;
}
