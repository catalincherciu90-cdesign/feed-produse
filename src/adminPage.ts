/**
 * Pagina panoului de admin: HTML + CSS + JS fără dependențe externe.
 * JS-ul e servit separat la /admin/app.js (CSP fără 'unsafe-inline' pentru scripturi).
 * Toate datele din feed sunt puse în pagină doar prin textContent (fără innerHTML).
 */
import { buildImportTable, buildXlsx, translateValue } from './bapp';

export const ADMIN_HTML = String.raw`<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Feed produse · Admin</title>
<style>
:root {
  --bg: #f6f7f9; --panel: #ffffff; --text: #1b1f24; --muted: #5f6b7a; --border: #dde2e8;
  --accent: #e8590c; --accent-text: #ffffff; --ok: #1f7a3d; --ok-bg: #e3f4e8; --warn: #8a5a00; --warn-bg: #fff3d6;
  --bad: #b42318; --bad-bg: #fde7e5; --info: #1d4ed8; --info-bg: #e5edff; --row: #fafbfc;
  --radius: 10px; --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #111418; --panel: #1a1e24; --text: #e7eaee; --muted: #9aa5b1; --border: #2c323a;
    --accent: #ff7a2f; --accent-text: #1a1206; --ok: #6fd28f; --ok-bg: #16301f; --warn: #f2c35b; --warn-bg: #3a2e12;
    --bad: #ff8a80; --bad-bg: #3b1a18; --info: #93b4ff; --info-bg: #1a2540; --row: #1e232a;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.45 var(--font); }
header { background: var(--panel); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 5; }
.bar { max-width: 1200px; margin: 0 auto; padding: 10px 16px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.brand { font-weight: 700; font-size: 17px; }
.brand span { color: var(--accent); }
nav { display: flex; gap: 4px; flex-wrap: wrap; }
nav button { background: none; border: 0; color: var(--muted); padding: 8px 12px; border-radius: 8px; font: inherit; cursor: pointer; }
nav button[aria-current="page"] { background: var(--bg); color: var(--text); font-weight: 600; }
.spacer { flex: 1; }
main { max-width: 1200px; margin: 0 auto; padding: 20px 16px 48px; }
h2 { font-size: 18px; margin: 0 0 12px; }
h3 { font-size: 15px; margin: 0 0 10px; }
.muted { color: var(--muted); }
.small { font-size: 13px; }
.card { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px; margin-bottom: 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 16px; }
.stat { background: var(--panel); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; }
.stat .label { color: var(--muted); font-size: 13px; }
.stat .value { font-size: 26px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
.stat .hint { color: var(--muted); font-size: 12px; margin-top: 2px; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; }
.b-ok { background: var(--ok-bg); color: var(--ok); }
.b-warn { background: var(--warn-bg); color: var(--warn); }
.b-bad { background: var(--bad-bg); color: var(--bad); }
.b-info { background: var(--info-bg); color: var(--info); }
.b-muted { background: var(--bg); color: var(--muted); border: 1px solid var(--border); }
.alert { border-radius: var(--radius); padding: 12px 14px; margin-bottom: 16px; border: 1px solid transparent; }
.alert.bad { background: var(--bad-bg); color: var(--bad); }
.alert.warn { background: var(--warn-bg); color: var(--warn); }
.alert.info { background: var(--info-bg); color: var(--info); }
.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); background: var(--panel); }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: var(--muted); background: var(--row); position: sticky; top: 0; }
tr:last-child td { border-bottom: 0; }
th.num { text-align: right; }
td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
td.code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; white-space: nowrap; }
.toolbar { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; margin-bottom: 12px; }
.toolbar .field { min-width: 160px; }
.toolbar .grow { flex: 1; min-width: 220px; }
label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 4px; }
input, select, textarea { width: 100%; font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; }
input:focus, select:focus, textarea:focus, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button.btn { font: inherit; border-radius: 8px; padding: 8px 14px; border: 1px solid var(--border); background: var(--panel); color: var(--text); cursor: pointer; }
button.primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); font-weight: 600; }
button.danger { color: var(--bad); }
button.link { background: none; border: 0; color: var(--accent); cursor: pointer; padding: 0; font: inherit; text-decoration: underline; }
button:disabled { opacity: .55; cursor: default; }
.row { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; }
.help { font-size: 12px; color: var(--muted); margin-top: 4px; }
.feed-link { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.feed-link code { background: var(--bg); border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 13px; overflow-wrap: anywhere; }
.thumb { width: 56px; height: 56px; object-fit: contain; background: #fff; border: 1px solid var(--border); border-radius: 6px; display: block; }
.thumb-cell { width: 76px; }
.thumb-cell a { display: inline-block; }
.thumb-missing { width: 56px; height: 56px; border: 2px dashed var(--bad); border-radius: 6px; color: var(--bad); font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; text-align: center; line-height: 1.1; background: var(--bad-bg); }
.thumb-cell .badge { margin-top: 4px; font-size: 11px; }
.pager { display: flex; gap: 8px; align-items: center; justify-content: flex-end; margin-top: 10px; flex-wrap: wrap; }
dialog { border: 1px solid var(--border); border-radius: var(--radius); background: var(--panel); color: var(--text); padding: 20px; width: min(480px, calc(100vw - 32px)); }
dialog::backdrop { background: rgba(0,0,0,.45); }
.login { max-width: 380px; margin: 12vh auto; }
.hidden { display: none !important; }
.toast { position: fixed; bottom: 16px; left: 50%; transform: translateX(-50%); background: var(--text); color: var(--bg); padding: 10px 16px; border-radius: 8px; z-index: 20; max-width: calc(100vw - 32px); }
@media (max-width: 640px) {
  .stat .value { font-size: 22px; }
  .hide-sm { display: none; }
  /* Lista de produse ca și carduri pe telefon */
  table.cards thead { display: none; }
  table.cards tr { display: block; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  table.cards tr:last-child { border-bottom: 0; }
  table.cards td { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; border: 0; text-align: right; }
  table.cards td::before { content: attr(data-label); color: var(--muted); font-size: 12px; text-align: left; flex-shrink: 0; }
  table.cards td.code { font-weight: 700; }
  table.cards td.hide-sm { display: flex; }
  table.cards td.thumb-cell { width: auto; }
  .bar { gap: 8px; }
}
</style>
</head>
<body>
<div id="login" class="login card hidden">
  <h2>Feed produse · Admin</h2>
  <p class="muted small">Introdu ADMIN_TOKEN, secretul setat în GitHub.</p>
  <form id="login-form">
    <label for="token">Token admin</label>
    <input id="token" type="password" autocomplete="current-password" required>
    <div class="row" style="margin-top:12px">
      <button class="btn primary" type="submit">Intră</button>
      <span id="login-error" class="small" style="color:var(--bad)"></span>
    </div>
  </form>
</div>

<div id="app" class="hidden">
  <header>
    <div class="bar">
      <div class="brand">Feed <span>produse</span></div>
      <nav id="tabs">
        <button data-tab="status" aria-current="page">Status</button>
        <button data-tab="products">Produse</button>
        <button data-tab="settings">Setări</button>
        <button data-tab="overrides">Excepții</button>
        <button data-tab="tech">Date tehnice</button>
      </nav>
      <div class="spacer"></div>
      <button class="btn primary" id="sync" title="Citește feed-ul acum și actualizează CEL și clienții">Sincronizează acum</button>
      <button class="btn" id="refresh" title="Reîncarcă datele">Reîncarcă</button>
      <button class="btn" id="logout">Ieșire</button>
    </div>
  </header>
  <main>
    <section id="tab-status"></section>
    <section id="tab-products" class="hidden">
      <div class="toolbar">
        <div class="grow"><label for="q">Caută după cod, nume sau EAN</label><input id="q" type="search" placeholder="cod, nume sau EAN"></div>
        <div class="field"><label for="f-cel">CEL</label>
          <select id="f-cel">
            <option value="">Toate</option>
            <option value="orderable">Comandabile</option>
            <option value="blocked">Blocate (orice motiv)</option>
            <option value="prag">Sub prag</option>
            <option value="pret">Preț 0</option>
            <option value="blocat">Blocate manual</option>
            <option value="fara-stoc">Fără stoc</option>
          </select></div>
        <div class="field"><label for="f-client">Clienți</label>
          <select id="f-client">
            <option value="">Toate</option>
            <option value="1">Disponibile</option>
            <option value="0">Indisponibile</option>
          </select></div>
        <div class="field"><label for="f-img">Poze</label>
          <select id="f-img">
            <option value="">Toate</option>
            <option value="gallery">Cu galerie</option>
            <option value="nogallery">Fără galerie</option>
            <option value="broken">Poza nu se încarcă</option>
          </select></div>
        <div class="field"><label for="f-ean">EAN</label>
          <select id="f-ean">
            <option value="">Toate</option>
            <option value="problem">Cu probleme (orice)</option>
            <option value="missing">Lipsă</option>
            <option value="invalid">Invalid</option>
            <option value="duplicate">Duplicat</option>
            <option value="ok">Corecte</option>
          </select></div>
        <div class="field"><label for="f-ov">Excepții</label>
          <select id="f-ov">
            <option value="">Toate</option>
            <option value="1">Doar cu excepție</option>
          </select></div>
      </div>
      <div id="products-info" class="muted small" style="margin-bottom:8px"></div>
      <div class="table-wrap">
        <table class="cards">
          <thead><tr>
            <th>Poză</th><th>Cod</th><th>EAN</th><th>Nume</th><th class="num">Stoc</th><th class="num hide-sm">Preț</th>
            <th class="num hide-sm">Taxa verde</th><th>CEL</th><th>Clienți</th><th></th>
          </tr></thead>
          <tbody id="products-body"></tbody>
        </table>
      </div>
      <div class="pager">
        <button class="btn" id="prev">Înapoi</button>
        <span id="page-info" class="small muted"></span>
        <button class="btn" id="next">Înainte</button>
      </div>
    </section>
    <section id="tab-settings" class="hidden"></section>
    <section id="tab-overrides" class="hidden"></section>
    <section id="tab-tech" class="hidden">
      <div class="card">
        <h2>Date tehnice și poze de la producător</h2>
        <p id="tech-info" class="muted small">Se încarcă…</p>
        <label for="tech-codes">Codurile produselor (unul pe rând sau separate prin virgulă / spațiu)</label>
        <textarea id="tech-codes" rows="6" placeholder="BR-BH07-04101&#10;BR-BA13-60920"></textarea>
        <div class="row" style="margin-top:10px">
          <button class="btn" type="button" id="tech-preview">Verifică codurile</button>
          <button class="btn primary" type="button" id="tech-download">Descarcă fișierul de import (.xlsx)</button>
          <button class="link small" type="button" id="tech-all">Pune toate produsele legate</button>
          <button class="link small" type="button" id="tech-clear">Golește</button>
        </div>
        <div class="card" style="margin:14px 0 0;background:var(--bg)">
          <h3>Feed pentru importul în site (Teamshare)</h3>
          <p id="tech-feed-info" class="small muted">Se încarcă…</p>
          <div class="row">
            <button class="btn" type="button" id="tech-feed-save">Salvează lista și generează feed-ul</button>
            <button class="link small" type="button" id="tech-feed-load">Încarcă lista salvată</button>
          </div>
          <p class="help">Feed-ul conține doar produsele din lista salvată, cu aceeași mapare și aceleași traduceri ca fișierul .xlsx. După salvare pornește automat o sincronizare (sub un minut); apoi se regenerează la fiecare „Sincronizează acum”.</p>
        </div>
        <p class="help">Fișierul conține doar codul, coloanele tehnice cu valori și pozele (ProductImage + AddImages). Câmpurile care nu sunt în fișier (preț, stoc, descriere) nu se schimbă la import.</p>
        <div id="tech-result" style="margin-top:12px"></div>
      </div>
      <details class="card" id="tech-mapping-box">
        <summary><strong>Mapare atribute → coloane Teamshare și traduceri</strong></summary>
        <div id="tech-mapping" style="margin-top:12px"></div>
      </details>
    </section>
  </main>
</div>

<dialog id="edit">
  <form id="edit-form" method="dialog">
    <h3 id="edit-title">Excepție</h3>
    <p id="edit-sub" class="muted small" style="margin-top:-4px"></p>
    <div style="margin-bottom:12px">
      <label for="e-cel">Pe CEL</label>
      <select id="e-cel">
        <option value="default">Implicit (după reguli)</option>
        <option value="block">Blochează: stoc 0, nu se poate comanda</option>
        <option value="ignore-threshold">Fără prag: trimite stocul real chiar și sub prag</option>
      </select>
    </div>
    <div style="margin-bottom:12px">
      <label for="e-client">În feed-ul clienților</label>
      <select id="e-client">
        <option value="default">Implicit (după reguli)</option>
        <option value="block">Blochează: apare indisponibil</option>
        <option value="ignore-threshold">Fără prag: disponibil dacă are stoc</option>
      </select>
    </div>
    <div style="margin-bottom:12px">
      <label for="e-note">Notă (opțional)</label>
      <input id="e-note" maxlength="200" placeholder="ex. stoc rezervat pentru un client">
    </div>
    <p class="help">Regula prețului 0 rămâne activă și cu „Fără prag”. Modificarea se aplică la următoarea sincronizare (butonul „Sincronizează acum”).</p>
    <div class="row" style="justify-content:flex-end;margin-top:14px">
      <button class="btn" type="button" id="e-cancel">Renunță</button>
      <button class="btn primary" type="button" id="e-save">Salvează</button>
    </div>
  </form>
</dialog>
<div id="toast" class="toast hidden" role="status"></div>
<script src="/admin/app.js"></script>
</body>
</html>`;

