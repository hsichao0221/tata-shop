// 查詢某個網域目前在Vercel上的驗證狀態，給ERP的「重新檢查」按鈕用。
// 文件參考：https://vercel.com/docs/rest-api/reference/endpoints/projects/get-a-project-domain

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID || "";

  if (!token || !projectId) {
    res.status(500).json({ error: "尚未設定VERCEL_API_TOKEN/VERCEL_PROJECT_ID環境變數" });
    return;
  }

  try {
    const domain = (req.query.domain || "").trim().toLowerCase();
    if (!domain) {
      res.status(400).json({ error: "缺少網域參數" });
      return;
    }

    const url = `https://api.vercel.com/v9/projects/${projectId}/domains/${domain}${teamId ? `?teamId=${teamId}` : ""}`;
    const vercelRes = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await vercelRes.json();

    if (!vercelRes.ok) {
      res.status(vercelRes.status).json({ error: data?.error?.message || "查詢失敗，這個網域可能還沒連接過" });
      return;
    }

    res.status(200).json({
      domain: data.name,
      verified: !!data.verified,
      verification: data.verification || [],
    });
  } catch (e) {
    console.error("domain-status error:", e);
    res.status(500).json({ error: "查詢網域狀態時發生錯誤" });
  }
}
