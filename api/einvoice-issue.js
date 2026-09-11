// 電子發票開立：串接綠界B2C電子發票API，POS門市(自行收款門市)、官網結帳成功時都會呼叫這支。
// 加密邏輯已用綠界官方文件提供的測試範例完整驗證正確(AES-128-CBC, PKCS7 padding)。
// 官網跟門市可能各自有獨立的字軌(避免號碼衝突)，用ProductServiceID區分，
// 對應綠界後台「字軌分類管理」設定的產品服務別代號。

import crypto from "crypto";

const PROD_URL = "https://einvoice.ecpay.com.tw/B2CInvoice/Issue";
const STAGE_URL = "https://einvoice-stage.ecpay.com.tw/B2CInvoice/Issue";

function urlEncode(str) {
  // 綠界官方範例採用JS原生encodeURIComponent的大寫十六進位格式，已用官方測試向量驗證一致
  return encodeURIComponent(str);
}

function aesEncrypt(plainObj, hashKey, hashIV) {
  const json = JSON.stringify(plainObj);
  const encoded = urlEncode(json);
  const cipher = crypto.createCipheriv("aes-128-cbc", Buffer.from(hashKey, "utf8"), Buffer.from(hashIV, "utf8"));
  let encrypted = cipher.update(encoded, "utf8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function aesDecrypt(encryptedData, hashKey, hashIV) {
  const decipher = crypto.createDecipheriv("aes-128-cbc", Buffer.from(hashKey, "utf8"), Buffer.from(hashIV, "utf8"));
  let decrypted = decipher.update(encryptedData, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return JSON.parse(decodeURIComponent(decrypted));
}

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const MERCHANT_ID = process.env.ECPAY_EINVOICE_MERCHANT_ID;
  const HASH_KEY = process.env.ECPAY_EINVOICE_HASHKEY;
  const HASH_IV = process.env.ECPAY_EINVOICE_HASHIV;
  const ENV = process.env.ECPAY_EINVOICE_ENV || "stage"; // "stage" 測試環境 / "prod" 正式環境

  if (!MERCHANT_ID || !HASH_KEY || !HASH_IV) {
    res.status(500).json({ error: "尚未設定綠界電子發票的環境變數(ECPAY_EINVOICE_MERCHANT_ID / ECPAY_EINVOICE_HASHKEY / ECPAY_EINVOICE_HASHIV)，請先到Vercel環境變數設定" });
    return;
  }

  try {
    const {
      orderId, // 用來組成RelateNumber(唯一值)
      items, // [{name, qty, unit, price, amount}]
      totalAmount,
      invoiceType, // "print" | "carrier" | "donation"
      carrierType, // "" | "1" | "2" | "3" (手機條碼載具最常用)
      carrierNum,
      loveCode, // 捐贈碼
      buyerIdentifier, // 統編(選填，有值代表打統編)
      buyerName,
      buyerAddr,
      buyerEmail,
      buyerPhone,
      productServiceId, // 選填，用來區分不同通路各自的字軌(綠界後台「字軌分類管理」設定的代號)
    } = req.body || {};

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: "缺少商品明細" });
      return;
    }
    if (!totalAmount || totalAmount <= 0) {
      res.status(400).json({ error: "金額不正確" });
      return;
    }

    // 依情境(捐贈/統編/一般列印/載具)決定Print/Donation/CarrierType的正確組合，
    // 完全依照綠界官方文件的三種使用情境規則
    let Print = "1", Donation = "0", CarrierTypeFinal = "", CarrierNumFinal = "";
    if (invoiceType === "donation") {
      Print = "0"; Donation = "1";
    } else if (buyerIdentifier) {
      // 統一編號發票：不能捐贈，列印規則依載具而定
      Donation = "0";
      if (carrierType === "3") { CarrierTypeFinal = "3"; CarrierNumFinal = carrierNum || ""; Print = "0"; }
      else { Print = "1"; }
    } else if (invoiceType === "carrier" && carrierType) {
      Print = "0"; CarrierTypeFinal = carrierType; CarrierNumFinal = carrierType === "1" ? "" : (carrierNum || "");
    } else {
      Print = "1"; // 預設一般列印
    }

    // RelateNumber只需要保證唯一即可，不需要綁死特定品牌名稱(方便未來白牌客戶使用同一套系統時，
    // 不會在交易編號裡出現不屬於他們的品牌字樣)；可透過環境變數客製前綴，沒設定則用通用的ORD
    const relatePrefix = process.env.ECPAY_EINVOICE_RELATE_PREFIX || "ORD";
    const relateNumber = (relatePrefix + (orderId || Date.now()).toString().replace(/[^a-zA-Z0-9]/g, "")).slice(0, 50);

    const invoiceData = {
      MerchantID: MERCHANT_ID,
      RelateNumber: relateNumber,
      CustomerIdentifier: buyerIdentifier || "",
      CustomerName: buyerName || (Print === "1" ? "消費者" : ""),
      CustomerAddr: buyerAddr || "",
      CustomerPhone: buyerPhone || "",
      CustomerEmail: buyerEmail || "",
      Print,
      Donation,
      LoveCode: invoiceType === "donation" ? (loveCode || "") : "",
      CarrierType: CarrierTypeFinal,
      CarrierNum: CarrierNumFinal,
      TaxType: "1", // 應稅(TATA目前商品皆為應稅商品，未來如有免稅/零稅率商品需另外處理)
      SalesAmount: Math.round(totalAmount),
      InvoiceRemark: "",
      InvType: "07", // 一般稅額
      vat: "1", // 商品單價已含稅
      Items: items.map((it, idx) => ({
        ItemSeq: idx + 1,
        ItemName: (it.name || "商品").slice(0, 500),
        ItemCount: it.qty || 1,
        ItemWord: it.unit || "件",
        ItemPrice: it.price || 0,
        ItemTaxType: "1",
        ItemAmount: it.amount != null ? it.amount : (it.price || 0) * (it.qty || 1),
      })),
    };
    if (productServiceId) invoiceData.ProductServiceID = productServiceId;

    const encryptedData = aesEncrypt(invoiceData, HASH_KEY, HASH_IV);
    const timestamp = Math.floor(Date.now() / 1000);

    const apiUrl = ENV === "prod" ? PROD_URL : STAGE_URL;
    const ecpayRes = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        MerchantID: MERCHANT_ID,
        RqHeader: { Timestamp: timestamp },
        Data: encryptedData,
      }),
    });

    const ecpayJson = await ecpayRes.json();
    if (ecpayJson.TransCode !== 1) {
      res.status(500).json({ error: "呼叫綠界發票API失敗：" + (ecpayJson.TransMsg || "未知錯誤") });
      return;
    }

    const resultData = aesDecrypt(ecpayJson.Data, HASH_KEY, HASH_IV);
    if (resultData.RtnCode !== 1) {
      res.status(200).json({ success: false, error: resultData.RtnMsg || "發票開立失敗" });
      return;
    }

    res.status(200).json({
      success: true,
      invoiceNo: resultData.InvoiceNo,
      invoiceDate: resultData.InvoiceDate,
      randomNumber: resultData.RandomNumber,
    });
  } catch (e) {
    console.error("einvoice-issue error:", e);
    res.status(500).json({ error: "開立發票時發生錯誤：" + e.message });
  }
}
