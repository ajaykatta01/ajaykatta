/* ============================================================================
   Ajay Katta Portfolio — SITE EDITOR (site-edit.js)
   ----------------------------------------------------------------------------
   Loaded ONLY for an unlocked admin (site-content.js injects it). Lets you edit
   the whole site yourself — phone, tablet or desktop — and export the result.

     • Inline  : tap any text to retype it, tap any photo to swap it.
     • Panel   : sections (hide / reorder), theme colours, SEO, links, files,
                 versions, publish.
     • Safety  : preview, 10 versions with revert, discard-all, change summary,
                 password re-entry before the ZIP is written.
     • Publish : ZIP with site-content.json + media/site/ → drop in the repo.

   Working copy lives in IndexedDB ("ak-portfolio" → kv → "site:content").
   Visitors never load this file.
========================================================================== */
(function () {
  "use strict";
  if (window.__AKS) return; window.__AKS = 1;
  var S = window.AK_SITE;
  if (!S) { console.warn("[site-edit] site-content.js must load first"); return; }

  var PAGE = S.PAGE;
  var PW_KEY = "ak-admin-pw", SESSION = "ak-admin-unlocked";
  var BAKED = "fc3bc90afab65978286ab14b40b51bbe5b8ab2d3208e6a440c7844babcf89892";
  var FLAG = "ak-site-edits";
  var MAXV = 10;
  var PAGES = ["index", "project-ui-ux", "project-gen-ai", "project-3d", "resume"];
  var PAGELABEL = { "index": "Home", "project-ui-ux": "UI / UX", "project-gen-ai": "Gen AI", "project-3d": "3D", "resume": "Résumé" };
  var BUCKETS = [["text", "Text"], ["html", "Text"], ["img", "Photo"], ["href", "Link"], ["attr", "Setting"], ["hide", "Hidden"], ["order", "Reordered"]];

  /* ---- case studies: projects added with admin.js, surfaced here before publish ----
     admin.js keeps each category page's projects in IndexedDB under data:<key>.
     A project (and the files dropped into it) exists only on this device until it
     is published, so Settings lists them alongside the page-content changes. */
  var CASEPAGES = [["project-ui-ux", "ui-ux"], ["project-gen-ai", "gen-ai"], ["project-3d", "3d"]];
  var CASES = null;   // [{page,key,label,projects:[…],pending:[…]}]
  var CASEBASE = null; // this device's project data as of its last publish (admin.js writes it)

  /* The local copy of a published project is NEVER byte-identical to the live JSON:
     media lives as a data: URL here and as a media/… path there, and the editor keeps
     runtime-only fields. So "already live" is judged loosely against portfolio-data.json
     — media references collapse to one token, blanks and runtime keys drop out — while
     an exact match against the last-publish snapshot (when there is one) is what proves
     nothing changed since. */
  var SKIPKEYS = { seeded: 1, open: 1, _rev: 1, updatedAt: 1, savedAt: 1, ts: 1 };
  function loose(v) {
    if (typeof v === "string") return (v.slice(0, 5) === "data:" || /^media\//i.test(v) || /^blob:/.test(v)) ? "@f" : v.replace(/\s+/g, " ").trim();
    if (Array.isArray(v)) return v.map(loose);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).sort().forEach(function (k) {
        if (SKIPKEYS[k] || k.charAt(0) === "_") return;
        var x = loose(v[k]);
        if (x === "" || x == null || x === false) return;
        if (Array.isArray(x) && !x.length) return;
        if (x && typeof x === "object" && !Array.isArray(x) && !Object.keys(x).length) return;
        o[k] = x;
      });
      return o;
    }
    return v;
  }
  function sameLive(a, b) { return eq(loose(a), loose(b)); }
  function countMedia(v, acc) {
    if (typeof v === "string") {
      if (v.slice(0, 5) === "data:") { acc.files++; acc.pendingFiles++; acc.bytes += dataBytes(v); }
      else if (/^media\//i.test(v)) acc.files++;
      return acc;
    }
    if (Array.isArray(v)) { v.forEach(function (x) { countMedia(x, acc); }); return acc; }
    if (v && typeof v === "object") { for (var k in v) countMedia(v[k], acc); }
    return acc;
  }
  function projRow(it, state) {
    var m = countMedia(it, { files: 0, pendingFiles: 0, bytes: 0 });
    return {
      id: it.id, state: state,
      title: it.title || it.label || "Untitled project",
      tag: it.tag || (it.meta && it.meta.role) || "",
      blocks: (it.blocks || []).length,
      files: m.files, pendingFiles: m.pendingFiles, bytes: m.bytes
    };
  }
  function caseProjects(local, live, base) {
    var pItems = (live && live.items) || [];
    var lItems = (local && local.items && local.items.length) ? local.items : null;
    if (!lItems) return pItems.map(function (it) { return projRow(it || {}, "live"); });
    var byId = {}; pItems.forEach(function (it) { if (it && it.id) byId[it.id] = it; });
    var byBase = {}; ((base && base.items) || []).forEach(function (it) { if (it && it.id) byBase[it.id] = it; });
    var hasBase = !!(base && base.items);
    var out = [], seen = {};
    lItems.forEach(function (it) {
      if (!it) return;
      seen[it.id] = 1;
      var pub = byId[it.id], bse = byBase[it.id], state;
      if (!pub && !bse) state = "new";
      else if (hasBase && bse) state = eq(bse, it) ? "live" : "edited";           // exact: nothing changed since the last publish
      else if (pub) state = sameLive(pub, it) ? "live" : "edited";                 // no snapshot: loose match with the live JSON
      else state = "edited";
      out.push(projRow(it, state));
    });
    pItems.forEach(function (it) {
      if (!it || seen[it.id]) return;
      var r = projRow(it, "removed"); r.files = 0; r.pendingFiles = 0; r.bytes = 0; out.push(r);
    });
    return out;
  }
  function loadCases() {
    return Promise.all([
      fetch("portfolio-data.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }),
      idbGet("case:pub-base")
    ].concat(CASEPAGES.map(function (c) { return idbGet("data:" + c[1]); }))).then(function (res) {
      var live = res[0] || {};
      CASEBASE = (res[1] && res[1].data) || null;
      CASES = CASEPAGES.map(function (c, i) {
        var projects = caseProjects(res[i + 2], live[c[1]], CASEBASE && CASEBASE[c[1]]);
        return {
          page: c[0], key: c[1], label: PAGELABEL[c[0]] || c[1], projects: projects,
          pending: projects.filter(function (p) { return p.state !== "live"; })
        };
      });
      syncBar();
      return CASES;
    }).catch(function () { CASES = []; return CASES; });
  }
  function cases() { return CASES ? Promise.resolve(CASES) : loadCases(); }
  // admin.js fires this whenever a project is created / edited / deleted on this page
  document.addEventListener("ak-cases-changed", function () { CASES = null; loadCases(); });
  function caseTotal() { var n = 0; (CASES || []).forEach(function (g) { n += g.pending.length; }); return n; }
  function projLine(p) {
    var bits = [];
    if (p.tag) bits.push(short(p.tag, 18));
    bits.push(p.files + " file" + (p.files === 1 ? "" : "s"));
    if (p.state !== "live" && p.pendingFiles) bits.push(p.pendingFiles + " not yet published · " + kb(p.bytes));
    else if (p.blocks) bits.push(p.blocks + " block" + (p.blocks === 1 ? "" : "s"));
    return bits.join(" · ");
  }
  var STATEC = { "new": "#36d399", edited: "var(--accent,#E5783A)", removed: "#ef4444", live: "var(--muted,#C9C8C6)" };
  function pill(state) {
    var c = STATEC[state] || STATEC.live;
    return h("span", { style: "flex:none;padding:3px 9px;border-radius:99px;font-size:.64rem;font-weight:700;letter-spacing:.04em;" +
      "text-transform:uppercase;color:" + c + ";background:color-mix(in srgb," + c + " 16%,transparent);" +
      "border:1px solid color-mix(in srgb," + c + " 38%,transparent)" }, [state === "live" ? "Live" : state === "new" ? "New" : state === "edited" ? "Edited" : "Removed"]);
  }

  /* PUBBASE = snapshot of this device's edits at the moment they were last
     downloaded for publishing. A value that matches EITHER the live
     site-content.json or this snapshot is already published, so it must not
     count as pending. (Photos only match the snapshot: the live file holds a
     media/site/… path while the local copy still holds the data: URL.) */
  var PUBBASE = null, PUBAT = 0;
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function isPublished(p, b, k, v) {
    var live = (((S.published || {})[p] || {})[b] || {});
    if (k in live && eq(live[k], v)) return true;
    var snap = (((PUBBASE || {})[p] || {})[b] || {});
    return (k in snap) && eq(snap[k], v);
  }
  function varPublished(p, mode, k, v) {
    var live = ((((S.published || {})[p] || {}).vars || {})[mode] || {});
    if (k in live && eq(live[k], v)) return true;
    var snap = ((((PUBBASE || {})[p] || {}).vars || {})[mode] || {});
    return (k in snap) && eq(snap[k], v);
  }
  function allPages() {
    var seen = {}, out = [];
    PAGES.concat(Object.keys(DATA || {})).forEach(function (p) { if (!seen[p]) { seen[p] = 1; out.push(p); } });
    return out;
  }
  function markPublished() {
    PUBBASE = JSON.parse(JSON.stringify(DATA)); PUBAT = Date.now();
    idbSet("site:published-base", { at: PUBAT, data: PUBBASE });
    markCasesPublished();
    flagChanged(); syncBar();
  }
  // the projects on this device are now the published ones too
  function markCasesPublished() {
    return Promise.all(CASEPAGES.map(function (c) { return idbGet("data:" + c[1]); })).then(function (vals) {
      var data = {};
      CASEPAGES.forEach(function (c, i) { if (vals[i]) data[c[1]] = vals[i]; });
      return idbSet("case:pub-base", { at: Date.now(), data: data });
    }).then(function () { CASES = null; return loadCases(); }).catch(function () {});
  }

  /* ---------------------------------------------------------------- helpers */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "style") e.style.cssText = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c == null) return; e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function sha256(str) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(str)).then(function (b) {
      return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
    });
  }
  function storedPW() { try { return localStorage.getItem(PW_KEY) || BAKED; } catch (e) { return BAKED; } }
  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function dataBytes(d) { try { return Math.round((d.split(",")[1] || "").length * 0.75); } catch (e) { return 0; } }
  function short(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > (n || 46) ? s.slice(0, n || 46) + "…" : s; }
  function ago(ts) {
    var d = Math.round((Date.now() - ts) / 1000);
    if (d < 60) return "just now";
    if (d < 3600) return Math.round(d / 60) + " min ago";
    if (d < 86400) return Math.round(d / 3600) + " h ago";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  /* ------------------------------------------------------------------- idb */
  var DB;
  function db() {
    if (DB) return Promise.resolve(DB);
    return new Promise(function (res, rej) {
      var rq = indexedDB.open("ak-portfolio", 1);
      rq.onupgradeneeded = function () { try { rq.result.createObjectStore("kv"); } catch (e) {} };
      rq.onsuccess = function () { DB = rq.result; res(DB); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function idbGet(k) { return db().then(function (d) { return new Promise(function (res) { var r = d.transaction("kv").objectStore("kv").get(k); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; }); }).catch(function () { return null; }); }
  function idbSet(k, v) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = res; t.onerror = function () { rej(t.error); }; }); }); }

  /* ----------------------------------------------------------------- state */
  var DATA = {};             // full multi-page overrides (working copy)
  var SRC = null;            // pristine parsed copy of this page's HTML (for Reset)
  var UNDO = [];             // {page,bucket,key,prev}
  var ON = false;            // edit mode
  var sel = null;            // currently selected element
  var dirty = false;
  var vTimer = null;

  function pd(p) { p = p || PAGE; if (!DATA[p]) DATA[p] = {}; return DATA[p]; }
  function bucket(name, p) { var d = pd(p); if (!d[name]) d[name] = {}; return d[name]; }
  function getOv(name, key, p) { var d = DATA[p || PAGE]; return d && d[name] ? d[name][key] : undefined; }

  function setOv(name, key, val, opts) {
    opts = opts || {};
    var b = bucket(name);
    if (!opts.noUndo) UNDO.push({ page: PAGE, bucket: name, key: key, prev: b[key] });
    if (val == null) delete b[key]; else b[key] = val;
    dirty = true;
    markDirty();
    save();
  }
  function save() {
    try { localStorage.setItem(FLAG, "1"); } catch (e) {}
    S.localWins = true;
    return idbSet("site:content", DATA).then(snapshotSoon);
  }
  function snapshotSoon() {
    clearTimeout(vTimer);
    vTimer = setTimeout(function () { snapshot("auto"); }, 20000);
  }
  function snapshot(label) {
    return idbGet("site:versions").then(function (v) {
      v = Array.isArray(v) ? v : [];
      var json = JSON.stringify(DATA);
      if (v[0] && v[0].json === json) return;
      v.unshift({ ts: Date.now(), label: label || "auto", json: json });
      return idbSet("site:versions", v.slice(0, MAXV));
    }).catch(function () {});
  }

  /* ------------------------------------------------------------------- css */
  function injectCSS() {
    document.head.appendChild(h("style", { id: "aks-css", html: `
    .aks-ui,.aks-ui *{box-sizing:border-box;font-family:'Inter',system-ui,sans-serif}
    .aks-bar{position:fixed;z-index:2147483000;right:14px;bottom:calc(14px + env(safe-area-inset-bottom));
      display:flex;align-items:center;gap:6px;padding:6px;border-radius:99px;
      background:color-mix(in srgb,var(--surface,#1D1C1A) 92%,transparent);border:1px solid var(--line,#373634);
      backdrop-filter:blur(14px);box-shadow:0 12px 40px rgba(0,0,0,.34)}
    @media(max-width:860px){.aks-bar{right:10px;left:10px;bottom:calc(10px + env(safe-area-inset-bottom));justify-content:center}}
    .aks-b{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:44px;height:44px;padding:0 14px;
      border:0;border-radius:99px;background:transparent;color:var(--muted,#C9C8C6);font-size:.83rem;font-weight:600;
      cursor:pointer;transition:.18s;-webkit-tap-highlight-color:transparent;white-space:nowrap}
    .aks-b:hover{background:color-mix(in srgb,var(--text,#fff) 8%,transparent);color:var(--text,#fff)}
    .aks-b svg{width:18px;height:18px;flex:none}
    .aks-b.pri{background:linear-gradient(135deg,var(--accent,#E5783A),var(--accent-2,#C2410C));color:#fff}
    .aks-b.pri:hover{filter:brightness(1.08)}
    .aks-b.on{background:color-mix(in srgb,var(--accent,#E5783A) 20%,transparent);color:var(--accent,#E5783A)}
    .aks-b[disabled]{opacity:.4;pointer-events:none}
    .aks-b .lb{display:inline}
    @media(max-width:560px){.aks-b{padding:0 10px}.aks-b .lb{display:none}.aks-b.pri .lb{display:inline}}
    .aks-count{min-width:20px;height:20px;padding:0 6px;border-radius:99px;background:var(--accent,#E5783A);color:#fff;
      font-size:.66rem;font-weight:700;display:inline-flex;align-items:center;justify-content:center}

    /* editable affordances */
    body.aks-on [data-aks="t"]{cursor:text;border-radius:4px;transition:box-shadow .15s,background .15s}
    body.aks-on [data-aks="t"]:hover{box-shadow:0 0 0 2px color-mix(in srgb,var(--accent,#E5783A) 45%,transparent)}
    body.aks-on [data-aks="i"]{cursor:pointer;position:relative;transition:box-shadow .15s}
    body.aks-on [data-aks="i"]:hover{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent,#E5783A) 60%,transparent)}
    body.aks-on [contenteditable="true"]{outline:2px solid var(--accent,#E5783A);outline-offset:3px;background:color-mix(in srgb,var(--accent,#E5783A) 9%,transparent)}
    body.aks-on a{cursor:default}
    body.aks-on .aks-changed{box-shadow:0 0 0 2px color-mix(in srgb,#36d399 55%,transparent)}
    .aks-hidden-mark{outline:2px dashed color-mix(in srgb,#ef4444 60%,transparent)!important;outline-offset:-2px;opacity:.4!important}

    /* floating element toolbar */
    .aks-tb{position:fixed;z-index:2147483001;display:flex;align-items:center;gap:4px;padding:5px;border-radius:12px;
      background:var(--surface,#1D1C1A);border:1px solid var(--line,#373634);box-shadow:0 10px 34px rgba(0,0,0,.4)}
    @media(max-width:860px){.aks-tb{left:8px!important;right:8px;top:calc(8px + env(safe-area-inset-top))!important;justify-content:center}}
    .aks-tb .aks-b{height:40px;font-size:.8rem}

    /* panel */
    .aks-scrim{position:fixed;inset:0;z-index:2147483200;background:rgba(5,6,10,.6);backdrop-filter:blur(4px);animation:aksf .2s}
    @keyframes aksf{from{opacity:0}to{opacity:1}}
    .aks-panel{position:fixed;z-index:2147483201;top:0;right:0;bottom:0;width:min(420px,100%);display:flex;flex-direction:column;
      background:var(--surface,#1D1C1A);border-left:1px solid var(--line,#373634);box-shadow:-20px 0 60px rgba(0,0,0,.4);animation:aksin .26s cubic-bezier(.2,.8,.2,1)}
    @keyframes aksin{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
    @media(max-width:860px){.aks-panel{top:auto;left:0;height:min(88vh,860px);width:auto;border-left:0;border-top:1px solid var(--line,#373634);
      border-radius:20px 20px 0 0;animation:aksup .26s cubic-bezier(.2,.8,.2,1)}}
    @keyframes aksup{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
    .aks-ph{display:flex;align-items:center;gap:10px;padding:14px 14px 10px;border-bottom:1px solid var(--line,#373634)}
    .aks-ph h3{margin:0;flex:1;font-family:'Space Grotesk',sans-serif;font-size:1.02rem;color:var(--text,#fff);font-weight:600}
    .aks-tabs{display:flex;gap:6px;overflow-x:auto;padding:10px 14px;border-bottom:1px solid var(--line,#373634);scrollbar-width:none}
    .aks-tabs::-webkit-scrollbar{display:none}
    .aks-tab{flex:none;height:36px;padding:0 13px;border-radius:99px;border:1px solid var(--line,#373634);background:transparent;
      color:var(--muted,#C9C8C6);font-size:.78rem;font-weight:600;cursor:pointer;transition:.18s;-webkit-tap-highlight-color:transparent}
    .aks-tab.on{background:linear-gradient(135deg,var(--accent,#E5783A),var(--accent-2,#C2410C));border-color:transparent;color:#fff}
    .aks-body{flex:1;overflow:auto;padding:14px;-webkit-overflow-scrolling:touch}
    .aks-sec{font-size:.58rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-2,#C2410C);margin:18px 0 8px}
    .aks-sec:first-child{margin-top:0}
    .aks-row{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line,#373634);border-radius:12px;margin-bottom:8px;background:color-mix(in srgb,var(--text,#fff) 3%,transparent)}
    .aks-row .gr{flex:1;min-width:0}
    .aks-row .t{font-size:.86rem;color:var(--text,#fff);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .aks-row .s{font-size:.72rem;color:var(--muted,#C9C8C6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
    .aks-ic{width:40px;height:40px;flex:none;border-radius:10px;border:1px solid var(--line,#373634);background:transparent;
      color:var(--muted,#C9C8C6);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.18s;-webkit-tap-highlight-color:transparent}
    .aks-ic:hover{color:var(--text,#fff);border-color:var(--accent,#E5783A)}
    .aks-ic svg{width:17px;height:17px}
    .aks-ic.off{color:#ef4444}
    .aks-f{display:block;margin-bottom:12px}
    .aks-f label{display:block;font-size:.72rem;color:var(--muted,#C9C8C6);margin-bottom:6px;font-weight:600}
    .aks-f input[type=text],.aks-f input[type=url],.aks-f textarea{width:100%;min-height:46px;padding:12px;border-radius:11px;
      border:1px solid var(--line,#373634);background:var(--bg,#1C1A14);color:var(--text,#fff);font-size:.9rem;font-family:inherit}
    .aks-f textarea{min-height:88px;resize:vertical}
    .aks-f input:focus,.aks-f textarea:focus{outline:none;border-color:var(--accent,#E5783A)}
    .aks-sw{display:flex;align-items:center;gap:10px;margin-bottom:8px}
    .aks-sw input[type=color]{width:46px;height:40px;padding:0;border:1px solid var(--line,#373634);border-radius:10px;background:none;cursor:pointer}
    .aks-sw .nm{flex:1;font-size:.82rem;color:var(--text,#fff)}
    .aks-sw .hx{font-size:.72rem;color:var(--muted,#C9C8C6);font-family:ui-monospace,monospace}
    .aks-note{font-size:.76rem;line-height:1.55;color:var(--muted,#C9C8C6);margin:10px 0}
    .aks-note b{color:var(--text,#fff)}
    .aks-acts{display:flex;gap:8px;padding:12px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line,#373634)}
    .aks-acts .aks-b{flex:1;border:1px solid var(--line,#373634)}
    .aks-acts .aks-b.pri{border-color:transparent}
    .aks-b.dgr{background:linear-gradient(135deg,#ef4444,#f87171);color:#fff}

    /* modal */
    .aks-mov{position:fixed;inset:0;z-index:2147483300;background:rgba(5,6,10,.72);backdrop-filter:blur(7px);
      display:flex;align-items:center;justify-content:center;padding:18px;animation:aksf .18s}
    .aks-m{width:min(460px,100%);max-height:88vh;overflow:auto;padding:20px;border-radius:18px;background:var(--surface,#1D1C1A);
      border:1px solid var(--line,#373634);box-shadow:0 30px 80px rgba(0,0,0,.5)}
    .aks-m h3{margin:0 0 6px;font-family:'Space Grotesk',sans-serif;font-size:1.1rem;color:var(--text,#fff)}
    .aks-m .sub{font-size:.83rem;color:var(--muted,#C9C8C6);line-height:1.55;margin-bottom:14px}
    .aks-m input[type=password],.aks-m input[type=text]{width:100%;height:48px;padding:0 13px;border-radius:11px;border:1px solid var(--line,#373634);
      background:var(--bg,#1C1A14);color:var(--text,#fff);font-size:.95rem}
    .aks-m .err{color:#f87171;font-size:.78rem;margin-top:8px;min-height:1em}
    .aks-prev{width:100%;max-height:200px;object-fit:contain;border-radius:12px;border:1px solid var(--line,#373634);background:var(--bg,#1C1A14);margin-bottom:12px}
    .aks-opt{display:flex;gap:10px;align-items:center;width:100%;padding:13px;border-radius:12px;border:1px solid var(--line,#373634);
      background:transparent;color:var(--text,#fff);cursor:pointer;margin-bottom:8px;text-align:left;transition:.18s}
    .aks-opt:hover{border-color:var(--accent,#E5783A)}
    .aks-opt .big{font-size:.9rem;font-weight:600}
    .aks-opt .sm{font-size:.74rem;color:var(--muted,#C9C8C6);margin-top:2px}
    .aks-opt .tag{margin-left:auto;font-size:.72rem;font-family:ui-monospace,monospace;color:var(--accent,#E5783A)}
    .aks-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(78px + env(safe-area-inset-bottom));z-index:2147483400;
      padding:11px 18px;border-radius:99px;background:var(--surface,#1D1C1A);border:1px solid var(--line,#373634);
      color:var(--text,#fff);font-size:.82rem;box-shadow:0 12px 40px rgba(0,0,0,.4);animation:aksf .18s}
    .aks-diff{border:1px solid var(--line,#373634);border-radius:12px;overflow:hidden;margin-bottom:10px}
    .aks-diff .hd{padding:9px 12px;background:color-mix(in srgb,var(--text,#fff) 5%,transparent);font-size:.72rem;font-weight:700;color:var(--text,#fff);letter-spacing:.04em}
    .aks-diff .it{padding:9px 12px;border-top:1px solid var(--line,#373634);font-size:.76rem;color:var(--muted,#C9C8C6);line-height:1.5}
    .aks-diff .it b{color:var(--text,#fff);font-weight:600}
    body.aks-preview .aks-bar{opacity:.25}
    body.aks-preview .aks-bar:hover{opacity:1}
    @media print{.aks-ui{display:none!important}}
    ` }));
  }

  /* ----------------------------------------------------------------- icons */
  var I = {
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    panel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeoff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-6.4L3 9"/></svg>',
    up2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v13"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>'
  };

  /* ---------------------------------------------------- modal / toast utils */
  function toast(msg) {
    var t = h("div", { class: "aks-ui aks-toast" }, [msg]);
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 320); }, 2000);
  }
  function sheet(build) {
    var ov = h("div", { class: "aks-ui aks-mov", onclick: function (e) { if (e.target === ov) close(); } });
    var box = h("div", { class: "aks-m" });
    ov.appendChild(box); document.body.appendChild(ov);
    function close() { ov.remove(); }
    build(box, close);
    return close;
  }
  function confirmBox(o) {
    return new Promise(function (res) {
      sheet(function (box, close) {
        box.appendChild(h("h3", {}, [o.title]));
        if (o.sub) box.appendChild(h("div", { class: "sub" }, [o.sub]));
        if (o.node) box.appendChild(o.node);
        box.appendChild(h("div", { class: "aks-acts", style: "border:0;padding:6px 0 0" }, [
          h("button", { class: "aks-b", onclick: function () { close(); res(false); } }, [o.cancel || "Cancel"]),
          h("button", { class: "aks-b " + (o.danger ? "dgr" : "pri"), onclick: function () { close(); res(true); } }, [o.ok || "Confirm"])
        ]));
      });
    });
  }
  function askPassword(reason, title) {
    return new Promise(function (res) {
      sheet(function (box, close) {
        var inp = h("input", { type: "password", placeholder: "Admin password", autocomplete: "current-password" });
        var err = h("div", { class: "err" });
        function go() {
          var v = inp.value.trim();
          if (!v) { err.textContent = "Enter your password."; return; }
          sha256(v).then(function (hash) {
            if (hash === storedPW()) { close(); res(true); }
            else { err.textContent = "Incorrect password."; inp.select(); }
          });
        }
        box.appendChild(h("h3", {}, [title || "Confirm it's you"]));
        box.appendChild(h("div", { class: "sub" }, [reason || "Re-enter your admin password to publish."]));
        box.appendChild(inp); box.appendChild(err);
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
        box.appendChild(h("div", { class: "aks-acts", style: "border:0;padding:8px 0 0" }, [
          h("button", { class: "aks-b", onclick: function () { close(); res(false); } }, ["Cancel"]),
          h("button", { class: "aks-b pri", onclick: go }, ["Continue"])
        ]));
        setTimeout(function () { inp.focus(); }, 60);
      });
    });
  }

  /* ------------------------------------------- pristine source (for Reset) */
  function loadSource() {
    if (SRC) return Promise.resolve(SRC);
    return fetch(location.pathname, { cache: "no-store" }).then(function (r) { return r.text(); })
      .then(function (t) { SRC = new DOMParser().parseFromString(t, "text/html"); return SRC; })
      .catch(function () { return null; });
  }
  function originalOf(key, what) {
    if (!SRC) return null;
    var segs, node = SRC.body;
    if (key.charAt(0) === "#") node = SRC.querySelector('[data-ak-id="' + key.slice(1) + '"]');
    else {
      segs = key.split(">");
      for (var i = 0; i < segs.length && node; i++) {
        var m = /^([a-z0-9-]+)(?::(\d+))?$/i.exec(segs[i]); if (!m) { node = null; break; }
        var tag = m[1].toUpperCase(), want = m[2] ? +m[2] : 1, c = 0, f = null, ch = node.firstElementChild;
        while (ch) { if (ch.tagName === tag && !S.skip(ch)) { c++; if (c === want) { f = ch; break; } } ch = ch.nextElementSibling; }
        node = f;
      }
    }
    if (!node) return null;
    if (what === "img") return node.getAttribute("src") || "";
    if (what === "href") return node.getAttribute("href") || "";
    return node.textContent;
  }

  /* ------------------------------------------------------ editable marking */
  var SKIPSEL = "input,textarea,select,canvas,svg,code,pre,[data-ak-noedit],[data-count],#streamText,#caret";
  function inChrome(el) {
    var n = el;
    while (n && n !== document.body) {
      var c = (n.getAttribute && n.getAttribute("class")) || "";
      if (/(^|\s)(ak-|aks-|pfx-|cert-modal)/.test(c)) return true;
      if (n.hasAttribute && (n.hasAttribute("data-ak-noedit") || n.hasAttribute("data-ak-transient"))) return true;
      n = n.parentElement;
    }
    return false;
  }
  function isTextEl(el) {
    if (el.firstElementChild) return false;
    var t = (el.textContent || "").trim();
    return t.length > 0 && t.length < 4000;
  }
  function mark() {
    var all = document.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,a,button,span,small,strong,em,b,i,figcaption,blockquote,label,td,th,dt,dd,summary,div,time,address");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.matches(SKIPSEL) || inChrome(el)) continue;
      if (!isTextEl(el)) continue;
      el.setAttribute("data-aks", "t");
    }
    var imgs = document.body.querySelectorAll("img");
    for (var j = 0; j < imgs.length; j++) {
      if (inChrome(imgs[j]) || imgs[j].matches("[data-ak-noedit]")) continue;
      imgs[j].setAttribute("data-aks", "i");
    }
    flagChanged();
  }
  function unmark() {
    document.querySelectorAll("[data-aks]").forEach(function (e) { e.removeAttribute("data-aks"); e.classList.remove("aks-changed"); });
  }
  function flagChanged() {
    document.querySelectorAll(".aks-changed").forEach(function (e) { e.classList.remove("aks-changed"); });
    var d = DATA[PAGE] || {};
    ["text", "html", "img", "href"].forEach(function (b) {
      for (var k in (d[b] || {})) {
        if (isPublished(PAGE, b, k, d[b][k])) continue;
        var el = S.resolve(k); if (el) el.classList.add("aks-changed");
      }
    });
  }

  /* ----------------------------------------------------------- inline edit */
  var tb = null;
  function killToolbar() { if (tb) { tb.remove(); tb = null; } }
  function place(el) {
    if (!tb) return;
    if (window.innerWidth <= 860) return;                 // CSS pins it top on mobile
    var r = el.getBoundingClientRect(), tw = tb.offsetWidth || 220;
    tb.style.top = Math.max(8, r.top - 52) + "px";
    tb.style.left = Math.min(window.innerWidth - tw - 10, Math.max(8, r.left)) + "px";
  }
  function selectEl(el) {
    deselect();
    sel = el;
    var kind = el.getAttribute("data-aks");
    var key = S.keyOf(el);
    tb = h("div", { class: "aks-ui aks-tb" });
    if (kind === "t") {
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");
      el.focus();
      try { document.execCommand("selectAll", false, null); document.getSelection().collapseToEnd(); } catch (e) {}
      tb.appendChild(btn(I.ok, "Done", function () { commitText(); }, "pri"));
      if (el.tagName === "A") tb.appendChild(btn(I.link, "Link", function () { editLink(el, key); }));
    } else {
      tb.appendChild(btn(I.img, "Replace photo", function () { pickImage(el, key); }, "pri"));
    }
    tb.appendChild(btn(I.reset, "Reset", function () { resetEl(el, key, kind); }));
    tb.appendChild(btn(I.x, "", function () { deselect(); }));
    document.body.appendChild(tb);
    place(el);
    if (kind === "t") { el.__aksBefore = el.textContent; }
  }
  function btn(icon, label, fn, cls) {
    return h("button", { class: "aks-b " + (cls || ""), type: "button", title: label, onclick: function (e) { e.preventDefault(); e.stopPropagation(); fn(); } },
      [h("span", { html: icon }), label ? h("span", { class: "lb" }, [label]) : null]);
  }
  function commitText() {
    if (!sel || sel.getAttribute("contenteditable") !== "true") { deselect(); return; }
    var el = sel, key = S.keyOf(el), v = el.textContent;
    el.removeAttribute("contenteditable");
    if (v !== el.__aksBefore) {
      setOv("text", key, v);
      el.classList.add("aks-changed");
      toast("Saved");
      syncBar();
    }
    killToolbar(); sel = null;
  }
  function deselect() {
    if (sel && sel.getAttribute("contenteditable") === "true") { commitText(); return; }
    killToolbar(); sel = null;
  }
  function resetEl(el, key, kind) {
    loadSource().then(function () {
      var b = kind === "i" ? "img" : "text";
      var o = originalOf(key, b);
      setOv(b, key, null);
      if (o != null) { if (kind === "i") el.src = o; else el.textContent = o; }
      if (kind === "t" && getOv("href", key) !== undefined) { var oh = originalOf(key, "href"); setOv("href", key, null); if (oh != null) el.setAttribute("href", oh); }
      el.classList.remove("aks-changed");
      deselect(); syncBar(); toast("Reset to original");
    });
  }

  /* ----------------------------------------------------------- link editor */
  function editLink(el, key) {
    var cur = el.getAttribute("href") || "";
    sheet(function (box, close) {
      var inp = h("input", { type: "text", value: cur, placeholder: "https://… or mailto:… or page.html" });
      box.appendChild(h("h3", {}, ["Link destination"]));
      box.appendChild(h("div", { class: "sub" }, ['"' + short(el.textContent, 40) + '"']));
      box.appendChild(inp);
      box.appendChild(h("div", { class: "aks-acts", style: "border:0;padding:10px 0 0" }, [
        h("button", { class: "aks-b", onclick: close }, ["Cancel"]),
        h("button", { class: "aks-b pri", onclick: function () {
          var v = inp.value.trim();
          setOv("href", key, v || null);
          el.setAttribute("href", v);
          el.classList.add("aks-changed");
          close(); deselect(); syncBar(); toast("Link updated");
        } }, ["Save link"])
      ]));
      setTimeout(function () { inp.focus(); }, 60);
    });
  }

  /* -------------------------------------------------------- image pipeline */
  function pickFile(accept) {
    return new Promise(function (res) {
      var inp = h("input", { type: "file", accept: accept, style: "position:fixed;left:-9999px" });
      document.body.appendChild(inp);
      inp.addEventListener("change", function () { var f = inp.files && inp.files[0]; inp.remove(); res(f || null); });
      inp.click();
    });
  }
  function readDataURL(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(f); }); }
  function compress(dataUrl, maxPx, q) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        var w = im.naturalWidth, ht = im.naturalHeight, s = Math.min(1, maxPx / Math.max(w, ht));
        var cv = document.createElement("canvas");
        cv.width = Math.round(w * s); cv.height = Math.round(ht * s);
        var cx = cv.getContext("2d"); cx.imageSmoothingQuality = "high";
        cx.drawImage(im, 0, 0, cv.width, cv.height);
        var out;
        try { out = cv.toDataURL("image/webp", q); if (out.indexOf("image/webp") < 0) throw 0; }
        catch (e) { out = cv.toDataURL("image/jpeg", q); }
        res({ url: out, w: cv.width, h: cv.height });
      };
      im.onerror = function () { res(null); };
      im.src = dataUrl;
    });
  }
  function pickImage(el, key) {
    pickFile("image/*").then(function (f) {
      if (!f) return;
      readDataURL(f).then(function (orig) {
        compress(orig, 1600, 0.82).then(function (small) {
          sheet(function (box, close) {
            box.appendChild(h("h3", {}, ["Use this photo?"]));
            box.appendChild(h("img", { class: "aks-prev", src: (small && small.url) || orig, alt: "" }));
            box.appendChild(h("div", { class: "sub" }, [f.name + " · " + kb(f.size)]));
            if (small) box.appendChild(h("button", { class: "aks-opt", onclick: function () { apply(small.url); close(); } }, [
              h("div", {}, [h("div", { class: "big" }, ["Optimise (recommended)"]), h("div", { class: "sm" }, [small.w + "×" + small.h + " · fast to load"])]),
              h("span", { class: "tag" }, [kb(dataBytes(small.url))])
            ]));
            box.appendChild(h("button", { class: "aks-opt", onclick: function () { apply(orig); close(); } }, [
              h("div", {}, [h("div", { class: "big" }, ["Keep original"]), h("div", { class: "sm" }, ["Full quality, larger download"])]),
              h("span", { class: "tag" }, [kb(f.size)])
            ]));
            box.appendChild(h("div", { class: "aks-acts", style: "border:0;padding:4px 0 0" }, [
              h("button", { class: "aks-b", onclick: close }, ["Cancel"])
            ]));
          });
          function apply(url) {
            setOv("img", key, url);
            if (el.tagName === "IMG") { el.removeAttribute("srcset"); el.src = url; } else el.style.backgroundImage = 'url("' + url + '")';
            el.classList.add("aks-changed");
            deselect(); syncBar(); toast("Photo replaced");
          }
        });
      });
    });
  }

  /* --------------------------------------------------------------- gestures */
  function onTap(e) {
    if (!ON) return;
    var t = e.target;
    if (t.closest && t.closest(".aks-ui")) return;
    var el = t.closest ? t.closest("[data-aks]") : null;
    if (!el) { if (sel) deselect(); return; }
    if (el === sel) return;
    e.preventDefault(); e.stopPropagation();
    selectEl(el);
  }
  document.addEventListener("click", onTap, true);
  document.addEventListener("keydown", function (e) {
    if (!ON) return;
    if (e.key === "Escape") { if (sel && sel.getAttribute("contenteditable") === "true") { sel.textContent = sel.__aksBefore; sel.removeAttribute("contenteditable"); } killToolbar(); sel = null; }
    if (e.key === "Enter" && sel && sel.getAttribute("contenteditable") === "true" && !e.shiftKey) { e.preventDefault(); commitText(); }
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !sel) { e.preventDefault(); undo(); }
  });
  window.addEventListener("scroll", function () { if (sel && tb) place(sel); }, { passive: true });
  window.addEventListener("resize", function () { if (sel && tb) place(sel); });

  function undo() {
    var u = UNDO.pop();
    if (!u) { toast("Nothing to undo"); return; }
    var b = bucket(u.bucket, u.page);
    if (u.prev === undefined) delete b[u.key]; else b[u.key] = u.prev;
    dirty = true; save();
    if (u.page === PAGE) {
      var el = S.resolve(u.key);
      if (el) {
        if (u.bucket === "text") el.textContent = u.prev !== undefined ? u.prev : (originalOf(u.key, "text") || el.textContent);
        if (u.bucket === "img") { var v = u.prev !== undefined ? u.prev : originalOf(u.key, "img"); if (v) el.src = v; }
        if (u.bucket === "href") { var vh = u.prev !== undefined ? u.prev : originalOf(u.key, "href"); if (vh != null) el.setAttribute("href", vh); }
        if (u.bucket === "hide") { if (!u.prev) el.style.removeProperty("display"); }
      }
      S.applyAll(); flagChanged();
    }
    syncBar(); toast("Undone");
  }

  /* ------------------------------------------------------------------- bar */
  var bar, editBtn, undoBtn, cntEl;
  function changeCount() {
    var n = 0;
    diffList().forEach(function (g) { n += g.items.length; });
    return n;
  }
  function markDirty() { syncBar(); }
  function syncBar() {
    if (undoBtn) undoBtn.disabled = !UNDO.length;
    if (editBtn) editBtn.classList.toggle("on", ON);
  }
  function buildBar() {
    editBtn = btn(I.pen, "Edit", toggleEdit);
    undoBtn = btn(I.undo, "", undo);
    cntEl = null;
    bar = h("div", { class: "aks-ui aks-bar" }, [
      editBtn,
      undoBtn,
      btn(I.panel, "Settings", openPanel),
      h("button", { class: "aks-b pri", onclick: function () { openPanel("draft"); } }, [h("span", { html: I.up2 }), h("span", { class: "lb" }, ["Publish"])])
    ]);
    document.body.appendChild(bar);
    syncBar();
  }
  function toggleEdit() {
    ON = !ON;
    document.body.classList.toggle("aks-on", ON);
    if (ON) { mark(); loadSource(); toast("Edit mode — tap any text or photo"); }
    else { deselect(); unmark(); toast("Preview — this is what visitors see"); }
    syncBar();
  }

  /* ----------------------------------------------------------------- panel */
  var panelEl = null, curTab = "draft";
  function openPanel(tab) {
    closePanel();
    curTab = tab || curTab;
    var scrim = h("div", { class: "aks-ui aks-scrim", onclick: closePanel });
    var body = h("div", { class: "aks-body" });
    var tabs = h("div", { class: "aks-tabs" });
    [["draft", "Draft"], ["projects", "Projects"], ["sections", "Sections"], ["theme", "Theme"], ["seo", "SEO"], ["links", "Links"], ["files", "Files"], ["versions", "Versions"], ["publish", "Publish"]]
      .forEach(function (t) {
        tabs.appendChild(h("button", { class: "aks-tab" + (t[0] === curTab ? " on" : ""), onclick: function () { curTab = t[0]; openPanel(curTab); } }, [t[1]]));
      });
    panelEl = h("div", { class: "aks-ui aks-panel", role: "dialog" }, [
      h("div", { class: "aks-ph" }, [
        h("h3", {}, [PAGELABEL[PAGE] || PAGE]),
        h("button", { class: "aks-ic", onclick: closePanel, "aria-label": "Close", html: I.x })
      ]),
      tabs, body
    ]);
    document.body.appendChild(scrim); document.body.appendChild(panelEl);
    panelEl.__scrim = scrim;
    ({ draft: tabDraft, projects: tabProjects, sections: tabSections, theme: tabTheme, seo: tabSEO, links: tabLinks, files: tabFiles, versions: tabVersions, publish: tabPublish }[curTab])(body);
  }
  function closePanel() { if (panelEl) { if (panelEl.__scrim) panelEl.__scrim.remove(); panelEl.remove(); panelEl = null; } }

  function sectionEls() {
    var list = [];
    ["body > section", "body > header", "body > footer", "main > section", "main > header", "main > footer", "body > main > div[id]"].forEach(function (sq) {
      document.querySelectorAll(sq).forEach(function (el) { if (!inChrome(el) && list.indexOf(el) < 0) list.push(el); });
    });
    return list;
  }
  function labelOf(el) {
    var hd = el.querySelector("h1,h2,h3");
    return short((hd && hd.textContent) || el.id || el.tagName.toLowerCase(), 34);
  }
  function tabSections(box) {
    var els = sectionEls();
    if (!els.length) { box.appendChild(h("div", { class: "aks-note" }, ["No top-level sections found on this page."])); return; }
    box.appendChild(h("div", { class: "aks-note" }, ["Hide a section from visitors, or move it up and down. Changes apply to this page only."]));
    els.forEach(function (el, i) {
      var key = S.keyOf(el), hidden = !!getOv("hide", key);
      var row = h("div", { class: "aks-row" }, [
        h("div", { class: "gr" }, [h("div", { class: "t" }, [labelOf(el)]), h("div", { class: "s" }, [el.tagName.toLowerCase() + (el.id ? " #" + el.id : "")])]),
        h("button", { class: "aks-ic" + (hidden ? " off" : ""), title: hidden ? "Show" : "Hide", html: hidden ? I.eyeoff : I.eye, onclick: function () { toggleHide(el, key); openPanel("sections"); } }),
        h("button", { class: "aks-ic", title: "Move up", html: I.up, onclick: function () { move(el, -1); openPanel("sections"); } }),
        h("button", { class: "aks-ic", title: "Move down", html: I.down, onclick: function () { move(el, 1); openPanel("sections"); } })
      ]);
      row.addEventListener("mouseenter", function () { el.style.outline = "2px solid var(--accent,#E5783A)"; el.style.outlineOffset = "-2px"; });
      row.addEventListener("mouseleave", function () { el.style.outline = ""; });
      box.appendChild(row);
    });
  }
  function toggleHide(el, key) {
    var hidden = !!getOv("hide", key);
    setOv("hide", key, hidden ? null : true);
    if (hidden) { el.style.removeProperty("display"); el.classList.remove("aks-hidden-mark"); }
    else { el.classList.add("aks-hidden-mark"); }
    syncBar();
  }
  function move(el, dir) {
    var box = el.parentElement, ck = box === document.body ? "" : S.keyOf(box);
    var kids = S.tagOI(box), secs = sectionEls();
    var i = kids.indexOf(el), j = i + dir;
    while (j >= 0 && j < kids.length && secs.indexOf(kids[j]) < 0) j += dir;   // hop over non-sections
    if (i < 0 || j < 0 || j >= kids.length) return;
    var arr = kids.slice();
    arr.splice(i, 1); arr.splice(j, 0, el);
    arr.forEach(function (c) { box.appendChild(c); });                          // re-append in the new order
    var list = arr.map(function (c) { return +c.getAttribute("data-ak-oi"); });
    var ob = bucket("order"); UNDO.push({ page: PAGE, bucket: "order", key: ck, prev: ob[ck] });
    ob[ck] = list; dirty = true; save(); syncBar();
  }

  var THEME_ALL = false;
  var VARS = [["--bg", "Background"], ["--surface", "Cards / surface"], ["--line", "Borders"], ["--text", "Text"], ["--muted", "Muted text"], ["--accent", "Accent"], ["--accent-2", "Accent 2"]];
  function tabTheme(box) {
    box.appendChild(h("div", { class: "aks-note", html: "Editing the palette of <b>" + (PAGELABEL[PAGE] || PAGE) + "</b>. Flip the site's own light/dark switch to edit the other set." }));
    var allRow = h("div", { class: "aks-row" }, [
      h("div", { class: "gr" }, [h("div", { class: "t" }, ["Apply to every page"]), h("div", { class: "s" }, ["Off — the home page keeps its own darker palette"])]),
      h("button", { class: "aks-ic" + (THEME_ALL ? "" : " off"), html: THEME_ALL ? I.ok : I.x, onclick: function () { THEME_ALL = !THEME_ALL; openPanel("theme"); } })
    ]);
    box.appendChild(allRow);
    ["dark", "light"].forEach(function (mode) {
      box.appendChild(h("div", { class: "aks-sec" }, [mode === "dark" ? "Dark mode" : "Light mode"]));
      VARS.forEach(function (v) {
        var cur = ((pd().vars || {})[mode] || {})[v[0]] || cssVar(v[0], mode);
        var hex = toHex(cur);
        var sw = h("div", { class: "aks-sw" }, [
          h("input", { type: "color", value: hex, oninput: function (e) { setVar(mode, v[0], e.target.value); sw.querySelector(".hx").textContent = e.target.value; } }),
          h("span", { class: "nm" }, [v[1]]),
          h("span", { class: "hx" }, [hex])
        ]);
        box.appendChild(sw);
      });
    });
    box.appendChild(h("button", { class: "aks-b", style: "border:1px solid var(--line);width:100%;margin-top:12px", onclick: function () {
      (THEME_ALL ? PAGES : [PAGE]).forEach(function (p) { if (DATA[p]) delete DATA[p].vars; });
      dirty = true; save(); S.use(DATA); S.applyVars(); openPanel("theme"); toast("Colours reset");
    } }, [h("span", { html: I.reset }), h("span", {}, ["Reset all colours"])]));
  }
  function cssVar(name, mode) {
    var probe = document.createElement("div");
    probe.setAttribute("data-theme", mode); probe.style.display = "none";
    document.body.appendChild(probe);
    var v = getComputedStyle(probe).getPropertyValue(name).trim() || getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    probe.remove();
    return v;
  }
  function toHex(c) {
    c = (c || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(c)) return c;
    if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    var m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) { var p = m[1].split(",").map(function (x) { return parseFloat(x); });
      return "#" + p.slice(0, 3).map(function (x) { return Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, "0"); }).join(""); }
    return "#888888";
  }
  function setVar(mode, name, val) {
    (THEME_ALL ? PAGES : [PAGE]).forEach(function (p) {
      var d = pd(p);
      if (!d.vars) d.vars = {};
      if (!d.vars[mode]) d.vars[mode] = {};
      d.vars[mode][name] = val;
    });
    dirty = true; save(); S.use(DATA, true); S.applyVars(); syncBar();
  }

  function tabSEO(box) {
    box.appendChild(h("div", { class: "aks-note" }, ["Saved to your draft on this device. Google only sees it after you publish."]));
    var m = pd().meta || {};
    var title = m.title || document.title;
    var desc = m.description || (document.head.querySelector('meta[name="description"]') || {}).content || "";
    box.appendChild(h("div", { class: "aks-note", html: "What Google and social apps show for <b>this page</b>." }));
    box.appendChild(field("Page title", title, function (v) { setMeta("title", v); }));
    box.appendChild(field("Description", desc, function (v) { setMeta("description", v); }, true));
    box.appendChild(h("div", { class: "aks-sec" }, ["Social preview image"]));
    var cur = m.image || (document.head.querySelector('meta[property="og:image"]') || {}).content || "";
    box.appendChild(h("img", { class: "aks-prev", src: cur || "", alt: "", onerror: function () { this.style.display = "none"; } }));
    box.appendChild(h("button", { class: "aks-b", style: "border:1px solid var(--line);width:100%", onclick: function () {
      pickFile("image/*").then(function (f) {
        if (!f) return;
        readDataURL(f).then(function (d) { compress(d, 1200, 0.85).then(function (s) { setMeta("image", (s && s.url) || d); openPanel("seo"); toast("Preview image set"); }); });
      });
    } }, [h("span", { html: I.img }), h("span", {}, ["Choose image"])]));
  }
  function setMeta(k, v) {
    var d = pd(); if (!d.meta) d.meta = {};
    UNDO.push({ page: PAGE, bucket: "meta", key: k, prev: d.meta[k] });
    if (v) d.meta[k] = v; else delete d.meta[k];
    dirty = true; save(); S.use(DATA, true); S.applyMeta(); syncBar();
  }
  function field(label, val, onSave, multi) {
    var inp = h(multi ? "textarea" : "input", multi ? {} : { type: "text" });
    inp.value = val || "";
    inp.addEventListener("change", function () { onSave(inp.value.trim()); toast("Saved"); });
    return h("div", { class: "aks-f" }, [h("label", {}, [label]), inp]);
  }

  function tabLinks(box) {
    var links = Array.prototype.filter.call(document.querySelectorAll("a[href]"), function (a) { return !inChrome(a); });
    if (!links.length) { box.appendChild(h("div", { class: "aks-note" }, ["No links on this page."])); return; }
    box.appendChild(h("div", { class: "aks-note" }, ["Every link on this page. Tap one to change where it goes."]));
    links.forEach(function (a) {
      var key = S.keyOf(a);
      box.appendChild(h("div", { class: "aks-row", onclick: function () { editLink(a, key); } }, [
        h("div", { class: "gr" }, [
          h("div", { class: "t" }, [short(a.textContent || a.getAttribute("aria-label") || "(icon link)", 30)]),
          h("div", { class: "s" }, [short(a.getAttribute("href"), 42)])
        ]),
        h("button", { class: "aks-ic", html: I.link })
      ]));
    });
  }

  function tabFiles(box) {
    var pdfs = Array.prototype.filter.call(document.querySelectorAll('a[href$=".pdf"],a[download]'), function (a) { return !inChrome(a); });
    box.appendChild(h("div", { class: "aks-note" }, ["Replace a downloadable file — the new one ships in your publish ZIP."]));
    if (!pdfs.length) box.appendChild(h("div", { class: "aks-note" }, ["No downloadable files link from this page."]));
    pdfs.forEach(function (a) {
      var key = S.keyOf(a);
      box.appendChild(h("div", { class: "aks-row" }, [
        h("div", { class: "gr" }, [h("div", { class: "t" }, [short(a.textContent || "Download", 26)]), h("div", { class: "s" }, [short(a.getAttribute("href"), 40)])]),
        h("button", { class: "aks-ic", title: "Replace file", html: I.up2, onclick: function () {
          pickFile("application/pdf").then(function (f) {
            if (!f) return;
            readDataURL(f).then(function (d) {
              setOv("href", key, d);
              a.setAttribute("href", d);
              openPanel("files"); toast("File replaced · " + kb(f.size));
            });
          });
        } })
      ]));
    });
  }

  function tabProjects(box) {
    box.appendChild(h("div", { class: "aks-note", html: "Every case study across your three category pages — including the ones you just added. A project and its files stay on this device until you publish." }));
    var wrap = h("div", {});
    box.appendChild(wrap);
    cases().then(function (groups) {
      if (!groups || !groups.length) { wrap.appendChild(h("div", { class: "aks-note" }, ["No project pages found."])); return; }
      var pend = caseTotal();
      wrap.appendChild(h("div", { class: "aks-note", html: pend
        ? "<b>" + pend + " project change" + (pend === 1 ? "" : "s") + " waiting.</b> They ship with either download on the Publish tab."
        : "<b>All projects match the live site.</b>" }));
      groups.forEach(function (g) {
        wrap.appendChild(h("div", { class: "aks-sec" }, [g.label + " · " + g.projects.length + " project" + (g.projects.length === 1 ? "" : "s") +
          (g.pending.length ? " · " + g.pending.length + " unpublished" : "")]));
        if (!g.projects.length) wrap.appendChild(h("div", { class: "aks-note" }, ["Nothing here yet."]));
        g.projects.forEach(function (p) {
          wrap.appendChild(h("div", { class: "aks-row" }, [
            h("div", { class: "gr" }, [h("div", { class: "t" }, [short(p.title, 30)]), h("div", { class: "s" }, [projLine(p)])]),
            pill(p.state)
          ]));
        });
        if (g.page !== PAGE) wrap.appendChild(h("button", { class: "aks-b", style: "width:100%;border:1px solid var(--line);margin-top:8px",
          onclick: function () { location.href = g.page + ".html"; } }, ["Open " + g.label + " to add or edit projects"]));
      });
      wrap.appendChild(h("div", { class: "aks-note", style: "margin-top:12px", html: "Projects are added on the category page itself — open it, unlock, then use <b>Add project</b>. This list is read-only." }));
      if (pend) wrap.appendChild(h("button", { class: "aks-b", style: "width:100%;border:1px solid var(--line);margin-top:8px;opacity:.85", onclick: function () {
        confirmBox({ title: "Mark every project as live?", sub: "Use this if these projects are already on the live site — published from another device, or pushed by hand. It only updates this list; nothing on the site changes.", ok: "Mark as live" }).then(function (go) {
          if (!go) return;
          markCasesPublished().then(function () { openPanel("projects"); toast("Projects marked as live"); });
        });
      } }, ["These are already live — clear the list"]));
    });
  }

  function tabVersions(box) {
    box.appendChild(h("div", { class: "aks-note" }, ["The last " + MAXV + " saved states of your edits. Reverting only changes your local working copy — the live site is untouched until you publish."]));
    idbGet("site:versions").then(function (v) {
      v = Array.isArray(v) ? v : [];
      if (!v.length) box.appendChild(h("div", { class: "aks-note" }, ["No versions yet."]));
      v.forEach(function (s, i) {
        box.appendChild(h("div", { class: "aks-row" }, [
          h("div", { class: "gr" }, [h("div", { class: "t" }, [i === 0 ? "Latest" : ago(s.ts)]), h("div", { class: "s" }, [s.label + " · " + ago(s.ts)])]),
          h("button", { class: "aks-ic", title: "Restore", html: I.reset, onclick: function () {
            confirmBox({ title: "Restore this version?", sub: "Your current unsaved state is snapshotted first.", ok: "Restore" }).then(function (go) {
              if (!go) return;
              snapshot("before restore").then(function () {
                DATA = JSON.parse(s.json); save().then(function () { location.reload(); });
              });
            });
          } })
        ]));
      });
      box.appendChild(h("div", { class: "aks-sec" }, ["Danger zone"]));
      box.appendChild(h("button", { class: "aks-b dgr", style: "width:100%", onclick: function () {
        confirmBox({ title: "Discard all local changes?", sub: "Everything you've edited on this device since the last publish is deleted. The live site is unaffected.", ok: "Discard everything", danger: true }).then(function (go) {
          if (!go) return;
          idbSet("site:content", {}).then(function () {
            idbSet("site:published-base", null);
            try { localStorage.removeItem(FLAG); } catch (e) {}
            location.reload();
          });
        });
      } }, [h("span", { html: I.trash }), h("span", {}, ["Discard all my local changes"])]));
    });
  }

  /* ----------------------------------------------------------------- draft */
  function tabDraft(box) { cases().then(function () { drawDraft(box); }); }
  function drawDraft(box) {
    var d = diffList(), total = 0;
    d.forEach(function (g) { total += g.items.length; });
    var cg = (CASES || []).filter(function (g) { return g.pending.length; });
    total += caseTotal();
    box.appendChild(h("div", { class: "aks-note", html: total
      ? "<b>Saved on this device only.</b> Everything you change is kept here as a draft — the live site is untouched until you publish. Look around the site, keep editing, come back when you like it."
      : "<b>Nothing waiting.</b> This device matches the live site." + (PUBAT ? " Last download " + ago(PUBAT) + "." : "") }));
    if (total) {
      d.forEach(function (g) {
        var blk = h("div", { class: "aks-diff" }, [h("div", { class: "hd" }, [(PAGELABEL[g.page] || g.page) + " · " + g.items.length + " change" + (g.items.length === 1 ? "" : "s")])]);
        g.items.slice(0, 12).forEach(function (t) { blk.appendChild(h("div", { class: "it" }, [t])); });
        if (g.items.length > 12) blk.appendChild(h("div", { class: "it" }, ["+ " + (g.items.length - 12) + " more"]));
        box.appendChild(blk);
      });
      cg.forEach(function (g) {
        var blk = h("div", { class: "aks-diff" }, [h("div", { class: "hd" }, [g.label + " projects · " + g.pending.length + " change" + (g.pending.length === 1 ? "" : "s")])]);
        g.pending.slice(0, 12).forEach(function (p) {
          blk.appendChild(h("div", { class: "it" }, [(p.state === "new" ? "New project" : p.state === "removed" ? "Removed" : "Edited") + " · " + short(p.title, 26) +
            (p.pendingFiles ? " · " + p.pendingFiles + " file" + (p.pendingFiles === 1 ? "" : "s") + " (" + kb(p.bytes) + ")" : "")]));
        });
        if (g.pending.length > 12) blk.appendChild(h("div", { class: "it" }, ["+ " + (g.pending.length - 12) + " more"]));
        box.appendChild(blk);
      });
      if (cg.length) box.appendChild(h("button", { class: "aks-b", style: "width:100%;border:1px solid var(--line);margin-top:8px",
        onclick: function () { curTab = "projects"; openPanel("projects"); } }, ["See all projects and their files"]));
      box.appendChild(h("div", { class: "aks-sec" }, ["When you're happy"]));
      box.appendChild(h("button", { class: "aks-b pri", style: "width:100%;height:50px", onclick: function () { curTab = "publish"; openPanel("publish"); } },
        [h("span", { html: I.up2 }), h("span", {}, ["Publish these " + total + " change" + (total === 1 ? "" : "s") + " to live"])]));
      box.appendChild(h("button", { class: "aks-b", style: "width:100%;height:46px;border:1px solid var(--line);margin-top:8px", onclick: function () { closePanel(); if (ON) toggleEdit(); toast("Preview — this is your draft"); } },
        [h("span", {}, ["Keep it local, look around first"])]));
      box.appendChild(h("div", { class: "aks-note", style: "margin-top:10px", html: "Changed your mind about one thing? Tap it on the page and choose <b>Reset to original</b>. To drop everything, use <b>Versions → Discard</b>." }));
    } else {
      box.appendChild(h("div", { class: "aks-sec" }, ["Still want a copy?"]));
      box.appendChild(h("div", { class: "aks-note" }, ["You can download the site any time — as a backup, or to re-deploy it as it stands."]));
      box.appendChild(h("button", { class: "aks-b pri", style: "width:100%;height:50px", onclick: function () { curTab = "publish"; openPanel("publish"); } },
        [h("span", { html: I.up2 }), h("span", {}, ["Go to downloads"])]));
    }
  }

  /* --------------------------------------------------------------- publish */
  function diffList() {
    var out = [];
    allPages().forEach(function (p) {
      var d = (DATA || {})[p]; if (!d) return;
      var items = [];
      BUCKETS.forEach(function (b) {
        var set = d[b[0]] || {};
        for (var k in set) {
          if (isPublished(p, b[0], k, set[k])) continue;
          var v = set[k];
          items.push(b[1] + " · " + (b[0] === "text" || b[0] === "html" ? '"' + short(v, 40) + '"' :
            b[0] === "img" ? "new photo" : b[0] === "href" ? short(String(v), 34) :
            b[0] === "hide" ? "section hidden" : b[0] === "order" ? "section order" : short(String(v), 34)));
        }
      });
      if (d.meta) for (var mk in d.meta) if (!isPublished(p, "meta", mk, d.meta[mk])) items.push("SEO · " + mk);
      if (d.vars) ["dark", "light"].forEach(function (mode) {
        var set = d.vars[mode] || {};
        for (var vk in set) if (!varPublished(p, mode, vk, set[vk])) items.push("Theme · " + vk.replace(/^--/, "") + " (" + mode + ")");
      });
      if (items.length) out.push({ page: p, items: items });
    });
    return out;
  }
  function pendingTotal() { var n = 0; diffList().forEach(function (g) { n += g.items.length; }); return n; }
  /* Published images larger than IMG_MAX_EDGE on their long edge are the main cause of a
     slow-feeling site — surfaced here so nothing oversized gets pushed live unnoticed.
     The fixing lives in admin.js (a category page → Admin → Optimise images). */
  var IMG_MAX_EDGE = 2592, _imgVerdict = null;   /* rebuilt files land on 2560±1 — only flag what is really bigger */
  function checkImageSizes(note) {
    function say(html) { note.innerHTML = html; }
    if (_imgVerdict) return say(_imgVerdict);
    fetch("portfolio-data.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (pub) {
        var seen = {};
        (function walk(v) {
          if (!v) return;
          if (typeof v === "string") { if (/^media\/.+\.(webp|jpe?g|png)$/i.test(v)) seen[v] = 1; return; }
          if (typeof v !== "object") return;
          if (Array.isArray(v)) return v.forEach(walk);
          Object.keys(v).forEach(function (k) { walk(v[k]); });
        })(pub || {});
        var list = Object.keys(seen);
        if (!list.length) { _imgVerdict = "Nothing published to check yet."; return say(_imgVerdict); }
        var i = 0, live = 0, over = 0, checked = 0;
        function step() { live--; checked++; say("Checking image " + checked + " of " + list.length + "\u2026"); next(); }
        function next() {
          if (i >= list.length && !live) {
            _imgVerdict = over
              ? "<b>\u26A0 " + over + " of " + list.length + " published images are oversized.</b> They are what makes a case study slow to open. Fix them first: open a category page \u2192 <b>Admin \u2192 Optimise images</b>, pick a scope, then push the ZIP it hands you."
              : "<b>All " + list.length + " published images are the right size.</b> Nothing to optimise.";
            return say(_imgVerdict);
          }
          while (live < 4 && i < list.length) {
            live++;
            var im = new Image();
            im.onload = function () { if (Math.max(this.naturalWidth, this.naturalHeight) > IMG_MAX_EDGE) over++; step(); };
            im.onerror = step;
            im.src = list[i++];
          }
        }
        next();
      });
  }
  function tabPublish(box) {
    var d = diffList(), total = 0;
    d.forEach(function (g) { total += g.items.length; });
    total += caseTotal();
    box.appendChild(h("div", { class: "aks-note", html: (total ? "<b>" + total + " draft change" + (total === 1 ? "" : "s") + " ready.</b> " : "") + "Publishing is two steps: download your website here, then put it in your repo. Nothing goes live until you push." }));
    if (!total) box.appendChild(h("div", { class: "aks-note", html: PUBAT
      ? "<b>No unpublished changes.</b> Last downloaded " + ago(PUBAT) + " — if you haven't pushed that ZIP to GitHub yet, do that to make it live."
      : "<b>No unpublished changes.</b> Everything on this device matches the live site." }));
    box.appendChild(h("div", { class: "aks-sec" }, ["Image sizes"]));
    var imgNote = h("div", { class: "aks-note" }, ["Checking published images\u2026"]);
    box.appendChild(imgNote);
    checkImageSizes(imgNote);
    box.appendChild(h("div", { class: "aks-sec" }, ["Choose a download"]));
    box.appendChild(h("div", { class: "aks-note", html: "<b>Only my changes</b> — a small ZIP with just the files that differ from the live site. Quickest to drop in and push.<br><br><b>Whole website</b> — every page, script, photo and file, with your edits written into the pages. Use it for a fresh deploy, a backup, or when you want to open it and check the site first." }));
    box.appendChild(h("button", { class: "aks-b pri", style: "width:100%;height:50px", onclick: function () { doExportFull("delta"); } },
      [h("span", { html: I.up2 }), h("span", {}, ["Download only my changes"])]));
    box.appendChild(h("button", { class: "aks-b", style: "width:100%;height:46px;border:1px solid var(--line);margin-top:8px", onclick: function () { doExportFull("full"); } },
      [h("span", {}, ["Download whole updated website"])]));
    box.appendChild(h("button", { class: "aks-b", style: "width:100%;border:1px solid var(--line);margin-top:8px;opacity:.75", onclick: doExport },
      [h("span", {}, ["Content files only (site-content.json)"])]));
    box.appendChild(h("div", { class: "aks-sec" }, ["Then"]));
    box.appendChild(h("div", { class: "aks-note", html: "1 · Unzip it.<br>2 · Replace your repo files with everything inside, keeping the same folder layout.<br>3 · Push to GitHub — Vercel redeploys in about a minute.<br><br>The unzipped folder is a working copy of the site: open <b>index.html</b> to check it before you push." }));
  }

  /* ------- dependency-free ZIP (STORE) ------- */
  var _crc = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = _crc[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) {
    var enc = new TextEncoder();
    function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.bytes, crc = crc32(data);
      var lf = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)));
      parts.push(lf, name, data);
      central.push(new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset))), name);
      offset += lf.length + name.length + data.length;
    });
    var flat = [];
    central.forEach(function (c) { flat.push(c); });
    var cs = 0; flat.forEach(function (c) { cs += c.length; });
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cs), u32(offset), u16(0)));
    return new Blob(parts.concat(flat, [end]), { type: "application/zip" });
  }
  function dataToBytes(d) {
    var parts = d.split(","), meta = parts[0] || "", bin = atob(parts[1] || "");
    var a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return { mime: (meta.split(";")[0] || "").replace("data:", ""), bytes: a };
  }
  function extFor(mime) {
    return ({ "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/svg+xml": "svg", "application/pdf": "pdf", "video/mp4": "mp4" })[mime] || "bin";
  }
  function hashKey(s) { var x = 0; for (var i = 0; i < s.length; i++) { x = (x * 31 + s.charCodeAt(i)) >>> 0; } return x.toString(36); }

  /* uploaded data: URLs become real files, and the JSON points at them */
  function materialise(out) {
    var files = [], seen = {};
    PAGES.forEach(function (p) {
      var d = out[p]; if (!d) return;
      ["img", "href"].forEach(function (b) {
        var set = d[b] || {};
        for (var k in set) {
          var v = set[k];
          if (typeof v !== "string" || v.indexOf("data:") !== 0) continue;
          if (seen[v]) { set[k] = seen[v]; continue; }
          var r = dataToBytes(v);
          var name = "media/site/" + p + "-" + hashKey(k + v.slice(-24)) + "." + extFor(r.mime);
          files.push({ name: name, bytes: r.bytes });
          seen[v] = name; set[k] = name;
        }
      });
      if (d.meta && d.meta.image && d.meta.image.indexOf("data:") === 0) {
        var rr = dataToBytes(d.meta.image);
        var nm = seen[d.meta.image] || ("media/site/og-" + p + "." + extFor(rr.mime));
        if (!seen[d.meta.image]) { files.push({ name: nm, bytes: rr.bytes }); seen[d.meta.image] = nm; }
        d.meta.image = nm;
      }
    });
    return files;
  }
  function download(blob, name) {
    var a = h("a", { href: URL.createObjectURL(blob), download: name });
    document.body.appendChild(a); a.click(); a.remove();
  }
  /* the whole-website packager is shared with admin.js — fetched on demand */
  function ensurePkg() {
    if (window.AK_PACKAGE) return Promise.resolve(window.AK_PACKAGE);
    return new Promise(function (res, rej) {
      var id = "ak-package-js", ex = document.getElementById(id);
      if (!ex) {
        ex = h("script", { id: id, src: "site-package.js?v=1" });
        document.body.appendChild(ex);
      }
      var tries = 0;
      (function poll() {
        if (window.AK_PACKAGE) return res(window.AK_PACKAGE);
        if (++tries > 120) return rej(new Error("packager unavailable"));
        setTimeout(poll, 50);
      })();
    });
  }

  function doExportFull(mode) {
    askPassword("Re-enter your admin password to write the publish ZIP.").then(function (ok) {
      if (!ok) return;
      if (location.protocol === "file:") { toast("Open the site over http:// to export"); return doExport(); }
      snapshot("publish");
      closePanel();
      ensurePkg().then(function (pkg) {
        return pkg.full({ mode: mode === "delta" ? "delta" : "full", siteContent: JSON.parse(JSON.stringify(DATA)) });
      }).then(function (r) {
        if (r.empty) {
          markPublished();
          sheet(function (box, close) {
            box.appendChild(h("h3", {}, ["Nothing has changed"]));
            box.appendChild(h("div", { class: "sub" }, ["This device already matches the live site, so a change pack would be empty."]));
            box.appendChild(h("button", { class: "aks-b pri", style: "width:100%;height:48px;margin-top:12px", onclick: function () { close(); doExportFull("full"); } },
              [h("span", { html: I.up2 }), h("span", {}, ["Download the whole website instead"])]));
            box.appendChild(h("div", { class: "aks-acts", style: "border:0;padding:10px 0 0" }, [h("button", { class: "aks-b", style: "border:1px solid var(--line)", onclick: close }, ["Close"])]));
          });
          return;
        }
        markPublished();
        var isDelta = r.mode === "delta";
        sheet(function (box, close) {
          box.appendChild(h("h3", {}, [isDelta ? "Your changes are downloaded \u2713" : "Your updated website is downloaded \u2713"]));
          box.appendChild(h("div", { class: "sub" }, [r.name + " \u00b7 " + r.sizeLabel + " \u00b7 " + r.count + " file" + (r.count === 1 ? "" : "s")]));
          if (isDelta && r.changed && r.changed.length) {
            var blk = h("div", { class: "aks-diff" }, [h("div", { class: "hd" }, ["Files in this ZIP"])]);
            r.changed.slice(0, 14).forEach(function (n) { blk.appendChild(h("div", { class: "it" }, [n])); });
            if (r.changed.length > 14) blk.appendChild(h("div", { class: "it" }, ["+ " + (r.changed.length - 14) + " more"]));
            box.appendChild(blk);
          }
          box.appendChild(h("div", { class: "aks-note", html: isDelta
            ? "1 \u00b7 Unzip it.<br>2 \u00b7 Open <b>Ajaykatta_Website / GitRepo</b> and copy these files into your repo, same folder layout, replacing what's there.<br>3 \u00b7 Push to GitHub \u2014 Vercel redeploys automatically."
            : "1 \u00b7 Unzip it.<br>2 \u00b7 Copy everything inside <b>Ajaykatta_Website / GitRepo</b> into your repo, replacing the old files.<br>3 \u00b7 Push to GitHub \u2014 Vercel redeploys automatically.<br><br>Want to check it first? Open <b>GitRepo/index.html</b>." }));
          box.appendChild(h("div", { class: "aks-acts", style: "border:0;padding:6px 0 0" }, [h("button", { class: "aks-b pri", onclick: close }, ["Done"])]));
        });
      })["catch"](function () {
        toast("Couldn't package the site \u2014 writing the content files instead");
        doExport();
      });
    });
  }

  function doExport() {
    askPassword("Re-enter your admin password to write the publish ZIP.").then(function (ok) {
      if (!ok) return;
      snapshot("publish");
      var out = JSON.parse(JSON.stringify(DATA));
      var files = materialise(out);
      var enc = new TextEncoder();
      files.unshift({ name: "site-content.json", bytes: enc.encode(JSON.stringify(out, null, 2)) });
      files = files.map(function (f) { return { name: "Ajaykatta_Website/GitRepo/" + f.name, bytes: f.bytes }; });
      files.push({ name: "Ajaykatta_Website/READ-ME-FIRST.txt", bytes: enc.encode(
        "AJAY KATTA — SITE CONTENT PUBLISH\n\n" +
        "1. Unzip.\n2. From GitRepo, copy site-content.json into your repo root (next to index.html), replacing the old one.\n" +
        "3. Copy the media folder into the repo, merging with the existing media folder.\n4. Push to GitHub. Vercel redeploys automatically.\n\n" +
        "Exported " + new Date().toLocaleString() + "\n") });
      var blob = makeZip(files);
      download(blob, "site-content.zip");
      markPublished();
      closePanel();
      sheet(function (box, close) {
        box.appendChild(h("h3", {}, ["Content files downloaded ✓"]));
        box.appendChild(h("div", { class: "sub" }, ["site-content.zip · " + kb(blob.size) + " · " + files.length + " file" + (files.length === 1 ? "" : "s")]));
        box.appendChild(h("div", { class: "aks-note", html: "1 · Unzip it.<br>2 · From <b>Ajaykatta_Website / GitRepo</b>, copy <b>site-content.json</b> + <b>media/</b> into your repo, replacing the old ones.<br>3 · Push to GitHub — Vercel redeploys automatically." }));
        box.appendChild(h("div", { class: "aks-acts", style: "border:0;padding:6px 0 0" }, [h("button", { class: "aks-b pri", onclick: close }, ["Done"])]));
      });
    });
  }

  /* ------------------------------------------------------------------ boot */
  function unlocked() {
    try { return sessionStorage.getItem(SESSION) === "1" || localStorage.getItem(SESSION) === "1"; } catch (e) { return false; }
  }
  function boot() {
    if (!unlocked()) {
      injectCSS();
      askPassword("Enter your admin password to edit this site.", "Admin login").then(function (ok) {
        if (!ok) { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} return; }
        try { sessionStorage.setItem(SESSION, "1"); } catch (e) {}
        document.dispatchEvent(new CustomEvent("ak-admin-unlocked"));
        start();
      });
      return;
    }
    injectCSS();
    start();
  }
  function start() {
    Promise.all([idbGet("site:content"), idbGet("site:published-base")]).then(function (r) {
      var local = r[0], pb = r[1];
      if (pb && typeof pb === "object" && pb.data) { PUBBASE = pb.data; PUBAT = pb.at || 0; }
      var hasLocal = false; try { hasLocal = !!localStorage.getItem(FLAG); } catch (e) {}
      if (hasLocal && local && typeof local === "object") { DATA = local; S.localWins = true; S.use(DATA); }
      else DATA = JSON.parse(JSON.stringify(S.published || {}));
      buildBar();
      loadCases();
      // hidden sections stay visible-but-marked for the admin so they can be restored
      var hd = (DATA[PAGE] || {}).hide || {};
      for (var k in hd) { var el = S.resolve(k); if (el) { el.style.removeProperty("display"); el.classList.add("aks-hidden-mark"); } }
      if (/#edit$/.test(location.hash)) toggleEdit();
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  window.AK_EDIT = {
    open: openPanel, toggle: toggleEdit,
    data: function () { return DATA; },
    content: function () { return JSON.parse(JSON.stringify(DATA)); },
    publish: doExportFull,
    publishChanges: function () { return doExportFull("delta"); }
  };
})();
