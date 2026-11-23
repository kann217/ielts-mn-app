const $ = (s) => document.querySelector(s);
const DAY = 86400000;
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const save = (k, v) => {
  localStorage.setItem(k, JSON.stringify(v));
  if (["words", "log", "settings"].includes(k) && typeof Sync !== "undefined") Sync.schedule();
};
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const state = {
  tab: "today",
  settings: load("settings", { testDate: "", target: 7, days: 5 }),
  words: load("words", []),     // {w, t, ease, interval, due}
  log: load("log", []),         // {date, kind, score}
  sel: {}, checked: false, sheet: null, reveal: false,
};

function startOfDay(t = Date.now()) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function sessionsThisWeek() {
  const d = new Date(); const monday = startOfDay(Date.now() - ((d.getDay() + 6) % 7) * DAY);
  return new Set(state.log.filter((l) => l.date >= monday).map((l) => startOfDay(l.date))).size;
}
function logSession(kind, score) { state.log.push({ date: Date.now(), kind, score }); save("log", state.log); }
const dueWords = () => state.words.filter((w) => w.due <= Date.now());
const activeDays = () => new Set(state.log.map((l) => startOfDay(l.date)));
function streak() {
  const days = activeDays(); let d = startOfDay(), n = 0;
  if (!days.has(d)) d -= DAY;
  while (days.has(d)) { n++; d -= DAY; }
  return n;
}
function ring(pct, size, color = "#fff", track = "rgba(255,255,255,.28)") {
  const r = size / 2 - 7, c = 2 * Math.PI * r;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${track}" stroke-width="9"/><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, pct))}"/></svg><b style="color:${color}">${Math.round(pct * 100)}%</b></div>`;
}
function weekDots() {
  const days = activeDays(), todayS = startOfDay(), mon = todayS - ((new Date().getDay() + 6) % 7) * DAY;
  return `<div class="week">${"MTWTFSS".split("").map((l, i) => { const d = mon + i * DAY; return `<div class="dot${days.has(d) ? " on" : ""}${d === todayS ? " today" : ""}"><i>${days.has(d) ? "✓" : ""}</i>${l}</div>`; }).join("")}</div>`;
}

// ---- SRS (SM-2 lite) ----
function grade(w, g) { // g: 0 again, 1 hard, 2 good, 3 easy
  w.u = Date.now();
  if (g === 0) { w.interval = 0; w.ease = Math.max(1.3, w.ease - 0.2); w.due = Date.now() + 10 * 60000; }
  else {
    w.interval = w.interval === 0 ? 1 : Math.round(w.interval * w.ease * [0, 0.8, 1, 1.3][g]);
    w.ease = Math.max(1.3, w.ease + [0, -0.1, 0, 0.1][g]);
    w.due = startOfDay() + Math.max(1, w.interval) * DAY;
  }
  save("words", state.words);
}
function addWord(w, t, extra = {}) {
  if (state.words.some((x) => x.w === w)) return;
  state.words.push({ w, t, ...extra, ease: 2.5, interval: 0, due: Date.now(), u: Date.now() });
  save("words", state.words);
}

// ---- Views ----
function viewToday() {
  const s = state.settings, done = sessionsThisWeek();
  const days = s.testDate ? Math.ceil((new Date(s.testDate) - Date.now()) / DAY) : null;
  const st = streak();
  return `<div class="hero"><div class="row"><div>
    <span class="streak">🔥 ${st} day streak</span>
    <div class="big" style="margin-top:12px">${done} of ${s.days}</div><div class="sub">sessions this week</div>
    <div style="margin-top:8px"><span class="chip">Target band ${s.target}</span> <span class="chip">${days === null ? "Set test date" : days > 0 ? days + " days left" : "Test passed"}</span></div></div>
    ${ring(done / s.days, 96)}</div>${weekDots()}</div>
  <h2 style="margin-left:4px">Today's plan · ~60 min</h2>
  <button class="tile" data-go="practice"><span class="ic c1">📖</span><span><b>Reading passage</b><span class="mute">Passage and questions · 25 min</span></span><span class="go">›</span></button>
  <button class="tile" data-go="practice"><span class="ic c2">✍️</span><span><b>Writing Task 2</b><span class="mute">Draft an essay · 20 min</span></span><span class="go">›</span></button>
  <button class="tile" data-go="words"><span class="ic c3">🧠</span><span><b>Vocabulary review</b><span class="mute">${dueWords().length} ${dueWords().length === 1 ? "word" : "words"} due · 15 min</span></span><span class="go">›</span></button>
  <div class="card" style="margin-top:12px"><h2>Settings</h2>
  <label class="mute">Test date<br><input type="date" id="td" value="${s.testDate}"></label><br><br>
  <label class="mute">Target band <input type="number" id="tg" min="4" max="9" step="0.5" value="${s.target}" style="width:70px"></label>
  <label class="mute" style="margin-left:12px">Days/week <input type="number" id="dw" min="1" max="7" value="${s.days}" style="width:60px"></label></div>
  ${accountHtml()}`;
}
function accountHtml() {
  if (typeof Sync === "undefined" || !Sync.st.enabled) return `<div class="card"><h2>Sync</h2><div class="mute">Not configured. Data stays on this device. Add your Supabase keys in config.js to turn on sync.</div></div>`;
  const u = Sync.st.user, msg = Sync.st.msg ? `<div class="mute" style="margin-top:8px">${esc(Sync.st.msg)}</div>` : "";
  return u
    ? `<div class="card"><h2>Sync</h2><div class="row"><span class="mute">${esc(u.email || "Signed in")}</span><button class="btn ghost" id="signout" style="width:auto;padding:8px 14px">Sign out</button></div>${msg}</div>`
    : `<div class="card"><h2>Sync across devices</h2><input type="email" id="em" placeholder="you@example.com" style="width:100%;padding:10px;margin-bottom:8px;border:1px solid var(--line);border-radius:10px;font:inherit;background:var(--card);color:var(--ink)"><button class="btn ghost" id="signin">Email me a sign-in link</button>${msg}</div>`;
}

function viewPractice() {
  const p = PASSAGE;
  const words = p.text.split(/(\s+)/).map((t) => /\S/.test(t) ? `<span class="w" data-w="${esc(t.replace(/[^A-Za-z'-]/g, ""))}">${esc(t)}</span>` : t).join("");
  const qs = p.questions.map((q, i) => `<div class="card"><b>${i + 1}. ${esc(q.q)}</b>${q.o.map((o, j) => {
    let c = "opt"; if (state.checked) c += j === q.a ? " ok" : state.sel[i] === j ? " bad" : ""; else if (state.sel[i] === j) c += " sel";
    return `<button class="${c}" data-q="${i}" data-o="${j}">${esc(o)}</button>`; }).join("")}</div>`).join("");
  const score = state.checked ? p.questions.filter((q, i) => state.sel[i] === q.a).length : null;
  return `<h1>Reading</h1><div class="card"><h2>${esc(p.title)}</h2><div class="passage">${words}</div>
  <div class="mute" style="margin-top:8px">Tap any word for its Mongolian meaning.</div></div>${qs}
  ${state.checked ? `<div class="card score"><div class="big">${score} / ${p.questions.length}</div><div class="mute">${score === p.questions.length ? "Perfect. Keep it up!" : score >= 2 ? "Nice work. Review the red answers." : "Good start. Reread the passage and try again."}</div></div>` : `<button class="btn" id="check">Check answers</button>`}
  <div class="card" style="margin-top:12px"><h2>Writing Task 2</h2><p class="mute">${esc(WRITING_PROMPT)}</p>
  <textarea id="essay" placeholder="Write your essay here">${esc(load("essay", ""))}</textarea>
  <div class="row mute"><span id="wc"></span><button class="btn ghost" id="done" style="width:auto;padding:8px 14px">Mark done</button></div></div>
  ${state.sheet ? sheetHtml() : ""}`;
}
function sheetHtml() {
  const s = state.sheet, d = s.data;
  const head = `<div class="row"><b>${esc(s.w)}${d && d.pos ? ` <span class="mute">· ${esc(d.pos)}</span>` : ""}</b><button id="x" style="background:none;border:0;color:var(--mute)">Close</button></div>`;
  if (!d) return `<div class="sheet">${head}<div class="mute" style="margin-top:6px">Looking up…</div></div>`;
  const saved = state.words.some((x) => x.w === d.word);
  const rel = d.related.length ? `<div class="mute" style="margin-top:10px">Related words</div><div class="rels">${d.related.map((r) => `<button class="rel" data-rw="${esc(r.en)}">${esc(r.en)}${r.mn ? " · " + esc(r.mn) : ""}</button>`).join("")}</div>` : "";
  const body = d.mn || d.def
    ? `<div class="tr">${d.mn ? esc(d.mn) : "<span class='mute' style='font-size:15px;font-weight:400'>No Mongolian translation</span>"}</div>
       ${d.def ? `<div style="font-size:15px">${esc(d.def)}</div>` : ""}${d.example ? `<div class="mute" style="margin-top:4px;font-style:italic">“${esc(d.example)}”</div>` : ""}${rel}
       <button class="btn ghost" id="addw" style="margin-top:12px">${saved ? "Saved" : "Save to words"}</button>`
    : `<div class="mute" style="margin-top:6px">Nothing found for this word.</div>`;
  return `<div class="sheet">${head}${body}</div>`;
}

function viewWords() {
  const due = dueWords(), w = due[0];
  const card = w ? `<div class="card flash"><div class="big">${esc(w.w)}</div>
    <div style="margin-top:18px">${state.reveal ? `${backHtml(w)}` : `<button class="btn ghost" id="rev" style="width:auto;padding:11px 22px">Show Mongolian</button>`}</div></div>
    ${state.reveal ? `<div class="grade">${["Again", "Hard", "Good", "Easy"].map((n, i) => `<button data-g="${i}">${n}</button>`).join("")}</div>` : ""}`
    : `<div class="card"><b>${state.words.length ? "All caught up" : "No words yet"}</b><p class="mute">${state.words.length ? "Come back later for your next review." : "Tap words while reading to save them here."}</p></div>`;
  return `<h1>Words</h1><div class="mute" style="margin-bottom:8px">${due.length} due · ${state.words.length} total</div>${card}`;
}

function viewProgress() {
  const reads = state.log.filter((l) => l.kind === "reading");
  const avg = reads.length ? (reads.reduce((a, l) => a + l.score, 0) / reads.length * 100).toFixed(0) : "–";
  const rows = state.log.slice(-8).reverse().map((l) => `<div class="row mute"><span>${new Date(l.date).toLocaleDateString()} · ${l.kind}</span><span>${l.kind === "reading" ? Math.round(l.score * 100) + "%" : "done"}</span></div>`).join("");
  const days = activeDays(), last7 = [...Array(7)].map((_, i) => startOfDay() - (6 - i) * DAY);
  const per = last7.map((d) => state.log.filter((l) => startOfDay(l.date) === d).length), mx = Math.max(1, ...per);
  const chart = `<div class="bars">${last7.map((d, i) => `<div><i style="height:${(per[i] / mx) * 70 + 4}px"></i>${"SMTWTFS"[new Date(d).getDay()]}</div>`).join("")}</div>`;
  return `<h1>Progress</h1>
  <div class="stat"><div><b>${streak()}</b><span>day streak</span></div><div><b>${state.words.length}</b><span>words</span></div><div><b>${avg}${avg === "–" ? "" : "%"}</b><span>reading avg</span></div></div>
  <div class="card"><div class="row"><h2 style="margin:0">Last 7 days</h2><span class="mute">${sessionsThisWeek()} / ${state.settings.days} this week</span></div>${chart}</div>
  <div class="card"><h2>Recent</h2>${rows || "<span class='mute'>Nothing yet.</span>"}</div>`;
}

const views = { today: viewToday, practice: viewPractice, words: viewWords, progress: viewProgress };
const gated = () => typeof Sync === "undefined" || (Sync.st.enabled && !Sync.st.user);
function loginHtml() {
  if (typeof Sync === "undefined" || !Sync.st.ready) return `<div class="card" style="margin-top:30vh;text-align:center"><div class="mute">Loading…</div></div>`;
  return `<div class="hero" style="margin-top:12vh"><div class="big">IELTS Coach</div><div class="sub">Sign in to continue</div></div>
  <div class="card"><input type="email" id="em" placeholder="you@example.com" autocomplete="email" style="width:100%;padding:12px;margin-bottom:10px;border:2px solid var(--line);border-radius:12px;font:inherit;background:var(--card);color:var(--ink)">
  <button class="btn" id="signin">Email me a sign-in link</button>
  ${Sync.st.msg ? `<div class="mute" style="margin-top:10px">${esc(Sync.st.msg)}</div>` : ""}</div>`;
}
function backHtml(w) {
  const rel = (w.rel || []).filter((r) => r.mn);
  return `<div class="back">${esc(w.t)}</div>${w.def ? `<div class="mute" style="margin-top:8px">${w.pos ? esc(w.pos) + " · " : ""}${esc(w.def)}</div>` : ""}${rel.length ? `<div class="rels">${rel.map((r) => `<span class="rel">${esc(r.en)} · ${esc(r.mn)}</span>`).join("")}</div>` : ""}`;
}
async function openWord(w) {
  state.sheet = { w }; render();
  const data = await lookup(w);
  if (state.sheet && state.sheet.w === w) { state.sheet = { w, data }; render(); }
}
function render() {
  const lock = gated();
  $("#nav").style.display = lock ? "none" : "";
  $("#view").innerHTML = lock ? loginHtml() : views[state.tab]();
  document.querySelectorAll("#nav button").forEach((b) => b.classList.toggle("on", b.dataset.tab === state.tab));
  const e = $("#essay"), wc = $("#wc");
  if (e) { const upd = () => (wc.textContent = (e.value.trim() ? e.value.trim().split(/\s+/).length : 0) + " words"); upd(); e.oninput = () => { save("essay", e.value); upd(); }; }
}
function go(tab) { state.tab = tab; state.sheet = null; state.reveal = false; render(); window.scrollTo(0, 0); }

// ---- Events ----
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("button, .w") || ev.target;
  if (t.dataset.tab) return go(t.dataset.tab);
  if (t.dataset.go) return go(t.dataset.go);
  if (t.dataset.w || t.dataset.rw) return openWord(t.dataset.w || t.dataset.rw);
  if (t.id === "signin") {
    const em = $("#em").value.trim();
    if (!/^\S+@\S+\.\S+$/.test(em)) { Sync.st.msg = "Enter a valid email"; return render(); }
    Sync.st.msg = "Sending…"; render(); return Sync.signIn(em);
  }
  if (t.id === "signout") return Sync.signOut();
  if (t.id === "x") { state.sheet = null; return render(); }
  if (t.id === "addw") { const d = state.sheet.data; addWord(d.word, d.mn, { pos: d.pos, def: d.def, rel: d.related.filter((r) => r.mn) }); return render(); }
  if (t.dataset.q !== undefined && !state.checked) { state.sel[t.dataset.q] = +t.dataset.o; return render(); }
  if (t.id === "check") { state.checked = true; logSession("reading", PASSAGE.questions.filter((q, i) => state.sel[i] === q.a).length / PASSAGE.questions.length); return render(); }
  if (t.id === "done") { logSession("writing", 1); t.textContent = "Logged"; return; }
  if (t.id === "rev") { state.reveal = true; return render(); }
  if (t.dataset.g !== undefined) { grade(dueWords()[0], +t.dataset.g); state.reveal = false; if (!dueWords().length) logSession("vocab", 1); return render(); }
});
document.addEventListener("change", (ev) => {
  const s = state.settings;
  if (!["td", "tg", "dw"].includes(ev.target.id)) return;
  s.u = Date.now();
  if (ev.target.id === "td") s.testDate = ev.target.value;
  if (ev.target.id === "tg") s.target = +ev.target.value;
  if (ev.target.id === "dw") s.days = +ev.target.value;
  save("settings", s); render();
});

window.appApi = {
  getData: () => ({ words: state.words, log: state.log, settings: state.settings }),
  setData: (d) => {
    state.words = d.words; state.log = d.log; state.settings = d.settings;
    localStorage.setItem("words", JSON.stringify(d.words));
    localStorage.setItem("log", JSON.stringify(d.log));
    localStorage.setItem("settings", JSON.stringify(d.settings));
  },
  onSync: () => { const g = gated(); if (g !== state.lastGate || state.tab !== "practice") { state.lastGate = g; render(); } },
};

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
render();
