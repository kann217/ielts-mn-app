// Vercel serverless function: proxies Google Cloud Translation so the API key stays private.
// Set GOOGLE_TRANSLATE_KEY in Vercel -> Project -> Settings -> Environment Variables.
module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const key = process.env.GOOGLE_TRANSLATE_KEY;
  if (!key) return res.status(503).json({ error: "translation not configured" });

  // Only signed-in users may spend the translation quota: verify the Supabase session token.
  const sbUrl = process.env.SUPABASE_URL || "https://mkxetolvxjdztjgnllat.supabase.co";
  const sbKey = process.env.SUPABASE_KEY || "sb_publishable_lFDzKutWn0ANg6PVxh51OQ_VTqUpx-0"; // public key
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "sign in required" });
  try {
    const u = await fetch(sbUrl + "/auth/v1/user", { headers: { apikey: sbKey, Authorization: auth } });
    if (!u.ok) return res.status(401).json({ error: "invalid session" });
  } catch (e) {
    return res.status(502).json({ error: "auth check failed" });
  }

  const q = Array.isArray(req.body && req.body.q) ? req.body.q : [];
  const texts = q.slice(0, 10).map((s) => String(s).slice(0, 60)).filter(Boolean);
  if (!texts.length) return res.status(400).json({ error: "no text" });

  try {
    const r = await fetch("https://translation.googleapis.com/language/translate/v2?key=" + encodeURIComponent(key), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: texts, source: "en", target: "mn", format: "text" }),
    });
    if (!r.ok) return res.status(502).json({ error: "upstream " + r.status });
    const j = await r.json();
    return res.status(200).json({ translations: j.data.translations.map((t) => t.translatedText) });
  } catch (e) {
    return res.status(502).json({ error: "upstream failed" });
  }
};
