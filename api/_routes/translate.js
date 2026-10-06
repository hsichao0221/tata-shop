// 用MyMemory免費翻譯服務(https://mymemory.translated.net/)把中文商品資料自動翻譯成英文，
// 不需要申請Google/DeepL這類付費API金鑰。翻譯結果只是初稿，ERP後台會讓使用者
// 自己手動校對調整，這裡只負責提供一個「不用手動打字」的起點。
//
// 已知限制：MyMemory單次請求限制500 bytes(中文大約166字內)，長的商品描述容易超過，
// 所以先依句號/換行把長文字切成小段分別翻譯再拼回去。另外匿名使用每日只有5000字元
// 額度，加上一個email參數(de)可以提升到5萬字元，這裡用一個通用信箱提升額度上限。

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// 把長文字依句號/換行切成每段不超過MAX_BYTES的小塊，避免超過MyMemory單次500 bytes的限制
const MAX_BYTES = 450; // 保留一點餘裕，不要卡在剛好500的邊界
function splitIntoChunks(text) {
  // 改用逐字掃描的方式切句子，避免用regex的lookbehind語法((?<=...))，
  // 這個較新的正則語法在Vercel打包伺服器端函式用的esbuild某些設定下可能不支援，
  // 導致整個部署失敗(這正是這次網站掛掉的根本原因)。逐字掃描的效果完全一樣，
  // 只是不依賴這個特定語法。
  const sentences = [];
  let buf = "";
  for (const ch of text) {
    buf += ch;
    if (ch === "。" || ch === "！" || ch === "？" || ch === "\n") {
      sentences.push(buf);
      buf = "";
    }
  }
  if (buf) sentences.push(buf);
  const chunks = [];
  let current = "";
  for (const s of sentences) {
    if (new TextEncoder().encode(current + s).length > MAX_BYTES && current) {
      chunks.push(current);
      current = s;
    } else {
      current += s;
    }
  }
  if (current) chunks.push(current);
  // 如果單一句子本身就超過限制(極端狀況)，直接按字數硬切，避免整段翻譯失敗
  return chunks.flatMap((c) => {
    if (new TextEncoder().encode(c).length <= MAX_BYTES) return [c];
    const pieces = [];
    let buf = "";
    for (const ch of c) {
      if (new TextEncoder().encode(buf + ch).length > MAX_BYTES) { pieces.push(buf); buf = ch; }
      else buf += ch;
    }
    if (buf) pieces.push(buf);
    return pieces;
  });
}

async function translateOne(text) {
  if (!text || !text.trim()) return "";
  const chunks = splitIntoChunks(text.trim());
  const results = [];
  for (const chunk of chunks) {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(chunk)}&langpair=zh-TW|en&de=support@tata-style.com`;
    const res = await fetch(url);
    const data = await res.json();
    results.push(data?.responseData?.translatedText || "");
  }
  return results.join(" ");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // 支援一次翻譯多個欄位(例如name/summary/description一起送)，減少來回次數
    const { texts } = req.body || {};
    if (!texts || typeof texts !== "object") {
      res.status(400).json({ error: "請提供texts物件，例如{name:'...',summary:'...'}" });
      return;
    }
    const keys = Object.keys(texts);
    const results = await Promise.all(keys.map((k) => translateOne(texts[k])));
    const translated = {};
    keys.forEach((k, i) => { translated[k] = results[i]; });
    res.status(200).json({ translated });
  } catch (e) {
    console.error("translate error:", e);
    res.status(500).json({ error: "翻譯時發生錯誤，請稍後再試或手動填寫" });
  }
}
