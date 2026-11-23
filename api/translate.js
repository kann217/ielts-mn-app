// Vercel serverless function: English -> Mongolian via MyMemory (free, no key).
// Optional env var MYMEMORY_EMAIL: raises the daily limit from ~5,000 to ~50,000 characters
// and stops sharing the anonymous quota with other apps on Vercel's servers.
// Only signed-in users may call this.
const BAD = /MYMEMORY WARNING|INVALID|QUERY LENGTH LIMIT/i;

async function one(text, email) {
  const u = "https://api.mymemory.translated.net/get?q=" + encodeURIComponent(text) + "&langpair=en%7Cmn" + (email ? "&de=" + encodeURIComponent(email) : "");
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = await r.json();
    const t = j && j.responseData && j.responseData.translatedText;
    if (Number(j.responseStatus) !== 200 || !t || BAD.test(t)) return null;
    return t;
  } catch (e) { return null; }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

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
  const texts = q.slice(0, 5).map((s) => String(s).slice(0, 60));
  if (!texts.length || !texts[0]) return res.status(400).json({ error: "no text" });

  const email = process.env.MYMEMORY_EMAIL || "";
  const translations = await Promise.all(texts.map((t) => (t ? one(t, email) : null)));
  return res.status(200).json({ translations });
};
