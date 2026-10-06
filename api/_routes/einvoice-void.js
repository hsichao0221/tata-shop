// 電子發票作廢：串接綠界B2C電子發票API /B2CInvoice/Invalid。
// 綠界規則(官方文件)：
// - 發票若已被折讓過，無法直接作廢，要先把該發票的全部折讓紀錄作廢，才能作廢原發票
// - 每年奇數月的13號23:59:59以後(已申報至財政部)，無法作廢前兩個月開立的發票
//   例如3月14號時，不能作廢1、2月所開立的發票
// 這兩條規則綠界自己的API會擋，這裡不重複判斷，只忠實回傳綠界的錯誤訊息。

import crypto from "crypto";

const SUPABASE_URL = "https://vsqdzntwavegnwctzzgx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcWR6bnR3YXZlZ253Y3R6emd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjEyOTMsImV4cCI6MjA5Mzc5NzI5M30.vkZTXD-XnDH07AYrYTA0k8quTWInwLN_s4oMr70u7nY";

const PROD_URL = "https://einvoice.ecpay.com.tw/B2CInvoice/Invalid";
const STAGE_URL = "https://einvoice-stage.ecpay.com.tw/B2CInvoice/Invalid";

function aesEncrypt(plainObj, hashKey, hashIV) {
  const json = JSON.stringify(plainObj);
  const encoded = encodeURIComponent(json);
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
  const ENV = process.env.ECPAY_EINVOICE_ENV || "stage";

  if (!MERCHANT_ID || !HASH_KEY || !HASH_IV) {
    res.status(500).json({ error: "尚未設定綠界電子發票的環境變數，請先到Vercel環境變數設定" });
    return;
  }

  try {
    const { invoiceId, invoiceNo, invoiceDate, reason } = req.body || {};
    // invoiceId是pos_invoices這張表自己的id(bigserial)，用來反查、更新這筆紀錄的status，
    // 跟invoiceNo(綠界發票號碼，作廢時真正要傳給綠界的參數)是兩件不同的東西，不要混用。
    if (!invoiceNo || !invoiceDate) {
      res.status(400).json({ error: "缺少發票號碼或開立日期" });
      return;
    }
    if (!reason || !reason.trim()) {
      res.status(400).json({ error: "請填寫作廢原因" });
      return;
    }

    const invalidData = {
      MerchantID: MERCHANT_ID,
      InvoiceNo: invoiceNo,
      InvoiceDate: invoiceDate.slice(0, 10), // 綠界要求yyyy-MM-dd，開立時存的invoice_date可能帶時分秒，這裡截斷
      Reason: reason.trim().slice(0, 20), // 綠界作廢原因欄位上限20字
    };
    const encryptedData = aesEncrypt(invalidData, HASH_KEY, HASH_IV);
    const timestamp = Math.floor(Date.now() / 1000);
    const apiUrl = ENV === "prod" ? PROD_URL : STAGE_URL;

    const ecpayRes = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ MerchantID: MERCHANT_ID, RqHeader: { Timestamp: timestamp }, Data: encryptedData }),
    });
    const ecpayJson = await ecpayRes.json();
    if (ecpayJson.TransCode !== 1) {
      res.status(500).json({ error: "呼叫綠界作廢API失敗：" + (ecpayJson.TransMsg || "未知錯誤") });
      return;
    }
    const resultData = aesDecrypt(ecpayJson.Data, HASH_KEY, HASH_IV);
    if (resultData.RtnCode !== 1) {
      res.status(200).json({ success: false, error: resultData.RtnMsg || "作廢失敗" });
      return;
    }

    // 作廢成功，更新pos_invoices這筆紀錄的狀態
    if (invoiceId) {
      try {
        await fetch(`${SUPABASE_URL}/rest/v1/pos_invoices?id=eq.${invoiceId}`, {
          method: "PATCH",
          headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ status: "void", updated_at: new Date().toISOString() }),
        });
      } catch (e) { console.warn("更新pos_invoices作廢狀態失敗:", e); }
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error("einvoice-void error:", e);
    res.status(500).json({ error: "作廢發票時發生錯誤：" + e.message });
  }
}
