// Cloud sync via Supabase (email magic-link login, one JSON row per user).
const Sync = (() => {
  const enabled = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase);
  const st = { enabled, ready: !enabled, user: null, msg: "" };
  let client, timer, pulling = false;

  const note = (msg) => { st.msg = msg; window.appApi?.onSync(); };

  function merge(local, remote) {
    const words = new Map();
    for (const w of [...(remote.words || []), ...(local.words || [])]) {
      const cur = words.get(w.w);
      if (!cur || (w.u || 0) > (cur.u || 0)) words.set(w.w, w);
    }
    const seen = new Set(), log = [];
    for (const l of [...(remote.log || []), ...(local.log || [])]) {
      const k = l.date + l.kind;
      if (!seen.has(k)) { seen.add(k); log.push(l); }
    }
    const settings = ((remote.settings?.u || 0) > (local.settings?.u || 0) ? remote.settings : local.settings) || local.settings;
    return { words: [...words.values()], log: log.sort((a, b) => a.date - b.date), settings };
  }

  async function pull() {
    if (!st.user) return;
    pulling = true;
    try {
      const { data, error } = await client.from("user_data").select("data").eq("user_id", st.user.id).maybeSingle();
      if (error) throw error;
      window.appApi.setData(merge(window.appApi.getData(), data?.data || {}));
      await push(true);
      note("Synced");
    } catch (e) { note("Sync failed: " + (e.message || e)); }
    pulling = false;
  }

  async function push(now) {
    if (!st.user) return;
    const { error } = await client.from("user_data").upsert({ user_id: st.user.id, data: window.appApi.getData(), updated_at: new Date().toISOString() });
    if (error) note("Sync failed: " + error.message); else if (!now) note("Synced");
  }

  function schedule() {
    if (!st.user || pulling) return;
    clearTimeout(timer);
    timer = setTimeout(() => push(false), 1500);
  }

  // Username accounts use a placeholder email under the hood (Supabase auth needs an email).
  const DOMAIN = "@ielts-mn-app.vercel.app";
  const toEmail = (id) => { id = id.trim().toLowerCase(); return id.includes("@") ? id : id + DOMAIN; };
  const friendly = (m) =>
    /invalid login/i.test(m) ? "Wrong username or password." :
    /already registered|already been registered/i.test(m) ? "That username is taken." :
    /password/i.test(m) ? m :
    /rate limit|too many/i.test(m) ? "Too many attempts. Try again in a few minutes." :
    /signups? (are )?(not allowed|disabled)/i.test(m) ? "Registration is closed." :
    /invalid/i.test(m) ? "That username isn't allowed." : m;

  async function login(id, pw) {
    const { error } = await client.auth.signInWithPassword({ email: toEmail(id), password: pw });
    note(error ? friendly(error.message) : "");
  }
  async function register(id, pw) {
    const { data, error } = await client.auth.signUp({ email: toEmail(id), password: pw });
    if (error) return note(friendly(error.message));
    if (!data.session) note("Account created, but email confirmation is on in Supabase. Turn it off (Authentication > Sign In / Providers > Email).");
  }
  async function token() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session ? data.session.access_token : null;
  }
  async function signOut() { await client.auth.signOut(); }

  if (enabled) {
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    client.auth.onAuthStateChange((_ev, session) => {
      st.user = session?.user || null;
      st.ready = true;
      if (st.user) { note("Syncing…"); pull(); } else note("");
    });
  } else {
    setTimeout(() => window.appApi?.onSync(), 0);
  }
  return { st, schedule, login, register, signOut, token };
})();
