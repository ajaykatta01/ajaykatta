/* ============================================================================
   Ajay Katta Portfolio — SITE CONTENT RUNTIME  (visitors + admin, every page)
   ----------------------------------------------------------------------------
   Tiny, dependency-free. Applies published overrides from site-content.json:
     text · html · img · href · hide · order · vars (theme) · meta (SEO)
   Elements are addressed by a stable DOM path key (tag + per-tag index),
   or by an explicit data-ak-id="name" (key "#name") when one is present.
   Injected admin UI (class prefix ak- / aks-) is ignored when counting, so
   keys stay identical for visitors and for the editor.

   Nothing here loads the editor. site-edit.js is fetched ONLY when an admin
   session is unlocked (or the URL ends in #edit).
========================================================================== */
(function () {
  "use strict";
  var FILE = "site-content.json";
  var CACHE = "ak-site-cache-v1";
  var PAGE = (location.pathname.split("/").pop() || "index").replace(/\.html?$/i, "") || "index";
  var DATA = null;          // full multi-page object
  var PAGEDATA = null;      // DATA[PAGE]
  var obs = null;
  var VARSTYLE = null;

  /* ---------- keys ---------- */
  function skip(el) {
    var c = (el.getAttribute && el.getAttribute("class")) || "";
    if (/(^|\s)(ak-|aks-)/.test(c)) return true;
    if (el.hasAttribute && el.hasAttribute("data-ak-transient")) return true;
    switch (el.tagName) {
      case "SCRIPT": case "STYLE": case "LINK": case "TEMPLATE": case "NOSCRIPT": case "META": return true;
    }
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
      if (n === document.documentElement) return "";   // outside <body>
    }
    return parts.join(">");
  }
  function resolve(key) {
    if (!key) return null;
    if (key.charAt(0) === "#") {
      try { return document.querySelector('[data-ak-id="' + key.slice(1).replace(/["\\]/g, "") + '"]'); }
      catch (e) { return null; }
    }
    var segs = key.split(">"), node = document.body;
    for (var i = 0; i < segs.length && node; i++) {
      var m = /^([a-z0-9-]+)(?::(\d+))?$/i.exec(segs[i]);
      if (!m) return null;
      var tag = m[1].toUpperCase(), want = m[2] ? +m[2] : 1, c = 0, found = null, ch = node.firstElementChild;
      while (ch) {
        if (ch.tagName === tag && !skip(ch)) { c++; if (c === want) { found = ch; break; } }
        ch = ch.nextElementSibling;
      }
      node = found;
    }
    return node;
  }

  /* ---------- apply ---------- */
  function applyEl(el, key) {
    if (!PAGEDATA || !el) return;
    key = key || keyOf(el);
    if (!key) return;
    var o = PAGEDATA, v;
    if (o.text && (v = o.text[key]) != null && el.textContent !== v) el.textContent = v;
    if (o.html && (v = o.html[key]) != null && el.innerHTML !== v) el.innerHTML = v;
    if (o.img && (v = o.img[key]) != null) {
      if (el.tagName === "IMG") { if (el.getAttribute("src") !== v) { el.removeAttribute("srcset"); el.src = v; } }
      else if (el.tagName === "SOURCE") { el.srcset = v; }
      else el.style.backgroundImage = 'url("' + v + '")';
    }
    if (o.href && (v = o.href[key]) != null && el.getAttribute("href") !== v) el.setAttribute("href", v);
    if (o.attr && o.attr[key]) { for (var a in o.attr[key]) el.setAttribute(a, o.attr[key][a]); }
    if (o.hide && o.hide[key]) el.style.setProperty("display", "none", "important");
  }
  /* Order is stored as a permutation of PRISTINE child positions, so it stays
     correct no matter how many times it is applied (path keys shift when nodes
     move; these stamped indices don't). */
  function tagOI(box) {
    var kids = Array.prototype.filter.call(box.children, function (c) { return !skip(c); });
    if (!kids.length || kids[0].hasAttribute("data-ak-oi")) return kids;
    kids.forEach(function (c, i) { c.setAttribute("data-ak-oi", i); });
    return kids;
  }
  function applyOrder() {
    if (!PAGEDATA || !PAGEDATA.order) return;
    for (var ck in PAGEDATA.order) {
      var box = ck === "" ? document.body : resolve(ck);
      if (!box) continue;
      var list = PAGEDATA.order[ck];
      if (!Array.isArray(list)) continue;
      var kids = tagOI(box), by = {};
      kids.forEach(function (c) { by[c.getAttribute("data-ak-oi")] = c; });
      list.forEach(function (oi) { var el = by[oi]; if (el) box.appendChild(el); });
    }
  }
  function applyVars() {
    var v = PAGEDATA && PAGEDATA.vars;
    if (!v) { if (VARSTYLE) VARSTYLE.textContent = ""; return; }
    function block(sel, set) {
      if (!set) return "";
      var out = "";
      for (var k in set) if (set[k]) out += k + ":" + set[k] + ";";
      return out ? sel + "{" + out + "}" : "";
    }
    var css = block(":root", v.dark) + block('[data-theme="light"]', v.light);
    if (!VARSTYLE) { VARSTYLE = document.createElement("style"); VARSTYLE.id = "ak-site-vars"; document.head.appendChild(VARSTYLE); }
    VARSTYLE.textContent = css;
  }
  var META0 = null;
  function snapMeta() {
    if (META0) return;
    function g(sel) { var e = document.head.querySelector(sel); return e ? e.getAttribute("content") : null; }
    META0 = {
      title: document.title,
      description: g('meta[name="description"]'),
      image: g('meta[property="og:image"]')
    };
  }
  function applyMeta() {
    snapMeta();
    var m = (PAGEDATA && PAGEDATA.meta) || {};
    /* an absent override means the page's own tags win again */
    if (!m.title && META0.title) {
      document.title = META0.title;
      set2("property", "og:title", META0.title); set2("name", "twitter:title", META0.title);
    }
    if (!m.description && META0.description) {
      set2("name", "description", META0.description);
      set2("property", "og:description", META0.description); set2("name", "twitter:description", META0.description);
    }
    if (!m.image && META0.image) { set2("property", "og:image", META0.image); set2("name", "twitter:image", META0.image); }
    function set2(attr, name, val) {
      var e = document.head.querySelector("meta[" + attr + '="' + name + '"]');
      if (e) e.setAttribute("content", val);
    }
    if (m.title) {
      document.title = m.title;
      set("property", "og:title", m.title); set("name", "twitter:title", m.title);
    }
    if (m.description) {
      set("name", "description", m.description);
      set("property", "og:description", m.description); set("name", "twitter:description", m.description);
    }
    if (m.image) { set("property", "og:image", m.image); set("name", "twitter:image", m.image); }
    /* create the tag when the page doesn't already have one — otherwise an SEO
       edit would silently apply to nothing. */
    function set(attr, name, val) {
      var e = document.head.querySelector("meta[" + attr + '="' + name + '"]');
      if (!e) { e = document.createElement("meta"); e.setAttribute(attr, name); document.head.appendChild(e); }
      e.setAttribute("content", val);
    }
  }
  function applyAll() {
    if (!PAGEDATA) return;
    ["text", "html", "img", "href", "attr", "hide"].forEach(function (bucket) {
      var set = PAGEDATA[bucket]; if (!set) return;
      for (var k in set) { var el = resolve(k); if (el) applyEl(el, k); }
    });
    applyOrder(); applyVars(); applyMeta();
  }

  /* ---------- observe during parse so overridden text never flashes ---------- */
  function watch() {
    if (obs || !PAGEDATA) return;
    obs = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var added = recs[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1 || skip(n)) continue;
          applyEl(n);
          if (n.firstElementChild) {
            var d = n.querySelectorAll("*");
            for (var q = 0; q < d.length && q < 400; q++) if (!skip(d[q])) applyEl(d[q]);
          }
        }
      }
    });
    try { obs.observe(document.documentElement, { childList: true, subtree: true }); } catch (e) {}
  }
  function unwatch() { if (obs) { obs.disconnect(); obs = null; } }

  function use(full, quiet) {
    DATA = full || null;
    PAGEDATA = (DATA && DATA[PAGE]) || null;
    if (!quiet) { watch(); if (document.body) applyAll(); }
  }

  /* ---------- boot: the published file is the only truth ----------------------
     The cached copy is kept ONLY for offline loads. It is never applied ahead of
     the fetch: once an edit is baked into the page HTML, site-content.json drops
     it, and a pre-applied cache would keep pasting the old title/text over the
     new page forever. */
  var CACHED = null;
  try {
    var c = localStorage.getItem(CACHE);
    if (c) CACHED = JSON.parse(c);
  } catch (e) {}

  fetch(FILE, { cache: "no-store" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .catch(function () { return null; })
    .then(function (j) {
      if (!j && CACHED) { window.AK_SITE.published = CACHED; use(CACHED); }  // offline only
      if (j) {
        window.AK_SITE.published = j;
        try { localStorage.setItem(CACHE, JSON.stringify(j)); } catch (e) {}
        if (!window.AK_SITE.localWins) use(j);
      }
      ready();
    });

  function ready() {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", finish, { once: true });
    else finish();
  }
  function finish() {
    applyAll();
    setTimeout(unwatch, 1500);
    maybeLoadEditor();
  }

  /* ---------- editor is fetched only for an unlocked admin ---------- */
  function unlocked() {
    try { return sessionStorage.getItem("ak-admin-unlocked") === "1" || localStorage.getItem("ak-admin-unlocked") === "1"; }
    catch (e) { return false; }
  }
  function maybeLoadEditor() {
    var wants = unlocked() || /(^|#)edit$/.test(location.hash) || location.hash === "#edit";
    if (!wants || document.getElementById("ak-site-edit-js")) return;
    var s = document.createElement("script");
    s.id = "ak-site-edit-js"; s.src = "site-edit.js?v=3"; s.defer = true;
    document.body.appendChild(s);
  }
  window.addEventListener("hashchange", maybeLoadEditor);
  document.addEventListener("ak-admin-unlocked", maybeLoadEditor);

  window.AK_SITE = {
    PAGE: PAGE, FILE: FILE, CACHE: CACHE,
    keyOf: keyOf, resolve: resolve, skip: skip, tagOI: tagOI,
    applyAll: applyAll, applyVars: applyVars, applyMeta: applyMeta, applyOrder: applyOrder,
    use: use,
    get data() { return DATA; },
    get pageData() { return PAGEDATA; },
    published: null,
    localWins: false,
    loadEditor: maybeLoadEditor
  };
})();