export const ADMIN_JS =
  // Funcțiile pentru fișierul de import (din bapp.ts), injectate ca expresii: numele interne nu contează.
  // wrangler (esbuild cu keepNames) poate adăuga apeluri __name(fn, "nume") în funcții: le neutralizăm.
  'var __name = typeof __name === "function" ? __name : function (f) { return f; };\n' +
  'var BAPP = {\n' +
  '  translateValue: (' + translateValue.toString() + '),\n' +
  '  buildImportTable: (' + buildImportTable.toString() + '),\n' +
  '  buildXlsx: (' + buildXlsx.toString() + ')\n' +
  '};\n' +
  String.raw`(function () {
'use strict';

var TOKEN_KEY = 'feed-admin-token';
var PAGE_SIZE = 50;
var state = { token: '', overview: null, snapshot: null, overrides: {}, page: 0, filtered: [] };

var REASONS = {
  'ok': ['comandabil', 'b-ok'],
  'exceptie': ['fără prag (excepție)', 'b-info'],
  'prag': ['sub prag', 'b-warn'],
  'pret': ['preț 0', 'b-bad'],
  'blocat': ['blocat manual', 'b-bad'],
  'fara-stoc': ['fără stoc', 'b-muted']
};
var CLIENT_REASONS = {
  'ok': ['disponibil', 'b-ok'],
  'exceptie': ['disponibil (excepție)', 'b-info'],
  'prag': ['indisponibil: sub prag', 'b-warn'],
  'blocat': ['blocat manual', 'b-bad'],
  'fara-stoc': ['indisponibil: fără stoc', 'b-muted']
};
var MODE_LABELS = { 'block': 'Blocat', 'ignore-threshold': 'Fără prag' };

// ---------- utilitare ----------
function $(id) { return document.getElementById(id); }
function el(tag, attrs, children) {
  var n = document.createElement(tag);
  if (attrs) for (var k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  (children || []).forEach(function (c) {
    if (c === null || c === undefined) return;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return n;
}
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
function fmtNum(n) { return n === null || n === undefined ? '-' : Number(n).toLocaleString('ro-RO'); }
function fmtPrice(n) { return n === null || n === undefined ? '-' : Number(n).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtTime(s) { if (!s) return '-'; var d = new Date(s); if (isNaN(d.getTime())) return String(s); return d.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }); }
function ago(s) {
  if (!s) return '';
  var m = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (m < 1) return 'acum';
  if (m < 60) return 'acum ' + m + ' min';
  var h = Math.floor(m / 60);
  if (h < 48) return 'acum ' + h + ' h';
  return 'acum ' + Math.floor(h / 24) + ' zile';
}
function badge(pair) { return el('span', { class: 'badge ' + pair[1], text: pair[0] }); }
function toast(msg) {
  var t = $('toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.classList.add('hidden'); }, 3500);
}
function store(get, value) {
  try {
    if (get) return sessionStorage.getItem(TOKEN_KEY) || '';
    if (value) sessionStorage.setItem(TOKEN_KEY, value); else sessionStorage.removeItem(TOKEN_KEY);
  } catch (e) { return ''; }
  return '';
}

function api(method, path, body) {
  var opts = { method: method, headers: { 'Authorization': 'Bearer ' + state.token } };
  if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  return fetch('/admin/api/' + path, opts).then(function (r) {
    return r.text().then(function (t) {
      var data = null;
      try { data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
      if (!r.ok) {
        var err = new Error((data && data.error) || ('HTTP ' + r.status));
        err.status = r.status; throw err;
      }
      return data;
    });
  });
}

// ---------- autentificare ----------
function showLogin(msg) {
  $('app').classList.add('hidden'); $('login').classList.remove('hidden');
  $('login-error').textContent = msg || ''; $('token').focus();
}
$('login-form').addEventListener('submit', function (e) {
  e.preventDefault();
  state.token = $('token').value.trim();
  load(true).catch(function () {});
});
$('logout').addEventListener('click', function () { store(false, ''); state.token = ''; $('token').value = ''; showLogin(); });
$('refresh').addEventListener('click', function () { load(false).then(function () { toast('Date reîncărcate'); }).catch(function () {}); });

// ---------- Sincronizare manuală ----------
var SYNC_POLL_MS = 5000, SYNC_TIMEOUT_MS = 4 * 60 * 1000;
state.syncing = null; // { since, prevStartedAt, timer }
function syncButton(text, disabled) { var b = $('sync'); b.textContent = text; b.disabled = !!disabled; }
$('sync').addEventListener('click', function () {
  if (state.syncing) return;
  var prev = state.overview && state.overview.status ? state.overview.status.startedAt : null;
  syncButton('Se pornește…', true);
  api('POST', 'sync').then(function () {
    state.syncing = { since: Date.now(), prevStartedAt: prev };
    syncButton('Se sincronizează…', true);
    renderStatus();
    toast('Sincronizare pornită. Durează de obicei sub un minut.');
    pollSync();
  }).catch(function (e) {
    syncButton('Sincronizează acum', false);
    toast('Nu am putut porni sincronizarea: ' + e.message);
  });
});
function pollSync() {
  var s = state.syncing; if (!s) return;
  if (Date.now() - s.since > SYNC_TIMEOUT_MS) {
    state.syncing = null; syncButton('Sincronizează acum', false); renderStatus();
    toast('Sincronizarea durează mai mult decât de obicei. Verifică rularea în GitHub Actions.');
    return;
  }
  s.timer = setTimeout(function () {
    api('GET', 'overview').then(function (ov) {
      var st = ov.status;
      if (st && st.startedAt !== s.prevStartedAt && st.finishedAt) {
        state.syncing = null; syncButton('Sincronizează acum', false);
        return load(false).then(function () {
          toast(st.ok ? 'Sincronizare terminată cu succes.' : 'Sincronizarea s-a terminat cu erori. Vezi tab-ul Status.');
        });
      }
      pollSync();
    }).catch(function () { pollSync(); });
  }, SYNC_POLL_MS);
}

// ---------- încărcare ----------
function load(fromLogin) {
  return api('GET', 'overview').then(function (ov) {
    state.overview = ov; state.overrides = ov.overrides || {};
    if (fromLogin) store(false, state.token);
    $('login').classList.add('hidden'); $('app').classList.remove('hidden');
    renderStatus(); renderSettings(); renderOverrides();
    if (!$('tab-tech').classList.contains('hidden')) loadTech(true);
    return loadProducts(0);
  }).catch(function (e) {
    if (e.status === 401) { store(false, ''); showLogin(fromLogin ? 'Token greșit' : ''); }
    else if (fromLogin) showLogin('Eroare: ' + e.message);
    else toast('Eroare: ' + e.message);
    throw e;
  });
}

// ---------- lista de produse ----------
// Cloudflare KV ține în cache răspunsurile ~30-60 s (inclusiv „cheia nu există”), deci imediat după
// o sincronizare lista poate lipsi sau poate fi cea veche. Reîncercăm până se potrivește cu statusul.
var PRODUCTS_RETRY_MS = 10000, PRODUCTS_MAX_TRIES = 9;
state.productsMsg = '';
function expectedSnapshotTime() {
  var st = state.overview && state.overview.status;
  return st && st.source ? st.startedAt : null; // doar rulările care au citit feed-ul scriu lista
}
function loadProducts(attempt) {
  clearTimeout(state.productsTimer);
  return api('GET', 'products').then(function (snap) {
    var want = expectedSnapshotTime();
    var stale = want && snap && snap.generatedAt && new Date(snap.generatedAt) < new Date(want);
    state.snapshot = snap; state.productsMsg = ''; buildEanIndex();
    if (stale && attempt < PRODUCTS_MAX_TRIES) {
      state.productsMsg = 'Se încarcă lista nouă de produse (Cloudflare actualizează datele în până la un minut)…';
      state.productsTimer = setTimeout(function () { loadProducts(attempt + 1); }, PRODUCTS_RETRY_MS);
    }
    applyFilters(); renderOverrides(); renderStatus();
  }).catch(function (e) {
    state.snapshot = null;
    if (e.status === 404 && expectedSnapshotTime() && attempt < PRODUCTS_MAX_TRIES) {
      state.productsMsg = 'Se încarcă lista de produse (Cloudflare actualizează datele în până la un minut)…';
      state.productsTimer = setTimeout(function () { loadProducts(attempt + 1); }, PRODUCTS_RETRY_MS);
    } else if (e.status === 404) {
      state.productsMsg = expectedSnapshotTime()
        ? 'Lista de produse nu a apărut încă. Apasă „Reîncarcă” peste un minut sau „Sincronizează acum”.'
        : 'Lista de produse apare după prima sincronizare. Apasă „Sincronizează acum”.';
    } else {
      state.productsMsg = 'Eroare la încărcarea listei de produse: ' + e.message + '. Apasă „Reîncarcă”.';
    }
    applyFilters();
  });
}

// ---------- tab-uri ----------
$('tabs').addEventListener('click', function (e) {
  var b = e.target.closest('button[data-tab]'); if (!b) return;
  showTab(b.getAttribute('data-tab'));
});
function showTab(name) {
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    if (b.getAttribute('data-tab') === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  ['status', 'products', 'settings', 'overrides', 'tech'].forEach(function (t) { $('tab-' + t).classList.toggle('hidden', t !== name); });
  if (name === 'tech') loadTech();
  try { history.replaceState(null, '', '#' + name); } catch (e) {}
}

// ---------- Status ----------
function effectiveSettings() {
  var ov = state.overview || {};
  if (ov.settings) return { s: ov.settings, source: 'panou' };
  var st = ov.status && ov.status.settings;
  if (st) return { s: st, source: st.source || 'workflow' };
  return { s: { availableMinStock: 10, celMinStock: 10, celStockBuffer: 0, celMaxStock: 0, celBlockZeroPrice: true }, source: 'implicit' };
}

function stat(label, value, hint) {
  return el('div', { class: 'stat' }, [el('div', { class: 'label', text: label }), el('div', { class: 'value', text: value }), hint ? el('div', { class: 'hint', text: hint }) : null]);
}

function feedLink(title, path) {
  var url = location.origin + path;
  var copy = el('button', { class: 'btn', type: 'button', text: 'Copiază', onclick: function () {
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Link copiat'); }, function () { toast(url); });
  } });
  return el('div', { class: 'feed-link' }, [el('strong', { text: title + ':' }), el('code', { text: url }), copy,
    el('a', { href: path, target: '_blank', rel: 'noopener', class: 'small', text: 'Deschide' })]);
}

function galleryStat() {
  var rows = (state.snapshot && state.snapshot.rows) || [];
  if (!rows.length || rows[0].length <= COL.gallery) return { value: '-', hint: 'apare după sincronizare' };
  var none = rows.filter(function (r) { return !(r[COL.gallery] > 0); }).length;
  return { value: fmtNum(none), hint: 'din ' + fmtNum(rows.length) + ' produse' };
}

function renderStatus() {
  var root = $('tab-status'); clear(root);
  var ov = state.overview || {};
  var st = ov.status;
  if (!st) {
    root.appendChild(el('div', { class: 'alert info', text: 'Nu există încă nicio sincronizare. Rulează „Sincronizare feed” din GitHub Actions.' }));
    return;
  }
  var head = el('div', { class: 'row', style: 'margin-bottom:12px' }, [
    el('h2', { style: 'margin:0', text: 'Ultima sincronizare' }),
    st.ok ? badge(['reușită', 'b-ok']) : badge(['eșuată', 'b-bad']),
    el('span', { class: 'muted small', text: fmtTime(st.startedAt) + ' (' + ago(st.startedAt) + ')' })
  ]);
  root.appendChild(head);

  var mins = st.startedAt ? (Date.now() - new Date(st.startedAt).getTime()) / 60000 : 0;
  if (state.syncing) root.appendChild(el('div', { class: 'alert info', text: 'Sincronizare în curs, pornită ' + ago(new Date(state.syncing.since).toISOString()) + '. Pagina se actualizează singură când se termină.' }));
  else if (mins > 24 * 60) root.appendChild(el('div', { class: 'alert warn', text: 'Datele sunt mai vechi de o zi. Stocul de pe CEL și din feed-ul clienților e cel de la ultima sincronizare. Apasă „Sincronizează acum”.' }));
  else if (mins > 60) root.appendChild(el('div', { class: 'alert info', text: 'Datele sunt din ' + ago(st.startedAt) + '. Apasă „Sincronizează acum” ca să actualizezi stocul pe CEL și la clienți.' }));
  if (st.error) root.appendChild(el('div', { class: 'alert bad', text: 'Eroare: ' + st.error }));
  if (st.cel && st.cel.error) root.appendChild(el('div', { class: 'alert bad', text: 'Eroare API CEL: ' + st.cel.error }));
  (st.warnings || []).forEach(function (w) { root.appendChild(el('div', { class: 'alert warn', text: w })); });

  var src = st.source || {}, cf = st.celFeed || {};
  var nOv = Object.keys(state.overrides || {}).length;
  root.appendChild(el('div', { class: 'grid' }, [
    stat('Produse în feed', fmtNum(src.products)),
    stat('Disponibile la clienți', fmtNum(src.available), src.unavailable !== undefined ? fmtNum(src.unavailable) + ' indisponibile' : ''),
    stat('Comandabile pe CEL', fmtNum(cf.orderable), cf.products !== undefined ? fmtNum(cf.products - cf.orderable) + ' cu stoc 0' : ''),
    stat('Blocate pentru preț 0', fmtNum(cf.blockedNoPrice)),
    stat('Excepții active', fmtNum(nOv)),
    stat('Fără galerie foto', galleryStat().value, galleryStat().hint),
    (function () {
      var e = eanStats();
      return e ? stat('Probleme EAN', fmtNum(e.problems), fmtNum(e.missing) + ' lipsă · ' + fmtNum(e.invalid) + ' invalide · ' + fmtNum(e.dup) + ' duplicate')
               : stat('Probleme EAN', '-', 'apare după sincronizare');
    })()
  ]));

  var es = effectiveSettings();
  var card = el('div', { class: 'card' }, [
    el('h3', { text: 'Linkuri feed' }),
    feedLink('CEL', '/cel.xml'),
    feedLink('Clienți', '/feed.xml'),
    feedLink('Facebook', '/facebook.xml'),
    feedLink('Date tehnice', '/date-tehnice.xml'),
    el('p', { class: 'help', text: 'Dacă ai setat CEL_FEED_TOKEN sau CLIENT_FEED_TOKEN, adaugă la link ?token=... .' }),
    el('h3', { style: 'margin-top:14px', text: 'Reguli în vigoare' }),
    el('p', { class: 'small', style: 'margin:0' }, [
      'Clienți: disponibil de la ' + es.s.availableMinStock + ' buc. · CEL: comandabil de la ' + es.s.celMinStock + ' buc., rezervă ' + es.s.celStockBuffer + ' buc., maxim ' + (es.s.celMaxStock ? es.s.celMaxStock + ' buc.' : 'nelimitat') + ', preț 0 ' + (es.s.celBlockZeroPrice ? 'blocat' : 'permis') + ' · sursă: ',
      badge([es.source === 'panou' ? 'panou' : 'workflow', es.source === 'panou' ? 'b-info' : 'b-muted'])
    ])
  ]);
  root.appendChild(card);

  var hist = ov.history || [];
  var tb = el('tbody');
  hist.forEach(function (h) {
    tb.appendChild(el('tr', null, [
      el('td', { text: fmtTime(h.t) }),
      el('td', null, [h.ok ? badge(['ok', 'b-ok']) : badge(['eroare', 'b-bad'])]),
      el('td', { class: 'num', text: fmtNum(h.products) }),
      el('td', { class: 'num', text: fmtNum(h.available) }),
      el('td', { class: 'num', text: fmtNum(h.celOrderable) }),
      el('td', { class: 'small', text: h.error || '' })
    ]));
  });
  root.appendChild(el('h3', { text: 'Istoric (ultimele ' + hist.length + ' rulări)' }));
  root.appendChild(el('div', { class: 'table-wrap' }, [el('table', null, [
    el('thead', null, [el('tr', null, [el('th', { text: 'Când' }), el('th', { text: 'Rezultat' }), el('th', { class: 'num', text: 'Produse' }),
      el('th', { class: 'num', text: 'Disp. clienți' }), el('th', { class: 'num', text: 'Comand. CEL' }), el('th', { text: 'Eroare' })])]),
    tb
  ])]));
}

// ---------- Produse ----------
var COL = { sku: 0, name: 1, stock: 2, price: 3, cel: 4, celReason: 5, client: 6, clientReason: 7, image: 8, greenTax: 9, gallery: 10, ean: 11, eanValid: 12 };
state.eanIndex = {}; // EAN -> lista de coduri de produs care îl folosesc
state.brokenImages = {}; // cod -> true pentru pozele care nu s-au încărcat (în această sesiune)

['q', 'f-cel', 'f-client', 'f-ov', 'f-img', 'f-ean'].forEach(function (id) {
  $(id).addEventListener(id === 'q' ? 'input' : 'change', function () { state.page = 0; applyFilters(); });
});
$('prev').addEventListener('click', function () { if (state.page > 0) { state.page--; renderProducts(); } });
$('next').addEventListener('click', function () { if ((state.page + 1) * PAGE_SIZE < state.filtered.length) { state.page++; renderProducts(); } });

function normalize(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

function buildEanIndex() {
  var idx = {};
  ((state.snapshot && state.snapshot.rows) || []).forEach(function (r) {
    var e = r[COL.ean];
    if (e) (idx[e] = idx[e] || []).push(r[COL.sku]);
  });
  state.eanIndex = idx;
}
/** Starea EAN a unui rând: null dacă lista nu are EAN (versiune veche). */
function eanState(r) {
  if (!state.snapshot || !state.snapshot.eanField || r.length <= COL.eanValid) return null;
  var e = r[COL.ean];
  if (!e) return { missing: true, invalid: false, dupes: [], ok: false };
  var dupes = (state.eanIndex[e] || []).filter(function (s) { return s !== r[COL.sku]; });
  var invalid = !r[COL.eanValid];
  return { missing: false, invalid: invalid, dupes: dupes, ok: !invalid && !dupes.length };
}
function eanCell(r) {
  var td = el('td', { 'data-label': 'EAN' });
  var es = eanState(r);
  if (es === null) { td.textContent = '-'; return td; }
  var wrap = el('div');
  if (es.missing) { wrap.appendChild(badge(['lipsă', 'b-warn'])); td.appendChild(wrap); return td; }
  wrap.appendChild(el('div', { class: 'code small', text: r[COL.ean] }));
  var marks = el('div', { class: 'row', style: 'gap:4px;margin-top:3px' });
  if (es.invalid) marks.appendChild(el('span', { class: 'badge b-bad', title: 'Cifra de control nu se potrivește sau formatul nu e EAN-8/12/13/14', text: 'invalid' }));
  if (es.dupes.length) {
    marks.appendChild(el('span', {
      class: 'badge b-warn',
      title: 'Același EAN apare și la: ' + es.dupes.join(', '),
      text: 'duplicat (' + (es.dupes.length + 1) + ')'
    }));
  }
  if (marks.firstChild) wrap.appendChild(marks);
  if (es.dupes.length) {
    wrap.appendChild(el('div', { class: 'small muted', style: 'margin-top:2px' }, [
      'și la ', el('button', { class: 'link small', type: 'button', text: es.dupes.slice(0, 3).join(', ') + (es.dupes.length > 3 ? '…' : ''), onclick: function () {
        $('q').value = r[COL.ean]; state.page = 0; applyFilters();
      } })
    ]));
  }
  td.appendChild(wrap);
  return td;
}
function eanStats() {
  var rows = (state.snapshot && state.snapshot.rows) || [];
  if (!rows.length || !state.snapshot.eanField || rows[0].length <= COL.eanValid) return null;
  var missing = 0, invalid = 0, dup = 0;
  rows.forEach(function (r) {
    var es = eanState(r);
    if (es.missing) missing++;
    if (es.invalid) invalid++;
    if (es.dupes.length) dup++;
  });
  return { missing: missing, invalid: invalid, dup: dup, problems: rows.filter(function (r) { return !eanState(r).ok; }).length };
}

function applyFilters() {
  var rows = (state.snapshot && state.snapshot.rows) || [];
  var q = normalize($('q').value.trim());
  var fc = $('f-cel').value, fk = $('f-client').value, fo = $('f-ov').value, fi = $('f-img').value, fe = $('f-ean').value;
  state.filtered = rows.filter(function (r) {
    if (q && normalize(r[COL.sku]).indexOf(q) < 0 && normalize(r[COL.name]).indexOf(q) < 0 && String(r[COL.ean] || '').indexOf(q) < 0) return false;
    if (fc === 'orderable' && r[COL.cel] <= 0) return false;
    if (fc === 'blocked' && r[COL.cel] > 0) return false;
    if (fc && fc !== 'orderable' && fc !== 'blocked' && r[COL.celReason] !== fc) return false;
    if (fk !== '' && String(r[COL.client]) !== fk) return false;
    if (fo === '1' && !state.overrides[r[COL.sku]]) return false;
    if (fi === 'gallery' && !(r[COL.gallery] > 0)) return false;
    if (fi === 'nogallery' && r[COL.gallery] > 0) return false;
    if (fi === 'broken' && !(state.brokenImages[r[COL.sku]] || !r[COL.image])) return false;
    if (fe) {
      var es = eanState(r);
      if (es === null) return false; // lista veche, fără EAN
      if (fe === 'problem' && es.ok) return false;
      if (fe === 'ok' && !es.ok) return false;
      if (fe === 'missing' && !es.missing) return false;
      if (fe === 'invalid' && !es.invalid) return false;
      if (fe === 'duplicate' && !es.dupes.length) return false;
    }
    return true;
  });
  renderProducts();
}

function overrideCell(sku) {
  var o = state.overrides[sku];
  var parts = [];
  if (o) {
    if (o.cel) parts.push(badge(['CEL: ' + MODE_LABELS[o.cel], o.cel === 'block' ? 'b-bad' : 'b-info']));
    if (o.client) parts.push(badge(['Clienți: ' + MODE_LABELS[o.client], o.client === 'block' ? 'b-bad' : 'b-info']));
    if (isPending(o)) parts.push(badge(['se aplică la următoarea sincronizare', 'b-warn']));
  }
  parts.push(el('button', { class: 'link small', type: 'button', text: o ? 'Editează' : 'Excepție', onclick: function () { openEdit(sku); } }));
  return el('td', null, [el('div', { class: 'row', style: 'gap:6px' }, parts)]);
}

function imageUrl(r) {
  var path = r[COL.image];
  if (!path) return '';
  return /^https?:/i.test(path) ? path : ((state.snapshot && state.snapshot.imageBase) || '') + path;
}
function bigImage(url) { return url.replace(/_LIST(\.[a-z0-9]+)$/i, '_big$1'); }
function missingBox(text) { return el('div', { class: 'thumb-missing', title: 'Poza principală nu se încarcă', text: text }); }
function galleryBadge(n) {
  if (n === undefined || n === null) return null;
  return n > 0 ? badge(['galerie: ' + n, 'b-ok']) : badge(['fără galerie', 'b-warn']);
}
function thumbCell(r) {
  var url = imageUrl(r);
  var td = el('td', { class: 'thumb-cell', 'data-label': 'Poză' });
  var wrap = el('div');
  if (!url) {
    wrap.appendChild(missingBox('fără poză'));
  } else if (state.brokenImages[r[COL.sku]]) {
    wrap.appendChild(missingBox('poză lipsă'));
  } else {
    var img = el('img', { class: 'thumb', loading: 'lazy', alt: '', referrerpolicy: 'no-referrer', src: url });
    var tries = 0;
    img.addEventListener('error', function () {
      // Site-ul poate refuza cererile prea dese: reîncercăm de două ori înainte să marcăm poza ca lipsă.
      var delays = [3000, 8000];
      if (tries < delays.length) {
        var n = ++tries;
        setTimeout(function () { img.src = url + (url.indexOf('?') < 0 ? '?r=' : '&r=') + n; }, delays[n - 1]);
        return;
      }
      state.brokenImages[r[COL.sku]] = true;
      var a = img.parentNode; if (a && a.parentNode) a.parentNode.replaceChild(missingBox('poză lipsă'), a);
    });
    wrap.appendChild(el('a', { href: bigImage(url), target: '_blank', rel: 'noopener noreferrer', title: 'Deschide poza mare' }, [img]));
  }
  var gb = galleryBadge(r[COL.gallery]);
  if (gb) wrap.appendChild(el('div', null, [gb]));
  td.appendChild(wrap);
  return td;
}
function fmtTax(v) { return v === null || v === undefined ? '-' : fmtPrice(v); }

function isPending(o) {
  var gen = state.snapshot && state.snapshot.generatedAt;
  return !!(o && o.updatedAt && gen && new Date(o.updatedAt) > new Date(gen));
}

function renderProducts() {
  var body = $('products-body'); clear(body);
  var total = state.filtered.length;
  var all = (state.snapshot && state.snapshot.rows) ? state.snapshot.rows.length : 0;
  if (!state.snapshot) {
    $('products-info').textContent = state.productsMsg || 'Se încarcă lista de produse…';
  } else {
    $('products-info').textContent = fmtNum(total) + ' din ' + fmtNum(all) + ' produse · date din ' + fmtTime(state.snapshot.generatedAt) +
      (state.productsMsg ? ' · ' + state.productsMsg : '');
  }
  var start = state.page * PAGE_SIZE;
  state.filtered.slice(start, start + PAGE_SIZE).forEach(function (r) {
    var celReason = REASONS[r[COL.celReason]] || [r[COL.celReason], 'b-muted'];
    var cliReason = CLIENT_REASONS[r[COL.clientReason]] || [r[COL.clientReason], 'b-muted'];
    var oc = overrideCell(r[COL.sku]); oc.setAttribute('data-label', 'Excepție');
    body.appendChild(el('tr', null, [
      thumbCell(r),
      el('td', { class: 'code', 'data-label': 'Cod', text: r[COL.sku] }),
      eanCell(r),
      el('td', { 'data-label': 'Nume', text: r[COL.name] }),
      el('td', { class: 'num', 'data-label': 'Stoc', text: fmtNum(r[COL.stock]) }),
      el('td', { class: 'num hide-sm', 'data-label': 'Preț', text: fmtPrice(r[COL.price]) }),
      el('td', { class: 'num hide-sm', 'data-label': 'Taxa verde', text: fmtTax(r[COL.greenTax]) }),
      el('td', { 'data-label': 'CEL' }, [el('div', null, [el('div', { class: 'small', style: 'margin-bottom:3px', text: 'stoc ' + fmtNum(r[COL.cel]) }), badge(celReason)])]),
      el('td', { 'data-label': 'Clienți' }, [badge(cliReason)]),
      oc
    ]));
  });
  if (!state.snapshot) body.appendChild(el('tr', null, [el('td', { colspan: '10', class: 'muted', text: state.productsMsg || 'Se încarcă lista de produse…' })]));
  if (total === 0 && state.snapshot) body.appendChild(el('tr', null, [el('td', { colspan: '10', class: 'muted', text: 'Niciun produs nu corespunde filtrelor.' })]));
  var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  $('page-info').textContent = 'Pagina ' + (state.page + 1) + ' din ' + pages;
  $('prev').disabled = state.page === 0;
  $('next').disabled = (state.page + 1) >= pages;
}

// ---------- Editare excepție ----------
var editing = null;
function productName(sku) {
  var rows = (state.snapshot && state.snapshot.rows) || [];
  for (var i = 0; i < rows.length; i++) if (rows[i][COL.sku] === sku) return rows[i][COL.name];
  return '';
}
function openEdit(sku) {
  editing = sku;
  var o = state.overrides[sku] || {};
  $('edit-title').textContent = 'Excepție: ' + sku;
  $('edit-sub').textContent = productName(sku) || 'Produsul nu mai apare în feed';
  $('e-cel').value = o.cel || 'default';
  $('e-client').value = o.client || 'default';
  $('e-note').value = o.note || '';
  $('edit').showModal();
}
$('e-cancel').addEventListener('click', function () { $('edit').close(); });
$('e-save').addEventListener('click', function () {
  var btn = $('e-save'); btn.disabled = true;
  saveOverride(editing, $('e-cel').value, $('e-client').value, $('e-note').value).then(function () { $('edit').close(); })
    .catch(function () {}).then(function () { btn.disabled = false; });
});

function saveOverride(sku, cel, client, note) {
  return api('POST', 'override', { sku: sku, cel: cel, client: client, note: note }).then(function (res) {
    if (res.override) state.overrides[sku] = res.override; else delete state.overrides[sku];
    applyFilters(); renderOverrides(); renderStatus();
    toast(res.override ? 'Excepție salvată. Se aplică la următoarea sincronizare.' : 'Excepție ștearsă. Se aplică la următoarea sincronizare.');
  }).catch(function (e) { toast('Eroare: ' + e.message); throw e; });
}

// ---------- Setări ----------
function numField(id, label, value, help) {
  return el('div', null, [el('label', { for: id, text: label }), el('input', { id: id, type: 'number', min: '0', max: '100000', step: '1', value: String(value), required: 'required' }), el('div', { class: 'help', text: help })]);
}
function renderSettings() {
  var root = $('tab-settings'); clear(root);
  var es = effectiveSettings();
  var s = es.s;
  var form = el('form', { id: 'settings-form' });
  form.appendChild(el('div', { class: 'form-grid' }, [
    numField('s-client', 'Prag disponibilitate clienți (buc.)', s.availableMinStock, 'Sub acest stoc produsul apare „indisponibil momentan” în feed-ul clienților.'),
    numField('s-cel', 'Prag comandabil pe CEL (buc.)', s.celMinStock, 'Sub acest stoc, pe CEL se trimite 0.'),
    numField('s-buffer', 'Rezervă CEL (buc.)', s.celStockBuffer, 'Se scade din stocul trimis pe CEL. 0 = stocul real.'),
    numField('s-max', 'Stoc maxim pe CEL (buc.)', s.celMaxStock || 0, 'Pe CEL nu apare mai mult de atât, chiar dacă ai mai mult. 0 = fără limită.'),
    el('div', null, [el('label', { for: 's-price', text: 'Produse cu preț 0' }),
      (function () {
        var sel = el('select', { id: 's-price' }, [el('option', { value: 'true', text: 'Blocate pe CEL (recomandat)' }), el('option', { value: 'false', text: 'Permise' })]);
        sel.value = s.celBlockZeroPrice ? 'true' : 'false'; return sel;
      })(),
      el('div', { class: 'help', text: 'Blocat = stoc 0 pe CEL, ca să nu se vândă la 0 lei.' })])
  ]));
  var actions = el('div', { class: 'row', style: 'margin-top:16px' }, [
    el('button', { class: 'btn primary', type: 'submit', text: 'Salvează setările' }),
    es.source === 'panou' ? el('button', { class: 'btn danger', type: 'button', text: 'Revino la valorile din workflow', onclick: resetSettings }) : null,
    el('span', { class: 'small muted' }, ['Sursa curentă: ', badge([es.source === 'panou' ? 'panou' : 'workflow', es.source === 'panou' ? 'b-info' : 'b-muted'])])
  ]);
  form.appendChild(actions);
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var body = {
      availableMinStock: Number($('s-client').value), celMinStock: Number($('s-cel').value),
      celStockBuffer: Number($('s-buffer').value), celMaxStock: Number($('s-max').value), celBlockZeroPrice: $('s-price').value === 'true'
    };
    api('PUT', 'settings', body).then(function (res) {
      state.overview.settings = res.settings; renderSettings(); renderStatus();
      toast('Setări salvate. Se aplică la următoarea sincronizare.');
    }).catch(function (err) { toast('Eroare: ' + err.message); });
  });
  root.appendChild(el('div', { class: 'card' }, [el('h2', { text: 'Setări' }),
    el('p', { class: 'muted small', text: 'Setările salvate aici au prioritate față de cele din fișierul workflow din GitHub. Se aplică la următoarea sincronizare (butonul „Sincronizează acum”).' }), form]));
}
function resetSettings() {
  api('DELETE', 'settings').then(function () {
    state.overview.settings = null; renderSettings(); renderStatus();
    toast('Revenit la valorile din workflow, de la următoarea sincronizare.');
  }).catch(function (e) { toast('Eroare: ' + e.message); });
}

// ---------- Excepții ----------
function renderOverrides() {
  var root = $('tab-overrides'); clear(root);
  var skus = Object.keys(state.overrides || {}).sort();
  root.appendChild(el('h2', { text: 'Excepții pe produs (' + skus.length + ')' }));
  root.appendChild(el('p', { class: 'muted small', text: 'Excepțiile au prioritate față de reguli. Adaugi una din tab-ul Produse, cu butonul „Excepție” de pe rând.' }));
  if (!skus.length) { root.appendChild(el('div', { class: 'alert info', text: 'Nu ai nicio excepție.' })); return; }
  var tb = el('tbody');
  skus.forEach(function (sku) {
    var o = state.overrides[sku];
    tb.appendChild(el('tr', null, [
      el('td', { class: 'code', text: sku }),
      el('td', { text: productName(sku) || '(nu mai apare în feed)' }),
      el('td', { text: o.cel ? MODE_LABELS[o.cel] : '-' }),
      el('td', { text: o.client ? MODE_LABELS[o.client] : '-' }),
      el('td', { class: 'small', text: o.note || '' }),
      el('td', { class: 'small muted', text: fmtTime(o.updatedAt) }),
      el('td', null, [el('div', { class: 'row', style: 'gap:10px' }, [
        isPending(o) ? badge(['în așteptare', 'b-warn']) : null,
        el('button', { class: 'link small', type: 'button', text: 'Editează', onclick: function () { openEdit(sku); } }),
        el('button', { class: 'link small', type: 'button', style: 'color:var(--bad)', text: 'Șterge', onclick: function () {
          if (confirmDelete(sku)) saveOverride(sku, 'default', 'default', '').catch(function () {});
        } })
      ])])
    ]));
  });
  root.appendChild(el('div', { class: 'table-wrap' }, [el('table', null, [
    el('thead', null, [el('tr', null, [el('th', { text: 'Cod' }), el('th', { text: 'Nume' }), el('th', { text: 'CEL' }), el('th', { text: 'Clienți' }),
      el('th', { text: 'Notă' }), el('th', { text: 'Modificat' }), el('th', { text: '' })])]),
    tb
  ])]));
}
// Ștergerea se face cu dublu click pe „Șterge” (fără dialog de confirmare al browserului).
var pendingDelete = null;
function confirmDelete(sku) {
  if (pendingDelete === sku) { pendingDelete = null; return true; }
  pendingDelete = sku; toast('Apasă din nou „Șterge” ca să confirmi ștergerea excepției pentru ' + sku);
  setTimeout(function () { if (pendingDelete === sku) pendingDelete = null; }, 4000);
  return false;
}

// ---------- Date tehnice (producător) ----------
var tech = { data: null, mapping: null, meta: null, loading: null };
function techCodes() {
  return $('tech-codes').value.split(/[\s,;]+/).map(function (x) { return x.trim(); }).filter(Boolean);
}
function loadTech(force) {
  if (!state.token) return Promise.resolve(); // se reia după logare
  if (tech.loading && !force) return tech.loading;
  if (tech.data && tech.mapping && !force) return Promise.resolve();
  $('tech-info').textContent = 'Se încarcă datele producătorului (~3 MB)…';
  tech.loading = Promise.all([
    api('GET', 'bapp-mapping'),
    api('GET', 'bapp-feed-codes').then(function (r) { tech.feedCodes = r.codes || []; renderTechFeedInfo(); }),
    api('GET', 'bapp').catch(function (e) { if (e.status === 404) return null; throw e; })
  ]).then(function (res) {
    tech.meta = res[0]; tech.mapping = res[0].mapping; tech.data = res[2];
    renderTechInfo(); renderMapping();
  }).catch(function (e) {
    $('tech-info').textContent = 'Eroare: ' + e.message;
  }).then(function () { tech.loading = null; });
  return tech.loading;
}
function renderTechInfo() {
  var d = tech.data;
  if (!d) {
    $('tech-info').textContent = 'Nu există încă date de la producător. Pune secretul BAPP_FEED_URL în GitHub și apasă „Sincronizează acum”.';
    return;
  }
  $('tech-info').textContent = fmtNum(Object.keys(d.products).length) + ' produse de la producător (' + d.source + '), ' +
    fmtNum(Object.keys(d.index).length) + ' legate de codurile tale (' + fmtNum(d.matched.byCode) + ' după cod, ' +
    fmtNum(d.matched.byEan) + ' după EAN) · date din ' + fmtTime(d.generatedAt);
}
function renderTechFeedInfo() {
  var root = $('tech-feed-info'); clear(root);
  var n = (tech.feedCodes || []).length;
  var st = state.overview && state.overview.status && state.overview.status.techFeed;
  root.appendChild(document.createTextNode('Link: '));
  root.appendChild(el('a', { href: '/date-tehnice.xml', target: '_blank', rel: 'noopener', text: location.origin + '/date-tehnice.xml' }));
  root.appendChild(document.createTextNode(' · ' + (n ? fmtNum(n) + ' coduri salvate' : 'nicio listă salvată')));
  if (st) root.appendChild(document.createTextNode(' · la ultima sincronizare: ' + fmtNum(st.products) + ' produse în feed' + (st.missing ? ', ' + fmtNum(st.missing) + ' negăsite' : '')));
}
$('tech-feed-save').addEventListener('click', function () {
  var codes = techCodes();
  var msg = codes.length ? 'Salvez ' + fmtNum(codes.length) + ' coduri pentru feed…' : 'Golesc lista feed-ului…';
  toast(msg);
  api('PUT', 'bapp-feed-codes', { codes: codes }).then(function (res) {
    tech.feedCodes = codes; renderTechFeedInfo();
    // Feed-ul se generează la sincronizare: o pornim imediat, ca linkul să funcționeze.
    if (!state.syncing && res.count) {
      toast(fmtNum(res.count) + ' coduri salvate. Pornesc sincronizarea ca să generez feed-ul…');
      setTimeout(function () { $('sync').click(); }, 800);
    } else {
      toast(fmtNum(res.count) + ' coduri salvate. Feed-ul se actualizează la următoarea sincronizare.');
    }
  }).catch(function (e) { toast('Eroare: ' + e.message); });
});
$('tech-feed-load').addEventListener('click', function () {
  loadTech().then(function () {
    $('tech-codes').value = (tech.feedCodes || []).join('\n');
    toast(fmtNum((tech.feedCodes || []).length) + ' coduri încărcate din lista salvată');
  });
});
function techTable() {
  return BAPP.buildImportTable(techCodes(), tech.data, tech.mapping, BAPP.translateValue, tech.meta.columns);
}
$('tech-clear').addEventListener('click', function () { $('tech-codes').value = ''; clear($('tech-result')); });
$('tech-all').addEventListener('click', function () {
  loadTech().then(function () {
    if (!tech.data) return;
    $('tech-codes').value = Object.keys(tech.data.index).sort().join('\n');
    toast(fmtNum(Object.keys(tech.data.index).length) + ' coduri adăugate');
  });
});
$('tech-preview').addEventListener('click', function () {
  loadTech().then(function () {
    if (!tech.data) return toast('Nu există date de la producător.');
    var codes = techCodes();
    if (!codes.length) return toast('Pune cel puțin un cod.');
    var t = techTable(); var root = $('tech-result'); clear(root);
    root.appendChild(el('p', { class: 'small' }, [
      badge([fmtNum(t.perProduct.length) + ' găsite', 'b-ok']), ' ',
      t.missing.length ? badge([fmtNum(t.missing.length) + ' negăsite', 'b-warn']) : null, ' ',
      el('span', { class: 'muted', text: fmtNum(t.rows[0].length) + ' coloane în fișier' })
    ]));
    if (t.missing.length) root.appendChild(el('div', { class: 'alert warn', text: 'Negăsite la producător: ' + t.missing.slice(0, 50).join(', ') + (t.missing.length > 50 ? ' …' : '') }));
    var tb = el('tbody');
    t.perProduct.slice(0, 200).forEach(function (p) {
      var prod = tech.data.products[p.supplierCode]; var img = prod && prod.p && prod.p[0];
      tb.appendChild(el('tr', null, [
        el('td', { class: 'thumb-cell', 'data-label': 'Poză' }, [img ? el('a', { href: img, target: '_blank', rel: 'noopener noreferrer' }, [el('img', { class: 'thumb', loading: 'lazy', alt: '', referrerpolicy: 'no-referrer', src: img })]) : missingBox('fără poză')]),
        el('td', { class: 'code', 'data-label': 'Cod', text: p.code }),
        el('td', { class: 'code small', 'data-label': 'Cod producător', text: p.supplierCode }),
        el('td', { 'data-label': 'Nume', text: (prod && prod.n) || '' }),
        el('td', { class: 'num', 'data-label': 'Valori', text: fmtNum(p.values) }),
        el('td', { class: 'num', 'data-label': 'Poze', text: fmtNum(p.photos) }),
        el('td', { 'data-label': 'Categorie' }, [categoryInfo(p)])
      ]));
    });
    root.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'cards' }, [
      el('thead', null, [el('tr', null, [el('th', { text: 'Poză' }), el('th', { text: 'Cod' }), el('th', { text: 'Cod producător' }), el('th', { text: 'Nume' }), el('th', { class: 'num', text: 'Valori tehnice' }), el('th', { class: 'num', text: 'Poze' }), el('th', { text: 'Categorie' })])]),
      tb
    ])]));
    if (t.perProduct.length > 200) root.appendChild(el('p', { class: 'small muted', text: 'Afișez primele 200. Fișierul le conține pe toate.' }));
  });
});
$('tech-download').addEventListener('click', function () {
  loadTech().then(function () {
    if (!tech.data) return toast('Nu există date de la producător.');
    if (!techCodes().length) return toast('Pune cel puțin un cod.');
    var t = techTable();
    if (!t.perProduct.length) return toast('Niciun cod nu a fost găsit la producător.');
    var bytes = BAPP.buildXlsx(t.rows, 'Content');
    var blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    var d = new Date(); var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var a = el('a', { href: URL.createObjectURL(blob), download: 'import-date-tehnice-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.xlsx' });
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Fișier generat: ' + fmtNum(t.perProduct.length) + ' produse' + (t.missing.length ? ', ' + fmtNum(t.missing.length) + ' negăsite' : ''));
  });
});

function categoryInfo(p) {
  var mode = tech.mapping.categoryMode || 'new';
  var box = el('div', { class: 'small' });
  if (p.category) box.appendChild(document.createTextNode(p.category));
  else if (mode === 'off') box.appendChild(badge(['nu se exportă', 'b-muted']));
  else if (p.existing && mode === 'new') box.appendChild(badge(['rămâne cea actuală', 'b-muted']));
  else box.appendChild(badge(['fără categorie: alege-o la Mapare', 'b-warn']));
  if (!p.existing) box.appendChild(el('div', null, [badge(['produs nou', 'b-info'])]));
  if (p.family) box.appendChild(el('div', { class: 'muted', style: 'margin-top:2px', text: 'Braytron: ' + p.family }));
  return box;
}

function renderCategories(root) {
  var m = tech.mapping, d = tech.data;
  var cats = (d && d.categories) || {};
  var fams = Object.keys(cats).sort(function (a, b) { return cats[b].total - cats[a].total; });
  root.appendChild(el('h3', { style: 'margin-top:20px', text: 'Categorii (familie Braytron → categoria de pe site)' }));
  var mode = el('select', { id: 'map-catmode', style: 'max-width:420px' }, [
    el('option', { value: 'new', text: 'Doar la produsele noi (recomandat): cele existente își păstrează categoria' }),
    el('option', { value: 'all', text: 'La toate produsele: suprascrie și categoria celor existente' }),
    el('option', { value: 'off', text: 'Nu exporta categoria' })
  ]);
  mode.value = m.categoryMode || 'new';
  root.appendChild(el('div', null, [el('label', { for: 'map-catmode', text: 'Când se pune categoria în fișier și în feed' }), mode]));
  if (!fams.length) { root.appendChild(el('p', { class: 'small muted', text: 'Corespondența apare după prima sincronizare cu versiunea nouă.' })); return; }
  var none = fams.filter(function (f) { return !cats[f].category && !(m.categories || {})[f]; }).length;
  root.appendChild(el('p', { class: 'small muted', text: 'Categoria propusă e cea mai des folosită pe site la produsele tale din aceeași familie Braytron (procentul arată cât de des). Scrie o altă categorie ca s-o înlocuiești; gol = cea propusă. ' + (none ? fmtNum(none) + ' familii nu au categorie propusă (doar produse noi): alege-le tu.' : '') }));
  var dl = el('datalist', { id: 'site-cats' });
  ((d && d.siteCategories) || []).forEach(function (c) { dl.appendChild(el('option', { value: c })); });
  root.appendChild(dl);
  var tb = el('tbody');
  fams.forEach(function (f) {
    var c = cats[f]; var own = (m.categories || {})[f] || '';
    tb.appendChild(el('tr', { 'data-family': f }, [
      el('td', { 'data-label': 'Familie Braytron', text: f }),
      el('td', { class: 'num', 'data-label': 'Produse', text: fmtNum(c.total) + (c.total > c.linked ? ' (' + fmtNum(c.total - c.linked) + ' noi)' : '') }),
      el('td', { 'data-label': 'Propusă' }, [c.category ? el('div', null, [document.createTextNode(c.category + ' '), badge([c.share + '%', c.share >= 90 ? 'b-ok' : 'b-warn'])]) : badge(['fără', 'b-warn'])]),
      el('td', { 'data-label': 'Categoria ta' }, [el('input', { class: 'map-cat', list: 'site-cats', value: own, placeholder: c.category || 'alege categoria' })])
    ]));
  });
  root.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'cards' }, [
    el('thead', null, [el('tr', null, [el('th', { text: 'Familie Braytron' }), el('th', { class: 'num', text: 'Produse' }), el('th', { text: 'Categoria propusă' }), el('th', { text: 'Categoria ta' })])]),
    tb
  ])]));
}

function renderMapping() {
  var root = $('tech-mapping'); clear(root);
  var m = tech.mapping, meta = tech.meta, d = tech.data;
  var attrs = (d && d.attributes) || {};
  var slugs = Object.keys(m.rules);
  Object.keys(attrs).forEach(function (s) { if (slugs.indexOf(s) < 0) slugs.push(s); });
  slugs.sort(function (a, b) { return ((attrs[b] && attrs[b].count) || 0) - ((attrs[a] && attrs[a].count) || 0); });
  var dl = el('datalist', { id: 'tech-cols' });
  meta.columns.forEach(function (c) { dl.appendChild(el('option', { value: c })); });
  root.appendChild(dl);
  root.appendChild(el('p', { class: 'small muted', text: 'Alege coloana Teamshare pentru fiecare atribut (gol = nu se exportă). Unitatea se adaugă doar la valorile care sunt numai număr (ex. 16 → 16 w). „De verificat” = atribute pentru care șablonul are mai multe coloane cu același nume.' }));
  var tb = el('tbody');
  slugs.forEach(function (slug) {
    var rule = m.rules[slug] || { column: '' };
    var info = attrs[slug];
    tb.appendChild(el('tr', { 'data-slug': slug }, [
      el('td', { class: 'code small', 'data-label': 'Atribut', text: slug }),
      el('td', { 'data-label': 'Denumire', text: info ? info.title : '-' }),
      el('td', { class: 'num', 'data-label': 'Produse', text: info ? fmtNum(info.count) : '0' }),
      el('td', { 'data-label': 'Coloană' }, [
        el('input', { class: 'map-col', list: 'tech-cols', value: rule.column || '', placeholder: '(nu se exportă)' }),
        meta.uncertain.indexOf(slug) >= 0 ? el('span', { class: 'badge b-warn', style: 'margin-top:4px', text: 'de verificat' }) : null
      ]),
      el('td', { 'data-label': 'Unitate' }, [el('input', { class: 'map-unit', value: rule.unit || '', maxlength: '12', style: 'max-width:90px' })])
    ]));
  });
  root.appendChild(el('div', { class: 'table-wrap' }, [el('table', { class: 'cards' }, [
    el('thead', null, [el('tr', null, [el('th', { text: 'Atribut' }), el('th', { text: 'Denumire la producător' }), el('th', { class: 'num', text: 'Produse' }), el('th', { text: 'Coloană Teamshare' }), el('th', { text: 'Unitate' })])]),
    tb
  ])]));
  var tr = Object.keys(m.translations).map(function (k) { return k + ' = ' + m.translations[k]; }).join('\n');
  var trBox = el('textarea', { id: 'map-tr', rows: '10', spellcheck: 'false' }); trBox.value = tr;
  var tChk = el('input', { type: 'checkbox', id: 'map-translate', style: 'width:auto' }); tChk.checked = m.translate !== false;
  root.appendChild(el('div', { class: 'form-grid', style: 'margin-top:16px' }, [
    el('div', null, [el('label', { for: 'map-tr', text: 'Traduceri (o regulă pe rând: englez = română)' }), trBox,
      el('div', { class: 'help', text: 'Întâi se caută valoarea întreagă (ex. „Black-Golden”), apoi se înlocuiesc cuvintele (Black → Negru). Cele mai lungi expresii au prioritate.' })]),
    el('div', null, [
      el('label', null, [tChk, ' Traduce valorile în română']),
      el('label', { for: 'map-sep', style: 'margin-top:12px', text: 'Separator pentru pozele din AddImages' }),
      el('input', { id: 'map-sep', value: m.imageSeparator, maxlength: '5', style: 'max-width:90px' }),
      el('label', { for: 'map-prefix', style: 'margin-top:12px', text: 'Prefixul codurilor tale față de codurile producătorului' }),
      el('input', { id: 'map-prefix', value: m.codePrefix, maxlength: '20', style: 'max-width:140px' }),
      el('div', { class: 'help', text: 'Ex.: BR- (codul tău BR-BG38-12581 = codul Braytron BG38-12581).' })
    ])
  ]));
  renderCategories(root);
  root.appendChild(el('div', { class: 'row', style: 'margin-top:14px' }, [
    el('button', { class: 'btn primary', type: 'button', text: 'Salvează maparea', onclick: saveMapping }),
    el('button', { class: 'btn danger', type: 'button', text: 'Revino la maparea propusă', onclick: resetMapping }),
    el('span', { class: 'small muted' }, ['Sursa: ', badge([meta.saved ? 'salvată de tine' : 'propusă', meta.saved ? 'b-info' : 'b-muted'])])
  ]));
}
function collectMapping() {
  var rules = {};
  Array.prototype.forEach.call(document.querySelectorAll('#tech-mapping tr[data-slug]'), function (tr) {
    var col = tr.querySelector('.map-col').value.trim(); var unit = tr.querySelector('.map-unit').value;
    rules[tr.getAttribute('data-slug')] = unit ? { column: col, unit: unit } : { column: col };
  });
  var translations = {};
  $('map-tr').value.split('\n').forEach(function (line) {
    var i = line.indexOf('=');
    if (i <= 0) return;
    var k = line.slice(0, i).trim(); var v = line.slice(i + 1).trim();
    if (k) translations[k] = v;
  });
  var categories = {};
  Array.prototype.forEach.call(document.querySelectorAll('#tech-mapping tr[data-family]'), function (tr) {
    var v = tr.querySelector('.map-cat').value.trim();
    if (v) categories[tr.getAttribute('data-family')] = v;
  });
  return { rules: rules, translate: $('map-translate').checked, translations: translations, imageSeparator: $('map-sep').value || '#', codePrefix: $('map-prefix').value.trim(),
    categoryMode: $('map-catmode') ? $('map-catmode').value : 'new', categories: categories };
}
function saveMapping() {
  api('PUT', 'bapp-mapping', collectMapping()).then(function (res) {
    tech.mapping = res.mapping; tech.meta.saved = true; renderMapping(); toast('Maparea a fost salvată.');
  }).catch(function (e) { toast('Eroare: ' + e.message); });
}
function resetMapping() {
  api('DELETE', 'bapp-mapping').then(function () {
    tech.mapping = tech.meta.defaults; tech.meta.saved = false; renderMapping(); toast('Revenit la maparea propusă.');
  }).catch(function (e) { toast('Eroare: ' + e.message); });
}

// ---------- start ----------
var initial = (location.hash || '').replace('#', '');
if (['status', 'products', 'settings', 'overrides', 'tech'].indexOf(initial) >= 0) showTab(initial);
state.token = store(true);
if (state.token) load(false).catch(function () {}); else showLogin();
})();
`;
