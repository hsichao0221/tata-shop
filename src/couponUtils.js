// 優惠券折扣計算共用邏輯，購物車頁、結帳頁都會用到，確保計算規則一致。

// 依「可疊加」規則篩出目前可以合法一起套用的優惠券組合：
// - 不可疊加(stackable=false)的券，跟任何其他券都互斥，選了它就不能再選別的
// - 可疊加(stackable=true)的券，彼此之間可以同時選
// 如果選取清單裡混雜了不可疊加券+其他券，這個函式會自動排除不合法的部分，
// 只保留合法的子集合(以先選的為準)，避免UI狀態跟計算結果不一致。
export function resolveValidSelection(selectedCoupons) {
  if (!selectedCoupons || selectedCoupons.length === 0) return [];
  const hasNonStackable = selectedCoupons.some((c) => !c.coupon.stackable);
  if (hasNonStackable) {
    // 有不可疊加的券混在裡面：只保留「最先選的那張不可疊加券」，其餘全部排除
    const firstNonStackable = selectedCoupons.find((c) => !c.coupon.stackable);
    return [firstNonStackable];
  }
  return selectedCoupons;
}

// 判斷把某張新券加進目前已選清單，會不會違反疊加規則
export function canAddCoupon(newCoupon, currentlySelected) {
  if (currentlySelected.length === 0) return true;
  const hasNonStackableSelected = currentlySelected.some((c) => !c.coupon.stackable);
  if (hasNonStackableSelected) return false; // 已經選了一張不可疊加的，不能再加任何一張
  if (!newCoupon.stackable) return false; // 新選的這張不可疊加，但已經有其他券被選了
  return true;
}

// 計算一組已選優惠券，對指定小計金額能折抵多少錢。
// 依序計算：先套用所有百分比折扣(取最有利的計算順序：從原價依序打折)，
// 再扣除固定金額折扣，折扣總額不會超過小計本身(不會變成負數金額)。
export function calcDiscount(subtotal, selectedCoupons) {
  if (!selectedCoupons || selectedCoupons.length === 0) return 0;
  let remaining = subtotal;
  const percentCoupons = selectedCoupons.filter((c) => c.coupon.discount_type === "percent");
  const amountCoupons = selectedCoupons.filter((c) => c.coupon.discount_type === "amount");

  // 百分比折扣：依序從剩餘金額打折(例如95折+9折，是先打95折、再對打完的結果打9折，
  // 不是直接把百分比相加，這樣比較不會出現折扣總和超過100%的不合理情況)
  for (const c of percentCoupons) {
    const pct = Number(c.coupon.discount_value) || 0;
    remaining = remaining * (pct / 10);
  }
  let discount = subtotal - remaining;

  // 固定金額折扣：直接加總扣除
  for (const c of amountCoupons) {
    discount += Number(c.coupon.discount_value) || 0;
  }

  return Math.min(Math.round(discount), subtotal);
}

// 從會員擁有的優惠券中，篩出「目前這個小計金額已經達到最低消費門檻、還沒使用、也還沒過期」的可用券，
// 用於購物車/結帳頁的「你有優惠券可以用了」主動提示。
export function findUsableCoupons(memberCoupons, subtotal) {
  const now = new Date();
  return (memberCoupons || []).filter((mc) => {
    if (mc.status !== "unused") return false;
    const c = mc.coupon;
    if (!c) return false;
    if (c.channel_online === false) return false; // ERP設定「不適用官網」的優惠券，這裡要正確擋掉
    if (c.expire_date && new Date(c.expire_date) < now) return false;
    if ((c.min_spend || 0) > subtotal) return false;
    return true;
  });
}
