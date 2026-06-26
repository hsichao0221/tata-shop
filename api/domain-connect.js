// 把客人填的自訂網域註冊到這個Vercel專案。
// Token/專案ID存在環境變數，不寫進程式碼，由ERP那邊呼叫這支API（跨網域請求，所以要開CORS）。
// 文件參考：https://vercel.com/docs/rest-api/reference/endpoints/projects/add-a-domain-to-a-project

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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

  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID || "";

  if (!token || !projectId) {
    res.status(500).json({
      error:
        "尚未設定VERCEL_API_TOKEN/VERCEL_PROJECT_ID環境變數，請先到Vercel專案設定(Settings→Environment Variables)補上，才能使用自動連接網域功能。",
    });
    return;
  }

  try {
    const { domain } = req.body || {};
    if (!domain || !domain.trim()) {
      res.status(400).json({ error: "請輸入網域名稱" });
      return;
    }
    const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");

    const url = `https://api.vercel.com/v10/projects/${projectId}/domains${teamId ? `?teamId=${teamId}` : ""}`;
    const vercelRes = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name: cleanDomain }),
    });
    const data = await vercelRes.json();

    if (!vercelRes.ok) {
      // 常見錯誤：網域已經被其他Vercel專案使用、格式不合法等，把Vercel原本的錯誤訊息轉給前端顯示
      res.status(vercelRes.status).json({ error: data?.error?.message || "連接網域失敗，請確認網域格式正確" });
      return;
    }

    // apex網域(例如 example.com)建議用A記錄；子網域(例如 www.example.com)用CNAME記錄，
    // 這是Vercel官方文件建議的固定值，不管哪個專案都是這組值
    const isApex = cleanDomain.split(".").length === 2; // 簡化判斷：兩段(example.com)視為apex，三段以上(www.example.com)視為子網域
    const dnsInstruction = isApex
      ? { type: "A", host: "@", value: "76.76.21.21" }
      : { type: "CNAME", host: cleanDomain.split(".")[0], value: "cname.vercel-dns.com" };

    res.status(200).json({
      domain: cleanDomain,
      verified: !!data.verified,
      verification: data.verification || [],
      dnsInstruction,
    });
  } catch (e) {
    console.error("domain-connect error:", e);
    res.status(500).json({ error: "連接網域時發生錯誤，請稍後再試" });
  }
}
