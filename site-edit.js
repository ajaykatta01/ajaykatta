/* ============================================================================
   Ajay Katta Portfolio — ADMIN MODE  (site-edit.js · admin only)
   ----------------------------------------------------------------------------
   The one admin shell for every page. Loaded by site-content.js only when the
   tab is unlocked (or the URL ends in #edit); visitors never download it.

     • Login   : the single password prompt for the whole site.
     • Bar     : Edit · Add (project pages) · Undo · Admin (opens the popup).
     • Inline  : tap any text to retype it, tap any photo to swap it.
     • Panel   : Publish (incl. optimise images) · Sections · Theme · SEO ·
                 Links & files · Code & data · Versions ·
                 Tools (backup, password, log out).
     • Publish : ONE ZIP with only what differs from the live site
                 (site-package.js). Page edits are written into the HTML.

   Working copy: IndexedDB "ak-portfolio" → kv → "site:content" (page edits),
   "data:<category>" (case studies, admin.js), "media:fixes" (Optimise images).
========================================================================== */
(function () {
  "use strict";
  if (window.__AKS) return; window.__AKS = 1;
  var S = window.AK_SITE || {};
  var PAGE = S.PAGE || (location.pathname.split("/").pop() || "index").replace(/\.html?$/i, "") || "index";
  var PW_KEY = "ak-admin-pw", SESSION = "ak-admin-unlocked";
  /* SHA-256 of the admin password. Tools → Change password prints a replacement line. */
  var BAKED = "fc3bc90afab65978286ab14b40b51bbe5b8ab2d3208e6a440c7844babcf89892";
  var FLAG = "ak-site-edits";
  var MAXV = 10;
  var PKG_SRC = "site-package.js?v=22";
  var PAGES = ["index", "project-ui-ux", "project-gen-ai", "project-3d", "resume", "about", "404"];
  var PAGELABEL = { "index": "Home", "project-ui-ux": "UI / UX", "project-gen-ai": "Gen AI", "project-3d": "3D", "resume": "Résumé", "about": "About", "404": "404" };
  var CATLABEL = { "ui-ux": "UI / UX", "gen-ai": "Gen AI", "3d": "3D" };
  var BUILTIN = ["ui-ux", "gen-ai", "3d"];
  var BKS = ["text", "html", "img", "href", "attr", "hide"];
  var BUCKETS = [["text", "Text"], ["html", "Text"], ["img", "Photo"], ["href", "Link"], ["attr", "Setting"], ["hide", "Section"], ["order", "Reordered"], ["list", "Items"]];

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
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function storedPW() { return lsGet(PW_KEY) || BAKED; }
  function unlocked() { try { return sessionStorage.getItem(SESSION) === "1"; } catch (e) { return false; } }
  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function dataBytes(d) { try { return Math.round((d.split(",")[1] || "").length * 0.75); } catch (e) { return 0; } }
  function short(s, n) { s = String(s == null ? "" : s).replace(/\s+/g, " ").trim(); return s.length > (n || 46) ? s.slice(0, n || 46) + "…" : s; }
  function norm(s) { return String(s == null ? "" : s).replace(/\s+/g, " ").trim(); }
  function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function strHash(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return s.length.toString(36) + "." + x.toString(36); }
  function plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }
  function ago(ts) {
    var d = Math.round((Date.now() - ts) / 1000);
    if (d < 60) return "just now";
    if (d < 3600) return Math.round(d / 60) + " min ago";
    if (d < 86400) return Math.round(d / 3600) + " h ago";
    return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function fetchJSON(u) { return fetch(u, { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })["catch"](function () { return null; }); }

  /* ------------------------------------------------------------------- idb */
  var DB;
  function db() {
    if (DB) return DB;
    DB = new Promise(function (res, rej) {
      var rq = indexedDB.open("ak-portfolio", 1);
      rq.onupgradeneeded = function () { try { rq.result.createObjectStore("kv"); } catch (e) {} };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    return DB;
  }
  function idbGet(k) { return db().then(function (d) { return new Promise(function (res) { var r = d.transaction("kv").objectStore("kv").get(k); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; }); })["catch"](function () { return null; }); }
  function idbSet(k, v) { return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; }); }); }
  function idbKeys() { return db().then(function (d) { return new Promise(function (res) { var r = d.transaction("kv").objectStore("kv").getAllKeys(); r.onsuccess = function () { res(r.result || []); }; r.onerror = function () { res([]); }; }); })["catch"](function () { return []; }); }

  /* ---------------------------------------------------------------- keys
     An element is addressed by its path from <body> (tag + per-tag index), or
     "#name" when it carries data-ak-id. Injected admin UI (class ak-/aks-,
     data-ak-transient, script/style/…) is ignored when counting, so keys match
     the HTML file. Editor marks are attributes, never classes, for that reason. */
  function skip(el) {
    var c = (el.getAttribute && el.getAttribute("class")) || "";
    if (/(^|\s)(ak-|aks-)/.test(c)) return true;
    if (el.hasAttribute && el.hasAttribute("data-ak-transient")) return true;
    switch (el.tagName) { case "SCRIPT": case "STYLE": case "LINK": case "TEMPLATE": case "NOSCRIPT": case "META": return true; }
    return false;
  }
  function keyOf(el) {
    if (!el || el.nodeType !== 1) return "";
    var id = el.getAttribute("data-ak-id");
    if (id) return "#" + id;
    var parts = [], n = el, guard = 0;
    while (n && n.nodeType === 1 && n !== document.body && guard++ < 60) {
      var i = 1, s = n.previousElementSibling;
      while (s) { if (s.tagName === n.tagName && !skip(s)) i++; s = s.previousElementSibling; }
      parts.unshift(n.tagName.toLowerCase() + (i > 1 ? ":" + i : ""));
      n = n.parentElement;
      if (n === document.documentElement) return "";
    }
    return parts.join(">");
  }
  function resolve(key, doc) {
    doc = doc || document;
    if (!key || !doc.body) return null;
    if (key.charAt(0) === "#") {
      try { return doc.querySelector('[data-ak-id="' + key.slice(1).replace(/["\\]/g, "") + '"]'); } catch (e) { return null; }
    }
    var segs = key.split(">"), node = doc.body;
    for (var i = 0; i < segs.length && node; i++) {
      var m = /^([a-z0-9-]+)(?::(\d+))?$/i.exec(segs[i]);
      if (!m) return null;
      var tag = m[1].toUpperCase(), want = m[2] ? +m[2] : 1, c = 0, found = null, ch = node.firstElementChild;
      while (ch) { if (ch.tagName === tag && !skip(ch)) { c++; if (c === want) { found = ch; break; } } ch = ch.nextElementSibling; }
      node = found;
    }
    return node;
  }
  /* section order = a permutation of PRISTINE child positions, stamped once */
  function tagOI(box) {
    var kids = Array.prototype.filter.call(box.children, function (c) { return !skip(c); });
    if (!kids.length || kids[0].hasAttribute("data-ak-oi")) return kids;
    kids.forEach(function (c, i) { c.setAttribute("data-ak-oi", i); });
    return kids;
  }

  /* ------------------------------------------------------------------ lists
     A container marked data-ak-list="<item name>" (data-ak-items = item selector,
     data-ak-axis="y" = vertical) lets the owner add, remove and move its items.
     d.list[container key] = item ids in order: "n" = the file's nth item, "n.c" =
     a copy of it. Applied after section order and before text/photo keys (which
     are recorded against the arranged list). Items are always rebuilt from the
     file's own markup, so a baked page never carries editor or runtime state. */
  function listItems(box) {
    var s = box.getAttribute("data-ak-items");
    return Array.prototype.filter.call(box.children, function (c) { return !skip(c) && (!s || c.matches(s)); });
  }
  function itemOf(el) {
    var box = el && el.closest ? el.closest("[data-ak-list]") : null; if (!box) return null;
    var it = el; while (it && it.parentElement !== box) it = it.parentElement;
    return it && listItems(box).indexOf(it) >= 0 ? { box: box, it: it } : null;
  }
  function itemIn(el, box) {
    var it = el; while (it && it.parentElement !== box) it = it.parentElement;
    return it && listItems(box).indexOf(it) >= 0 ? it : null;
  }
  function tagList(box, doc) {
    if (box.__akP) return;
    var kids = listItems(box), from = kids, live = doc === document, base = null;
    /* a list inside another list's item (e.g. About interests: categories > GIFs) takes its
       pristine items from that item's own source copy, so added / moved parents stay right */
    var up = box.parentElement && box.parentElement.closest ? box.parentElement.closest("[data-ak-list]") : null;
    if (up) {
      tagList(up, doc);
      var uit = itemIn(box, up), uli = uit && uit.getAttribute("data-ak-li"), up0 = uli != null && up.__akP ? up.__akP[+String(uli).split(".")[0]] : null;
      base = up0 ? relFind(up0, relPath(box, uit)) : null;
    }
    if (base) from = listItems(base);
    else if (live && SRC) { var sb = resolve(keyOf(box), SRC), sk = sb ? listItems(sb) : []; if (sk.length === kids.length) from = sk; }
    box.__akP = from.map(function (c, i) {
      var n = c.ownerDocument === box.ownerDocument ? c.cloneNode(true) : box.ownerDocument.importNode(c, true);
      n.setAttribute("data-ak-li", String(i)); return n;
    });
    kids.forEach(function (c, i) { c.setAttribute("data-ak-li", String(i)); });
    if (live && LISTBOXES.indexOf(box) < 0) LISTBOXES.push(box);
  }
  function arrangeList(box, list, doc, force) {
    tagList(box, doc);
    var P = box.__akP, want = (list || P.map(function (_, i) { return i; })).map(String), kids = listItems(box);
    if (!force && kids.map(function (c) { return c.getAttribute("data-ak-li"); }).join("|") === want.join("|")) return false;
    var anchor = kids.length ? kids[kids.length - 1].nextSibling : null;
    kids.forEach(function (c) { c.remove(); });
    want.forEach(function (id) {
      var p = P[+id.split(".")[0]]; if (!p) return;
      var n = p.cloneNode(true); n.setAttribute("data-ak-li", id); box.insertBefore(n, anchor);
    });
    return true;
  }
  function relPath(el, root) {
    var parts = [];
    while (el && el !== root) {
      var i = 1, s = el.previousElementSibling;
      while (s) { if (s.tagName === el.tagName && !skip(s)) i++; s = s.previousElementSibling; }
      parts.unshift(el.tagName.toLowerCase() + ":" + i); el = el.parentElement;
    }
    return parts.join(">");
  }
  function relFind(root, rel) {
    var node = root;
    (rel ? rel.split(">") : []).forEach(function (sg) {
      if (!node) return;
      var m = /^([a-z0-9-]+):(\d+)$/i.exec(sg), c = 0, f = null, ch = node.firstElementChild;
      while (m && ch) { if (ch.tagName === m[1].toUpperCase() && !skip(ch)) { if (++c === +m[2]) { f = ch; break; } } ch = ch.nextElementSibling; }
      node = f;
    });
    return node;
  }
  function fireList(box) { try { box.dispatchEvent(new CustomEvent("ak-list-changed", { bubbles: true })); } catch (e) {} }

  /* ---------------------------------------------------------- apply a draft
     ONE routine for both the live page (live=true, admin preview) and a parsed
     copy of the HTML file (publish). Order first: keys are recorded against the
     arranged page. Returns the keys that matched nothing. */
  function putMeta(doc, m) {
    function tag(attr, name, val) {
      var e = doc.head.querySelector("meta[" + attr + '="' + name + '"]');
      if (!e) { e = doc.createElement("meta"); e.setAttribute(attr, name); doc.head.appendChild(e); }
      e.setAttribute("content", val);
    }
    if (m.title) {
      var t = doc.head.querySelector("title");
      if (!t) { t = doc.createElement("title"); doc.head.appendChild(t); }
      t.textContent = m.title; tag("property", "og:title", m.title); tag("name", "twitter:title", m.title);
    }
    if (m.description) { tag("name", "description", m.description); tag("property", "og:description", m.description); tag("name", "twitter:description", m.description); }
    if (m.image) { tag("property", "og:image", m.image); tag("name", "twitter:image", m.image); }
  }
  function varsCSS(v) {
    function block(sel, set) { var o = ""; for (var k in (set || {})) if (set[k]) o += k + ":" + set[k] + ";"; return o ? sel + "{" + o + "}" : ""; }
    return v ? block(":root", v.dark) + block('[data-theme="light"]', v.light) : "";
  }
  function applyDraft(doc, d, live, force) {
    var missed = [], changed = [];
    if (!d) return missed;
    if (d.order) Object.keys(d.order).forEach(function (ck) {
      var box = ck === "" ? doc.body : resolve(ck, doc), list = d.order[ck];
      if (!box) { missed.push("order of " + (ck || "body")); return; }
      if (!Array.isArray(list)) return;
      var by = {};
      tagOI(box).forEach(function (c) { by[c.getAttribute("data-ak-oi")] = c; });
      list.forEach(function (oi) { if (by[oi]) box.appendChild(by[oi]); });
    });
    var lists = d.list || {};
    if (live) LISTBOXES.forEach(function (box) { if (!lists[keyOf(box)] && arrangeList(box, null, doc, force)) changed.push(box); });
    function depthOf(k) {
      if (k.charAt(0) !== "#") return k.split(">").length;
      var e = resolve(k, doc), n = 0; while (e && e !== doc.body) { n++; e = e.parentElement; } return n;
    }
    Object.keys(lists).sort(function (a, b) { return depthOf(a) - depthOf(b); }).forEach(function (ck) {
      var box = resolve(ck, doc), list = lists[ck];
      if (!box || !Array.isArray(list)) { missed.push("items of " + ck); return; }
      if (arrangeList(box, list, doc, force) && live) changed.push(box);
    });
    BKS.forEach(function (b) {
      var set = d[b]; if (!set) return;
      Object.keys(set).forEach(function (k) {
        var el = resolve(k, doc), v = set[k];
        if (!el) { missed.push(k); return; }
        if (b === "text") { if (el.textContent !== v) el.textContent = v; }
        else if (b === "html") { if (el.innerHTML !== v) el.innerHTML = v; }
        else if (b === "img") {
          if (el.tagName === "IMG") { if (el.getAttribute("src") !== v) { el.removeAttribute("srcset"); el.setAttribute("src", v); } }
          else if (el.tagName === "SOURCE") el.setAttribute("srcset", v);
          else el.style.backgroundImage = 'url("' + v + '")';
        }
        else if (b === "href") { if (el.getAttribute("href") !== v) el.setAttribute("href", v); }
        else if (b === "attr") { for (var a in v) el.setAttribute(a, v[a]); }
        else if (b === "hide") {
          if (live) { if (v) el.setAttribute("data-aks-hidden", ""); else el.removeAttribute("data-aks-hidden"); }
          else if (v) el.style.setProperty("display", "none", "important");
          else el.style.removeProperty("display");
        }
      });
    });
    var css = varsCSS(d.vars), baked = doc.getElementById("ak-site-vars");
    if (live) {
      var st = doc.getElementById("aks-draft-vars");
      if (!st) { st = doc.createElement("style"); st.id = "aks-draft-vars"; doc.head.appendChild(st); }
      st.textContent = css;
      if (baked) baked.media = (d.vars && d.vars.cleared) ? "not all" : "";
    } else if (css) {
      if (!baked) { baked = doc.createElement("style"); baked.id = "ak-site-vars"; doc.head.appendChild(baked); }
      baked.textContent = css;
    } else if (baked && d.vars && d.vars.cleared) baked.remove();
    if (d.meta && !live) putMeta(doc, d.meta);
    if (!live) Array.prototype.forEach.call(doc.querySelectorAll("[data-ak-li]"), function (n) { n.removeAttribute("data-ak-li"); });
    else changed.forEach(fireList);
    return missed;
  }

  /* ----------------------------------------------------------------- state */
  var DATA = {};             // page edits, all pages (working copy)
  var SRC = null, SRCTEXT = null;   // this page's HTML file, as published
  var UNDO = [], LISTBOXES = [];
  var ON = false, sel = null, vTimer = null, META0 = null;
  var PUBBASE = null, PUBAT = 0, PUBPAGES = {};   // snapshot of DATA at the last publish
  var CASES = null, CASEBASE = null, HOMEPEND = [], FIXN = 0;

  function pd(p) { p = p || PAGE; if (!DATA[p]) DATA[p] = {}; return DATA[p]; }
  function bucket(name, p) { var d = pd(p); if (!d[name]) d[name] = {}; return d[name]; }
  function getOv(name, key, p) { var d = DATA[p || PAGE]; return d && d[name] ? d[name][key] : undefined; }
  function setOv(name, key, val, opts) {
    var b = bucket(name);
    if (!(opts && opts.noUndo)) UNDO.push({ page: PAGE, bucket: name, key: key, prev: b[key] });
    if (val == null) delete b[key]; else b[key] = val;
    save(); syncBar();
  }
  function save(quiet) {
    lsSet(FLAG, "1");
    return idbSet("site:content", DATA).then(function () { snapshotSoon(); stampEdits(!quiet); })["catch"](function () { toast("\u26A0 This browser's storage is full \u2014 publish now"); });
  }
  function snapshotSoon() { clearTimeout(vTimer); vTimer = setTimeout(function () { snapshot("auto"); }, 20000); }
  function snapshot(label) {
    return idbGet("site:versions").then(function (v) {
      v = Array.isArray(v) ? v : [];
      var json = JSON.stringify(DATA);
      if (v[0] && v[0].json === json) return;
      v.unshift({ ts: Date.now(), label: label || "auto", json: json });
      return idbSet("site:versions", v.slice(0, MAXV));
    })["catch"](function () {});
  }

  /* ------------------------------------------------------- live page apply */
  function snapMeta() {
    function g(sel) { var e = document.head.querySelector(sel); return e ? e.getAttribute("content") : null; }
    META0 = { title: document.title, description: g('meta[name="description"]'), image: g('meta[property="og:image"]') };
  }
  function applyMetaLive() {
    var m = pd().meta || {}, o = META0 || {};
    putMeta(document, { title: m.title || o.title, description: m.description || o.description, image: m.image || o.image });
  }
  /* sections hidden by an earlier publish stay visible (and marked) for the admin */
  function detectBaked() {
    sectionEls().forEach(function (el) {
      if (el.style.getPropertyValue("display") === "none" && el.style.getPropertyPriority("display") === "important") {
        el.style.removeProperty("display"); el.setAttribute("data-aks-baked", "");
      }
    });
  }
  function applyAll(force) {
    document.querySelectorAll("[data-aks-hidden]").forEach(function (e) { e.removeAttribute("data-aks-hidden"); });
    document.querySelectorAll("[data-aks-baked]").forEach(function (e) { e.setAttribute("data-aks-hidden", ""); });
    applyDraft(document, DATA[PAGE] || {}, true, force);
    applyMetaLive();
    flagChanged();
  }

  /* ------------------------------------------------------------------- css */
  function injectCSS() {
    if (document.getElementById("aks-css")) return;
    document.head.appendChild(h("style", { id: "aks-css", html: `
    .aks-ui,.aks-ui *{box-sizing:border-box;font-family:'Inter',system-ui,sans-serif}
    .aks-bar{position:fixed;z-index:2147483000;right:14px;bottom:calc(32px + env(safe-area-inset-bottom));
      display:flex;align-items:center;gap:6px;padding:6px;border-radius:99px;
      background:color-mix(in srgb,var(--surface,#1D1C1A) 92%,transparent);border:1px solid var(--line,#373634);
      backdrop-filter:blur(14px);box-shadow:0 12px 40px rgba(0,0,0,.34)}
    @media(max-width:860px){.aks-bar{right:10px;left:10px;bottom:calc(24px + env(safe-area-inset-bottom));justify-content:center}}
    .aks-b{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-width:44px;height:44px;padding:0 14px;
      border:0;border-radius:99px;background:transparent;color:var(--muted,#C9C8C6);font-size:.83rem;font-weight:600;
      cursor:pointer;transition:.18s;-webkit-tap-highlight-color:transparent;white-space:nowrap}
    .aks-b:hover{background:color-mix(in srgb,var(--text,#fff) 8%,transparent);color:var(--text,#fff)}
    .aks-b svg{width:18px;height:18px;flex:none}
    .aks-b.pri{background:linear-gradient(135deg,var(--accent,#E5783A),var(--accent-2,#C2410C));color:#fff}
    .aks-b.pri:hover{filter:brightness(1.08)}
    .aks-b.on{background:color-mix(in srgb,var(--accent,#E5783A) 20%,transparent);color:var(--accent,#E5783A)}
    .aks-b[disabled]{opacity:.4;pointer-events:none}
    @media(max-width:560px){.aks-b{padding:0 10px}.aks-b .lb{display:none}.aks-b.pri .lb{display:inline}}
    .aks-count{min-width:20px;height:20px;padding:0 6px;border-radius:99px;background:#fff;color:var(--accent-2,#C2410C);
      font-size:.68rem;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
    .aks-count:empty{display:none}
    .aks-st{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 12px 0 10px;margin-right:2px;border-radius:99px;
      font-size:.72rem;font-weight:700;letter-spacing:.02em;white-space:nowrap;color:#36d399;background:color-mix(in srgb,#36d399 12%,transparent);transition:.2s}
    .aks-st i{width:8px;height:8px;border-radius:50%;background:currentColor;box-shadow:0 0 8px currentColor}
    .aks-st[data-st="edit"]{color:var(--accent,#E5783A);background:color-mix(in srgb,var(--accent,#E5783A) 14%,transparent)}
    .aks-st[data-st="edit"] i{animation:aksPulse 1.6s ease-in-out infinite}
    @keyframes aksPulse{50%{opacity:.35}}
    @media(max-width:560px){.aks-st{padding:0 10px}.aks-st .lb{display:none}}
    .aks-frame{position:fixed;inset:0;z-index:2147482990;pointer-events:none;border:2px solid var(--accent,#E5783A);opacity:0;transition:opacity .2s}
    .aks-frame span{position:absolute;top:0;left:50%;transform:translateX(-50%);padding:3px 12px 4px;border-radius:0 0 8px 8px;background:var(--accent,#E5783A);color:#fff;font-size:.66rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}
    body.aks-editing .aks-frame{opacity:1}
    @media (prefers-reduced-motion:reduce){.aks-st[data-st="edit"] i{animation:none}}

    body.aks-on [data-aks="t"]{cursor:text;border-radius:4px;transition:box-shadow .15s,background .15s}
    body.aks-on [data-aks="t"]:hover{box-shadow:0 0 0 2px color-mix(in srgb,var(--accent,#E5783A) 45%,transparent)}
    body.aks-on [data-aks="i"]{cursor:pointer;position:relative;transition:box-shadow .15s}
    body.aks-on [data-aks="i"]:hover{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent,#E5783A) 60%,transparent)}
    body.aks-on [contenteditable="true"]{outline:2px solid var(--accent,#E5783A);outline-offset:3px;background:color-mix(in srgb,var(--accent,#E5783A) 9%,transparent)}
    body.aks-on a{cursor:default}
    body.aks-on [data-aks-changed]{box-shadow:0 0 0 2px color-mix(in srgb,#36d399 55%,transparent)}
    [data-aks-hidden]{outline:2px dashed color-mix(in srgb,#ef4444 60%,transparent)!important;outline-offset:-2px;opacity:.4!important}

    .aks-tb{position:fixed;z-index:2147483001;display:flex;align-items:center;gap:4px;padding:5px;border-radius:12px;
      background:var(--surface,#1D1C1A);border:1px solid var(--line,#373634);box-shadow:0 10px 34px rgba(0,0,0,.4)}
    @media(max-width:860px){.aks-tb{left:8px!important;right:8px;top:calc(8px + env(safe-area-inset-top))!important;justify-content:center}}
    .aks-tb .aks-b{height:40px;font-size:.8rem}
    .aks-sep{width:1px;align-self:stretch;margin:6px 2px;background:var(--line,#373634)}
    @media(max-width:860px){.aks-tb{flex-wrap:wrap}}

    /* admin popup — v2: no backdrop blur, short opacity/transform-only motion */
    @keyframes aksf{from{opacity:0}to{opacity:1}}
    @keyframes aksfo{to{opacity:0}}
    @keyframes akspop{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:none}}
    @keyframes akspopo{to{opacity:0;transform:translateY(6px) scale(.99)}}
    @keyframes akspane{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
    .aks-pov{position:fixed;inset:0;z-index:2147483200;display:flex;align-items:center;justify-content:center;padding:24px;
      background:rgba(6,7,10,.56);animation:aksf .16s ease-out}
    .aks-pov.out{animation:aksfo .14s ease-in forwards;pointer-events:none}
    .aks-pov.out .aks-pop{animation:akspopo .14s ease-in forwards}
    .aks-pop{position:relative;width:min(860px,100%);height:min(640px,calc(100dvh - 48px));display:grid;contain:layout paint;
      grid-template-columns:200px minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);
      background:var(--surface,#1D1C1A);color:var(--text,#fff);border:1px solid var(--line,#373634);border-radius:18px;overflow:hidden;
      box-shadow:0 1px 0 color-mix(in srgb,var(--text,#fff) 6%,transparent) inset,0 24px 64px -16px rgba(0,0,0,.5);
      animation:akspop .22s cubic-bezier(.2,.8,.2,1)}
    .aks-nav{grid-column:1;grid-row:1/-1;position:relative;display:flex;flex-direction:column;gap:1px;padding:16px 10px 14px;overflow:auto;scrollbar-width:none;
      background:color-mix(in srgb,var(--text,#fff) 2.5%,transparent);border-right:1px solid var(--line,#373634)}
    .aks-nav::-webkit-scrollbar{display:none}
    .aks-ey{display:flex;align-items:center;gap:8px;padding:4px 10px 14px;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#C9C8C6);font-weight:600}
    .aks-ey::before{content:'';width:7px;height:7px;border-radius:50%;background:#3FB950;box-shadow:0 0 0 3px color-mix(in srgb,#3FB950 22%,transparent)}
    .aks-dv{flex:none;height:1px;margin:7px 10px;background:var(--line,#373634)}
    .aks-ind{position:absolute;left:0;top:0;border-radius:9px;pointer-events:none;will-change:transform;
      background:color-mix(in srgb,var(--text,#fff) 8%,transparent);box-shadow:inset 2px 0 0 var(--accent,#E5783A);
      transition:transform .24s cubic-bezier(.3,.9,.3,1),width .24s cubic-bezier(.3,.9,.3,1),height .24s}
    .aks-nav.still .aks-ind{transition:none}
    .aks-tab{position:relative;z-index:1;flex:none;display:flex;align-items:center;gap:10px;height:38px;padding:0 10px;border:0;border-radius:9px;
      background:transparent;color:var(--muted,#C9C8C6);font:inherit;font-size:.9rem;font-weight:500;text-align:left;white-space:nowrap;cursor:pointer;
      transition:color .14s,background-color .14s;-webkit-tap-highlight-color:transparent}
    .aks-tab .ic{flex:none;display:inline-flex;width:16px;height:16px;opacity:.8}
    .aks-tab .ic svg{width:16px;height:16px}
    .aks-tab:hover{color:var(--text,#fff);background:color-mix(in srgb,var(--text,#fff) 4%,transparent)}
    .aks-tab.on{color:var(--text,#fff);font-weight:600;background:transparent}
    .aks-tab.on .ic{opacity:1;color:var(--accent-ink,var(--accent,#E5783A))}
    .aks-tab:focus-visible{outline:2px solid var(--accent,#E5783A);outline-offset:-2px}
    .aks-tab .n{margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:99px;background:var(--accent,#E5783A);color:#fff;
      font-size:.66rem;font-weight:700;display:inline-flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
    .aks-tab .n:empty{display:none}
    .aks-kh{margin-top:auto;padding:14px 10px 2px;font-size:.68rem;line-height:1.5;color:var(--muted,#C9C8C6);opacity:.75}
    .aks-kh kbd{font:inherit;font-size:.64rem;padding:1px 5px;border:1px solid var(--line,#373634);border-radius:5px}
    .aks-hd{grid-column:2;grid-row:1;position:relative;z-index:3;display:flex;align-items:center;gap:12px;padding:16px 14px 12px 28px;
      background:var(--surface,#1D1C1A);transition:box-shadow .16s}
    .aks-hd.sc{box-shadow:0 1px 0 var(--line,#373634)}
    .aks-hd .gr{flex:1;min-width:0;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
    .aks-hd .pg{order:2;font-size:.72rem;color:var(--muted,#C9C8C6)}
    .aks-hd h3{margin:0;font-family:'Space Grotesk',sans-serif;font-size:1.25rem;font-weight:600;letter-spacing:-.01em;color:var(--text,#fff)}
    .aks-x{position:relative;flex:none;width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:var(--muted,#C9C8C6);
      display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .14s,color .14s}
    .aks-x:hover{background:color-mix(in srgb,var(--text,#fff) 8%,transparent);color:var(--text,#fff)}
    .aks-x:focus-visible{outline:2px solid var(--accent,#E5783A);outline-offset:-2px}
    .aks-x svg{width:17px;height:17px}
    .aks-body{grid-column:2;grid-row:2;overflow:auto;padding:8px 28px 28px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
    .aks-body{scrollbar-width:thin;scrollbar-color:transparent transparent;transition:scrollbar-color .3s}
    .aks-body:hover,.aks-body:focus-within{scrollbar-color:color-mix(in srgb,var(--text,#fff) 22%,transparent) transparent}
    .aks-body::-webkit-scrollbar{width:12px}
    .aks-body::-webkit-scrollbar-track{background:transparent;margin:6px 0}
    .aks-body::-webkit-scrollbar-button{display:none;width:0;height:0}
    .aks-body::-webkit-scrollbar-thumb{border:4px solid transparent;border-radius:99px;background-clip:padding-box;background-color:transparent;min-height:40px}
    .aks-body:hover::-webkit-scrollbar-thumb,.aks-body:focus-within::-webkit-scrollbar-thumb{background-color:color-mix(in srgb,var(--text,#fff) 22%,transparent)}
    .aks-body::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,var(--text,#fff) 40%,transparent)!important;border-width:3px}
    .aks-body::-webkit-scrollbar-thumb:active{background-color:var(--accent,#E5783A)!important}
    .aks-pane{animation:akspane .18s cubic-bezier(.2,.8,.2,1)}
    .aks-pane.still{animation:none}
    @media(max-width:620px){
      .aks-pov{padding:calc(10px + env(safe-area-inset-top)) 10px calc(10px + env(safe-area-inset-bottom))}
      .aks-pop{height:min(100%,780px);border-radius:18px;grid-template-columns:minmax(0,1fr);grid-template-rows:auto auto minmax(0,1fr)}
      .aks-ey,.aks-kh{display:none}
      .aks-hd{grid-column:1;grid-row:1;padding:14px 8px 8px 18px}
      .aks-hd h3{font-size:1.15rem}
      .aks-nav{grid-column:1;grid-row:2;flex-direction:row;gap:2px;padding:6px 10px;overflow-x:auto;border-right:0;border-bottom:1px solid var(--line,#373634)}
      .aks-ind{box-shadow:inset 0 -2px 0 var(--accent,#E5783A)}
      .aks-tab{gap:7px;padding:0 11px;font-size:.86rem}
      .aks-dv{width:1px;height:18px;margin:auto 4px}
      .aks-body{grid-column:1;grid-row:3;padding:16px 18px 18px}
      .aks-go{bottom:-18px;margin:22px -18px -18px!important;padding:14px 18px 18px!important}
    }
    @media(max-width:900px),(pointer:coarse){.aks-tab{height:44px}.aks-x{width:44px;height:44px}.aks-kh{display:none}}
    @media(prefers-reduced-motion:reduce){.aks-pov,.aks-pop,.aks-pane{animation:none!important}.aks-ind{transition:none!important}}
    .aks-sum{display:grid;gap:18px;padding:18px 20px 20px;border:1px solid var(--line,#373634);border-radius:16px;background:color-mix(in srgb,var(--text,#fff) 3%,transparent)}
    .aks-sum .top{display:flex;align-items:center;justify-content:space-between;gap:8px 12px;flex-wrap:wrap}
    .aks-sum .lp{font-size:.72rem;color:var(--muted,#C9C8C6)}
    .aks-rf{display:flex;align-items:center;gap:10px;margin-left:auto}
    .aks-rfb{height:30px;padding:0 12px}
    .aks-rfb.busy{pointer-events:none;opacity:.7}
    .aks-rfb.busy svg{animation:aksspin .8s linear infinite}
    @keyframes aksspin{to{transform:rotate(360deg)}}
    @media(max-width:900px),(pointer:coarse){.aks-rfb::after{content:'';position:absolute;left:0;right:0;top:50%;height:44px;transform:translateY(-50%)}}
    .aks-chip{display:inline-flex;align-items:center;gap:8px;height:26px;padding:0 11px;border-radius:99px;font-size:.7rem;font-weight:600;
      --c:var(--accent,#E5783A);color:var(--c);background:color-mix(in srgb,var(--c) 13%,transparent)}
    .aks-chip i{width:6px;height:6px;border-radius:99px;background:currentColor;animation:akspulse 2.2s ease-out infinite}
    .aks-chip.live{--c:#22c55e}
    .aks-chip.live i{animation:none}
    @keyframes akspulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--c) 55%,transparent)}70%,100%{box-shadow:0 0 0 7px transparent}}
    .aks-sum .big{display:flex;align-items:flex-end;gap:14px}
    .aks-sum .num{font-family:'Space Grotesk',sans-serif;font-size:4rem;line-height:.8;font-weight:600;letter-spacing:-.05em;color:var(--text,#fff);font-variant-numeric:tabular-nums}
    .aks-sum .ok{flex:none;width:48px;height:48px;border-radius:99px;display:grid;place-items:center;background:color-mix(in srgb,#22c55e 15%,transparent);color:#22c55e;align-self:center}
    .aks-sum .ok svg{width:22px;height:22px}
    .aks-sum .lb{display:grid;gap:3px;font-size:.8rem;line-height:1.45;color:var(--muted,#C9C8C6);text-wrap:pretty}
    .aks-sum .lb b{font-size:1rem;font-weight:600;color:var(--text,#fff)}
    .aks-sum.live .big{align-items:center}
    .aks-more{display:flex;flex-wrap:wrap;gap:8px 20px;margin-top:10px;font-size:.76rem}
    .aks-chk{position:relative}
    .aks-chk .aks-ico{transition:color .25s,background .25s}
    .aks-chk[data-s=ok] .aks-ico{color:#22c55e;background:color-mix(in srgb,#22c55e 14%,transparent)}
    .aks-chk[data-s=warn] .aks-ico{color:#f59e0b;background:color-mix(in srgb,#f59e0b 14%,transparent)}
    .aks-chk[data-s=warn] .aks-sbtn{border-color:var(--accent,#E5783A);color:var(--accent,#E5783A)}
    .aks-chk[data-s=busy] .aks-ico{animation:aksbusy 1.2s ease-in-out infinite}
    .aks-chk[data-s=busy]::after{content:'';position:absolute;left:0;bottom:-1px;height:2px;width:calc(var(--p,0) * 1%);border-radius:2px;background:var(--accent,#E5783A);transition:width .25s}
    @keyframes aksbusy{50%{opacity:.45}}
    .aks-steps{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
    .aks-steps li{position:relative;display:grid;gap:3px;align-content:start}
    .aks-steps li::after{content:'';position:absolute;top:13px;left:36px;right:-6px;height:1px;background:var(--line,#373634)}
    .aks-steps li:last-child::after{display:none}
    .aks-steps .n{width:26px;height:26px;margin-bottom:9px;border-radius:99px;display:grid;place-items:center;font-size:.72rem;font-weight:700;
      color:var(--text,#fff);border:1px solid var(--line,#373634);background:var(--surface,#1D1C1A);transition:.2s}
    .aks-steps li:hover .n{border-color:var(--accent,#E5783A);color:var(--accent,#E5783A)}
    .aks-steps li.on .n{background:linear-gradient(135deg,var(--accent,#E5783A),var(--accent-2,#C2410C));border-color:transparent;color:#fff}
    .aks-steps b{font-size:.84rem;font-weight:600;color:var(--text,#fff)}
    .aks-steps .d{font-size:.72rem;line-height:1.45;color:var(--muted,#C9C8C6);text-wrap:pretty}
    @media(prefers-reduced-motion:reduce){.aks-chip i,.aks-chk .aks-ico{animation:none!important}}
    .aks-list{border-top:1px solid var(--line,#373634)}
    .aks-acc{border-bottom:1px solid var(--line,#373634)}
    .aks-acc::details-content{block-size:0;overflow:hidden;transition:block-size .3s cubic-bezier(.2,.8,.2,1),content-visibility .3s allow-discrete}
    .aks-acc[open]::details-content{block-size:auto}
    .aks-acc summary{list-style:none;display:flex;align-items:center;gap:12px;min-height:54px;padding:0 2px;cursor:pointer;-webkit-tap-highlight-color:transparent}
    .aks-acc summary::-webkit-details-marker{display:none}
    .aks-acc summary:focus-visible{outline:2px solid var(--accent,#E5783A);outline-offset:2px;border-radius:8px}
    .aks-acc .tt{flex:1;min-width:0;font-size:.88rem;font-weight:600;color:var(--text,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .aks-acc .c{flex:none;min-width:24px;height:22px;padding:0 8px;border-radius:99px;background:color-mix(in srgb,var(--text,#fff) 7%,transparent);
      color:var(--text,#fff);font-size:.72rem;font-weight:600;display:inline-flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
    .aks-acc .ch{flex:none;display:inline-flex;color:var(--muted,#C9C8C6);transition:transform .28s cubic-bezier(.2,.8,.2,1),color .18s}
    .aks-acc .ch svg{width:16px;height:16px}
    .aks-acc summary:hover .ch{color:var(--text,#fff)}
    .aks-acc[open] .ch{transform:rotate(90deg)}
    .aks-acc ul{list-style:none;margin:0;padding:0 2px 16px;display:grid;gap:8px}
    .aks-acc li{position:relative;padding-left:16px;font-size:.78rem;line-height:1.5;color:var(--muted,#C9C8C6);word-break:break-word}
    .aks-acc ul li::before{content:'';position:absolute;left:3px;top:.6em;width:5px;height:5px;border-radius:99px;background:var(--accent,#E5783A)}
    .aks-acc ul li.more::before{background:var(--line,#373634)}
    .aks-acc li b,.aks-tip b,.aks-chk .v b{color:var(--text,#fff);font-weight:600}
    .aks-ico{flex:none;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:color-mix(in srgb,var(--text,#fff) 6%,transparent);color:var(--muted,#C9C8C6)}
    .aks-ico svg{width:16px;height:16px}
    .aks-chk{display:flex;align-items:center;gap:12px;min-height:58px;padding:10px 2px;border-bottom:1px solid var(--line,#373634)}
    .aks-chk .v{flex:1;min-width:0;font-size:.78rem;line-height:1.5;color:var(--muted,#C9C8C6)}
    .aks-sbtn{position:relative;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 14px;border-radius:99px;border:1px solid var(--line,#373634);background:transparent;
      color:var(--text,#fff);font-size:.76rem;font-weight:600;cursor:pointer;transition:.18s}
    .aks-sbtn:hover{border-color:var(--accent,#E5783A);color:var(--accent,#E5783A)}
    .aks-sbtn::after{content:'';position:absolute;left:0;right:0;top:50%;height:44px;transform:translateY(-50%)}
    .aks-tip{font-size:.76rem;line-height:1.55;color:var(--muted,#C9C8C6);margin-top:12px;text-wrap:pretty}
    .aks-lnk{border:0;background:none;padding:0;font:inherit;font-weight:600;color:var(--accent,#E5783A);cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
    .aks-go{position:sticky;bottom:-28px;z-index:2;display:grid;gap:10px;margin:28px -28px -28px;padding:20px 28px 24px;
      background:linear-gradient(to bottom,transparent,var(--surface,#1D1C1A) 20px)}
    .aks-pub{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;height:54px;border:0;border-radius:14px;cursor:pointer;
      background:linear-gradient(135deg,var(--accent,#E5783A),var(--accent-2,#C2410C));color:#fff;font-size:.92rem;font-weight:600;
      box-shadow:0 12px 30px -12px color-mix(in srgb,var(--accent,#E5783A) 75%,transparent);transition:transform .18s,box-shadow .18s,filter .18s;-webkit-tap-highlight-color:transparent}
    .aks-pub:hover{transform:translateY(-1px);filter:brightness(1.06);box-shadow:0 18px 36px -14px color-mix(in srgb,var(--accent,#E5783A) 85%,transparent)}
    .aks-pub:active{transform:scale(.99)}
    .aks-pub .ar{display:inline-flex;transition:transform .28s cubic-bezier(.2,.8,.2,1)}
    .aks-pub:hover .ar{transform:translateY(-2px)}
    .aks-pub svg{width:18px;height:18px}
    .aks-pub.ghost{background:transparent;color:var(--text,#fff);border:1px solid var(--line,#373634);box-shadow:none}
    .aks-pub.ghost:hover{border-color:var(--accent,#E5783A);filter:none;box-shadow:none}
    .aks-go .sm{font-size:.72rem;color:var(--muted,#C9C8C6);text-align:center}
    .aks-csum{display:flex;flex-wrap:wrap;align-items:center;gap:10px 8px;padding:14px 16px;border:1px solid var(--line,#373634);border-radius:14px;
      background:color-mix(in srgb,var(--text,#fff) 3%,transparent)}
    .aks-csum .gr{flex:1 1 220px;min-width:0}
    .aks-csum .t{font-size:.9rem;font-weight:600;color:var(--text,#fff)}
    .aks-csum .s{font-size:.74rem;line-height:1.5;color:var(--muted,#C9C8C6);margin-top:3px;text-wrap:pretty}
    .aks-crow{display:flex;align-items:center;gap:10px;min-height:60px;padding:8px 2px;border-bottom:1px solid var(--line,#373634)}
    .aks-crow .gr{flex:1;min-width:0;text-decoration:none;color:inherit;padding:4px 0}
    .aks-crow .t{font:500 .82rem/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--text,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color .18s}
    .aks-crow a.gr:hover .t{color:var(--accent,#E5783A)}
    .aks-crow .s{font-size:.72rem;color:var(--muted,#C9C8C6);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .aks-pill{flex:none;height:22px;padding:0 9px;border-radius:99px;display:inline-flex;align-items:center;font-size:.6rem;font-weight:700;
      letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;--c:var(--muted,#C9C8C6);color:var(--c);background:color-mix(in srgb,var(--c) 14%,transparent)}
    .aks-pill.up{--c:#22c55e}.aks-pill.ed{--c:var(--accent,#E5783A)}.aks-pill.old{--c:#f59e0b}.aks-pill.bad{--c:#ef4444}
    .aks-dl{position:relative;flex:none;width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:var(--muted,#C9C8C6);
      display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.18s}
    .aks-dl:hover{background:color-mix(in srgb,var(--text,#fff) 8%,transparent);color:var(--text,#fff)}
    .aks-dl svg{width:16px;height:16px}
    .aks-acc.f summary{min-height:62px;padding:8px 2px}
    .aks-acc .gr{flex:1;min-width:0}
    .aks-acc .fn{font:500 .82rem/1.3 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--text,#fff);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .aks-acc .fs{font-size:.72rem;color:var(--muted,#C9C8C6);margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .aks-fb{display:grid;gap:12px;padding:2px 2px 18px}
    .aks-acc .aks-fb ul{padding:0}
    .aks-fb .lb{font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted,#C9C8C6);font-weight:600}
    .aks-fb .when{font-size:.78rem;line-height:1.5;color:var(--text,#fff)}
    .aks-fb .none{font-size:.76rem;line-height:1.5;color:var(--muted,#C9C8C6)}
    .aks-fa{display:flex;flex-wrap:wrap;gap:8px}
    a.aks-sbtn{text-decoration:none}
    .aks-sbtn svg{width:14px;height:14px}
    .aks-dl::after{content:'';position:absolute;left:50%;top:50%;width:44px;height:44px;transform:translate(-50%,-50%)}
    .aks-sec{font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted,#C9C8C6);font-weight:600;margin:26px 0 10px}
    .aks-sec:first-child{margin-top:0}
    .aks-row{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--line,#373634);border-radius:12px;margin-bottom:8px;background:color-mix(in srgb,var(--text,#fff) 3%,transparent)}
    .aks-row.tap{cursor:pointer;transition:border-color .18s}
    .aks-row.tap:hover{border-color:var(--accent,#E5783A)}
    .aks-row .gr{flex:1;min-width:0}
    .aks-row .t{font-size:.86rem;color:var(--text,#fff);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .aks-row .s{font-size:.72rem;color:var(--muted,#C9C8C6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
    .aks-row .v{flex:none;font-size:.72rem;color:var(--muted,#C9C8C6);text-align:right}
    .aks-ic{width:40px;height:40px;flex:none;border-radius:10px;border:1px solid var(--line,#373634);background:transparent;
      color:var(--muted,#C9C8C6);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:.18s;-webkit-tap-highlight-color:transparent}
    .aks-ic:hover{color:var(--text,#fff);border-color:var(--accent,#E5783A)}
    .aks-ic svg{width:17px;height:17px}
    .aks-ic.off{color:#ef4444}
    .aks-f{display:block;margin-bottom:12px}
    .aks-f label{display:block;font-size:.72rem;color:var(--muted,#C9C8C6);margin-bottom:6px;font-weight:600}
    .aks-f input[type=text],.aks-f input[type=url],.aks-f input[type=password],.aks-f textarea{width:100%;min-height:46px;padding:12px;border-radius:11px;
      border:1px solid var(--line,#373634);background:var(--bg,#1C1A14);color:var(--text,#fff);font-size:16px;font-family:inherit}
    .aks-f textarea{min-height:88px;resize:vertical}
    .aks-f input:focus,.aks-f textarea:focus{outline:none;border-color:var(--accent,#E5783A)}
    .aks-sws{border-top:1px solid var(--line,#373634)}
    .aks-sw{display:flex;align-items:center;gap:14px;min-height:56px;padding:8px 4px;border-bottom:1px solid var(--line,#373634);cursor:pointer;transition:background .18s}
    .aks-sw:hover{background:color-mix(in srgb,var(--text,#fff) 3%,transparent)}
    .aks-sw input[type=color]{-webkit-appearance:none;appearance:none;flex:none;width:34px;height:34px;padding:0;margin:0;border:0;border-radius:10px;background:transparent;cursor:pointer;transition:transform .18s}
    .aks-sw:hover input[type=color]{transform:scale(1.06)}
    .aks-sw input[type=color]::-webkit-color-swatch-wrapper{padding:0}
    .aks-sw input[type=color]::-webkit-color-swatch{border:1px solid color-mix(in srgb,var(--text,#fff) 18%,transparent);border-radius:10px}
    .aks-sw input[type=color]::-moz-color-swatch{border:1px solid color-mix(in srgb,var(--text,#fff) 18%,transparent);border-radius:10px}
    .aks-sw input[type=color]:focus-visible{outline:2px solid var(--accent,#E5783A);outline-offset:2px}
    .aks-sw .nm{flex:1;min-width:0;font-size:.86rem;font-weight:500;color:var(--text,#fff)}
    .aks-sw .hx{flex:none;font-size:.72rem;color:var(--muted,#C9C8C6);font-family:ui-monospace,monospace;text-transform:uppercase;letter-spacing:.04em}
    .aks-note{font-size:.76rem;line-height:1.55;color:var(--muted,#C9C8C6);margin:10px 0}
    .aks-note b{color:var(--text,#fff)}
    .aks-warn{font-size:.76rem;line-height:1.55;color:var(--text,#fff);margin:10px 0;padding:10px 12px;border:1px solid #ef4444;border-radius:10px;background:color-mix(in srgb,#ef4444 8%,transparent)}
    .aks-acts{display:flex;gap:8px;padding:12px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line,#373634)}
    .aks-acts .aks-b{flex:1;border:1px solid var(--line,#373634)}
    .aks-acts .aks-b.pri{border-color:transparent}
    .aks-b.dgr{background:linear-gradient(135deg,#ef4444,#f87171);color:#fff}
    .aks-wide{width:100%;height:48px;border:1px solid var(--line,#373634);margin-top:8px}
    .aks-wide.pri{border-color:transparent}

    .aks-mov{position:fixed;inset:0;z-index:2147483300;background:rgba(5,6,10,.72);backdrop-filter:blur(7px);
      display:flex;align-items:center;justify-content:center;padding:18px;animation:aksf .18s}
    .aks-m{width:min(460px,100%);max-height:88vh;overflow:auto;padding:20px;border-radius:18px;background:var(--surface,#1D1C1A);
      border:1px solid var(--line,#373634);box-shadow:0 30px 80px rgba(0,0,0,.5)}
    .aks-m.wide{width:min(580px,100%)}
    .aks-m h3{margin:0 0 6px;font-family:'Space Grotesk',sans-serif;font-size:1.1rem;color:var(--text,#fff)}
    .aks-m .sub{font-size:.83rem;color:var(--muted,#C9C8C6);line-height:1.55;margin-bottom:14px}
    .aks-m input[type=password],.aks-m input[type=text]{width:100%;height:48px;padding:0 13px;border-radius:11px;border:1px solid var(--line,#373634);
      background:var(--bg,#1C1A14);color:var(--text,#fff);font-size:16px}
    .aks-m textarea.code{width:100%;min-height:70px;resize:none;font:.78rem/1.5 ui-monospace,monospace;color:var(--text,#fff);
      background:var(--bg,#1C1A14);border:1px solid var(--line,#373634);border-radius:10px;padding:11px 13px}
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
      color:var(--text,#fff);font-size:.82rem;box-shadow:0 12px 40px rgba(0,0,0,.4);animation:aksf .18s;max-width:calc(100vw - 32px)}
    .aks-diff{border:1px solid var(--line,#373634);border-radius:12px;overflow:hidden;margin-bottom:10px}
    .aks-diff .hd{padding:9px 12px;background:color-mix(in srgb,var(--text,#fff) 5%,transparent);font-size:.72rem;font-weight:700;color:var(--text,#fff);letter-spacing:.04em}
    .aks-diff .it{padding:9px 12px;border-top:1px solid var(--line,#373634);font-size:.76rem;color:var(--muted,#C9C8C6);line-height:1.5;word-break:break-word}
    .aks-prog{position:fixed;z-index:2147483350;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);width:min(370px,88vw);
      padding:16px 18px;border-radius:14px;background:var(--surface,#1D1C1A);color:var(--text,#fff);border:1px solid var(--line,#373634);box-shadow:0 20px 54px rgba(0,0,0,.5)}
    .aks-prog .tt{font-size:.88rem;font-weight:600}
    .aks-prog .tr{height:6px;border-radius:99px;background:color-mix(in srgb,var(--text,#fff) 14%,transparent);overflow:hidden;margin-top:12px}
    .aks-prog .tr i{display:block;height:100%;width:2%;background:var(--accent,#E5783A);transition:width .25s}
    .aks-prog .lb{font-size:.76rem;color:var(--muted,#C9C8C6);margin-top:9px}
    body.ak-item-detail .aks-add,body.detail .aks-add{display:none}
    body.aks-preview .aks-bar{opacity:.25}
    body.aks-preview .aks-bar:hover{opacity:1}
    @media print{.aks-ui{display:none!important}}
    ` }));
  }

  /* ----------------------------------------------------------------- icons */
  var I = {
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    panel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeoff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.94 17.94A10.1 10.1 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-6.4L3 9"/></svg>',
    up2: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5M12 3v13"/></svg>',
    dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5M12 15V3"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
    img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    reset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
    out: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>'
  };

  /* ---------------------------------------------------- modal / toast utils */
  function toast(msg) {
    var t = h("div", { class: "aks-ui aks-toast" }, [msg]);
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = "opacity .3s"; t.style.opacity = "0"; setTimeout(function () { t.remove(); }, 320); }, 2200);
  }
  function sheet(build, wide, onClose) {
    var ov = h("div", { class: "aks-ui aks-mov", onclick: function (e) { if (e.target === ov) close(); } });
    var box = h("div", { class: "aks-m" + (wide ? " wide" : "") });
    ov.appendChild(box); document.body.appendChild(ov);
    function onKey(e) { if (e.key === "Escape") close(); }
    function close() { if (!ov.parentNode) return; ov.remove(); document.removeEventListener("keydown", onKey); if (onClose) onClose(); }
    document.addEventListener("keydown", onKey);
    build(box, close);
    return close;
  }
  function acts(kids) { return h("div", { class: "aks-acts", style: "border:0;padding:8px 0 0" }, kids); }
  function confirmBox(o) {
    return new Promise(function (res) {
      sheet(function (box, close) {
        box.appendChild(h("h3", {}, [o.title]));
        if (o.sub) box.appendChild(h("div", { class: "sub" }, [o.sub]));
        box.appendChild(acts([
          h("button", { class: "aks-b", onclick: function () { close(); res(false); } }, [o.cancel || "Cancel"]),
          h("button", { class: "aks-b " + (o.danger ? "dgr" : "pri"), onclick: function () { close(); res(true); } }, [o.ok || "Confirm"])
        ]));
      });
    });
  }
  function askPassword(reason, title) {
    return new Promise(function (res) {
      var settled = false;
      function done(v) { if (!settled) { settled = true; res(v); } }
      sheet(function (box, close) {
        var inp = h("input", { type: "password", placeholder: "Admin password", autocomplete: "current-password" });
        var err = h("div", { class: "err" });
        function go() {
          var v = inp.value.trim();
          if (!v) { err.textContent = "Enter your password."; return; }
          sha256(v).then(function (hash) {
            if (hash === storedPW()) { done(true); close(); }
            else { err.textContent = "Incorrect password."; inp.select(); }
          });
        }
        box.appendChild(h("h3", {}, [title || "Confirm it's you"]));
        box.appendChild(h("div", { class: "sub" }, [reason || "Re-enter your admin password to publish."]));
        box.appendChild(inp); box.appendChild(err);
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
        box.appendChild(acts([
          h("button", { class: "aks-b", onclick: function () { close(); done(false); } }, ["Cancel"]),
          h("button", { class: "aks-b pri", onclick: go }, ["Continue"])
        ]));
        setTimeout(function () { inp.focus(); }, 60);
      }, false, function () { done(false); });   // Escape / backdrop = cancel
    });
  }
  function progress(title) {
    var bar = h("i"), lab = h("div", { class: "lb" }, ["Starting\u2026"]);
    var box = h("div", { class: "aks-ui aks-prog", "data-ak-transient": "" }, [h("div", { class: "tt" }, [title]), h("div", { class: "tr" }, [bar]), lab]);
    document.body.appendChild(box);
    return {
      set: function (t, pct) { lab.textContent = t; bar.style.width = Math.max(2, Math.min(100, pct || 0)) + "%"; },
      close: function () { box.remove(); }
    };
  }

  /* ------------------------------------------- the page as published (SRC) */
  function loadSource() {
    if (SRC) return Promise.resolve(SRC);
    return fetch(PAGE === "404" ? "404.html" : location.pathname, { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : null; })
      .then(function (t) { if (t) t = t.replace(/<(style|script)\b[^>]*\bdata-(?:omelette|om-host)[^>]*>[\s\S]*?<\/\1>\s*/gi, ""); if (t) { SRCTEXT = t; SRC = new DOMParser().parseFromString(t, "text/html"); } return SRC; })
      ["catch"](function () { return null; });
  }
  function originalOf(key, what) {
    var node = SRC && resolve(key, SRC);
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
  /* plain text, or text with bare <strong>/<b> runs (Bold / Normal in the toolbar) */
  function isTextEl(el) {
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (!/^(STRONG|B)$/.test(c.tagName) || c.firstElementChild) return false;
      for (var ai = 0; ai < c.attributes.length; ai++) if (!/^data-aks/.test(c.attributes[ai].name)) return false;
    }
    var t = (el.textContent || "").trim();
    return t.length > 0 && t.length < 4000;
  }
  /* Only what is in the HTML file can be edited here. Content a script renders at
     runtime (projects, certificates) has its own editor — an edit to it here
     would have nothing to land on when the page is published. */
  function inFile(el, kind) {
    if (!SRC) return true;
    var li = itemOf(el);
    if (li && li.box.__akP) return true;          // list items are rebuilt from the file's own markup
    var k = keyOf(el); if (!k) return false;
    var o = resolve(k, SRC);
    if (!o || o.tagName !== el.tagName) return false;
    var b = kind === "i" ? "img" : "text";
    if (getOv(b, k) !== undefined || (b === "text" && getOv("html", k) !== undefined)) return true;
    return kind === "i" ? (o.getAttribute("src") || "") === (el.getAttribute("src") || "") : norm(o.textContent) === norm(el.textContent);
  }
  function mark() {
    var all = document.body.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li,a,button,span,small,strong,em,b,i,figcaption,blockquote,label,td,th,dt,dd,summary,div,time,address");
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.matches(SKIPSEL) || inChrome(el) || !isTextEl(el) || !inFile(el, "t")) continue;
      el.setAttribute("data-aks", "t");
    }
    var imgs = document.body.querySelectorAll("img");
    for (var j = 0; j < imgs.length; j++) {
      if (inChrome(imgs[j]) || imgs[j].matches("[data-ak-noedit]") || !inFile(imgs[j], "i")) continue;
      imgs[j].setAttribute("data-aks", "i");
    }
    document.querySelectorAll('[data-aks="t"] [data-aks]').forEach(function (e) { e.removeAttribute("data-aks"); });
    flagChanged();
  }
  function unmark() { document.querySelectorAll("[data-aks]").forEach(function (e) { e.removeAttribute("data-aks"); }); }
  function flagChanged() {
    document.querySelectorAll("[data-aks-changed]").forEach(function (e) { e.removeAttribute("data-aks-changed"); });
    var d = DATA[PAGE] || {};
    ["text", "html", "img", "href"].forEach(function (b) {
      for (var k in (d[b] || {})) {
        if (inBase(PAGE, b, k, d[b][k])) continue;
        var el = resolve(k); if (el) el.setAttribute("data-aks-changed", "");
      }
    });
  }

  /* ----------------------------------------------------------- inline edit */
  var tb = null;
  function killToolbar() { if (tb) { tb.remove(); tb = null; } FB = FN = null; }
  function place(el) {
    if (!tb || window.innerWidth <= 860) return;          // CSS pins it top on mobile
    var r = el.getBoundingClientRect(), tw = tb.offsetWidth || 220;
    tb.style.top = Math.max(8, r.top - 52) + "px";
    tb.style.left = Math.min(window.innerWidth - tw - 10, Math.max(8, r.left)) + "px";
  }
  function btn(icon, label, fn, cls) {
    return h("button", { class: "aks-b " + (cls || ""), type: "button", title: label, "aria-label": label, onclick: function (e) { e.preventDefault(); e.stopPropagation(); fn(); } },
      [h("span", { html: icon }), label ? h("span", { class: "lb" }, [label]) : null]);
  }
  function selectEl(el) {
    deselect();
    sel = el;
    var kind = el.getAttribute("data-aks"), key = keyOf(el);
    tb = h("div", { class: "aks-ui aks-tb" });
    if (kind === "t") {
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");
      el.focus();
      try { document.execCommand("selectAll", false, null); document.getSelection().collapseToEnd(); } catch (e) {}
      tb.appendChild(btn(I.ok, "Done", commitText, "pri"));
      var la = el.closest ? el.closest("a") : null;
      if (la && (la === el || !inChrome(la))) tb.appendChild(btn(I.link, "Link", function () { editLink(la, keyOf(la)); }));
      FB = btn('<b style="font-weight:800;font-size:15px;line-height:1">B</b>', "Bold", function () { fmt("bold"); });
      FN = btn('<span style="font-weight:400;font-size:15px;line-height:1">N</span>', "Normal", function () { fmt("normal"); });
      [FB, FN].forEach(function (b) {
        b.addEventListener("mousedown", function (e) { e.preventDefault(); });      // keep the selection
        b.title += " \u00b7 select words first, or the whole line \u00b7 Ctrl/\u2318 B";
        tb.appendChild(b);
      });
      el.__aksBefore = richOf(el); lastOff = null; syncFmt();
    } else {
      tb.appendChild(btn(I.img, "Replace photo", function () { pickImage(el, key); }, "pri"));
    }
    tb.appendChild(btn(I.reset, "Reset", function () { resetEl(el, key, kind); }));
    var li = itemOf(el);
    if (li) listButtons(li, kind);
    tb.appendChild(btn(I.x, "", deselect));
    document.body.appendChild(tb);
    place(el);
  }
  function commitText() {
    if (!sel || sel.getAttribute("contenteditable") !== "true") { deselect(); return; }
    var el = sel, key = keyOf(el), hv = richOf(el);
    el.removeAttribute("contenteditable");
    if (hv !== el.__aksBefore) {
      UNDO.push({ page: PAGE, snap: clone(DATA[PAGE] || {}) });
      var tB = bucket("text"), hB = bucket("html");
      if (hv.indexOf("<strong>") >= 0) { delete tB[key]; hB[key] = hv; } else { delete hB[key]; tB[key] = el.textContent; }
      el.innerHTML = hv;
      save(); syncBar();
      el.setAttribute("data-aks-changed", ""); toast("Saved");
    }
    killToolbar(); sel = null;
  }
  function deselect() {
    if (sel && sel.getAttribute("contenteditable") === "true") { commitText(); return; }
    killToolbar(); sel = null;
  }
  /* the file's own value for an element — list items read their source item */
  function origNode(el, key) {
    var li = el && itemOf(el);
    if (li && li.box.__akP) { var p = li.box.__akP[+String(li.it.getAttribute("data-ak-li")).split(".")[0]]; return p ? relFind(p, relPath(el, li.it)) : null; }
    return SRC ? resolve(key, SRC) : null;
  }
  function restoreKey(b, k) {
    var el = resolve(k), o = el && origNode(el, k); if (!o) return;
    if (b === "text" || b === "html") el.innerHTML = o.innerHTML;
    else if (b === "img") el.setAttribute("src", o.getAttribute("src") || "");
    else if (b === "href") el.setAttribute("href", o.getAttribute("href") || "");
  }
  /* ---- Bold / Normal: a per-character weight mask, rendered back as <strong> runs */
  var FB = null, FN = null, lastOff = null;
  function escT(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function boldMask(el) {
    var m = [], w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n;
    while ((n = w.nextNode())) {
      var b = false, p = n.parentNode;
      while (p && p !== el) { if (p.tagName === "STRONG" || p.tagName === "B") b = true; p = p.parentNode; }
      for (var i = 0; i < n.data.length; i++) m.push(b);
    }
    return m;
  }
  function runsHTML(t, m) {
    var out = "", i = 0;
    while (i < t.length) { var j = i; while (j < t.length && !!m[j] === !!m[i]) j++; var s = escT(t.slice(i, j)); out += m[i] ? "<strong>" + s + "</strong>" : s; i = j; }
    return out;
  }
  function richOf(el) { return runsHTML(el.textContent, boldMask(el)); }
  function selOffsets(el) {
    var s = window.getSelection(); if (!s || !s.rangeCount) return null;
    var r = s.getRangeAt(0); if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
    function off(node, o) { var x = document.createRange(); x.selectNodeContents(el); x.setEnd(node, o); return x.toString().length; }
    return [off(r.startContainer, r.startOffset), off(r.endContainer, r.endOffset)];
  }
  function setSel(el, a, b) {
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), n, at = 0, r = document.createRange(), sa = false;
    while ((n = w.nextNode())) {
      var L = n.data.length;
      if (!sa && a <= at + L) { r.setStart(n, a - at); sa = true; }
      if (sa && b <= at + L) { r.setEnd(n, b - at); break; }
      at += L;
    }
    try { var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) {}
  }
  function fmt(mode) {
    if (!sel || sel.getAttribute("contenteditable") !== "true") return;
    var el = sel, t = el.textContent, m = boldMask(el), o = selOffsets(el) || lastOff;
    var a = o ? Math.min(o[0], o[1]) : 0, b = o ? Math.max(o[0], o[1]) : 0;
    if (a === b) { a = 0; b = t.length; }
    if (mode === "toggle") { var all = true; for (var i = a; i < b; i++) if (!m[i]) { all = false; break; } mode = all ? "normal" : "bold"; }
    for (var k = a; k < b; k++) m[k] = mode === "bold";
    el.innerHTML = runsHTML(t, m);
    el.focus(); setSel(el, a, b); lastOff = [a, b]; syncFmt();
  }
  function syncFmt() {
    if (!FB || !sel || sel.getAttribute("contenteditable") !== "true") return;
    var m = boldMask(sel), o = selOffsets(sel) || lastOff, a = o ? Math.min(o[0], o[1]) : 0, b = o ? Math.max(o[0], o[1]) : 0;
    if (a === b) { a = 0; b = m.length; }
    var all = b > a; for (var i = a; i < b; i++) if (!m[i]) { all = false; break; }
    FB.classList.toggle("on", all); FN.classList.toggle("on", !all);
  }
  document.addEventListener("selectionchange", function () {
    if (!ON || !sel || sel.getAttribute("contenteditable") !== "true") return;
    var o = selOffsets(sel); if (o) lastOff = o; syncFmt();
  });
  /* ---- API for page tools (tl-admin.js): same buckets, same publish, one undo step per batch */
  var BATCH = 0;
  function snapUndo() { if (!BATCH) UNDO.push({ page: PAGE, snap: clone(DATA[PAGE] || {}) }); }
  function apiDone(el) { if (el) el.setAttribute("data-aks-changed", ""); if (!BATCH) { save(); syncBar(); } }
  function apiText(el, v) {
    var key = keyOf(el); if (!key) return;
    v = String(v == null ? "" : v);
    if (v === el.textContent && !el.firstElementChild) return;
    snapUndo();
    if (DATA[PAGE] && DATA[PAGE].html) delete DATA[PAGE].html[key];
    bucket("text")[key] = v; el.textContent = v; apiDone(el);
  }
  function apiImg(el, url) {
    var key = keyOf(el); if (!key || !url) return;
    snapUndo(); bucket("img")[key] = url;
    el.removeAttribute("srcset"); el.setAttribute("src", url); apiDone(el);
  }
  function apiAttr(el, o) {
    var key = keyOf(el); if (!key || !o) return;
    snapUndo();
    var b = bucket("attr"), cur = b[key] || {};
    for (var a in o) { cur[a] = String(o[a]); el.setAttribute(a, String(o[a])); }
    b[key] = cur; apiDone(null);
  }
  function apiBatch(fn) {
    UNDO.push({ page: PAGE, snap: clone(DATA[PAGE] || {}) });
    BATCH++;
    var r; try { r = fn(); } finally { BATCH--; }
    save(); syncBar(); return r;
  }
  function origFor(el, key, what) {
    var li = el && itemOf(el);
    if (li && li.box.__akP) {
      var n = origNode(el, key);
      if (!n) return null;
      return what === "img" ? n.getAttribute("src") || "" : what === "href" ? n.getAttribute("href") || "" : n.textContent;
    }
    return originalOf(key, what);
  }
  function listButtons(o, kind) {
    var box = o.box, it = o.it, nm = box.getAttribute("data-ak-list") || "item", y = box.getAttribute("data-ak-axis") === "y";
    var all = listItems(box), at = all.indexOf(it);
    function ib(icon, title, fn, off) { var b = btn(icon, "", fn); b.title = title; b.setAttribute("aria-label", title); if (off) b.disabled = true; return b; }
    tb.appendChild(h("span", { class: "aks-sep", "aria-hidden": "true" }, []));
    tb.appendChild(btn(I.plus, "Add " + nm, function () {
      var n = listOp(box, it, "add"); if (!n) return;
      var im = kind === "i" ? n.querySelector("img") : null;
      if (im) { pickImage(im, keyOf(im)); return; }
      var t = n.querySelector('[data-aks="t"]'); if (t) selectEl(t);
    }));
    tb.appendChild(ib(y ? I.up : I.left, "Move " + nm + " earlier", function () { listOp(box, it, "prev"); }, at <= 0));
    tb.appendChild(ib(y ? I.down : I.right, "Move " + nm + " later", function () { listOp(box, it, "next"); }, at >= all.length - 1));
    tb.appendChild(ib(I.trash, "Remove " + nm, function () { listOp(box, it, "remove"); }, all.length < 2));
  }
  /* add (copy after) · remove · move one item; every edit inside the list follows its item */
  function listOp(box, it, kind) {
    deselect();
    tagList(box, document);
    var d = pd(), ck = keyOf(box), name = box.getAttribute("data-ak-list") || "item";
    var ids = listItems(box).map(function (c) { return c.getAttribute("data-ak-li"); });
    var id = it.getAttribute("data-ak-li"), at = ids.indexOf(id), next = ids.slice(), nid = null, recs = [];
    if (at < 0) return null;
    BKS.forEach(function (b) {
      var set = d[b]; if (!set) return;
      Object.keys(set).forEach(function (k) {
        var el = resolve(k), it2 = el && itemIn(el, box);
        if (!it2) return;
        recs.push({ b: b, k: k, id: it2.getAttribute("data-ak-li"), rel: relPath(el, it2), v: set[k] });
      });
    });
    Object.keys(d.list || {}).forEach(function (k) {
      if (k === ck) return;
      var el = resolve(k), it2 = el && itemIn(el, box);
      if (!it2) return;
      recs.push({ b: "list", k: k, id: it2.getAttribute("data-ak-li"), rel: relPath(el, it2), v: d.list[k] });
    });
    if (kind === "add") {
      var base = id.split(".")[0], c = 1;
      while (ids.indexOf(base + "." + c) >= 0) c++;
      nid = base + "." + c; next.splice(at + 1, 0, nid);
      recs.filter(function (r) { return r.id === id; }).forEach(function (r) { recs.push({ b: r.b, id: nid, rel: r.rel, v: r.v }); });
    } else if (kind === "remove") {
      if (ids.length < 2) { toast("Keep at least one " + name); return null; }
      next.splice(at, 1);
    } else {
      var j = at + (kind === "prev" ? -1 : 1);
      if (j < 0 || j >= ids.length) return null;
      next.splice(at, 1); next.splice(j, 0, id);
    }
    if (!BATCH) UNDO.push({ page: PAGE, snap: clone(DATA[PAGE] || {}) });
    recs.forEach(function (r) { if (r.k) delete d[r.b][r.k]; });
    var plain = next.length === box.__akP.length && next.every(function (x, i) { return x === String(i); });
    if (!d.list) d.list = {};
    if (plain) delete d.list[ck]; else d.list[ck] = next;
    arrangeList(box, next, document, true);
    recs.forEach(function (r) {
      var n = next.indexOf(r.id) < 0 ? null : box.querySelector(':scope > [data-ak-li="' + r.id + '"]'), el = n && relFind(n, r.rel);
      if (el) bucket(r.b)[keyOf(el)] = r.v;
    });
    save(); applyAll(); fireList(box);
    if (ON) { unmark(); mark(); }
    syncBar();
    toast(kind === "add" ? "Added a " + name + " \u2014 edit it, then publish" : kind === "remove" ? "Removed the " + name + " \u00b7 Undo brings it back" : "Moved");
    return nid ? box.querySelector(':scope > [data-ak-li="' + nid + '"]') : null;
  }
  function resetEl(el, key, kind) {
    loadSource().then(function () {
      if (kind === "i") {
        var o = origFor(el, key, "img"); setOv("img", key, null); if (o != null) el.setAttribute("src", o);
      } else {
        UNDO.push({ page: PAGE, snap: clone(DATA[PAGE] || {}) });
        var d = DATA[PAGE] || {}, on = origNode(el, key);
        ["text", "html"].forEach(function (b) { if (d[b]) delete d[b][key]; });
        el.removeAttribute("contenteditable");
        if (on) el.innerHTML = on.innerHTML;
        var la = el.closest ? el.closest("a") : null, lk = la && keyOf(la);
        if (lk && d.href && d.href[lk] !== undefined) { var oh = origFor(la, lk, "href"); delete d.href[lk]; if (oh != null) la.setAttribute("href", oh); }
        save(); syncBar();
      }
      el.removeAttribute("data-aks-changed");
      deselect(); toast("Reset to the published version");
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
      box.appendChild(acts([
        h("button", { class: "aks-b", onclick: close }, ["Cancel"]),
        h("button", { class: "aks-b pri", onclick: function () {
          var v = inp.value.trim();
          setOv("href", key, v || null);
          el.setAttribute("href", v);
          el.setAttribute("data-aks-changed", "");
          close(); deselect(); toast("Link updated");
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
  /* WebP only — same rule as the case-study editor: the sheet asks before anything
     is re-saved, and keeping the original format earns a reminder. */
  function compress(dataUrl, maxPx, q) {
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        var w = im.naturalWidth, ht = im.naturalHeight, s = maxPx ? Math.min(1, maxPx / Math.max(w, ht)) : 1;
        var cv = document.createElement("canvas");
        cv.width = Math.round(w * s); cv.height = Math.round(ht * s);
        var cx = cv.getContext("2d"); cx.imageSmoothingQuality = "high";
        cx.drawImage(im, 0, 0, cv.width, cv.height);
        var out, fmt = "image/webp";
        try { out = cv.toDataURL("image/webp", q); if (out.indexOf("image/webp") < 0) throw 0; }
        catch (e) { out = cv.toDataURL("image/jpeg", q); fmt = "image/jpeg"; }
        res({ url: out, w: cv.width, h: cv.height, fmt: fmt });
      };
      im.onerror = function () { res(null); };
      im.src = dataUrl;
    });
  }
  function fmtName(m) {
    return ({ "image/jpeg": "JPEG", "image/jpg": "JPEG", "image/png": "PNG", "image/gif": "GIF", "image/webp": "WebP",
      "image/svg+xml": "SVG", "image/avif": "AVIF", "image/heic": "HEIC", "image/heif": "HEIC" })[m]
      || String(m || "").replace("image/", "").toUpperCase() || "this file";
  }
  /* animated GIF / WebP: sniffed first, so the still-photo path never flattens an animation */
  var ANIM_SRC = "anim-webp.js?v=1", _anim = null;
  function loadAnim() {
    if (window.AK_ANIM) return Promise.resolve(window.AK_ANIM);
    if (_anim) return _anim;
    return (_anim = new Promise(function (res, rej) {
      var s = h("script", { src: ANIM_SRC });
      s.onload = function () { window.AK_ANIM ? res(window.AK_ANIM) : rej(new Error("no AK_ANIM")); };
      s.onerror = function () { _anim = null; s.remove(); rej(new Error("anim-webp.js didn't load")); };
      document.head.appendChild(s);
    }));
  }
  /* GIF → MP4 for the About · Interests clips (gif-mp4.js + vendored mp4-muxer.js, both on demand) */
  var MP4_SRC = "gif-mp4.js?v=1", _mp4 = null;
  function loadMp4() {
    if (window.AK_MP4) return Promise.resolve(window.AK_MP4);
    if (_mp4) return _mp4;
    return (_mp4 = new Promise(function (res, rej) {
      var s = h("script", { src: MP4_SRC });
      s.onload = function () { window.AK_MP4 ? res(window.AK_MP4) : rej(new Error("no AK_MP4")); };
      s.onerror = function () { _mp4 = null; s.remove(); rej(new Error("gif-mp4.js didn't load")); };
      document.head.appendChild(s);
    }));
  }
  /* an img that floats a clip: About · Interests word images (they carry data-mp4) */
  var CLIP_PH = "media/home/about-mp4-loading.svg?v=3";   // shared black "Loading" thumb + poster for every MP4 clip (no per-clip still)
  function isClipImg(el) { return !!(el && el.tagName === "IMG" && (el.hasAttribute("data-mp4") || (el.closest && el.closest(".int-cats .gif")))); }
  function blobURL(b) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(b); }); }
  function imgSize(url) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res({ w: im.naturalWidth, h: im.naturalHeight }); }; im.onerror = function () { res({ w: 0, h: 0 }); }; im.src = url; }); }
  /* the one Convert-to-WebP / Keep-original sheet — resolves {url, fmt} or null (cancelled) */
  function askImage(f, ctx) {
    ctx = ctx || {};
    if (!/^image\/(gif|webp)$/i.test(f.type || "")) return askStill(f);
    return Promise.all([loadAnim(), f.arrayBuffer(), ctx.clip ? loadMp4().then(function (M) { return M.canConvert().then(function (ok) { return ok ? M : null; }); }, function () { return null; }) : null]).then(function (r) {
      var A = r[0], ab = r[1];
      if (!A.isAnimated(ab)) return askStill(f);
      if (/webp/i.test(f.type)) return readDataURL(f).then(function (u) { return { url: u, fmt: "image/webp", anim: true }; });
      return askAnimated(f, A, ab, ctx.clip ? { M: r[2] } : null);
    }, function () { return askStill(f); });
  }
  function askAnimated(f, A, ab, clip) {
    var gif = new Blob([A.loopGif(ab)], { type: "image/gif" });
    return blobURL(gif).then(function (orig) {
      return imgSize(orig).then(function (sz) {
        return new Promise(function (done) {
          var picked = null, busy = false, long = Math.max(sz.w, sz.h) || 1, frames = A.frameCount(ab), can = A.canConvert();
          var hd = Math.min(2, 2000 / long), M = clip && clip.M;
          sheet(function (box, close) {
            box.appendChild(h("h3", {}, ["Animated GIF"]));
            box.appendChild(h("img", { class: "aks-prev", src: orig, alt: "" }));
            box.appendChild(h("div", { class: "sub" }, [f.name + " · " + kb(f.size) + " · " + sz.w + "×" + sz.h + " · " + frames + " frames"]));
            box.appendChild(h("div", { class: "sub" }, [clip
              ? (M ? "Plays on a loop. An MP4 clip looks the same at this size and is usually ~90% lighter than the GIF — or keep the original."
                   : "⚠ Converting to MP4 needs desktop Chrome or Edge. Keeping the GIF works everywhere and loops.")
              : can
              ? "Plays on a loop. Animated WebP is sharper and usually much lighter than GIF."
              : "⚠ Converting needs desktop Chrome or Edge. Keeping the GIF works everywhere and loops."]));
            var msg = h("div", { class: "sub", style: "color:var(--accent-ink,var(--accent))" }, [""]), opts = [];
            function convert(scale, label) {
              if (busy) return; busy = true;
              opts.forEach(function (b) { b.disabled = true; b.style.opacity = ".5"; });
              msg.textContent = "Converting · frame 0 / " + frames;
              A.toWebp(gif, { scale: scale, q: 0.92, onProgress: function (i, n) { msg.textContent = "Converting · frame " + i + " / " + n; } })
                .then(function (out) {
                  return blobURL(out.blob).then(function (u) {
                    picked = { url: u, fmt: "image/webp", anim: true, note: label + " · " + out.w + "×" + out.h + " · " + kb(out.blob.size) + " (GIF " + kb(f.size) + ")" };
                    busy = false; close();
                  });
                }, function (e) {
                  busy = false; msg.textContent = "⚠ Couldn't convert (" + ((e && e.message) || "error") + "). Keep the GIF instead.";
                  opts.forEach(function (b) { b.disabled = false; b.style.opacity = ""; });
                });
            }
            function toMp4() {
              if (busy) return; busy = true;
              opts.forEach(function (b) { b.disabled = true; b.style.opacity = ".5"; });
              msg.textContent = "Making the MP4 · frame 0 / " + frames;
              M.fromGif(gif, { onProgress: function (i, n, pass) { msg.textContent = (pass ? "Squeezing a little more · " : "Making the MP4 · frame ") + (pass ? "" : i + " / " + n); } })
                .then(function (out) {
                  return blobURL(out.mp4).then(function (m) {
                    picked = { url: CLIP_PH, fmt: "video/mp4", anim: true, mp4: m,
                      note: "MP4 clip · " + out.w + "×" + out.h + " · " + kb(out.mp4.size) + " (GIF " + kb(f.size) + ", " + Math.max(0, Math.round((1 - out.mp4.size / f.size) * 100)) + "% lighter)" };
                    busy = false; close();
                  });
                }, function (e) {
                  busy = false; msg.textContent = "⚠ Couldn't make the MP4 (" + ((e && e.message) || "error") + "). Keep the GIF instead.";
                  opts.forEach(function (b) { b.disabled = false; b.style.opacity = ""; });
                });
            }
            function opt(big, sm, tag, fn) { var b = h("button", { class: "aks-opt", onclick: fn }, [h("div", {}, [h("div", { class: "big" }, [big]), h("div", { class: "sm" }, [sm])]), h("span", { class: "tag" }, [tag])]); opts.push(b); box.appendChild(b); }
            if (M) opt("MP4 clip · recommended", sz.w + "×" + sz.h + " · every frame and its timing · loops · ~90% lighter", "MP4", toMp4);
            if (!clip && can && hd > 1.2) opt("Animated WebP · High-res", Math.round(sz.w * hd) + "×" + Math.round(sz.h * hd) + " · upscaled " + hd.toFixed(1).replace(/\.0$/, "") + "× · loops", "HD", function () { convert(hd, "High-res WebP"); });
            if (!clip && can) opt("Animated WebP", sz.w + "×" + sz.h + " · full resolution · loops", "WebP", function () { convert(1, "Animated WebP"); });
            opt(clip ? "Keep original GIF" : "Keep GIF", "Exactly as uploaded · set to loop forever", kb(gif.size), function () { if (busy) return; picked = { url: orig, fmt: "image/gif", anim: true }; close(); });
            box.appendChild(msg);
            box.appendChild(acts([h("button", { class: "aks-b", onclick: function () { if (!busy) close(); } }, ["Cancel"])]));
          }, false, function () { done(picked); });
        });
      });
    });
  }
  function askStill(f) {
    return readDataURL(f).then(function (orig) {
        var srcFmt = f.type || String(orig).slice(5).split(";")[0];
        var wasWebp = srcFmt === "image/webp";
        return (wasWebp ? Promise.resolve(null) : compress(orig, 0, 0.95)).then(function (small) {
          return new Promise(function (done) {
          var picked = null;
          function apply(url, fmt) { picked = { url: url, fmt: fmt }; }
          sheet(function (box, close) {
            box.appendChild(h("h3", {}, ["Use this photo?"]));
            box.appendChild(h("img", { class: "aks-prev", src: (small && small.url) || orig, alt: "" }));
            box.appendChild(h("div", { class: "sub" }, [f.name + " · " + kb(f.size) + " · " + fmtName(srcFmt)]));
            if (!wasWebp) box.appendChild(h("div", { class: "sub", style: "color:var(--accent)" }, [
              small && small.fmt === "image/webp"
                ? "⚠ This site uses WebP only — optimising converts this " + fmtName(srcFmt) + " for you."
                : "⚠ This site uses WebP only, and this browser cannot write WebP. Re-upload in Chrome or Edge."
            ]));
            if (small) box.appendChild(h("button", { class: "aks-opt", onclick: function () { apply(small.url, small.fmt); close(); } }, [
              h("div", {}, [h("div", { class: "big" }, ["Convert to WebP"]), h("div", { class: "sm" }, [small.w + "×" + small.h + " · " + fmtName(small.fmt) + " · full resolution"])]),
              h("span", { class: "tag" }, [kb(dataBytes(small.url))])
            ]));
            box.appendChild(h("button", { class: "aks-opt", onclick: function () { apply(orig, srcFmt); close(); } }, [
              h("div", {}, [h("div", { class: "big" }, ["Keep original"]), h("div", { class: "sm" }, [wasWebp ? "Exactly as uploaded" : "Exactly as uploaded · stays " + fmtName(srcFmt)])]),
              h("span", { class: "tag" }, [kb(f.size)])
            ]));
            box.appendChild(acts([h("button", { class: "aks-b", onclick: close }, ["Cancel"])]));
          }, false, function () { done(picked); });
          });
        });
    });
  }
  function pickImage(el, key) {
    pickFile("image/*").then(function (f) {
      if (!f) return;
      var clip = isClipImg(el);
      askImage(f, { clip: clip }).then(function (p) {
          if (p) apply(p.url, p.fmt, p);
          function apply(url, fmt, p) {
            if (clip) {
              /* one undo step: clip + the shared Loading thumb (the clip plays only while src is that thumb, so a later photo swap never plays a stale clip) */
              apiBatch(function () { apiAttr(el, { "data-mp4": p.mp4 || "", "data-still": "" }); apiImg(el, p.mp4 ? CLIP_PH : url); });
              deselect();
              toast(p.mp4 ? p.note : p.anim ? "Animation added · GIF · loops" : (fmt === "image/webp" ? "Photo replaced · WebP" : "⚠ Photo replaced — still " + fmtName(fmt) + ", not WebP"));
              return;
            }
            setOv("img", key, url);
            if (el.tagName === "IMG") { el.removeAttribute("srcset"); el.src = url; } else el.style.backgroundImage = 'url("' + url + '")';
            el.setAttribute("data-aks-changed", "");
            deselect();
            if (p && p.anim) { toast(p.note || (fmt === "image/webp" ? "Animation added · WebP · loops" : "Animation added · GIF · loops")); return; }
            toast(fmt === "image/webp" ? "Photo replaced · WebP" : "⚠ Photo replaced — still " + fmtName(fmt) + ", not WebP");
          }
      });
    });
  }

  /* --------------------------------------------------------------- gestures */
  document.addEventListener("click", function (e) {
    if (!ON) return;
    var t = e.target;
    if (t.closest && t.closest(".aks-ui")) return;
    var el = t.closest ? t.closest("[data-aks]") : null;
    if (!el) { if (sel) deselect(); return; }
    if (el === sel) return;
    e.preventDefault(); e.stopPropagation();
    selectEl(el);
  }, true);
  document.addEventListener("keydown", function (e) {
    if (!ON) return;
    if (e.key === "Escape") { if (sel && sel.getAttribute("contenteditable") === "true") { sel.innerHTML = sel.__aksBefore; sel.removeAttribute("contenteditable"); } killToolbar(); sel = null; }
    if ((e.metaKey || e.ctrlKey) && (e.key === "b" || e.key === "B") && sel && sel.getAttribute("contenteditable") === "true") { e.preventDefault(); fmt("toggle"); }
    if (e.key === "Enter" && sel && sel.getAttribute("contenteditable") === "true" && !e.shiftKey) { e.preventDefault(); commitText(); }
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !sel) { e.preventDefault(); undo(); }
  });
  window.addEventListener("scroll", function () { if (sel && tb) place(sel); }, { passive: true });
  window.addEventListener("resize", function () { if (sel && tb) place(sel); });

  function undo() {
    var u = UNDO.pop();
    if (!u) { toast("Nothing to undo"); return; }
    if (u.snap) {                                   // list change: back to the whole page as it was
      if (sel) { sel.removeAttribute("contenteditable"); killToolbar(); sel = null; }
      if (u.page === PAGE) {
        var cur = DATA[PAGE] || {};
        ["text", "html", "img", "href"].forEach(function (b) {
          Object.keys(cur[b] || {}).forEach(function (k) { if (!u.snap[b] || !eq(u.snap[b][k], cur[b][k])) restoreKey(b, k); });
        });
        Object.keys(cur.attr || {}).forEach(function (k) {
          if (u.snap.attr && eq(u.snap.attr[k], cur.attr[k])) return;
          var el = resolve(k), o = el && origNode(el, k); if (!el) return;
          Object.keys(cur.attr[k]).forEach(function (a) { var ov = o ? o.getAttribute(a) : null; if (ov == null) el.removeAttribute(a); else el.setAttribute(a, ov); });
        });
      }
      DATA[u.page] = u.snap; save();
      if (u.page === PAGE) { applyAll(true); if (ON) { unmark(); mark(); } }
      syncBar(); toast("Undone"); return;
    }
    var b = (u.bucket === "meta") ? (pd(u.page).meta = pd(u.page).meta || {}) : bucket(u.bucket, u.page);
    if (u.prev === undefined) delete b[u.key]; else b[u.key] = u.prev;
    save();
    if (u.page === PAGE) {
      var el = resolve(u.key);
      if (el) {
        if (u.bucket === "text") el.textContent = u.prev !== undefined ? u.prev : (origFor(el, u.key, "text") || el.textContent);
        if (u.bucket === "img") { var v = u.prev !== undefined ? u.prev : origFor(el, u.key, "img"); if (v) el.setAttribute("src", v); }
        if (u.bucket === "href") { var vh = u.prev !== undefined ? u.prev : originalOf(u.key, "href"); if (vh != null) el.setAttribute("href", vh); }
      }
      if (u.bucket === "order" && u.prev === undefined) {          // back to the published order
        var bx = u.key === "" ? document.body : el;
        if (bx) tagOI(bx).sort(function (a, c) { return a.getAttribute("data-ak-oi") - c.getAttribute("data-ak-oi"); }).forEach(function (c) { bx.appendChild(c); });
      }
      applyAll();
    }
    syncBar(); toast("Undone");
  }

  /* ------------------------------------------------------------------- bar */
  var bar, editBtn, undoBtn, cntEl, stEl;
  function syncBar() {
    if (undoBtn) undoBtn.disabled = !UNDO.length;
    if (editBtn) {
      editBtn.classList.toggle("on", ON);
      var el = editBtn.querySelector(".lb"), ic = editBtn.firstChild;
      if (el) el.textContent = ON ? "Done" : "Edit";
      if (ic) ic.innerHTML = ON ? I.ok : I.pen;
      editBtn.title = ON ? "Finish editing \u2014 back to preview" : "Edit this page";
      editBtn.setAttribute("aria-pressed", ON ? "true" : "false");
    }
    if (stEl) {
      stEl.setAttribute("data-st", ON ? "edit" : "on");
      stEl.lastChild.textContent = ON ? "Editing" : "Admin on";
      stEl.title = ON ? "Edit mode is on \u2014 tap any text or photo to change it" : "Admin is on \u2014 visitors don\u2019t see this bar. Tap Edit to change the page.";
    }
    document.body.classList.toggle("aks-editing", ON);
    var n = pendingCount();
    if (cntEl) cntEl.textContent = n ? String(n) : "";
    if (PN && PN.cnt) PN.cnt.textContent = n ? String(n) : "";
  }
  function buildBar() {
    editBtn = btn(I.pen, "Edit", toggleEdit);
    undoBtn = btn(I.undo, "Undo", undo);
    stEl = h("span", { class: "aks-st", "data-st": "on", role: "status" }, [h("i", { "aria-hidden": "true" }), h("span", { class: "lb" }, ["Admin on"])]);
    document.body.classList.add("ak-on");               // header cog shows the unlocked state on every page
    document.body.appendChild(h("div", { class: "aks-ui aks-frame", "aria-hidden": "true" }, [h("span", {}, ["Edit mode"])]));
    var kids = [stEl, editBtn];
    if (window.AK_CASES && window.AK_CASES.openMenu) {
      var add = btn(I.plus, "Add", function () { window.AK_CASES.openMenu(); });
      add.setAttribute("data-ak-trigger", "1");                 // admin.js keeps its menu open for this
      add.classList.add("aks-add");                              // grid only — inside a project it's "Add content" in the header
      kids.push(add);
    }
    cntEl = h("span", { class: "aks-count" });
    kids.push(undoBtn,
      h("button", { class: "aks-b pri", type: "button", title: "Admin", "aria-label": "Admin", onclick: function () { openPanel("publish"); } },
        [h("span", { html: I.panel }), h("span", { class: "lb" }, ["Admin"]), cntEl]));
    bar = h("div", { class: "aks-ui aks-bar", role: "toolbar", "aria-label": "Admin" }, kids);
    document.body.appendChild(bar);
    syncBar();
  }
  function toggleEdit() {
    ON = !ON;
    document.body.classList.toggle("aks-on", ON);
    if (ON) { loadSource().then(function () { if (ON) mark(); }); toast("Edit mode — tap any text or photo"); }
    else { deselect(); unmark(); toast("Preview — this is what visitors see"); }
    syncBar();
  }

  /* ----------------------------------------------------------------- panel */
  var TABS = [["publish", "Publish"], ["sections", "Sections"], ["theme", "Theme"], ["seo", "SEO"],
              ["links", "Links & files"], ["code", "Code & data"], ["versions", "Versions"], ["tools", "Tools"]];
  var TAB_DV = { publish: 1, seo: 1, code: 1 };                   // divider after these
  var TI = (function () {
    var o = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    return {
      publish: o + '<path d="M12 15V3"/><path d="m7 8 5-5 5 5"/><path d="M20 15v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4"/></svg>',
      sections: o + '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/></svg>',
      theme: o + '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/></svg>',
      seo: o + '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
      links: I.link,
      code: o + '<path d="m8 7-5 5 5 5"/><path d="m16 7 5 5-5 5"/></svg>',
      versions: o + '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
      tools: o + '<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-8 8-4-4 1.3-1.3a4 4 0 0 0-5-5L3 8.4 8.4 3l1.3 1.3a4 4 0 0 0 5 2z"/></svg>'
    };
  })();
  var panelEl = null, curTab = "publish", PN = null;
  function tabFn(t) {
    return ({ publish: tabPublish, sections: tabSections, theme: tabTheme, seo: tabSEO, links: tabLinks,
              code: tabCode, versions: tabVersions, tools: tabTools }[t] || tabPublish);
  }
  /* Centered popup. Re-opening while it's up only swaps the pane, so switching
     tabs animates and re-rendering the same tab keeps its scroll position. */
  function openPanel(tab) {
    curTab = tab || curTab;
    if (!panelEl) buildPanel();
    renderTab();
  }
  function buildPanel() {
    var ov = h("div", { class: "aks-ui aks-pov", onclick: function (e) { if (e.target === ov) closePanel(); } });
    var ind = h("span", { class: "aks-ind" });
    var nav = h("div", { class: "aks-nav still", role: "tablist", "aria-label": "Admin sections", onkeydown: navKey }, [h("div", { class: "aks-ey" }, ["Admin"]), ind]);
    var hd = h("div", { class: "aks-hd" });
    PN = { tabs: {}, nav: nav, ind: ind, title: h("h3", { id: "aks-ttl" }), body: h("div", { class: "aks-body" }), shown: null };
    TABS.forEach(function (t) {
      var b = h("button", { class: "aks-tab", type: "button", role: "tab", onclick: function () { openPanel(t[0]); } }, [h("span", { class: "ic", "aria-hidden": "true", html: TI[t[0]] || "" }), h("span", {}, [t[1]])]);
      if (t[0] === "publish") { PN.cnt = h("span", { class: "n" }); b.appendChild(PN.cnt); }
      PN.tabs[t[0]] = b; nav.appendChild(b);
      if (TAB_DV[t[0]]) nav.appendChild(h("div", { class: "aks-dv", "aria-hidden": "true" }));
    });
    nav.appendChild(h("div", { class: "aks-kh", "aria-hidden": "true", html: "<kbd>1</kbd>–<kbd>8</kbd> switch · <kbd>Esc</kbd> close" }));
    PN.hd = hd;
    PN.body.addEventListener("scroll", function () { hd.classList.toggle("sc", PN && PN.body.scrollTop > 2); }, { passive: true });
    ov.appendChild(h("div", { class: "aks-pop", role: "dialog", "aria-modal": "true", "aria-labelledby": "aks-ttl" }, [
      nav, hd, PN.body
    ]));
    hd.appendChild(h("div", { class: "gr" }, [PN.title, h("div", { class: "pg" }, [(PAGELABEL[PAGE] || PAGE) + " page"])]));
    hd.appendChild(h("button", { class: "aks-x", type: "button", "aria-label": "Close (Esc)", title: "Close (Esc)", onclick: closePanel, html: I.x }));
    document.body.appendChild(ov);
    panelEl = ov;
    PN.key = function (e) {
      if (document.querySelector(".aks-mov")) return;
      if (e.key === "Escape") { closePanel(); return; }
      var n = +e.key, a = document.activeElement;
      if (n >= 1 && n <= TABS.length && !e.metaKey && !e.ctrlKey && !e.altKey &&
          !(a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable))) {
        e.preventDefault(); openPanel(TABS[n - 1][0]); if (PN) PN.tabs[curTab].focus({ preventScroll: true });
      }
    };
    PN.rs = function () { moveInd(false); };
    document.addEventListener("keydown", PN.key);
    window.addEventListener("resize", PN.rs);
    setTimeout(function () { if (PN) PN.tabs[curTab].focus({ preventScroll: true }); }, 30);
  }
  function renderTab() {
    var same = PN.shown === curTab, st = PN.body.scrollTop;
    TABS.forEach(function (t) {
      var b = PN.tabs[t[0]], on = t[0] === curTab;
      b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
      if (on) PN.title.textContent = t[1];
    });
    var n = pendingCount(); PN.cnt.textContent = n ? String(n) : "";
    var pane = h("div", { class: "aks-pane" + (same ? " still" : ""), role: "tabpanel" });
    PN.body.innerHTML = ""; PN.body.appendChild(pane);
    tabFn(curTab)(pane);
    PN.body.scrollTop = same ? st : 0;
    PN.hd.classList.toggle("sc", PN.body.scrollTop > 2);
    PN.shown = curTab;
    moveInd(!same);
    if (PN.nav.classList.contains("still")) requestAnimationFrame(function () { requestAnimationFrame(function () { if (PN) PN.nav.classList.remove("still"); }); });
  }
  function moveInd(follow) {
    if (!PN) return;
    var b = PN.tabs[curTab], nav = PN.nav;
    PN.ind.style.width = b.offsetWidth + "px"; PN.ind.style.height = b.offsetHeight + "px";
    PN.ind.style.transform = "translate(" + b.offsetLeft + "px," + b.offsetTop + "px)";
    if (follow && nav.scrollWidth > nav.clientWidth + 2) {          // phones: horizontal strip — keep the active tab in view
      var l = b.offsetLeft, r = l + b.offsetWidth;
      if (l < nav.scrollLeft + 16 || r > nav.scrollLeft + nav.clientWidth - 16) nav.scrollTo({ left: l - (nav.clientWidth - b.offsetWidth) / 2, behavior: "smooth" });
    }
  }
  function navKey(e) {
    var dir = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key];
    if (!dir) return;
    e.preventDefault();
    var i = 0; TABS.forEach(function (t, j) { if (t[0] === curTab) i = j; });
    var nx = TABS[(i + dir + TABS.length) % TABS.length][0];
    openPanel(nx); if (PN) PN.tabs[nx].focus();
  }
  function closePanel() {
    if (!panelEl) return;
    var ov = panelEl; panelEl = null;
    if (PN) { document.removeEventListener("keydown", PN.key); window.removeEventListener("resize", PN.rs); PN = null; }
    ov.classList.add("out");
    setTimeout(function () { ov.remove(); }, 150);
  }
  function note(html) { return h("div", { class: "aks-note", html: html }); }

  /* -------------------------------------------------------------- sections */
  function sectionEls() {
    var list = [];
    ["body > section", "body > header", "body > footer", "main > section", "main > header", "main > footer", "body > main > div[id]"].forEach(function (sq) {
      document.querySelectorAll(sq).forEach(function (el) { if (!inChrome(el) && list.indexOf(el) < 0) list.push(el); });
    });
    return list;
  }
  function labelOf(el) { var hd = el.querySelector("h1,h2,h3"); return short((hd && hd.textContent) || el.id || el.tagName.toLowerCase(), 34); }
  function isHidden(el, key) { var v = getOv("hide", key); return v === true || (v !== false && el.hasAttribute("data-aks-baked")); }
  function toggleHide(el, key) {
    var hidden = isHidden(el, key), baked = el.hasAttribute("data-aks-baked");
    setOv("hide", key, hidden ? (baked ? false : null) : (baked ? null : true));
    if (hidden) el.removeAttribute("data-aks-hidden"); else el.setAttribute("data-aks-hidden", "");
  }
  function tabSections(box) {
    var els = sectionEls();
    if (!els.length) { box.appendChild(note("No top-level sections found on this page.")); return; }
    box.appendChild(note("Hide a section from visitors, or move it up and down. Changes apply to this page only."));
    els.forEach(function (el) {
      var key = keyOf(el), hidden = isHidden(el, key);
      var row = h("div", { class: "aks-row" }, [
        h("div", { class: "gr" }, [h("div", { class: "t" }, [labelOf(el)]), h("div", { class: "s" }, [el.tagName.toLowerCase() + (el.id ? " #" + el.id : "") + (hidden ? " · hidden" : "")])]),
        h("button", { class: "aks-ic" + (hidden ? " off" : ""), title: hidden ? "Show" : "Hide", html: hidden ? I.eyeoff : I.eye, onclick: function () { toggleHide(el, key); openPanel("sections"); } }),
        h("button", { class: "aks-ic", title: "Move up", html: I.up, onclick: function () { move(el, -1); openPanel("sections"); } }),
        h("button", { class: "aks-ic", title: "Move down", html: I.down, onclick: function () { move(el, 1); openPanel("sections"); } })
      ]);
      row.addEventListener("mouseenter", function () { el.style.outline = "2px solid var(--accent,#E5783A)"; el.style.outlineOffset = "-2px"; });
      row.addEventListener("mouseleave", function () { el.style.outline = ""; el.style.outlineOffset = ""; });
      box.appendChild(row);
    });
  }
  function move(el, dir) {
    var box = el.parentElement, ck = box === document.body ? "" : keyOf(box);
    var kids = tagOI(box), secs = sectionEls();
    var i = kids.indexOf(el), j = i + dir;
    while (j >= 0 && j < kids.length && secs.indexOf(kids[j]) < 0) j += dir;   // hop over non-sections
    if (i < 0 || j < 0 || j >= kids.length) return;
    var arr = kids.slice();
    arr.splice(i, 1); arr.splice(j, 0, el);
    arr.forEach(function (c) { box.appendChild(c); });
    setOv("order", ck, arr.map(function (c) { return +c.getAttribute("data-ak-oi"); }));
  }

  /* ----------------------------------------------------------------- theme */
  var THEME_ALL = false;
  var VARS = [["--bg", "Background"], ["--surface", "Cards / surface"], ["--line", "Borders"], ["--text", "Text"], ["--muted", "Muted text"], ["--accent", "Accent"], ["--accent-2", "Accent 2"]];
  function tabTheme(box) {
    box.appendChild(h("div", { class: "aks-row" }, [
      h("div", { class: "gr" }, [h("div", { class: "t" }, ["Apply to every page"]), h("div", { class: "s" }, [THEME_ALL ? "On \u2014 changes go to every page" : "Off \u2014 changes go to " + (PAGELABEL[PAGE] || PAGE) + " only"])]),
      h("button", { class: "aks-ic" + (THEME_ALL ? "" : " off"), html: THEME_ALL ? I.ok : I.x, onclick: function () { THEME_ALL = !THEME_ALL; openPanel("theme"); } })
    ]));
    ["dark", "light"].forEach(function (mode) {
      box.appendChild(h("div", { class: "aks-sec" }, [mode === "dark" ? "Dark mode" : "Light mode"]));
      var list = h("div", { class: "aks-sws" });
      box.appendChild(list);
      VARS.forEach(function (v) {
        var hex = toHex(((pd().vars || {})[mode] || {})[v[0]] || cssVar(v[0], mode));
        var sw = h("label", { class: "aks-sw" }, [
          h("input", { type: "color", value: hex, "aria-label": v[1] + " (" + mode + ")", oninput: function (e) { setVar(mode, v[0], e.target.value); sw.querySelector(".hx").textContent = e.target.value; } }),
          h("span", { class: "nm" }, [v[1]]),
          h("span", { class: "hx" }, [hex])
        ]);
        list.appendChild(sw);
      });
    });
    box.appendChild(h("button", { class: "aks-b aks-wide", onclick: function () {
      (THEME_ALL ? PAGES : [PAGE]).forEach(function (p) { pd(p).vars = { cleared: true }; });
      save(); applyAll(); syncBar(); openPanel("theme"); toast("Colours reset to the site default");
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
    if (m) return "#" + m[1].split(",").slice(0, 3).map(function (x) { return Math.max(0, Math.min(255, Math.round(parseFloat(x)))).toString(16).padStart(2, "0"); }).join("");
    return "#888888";
  }
  function setVar(mode, name, val) {
    (THEME_ALL ? PAGES : [PAGE]).forEach(function (p) {
      var d = pd(p);
      if (!d.vars || d.vars.cleared) d.vars = {};
      if (!d.vars[mode]) d.vars[mode] = {};
      d.vars[mode][name] = val;
    });
    save(); applyDraft(document, DATA[PAGE], true); syncBar();
  }

  /* ------------------------------------------------------------------- seo */
  function tabSEO(box) {
    box.appendChild(note("What Google and social apps show for <b>this page</b>. Saved as a draft on this device until you publish."));
    var m = pd().meta || {}, o = META0 || {};
    box.appendChild(field("Page title", m.title || o.title, function (v) { setMeta("title", v); }));
    box.appendChild(field("Description", m.description || o.description || "", function (v) { setMeta("description", v); }, true));
    box.appendChild(h("div", { class: "aks-sec" }, ["Social preview image"]));
    box.appendChild(h("img", { class: "aks-prev", src: m.image || o.image || "", alt: "", onerror: function () { this.style.display = "none"; } }));
    box.appendChild(h("button", { class: "aks-b aks-wide", onclick: function () {
      pickFile("image/*").then(function (f) {
        if (!f) return;
        readDataURL(f).then(function (d) { compress(d, 1200, 0.85).then(function (s) { setMeta("image", (s && s.url) || d); openPanel("seo"); toast("Preview image set"); }); });
      });
    } }, [h("span", { html: I.img }), h("span", {}, ["Choose image"])]));
  }
  function setMeta(k, v) {
    var d = pd(); if (!d.meta) d.meta = {};
    UNDO.push({ page: PAGE, bucket: "meta", key: k, prev: d.meta[k] });
    var o = (META0 || {})[k];
    if (v && v !== o) d.meta[k] = v; else delete d.meta[k];
    save(); applyMetaLive(); syncBar();
  }
  function field(label, val, onSave, multi) {
    var inp = h(multi ? "textarea" : "input", multi ? {} : { type: "text" });
    inp.value = val || "";
    inp.addEventListener("change", function () { onSave(inp.value.trim()); toast("Saved"); });
    return h("div", { class: "aks-f" }, [h("label", {}, [label]), inp]);
  }

  /* ------------------------------------------------------------ links/files */
  function tabLinks(box) {
    var all = Array.prototype.filter.call(document.querySelectorAll("a[href]"), function (a) { return !inChrome(a); });
    var dl = all.filter(function (a) { return a.hasAttribute("download") || /\.pdf($|[?#])/i.test(a.getAttribute("href")) || a.getAttribute("href").slice(0, 20) === "data:application/pdf"; });
    var links = all.filter(function (a) { return dl.indexOf(a) < 0; });
    if (!all.length) { box.appendChild(note("No links on this page.")); return; }
    if (dl.length) {
      box.appendChild(h("div", { class: "aks-sec" }, ["Downloads"]));
      dl.forEach(function (a) {
        var key = keyOf(a);
        box.appendChild(h("div", { class: "aks-row" }, [
          h("div", { class: "gr" }, [h("div", { class: "t" }, [short(a.textContent.trim() || "Download", 30)]), h("div", { class: "s" }, [a.getAttribute("href").slice(0, 5) === "data:" ? "New file \u00b7 ships with your next publish" : short(a.getAttribute("href"), 42)])]),
          h("button", { class: "aks-sbtn", type: "button", onclick: function () {
            pickFile("application/pdf").then(function (f) {
              if (!f) return;
              readDataURL(f).then(function (d) { setOv("href", key, d); a.setAttribute("href", d); syncBar(); openPanel("links"); toast("File replaced \u00b7 " + kb(f.size)); });
            });
          } }, ["Replace"])
        ]));
      });
    }
    if (links.length) {
      box.appendChild(h("div", { class: "aks-sec" }, ["Links"]));
      links.forEach(function (a) {
        var key = keyOf(a);
        box.appendChild(h("div", { class: "aks-row tap", onclick: function () { editLink(a, key); } }, [
          h("div", { class: "gr" }, [h("div", { class: "t" }, [short(a.textContent.trim() || a.getAttribute("aria-label") || "(icon link)", 30)]), h("div", { class: "s" }, [short(a.getAttribute("href"), 42)])]),
          h("span", { class: "aks-ic", html: I.link })
        ]));
      });
    }
  }

  /* ------------------------------------------------------------------ code
     Only the files the live site uses right now: the pages, what they load,
     what those scripts load on demand (found by reading them, never a fixed
     list), the data file and the Vercel config. Anything not found is left out.
       Edited here : this device has drafts the next publish writes into it
       Updated     : the live bytes changed since "Mark as seen"
       Old         : this tab runs an older ?v= than the live site, or a
                     library has a newer release
     code:seen   = {at: mark-as-seen time, since, files:{path:{h, v, size, hist[]}}}
                   hist = what changed and when (newest first, max 5).
     site:edit-times = when this device last changed each page / category. */
  var NPMNAME = { "three.js": "three", "pdf.js": "pdfjs-dist", "Chart.js": "chart.js", "lodash.js": "lodash", "jquery": "jquery" };
  var STLABEL = { ok: "Up to date", up: "Updated", ed: "Edited here", old: "Old", bad: "Missing", na: "Pinned", repo: "Repo only" };
  var REPO_ONLY = { "vercel.json": "Vercel reads this when it deploys but never serves it \u2014 keep the copy in your repo." };
  var CODE = null, ETIMES = null;
  function stampEdits(live) {
    var p0 = ETIMES ? Promise.resolve(ETIMES) : idbGet("site:edit-times").then(function (v) { return (ETIMES = v || {}); })["catch"](function () { return (ETIMES = {}); });
    return p0.then(function (t) {
      var sig = {}, now = Date.now(), dirty = false, scope = ["page:"];
      Object.keys(DATA || {}).forEach(function (p) { if (DATA[p] && Object.keys(DATA[p]).length) sig["page:" + p] = strHash(JSON.stringify(DATA[p])); });
      if (CASES) {
        scope.push("case:");
        CASES.forEach(function (g) { if (g.pending.length) sig["case:" + g.key] = strHash(JSON.stringify(g.pending)); });
        if (HOMEPEND.length) sig["case:home"] = strHash(JSON.stringify(HOMEPEND));
      }
      Object.keys(sig).forEach(function (k) { if (!t[k] || t[k].h !== sig[k]) { t[k] = { h: sig[k], at: (live || t[k]) ? now : null }; dirty = true; } });
      Object.keys(t).forEach(function (k) { if (!sig[k] && scope.some(function (x) { return k.indexOf(x) === 0; })) { delete t[k]; dirty = true; } });
      if (dirty) idbSet("site:edit-times", t)["catch"](function () {});
      return t;
    });
  }
  function caseLines() {
    var out = [];
    (CASES || []).forEach(function (g) { g.pending.forEach(function (p) {
      out.push(g.label + " \u00b7 " + ({ "new": "New project", removed: "Removed", edited: "Edited" }[p.state]) + " \u00b7 " + short(p.title, 26));
    }); });
    HOMEPEND.forEach(function (x) { out.push("Home \u00b7 " + x); });
    return out;
  }
  function cmpVer(a, b) {
    a = String(a).split(/[.-]/); b = String(b).split(/[.-]/);
    for (var i = 0; i < 3; i++) { var x = parseInt(a[i], 10) || 0, y = parseInt(b[i], 10) || 0; if (x !== y) return x < y ? -1 : 1; }
    return 0;
  }
  function scanLibs(text, libs) {
    [/cdnjs\.cloudflare\.com\/ajax\/libs\/([^\/"'\s]+)\/([^\/"'\s]+)\//g,
     /cdn\.jsdelivr\.net\/npm\/((?:@[^\/@"'\s]+\/)?[^\/@"'\s]+)@([^\/"'\s]+)\//g,
     /unpkg\.com\/((?:@[^\/@"'\s]+\/)?[^\/@"'\s]+)@([^\/"'\s]+)\//g].forEach(function (re) {
      var m;
      while ((m = re.exec(text))) {
        var n = NPMNAME[m[1]] || m[1], r = /^r(\d+)$/.exec(m[2]);
        if (!libs[n]) libs[n] = { name: m[1] !== n ? m[1] : n, npm: n, v: r ? "0." + r[1] + ".0" : m[2] };
      }
    });
  }
  function checkCode() {
    if (location.protocol === "file:") return Promise.reject(new Error("file"));
    var base = new URL(document.baseURI).pathname.replace(/[^\/]*$/, ""), files = {}, order = [], libs = {}, loaded = {};
    function rel(u) {
      try { var x = new URL(u, document.baseURI); if (x.origin !== location.origin || x.pathname.indexOf(base) !== 0) return null;
            return { p: decodeURIComponent(x.pathname.slice(base.length)) || "index.html", v: x.searchParams.get("v") }; } catch (e) { return null; }
    }
    function get(p) {
      return fetch(p, { cache: "no-store" }).then(function (r) {
        var ct = r.headers.get("content-type") || "";
        if (!r.ok || (!/\.html$/i.test(p) && /text\/html/i.test(ct))) return { ok: false, status: r.status };   // a rewrite to a page is not the file
        return r.text().then(function (t) { return { ok: true, t: t, lm: Date.parse(r.headers.get("last-modified") || "") || 0 }; });
      })["catch"](function () { return { ok: false }; });
    }
    function add(p, kind, v) { if (!files[p]) { files[p] = { path: p, kind: kind, v: null }; order.push(p); } if (v && !files[p].v) files[p].v = v; }
    function loads(t) {                       // local scripts/styles a script pulls in on demand
      var re = /["'`]\.?\/?([\w-]+\.(?:js|css))(?:\?[^"'`\s]*)?["'`]/g, m;
      while ((m = re.exec(t))) add(m[1], "script");
    }
    PAGES.forEach(function (p) { add(p + ".html", "page"); });
    add("portfolio-data.json", "data");
    add("vercel.json", "config"); add("robots.txt", "config");
    Array.prototype.forEach.call(document.querySelectorAll("script[src]"), function (e) { var r = rel(e.getAttribute("src")); if (r && r.v) loaded[r.p] = r.v; });
    function round(n) {
      var todo = order.filter(function (p) { return !files[p].res; });
      if (!todo.length || n > 4) return Promise.resolve();
      return Promise.all(todo.map(get)).then(function (rs) {
        rs.forEach(function (r, i) {
          var p = todo[i], f = files[p]; f.res = r;
          if (!r.ok) return;
          if (f.kind === "page") {
            scanLibs(r.t, libs);
            new DOMParser().parseFromString(r.t, "text/html").querySelectorAll("script[src],link[rel~=stylesheet][href]").forEach(function (e) {
              var x = rel(e.getAttribute("src") || e.getAttribute("href")); if (x && /\.(js|css)$/i.test(x.p)) add(x.p, "script", x.v);
            });
          } else if (/\.js$/i.test(p)) { scanLibs(r.t, libs); loads(r.t); }
        });
        return round(n + 1);
      });
    }
    return round(0).then(function () {
      order.forEach(function (p) {          // on-demand scripts get their version from whoever loads them
        var r = files[p].res, m, re = /([\w-]+\.js)\?v=(\d+)/g;
        if (r && r.ok && /\.(js|html)$/i.test(p)) while ((m = re.exec(r.t))) if (files[m[1]] && !files[m[1]].v) files[m[1]].v = m[2];
      });
      return Promise.all(Object.keys(libs).map(function (n) {
        return fetch("https://data.jsdelivr.com/v1/packages/npm/" + n + "/resolved").then(function (r) { return r.ok ? r.json() : null; })
          .then(function (j) { libs[n].latest = j && j.version; })["catch"](function () {});
      }));
    }).then(function () { return Promise.all([idbGet("code:seen"), stampEdits(false)]); }).then(function (rr) {
      var now = Date.now(), log = rr[0] && rr[0].files ? rr[0] : null, et = rr[1] || {}, fresh = !log;
      if (!log) log = { at: now, since: now, files: {} };
      if (!log.since) log.since = log.at;
      Object.keys(log.files).forEach(function (k) { var r0 = log.files[k]; if (r0.hist) r0.hist = r0.hist.filter(function (x) { return !x.added; }); });
      var edited = {}, dl = caseLines(), dAt = 0;
      diffList().forEach(function (g) { edited[g.page] = g.items; });
      Object.keys(et).forEach(function (k) { if (k.indexOf("case:") === 0 && et[k].at > dAt) dAt = et[k].at; });
      var list = [];
      order.forEach(function (p) {
        var f = files[p], r = f.res || {};
        if (!r.ok && REPO_ONLY[p]) { list.push({ path: p, kind: f.kind, ok: false, st: "repo", note: REPO_ONLY[p], hist: [] }); return; }
        if (!r.ok && f.kind !== "page") return;          // not part of the site right now
        var o = { path: p, kind: f.kind, v: f.v, ok: !!r.ok, hist: [] };
        if (!r.ok) { o.st = "bad"; o.note = r.status ? "Not on the live site (" + r.status + ")" : "Couldn't reach it"; list.push(o); return; }
        o.h = strHash(r.t); o.size = new Blob([r.t]).size; o.lm = r.lm;
        var rec = log.files[p];
        if (!rec) rec = log.files[p] = { h: o.h, v: o.v, size: o.size, hist: [] };          // first sight = silent baseline, never "added"
        else if (rec.h !== o.h) {
          rec.hist = [{ at: now, lm: o.lm, v0: rec.v, v1: o.v, s0: rec.size, s1: o.size }].concat(rec.hist || []).slice(0, 5);
          rec.h = o.h; rec.v = o.v; rec.size = o.size;
        } else { rec.v = o.v; rec.size = o.size; }
        o.hist = rec.hist || [];
        var pg = p.replace(/\.html$/i, ""), lv = loaded[p];
        if (f.kind === "page" && edited[pg]) { o.st = "ed"; o.edits = edited[pg]; o.editAt = (et["page:" + pg] || {}).at; }
        else if (f.kind === "data" && dl.length) { o.st = "ed"; o.edits = dl; o.editAt = dAt; }
        else if (lv && f.v && lv !== f.v) { o.st = "old"; o.note = "This tab runs v" + lv + " \u00b7 reload for v" + f.v; }
        else if (o.hist[0] && o.hist[0].at > log.at) o.st = "up";
        else o.st = "ok";
        list.push(o);
      });
      Object.keys(log.files).forEach(function (p) { if (!files[p]) delete log.files[p]; });
      idbSet("code:seen", log)["catch"](function () {});
      var libList = Object.keys(libs).map(function (n) {
        var l = libs[n], c = l.latest ? cmpVer(l.v, l.latest) : 1;
        l.st = c < 0 ? "old" : c === 0 ? "ok" : "na";          // latest < pinned → the name didn't map; don't claim "latest"
        return l;
      });
      return { at: now, seenAt: log.at, since: log.since, fresh: fresh, files: list, libs: libList };
    });
  }
  function markSeen() {
    return idbGet("code:seen").then(function (l) { if (l && l.files) { l.at = Date.now(); return idbSet("code:seen", l); } })["catch"](function () {});
  }
  function downloadFile(p) {
    fetch(p, { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.blob(); }).then(function (b) {
      var u = URL.createObjectURL(b), a = h("a", { href: u, download: p.split("/").pop(), "data-ak-transient": "", style: "display:none" });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    })["catch"](function () { toast("Couldn't download " + p); });
  }
  function tabCode(box) {
    var wrap = h("div", {}); box.appendChild(wrap);
    if (CODE) return drawCode(wrap, CODE);
    var st = note("Reading the site's files from the live server\u2026"); wrap.appendChild(st);
    cases().then(checkCode).then(function (c) {
      CODE = c;
      if (document.body.contains(wrap)) { wrap.innerHTML = ""; drawCode(wrap, c); }
    })["catch"](function (e) { st.textContent = e && e.message === "file" ? "Open the site over http(s) to check its files." : "Couldn't reach the live site right now."; });
  }
  function bytesDelta(a, b) { var d = b - a, x = Math.abs(d); return (d >= 0 ? "+" : "\u2212") + (x < 1024 ? x + " B" : kb(x)); }
  function histLine(x) {
    var when = (x.lm ? "" : "noticed ") + ago(x.lm || x.at);
    if (x.added) return { html: "<b>Added to the site</b> \u00b7 " + when };
    var bits = [];
    if (x.v0 && x.v1 && x.v0 !== x.v1) bits.push("<b>v" + x.v0 + " \u2192 v" + x.v1 + "</b>");
    else if (!x.v0 && x.v1) bits.push("<b>Now v" + x.v1 + "</b>");
    if (x.s0 && x.s1) bits.push((bits.length ? "" : "<b>Changed</b> \u00b7 ") + kb(x.s0) + " \u2192 " + kb(x.s1) + " (" + bytesDelta(x.s0, x.s1) + ")");
    if (!bits.length) bits.push("<b>Content changed</b>");
    bits.push(when);
    return { html: bits.join(" \u00b7 ") };
  }
  function fileRow(f, since) {
    var meta = [], last = f.hist[0];
    if (f.v) meta.push("v" + f.v);
    if (f.size) meta.push(kb(f.size));
    if (f.st === "repo") meta.push("Not served by the live site");
    else if (f.st === "ed") meta.push(f.editAt ? "Edited " + ago(f.editAt) : "Edited on this device");
    else if (f.note) meta.push(f.note);
    else if (last) meta.push((last.added ? "Added " : "Changed ") + ago(last.lm || last.at));
    else meta.push("No changes");
    var body = h("div", { class: "aks-fb" });
    if (f.st === "ed") {
      body.appendChild(h("div", { class: "when" }, [(f.editAt ? "Edited on this device " + ago(f.editAt) : "Edited on this device") + " \u00b7 ships with your next publish"]));
      var ul = h("ul", {});
      f.edits.slice(0, 20).forEach(function (t) { ul.appendChild(h("li", {}, [t])); });
      if (f.edits.length > 20) ul.appendChild(h("li", { class: "more" }, ["+ " + (f.edits.length - 20) + " more"]));
      body.appendChild(ul);
    }
    if (f.hist.length) {
      body.appendChild(h("div", { class: "lb" }, ["Changes on the live site"]));
      var hl = h("ul", {});
      f.hist.forEach(function (x) { var l = histLine(x); hl.appendChild(h("li", { html: l.html })); });
      body.appendChild(hl);
    } else if (f.st !== "ed" && f.ok && f.st !== "repo") body.appendChild(h("div", { class: "none" }, ["No changes since tracking began " + ago(since) + "."]));
    if (f.st === "bad" || f.st === "repo") body.appendChild(h("div", { class: "none" }, [f.note]));
    if (f.ok) body.appendChild(h("div", { class: "aks-fa" }, [
      h("a", { class: "aks-sbtn", href: f.path, target: "_blank", rel: "noopener" }, ["Open"]),
      h("button", { class: "aks-sbtn", type: "button", onclick: function () { downloadFile(f.path); } }, [h("span", { html: I.dl }), "Download"])
    ]));
    var d = h("details", { class: "aks-acc f" }, [h("summary", {}, [
      h("span", { class: "gr" }, [h("div", { class: "fn" }, [f.path]), h("div", { class: "fs" }, [meta.join(" \u00b7 ")])]),
      h("span", { class: "aks-pill " + f.st }, [STLABEL[f.st]]),
      h("span", { class: "ch", html: I.chev })
    ]), body]);
    return d;
  }
  function drawCode(box, c) {
    var n = { up: 0, ed: 0, old: 0, bad: 0 };
    c.files.forEach(function (f) { if (n[f.st] != null) n[f.st]++; });
    c.libs.forEach(function (l) { if (l.st === "old") n.old++; });
    var bits = [plural(c.files.length, "file")];
    if (n.up) bits.push(n.up + " updated"); if (n.ed) bits.push(n.ed + " edited here"); if (n.old) bits.push(n.old + " old"); if (n.bad) bits.push(n.bad + " missing");
    var btns = [h("button", { class: "aks-sbtn", type: "button", onclick: function () { CODE = null; openPanel("code"); } }, ["Refresh"])];
    if (n.up) btns.unshift(h("button", { class: "aks-sbtn", type: "button", onclick: function () {
      markSeen().then(function () { CODE = null; openPanel("code"); toast("Marked as seen"); });
    } }, ["Mark as seen"]));
    box.appendChild(h("div", { class: "aks-csum" }, [h("div", { class: "gr" }, [
      h("div", { class: "t" }, [bits.join(" \u00b7 ")]),
      h("div", { class: "s" }, [c.fresh ? "Only the files the site uses right now. Tracking starts now \u2014 every change from here on is logged with its date."
        : "Only the files the site uses right now \u00b7 checked " + ago(c.at) + " \u00b7 changes logged since " + ago(c.since) + "."])
    ])].concat(btns)));
    [["page", "Pages"], ["script", "Scripts & styles"], ["data", "Data"], ["config", "Site config"]].forEach(function (g) {
      var fs = c.files.filter(function (f) { return f.kind === g[0]; });
      if (!fs.length) return;
      box.appendChild(h("div", { class: "aks-sec" }, [g[1]]));
      var list = h("div", { class: "aks-list" });
      fs.forEach(function (f) { list.appendChild(fileRow(f, c.since)); });
      box.appendChild(list);
    });
    if (c.libs.length) {
      box.appendChild(h("div", { class: "aks-sec" }, ["Libraries"]));
      var ll = h("div", { class: "aks-list" });
      c.libs.forEach(function (l) {
        ll.appendChild(h("div", { class: "aks-crow" }, [
          h("a", { class: "gr", href: "https://www.npmjs.com/package/" + l.npm, target: "_blank", rel: "noopener" }, [
            h("div", { class: "t" }, [l.name]),
            h("div", { class: "s" }, ["v" + l.v + (l.st === "old" ? " \u00b7 v" + l.latest + " available" : l.st === "ok" ? " \u00b7 latest" : " \u00b7 loaded from a CDN")])
          ]),
          h("span", { class: "aks-pill " + l.st }, [STLABEL[l.st]])
        ]));
      });
      box.appendChild(ll);
    }
    box.appendChild(h("div", { class: "aks-sec" }, ["Backup"]));
    box.appendChild(h("div", { class: "aks-list" }, [h("div", { class: "aks-chk" }, [
      h("span", { class: "aks-ico", html: I.dl }),
      h("div", { class: "v" }, [h("b", {}, ["Download the full site"]), h("br"),
        "The files above plus every image they use, as one ZIP \u2014 the live site only, unpublished edits aren't in it."]),
      h("button", { class: "aks-sbtn", type: "button", onclick: function () { fullZip(c); } }, ["Download ZIP"])
    ])]));
    box.appendChild(h("div", { class: "aks-tip" }, ["Tap a file to see what changed and when. Pages and ", h("b", {}, ["portfolio-data.json"]), " change when you publish; scripts change when code is pushed to the repo."]));
  }
  function fullZip(c) {
    if (location.protocol === "file:") { toast("Open the site over http(s) to download it"); return; }
    closePanel();
    var pr = progress("Downloading the full site");
    ensurePkg().then(function (pkg) {
      return pkg.fullSite({ files: c.files.filter(function (f) { return f.ok; }).map(function (f) { return f.path; }), onProgress: pr.set });
    }).then(function (r) {
      pr.close();
      sheet(function (box, close) {
        box.appendChild(h("h3", {}, ["Full-site ZIP downloaded \u2713"]));
        box.appendChild(h("div", { class: "sub" }, [r.name + " \u00b7 " + r.sizeLabel + " \u00b7 " + plural(r.count, "file")]));
        if (r.missing.length) box.appendChild(h("div", { class: "aks-warn", html: "<b>" + plural(r.missing.length, "file") + " couldn't be downloaded</b> \u2014 listed in BACKUP.txt inside the ZIP." }));
        box.appendChild(note("Everything inside <b>Ajaykatta_Website / GitRepo</b> is exactly what the site needs \u2014 nothing extra. To restore, copy it into your repo, same folders, replacing existing files." +
          (r.keep.length ? " Keep your repo's own <b>" + r.keep.join("</b>, <b>") + "</b> \u2014 the live site doesn't serve " + (r.keep.length === 1 ? "it" : "them") + "." : "")));
        box.appendChild(note("It's a backup of the live site, not a publish \u2014 unpublished edits aren't in it."));
        box.appendChild(acts([h("button", { class: "aks-b pri", onclick: close }, ["Done"])]));
      });
    })["catch"](function () {
      pr.close();
      toast("Couldn't build the full-site ZIP \u2014 try again");
    });
  }

  /* ------------------------------------------------------------- projects
     Case studies (admin.js) live in IndexedDB as data:<category>. A category
     counts only when this device edited it (ak-local-edits:<category>) —
     exactly the rule the publish uses. */
  var SKIPKEYS = { seeded: 1, open: 1, _rev: 1, updatedAt: 1, savedAt: 1, ts: 1 };
  function loose(v) {
    if (typeof v === "string") return (v.slice(0, 5) === "data:" || /^media\//i.test(v) || /^blob:/.test(v)) ? "@f" : v.replace(/\s+/g, " ").trim();
    if (Array.isArray(v)) return v.map(loose);
    if (v && typeof v === "object") {
      var o = {};
      Object.keys(v).sort().forEach(function (k) {
        if (SKIPKEYS[k] || k.charAt(0) === "_") return;
        var x = loose(v[k]);
        if (x === "" || x == null || x === false || (Array.isArray(x) && !x.length) || (x && typeof x === "object" && !Array.isArray(x) && !Object.keys(x).length)) return;
        o[k] = x;
      });
      return o;
    }
    return v;
  }
  function hasUpload(v) { return JSON.stringify(v || null).indexOf('"data:') >= 0; }
  function countMedia(v, acc) {
    if (typeof v === "string") {
      if (v.slice(0, 5) === "data:") { acc.files++; acc.pendingFiles++; acc.bytes += dataBytes(v); }
      else if (/^media\//i.test(v)) acc.files++;
    } else if (Array.isArray(v)) v.forEach(function (x) { countMedia(x, acc); });
    else if (v && typeof v === "object") for (var k in v) countMedia(v[k], acc);
    return acc;
  }
  function projRow(it, state) {
    var m = countMedia(it, { files: 0, pendingFiles: 0, bytes: 0 });
    return { id: it.id, state: state, title: it.title || it.label || "Untitled project", tag: it.tag || (it.meta && it.meta.role) || "",
             blocks: (it.blocks || []).length, files: m.files, pendingFiles: state === "removed" ? 0 : m.pendingFiles, bytes: m.bytes };
  }
  function caseProjects(local, live, base) {
    var pItems = (live && live.items) || [];
    var lItems = (local && local.items && local.items.length) ? local.items : null;
    if (!lItems) return pItems.map(function (it) { return projRow(it || {}, "live"); });
    var byId = {}, byBase = {}, hasBase = !!(base && base.items), out = [], seen = {};
    pItems.forEach(function (it) { if (it && it.id) byId[it.id] = it; });
    ((base && base.items) || []).forEach(function (it) { if (it && it.id) byBase[it.id] = it; });
    lItems.forEach(function (it) {
      if (!it) return;
      seen[it.id] = 1;
      var pub = byId[it.id], bse = byBase[it.id], state;
      if (!pub && !bse) state = "new";
      else if (hasBase && bse) state = eq(bse, it) ? "live" : "edited";
      else state = (pub && eq(loose(pub), loose(it)) && !hasUpload(it)) ? "live" : "edited";
      out.push(projRow(it, state));
    });
    pItems.forEach(function (it) { if (it && !seen[it.id]) out.push(projRow(it, "removed")); });
    return out;
  }
  function lsJSON(k) { try { var r = lsGet(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function homeLocal(keys) {
    var o = { certs: lsJSON("ak-certs"), exp: lsJSON("ak-exp"), expMap: lsJSON("ak-exp-map"), profile: lsGet("ak-profile-photo"), covers: {} };
    keys.forEach(function (k) { var v = lsGet("ak-cover-" + k); if (v) o.covers[k] = v; });
    return o;
  }
  function homePending(local, live, base) {
    var out = [];
    function changed(name, mine, liveV, baseV) {
      if (mine == null) return;
      if (base ? eq(mine, baseV) : (!hasUpload(mine) && eq(loose(mine), loose(liveV)))) return;
      out.push(name);
    }
    live = live || {};
    changed("Certificates", local.certs, live.certs, base && base.certs);
    changed("Experience", local.exp, live.exp, base && base.exp);
    changed("Flight map", local.expMap, live.expMap, base && base.expMap);
    changed("Profile photo", local.profile, live.profile, base && base.profile);
    Object.keys(local.covers).forEach(function (k) { changed((CATLABEL[k] || k) + " cover", local.covers[k], (live.covers || {})[k], base && (base.covers || {})[k]); });
    return out;
  }
  function catKeys(live, idbk) {
    var out = [], seen = {};
    BUILTIN.concat(Object.keys(live || {}), (idbk || []).filter(function (k) { return typeof k === "string" && k.indexOf("data:") === 0; }).map(function (k) { return k.slice(5); }))
      .forEach(function (k) { if (k && k !== "home" && !seen[k]) { seen[k] = 1; out.push(k); } });
    return out;
  }
  function loadCases(live) {
    var wasLive = live;
    return Promise.all([fetchJSON("portfolio-data.json"), idbGet("case:pub-base"), idbKeys(), idbGet("media:fixes")]).then(function (r) {
      var live = r[0] || {}, keys = catKeys(live, r[2]);
      CASEBASE = (r[1] && r[1].data) || null;
      FIXN = Object.keys(r[3] || {}).length;
      return Promise.all(keys.map(function (k) { return lsGet("ak-local-edits:" + k) ? idbGet("data:" + k) : null; })).then(function (vals) {
        CASES = keys.map(function (k, i) {
          var projects = caseProjects(vals[i], live[k], CASEBASE && CASEBASE[k]);
          return { page: "project-" + k, key: k, label: CATLABEL[k] || k, projects: projects, pending: projects.filter(function (p) { return p.state !== "live"; }) };
        });
        HOMEPEND = homePending(homeLocal(keys), live.home, CASEBASE && CASEBASE.home);
        stampEdits(!!wasLive);
        syncBar();
        return CASES;
      });
    })["catch"](function () { CASES = []; return CASES; });
  }
  function cases() { return CASES ? Promise.resolve(CASES) : loadCases(); }
  document.addEventListener("ak-cases-changed", function () { CASES = null; IMGCHECK = null; CODE = null; loadCases(true); });
  function caseTotal() { var n = 0; (CASES || []).forEach(function (g) { n += g.pending.length; }); return n + HOMEPEND.length; }
  function markCasesPublished() {
    return idbKeys().then(function (ks) {
      var keys = catKeys({}, ks);
      return Promise.all(keys.map(function (k) { return lsGet("ak-local-edits:" + k) ? idbGet("data:" + k) : null; })).then(function (vals) {
        var data = { home: homeLocal(keys) };
        keys.forEach(function (k, i) { if (vals[i]) data[k] = vals[i]; });
        return idbSet("case:pub-base", { at: Date.now(), data: data });
      });
    }).then(function () { CASES = null; return loadCases(); })["catch"](function () {});
  }
  /* -------------------------------------------------------------- versions */
  function tabVersions(box) {
    box.appendChild(note("The last " + MAXV + " saved states of your page edits. Restoring changes this device only — the live site is untouched until you publish."));
    idbGet("site:versions").then(function (v) {
      v = Array.isArray(v) ? v : [];
      if (!v.length) box.appendChild(note("No versions yet."));
      v.forEach(function (s, i) {
        box.appendChild(h("div", { class: "aks-row" }, [
          h("div", { class: "gr" }, [h("div", { class: "t" }, [i === 0 ? "Latest" : ago(s.ts)]), h("div", { class: "s" }, [s.label + " · " + ago(s.ts)])]),
          h("button", { class: "aks-ic", title: "Restore", html: I.reset, onclick: function () {
            confirmBox({ title: "Restore this version?", sub: "Your current state is saved as a version first.", ok: "Restore" }).then(function (go) {
              if (go) snapshot("before restore").then(function () { DATA = JSON.parse(s.json); save().then(function () { location.reload(); }); });
            });
          } })
        ]));
      });
      box.appendChild(h("div", { class: "aks-sec" }, ["Danger zone"]));
      box.appendChild(h("button", { class: "aks-b dgr aks-wide", onclick: function () {
        confirmBox({ title: "Discard all local page edits?", sub: "Every page edit on this device since the last publish is deleted. Case studies and the live site are unaffected.", ok: "Discard everything", danger: true }).then(function (go) {
          if (!go) return;
          Promise.all([idbSet("site:content", {}), idbSet("site:published-base", null)]).then(function () {
            try { localStorage.removeItem(FLAG); } catch (e) {}
            location.reload();
          });
        });
      } }, [h("span", { html: I.trash }), h("span", {}, ["Discard all my local page edits"])]));
    });
  }

  /* --------------------------------------------------------------- publish */
  function inBase(p, b, k, v) { var s = ((PUBBASE || {})[p] || {})[b] || {}; return (k in s) && eq(s[k], v); }
  function diffList() {
    var out = [], seen = {};
    PAGES.concat(Object.keys(DATA || {})).forEach(function (p) {
      if (seen[p]) return; seen[p] = 1;
      var d = (DATA || {})[p]; if (!d) return;
      var items = [];
      BUCKETS.forEach(function (b) {
        var set = d[b[0]] || {};
        for (var k in set) {
          if (inBase(p, b[0], k, set[k])) continue;
          var v = set[k];
          items.push(b[1] + " · " + (b[0] === "text" || b[0] === "html" ? '"' + short(String(v).replace(/<[^>]+>/g, ""), 40) + '"' :
            b[0] === "img" ? "new photo" : b[0] === "href" ? (String(v).slice(0, 5) === "data:" ? "new file" : short(String(v), 34)) :
            b[0] === "hide" ? (v ? "hidden" : "shown again") : b[0] === "order" ? "section order" : b[0] === "list" ? "added, removed or moved" : "changed"));
        }
      });
      var bm = ((PUBBASE || {})[p] || {}).meta || {};
      if (d.meta) for (var mk in d.meta) if (!eq(bm[mk], d.meta[mk])) items.push("SEO · " + mk);
      var bv = ((PUBBASE || {})[p] || {}).vars || {};
      if (d.vars && d.vars.cleared) { if (!bv.cleared) items.push("Theme · colours reset"); }
      else if (d.vars) ["dark", "light"].forEach(function (mode) {
        var set = d.vars[mode] || {}, bs = bv[mode] || {};
        for (var vk in set) if (!eq(bs[vk], set[vk])) items.push("Theme · " + vk.replace(/^--/, "") + " (" + mode + ")");
      });
      if (items.length) out.push({ page: p, items: items });
    });
    return out;
  }
  function pendingCount() { var n = 0; diffList().forEach(function (g) { n += g.items.length; }); return n + caseTotal() + FIXN; }

  var IMGCHECK = null;   // cached verdict for this session: {html, st}
  function imageCheck(el, row) {
    function say(html, st, pct) {
      el.innerHTML = html;
      if (row) { row.setAttribute("data-s", st); row.style.setProperty("--p", pct || 0); }
    }
    if (IMGCHECK) return say(IMGCHECK.html, IMGCHECK.st);
    say("Checking image sizes\u2026", "busy", 0);
    ensurePkg().then(function (pkg) {
      var O = pkg.optimiser;
      return O.index().then(function (ix) {
        if (!ix.all.length) return (IMGCHECK = { html: "No images to check yet.", st: "ok" });
        var n = 0;
        return O.measure(ix.all, function () { n++; if (document.body.contains(el)) say("Checking image " + n + " of " + ix.all.length + "\u2026", "busy", n / ix.all.length * 100); }).then(function () {
          var s = O.stat(ix.all);
          return (IMGCHECK = s.over
            ? { html: "<b>" + s.over + " of " + s.total + " images are oversized</b> \u2014 optimise them so case studies open fast. The fixes ship with this publish.", st: "warn" }
            : { html: "<b>All " + s.total + " images are the right size</b>" + (s.notWebp ? " \u00b7 " + s.notWebp + " aren't WebP yet" : ""), st: s.notWebp ? "warn" : "ok" });
        });
      });
    }).then(function (v) { if (v) say(v.html, v.st); })["catch"](function () { say("Couldn't check image sizes right now.", "warn"); });
  }
  function tabPublish(box) {
    box.appendChild(note("Checking what has changed\u2026"));
    cases().then(function () { box.innerHTML = ""; drawPublish(box); });
  }
  function diffBlock(title, lines) {
    var blk = h("div", { class: "aks-diff" }, [h("div", { class: "hd" }, [title])]);
    lines.slice(0, 12).forEach(function (t) { blk.appendChild(h("div", { class: "it" }, [t])); });
    if (lines.length > 12) blk.appendChild(h("div", { class: "it" }, ["+ " + (lines.length - 12) + " more"]));
    return blk;
  }
  function accordion(title, count, lines, open, icon) {
    var body = h("ul", {});
    lines.slice(0, 30).forEach(function (t) { body.appendChild(h("li", {}, [t])); });
    if (lines.length > 30) body.appendChild(h("li", { class: "more" }, ["+ " + (lines.length - 30) + " more"]));
    var d = h("details", { class: "aks-acc" }, [h("summary", {}, [
      icon ? h("span", { class: "aks-ico", html: icon }) : null,
      h("span", { class: "tt" }, [title]),
      count != null ? h("span", { class: "c" }, [String(count)]) : null,
      h("span", { class: "ch", html: I.chev })
    ]), body]);
    if (open) d.open = true;
    return d;
  }
  function countUp(el, n) {
    el.textContent = String(n);
    if (n < 2 || (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches)) return;
    var t0 = performance.now(), dur = Math.min(700, 260 + n * 30);
    el.textContent = "0";
    requestAnimationFrame(function step(t) {
      var p = Math.min(1, (t - t0) / dur);
      el.textContent = String(Math.round(n * (1 - Math.pow(1 - p, 3))));
      if (p < 1 && document.body.contains(el)) requestAnimationFrame(step);
    });
    setTimeout(function () { el.textContent = String(n); }, dur + 120);   // a background tab may never get a frame
  }
  function markLive() {
    confirmBox({ title: "Mark every project as live?", sub: "Use this if these projects are already on the live site \u2014 published from another device, or pushed by hand. It only clears this list.", ok: "Mark as live" }).then(function (go) {
      if (go) markCasesPublished().then(function () { openPanel("publish"); toast("Projects marked as live"); });
    });
  }
  /* Re-reads everything the Publish tab is built from — the live page + portfolio-data.json
     (no-store), drafts and the publish snapshot in IndexedDB, optimiser fixes — so edits made
     in another tab, or a push that just went live, show up without reloading the page. */
  function refreshPublish(btn) {
    if (btn) btn.classList.add("busy");
    SRC = null; SRCTEXT = null; CASES = null; IMGCHECK = null; CODE = null;
    Promise.all([idbGet("site:content"), idbGet("site:published-base"), loadSource()]).then(function (r) {
      var local = r[0], pb = r[1];
      if (pb && pb.data) { PUBBASE = pb.data; PUBAT = pb.at || 0; PUBPAGES = pb.pages || {}; }
      DATA = (lsGet(FLAG) && local && typeof local === "object") ? local : {};
      rebase();
      return loadCases();
    }).then(function () {
      syncBar();
      if (PN && curTab === "publish") renderTab();
      toast(pendingCount() ? "Refreshed \u00b7 " + plural(pendingCount(), "change") + " ready" : "Refreshed \u00b7 in sync with the live site");
    })["catch"](function () {
      if (btn) btn.classList.remove("busy");
      toast("Couldn't refresh \u2014 check your connection");
    });
  }
  function drawPublish(box) {
    var d = diffList(), total = pendingCount(), groups = [];
    if (PN && PN.cnt) PN.cnt.textContent = total ? String(total) : "";
    d.forEach(function (g) { groups.push({ t: (PAGELABEL[g.page] || g.page) + " page", ic: I.file, lines: g.items }); });
    (CASES || []).forEach(function (g) {
      if (!g.pending.length) return;
      groups.push({ t: g.label + " projects", ic: I.grid, lines: g.pending.map(function (p) {
        return ({ "new": "New project", removed: "Removed", edited: "Edited" }[p.state]) + " \u00b7 " + short(p.title, 26) +
          (p.pendingFiles ? " \u00b7 " + plural(p.pendingFiles, "file") + " (" + kb(p.bytes) + ")" : "");
      }) });
    });
    if (HOMEPEND.length) groups.push({ t: "Home photos & certificates", ic: I.img, lines: HOMEPEND });
    if (FIXN) groups.push({ t: "Optimised images", ic: I.img, n: FIXN, lines: [plural(FIXN, "published image") + " re-saved smaller \u2014 ships with this publish"] });

    var sum = h("div", { class: "aks-sum" + (total ? "" : " live") });
    sum.appendChild(h("div", { class: "top" }, [
      h("span", { class: "aks-chip" + (total ? "" : " live") }, [h("i"), total ? "Draft \u00b7 saved on this device" : "In sync with the live site"]),
      h("div", { class: "aks-rf" }, [
        PUBAT ? h("span", { class: "lp" }, ["Last publish " + ago(PUBAT)]) : null,
        h("button", { class: "aks-sbtn aks-rfb", type: "button", title: "Re-read the live site and this device's drafts", onclick: function (e) { refreshPublish(e.currentTarget); } },
          [h("span", { html: I.refresh }), h("span", {}, ["Refresh"])])
      ])
    ]));
    if (total) {
      var num = h("span", { class: "num" });
      sum.appendChild(h("div", { class: "big" }, [num, h("span", { class: "lb" }, [h("b", {}, [total === 1 ? "change ready" : "changes ready"]), "The live site is untouched until you publish."])]));
      countUp(num, total);
    } else {
      sum.appendChild(h("div", { class: "big" }, [h("span", { class: "ok", html: I.ok }), h("span", { class: "lb" }, [h("b", {}, ["Everything is live"]),
        PUBAT ? "If your last ZIP isn't pushed yet, push it to go live." : "This device matches the live site."])]));
    }
    box.appendChild(sum);

    if (groups.length) {
      box.appendChild(h("div", { class: "aks-sec" }, ["What's changing"]));
      var list = h("div", { class: "aks-list" });
      groups.forEach(function (g) { list.appendChild(accordion(g.t, g.n || g.lines.length, g.lines, groups.length === 1, g.ic)); });
      box.appendChild(list);
      if (d.length) box.appendChild(h("div", { class: "aks-tip" }, ["To undo one change, tap it on the page and choose ", h("b", {}, ["Reset"]), "."]));
      var more = [];
      if (d.length) more.push(h("button", { class: "aks-lnk", type: "button", onclick: function () { openPanel("versions"); } }, ["Discard all page edits"]));
      if (caseTotal()) more.push(h("button", { class: "aks-lnk", type: "button", onclick: markLive }, ["Projects already live? Mark them"]));
      if (more.length) box.appendChild(h("div", { class: "aks-more" }, more));
    }

    box.appendChild(h("div", { class: "aks-sec" }, ["Before you publish"]));
    var imgV = h("div", { class: "v" });
    var chk = h("div", { class: "aks-chk", "data-s": "busy" }, [h("span", { class: "aks-ico", html: I.img }), imgV,
      h("button", { class: "aks-sbtn", type: "button", onclick: openOptimiser }, ["Optimise"])]);
    box.appendChild(h("div", { class: "aks-list" }, [chk]));
    imageCheck(imgV, chk);

    box.appendChild(h("div", { class: "aks-sec" }, ["How it goes live"]));
    var steps = h("ol", { class: "aks-steps" });
    [["Publish", "Downloads one small ZIP"], ["Copy", "The GitRepo folder into your repo"], ["Push", "Vercel is live in about a minute"]].forEach(function (x, i) {
      steps.appendChild(h("li", i === 0 && total ? { class: "on" } : {}, [h("span", { class: "n" }, [String(i + 1)]), h("b", {}, [x[0]]), h("span", { class: "d" }, [x[1]])]));
    });
    box.appendChild(steps);

    box.appendChild(h("div", { class: "aks-go" }, [
      h("button", { class: "aks-pub" + (total ? "" : " ghost"), type: "button", onclick: doPublish },
        [h("span", {}, [total ? "Publish " + plural(total, "change") : "Re-check against the live site"]), h("span", { class: "ar", html: I.up2 })]),
      h("div", { class: "sm" }, ["Asks for your password, then downloads the ZIP."])
    ]));
  }
  function doPublish() {
    askPassword("Re-enter your admin password to publish.").then(function (ok) {
      if (!ok) return;
      if (location.protocol === "file:") { toast("Open the site over http(s) to publish"); return; }
      snapshot("publish");
      closePanel();
      var pr = progress("Publishing your changes");
      ensurePkg().then(function (pkg) {
        return pkg.publish({ siteContent: clone(DATA), onProgress: pr.set });
      }).then(function (r) {
        pr.close();
        markPublished(r);
        if (r.empty) {
          sheet(function (box, close) {
            box.appendChild(h("h3", {}, ["Nothing to publish"]));
            box.appendChild(h("div", { class: "sub" }, ["The live site already has everything on this device."]));
            box.appendChild(acts([h("button", { class: "aks-b pri", onclick: close }, ["Done"])]));
          });
          return;
        }
        sheet(function (box, close) {
          var n = r.notes || {};
          box.appendChild(h("h3", {}, ["Your publish ZIP is downloaded \u2713"]));
          box.appendChild(h("div", { class: "sub" }, [r.name + " \u00b7 " + r.sizeLabel + " \u00b7 " + plural(r.count, "file")]));
          box.appendChild(diffBlock("In this ZIP", r.changed));
          if (n.missing && n.missing.length) box.appendChild(h("div", { class: "aks-warn", html: "<b>\u26A0 " + plural(n.missing.length, "file") + " could not be packed</b> \u2014 re-upload: " + n.missing.slice(0, 4).join(", ") + (n.missing.length > 4 ? " +" + (n.missing.length - 4) + " more" : "") }));
          if (n.failed && n.failed.length) box.appendChild(h("div", { class: "aks-warn", html: "<b>\u26A0 Couldn't write your edits into " + n.failed.join(", ") + ".</b> That page was left out of the ZIP." }));
          if (n.skipped && n.skipped.length) box.appendChild(h("div", { class: "aks-warn", html: "<b>" + plural(n.skipped.length, "page edit") + " no longer match anything on the page</b> and were skipped. Details in WHAT-CHANGED.txt." }));
          if (n.orphaned && n.orphaned.length) box.appendChild(note(plural(n.orphaned.length, "file") + " in the repo are no longer used \u2014 listed in WHAT-CHANGED.txt, safe to delete after you push."));
          box.appendChild(note("1 \u00b7 Unzip it.<br>2 \u00b7 Copy everything inside <b>Ajaykatta_Website / GitRepo</b> into your repo, same folders, replacing existing files.<br>3 \u00b7 Push to GitHub \u2014 Vercel redeploys automatically."));
          box.appendChild(acts([h("button", { class: "aks-b pri", onclick: close }, ["Done"])]));
        });
      })["catch"](function (e) {
        pr.close();
        sheet(function (box, close) {
          box.appendChild(h("h3", {}, ["Couldn't publish"]));
          box.appendChild(h("div", { class: "sub" }, [(e && e.message) || "Something went wrong while packaging. Nothing was changed \u2014 try again."]));
          box.appendChild(acts([h("button", { class: "aks-b pri", onclick: close }, ["Close"])]));
        });
      });
    });
  }
  /* the downloaded state becomes the new baseline; pages carry a hash of the HTML
     we wrote, so once that HTML is live the matching edits can retire (rebase) */
  function markPublished(r) {
    PUBBASE = clone(DATA); PUBAT = Date.now();
    PUBPAGES = (r && r.pageHashes) || {};
    idbSet("site:published-base", { at: PUBAT, data: PUBBASE, pages: PUBPAGES })["catch"](function () {});
    if (r && r.fixes && r.fixes.length && window.AK_PACKAGE) window.AK_PACKAGE.clearFixes(r.fixes);
    IMGCHECK = null;
    markCasesPublished();
    flagChanged(); syncBar();
  }
  function rebase() {
    var want = PUBPAGES && PUBPAGES[PAGE];
    if (!want || !SRCTEXT || strHash(SRCTEXT) !== want) return;
    var d = DATA[PAGE], b = (PUBBASE || {})[PAGE];
    if (d && b) {
      BKS.concat(["order", "list"]).forEach(function (bk) {
        var s = d[bk], o = b[bk]; if (!s || !o) return;
        Object.keys(s).forEach(function (k) { if ((k in o) && eq(s[k], o[k])) delete s[k]; });
        if (!Object.keys(s).length) delete d[bk];
      });
      if (d.meta && b.meta) { Object.keys(d.meta).forEach(function (k) { if (eq(d.meta[k], b.meta[k])) delete d.meta[k]; }); if (!Object.keys(d.meta).length) delete d.meta; }
      if (d.vars && b.vars && eq(d.vars, b.vars)) delete d.vars;
      if (!Object.keys(d).length) delete DATA[PAGE];
    }
    delete PUBPAGES[PAGE]; if (PUBBASE) delete PUBBASE[PAGE];
    idbSet("site:published-base", { at: PUBAT, data: PUBBASE, pages: PUBPAGES })["catch"](function () {});
    save(true);
  }

  /* ----------------------------------------------------------------- tools */
  function tabTools(box) {
    function row(icon, title, sub, fn, danger) {
      return h("div", { class: "aks-row tap", onclick: fn }, [
        h("span", { class: "aks-ic" + (danger ? " off" : ""), html: icon }),
        h("div", { class: "gr" }, [h("div", { class: "t" }, [title]), h("div", { class: "s" }, [sub])])
      ]);
    }
    box.appendChild(h("div", { class: "aks-sec" }, ["Backup"]));
    box.appendChild(row(I.file, "Restore case studies from a file", "Loads a portfolio-data.json into this device's working copy", importBackup));
    box.appendChild(h("div", { class: "aks-sec" }, ["Account"]));
    box.appendChild(row(I.lock, "Change password", "Works here at once; prints the line that makes it site-wide", changePassword));
    box.appendChild(row(I.out, "Log out", "Leave admin mode \u2014 your drafts stay saved on this device", lock, true));
  }
  function openOptimiser() {
    closePanel();
    sheet(function (box, close) {
      var status = h("div", { class: "sub" }, ["Reading your images\u2026"]), rows = h("div", {}), log = h("div", {});
      box.appendChild(h("h3", {}, ["Optimise images"]));
      box.appendChild(status); box.appendChild(rows); box.appendChild(log);
      box.appendChild(note("Anything wider or taller than 2560px is re-saved at 2560px as WebP \u2014 same visible quality, a fraction of the weight. Published files ship with your next <b>Publish</b>; uploads still on this device are fixed in place."));
      box.appendChild(acts([h("button", { class: "aks-b", onclick: close }, ["Close"])]));
      ensurePkg().then(function (pkg) {
        var O = pkg.optimiser;
        return O.index().then(function (ix) {
          if (!ix.all.length) { status.textContent = "No images to check yet."; return; }
          var rowFor = {};
          function mk(g) {
            var v = h("span", { class: "v" }, ["\u2026"]);
            var b = h("button", { class: "aks-b pri", style: "display:none;height:34px;padding:0 12px;font-size:.74rem", onclick: function () { run(g); } }, ["Optimise"]);
            rowFor[g.key] = { v: v, b: b, g: g };
            return h("div", { class: "aks-row", style: g.kind === "item" ? "margin-left:14px" : "" }, [h("div", { class: "gr" }, [h("div", { class: "t" }, [g.label])]), v, b]);
          }
          rows.appendChild(h("div", { class: "aks-sec" }, ["What to optimise"]));
          rows.appendChild(mk({ key: "all", label: "Everything", kind: "all", paths: ix.all }));
          ix.groups.forEach(function (g) { rows.appendChild(mk(g)); });
          function paint() {
            Object.keys(rowFor).forEach(function (k) {
              var e = rowFor[k], s = O.stat(e.g.paths);
              if (s.known < s.total) { e.v.textContent = s.known + " / " + s.total; return; }
              e.b.style.display = s.over ? "" : "none";
              e.v.textContent = s.over ? s.over + " of " + s.total + " oversized \u00b7 " + kb(s.bytes)
                : (s.staged ? s.staged + " fixed \u2713" : plural(s.total, "image") + " \u00b7 all good \u2713") + (s.notWebp ? " \u00b7 " + s.notWebp + " not WebP" : "");
            });
          }
          paint();
          var n = 0;
          O.measure(ix.all, function () { n++; status.textContent = "Checking " + n + " of " + ix.all.length + "\u2026"; if (n % 4 === 0) paint(); }).then(function () {
            paint();
            var s = O.stat(ix.all);
            status.textContent = s.over ? s.over + " of " + s.total + " images are oversized \u2014 pick a scope below." : "All " + s.total + " images are the right size \u2014 nothing to do.";
            if (s.notWebp) log.appendChild(note("<b>" + plural(s.notWebp, "image") + " not WebP:</b> " + s.other.join(", ") + ". Re-upload through the editor \u2014 uploads are converted to WebP \u2014 then publish."));
          });
          function run(g) {
            var done = 0;
            log.innerHTML = "";
            var list = h("div", { class: "aks-diff" }, [h("div", { class: "hd" }, [g.label])]);
            log.appendChild(list);
            status.textContent = "Optimising\u2026";
            O.run(g.paths, function (p, r) {
              done++;
              status.textContent = "Optimised " + done + "\u2026";
              list.appendChild(h("div", { class: "it" }, [O.show(p) + " \u00b7 " + (r.blob ? r.from + " \u2192 " + r.to + " \u00b7 " + kb(r.was) + " \u2192 " + kb(r.now) : (r.fail ? "\u26A0 " + r.fail : r.skip))]));
              paint();
            }).then(function (res) {
              paint(); IMGCHECK = null;
              status.textContent = (res.staged + res.local) ? plural(res.staged + res.local, "image") + " shrunk \u00b7 " + kb(res.saved) + " lighter \u2014 they go live with your next publish." : "Nothing needed changing in " + g.label + ".";
              if (res.failed.length) log.appendChild(note(plural(res.failed.length, "file") + " couldn't be re-saved here. Try desktop Chrome or Edge, or resize to 2560px by hand and re-upload."));
              loadCases();
            });
          }
        });
      })["catch"](function () { status.textContent = "Couldn't load the optimiser \u2014 check your connection and try again."; });
    }, true);
  }
  function importBackup() {
    pickFile("application/json,.json").then(function (f) {
      if (!f) return;
      f.text().then(function (txt) {
        var obj;
        try { obj = JSON.parse(txt); } catch (e) { toast("That file isn't a valid portfolio-data.json"); return; }
        var keys = Object.keys(obj || {}).filter(function (k) { return k !== "home" && obj[k] && Array.isArray(obj[k].items); });
        if (!keys.length) { toast("No case studies found in that file"); return; }
        confirmBox({ title: "Restore " + plural(keys.length, "category") + "?", sub: keys.map(function (k) { return CATLABEL[k] || k; }).join(", ") + " on this device will be replaced by the file. Publish afterwards to make it live.", ok: "Restore", danger: true }).then(function (go) {
          if (!go) return;
          Promise.all(keys.map(function (k) { lsSet("ak-local-edits:" + k, "1"); return idbSet("data:" + k, obj[k]); })).then(function () {
            toast("Restored"); setTimeout(function () { location.reload(); }, 500);
          });
        });
      });
    });
  }
  function changePassword() {
    closePanel();
    sheet(function (box, close) {
      var f = { cur: h("input", { type: "password", autocomplete: "current-password" }), p1: h("input", { type: "password", autocomplete: "new-password" }), p2: h("input", { type: "password", autocomplete: "new-password" }) };
      var err = h("div", { class: "err" });
      box.appendChild(h("h3", {}, ["Change password"]));
      [["cur", "Current password"], ["p1", "New password"], ["p2", "Confirm new password"]].forEach(function (x) { box.appendChild(h("div", { class: "aks-f" }, [h("label", {}, [x[1]]), f[x[0]]])); });
      box.appendChild(err);
      box.appendChild(acts([
        h("button", { class: "aks-b", onclick: close }, ["Cancel"]),
        h("button", { class: "aks-b pri", onclick: function () {
          var p1 = f.p1.value, p2 = f.p2.value;
          if (!p1 || p1.length < 4) { err.textContent = "Use at least 4 characters."; return; }
          if (p1 !== p2) { err.textContent = "Passwords don't match."; return; }
          sha256(f.cur.value).then(function (cur) {
            if (cur !== storedPW()) { err.textContent = "Current password is incorrect."; return; }
            sha256(p1).then(function (nh) {
              lsSet(PW_KEY, nh);
              box.innerHTML = "";
              var line = 'var BAKED = "' + nh + '";', code = h("textarea", { class: "code", readonly: "" });
              code.value = line;
              box.appendChild(h("h3", {}, ["Password changed on this browser"]));
              box.appendChild(h("div", { class: "sub" }, ["To make it the password everywhere, replace the line starting with \u201cvar BAKED =\u201d near the top of site-edit.js with this one, then push."]));
              box.appendChild(code);
              box.appendChild(acts([
                h("button", { class: "aks-b", onclick: function () { code.select(); try { navigator.clipboard.writeText(line); } catch (e) { document.execCommand("copy"); } toast("Copied"); } }, ["Copy line"]),
                h("button", { class: "aks-b pri", onclick: close }, ["Done"])
              ]));
            });
          });
        } }, ["Update"])
      ]));
    });
  }
  function lock() { window.AK_SITE.admin.logout(); }

  /* -------------------------------------------- publish pipeline, on demand */
  var _pkg = null;
  function ensurePkg() {
    if (window.AK_PACKAGE) return Promise.resolve(window.AK_PACKAGE);
    if (_pkg) return _pkg;
    _pkg = new Promise(function (res, rej) {
      var s = h("script", { id: "ak-package-js", src: PKG_SRC });
      s.onload = function () { window.AK_PACKAGE ? res(window.AK_PACKAGE) : rej(new Error("The publish tools didn't load.")); };
      s.onerror = function () { _pkg = null; s.remove(); rej(new Error("The publish tools couldn't be downloaded \u2014 check your connection.")); };
      document.body.appendChild(s);
    });
    return _pkg;
  }

  /* ------------------------------------------------------------------ boot */
  function login() {
    injectCSS();
    if (unlocked()) return Promise.resolve(true);
    return askPassword("Enter your password to unlock admin mode.", "Admin login").then(function (ok) {
      if (!ok) {
        if (location.hash === "#edit") { try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {} }
        return false;
      }
      try { sessionStorage.setItem(SESSION, "1"); } catch (e) {}
      location.reload();          // every page script boots straight into admin mode
      return true;
    });
  }
  function start() {
    Promise.all([idbGet("site:content"), idbGet("site:published-base"), loadSource()]).then(function (r) {
      var local = r[0], pb = r[1];
      if (pb && pb.data) { PUBBASE = pb.data; PUBAT = pb.at || 0; PUBPAGES = pb.pages || {}; }
      DATA = (lsGet(FLAG) && local && typeof local === "object") ? local : {};
      rebase();
      snapMeta();
      detectBaked();
      applyAll();
      buildBar();
      loadCases();
      if (location.hash === "#edit") toggleEdit();
    });
  }
  function boot() { injectCSS(); if (unlocked()) start(); else login(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();

  window.AK_EDIT = {
    login: login,
    open: openPanel,
    toggle: toggleEdit,
    content: function () { return clone(DATA); },
    applyDraft: applyDraft,
    keys: { skip: skip, keyOf: keyOf, resolve: resolve },
    strHash: strHash,
    publish: doPublish,
    askImage: askImage,
    toast: toast,
    fmtName: fmtName,
    on: function () { return ON; },
    setText: apiText, setImg: apiImg, setAttr: apiAttr, batch: apiBatch,
    listOp: function (box, it, kind) { return listOp(box, it, kind); },
    pickFile: pickFile, readDataURL: readDataURL, icons: I
  };
})();
