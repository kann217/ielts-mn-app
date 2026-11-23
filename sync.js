// Cloud sync via Supabase (email magic-link login, one JSON row per user).
const Sync = (() => {
  const enabled = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY && window.supabase);
  const st = { enabled, user: null, msg: "" };
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

  async function signIn(email) {
    const { error } = await client.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });
    note(error ? "Couldn't send link: " + error.message : "Check your email for the sign-in link");
  }
  async function signOut() { await client.auth.signOut(); }

  if (enabled) {
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    client.auth.onAuthStateChange((_ev, session) => {
      st.user = session?.user || null;
      if (st.user) pull(); else note("");
    });
  }
  return { st, schedule, signIn, signOut };
})();
