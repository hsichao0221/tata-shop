import { createContext, useContext, useState, useEffect } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "tata_cart";

// 從 localStorage 讀取購物車內容（瀏覽器重新整理、關閉再打開都不會消失）
function loadCart() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn("讀取購物車失敗:", e);
    return [];
  }
}

function saveCart(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.warn("儲存購物車失敗:", e);
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => loadCart());

  // items 任何變動都自動同步回 localStorage
  useEffect(() => {
    saveCart(items);
  }, [items]);

  // 加入購物車：用 sku + 款式名稱 當作唯一識別，同樣的商品款式重複加入時，數量累加而不是新增一筆
  function addItem(product, variantName, qty = 1) {
    setItems((prev) => {
      const key = `${product.sku}__${variantName || ""}`;
      const existing = prev.find((i) => i.key === key);
      if (existing) {
        return prev.map((i) =>
          i.key === key ? { ...i, qty: i.qty + qty } : i
        );
      }
      return [
        ...prev,
        {
          key,
          sku: product.sku,
          name: product.name,
          variantName: variantName || "",
          price: product.salePrice || product.price,
          originalPrice: product.price,
          image: product.images?.[0] || "",
          qty,
        },
      ];
    });
  }

  function updateQty(key, qty) {
    if (qty <= 0) {
      removeItem(key);
      return;
    }
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, qty } : i)));
  }

  function removeItem(key) {
    setItems((prev) => prev.filter((i) => i.key !== key));
  }

  function clearCart() {
    setItems([]);
  }

  const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
  const totalPrice = items.reduce((sum, i) => sum + i.qty * i.price, 0);

  return (
    <CartContext.Provider
      value={{ items, addItem, updateQty, removeItem, clearCart, totalQty, totalPrice }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart 必須在 CartProvider 內使用");
  return ctx;
}
