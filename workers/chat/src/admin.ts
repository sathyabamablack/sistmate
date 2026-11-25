/**
 * The admin panel at /admin. The key comes from the link's #fragment (never sent to the server in
 * the URL) or the input, and is kept in sessionStorage for the tab. The page is plain HTML and
 * script in one string, so it needs no build step; everything shown is set with textContent.
 */
export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#0d1716">
<title>sistmate chat admin</title>
<style>
  :root {
    color-scheme: dark;
    --bg:#0d1716; --panel:#111e1c; --panel2:#152624; --fg:#e6efe9; --muted:#9db0a9; --faint:#6f857d;
    --line:#22322f; --accent:#6fd1ad; --gold:#f0c36a; --danger:#ff8a7a; --ok:#6fd1ad;
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  button, input, select, textarea { font:inherit; color:inherit; }
  header { position:sticky; top:0; z-index:5; background:var(--bg); border-bottom:1px solid var(--line); }
  .wrap { max-width:46rem; margin:0 auto; padding:0 16px; }
  .top { display:flex; align-items:center; gap:10px; padding:12px 0 8px; flex-wrap:wrap; }
  h1 { font-size:1.05rem; margin:0; flex:1; min-width:8rem; }
  .pill { display:inline-flex; align-items:center; gap:6px; background:var(--panel); border:1px solid var(--line); border-radius:99px; padding:3px 10px; font-size:.8rem; color:var(--muted); white-space:nowrap; }
  .pill b { color:var(--fg); font-weight:600; }
  .dot { width:8px; height:8px; border-radius:50%; background:var(--faint); }
  .dot.on { background:var(--ok); } .dot.off { background:var(--danger); } .dot.ro { background:var(--gold); }
  .tabs { display:flex; gap:4px; overflow-x:auto; padding-bottom:8px; }
  .tab { background:transparent; border:0; border-radius:8px; padding:6px 12px; color:var(--muted); cursor:pointer; white-space:nowrap; }
  .tab[aria-selected=true] { background:var(--panel2); color:var(--fg); }
  main { padding:16px 0 64px; }
  .pane[hidden] { display:none; }
  .card { background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:14px 16px; margin-bottom:14px; }
  h2 { font-size:.75rem; letter-spacing:.07em; text-transform:uppercase; color:var(--muted); margin:0 0 10px; font-weight:600; }
  p.hint { color:var(--faint); font-size:.82rem; margin:0 0 10px; }
  .row { display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:8px; }
  .row:last-child { margin-bottom:0; }
  input[type=text], input[type=password], textarea, select {
    background:var(--bg); border:1px solid var(--line); border-radius:9px; padding:8px 10px; min-width:0;
  }
  input[type=text], input[type=password] { flex:1; min-width:10rem; }
  textarea { width:100%; resize:vertical; }
  input:focus, textarea:focus, select:focus, button:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
  button.btn { background:var(--panel2); border:1px solid var(--line); border-radius:9px; padding:7px 12px; cursor:pointer; }
  button.btn:hover:not(:disabled) { border-color:var(--accent); }
  button.btn:disabled { opacity:.45; cursor:default; }
  button.go { color:#08150f; background:var(--accent); border-color:var(--accent); font-weight:600; }
  button.danger { color:var(--danger); }
  button.danger:hover:not(:disabled) { border-color:var(--danger); }
  button.mini { padding:3px 8px; font-size:.78rem; }
  .chips { display:flex; gap:6px; flex-wrap:wrap; }
  .chip { background:var(--bg); border:1px solid var(--line); border-radius:99px; padding:4px 10px; font-size:.82rem; cursor:pointer; color:var(--muted); }
  .chip:hover { border-color:var(--accent); color:var(--fg); }
  .chip .x { margin-left:6px; opacity:.6; }
  .emojis { display:flex; gap:6px; flex-wrap:wrap; }
  .emojis button { font-size:1.4rem; width:2.6rem; height:2.6rem; padding:0; background:var(--bg); border:1px solid var(--line); border-radius:10px; cursor:pointer; }
  .emojis button:hover { border-color:var(--accent); transform:translateY(-1px); }
  .count { color:var(--faint); font-size:.78rem; margin-left:auto; }

  .feed { list-style:none; margin:0; padding:0; }
  .msg { display:flex; flex-direction:column; gap:6px; padding:10px 0; border-top:1px solid var(--line); }
  .msg:first-child { border-top:0; }
  .msg .body { min-width:0; overflow-wrap:anywhere; }
  .msg .who { font-weight:600; margin-right:6px; white-space:nowrap; }
  .msg .when { color:var(--faint); font-size:.78rem; }
  .msg .acts { display:flex; gap:6px; flex-wrap:wrap; }
  .msg.admin { background:#f0c36a14; margin:0 -8px; padding:9px 8px; border-radius:8px; border-color:transparent; }
  .msg.admin .who { color:var(--gold); }
  .empty { color:var(--faint); padding:6px 0; }

  .bar { position:relative; border:1px solid var(--line); border-radius:9px; padding:6px 10px; margin-top:6px; overflow:hidden; }
  .bar i { position:absolute; inset:0 auto 0 0; background:#6fd1ad33; transition:width .4s; }
  .bar span { position:relative; display:flex; justify-content:space-between; gap:12px; }
  .bar em { font-style:normal; color:var(--muted); font-variant-numeric:tabular-nums; }

  .switch { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:6px 0; }
  .switch + .switch { border-top:1px solid var(--line); }
  .switch small { display:block; color:var(--faint); font-size:.8rem; }
  input[type=range] { flex:1; min-width:8rem; accent-color:var(--accent); }
  .gate { max-width:26rem; margin:15vh auto 0; }
  .gate[hidden], #app[hidden] { display:none; }
  #toasts { position:fixed; left:0; right:0; bottom:16px; display:flex; flex-direction:column; align-items:center; gap:8px; pointer-events:none; z-index:20; padding:0 16px; }
  .toast { background:var(--panel2); border:1px solid var(--line); border-radius:10px; padding:8px 14px; box-shadow:0 6px 24px #0008; animation:in .2s; }
  .toast.bad { border-color:var(--danger); color:var(--danger); }
  @keyframes in { from { opacity:0; transform:translateY(6px); } }
  @media (prefers-reduced-motion: reduce) { .toast, .bar i { animation:none; transition:none; } }
</style>
</head>
<body>
<div id="gate" class="wrap gate">
  <div class="card">
    <h2>chat admin</h2>
    <p class="hint">Enter the admin key. It stays in this tab only.</p>
    <div class="row">
      <input id="key" type="password" placeholder="admin key" autocomplete="off" aria-label="admin key">
      <button id="unlock" class="btn go">unlock</button>
    </div>
    <p id="gateError" class="hint" style="color:var(--danger);margin:8px 0 0" role="status"></p>
  </div>
</div>

<div id="app" hidden>
<header>
  <div class="wrap">
    <div class="top">
      <h1>chat admin</h1>
      <span class="pill"><span class="dot" id="statusDot"></span><b id="statusText">…</b></span>
      <span class="pill"><b id="onlineN">0</b> online</span>
      <span class="pill"><b id="msgN">0</b> msgs</span>
      <label class="pill" title="refresh every few seconds"><input type="checkbox" id="auto" checked> live</label>
    </div>
    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-tab="chat">💬 Chat</button>
      <button class="tab" role="tab" data-tab="broadcast">📣 Broadcast</button>
      <button class="tab" role="tab" data-tab="poll">📊 Poll</button>
      <button class="tab" role="tab" data-tab="rules">🛡️ Rules</button>
    </div>
  </div>
</header>

<main class="wrap">
  <section class="pane" data-pane="chat">
    <div class="card">
      <div class="row">
        <h2 style="margin:0">live chat</h2>
        <input id="search" type="text" placeholder="search messages or names" aria-label="search messages" style="max-width:16rem;margin-left:auto">
      </div>
      <ul class="feed" id="feed"></ul>
    </div>
    <div class="card">
      <h2>muted people</h2>
      <p class="hint">Muted people can still read and vote, but can't post. The mute follows their browser, not their IP.</p>
      <div class="chips" id="mutedList"></div>
    </div>
  </section>

  <section class="pane" data-pane="broadcast" hidden>
    <div class="card">
      <h2>say as admin</h2>
      <p class="hint">Appears with a gold admin badge. No filters, up to 500 characters.</p>
      <div class="row">
        <input id="say" type="text" maxlength="500" placeholder="what do you want to tell everyone?" autocomplete="off" aria-label="admin message">
        <button id="saySend" class="btn go">send</button>
      </div>
      <div class="row"><div class="chips" id="quick"></div></div>
      <div class="row">
        <button id="quickAdd" class="btn mini">save as quick reply</button>
        <span class="count" id="sayCount">0 / 500</span>
      </div>
    </div>
    <div class="card">
      <h2>pinned banner</h2>
      <div class="row">
        <input id="pinText" type="text" maxlength="300" placeholder="shown above the chat for everyone" autocomplete="off" aria-label="pinned text">
        <button id="pinSet" class="btn go">pin</button>
        <button id="pinClear" class="btn">unpin</button>
      </div>
      <p class="hint" id="pinNow" style="margin:6px 0 0"></p>
    </div>
    <div class="card">
      <h2>effects</h2>
      <p class="hint">Plays on everyone's screen right now.</p>
      <div class="row"><button id="confetti" class="btn">🎊 confetti</button></div>
      <div class="emojis" id="emojis"></div>
    </div>
  </section>

  <section class="pane" data-pane="poll" hidden>
    <div class="card">
      <h2>new poll</h2>
      <p class="hint">Starting one replaces the current poll and its votes. One vote per browser, changeable until it ends.</p>
      <div class="chips" id="templates" style="margin-bottom:10px"></div>
      <div class="row"><input id="pollQ" type="text" maxlength="140" placeholder="question" autocomplete="off" aria-label="poll question"></div>
      <textarea id="pollOpts" rows="4" placeholder="one option per line, 2 to 6" aria-label="poll options"></textarea>
      <div class="row" style="margin-top:8px">
        <label for="pollTime" class="hint" style="margin:0">closes</label>
        <select id="pollTime" aria-label="poll timer">
          <option value="0">when I end it</option>
          <option value="1">after 1 min</option>
          <option value="5">after 5 min</option>
          <option value="10">after 10 min</option>
          <option value="30">after 30 min</option>
          <option value="60">after 1 hour</option>
        </select>
        <button id="pollStart" class="btn go" style="margin-left:auto">start poll</button>
      </div>
    </div>
    <div class="card">
      <h2>current poll</h2>
      <div id="pollNow"><div class="empty">no poll running</div></div>
      <div class="row" style="margin-top:10px">
        <button id="pollEnd" class="btn">end now</button>
        <button id="pollShare" class="btn">post results in chat</button>
        <button id="pollClear" class="btn danger">remove</button>
      </div>
    </div>
  </section>

  <section class="pane" data-pane="rules" hidden>
    <div class="card">
      <h2>maintenance mode</h2>
      <div class="switch">
        <div>Show this chat page instead of the ERP<small>On: sistmate.vercel.app shows the chat page to everyone. Off: the ERP is back. Takes effect within about 30 seconds.</small></div>
        <input type="checkbox" id="maintSwitch" aria-label="maintenance mode">
      </div>
    </div>
    <div class="card">
      <h2>room</h2>
      <div class="switch">
        <div>Chat is on<small>Turn off to close the room for everyone.</small></div>
        <input type="checkbox" id="onSwitch" aria-label="chat on">
      </div>
      <div class="switch">
        <div>Read-only mode<small>Everyone can read and vote; only you can post.</small></div>
        <input type="checkbox" id="lockSwitch" aria-label="read-only mode">
      </div>
    </div>
    <div class="card">
      <h2>slow mode</h2>
      <p class="hint">Minimum wait between one person's messages.</p>
      <div class="row">
        <input type="range" id="slow" min="1" max="60" step="1" value="3" aria-label="slow mode seconds">
        <b id="slowVal" style="min-width:3.5rem">3 s</b>
        <button id="slowSet" class="btn go">apply</button>
      </div>
    </div>
    <div class="card">
      <h2>blocked words</h2>
      <p class="hint">Added to the built-in filter (links, numbers, emails, slurs). One per line or comma-separated, whole words or short phrases.</p>
      <textarea id="words" rows="3" placeholder="e.g. exam leak, dm me" aria-label="blocked words"></textarea>
      <div class="row" style="margin-top:8px"><button id="wordsSet" class="btn go">save list</button><span class="count" id="wordsCount"></span></div>
    </div>
    <div class="card">
      <h2>danger zone</h2>
      <div class="row"><button id="clear" class="btn danger">delete every message</button></div>
    </div>
  </section>
</main>
</div>
<div id="toasts" aria-live="polite"></div>

<script>
  const $ = (id) => document.getElementById(id);
  const EMOJIS = ["🎉","🔥","❤️","👏","😂","🎓","✨","💯"];
  const TEMPLATES = [
    { label: "yes / no", q: "", opts: ["Yes", "No"] },
    { label: "rate 1–5", q: "How would you rate it?", opts: ["1", "2", "3", "4", "5"] },
    { label: "agree?", q: "", opts: ["Agree", "Disagree", "Not sure"] },
    { label: "this or that", q: "", opts: ["This", "That"] },
  ];
  const DEFAULT_QUICK = ["be kind to each other 🙏", "all the best for the exams 🎓", "keep it clean, no spam please"];

  let data = null, enabled = true, busy = false, syncRules = true, tab = "chat", timer = 0;
  const keyInput = $("key");

  const fromHash = new URLSearchParams(location.hash.slice(1)).get("key");
  if (fromHash) {
    sessionStorage.setItem("chat-admin-key", fromHash);
    history.replaceState(null, "", location.pathname);
  }
  keyInput.value = sessionStorage.getItem("chat-admin-key") || "";

  function toast(text, bad) {
    const t = document.createElement("div");
    t.className = "toast" + (bad ? " bad" : "");
    t.textContent = text;
    $("toasts").append(t);
    setTimeout(() => t.remove(), bad ? 4500 : 2200);
  }

  async function call(body, opts) {
    const key = keyInput.value.trim();
    if (!key) { $("gateError").textContent = "enter the key"; return false; }
    let res, out;
    try {
      res = await fetch("/admin/api", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
        body: JSON.stringify(body),
      });
      out = await res.json();
    } catch (e) {
      if (!(opts && opts.quiet)) toast("couldn't reach the server", true);
      return false;
    }
    if (res.status === 401) {
      sessionStorage.removeItem("chat-admin-key");
      $("app").hidden = true; $("gate").hidden = false;
      $("gateError").textContent = "wrong key";
      return false;
    }
    if (!res.ok || out.error) { toast(out.error || "something went wrong", true); return false; }
    sessionStorage.setItem("chat-admin-key", key);
    $("gate").hidden = true; $("app").hidden = false;
    data = out;
    render();
    if (opts && opts.ok) toast(opts.ok);
    return true;
  }
  const act = (body, ok) => call(body, { ok });

  function ago(ms) {
    const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.round(s / 60) + "m ago";
    return Math.round(s / 3600) + "h ago";
  }
  function hue(name) {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    return "hsl(" + h + " 55% 68%)";
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function render() {
    const d = data;
    enabled = d.enabled;
    $("onlineN").textContent = d.online;
    $("msgN").textContent = d.messages.length;
    const dot = $("statusDot");
    dot.className = "dot " + (!d.enabled ? "off" : d.locked ? "ro" : "on");
    $("statusText").textContent = !d.enabled ? "chat off" : d.locked ? "read-only" : "chat on";

    renderFeed();
    renderMuted(d.muted);
    $("pinNow").textContent = d.pin ? "pinned now: " + d.pin : "nothing pinned";
    renderPoll(d.poll);
    if (syncRules) {
      syncRules = false;
      $("onSwitch").checked = d.enabled;
      $("lockSwitch").checked = d.locked;
      $("maintSwitch").checked = d.maintenance;
      $("slow").value = Math.round(d.gap / 1000);
      $("slowVal").textContent = Math.round(d.gap / 1000) + " s";
      $("words").value = d.words.join("\\n");
      $("wordsCount").textContent = d.words.length + " saved";
    }
  }

  function renderFeed() {
    const q = $("search").value.trim().toLowerCase();
    const muted = new Set(data.muted);
    const rows = data.messages.slice().reverse().filter((m) => !q || (m.name + " " + m.text).toLowerCase().includes(q));
    if (!rows.length) { $("feed").replaceChildren(el("li", "empty", q ? "nothing matches" : "no messages yet")); return; }
    $("feed").replaceChildren(...rows.map((m) => {
      const li = el("li", "msg" + (m.name === "admin" ? " admin" : ""));
      const body = el("div", "body");
      const who = el("span", "who", m.name === "admin" ? "ADMIN" : m.name);
      if (m.name !== "admin") who.style.color = hue(m.name);
      body.append(who, document.createTextNode(m.text), el("div", "when", ago(m.at) + (muted.has(m.name) ? " · muted" : "")));
      const acts = el("div", "acts");
      const del = el("button", "btn mini danger", "delete");
      del.onclick = () => act({ action: "delete", id: m.id }, "deleted");
      acts.append(del);
      if (m.name !== "admin" && !muted.has(m.name)) {
        const mute = el("button", "btn mini", "mute");
        mute.title = "stop them posting";
        mute.onclick = () => act({ action: "mute", name: m.name }, m.name + " muted");
        const purge = el("button", "btn mini danger", "mute + wipe");
        purge.title = "mute and delete all their messages";
        purge.onclick = () => act({ action: "mute", name: m.name, purge: true }, m.name + " muted, messages removed");
        acts.append(mute, purge);
      }
      li.append(body, acts);
      return li;
    }));
  }

  function renderMuted(list) {
    if (!list.length) { $("mutedList").replaceChildren(el("span", "empty", "nobody muted")); return; }
    $("mutedList").replaceChildren(...list.map((name) => {
      const c = el("button", "chip", name);
      c.title = "tap to unmute";
      c.append(el("span", "x", "✕"));
      c.onclick = () => act({ action: "unmute", name }, name + " unmuted");
      return c;
    }));
  }

  let pollEnds = 0;
  function renderPoll(poll) {
    const box = $("pollNow");
    pollEnds = poll && !poll.closed && poll.endsAt ? poll.endsAt : 0;
    $("pollEnd").disabled = !poll || poll.closed;
    $("pollShare").disabled = !poll;
    $("pollClear").disabled = !poll;
    if (!poll) { box.replaceChildren(el("div", "empty", "no poll running")); return; }
    const head = el("div", "hint");
    head.id = "pollHead";
    head.dataset.base = poll.q + " · " + poll.total + " vote" + (poll.total === 1 ? "" : "s") + (poll.closed ? " · ended" : " · live");
    head.textContent = head.dataset.base;
    const nodes = [head];
    poll.opts.forEach((opt, i) => {
      const pct = poll.total ? Math.round((poll.counts[i] / poll.total) * 100) : 0;
      const bar = el("div", "bar");
      const fill = el("i");
      fill.style.width = pct + "%";
      const label = el("span");
      label.append(el("b", "", opt), el("em", "", poll.counts[i] + " · " + pct + "%"));
      bar.append(fill, label);
      nodes.push(bar);
    });
    box.replaceChildren(...nodes);
    tickPoll();
  }
  function tickPoll() {
    const head = $("pollHead");
    if (!head) return;
    if (!pollEnds) { head.textContent = head.dataset.base; return; }
    const left = Math.max(0, Math.round((pollEnds - Date.now()) / 1000));
    head.textContent = head.dataset.base + " · closes in " + Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0");
  }
  setInterval(tickPoll, 1000);

  /* quick replies, saved in this browser only */
  function quick() {
    try { return JSON.parse(localStorage.getItem("chat-admin-quick")) || DEFAULT_QUICK; } catch (e) { return DEFAULT_QUICK; }
  }
  function saveQuick(list) { try { localStorage.setItem("chat-admin-quick", JSON.stringify(list)); } catch (e) {} }
  function renderQuick() {
    $("quick").replaceChildren(...quick().map((text, i) => {
      const c = el("button", "chip", text);
      c.title = "tap to fill; long-press the ✕ to remove";
      c.onclick = () => { $("say").value = text; $("say").focus(); updateCount(); };
      const x = el("span", "x", "✕");
      x.onclick = (e) => { e.stopPropagation(); const l = quick(); l.splice(i, 1); saveQuick(l); renderQuick(); };
      c.append(x);
      return c;
    }));
  }
  function updateCount() { $("sayCount").textContent = $("say").value.length + " / 500"; }

  async function say() {
    const text = $("say").value.trim();
    if (!text) return;
    if (await act({ action: "say", text }, "sent")) { $("say").value = ""; updateCount(); }
  }

  /* wiring */
  $("unlock").onclick = () => call({ action: "list" });
  keyInput.addEventListener("keydown", (e) => { if (e.key === "Enter") $("unlock").click(); });

  document.querySelectorAll(".tab").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
  function showTab(name) {
    tab = name;
    try { sessionStorage.setItem("chat-admin-tab", name); } catch (e) {}
    document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    document.querySelectorAll(".pane").forEach((p) => { p.hidden = p.dataset.pane !== name; });
  }

  $("search").addEventListener("input", () => data && renderFeed());
  $("say").addEventListener("input", updateCount);
  $("say").addEventListener("keydown", (e) => { if (e.key === "Enter") say(); });
  $("saySend").onclick = say;
  $("quickAdd").onclick = () => {
    const text = $("say").value.trim();
    if (!text) return toast("type a message first", true);
    const l = quick();
    if (!l.includes(text)) { l.push(text); saveQuick(l.slice(-12)); renderQuick(); toast("saved"); }
  };

  $("pinText").addEventListener("keydown", (e) => { if (e.key === "Enter") $("pinSet").click(); });
  $("pinSet").onclick = async () => { if (await act({ action: "pin", text: $("pinText").value }, "pinned")) $("pinText").value = ""; };
  $("pinClear").onclick = () => act({ action: "unpin" }, "unpinned");

  $("confetti").onclick = () => act({ action: "fx", kind: "confetti" }, "🎊 sent");
  $("emojis").replaceChildren(...EMOJIS.map((emoji) => {
    const b = el("button", "", emoji);
    b.setAttribute("aria-label", "rain " + emoji);
    b.onclick = () => act({ action: "fx", kind: "emoji", emoji }, emoji + " sent");
    return b;
  }));

  $("templates").replaceChildren(...TEMPLATES.map((t) => {
    const c = el("button", "chip", t.label);
    c.onclick = () => {
      if (t.q) $("pollQ").value = t.q;
      $("pollOpts").value = t.opts.join("\\n");
      if (!t.q) $("pollQ").focus();
    };
    return c;
  }));
  $("pollStart").onclick = async () => {
    const opts = $("pollOpts").value.split("\\n").map((o) => o.trim()).filter(Boolean);
    const body = { action: "poll", q: $("pollQ").value, opts, minutes: Number($("pollTime").value) };
    if (await act(body, "poll started")) { $("pollQ").value = ""; $("pollOpts").value = ""; showTab("poll"); }
  };
  $("pollEnd").onclick = () => act({ action: "endpoll" }, "poll ended");
  $("pollShare").onclick = () => {
    const p = data && data.poll;
    if (!p) return;
    const best = Math.max(...p.counts);
    const lines = p.opts.map((o, i) => o + " " + (p.total ? Math.round((p.counts[i] / p.total) * 100) : 0) + "%");
    const lead = p.total && p.counts.filter((c) => c === best).length === 1 ? " Winner: " + p.opts[p.counts.indexOf(best)] + "." : "";
    act({ action: "say", text: ("📊 " + p.q + " — " + lines.join(", ") + " (" + p.total + " votes)." + lead).slice(0, 500) }, "results posted");
  };
  $("pollClear").onclick = () => { if (confirm("Remove the poll and its votes?")) act({ action: "clearpoll" }, "poll removed"); };

  $("onSwitch").onchange = async (e) => {
    const turnOff = !e.target.checked;
    if (turnOff && !confirm("Close the chat for everyone?")) { e.target.checked = true; return; }
    await act({ action: turnOff ? "disable" : "enable" }, turnOff ? "chat is off" : "chat is on");
  };
  $("maintSwitch").onchange = (e) => act({ action: "maintenance", on: e.target.checked }, e.target.checked ? "maintenance mode ON" : "maintenance mode off");
  $("lockSwitch").onchange = (e) => act({ action: "lock", locked: e.target.checked }, e.target.checked ? "read-only on" : "read-only off");
  $("slow").addEventListener("input", () => { $("slowVal").textContent = $("slow").value + " s"; });
  $("slowSet").onclick = () => act({ action: "slow", ms: Number($("slow").value) * 1000 }, "slow mode set");
  $("wordsSet").onclick = async () => {
    const list = $("words").value.split(/[\\n,]/).map((w) => w.trim()).filter(Boolean);
    syncRules = true;
    await act({ action: "words", list }, "word list saved");
  };
  $("clear").onclick = () => { if (confirm("Delete every message?")) act({ action: "clear" }, "chat cleared"); };

  /* live refresh: quiet while the tab is hidden */
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if ($("auto").checked && !document.hidden && data && !busy) {
        busy = true;
        await call({ action: "list" }, { quiet: true });
        busy = false;
      }
      schedule();
    }, 4000);
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && data) call({ action: "list" }, { quiet: true }); });

  renderQuick();
  updateCount();
  let saved = "chat";
  try { saved = sessionStorage.getItem("chat-admin-tab") || "chat"; } catch (e) {}
  showTab(saved);
  if (keyInput.value) call({ action: "list" });
  schedule();
</script>
</body>
</html>`;
