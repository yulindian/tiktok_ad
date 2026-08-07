const SUPABASE_URL = process.env.SUPABASE_URL || "https://gtbmnmsvbgruhptzacad.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_rxbVRoV5RfX1IdV5d4qh-w_ITegwtuA";

module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    res.status(500).json({ error: "Supabase is not configured" });
    return;
  }

  try {
    if (req.method === "GET") {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/app_state?id=eq.main&select=state`, {
        headers: supabaseHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        res.status(response.status).json({ error: data.message || "Failed to load cloud state" });
        return;
      }
      res.status(200).json({ state: data[0]?.state || null });
      return;
    }

    if (req.method === "POST") {
      const body = await readJsonBody(req);
      const payload = {
        id: "main",
        state: body.state || {},
        updated_at: new Date().toISOString(),
      };
      const response = await fetch(`${SUPABASE_URL}/rest/v1/app_state`, {
        method: "POST",
        headers: {
          ...supabaseHeaders(),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      if (!response.ok) {
        res.status(response.status).json({ error: parseSupabaseError(text) });
        return;
      }
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST, OPTIONS");
    res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    res.status(500).json({ error: error.message || "Cloud request failed" });
  }
};

function supabaseHeaders() {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
}

function parseSupabaseError(text) {
  try {
    const data = JSON.parse(text);
    return data.message || text;
  } catch {
    return text || "Supabase request failed";
  }
}

function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") return Promise.resolve(JSON.parse(req.body || "{}"));

  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}
