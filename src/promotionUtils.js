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

// 自動組合目前所有符合資格的促銷活動：可疊加的活動全部加總、不可疊加的活動裡取單一折扣最高者，
// 兩個方案比較取較優惠的那個，這是「自動套用」情境下的完整組合演算法。
// 跟POS.jsx用的是完全一致的邏輯，確保同一批促銷活動不管在門市還是官網，算出來的折扣都一樣。
export function combinePromotionDiscounts(promotions, subtotal, qty) {
  const eligible = (promotions || []).filter((p) => isPromotionEligible(p, subtotal, qty));
  const stackableTotal = eligible.filter((p) => p.stackable).reduce((sum, p) => sum + calcPromotionDiscount(p, subtotal, qty), 0);
  const nonStackableBest = Math.max(0, ...eligible.filter((p) => !p.stackable).map((p) => calcPromotionDiscount(p, subtotal, qty)));
  return Math.min(Math.max(stackableTotal, nonStackableBest), subtotal);
}

// 回傳「實際被套用」的促銷活動清單(不只是折扣金額)，用於畫面顯示活動名稱給客人看，
// 判斷方式：先算出combinePromotionDiscounts的結果，再判斷是可疊加組合贏、還是某個不可疊加活動單獨贏，
// 對應回傳可疊加組合的全部清單、或該筆不可疊加活動自己。
export function getAppliedPromotions(promotions, subtotal, qty) {
  const eligible = (promotions || []).filter((p) => isPromotionEligible(p, subtotal, qty));
  const stackable = eligible.filter((p) => p.stackable);
  const stackableTotal = stackable.reduce((sum, p) => sum + calcPromotionDiscount(p, subtotal, qty), 0);
  const nonStackable = eligible.filter((p) => !p.stackable);
  let bestNonStackable = null;
  let bestNonStackableDiscount = 0;
  for (const p of nonStackable) {
    const d = calcPromotionDiscount(p, subtotal, qty);
    if (d > bestNonStackableDiscount) {
      bestNonStackable = p;
      bestNonStackableDiscount = d;
    }
  }
  if (stackableTotal >= bestNonStackableDiscount) {
    return stackable.filter((p) => calcPromotionDiscount(p, subtotal, qty) > 0);
  }
  return bestNonStackable ? [bestNonStackable] : [];
}
