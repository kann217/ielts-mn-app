// Pluggable translator. Providers are tried in order.
// Bolor Toli has no documented public API: once you get official access,
// fill in BOLOR_URL / the parser below and it will be used first.
const BOLOR_URL = ""; // e.g. "/api/bolor?word=" (proxy it through your own server)

async function bolorProvider(word) {
  if (!BOLOR_URL) return null;
  try {
    const r = await fetch(BOLOR_URL + encodeURIComponent(word));
    if (!r.ok) return null;
    const d = await r.json();
    return d.translation || null; // adapt to the real response shape
  } catch { return null; }
}

function localProvider(word) {
  const w = word.toLowerCase();
  const base = w.replace(/(ing|ed|es|s|ly)$/, "");
  const stems = [w, base, base + "e", w.replace(/d$/, ""), w.replace(/ies$/, "y")];
  for (const s of stems) if (LOCAL_DICT[s]) return LOCAL_DICT[s];
  return null;
}

async function translate(word) {
  return (await bolorProvider(word)) || localProvider(word) || null;
}
