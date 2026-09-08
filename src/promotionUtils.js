// 促銷活動計算共用邏輯：滿額折/滿件折/階梯式件數折扣，POS跟官網都用同一套規則，
// 確保「同一個促銷活動不管在哪裡套用，算出來的折扣金額都一樣」。

// 判斷一個促銷活動目前(依小計金額、購買件數)是否符合套用資格
export function isPromotionEligible(promo, subtotal, qty) {
  if (!promo || !promo.active) return false;
  if (promo.expire_date && new Date(promo.expire_date) < new Date()) return false;
  if (promo.type === "spend_threshold") return subtotal >= (promo.condition_value || 0);
  if (promo.type === "qty_threshold") return qty >= (promo.condition_value || 0);
  if (promo.type === "qty_tiered") return Array.isArray(promo.tiers) && promo.tiers.some((t) => qty >= t.qty);
  return false;
}

// 計算單一促銷活動能折抵多少錢
export function calcPromotionDiscount(promo, subtotal, qty) {
  if (!isPromotionEligible(promo, subtotal, qty)) return 0;

  if (promo.type === "spend_threshold" || promo.type === "qty_threshold") {
    if (promo.discount_type === "percent") {
      // discount_value是折數(例如9.5代表95折)，跟優惠券的計算方式一致：
      // 算出打完折後剩多少錢，原價減去剩餘金額就是折扣金額
      const remaining = subtotal * ((promo.discount_value || 10) / 10);
      return Math.min(Math.round(subtotal - remaining), subtotal);
    }
    return Math.min(Math.round(promo.discount_value || 0), subtotal);
  }

  if (promo.type === "qty_tiered") {
    // 找出「購買件數」符合的最高門檻(件數越多，通常折扣越好，取符合條件裡門檻最高的那一階)
    const eligibleTiers = promo.tiers.filter((t) => qty >= t.qty).sort((a, b) => b.qty - a.qty);
    const tier = eligibleTiers[0];
    if (!tier) return 0;
    if (tier.discount_type === "percent") {
      const remaining = subtotal * ((tier.discount_value || 10) / 10);
      return Math.min(Math.round(subtotal - remaining), subtotal);
    }
    return Math.min(Math.round(tier.discount_value || 0), subtotal);
  }

  return 0;
}

// 依通路(online/store)篩出目前這個通路可以使用的促銷活動清單
export function filterByChannel(promotions, channel) {
  const key = channel === "online" ? "channel_online" : "channel_store";
  return (promotions || []).filter((p) => p[key] !== false);
}

// 從一批候選促銷活動裡，找出目前(依小計/件數)實際符合資格、且套用起來折扣最多的那一個，
// 用於「自動套用」情境：系統自動找最優惠的促銷活動套用，不用客人/店員手動選。
// 只在候選促銷之間彼此不可疊加時使用這個函式；可疊加的活動應該各自獨立計算後加總。
export function findBestAutoPromotion(promotions, subtotal, qty) {
  let best = null;
  let bestDiscount = 0;
  for (const p of promotions || []) {
    const d = calcPromotionDiscount(p, subtotal, qty);
    if (d > bestDiscount) {
      best = p;
      bestDiscount = d;
    }
  }
  return best ? { promotion: best, discount: bestDiscount } : null;
}
