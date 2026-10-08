// 網域自助管理：連接/查詢狀態/移除，合併成一個檔案(用HTTP方法區分動作)，
// 取代原本domain-connect.js/domain-status.js/domain-remove.js三個獨立檔案。
// 這是為了節省Vercel免費方案「每次部署最多12個伺服器端函式」的名額，
// 三個檔案各自對應一種HTTP方法(POST/GET/DELETE)，天生就適合合併成一個檔案。
// 文件參考：
//   連接：https://vercel.com/docs/rest-api/reference/endpoints/projects/add-a-domain-to-a-project
//   查詢：https://vercel.com/docs/rest-api/reference/endpoints/projects/get-a-project-domain

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID || "";

  if (!token || !projectId) {
    res.status(500).json({
      error: "尚未設定VERCEL_API_TOKEN/VERCEL_PROJECT_ID環境變數，請先到Vercel專案設定(Settings→Environment Variables)補上，才能使用自動連接網域功能。",
    });
    return;
  }

  // ── POST：連接新網域 ──────────────────────────────────────────
  if (req.method === "POST") {
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
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: cleanDomain }),
      });
      const data = await vercelRes.json();

      if (!vercelRes.ok) {
        res.status(vercelRes.status).json({ error: data?.error?.message || "連接網域失敗，請確認網域格式正確" });
        return;
      }

      const isApex = cleanDomain.split(".").length === 2;
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
      console.error("domain connect error:", e);
      res.status(500).json({ error: "連接網域時發生錯誤，請稍後再試" });
    }
    return;
  }

  // ── GET：查詢網域驗證狀態 ──────────────────────────────────────
  if (req.method === "GET") {
    try {
      const domain = (req.query.domain || "").trim().toLowerCase();
      if (!domain) {
        res.status(400).json({ error: "缺少網域參數" });
        return;
      }

      const url = `https://api.vercel.com/v9/projects/${projectId}/domains/${domain}${teamId ? `?teamId=${teamId}` : ""}`;
      const vercelRes = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
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
      console.error("domain status error:", e);
      res.status(500).json({ error: "查詢網域狀態時發生錯誤" });
    }
    return;
  }

  // ── DELETE：移除已連接的網域 ────────────────────────────────────
  if (req.method === "DELETE") {
    try {
      const domain = (req.query.domain || "").trim().toLowerCase();
      if (!domain) {
        res.status(400).json({ error: "缺少網域參數" });
        return;
      }

      const url = `https://api.vercel.com/v9/projects/${projectId}/domains/${domain}${teamId ? `?teamId=${teamId}` : ""}`;
      const vercelRes = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });

      if (!vercelRes.ok) {
        const data = await vercelRes.json().catch(() => ({}));
        res.status(vercelRes.status).json({ error: data?.error?.message || "移除失敗" });
        return;
      }

      res.status(200).json({ success: true });
    } catch (e) {
      console.error("domain remove error:", e);
      res.status(500).json({ error: "移除網域時發生錯誤" });
    }
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
