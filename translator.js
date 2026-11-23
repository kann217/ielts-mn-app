// Word lookup: definition + synonyms (Free Dictionary API), related words (Datamuse),
// Mongolian via our /api/translate (Google). Falls back to the offline dictionary.
const cache = new Map();

function localProvider(word) {
  const w = word.toLowerCase();
  const base = w.replace(/(ing|ed|es|s|ly)$/, "");
  for (const s of [w, base, base + "e", w.replace(/d$/, ""), w.replace(/ies$/, "y")]) if (LOCAL_DICT[s]) return LOCAL_DICT[s];
  return null;
}

async function getJson(url, opts) {
  try {
    const r = await fetch(url, opts);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

async function fetchDict(word) {
  const base = word.replace(/(ing|ed|es|s|ly)$/, "");
  for (const cand of [...new Set([word, base, base + "e", word.replace(/ies$/, "y")])]) {
    const j = await getJson("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(cand));
    if (!Array.isArray(j) || !j[0]) continue;
    const meanings = j[0].meanings || [], m = meanings[0] || {};
    const defs = m.definitions || [];
    const d = defs.find((x) => x.definition && x.definition.length > 20 && !x.definition.startsWith("(")) || defs[0] || {};
    const syn = meanings.flatMap((x) => [...(x.synonyms || []), ...(x.definitions || []).flatMap((y) => y.synonyms || [])]);
    return { lemma: cand, pos: m.partOfSpeech, def: d.definition, example: d.example, synonyms: syn };
  }
  return { synonyms: [] };
}

async function fetchRelated(word) {
  const q = encodeURIComponent(word);
  const [syn, ml] = await Promise.all([
    getJson("https://api.datamuse.com/words?max=6&rel_syn=" + q),
    getJson("https://api.datamuse.com/words?max=6&ml=" + q),
  ]);
  return [...(Array.isArray(syn) ? syn : []), ...(Array.isArray(ml) ? ml : [])].map((x) => x.word);
}

async function mtTranslate(words) {
  const tok = typeof Sync !== "undefined" ? await Sync.token() : null;
  const headers = { "Content-Type": "application/json" };
  if (tok) headers.Authorization = "Bearer " + tok;
  const j = await getJson("/api/translate", { method: "POST", headers, body: JSON.stringify({ q: words }) });
  return j && Array.isArray(j.translations) ? j.translations : null;
}

async function lookup(word) {
  const key = word.toLowerCase();
  if (cache.has(key)) return cache.get(key);
  const [dict, rel] = await Promise.all([fetchDict(key), fetchRelated(key)]);
  const skip = new Set([key, dict.lemma]);
  const related = [...new Set([...dict.synonyms, ...rel])].filter((x) => !skip.has(x) && /^[a-z-]+$/i.test(x)).slice(0, 6);
  const tr = await mtTranslate([dict.lemma || key, ...related]);
  const mn = localProvider(key) || (tr && tr[0]) || null; // curated offline entries beat machine translation
  const data = {
    word: key, pos: dict.pos, def: dict.def, example: dict.example, mn,
    related: related.map((en, i) => ({ en, mn: (tr && tr[i + 1]) || null })),
  };
  if (mn || dict.def) cache.set(key, data);
  return data;
}
