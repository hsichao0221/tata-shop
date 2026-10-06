// 電子發票折讓：串接綠界B2C電子發票API /B2CInvoice/Allowance(紙本折讓，送出後立即生效，
// 依財政部規定還是要寄紙本折讓單給買受人簽名寄回存檔備查——這件事系統沒辦法自動化，
// 是紙本流程，提醒使用者記得做)。
// 支援分批多次折讓：每次折讓的品項/數量可以少於原發票，剩餘可折讓金額由pos_invoices.allowance_amount
// 累計追蹤，介面那邊會先算好「這張發票還剩多少可以折讓」再讓使用者操作，這裡只負責忠實呼叫API、
// 並把這次折讓的金額累加進allowance_amount。

import crypto from "crypto";

const SUPABASE_URL = "https://vsqdzntwavegnwctzzgx.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZzcWR6bnR3YXZlZ253Y3R6emd4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgyMjEyOTMsImV4cCI6MjA5Mzc5NzI5M30.vkZTXD-XnDH07AYrYTA0k8quTWInwLN_s4oMr70u7nY";

const PROD_URL = "https://einvoice.ecpay.com.tw/B2CInvoice/Allowance";
const STAGE_URL = "https://einvoice-stage.ecpay.com.tw/B2CInvoice/Allowance";

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
    const { invoiceId, invoiceNo, invoiceDate, items, customerEmail, currentAllowanceAmount } = req.body || {};
    if (!invoiceNo || !invoiceDate) { res.status(400).json({ error: "缺少發票號碼或開立日期" }); return; }
    if (!items || !Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "缺少要折讓的商品明細" }); return; }

    const allowanceAmount = items.reduce((a, it) => a + (it.amount != null ? it.amount : (it.price || 0) * (it.qty || 1)), 0);
    if (allowanceAmount <= 0) { res.status(400).json({ error: "折讓金額必須大於0" }); return; }

    const allowanceData = {
      MerchantID: MERCHANT_ID,
      InvoiceNo: invoiceNo,
      InvoiceDate: invoiceDate.slice(0, 10),
      AllowanceNotify: customerEmail ? "E" : "N", // 有買受人email才通知，沒有就不通知(門市現場多半沒留email)
      NotifyMail: customerEmail || "",
      AllowanceAmount: Math.round(allowanceAmount),
      Items: items.map((it, idx) => ({
        ItemSeq: idx + 1,
        ItemName: (it.name || "商品").slice(0, 500),
        ItemCount: it.qty || 1,
        ItemWord: it.unit || "件",
        ItemPrice: it.price || 0,
        ItemAmount: it.amount != null ? it.amount : (it.price || 0) * (it.qty || 1),
      })),
    };
    const encryptedData = aesEncrypt(allowanceData, HASH_KEY, HASH_IV);
    const timestamp = Math.floor(Date.now() / 1000);
    const apiUrl = ENV === "prod" ? PROD_URL : STAGE_URL;

    const ecpayRes = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ MerchantID: MERCHANT_ID, RqHeader: { Timestamp: timestamp }, Data: encryptedData }),
    });
    const ecpayJson = await ecpayRes.json();
    if (ecpayJson.TransCode !== 1) {
      res.status(500).json({ error: "呼叫綠界折讓API失敗：" + (ecpayJson.TransMsg || "未知錯誤") });
      return;
    }
    const resultData = aesDecrypt(ecpayJson.Data, HASH_KEY, HASH_IV);
    if (resultData.RtnCode !== 1) {
      res.status(200).json({ success: false, error: resultData.RtnMsg || "折讓失敗" });
      return;
    }

    // 折讓成功，累加已折讓金額，並依「累計折讓金額是否等於發票總額」判斷要標記成全額折讓還是部分折讓
    if (invoiceId) {
      try {
        const newAllowanceTotal = (currentAllowanceAmount || 0) + allowanceAmount;
        const invRes = await fetch(`${SUPABASE_URL}/rest/v1/pos_invoices?id=eq.${invoiceId}&select=total_amount`, {
          headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY },
        });
        const invRows = invRes.ok ? await invRes.json() : [];
        const totalAmount = invRows?.[0]?.total_amount || 0;
        const newStatus = newAllowanceTotal >= totalAmount ? "allowanced" : "partial_allowance";
        await fetch(`${SUPABASE_URL}/rest/v1/pos_invoices?id=eq.${invoiceId}`, {
          method: "PATCH",
          headers: { "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + SUPABASE_ANON_KEY, "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus, allowance_amount: newAllowanceTotal, updated_at: new Date().toISOString() }),
        });
      } catch (e) { console.warn("更新pos_invoices折讓狀態失敗:", e); }
    }

    res.status(200).json({
      success: true,
      allowanceNo: resultData.IA_Allow_No || resultData.AllowanceNo,
      allowanceAmount,
    });
  } catch (e) {
    console.error("einvoice-allowance error:", e);
    res.status(500).json({ error: "折讓發票時發生錯誤：" + e.message });
  }
}
