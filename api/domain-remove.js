// 從這個Vercel專案移除已連接的網域，給ERP的「移除這個網域」按鈕用。

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }
  if (req.method !== "DELETE") {
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
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!vercelRes.ok) {
      const data = await vercelRes.json().catch(() => ({}));
      res.status(vercelRes.status).json({ error: data?.error?.message || "移除失敗" });
      return;
    }

    res.status(200).json({ success: true });
  } catch (e) {
    console.error("domain-remove error:", e);
    res.status(500).json({ error: "移除網域時發生錯誤" });
  }
}
