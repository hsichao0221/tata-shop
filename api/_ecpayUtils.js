// ECPay 檢查碼（CheckMacValue）計算邏輯，依官方規格：
// 1. 依參數的 key 做英文字母排序
// 2. 串成 key1=value1&key2=value2... 的字串，前面加 HashKey=，後面加 &HashIV=
// 3. 做 URL encode，轉小寫
// 4. 做 SHA256 加密
// 5. 轉大寫，即為 CheckMacValue
import crypto from "crypto";

// ECPay 的 URL encode 規則跟標準 JS 的 encodeURIComponent 有幾個字元不同，
// 必須依照官方規定額外處理，否則檢查碼會算錯（這是串接 ECPay 最常見的出錯點）
function ecpayUrlEncode(str) {
  return encodeURIComponent(str)
    .replace(/%2D/g, "-")
    .replace(/%5F/g, "_")
    .replace(/%2E/g, ".")
    .replace(/%21/g, "!")
    .replace(/%2A/g, "*")
    .replace(/%28/g, "(")
    .replace(/%29/g, ")")
    .replace(/%20/g, "+");
}

export function generateCheckMacValue(params, hashKey, hashIV) {
  const sorted = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  const raw = `HashKey=${hashKey}&${sorted}&HashIV=${hashIV}`;
  const encoded = ecpayUrlEncode(raw).toLowerCase();
  const hash = crypto.createHash("sha256").update(encoded).digest("hex");
  return hash.toUpperCase();
}
