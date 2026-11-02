/**
 * The admin page: send an alert to everyone who turned alerts on. One self-contained page, no
 * libraries. It asks for the admin key, keeps it in this tab only (sessionStorage), and sends in
 * pages of subscribers because a free Worker may only make 50 outgoing requests per call.
 *
 * It sits inside a template literal: no backticks and no dollar-brace sequences in the page code.
 */
export const ADMIN_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>sistmate alerts</title>
<style>
  :root { color-scheme: dark; --bg:#0d1210; --card:#151c19; --line:#26332e; --text:#e8efeb; --mute:#8fa39a; --accent:#7fd6b4; --bad:#ff8a7a; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:16px/1.5 system-ui, sans-serif; }
  main { max-width: 34rem; margin: 0 auto; padding: 1.25rem 1rem 3rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .25rem; }
  p.hint { color: var(--mute); margin: 0 0 1rem; font-size: .9rem; }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: .75rem; padding: 1rem; margin-bottom: 1rem; }
  label { display:block; font-size:.8rem; letter-spacing:.06em; text-transform:uppercase; color:var(--mute); margin:.75rem 0 .25rem; }
  label:first-child { margin-top: 0; }
  input, textarea { width:100%; background:#0b100e; color:var(--text); border:1px solid var(--line); border-radius:.5rem; padding:.65rem .75rem; font:inherit; }
  textarea { min-height: 5.5rem; resize: vertical; }
  input:focus, textarea:focus, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .row { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin-top:.75rem; }
  button { background:var(--accent); color:#06231a; border:0; border-radius:.5rem; padding:.7rem 1rem; font:inherit; font-weight:600; cursor:pointer; min-height:2.75rem; }
  button.ghost { background:transparent; color:var(--text); border:1px solid var(--line); }
  button:disabled { opacity:.5; cursor:not-allowed; }
  .count { color: var(--mute); font-size:.9rem; }
  #status { margin-top:.75rem; min-height:1.5rem; font-size:.95rem; }
  #status.bad { color: var(--bad); }
  .small { color:var(--mute); font-size:.8rem; margin-top:.25rem; }
</style>
</head>
<body>
<main>
  <h1>Send an alert</h1>
  <p class="hint">Goes to everyone who turned alerts on in Settings. Keep it short and useful.</p>

  <div class="card">
    <label for="key">Admin key</label>
    <input id="key" type="password" autocomplete="off" spellcheck="false">
    <div class="row">
      <button id="count" class="ghost" type="button">Count subscribers</button>
      <span id="countOut" class="count"></span>
    </div>
  </div>

  <div class="card">
    <label for="title">Title</label>
    <input id="title" maxlength="80" placeholder="Results are out">
    <label for="body">Message</label>
    <textarea id="body" maxlength="240" placeholder="Check your marks on sistmate."></textarea>
    <label for="url">Opens (optional, a page on the site)</label>
    <input id="url" maxlength="200" placeholder="/notifications">
    <p class="small">Leave empty to open the home page. Must start with a single slash.</p>
    <div class="row">
      <button id="send" type="button">Send to everyone</button>
    </div>
    <div id="status" role="status" aria-live="polite"></div>
  </div>
</main>
<script>
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var keyInput = $("key");
  var status = $("status");
  try { keyInput.value = sessionStorage.getItem("push-admin-key") || ""; } catch (e) {}
  keyInput.addEventListener("input", function () {
    try { sessionStorage.setItem("push-admin-key", keyInput.value); } catch (e) {}
  });

  function say(text, bad) {
    status.textContent = text;
    status.className = bad ? "bad" : "";
  }

  function call(path, payload) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": keyInput.value },
      body: JSON.stringify(payload || {})
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) { var err = new Error(data.error || ("Error " + res.status)); err.status = res.status; throw err; }
        return data;
      });
    });
  }

  $("count").addEventListener("click", function () {
    $("countOut").textContent = "…";
    call("/admin/count").then(function (d) {
      $("countOut").textContent = d.count + " subscribed";
    }).catch(function (e) { $("countOut").textContent = e.message; });
  });

  function randomId() {
    var a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  $("send").addEventListener("click", function () {
    var title = $("title").value.trim();
    var body = $("body").value.trim();
    var url = $("url").value.trim();
    if (!title || !body) { say("Add a title and a message first.", true); return; }
    if (!confirm("Send this alert to everyone who turned alerts on?")) return;
    var button = $("send");
    button.disabled = true;
    var id = randomId();
    var totals = { sent: 0, failed: 0, removed: 0 };
    var cursor = 0;
    say("Sending…");
    (function next() {
      call("/admin/send", { title: title, body: body, url: url, cursor: cursor, id: id }).then(function (d) {
        totals.sent += d.sent; totals.failed += d.failed; totals.removed += d.removed;
        say("Sent " + totals.sent + " · failed " + totals.failed + " · removed " + totals.removed + (d.next ? " …" : ""));
        if (d.next) { cursor = d.next; next(); return; }
        say("Done. Sent " + totals.sent + ", failed " + totals.failed + ", removed " + totals.removed + " that no longer exist (of " + d.total + " now).");
        button.disabled = false;
      }).catch(function (e) {
        say(e.message + " (sent " + totals.sent + " before it stopped)", true);
        button.disabled = false;
      });
    })();
  });
})();
</script>
</body>
</html>`;
