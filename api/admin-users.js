// Admin-only user management via Supabase's Auth Admin API.
// Needs SUPABASE_SERVICE_KEY (secret key) in Vercel env vars. Never commit it or ship it to the browser.
// Only the signed-in user whose email equals ADMIN_EMAIL may call this.
const DOMAIN = "@ielts-mn-app.vercel.app";
const toEmail = (id) => { id = String(id || "").trim().toLowerCase(); return id.includes("@") ? id : id + DOMAIN; };
const UUID = /^[0-9a-f-]{36}$/i;

module.exports = async (req, res) => {
  const url = process.env.SUPABASE_URL || "https://mkxetolvxjdztjgnllat.supabase.co";
  const pub = process.env.SUPABASE_KEY || "sb_publishable_lFDzKutWn0ANg6PVxh51OQ_VTqUpx-0"; // public key
  const svc = process.env.SUPABASE_SERVICE_KEY;
  const adminEmail = (process.env.ADMIN_EMAIL || "nyma0082@gmail.com").toLowerCase();
  if (!svc) return res.status(503).json({ error: "Admin not configured: SUPABASE_SERVICE_KEY is missing in Vercel." });

  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Bearer ")) return res.status(401).json({ error: "sign in required" });
  let me;
  try {
    const r = await fetch(url + "/auth/v1/user", { headers: { apikey: pub, Authorization: auth } });
    if (!r.ok) return res.status(401).json({ error: "invalid session" });
    me = await r.json();
  } catch (e) { return res.status(502).json({ error: "auth check failed" }); }
  if (!me.email || me.email.toLowerCase() !== adminEmail || !me.email_confirmed_at) return res.status(403).json({ error: "admins only" });

  const h = { apikey: svc, "Content-Type": "application/json" };
  if (svc.startsWith("eyJ")) h.Authorization = "Bearer " + svc; // legacy JWT keys also go in Authorization
  const call = (path, method, body) => fetch(url + "/auth/v1/admin/" + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const fail = async (r, fallback) => { const j = await r.json().catch(() => ({})); return res.status(r.status >= 500 ? 502 : 400).json({ error: j.msg || j.message || j.error_description || fallback }); };
  const slim = (u) => ({ id: u.id, email: u.email, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at, banned: !!u.banned_until && new Date(u.banned_until) > new Date() });
  const b = req.body || {};

  try {
    if (req.method === "GET") {
      const r = await call("users?per_page=200", "GET");
      if (!r.ok) return fail(r, "Couldn't list users");
      const j = await r.json();
      return res.status(200).json({ users: (j.users || []).map(slim).sort((a, c) => a.created_at.localeCompare(c.created_at)) });
    }
    if (req.method === "POST") {
      if (!b.username || String(b.password || "").length < 6) return res.status(400).json({ error: "Username and a 6+ character password are required." });
      const r = await call("users", "POST", { email: toEmail(b.username), password: String(b.password), email_confirm: true });
      if (!r.ok) return fail(r, "Couldn't create user");
      return res.status(200).json({ ok: "User added.", user: slim(await r.json()) });
    }
    if (req.method === "PUT") {
      if (!UUID.test(b.id || "")) return res.status(400).json({ error: "bad id" });
      const p = {};
      if (b.password !== undefined) { if (String(b.password).length < 6) return res.status(400).json({ error: "Password must be 6+ characters." }); p.password = String(b.password); }
      if (b.username) { p.email = toEmail(b.username); p.email_confirm = true; }
      if (b.banned !== undefined) { if (b.id === me.id) return res.status(400).json({ error: "You can't disable yourself." }); p.ban_duration = b.banned ? "876000h" : "none"; }
      if (!Object.keys(p).length) return res.status(400).json({ error: "nothing to change" });
      const r = await call("users/" + b.id, "PUT", p);
      if (!r.ok) return fail(r, "Couldn't update user");
      return res.status(200).json({ ok: "User updated." });
    }
    if (req.method === "DELETE") {
      if (!UUID.test(b.id || "")) return res.status(400).json({ error: "bad id" });
      if (b.id === me.id) return res.status(400).json({ error: "You can't delete yourself." });
      const r = await call("users/" + b.id, "DELETE");
      if (!r.ok) return fail(r, "Couldn't delete user");
      return res.status(200).json({ ok: "User deleted." });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) { return res.status(502).json({ error: "admin request failed" }); }
};
