/* ============================================================================
   Ajay Katta Portfolio — Admin / Content Manager (shared across project pages)
   ----------------------------------------------------------------------------
   • Password-protected admin button injected into the header.
   • Add / edit / delete case studies (projects) -> new tiles + detail view.
   • Inside a project: add Image, PDF, Prototype, Video/Audio, 3D model, Text.
   • Reorder content blocks by drag-and-drop OR up/down arrows.
   • All edits persist locally (IndexedDB). "Publish" exports portfolio-data.json
     which, when placed next to the HTML on your host, is what visitors load.

   Each page sets window.AK_ADMIN = { page:'ui-ux', noun:'case study',
       gridSelector:'.pgrid', tileTag:'article' } BEFORE loading this script.
============================================================================ */
(function () {
  "use strict";

  var CFG = Object.assign(
    { page: "page", noun: "project", gridSelector: ".pgrid", tileTag: "article" },
    window.AK_ADMIN || {}
  );
  var PW_KEY = "ak-admin-pw";            // local override SHA-256 password hash (per browser)
  var SESSION_KEY = "ak-admin-unlocked"; // session unlock flag (all pages)
  // Baked-in default password hash, shipped with the site so EVERY browser/device
  // uses the same admin password out of the box. SHA-256 of the chosen password.
  // "Change password" stores a per-browser override in PW_KEY that takes precedence here.
  var BAKED_PW = "fc3bc90afab65978286ab14b40b51bbe5b8ab2d3208e6a440c7844babcf89892";
  function storedPW() { try { return localStorage.getItem(PW_KEY) || BAKED_PW; } catch (e) { return BAKED_PW; } }

  /* ---------- tiny helpers ---------- */
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
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- layout of the files INSIDE an open project: "canvas" (as designed) · "grid" (full-size vertical stack).
     Separate from the project-cover wall on each page, which keeps its own "ak-cover-view" (compact cards). ---------- */
  /* Canvas is the default for EVERY project. The toggle is session-only and scoped to the
     open project — reopening it (or opening another) always starts in Canvas again. */
  var sessionView = { id: null, v: "canvas" };
  function bentoView(itemId) {
    return (itemId != null && sessionView.id === itemId && sessionView.v === "grid") ? "grid" : "canvas";
  }
  function setBentoView(v, itemId) {
    sessionView = { id: itemId != null ? itemId : sessionView.id, v: v === "grid" ? "grid" : "canvas" };
    document.dispatchEvent(new CustomEvent("ak-view-change", { detail: sessionView.v }));
  }
  var I_VCANVAS = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="8" height="14" rx="1.6"/><rect x="10.6" y="1" width="4.4" height="6.4" rx="1.4"/><rect x="10.6" y="8.6" width="4.4" height="6.4" rx="1.4"/></svg>';
  var I_VGRID = '<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><rect x="1" y="1" width="14" height="5" rx="1.5"/><rect x="1" y="7.4" width="14" height="3.4" rx="1.4"/><rect x="1" y="12.2" width="14" height="2.8" rx="1.3"/></svg>';
  function buildViewSwitch(cur, onPick, wide) {
    var sw = h("div", { class: "seg", role: "tablist", "aria-label": "Choose layout" });
    [["canvas", "Canvas", I_VCANVAS, "Canvas \u2014 the bento layout as designed"],
     ["grid", "Grid", I_VGRID, "Grid \u2014 every file full size, one per row"]].forEach(function (o) {
      var b = h("button", { class: "seg-btn" + (o[0] === cur ? " active" : ""), type: "button", role: "tab", title: o[3],
        "aria-selected": o[0] === cur ? "true" : "false",
        html: o[2] + "<span>" + o[1] + "</span>", onclick: function () { onPick(o[0]); } });
      b.setAttribute("data-view", o[0]);
      sw.appendChild(b);
    });
    return h("div", { class: "view-bar" + (wide ? " wide" : "") }, [sw]);
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function $(s, r) { return (r || document).querySelector(s); }

  function sha256(str) {
    var enc = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }
  /* Every image is capped at IMG_MAX_EDGE on its long edge before it is stored, so a 7000px
     export can never reach the live site: at that size the browser spends longer DECODING the
     picture than downloading it. 2560px still covers a full-bleed block on a retina screen. */
  var IMG_MAX_EDGE = 2560, IMG_OVER_EDGE = 2592;   /* rebuilt files land on 2560±1 — only flag what is really bigger */
  /* This site ships WebP and nothing else: same picture, roughly a third of a JPEG's weight,
     and one format to reason about. Nothing is converted behind the owner's back though —
     drop in a PNG or a JPEG and the editor asks first, with both file sizes on screen. */
  var _webpOK = null;
  function canMakeWebp() {
    if (_webpOK === null) {
      try { var c = document.createElement("canvas"); c.width = c.height = 1; _webpOK = c.toDataURL("image/webp").indexOf("data:image/webp") === 0; }
      catch (e) { _webpOK = false; }
    }
    return _webpOK;
  }
  function canvasToWebp(cv, q) {
    q = (q == null ? 0.92 : q);
    if (canMakeWebp()) { var o = cv.toDataURL("image/webp", q); if (o.indexOf("data:image/webp") === 0) return o; }
    return cv.toDataURL("image/jpeg", q);
  }
  function fmtName(m) {
    return ({ "image/jpeg": "JPEG", "image/jpg": "JPEG", "image/png": "PNG", "image/gif": "GIF", "image/webp": "WebP",
      "image/svg+xml": "SVG", "image/avif": "AVIF", "image/heic": "HEIC", "image/heif": "HEIC", "image/tiff": "TIFF", "image/bmp": "BMP" })[m]
      || String(m || "").replace("image/", "").toUpperCase() || "that file";
  }
  function dataKB(u) {
    var b = Math.round((String(u).length - (String(u).indexOf(",") + 1)) * 0.75);
    return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB";
  }
  function encodeAt(im, w, hgt, type, q) {
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = hgt;
    var cx = cv.getContext("2d");
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
    cx.drawImage(im, 0, 0, w, hgt);
    var o = cv.toDataURL(type, q);
    cv.width = cv.height = 1;
    return o.slice(5).split(";")[0] === type ? o : null;
  }
  function readFileAsDataURL(file) {
    var rep = {};
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); })
      .then(function (d) { return shrinkImageDataURL(d, file && file.type, rep, file && file.name); })
      .then(function (out) { webpNote(file, rep); return out; });
  }
  /* Shared with Layout Studio, so a picture dropped on the canvas gets the same size cap and
     the same Convert-to-WebP question as one added to a block. */
  window.AK_IMG = { fromFile: readFileAsDataURL, shrink: shrinkImageDataURL };
  function shrinkImageDataURL(d, mime, rep, name) {
    rep = rep || {};
    if (typeof d !== "string" || d.indexOf("data:image/") !== 0) return d;
    mime = mime || d.slice(5).split(";")[0];
    rep.from = mime;
    if (mime === "image/gif" || mime.indexOf("image/svg") === 0) { rep.kept = true; return d; }   // animation / vector: leave alone
    return new Promise(function (res) {
      var im = new Image();
      im.onload = function () {
        var w = im.naturalWidth, hh = im.naturalHeight, m = Math.max(w, hh);
        if (!m) { rep.failed = true; return res(d); }
        var over = m > IMG_OVER_EDGE, k = over ? IMG_MAX_EDGE / m : 1;
        var tw = Math.max(1, Math.round(w * k)), th = Math.max(1, Math.round(hh * k));
        if (over) rep.resized = w + "\u00d7" + hh + " \u2192 " + tw + "\u00d7" + th;
        var sameType = mime === "image/png" ? "image/png" : "image/jpeg";
        if (mime === "image/webp") {                       // already the site format: only the size cap applies
          rep.to = mime;
          if (!over) return res(d);
          var re = null; try { re = encodeAt(im, tw, th, "image/webp", 0.92); } catch (e) {}
          return res(re && re.length < d.length ? re : d);
        }
        var webp = null;
        try { webp = encodeAt(im, tw, th, "image/webp", 0.92); } catch (e) {}
        var keep = d;
        if (over) { try { keep = encodeAt(im, tw, th, sameType, 0.92) || d; } catch (e) {} }
        if (!webp) { rep.failed = true; rep.to = mime; return res(keep); }   // this browser cannot write WebP
        askConvert({ name: name, from: mime, webp: webp, keep: keep, dim: tw + "\u00d7" + th }).then(function (choice) {
          if (choice === "webp") { rep.to = "image/webp"; return res(webp); }
          rep.to = mime; rep.declined = true; res(keep);
        });
      };
      im.onerror = function () { rep.failed = true; res(d); };
      im.src = d;
    });
  }
  /* One question at a time even when a dozen files are dropped at once, with a "do the same
     for the rest" so a batch is never a dozen taps. */
  var _askChain = Promise.resolve(), _askAll = null, _askAllTimer;
  function askConvert(info) {
    var p = _askChain.then(function () {
      if (_askAll) return _askAll;
      return new Promise(function (done) {
        var nm = String(info.name || "This image");
        if (nm.length > 30) nm = nm.slice(0, 28) + "\u2026";
        var remember = h("input", { type: "checkbox", style: "width:16px;height:16px;accent-color:var(--accent);cursor:pointer" });
        /* Layout Studio and the detail viewer are full-screen overlays of their own, and an
           upload can start from inside either. This question has to sit above everything or the
           upload looks frozen behind a dialog nobody can see. */
        var ov = h("div", { class: "ak-ov", style: "z-index:2147483600" });
        function pick(choice) {
          if (remember.checked) _askAll = choice;
          clearTimeout(_askAllTimer);
          _askAllTimer = setTimeout(function () { _askAll = null; }, 8000);
          document.removeEventListener("keydown", onKey);
          ov.remove(); done(choice);
        }
        function onKey(e) { if (e.key === "Escape") pick("keep"); }
        var keepBtn = h("button", { class: "ak-btn ghost", onclick: function () { pick("keep"); } }, ["Keep " + fmtName(info.from)]);
        var convBtn = h("button", { class: "ak-btn", onclick: function () { pick("webp"); } }, ["Convert to WebP"]);
        ov.appendChild(h("div", { class: "ak-modal", style: "width:min(440px,100%)" }, [
          h("h3", {}, ["Convert to WebP?"]),
          h("div", { class: "sub" }, [nm + " \u00b7 " + fmtName(info.from) + " \u00b7 " + info.dim]),
          h("div", { class: "ak-xrows", style: "margin-top:14px" }, [
            h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["As WebP"]), h("span", { class: "v" }, [dataKB(info.webp)])]),
            h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["As " + fmtName(info.from)]), h("span", { class: "v" }, [dataKB(info.keep)])])
          ]),
          h("div", { class: "ak-hint", style: "margin-top:10px" }, ["The rest of the site is WebP \u2014 same picture, a fraction of the weight. Keeping " + fmtName(info.from) + " leaves one odd file in media/."]),
          h("label", { class: "ak-hint", style: "display:flex;align-items:center;gap:9px;margin-top:12px;cursor:pointer" }, [remember, h("span", {}, ["Do the same for the rest of this upload"])]),
          h("div", { class: "ak-acts" }, [keepBtn, convBtn])
        ]));
        document.addEventListener("keydown", onKey);
        document.body.appendChild(ov);
        setTimeout(function () { convBtn.focus(); }, 30);
      });
    });
    _askChain = p.then(function () {}, function () {});
    return p;
  }
  function webpNote(file, rep) {
    if (!rep || !rep.from || rep.from.indexOf("image/") !== 0) return;
    var name = (file && file.name) || "That image", short = name.length > 26 ? name.slice(0, 24) + "\u2026" : name;
    if (rep.kept) return showNoteToast("\u26A0 " + short + " stays " + fmtName(rep.from) + ". This site uses WebP \u2014 keep " + fmtName(rep.from) + " only if you need the " + (rep.from.indexOf("svg") > -1 ? "vector" : "animation") + ".", true);
    if (rep.declined) return showNoteToast("\u26A0 " + short + " kept as " + fmtName(rep.from) + (rep.resized ? " \u00b7 " + rep.resized : "") + " \u2014 the rest of the site is WebP.", true);
    if (rep.to === "image/webp" && rep.from !== "image/webp") return showNoteToast(fmtName(rep.from) + " converted to WebP" + (rep.resized ? " \u00b7 " + rep.resized : "") + " \u2713");
    if (rep.failed && rep.from !== "image/webp") return showNoteToast("\u26A0 " + short + " is still " + fmtName(rep.from) + " \u2014 this browser could not write WebP. Re-upload it in Chrome or Edge.", true);
    if (rep.resized) showNoteToast("Resized \u00b7 " + rep.resized + " \u2713");
  }
  /* ---- cover crop editor: pan + zoom, outputs a cropped data URL at the cover aspect ---- */
  function makeCropper(aspect, onChange) {
    aspect = aspect || 16 / 9;
    var img = h("img", {});
    var stage = h("div", { class: "ak-crop-stage", style: "aspect-ratio:" + aspect + ";display:none" }, [img]);
    var zoom = h("input", { class: "ak-crop-zoom", type: "range", min: "1", max: "3", step: "0.01", value: "1" });
    var reset = h("button", { type: "button", class: "ak-crop-reset" }, ["Reset"]);
    var zoomIco = '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4-4M8 11h6M11 8v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var row = h("div", { class: "ak-crop-row", style: "display:none" }, [h("span", { html: zoomIco }), zoom, reset]);
    var el = h("div", { class: "ak-crop" }, [stage, row]);

    var nat = { w: 0, h: 0 }, base = 1, scale = 1, ox = 0, oy = 0, drag = null;
    function stageSize() { return { w: stage.clientWidth || 1, h: (stage.clientWidth || 1) / aspect }; }
    function clamp() {
      var s = stageSize(), iw = nat.w * scale, ih = nat.h * scale;
      ox = Math.min(0, Math.max(s.w - iw, ox));
      oy = Math.min(0, Math.max(s.h - ih, oy));
    }
    function paint() { img.style.transform = "translate(" + ox + "px," + oy + "px) scale(" + scale + ")"; }
    function emit() {
      if (!nat.w) return;
      var s = stageSize(), outW = 1280, outH = Math.round(outW / aspect);
      var cv = document.createElement("canvas"); cv.width = outW; cv.height = outH;
      var cx = cv.getContext("2d"); cx.imageSmoothingQuality = "high";
      var k = outW / s.w; // output px per stage px
      var sx = (-ox) / scale, sy = (-oy) / scale, sw = s.w / scale, sh = s.h / scale;
      try { cx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH); } catch (e) { return; }
      onChange(canvasToWebp(cv, 0.9));
    }
    function fit() {
      var s = stageSize();
      base = Math.max(s.w / nat.w, s.h / nat.h);
      scale = base; zoom.value = "1";
      ox = (s.w - nat.w * scale) / 2; oy = (s.h - nat.h * scale) / 2;
      clamp(); paint(); emit();
    }
    img.addEventListener("load", function () {
      nat.w = img.naturalWidth; nat.h = img.naturalHeight;
      if (!nat.w) return;
      stage.style.display = ""; row.style.display = "";
      fit();
    });
    zoom.addEventListener("input", function () {
      var s = stageSize(), cx = s.w / 2, cy = s.h / 2;
      var ns = base * parseFloat(zoom.value);
      var fx = (cx - ox) / scale, fy = (cy - oy) / scale;
      scale = ns; ox = cx - fx * scale; oy = cy - fy * scale;
      clamp(); paint(); emit();
    });
    reset.addEventListener("click", fit);
    stage.addEventListener("pointerdown", function (e) {
      if (!nat.w) return; drag = { x: e.clientX, y: e.clientY, ox: ox, oy: oy };
      stage.classList.add("drag"); stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener("pointermove", function (e) {
      if (!drag) return; ox = drag.ox + (e.clientX - drag.x); oy = drag.oy + (e.clientY - drag.y);
      clamp(); paint();
    });
    function end() { if (drag) { drag = null; stage.classList.remove("drag"); emit(); } }
    stage.addEventListener("pointerup", end);
    stage.addEventListener("pointercancel", end);

    return {
      el: el,
      load: function (src) { if (!src) { stage.style.display = "none"; row.style.display = "none"; nat.w = 0; return; } img.src = src; },
      hide: function () { stage.style.display = "none"; row.style.display = "none"; nat.w = 0; },
      refit: function () { if (nat.w) clamp(), paint(); }
    };
  }
  var _blobCache = {};
  function dataURLtoBlobURL(d) {
    if (!d) return d;
    if (d.indexOf("data:") !== 0) return d;
    if (_blobCache[d]) return _blobCache[d];
    try {
      var parts = d.split(","), mime = parts[0].match(/:(.*?);/)[1], bin = atob(parts[1]);
      var arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([arr], { type: mime })); _blobCache[d] = url; return url;
    } catch (e) { return d; }
  }
  /* ---- media warm-up ------------------------------------------------------------
     Opening a project used to fire every image request in one burst, so the first
     screen competed for bandwidth with images twenty screens down — that is the
     "small images, still slow" lag. warmSrcs() pulls files into the HTTP cache at
     LOW priority, three at a time, and never requests the same file twice. Hovering
     a tile warms that project, so the click opens from cache. */
  var _warmed = {}, _warmQ = [], _warmLive = 0;
  function _warmNext() {
    while (_warmLive < 6 && _warmQ.length) {
      var src = _warmQ.shift(); _warmLive++;
      var im = new Image();
      try { im.fetchPriority = "low"; } catch (e) {}
      im.decoding = "async";
      im.onload = im.onerror = function () { _warmLive--; _warmNext(); };
      im.src = src;
    }
  }
  function warmSrcs(list, limit) {
    (list || []).slice(0, limit || 8).forEach(function (s) {
      if (!s || typeof s !== "string" || s.slice(0, 5) === "data:" || _warmed[s]) return;
      _warmed[s] = 1; _warmQ.push(s);
    });
    _warmNext();
  }
  /* every image a project will paint, in the order the visitor meets them */
  function itemImageSrcs(it) {
    var out = [];
    if (!it) return out;
    if (it.homeBg && it.homeBg.image) out.push(it.homeBg.image);
    if (it.cover) out.push(it.cover);
    ((it.studio && it.studio.els) || []).filter(function (e) {
      return e && !e.hidden && e.content && e.content.type === "image" && e.content.src;
    }).sort(function (x, y) { return (x.y || 0) - (y.y || 0); })
      .forEach(function (e) { out.push(e.content.src); });
    (it.blocks || []).forEach(function (b) { if (b && b.type === "image" && b.src) out.push(b.src); });
    return out;
  }
  function whenIdle(fn, t) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: t || 1500 });
    else setTimeout(fn, 200);
  }
  function saveData() {
    var c = navigator.connection || {};
    return !!c.saveData || /2g/.test(c.effectiveType || "");
  }

  /* ---------- IndexedDB ---------- */
  var DB;
  function db() {
    if (DB) return Promise.resolve(DB);
    return new Promise(function (res, rej) {
      var rq = indexedDB.open("ak-portfolio", 1);
      rq.onupgradeneeded = function () { rq.result.createObjectStore("kv"); };
      rq.onsuccess = function () { DB = rq.result; res(DB); };
      rq.onerror = function () { rej(rq.error); };
    });
  }
  function idbGet(key) {
    return db().then(function (d) { return new Promise(function (res) { var r = d.transaction("kv").objectStore("kv").get(key); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; }); });
  }
  function idbSet(key, val) {
    return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(val, key); t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; }); });
  }

  /* ---------- state ---------- */
  var DATA = { items: [] };          // { items:[ {id,title,tag,desc,cover,meta:{role,timeline,platform,focus}, blocks:[]} ] }
  var UNLOCKED = false;
  var openItemId = null;
  var openCaseKey = null;

  // Visitors ALWAYS see the published portfolio-data.json. The browser's local copy
  // (IndexedDB) is used only on a device where an admin has actually edited — tracked by
  // EDIT_FLAG. This stops a stale/empty local copy from shadowing the published content.
  var EDIT_FLAG = "ak-local-edits:" + CFG.page;
  function load() {
    return fetch("portfolio-data.json", { cache: "no-cache" }) /* always fresh, but a 304 instead of a full re-download */
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (pub) {
        var published = (pub && pub[CFG.page] && pub[CFG.page].items) ? pub[CFG.page] : null;
        return idbGet("data:" + CFG.page).then(function (local) {
          var hasLocalEdits = false; try { hasLocalEdits = !!localStorage.getItem(EDIT_FLAG); } catch (e) {}
          var localUsable = local && local.items && local.items.length > 0;
          if (hasLocalEdits && localUsable) { DATA = local; return; }  // admin's working copy on this device
          if (published) { DATA = published; return; }                 // everyone else: published file wins
          if (local && local.items) { DATA = local; return; }          // offline / no published file yet
        });
      });
  }
  var _saveWarned = false;
  function save() {
    try { if (typeof isUnlocked === "function" && isUnlocked()) localStorage.setItem(EDIT_FLAG, "1"); } catch (e) {}
    return idbSet("data:" + CFG.page, DATA).then(function (r) {
      _saveWarned = false;
      // keeps Settings → Projects / Draft in step with newly added projects and files
      try { document.dispatchEvent(new CustomEvent("ak-cases-changed", { detail: { page: CFG.page } })); } catch (e) {}
      return r;
    }, function () {
      /* A failed write — a full storage quota on a project heavy with photos and video is the
         usual reason — means what is on screen is no longer what is on disk. Reload and the
         work is gone. It must never pass silently. */
      if (!_saveWarned) {
        _saveWarned = true;
        try { showNoteToast("Couldn't save to this browser \u2014 its storage is full. Export your site data now (Settings \u2192 Export), and don't reload this tab until you have.", true); } catch (e) {}
      }
      return null;   // the copy in memory is still complete, so editing and exporting carry on
    });
  }

  /* ============================================================ STYLES */
  function injectCSS() {
    document.head.appendChild(h("style", { html: `
    /* Hydration gate: keep the project tiles hidden until admin.js has reconciled
       the built-in tiles against saved/published data, so deleted or default
       projects never flash before the real, live list paints. */
    ${CFG.gridSelector}{transition:opacity .3s ease}
    body.ak-hydrating ${CFG.gridSelector}{opacity:0!important}
    @media (prefers-reduced-motion: reduce){${CFG.gridSelector}{transition:none}}
    .ak-btn{display:inline-flex;align-items:center;gap:7px;font-family:'Inter',sans-serif;font-weight:600;font-size:.86rem;
      color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-2));border:none;border-radius:99px;padding:8px 15px;cursor:pointer;transition:.2s;white-space:nowrap}
    .ak-btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
    .ak-btn.ghost{background:var(--surface);color:var(--text);border:1px solid var(--line)}
    .ak-btn.ghost:hover{border-color:var(--accent);color:var(--accent);filter:none}
    .ak-btn.danger{background:linear-gradient(135deg,#ef4444,#f87171)}
    .ak-btn svg{width:15px;height:15px;flex:none}
    /* header admin toggle: icon-only, state-aware */
    .ak-btn.ak-admin-toggle{position:relative;width:36px;height:36px;padding:0;border-radius:50%;justify-content:center;gap:0;
      background:var(--surface);border:1px solid var(--line);color:var(--muted);box-shadow:none}
    .ak-btn.ak-admin-toggle:hover{color:var(--text);border-color:var(--accent);filter:none;transform:translateY(-1px)}
    .ak-btn.ak-admin-toggle svg{width:18px;height:18px}
    .ak-admin-toggle .ak-dot{position:absolute;top:-1px;right:-1px;width:10px;height:10px;border-radius:50%;
      background:var(--muted);border:2px solid var(--bg);opacity:0;transform:scale(.3);transition:.22s}
    body.ak-on .ak-btn.ak-admin-toggle{background:linear-gradient(135deg,var(--accent),var(--accent-2));border-color:transparent;color:#fff;
      box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 22%,transparent)}
    body.ak-on .ak-btn.ak-admin-toggle:hover{filter:brightness(1.08)}
    body.ak-on .ak-admin-toggle .ak-dot{background:#36d399;opacity:1;transform:scale(1);box-shadow:0 0 8px #36d399}
    .ak-wrap{position:relative}
    /* left-nav Layout Studio entry (admin-only) */
    .ak-ls-nav{display:none;align-items:center;gap:8px;font-family:'Inter',sans-serif;font-weight:600;font-size:.9rem;
      color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:99px;padding:7px 15px;cursor:pointer;transition:.25s}
    .ak-ls-nav:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-1px)}
    .ak-ls-nav svg{width:15px;height:15px;flex:none}
    body.ak-on .ak-ls-nav{display:inline-flex}
    @media(max-width:560px){.ak-ls-nav span{display:none}.ak-ls-nav{padding:8px}}
    /* whole-project freeform canvas body (replaces the block stack when item.studio is set) */
    .ak-studio-body{max-width:1200px;margin:0 auto;padding:10px 20px 48px}
    @media(max-width:640px){.ak-studio-body{padding:6px 10px 28px}}
    /* ---- visitor layout switch inside an open project: reuses each page's own
       .view-bar/.seg/.seg-btn component, so there is ONE control language and one key ---- */
    .ak-detail .view-bar{max-width:1100px;margin:0 auto;padding:30px 24px 0;justify-content:flex-end}
    .ak-detail .view-bar.wide{max-width:1200px;padding:26px 20px 0}
    /* in the project home block: pinned bottom-right of the hero, compact so it costs no vertical space */
    .ak-d-hero .view-bar{position:absolute;right:20px;bottom:16px;left:auto;z-index:3;max-width:none;width:auto;margin:0;padding:0;justify-content:flex-end}
    .ak-d-hero .view-bar .seg{padding:3px;border-radius:10px;background:color-mix(in srgb,var(--surface) 84%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 8px 22px -16px rgba(0,0,0,.5)}
    .ak-d-hero .view-bar .seg-btn{font-size:.74rem;padding:5px 10px;gap:6px;border-radius:8px}
    .ak-d-hero .view-bar .seg-btn svg{width:13px;height:13px}
    @media(max-width:640px){.ak-d-hero .view-bar{right:12px;bottom:10px}.ak-d-hero .view-bar .seg-btn{font-size:.7rem;padding:5px 8px}}
    @media(max-width:640px){.ak-detail .view-bar{padding:18px 16px 0}.ak-detail .view-bar.wide{padding:16px 10px 0}}
    /* GRID VIEW (classic block projects): one column, every file at full size */
    .ak-blocks.ak-gridmode,.ak-case-blocks.ak-gridmode{grid-template-columns:1fr;gap:34px}
    .ak-gridmode>.ak-block{grid-column:1/-1 !important}
    .ak-gridmode .ak-secgroup{grid-template-columns:1fr}
    .ak-gridmode .ak-secgroup>.ak-block{grid-column:1/-1 !important}
    .ak-gridmode .ak-block[data-bento]{--bh:auto}
    .ak-gridmode .ak-block[data-bento]>.ak-sec{min-height:0}
    .ak-gridmode .ak-wide,.ak-gridmode .ak-imghold{width:100%;height:auto !important;margin-left:0;transform:none}
    .ak-gridmode .ak-block img.media,.ak-gridmode .ak-block video.media{width:100% !important;height:auto !important;max-height:none !important;
      object-fit:contain !important;object-position:50% 50% !important;transform:none !important}
    .ak-gridmode .ak-block iframe.media,.ak-gridmode .ak-block[data-bento] .ak-wide iframe.media{height:min(84vh,880px) !important}
    .ak-gridmode .ak-pdf,.ak-gridmode .ak-3d{height:min(84vh,880px) !important}
    .ak-menu{position:fixed;right:20px;top:62px;min-width:196px;max-height:calc(100vh - 80px);overflow-y:auto;background:var(--surface);border:1px solid var(--line);
      border-radius:12px;padding:4px;box-shadow:0 24px 60px -28px rgba(0,0,0,.6),0 0 0 1px color-mix(in srgb,var(--accent) 10%,transparent);
      z-index:250;display:none;flex-direction:column;gap:0}
    .ak-menu.on{display:flex;animation:akpop .18s ease}
    @keyframes akpop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
    .ak-mi{display:flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;font-weight:500;font-size:.8rem;line-height:1.15;color:var(--text);
      background:none;border:none;text-align:left;padding:5px 9px;border-radius:7px;cursor:pointer;transition:.15s;width:100%}
    .ak-mi:hover{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)}
    .ak-mi .ico{width:18px;height:18px;border-radius:5px;display:flex;align-items:center;justify-content:center;flex:none;
      background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
    .ak-mi .ico svg{width:11px;height:11px}
    .ak-mi.warn:hover{background:color-mix(in srgb,#ef4444 14%,transparent);color:#ef4444}
    .ak-mi.warn .ico{background:color-mix(in srgb,#ef4444 14%,transparent);color:#ef4444}
    .ak-sep{height:1px;background:var(--line);margin:3px 6px}
    .ak-label{font-family:'Inter',sans-serif;font-size:.54rem;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);padding:6px 9px 2px}
    .ak-menu > .ak-label:first-child{padding-top:3px}
    .ak-badge{font-family:'Inter',sans-serif;font-size:.46rem;letter-spacing:.13em;text-transform:uppercase;color:#fff;
      background:linear-gradient(135deg,var(--accent),var(--accent-2));padding:2px 6px;border-radius:4px;margin-left:6px}

    /* modal */
    .ak-ov{position:fixed;inset:0;z-index:300;background:color-mix(in srgb,#05060a 72%,transparent);backdrop-filter:blur(7px);
      display:flex;align-items:center;justify-content:center;padding:24px;animation:akfade .2s ease}
    @keyframes akfade{from{opacity:0}to{opacity:1}}
    .ak-modal{width:min(560px,100%);max-height:88vh;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:18px;
      padding:26px;box-shadow:0 40px 100px -30px rgba(0,0,0,.7)}
    .ak-modal h3{font-family:'Inter',sans-serif;font-size:1.3rem;margin:0 0 4px;color:var(--text)}
    .ak-modal .sub{color:var(--muted);font-size:.9rem;margin-bottom:20px}
    .ak-field{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}
    .ak-field label{font-family:'Inter',sans-serif;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-2)}
    .ak-field input[type=text],.ak-field input[type=password],.ak-field input[type=url],.ak-field textarea,.ak-field select{
      font-family:'Inter',sans-serif;font-size:.95rem;color:var(--text);background:color-mix(in srgb,var(--bg) 60%,var(--surface));
      border:1px solid var(--line);border-radius:10px;padding:11px 13px;width:100%;transition:.2s}
    .ak-field textarea{min-height:84px;resize:vertical;line-height:1.5}
    .ak-field input:focus,.ak-field textarea:focus,.ak-field select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}
    .ak-file{border:1.5px dashed var(--line);border-radius:11px;padding:18px;text-align:center;cursor:pointer;transition:.2s;color:var(--muted);font-size:.88rem}
    .ak-modal.compact .sub{margin-bottom:12px;font-size:.78rem}
    .ak-modal.compact .ak-field{margin-bottom:10px;gap:5px}
    .ak-modal.compact .ak-file{padding:9px 12px;font-size:.76rem}
    .ak-modal.compact .ak-file-remove{margin-top:4px}
    .ak-file:hover{border-color:var(--accent);color:var(--text)}
    .ak-file.has{border-style:solid;border-color:var(--accent);color:var(--text)}
    .ak-file-remove{margin-top:9px;font-family:'Inter',sans-serif;font-weight:600;font-size:.8rem;color:#f87171;background:none;border:none;cursor:pointer;padding:3px 2px;display:inline-flex;align-items:center;gap:6px}
    .ak-file-remove:hover{text-decoration:underline}
    .ak-acts{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
    .ak-hint{font-size:.78rem;color:var(--muted);margin-top:-8px;margin-bottom:14px;line-height:1.45}
    .ak-err{color:#f87171;font-size:.82rem;margin-top:8px;min-height:1em}
    .ak-num input::-webkit-inner-spin-button,.ak-num input::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
    .ak-num input[type=number]{-moz-appearance:textfield;appearance:textfield}
    .ak-modal,.ak-modal textarea{scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--muted) 40%,transparent) transparent}
    .ak-modal::-webkit-scrollbar,.ak-modal textarea::-webkit-scrollbar{width:8px}
    .ak-modal::-webkit-scrollbar-track,.ak-modal textarea::-webkit-scrollbar-track{background:transparent}
    .ak-modal::-webkit-scrollbar-thumb,.ak-modal textarea::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--muted) 38%,transparent);border-radius:99px;border:2px solid transparent;background-clip:content-box}
    .ak-modal::-webkit-scrollbar-thumb:hover,.ak-modal textarea::-webkit-scrollbar-thumb:hover{background:color-mix(in srgb,var(--muted) 62%,transparent);border:2px solid transparent;background-clip:content-box}
    .ak-modal::-webkit-scrollbar-button,.ak-modal textarea::-webkit-scrollbar-button{display:none;width:0;height:0}
    .ak-modal textarea::-webkit-resizer{display:none}
    /* export summary modal */
    .ak-xsec{font-family:'Inter',sans-serif;font-size:.58rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-2);margin:16px 0 8px}
    .ak-xrows{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:12px;overflow:hidden}
    .ak-xrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;font-size:.9rem;background:color-mix(in srgb,var(--bg) 55%,var(--surface))}
    .ak-xrow + .ak-xrow{border-top:1px solid var(--line)}
    .ak-xrow .k{color:var(--muted)}
    .ak-xrow .v{font-family:'Inter',sans-serif;font-weight:600;color:var(--text)}
    .ak-xwarn{margin-top:16px;border:1px solid color-mix(in srgb,#ef4444 45%,transparent);background:color-mix(in srgb,#ef4444 10%,transparent);border-radius:12px;padding:12px 14px;font-size:.84rem;color:#f87171;line-height:1.55}
    .ak-xsteps{margin:8px 0 0;padding-left:18px;font-size:.87rem;color:var(--text);line-height:1.7}
    .ak-xsteps li::marker{color:var(--accent);font-weight:700}
    /* cover crop editor */
    .ak-crop{margin-top:12px}
    .ak-crop-stage{position:relative;width:100%;border-radius:11px;overflow:hidden;background:#000;border:1px solid var(--line);cursor:grab;touch-action:none;user-select:none}
    .ak-crop-stage.drag{cursor:grabbing}
    .ak-crop-stage img{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform;-webkit-user-drag:none;pointer-events:none}
    .ak-crop-stage::after{content:"";position:absolute;inset:0;pointer-events:none;
      background:linear-gradient(rgba(255,255,255,.18) 0 1px,transparent 1px) 0 33.3%/100% 33.34%,
        linear-gradient(90deg,rgba(255,255,255,.18) 0 1px,transparent 1px) 33.3% 0/33.34% 100%;
      background-repeat:repeat-y,repeat-x;opacity:0;transition:opacity .2s}
    .ak-crop-stage.drag::after{opacity:1}
    .ak-crop-row{display:flex;align-items:center;gap:11px;margin-top:11px}
    .ak-crop-row svg{width:17px;height:17px;flex:none;color:var(--muted)}
    .ak-crop-zoom{flex:1 1 auto;-webkit-appearance:none;appearance:none;height:5px;border-radius:99px;background:var(--line);outline:none}
    .ak-crop-zoom::-webkit-slider-thumb{-webkit-appearance:none;width:17px;height:17px;border-radius:50%;background:var(--accent);cursor:pointer;border:2px solid var(--surface);box-shadow:0 1px 4px rgba(0,0,0,.3)}
    .ak-crop-zoom::-moz-range-thumb{width:15px;height:15px;border-radius:50%;background:var(--accent);cursor:pointer;border:2px solid var(--surface)}
    .ak-crop-reset{font-family:'Inter',sans-serif;font-weight:600;font-size:.78rem;color:var(--muted);background:none;border:none;cursor:pointer;padding:3px 4px;white-space:nowrap}
    .ak-crop-reset:hover{color:var(--accent)}

    /* detail overlay */
    .ak-detail{position:relative;z-index:1;background:var(--bg);animation:akdetail .34s cubic-bezier(.2,.7,.3,1) both;will-change:opacity,transform}
    @keyframes akdetail{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
    @media (prefers-reduced-motion: reduce){.ak-detail{animation:none}}
    body.ak-item-detail .index-view,body.ak-item-detail .cs-detail{display:none!important}
    body.ak-item-detail .phead,body.ak-item-detail .phead ~ section:has(> .pgrid){display:none!important}
    body.ak-item-detail .nav-right .home,body.ak-item-detail .nav-right .ak-wrap{display:none}
    /* Inside an open project the top nav sits directly above the solid sticky bar. Make it
       solid too (matching .ak-d-bar) so dark sections — prototype stage, dark covers, footer —
       can't bleed grey through the translucent glass as the nav is revealed at the end. */
    body.ak-item-detail header{background:var(--bg);-webkit-backdrop-filter:none;backdrop-filter:none}
    .ak-item-actions{display:flex;align-items:center;gap:9px}
    @media(max-width:560px){.ak-tpl-btn span{display:none}.ak-tpl-btn{padding:8px 11px}}
    .ak-d-bar{position:sticky;top:0;z-index:40;
      border-bottom:1px solid color-mix(in srgb,var(--line) 55%,transparent);
      background:var(--bg);
      -webkit-backdrop-filter:blur(22px) saturate(155%);backdrop-filter:blur(22px) saturate(155%);
      box-shadow:0 10px 28px -18px rgba(0,0,0,.5),inset 0 1px 0 color-mix(in srgb,#fff 9%,transparent);
      transition:transform .35s cubic-bezier(.2,.7,.3,1),opacity .35s}
    .ak-d-bar.ak-bar-hidden{transform:translateY(calc(-100% - 90px));opacity:0;pointer-events:none}
    .ak-d-bar .inner{display:flex;align-items:center;gap:14px;flex-wrap:nowrap;padding:8px 28px;max-width:1180px;margin:0 auto}
    .ak-d-bar .title{font-family:'Inter',sans-serif;font-weight:600;font-size:1rem;color:var(--text)}
    .ak-d-bar .tabwrap{position:relative;display:flex;flex:1 1 auto;min-width:0;max-width:100%}
    .ak-d-bar .tabbar{display:flex;gap:5px;padding:5px;border:1px solid var(--line);border-radius:99px;background:color-mix(in srgb,var(--surface) 60%,transparent);backdrop-filter:blur(8px);max-width:100%;overflow-x:auto;scroll-behavior:smooth;cursor:grab;-webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 calc(22px*var(--l,0)),#000 calc(100% - 22px*var(--r,0)),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 calc(22px*var(--l,0)),#000 calc(100% - 22px*var(--r,0)),transparent 100%)}
    .ak-d-bar .tabbar::-webkit-scrollbar{display:none}
    .ak-d-bar .tabbar.is-dragging{cursor:grabbing;scroll-behavior:auto}
    .ak-d-bar .tabnav{position:absolute;top:50%;transform:translateY(-50%);z-index:3;width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:color-mix(in srgb,var(--surface) 90%,transparent);backdrop-filter:blur(8px);color:var(--text);font-family:'Inter',sans-serif;font-size:1.15rem;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s,background .25s,color .25s,border-color .25s;box-shadow:0 8px 22px -10px rgba(0,0,0,.55)}
    .ak-d-bar .tabnav.show{opacity:1;pointer-events:auto}
    .ak-d-bar .tabnav.prev{left:-7px}
    .ak-d-bar .tabnav.next{right:-7px}
    .ak-d-bar .tabnav:hover{background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;border-color:transparent}
    .ak-d-bar .tabnav.prev:hover{transform:translateY(-50%) translateX(-2px)}
    .ak-d-bar .tabnav.next:hover{transform:translateY(-50%) translateX(2px)}
    .ak-d-bar .tab{font-family:'Inter',sans-serif;font-weight:600;font-size:.88rem;color:var(--muted);padding:7px 16px;border-radius:99px;border:none;background:none;cursor:pointer;transition:.3s;white-space:nowrap}
    .ak-d-bar .tab:hover{color:var(--text)}
    .ak-d-bar .tab.active{color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-2))}
    .ak-d-bar .cs-back{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;font-weight:600;font-size:.88rem;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:99px;padding:7px 15px;cursor:pointer;transition:.25s;white-space:nowrap}
    .ak-d-bar .cs-back:hover{border-color:var(--accent);color:var(--accent)}
    .ak-d-bar .cs-back .arr{transition:transform .3s}
    .ak-d-bar .cs-back:hover .arr{transform:translateX(-4px)}
    /* ---- sticky-tab cover preview (hover to peek on desktop, press-and-hold on touch) ---- */
    .ak-tab-preview{position:fixed;z-index:130;pointer-events:none;width:248px;opacity:0;transform:translateY(-6px) scale(.97);transition:opacity .17s ease,transform .17s cubic-bezier(.2,.7,.3,1);will-change:opacity,transform;display:none}
    .ak-tab-preview.show{opacity:1;transform:none}
    .ak-tab-preview .ak-tp-arrow{position:absolute;top:-6px;width:12px;height:12px;transform:rotate(45deg);background:var(--surface);border-left:1px solid var(--line);border-top:1px solid var(--line);border-radius:3px 0 0 0}
    .ak-tab-preview .ak-tp-card{position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:var(--surface);box-shadow:0 20px 46px -20px rgba(0,0,0,.62),0 3px 10px rgba(0,0,0,.16)}
    .ak-tab-preview .ak-tp-img{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:color-mix(in srgb,var(--accent) 12%,var(--surface))}
    .ak-tab-preview .ak-tp-empty{display:flex;align-items:center;justify-content:center;text-align:center;aspect-ratio:16/10;font-family:'Inter',sans-serif;font-size:.66rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding:0 16px;background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--accent) 7%,transparent) 0 1.5px,transparent 1.5px 16px)}
    .ak-tab-preview .ak-tp-meta{display:flex;flex-direction:column;gap:3px;padding:9px 13px 11px}
    .ak-tab-preview .ak-tp-tag{font-family:'Inter',sans-serif;font-size:.58rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-2)}
    .ak-tab-preview .ak-tp-title{font-family:'Inter',sans-serif;font-weight:600;font-size:.9rem;line-height:1.25;color:var(--text)}
    @media(max-width:640px){.ak-tab-preview{width:196px}.ak-tab-preview .ak-tp-title{font-size:.84rem}}
    .ak-d-hero{position:relative;padding:60px 28px;text-align:center;border-bottom:1px solid var(--line);overflow:hidden}
    /* hairline above the footer — separates the end of the project from the sign-off */
    .ak-d-foot{position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:74px 24px 100px;border-top:1px solid var(--line)}
    .ak-d-foot .mono{display:block;font-family:'Inter',sans-serif;font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent-2)}
    .ak-d-foot h2{font-family:'Inter',sans-serif;font-size:clamp(1.8rem,3.2vw,2.6rem);letter-spacing:-.02em;color:var(--text);margin:0}
    .ak-d-foot .credit{color:var(--muted);font-size:.88rem;margin:0}
    .ak-totop{margin-top:18px;display:inline-flex;align-items:center;gap:9px;font-family:'Inter',sans-serif;font-weight:600;font-size:.9rem;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:99px;padding:11px 22px;cursor:pointer;transition:.25s}
    .ak-totop:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-2px)}
    /* floating back-to-top button (appears once the project detail is scrolled) */
    .ak-fab-top{position:fixed;right:22px;bottom:22px;z-index:60;width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;
      font-size:1.15rem;line-height:1;color:var(--text);background:var(--surface);border:1px solid var(--line);cursor:pointer;
      box-shadow:0 8px 24px rgba(0,0,0,.18);opacity:0;transform:translateY(14px);pointer-events:none;transition:opacity .25s ease,transform .25s ease,border-color .2s ease,color .2s ease}
    .ak-fab-top.show{opacity:1;transform:translateY(0);pointer-events:auto}
    .ak-fab-top:hover{border-color:var(--accent);color:var(--accent)}
    @media(max-width:640px){.ak-fab-top{right:14px;bottom:14px;width:42px;height:42px}}
    body:has(.ak-fab) .ak-fab-top{bottom:82px}
    .ak-d-hero .cover{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.18;
      mask:radial-gradient(80% 80% at 50% 36%,#000,transparent 86%);-webkit-mask:radial-gradient(80% 80% at 50% 36%,#000,transparent 86%)}
    .ak-d-hero .gr{position:absolute;inset:0;background:radial-gradient(92% 58% at 50% -12%,color-mix(in srgb,var(--accent) 6%,transparent),transparent 60%)}
    /* project-home background: looping video and/or giant text watermark behind the hero */
    .ak-d-hero .bgv,.ak-d-hero .bgi{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;
      mask:radial-gradient(88% 92% at 50% 40%,#000,transparent 94%);-webkit-mask:radial-gradient(88% 92% at 50% 40%,#000,transparent 94%)}
    .ak-d-hero .bgt{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;user-select:none;
      font-family:'Inter',sans-serif;font-weight:800;font-size:clamp(3.2rem,15vw,14rem);letter-spacing:.01em;line-height:1;
      text-transform:uppercase;white-space:nowrap;color:color-mix(in srgb,var(--text) 36%,transparent)}
    .ak-d-hero .scrim{position:absolute;inset:0;pointer-events:none;
      background:radial-gradient(62% 58% at 50% 44%,color-mix(in srgb,var(--bg) 82%,transparent) 28%,color-mix(in srgb,var(--bg) 40%,transparent) 62%,transparent 82%)}
    .ak-d-hero .inner{position:relative;max-width:760px;margin:0 auto}
    .ak-d-hero .tag{font-family:'Inter',sans-serif;font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent-2)}
    .ak-d-hero h1{font-family:'Space Grotesk','Inter',sans-serif;font-size:clamp(2rem,5vw,3.3rem);letter-spacing:-.03em;margin:14px 0 16px;color:var(--text);
      background:linear-gradient(180deg,var(--text),color-mix(in srgb,var(--text) 55%,var(--accent)));-webkit-background-clip:text;background-clip:text;color:transparent}
    .ak-d-hero p{color:var(--muted);font-size:1.05rem;max-width:600px;margin:0 auto 26px}
    .ak-meta{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
    .ak-meta .m{display:flex;flex-direction:column;gap:4px;padding:12px 16px;border:1px solid var(--line);border-radius:13px;background:color-mix(in srgb,var(--surface) 55%,transparent);min-width:120px}
    .ak-meta .mk{font-family:'Inter',sans-serif;font-size:.63rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-2)}
    .ak-meta .mv{font-family:'Inter',sans-serif;font-weight:600;font-size:.9rem;color:var(--text)}
    .ak-blocks{max-width:1100px;margin:0 auto;padding:48px 24px 110px;display:grid;grid-template-columns:repeat(6,1fr);gap:18px;grid-auto-flow:dense;align-items:start}
    .ak-blocks>.ak-secgroup,.ak-blocks>.ak-empty{grid-column:1/-1}
    @media(max-width:640px){.ak-blocks,.ak-case-blocks{grid-template-columns:minmax(0,1fr)}.ak-blocks>.ak-block,.ak-case-blocks>.ak-block{grid-column:1/-1 !important;min-width:0}.ak-d-hero{padding-left:24px;padding-right:24px}}
    /* horizontal media-preview slider under the project home/hero */
    .ak-pstrip{max-width:1100px;margin:34px auto 0;padding:0 24px;position:relative}
    .ak-pstrip .ps-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:14px}
    .ak-pstrip .ps-eyebrow{display:inline-flex;align-items:center;gap:10px;font-family:'Inter',sans-serif;font-weight:700;font-size:.62rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
    .ak-pstrip .ps-eyebrow::before{content:"";width:22px;height:2px;border-radius:2px;background:var(--accent);flex:0 0 auto}
    .ak-pstrip .ps-cta{font-family:'Inter',sans-serif;font-weight:600;font-size:.78rem;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:7px 14px;cursor:pointer;white-space:nowrap;transition:border-color .18s ease,color .18s ease}
    .ak-pstrip .ps-cta:hover{border-color:var(--accent);color:var(--accent)}
    .ak-pstrip .ps-row{display:flex;gap:14px;overflow-x:auto;padding:2px 2px 14px;cursor:grab;-webkit-overflow-scrolling:touch;scrollbar-width:thin;scrollbar-color:color-mix(in srgb,var(--accent) 60%,transparent) color-mix(in srgb,var(--line) 55%,transparent)}
    .ak-pstrip .ps-row.dragging{cursor:grabbing}
    .ak-pstrip .ps-row::-webkit-scrollbar{height:6px}
    .ak-pstrip .ps-row::-webkit-scrollbar-track{background:color-mix(in srgb,var(--line) 55%,transparent);border-radius:99px}
    .ak-pstrip .ps-row::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--accent) 65%,transparent);border-radius:99px}
    .ak-pstrip .ps-card{flex:0 0 auto;width:172px;border:1px solid var(--line);border-radius:14px;background:var(--surface);overflow:hidden;text-align:left;padding:0;cursor:pointer;font:inherit;color:inherit;transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease;content-visibility:auto;contain-intrinsic-size:172px 178px}
    .ak-pstrip .ps-card:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--accent) 55%,var(--line));box-shadow:0 10px 26px rgba(0,0,0,.16)}
    .ak-pstrip .ps-thumb{position:relative;height:130px;background:color-mix(in srgb,var(--text) 4%,var(--bg));overflow:hidden}
    .ak-pstrip .ps-thumb img,.ak-pstrip .ps-thumb video{width:100%;height:100%;object-fit:cover;display:block;pointer-events:none}
    .ak-pstrip .ps-fit{position:absolute;top:0;left:0;transform-origin:0 0;pointer-events:none}
    .ak-pstrip .ps-fit iframe{width:100%;height:100%;border:0;display:block;pointer-events:none;background:#fff}
    .ak-pstrip .ps-3d{position:absolute;inset:0;pointer-events:none}
    .ak-pstrip .ps-glyph{display:flex;align-items:center;justify-content:center;height:100%;font-size:1.9rem;color:var(--accent)}
    .ak-pstrip .ps-badge{position:absolute;top:8px;left:8px;font-family:'Inter',sans-serif;font-weight:700;font-size:.54rem;letter-spacing:.14em;text-transform:uppercase;color:#fff;background:color-mix(in srgb,var(--accent-2) 88%,#000);padding:4px 8px;border-radius:99px;pointer-events:none}
    .ak-pstrip .ps-cap{display:flex;flex-direction:column;gap:2px;padding:9px 11px 11px;border-top:1px solid var(--line)}
    .ak-pstrip .ps-num{font-family:'Inter',sans-serif;font-weight:700;font-size:.54rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-2)}
    .ak-pstrip .ps-name{font-family:'Inter',sans-serif;font-weight:600;font-size:.8rem;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .ak-blocktarget{outline:2px solid var(--accent);outline-offset:8px;border-radius:10px;transition:outline-color .5s ease}
    .ak-blocktarget.fade{outline-color:transparent}
    .ak-empty{text-align:center;color:var(--muted);padding:70px 20px;border:1.5px dashed var(--line);border-radius:18px;
      background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--accent) 5%,transparent) 0 1.5px,transparent 1.5px 16px)}
    .ak-empty h4{font-family:'Inter',sans-serif;font-size:1.15rem;color:var(--text);margin:0 0 8px}

    /* blocks */
    .ak-block{position:relative;border:1px solid transparent;border-radius:14px;transition:.2s}
    .ak-block.admin{border-color:transparent;padding:0;background:none;outline:1px dashed color-mix(in srgb,var(--accent) 32%,transparent);outline-offset:-1px;border-radius:12px}
    .ak-block.admin.drag{opacity:.4}
    .ak-block.admin.over{outline-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}
    .ak-btoolbar{position:absolute;top:8px;right:8px;left:auto;z-index:6;display:none;align-items:center;gap:4px;margin:0;padding:3px;border-radius:9px;background:color-mix(in srgb,var(--surface) 90%,transparent);border:1px solid var(--line);box-shadow:0 8px 22px -10px rgba(0,0,0,.5);backdrop-filter:blur(7px)}
    .ak-block.admin .ak-btoolbar{display:flex}
    /* decoration overlay on a content block (shapes/colors/lines/strokes via Layout Studio) */
    .ak-block-deco{position:absolute;inset:0;z-index:3;pointer-events:none;overflow:hidden}
    /* free drag-to-resize handle on a content block */
    .ak-block-resize{position:absolute;right:7px;bottom:7px;z-index:7;width:23px;height:23px;border-radius:7px;cursor:nwse-resize;display:none;
      align-items:center;justify-content:center;color:#fff;background:color-mix(in srgb,var(--accent) 86%,rgba(0,0,0,.4));border:1px solid rgba(255,255,255,.42);box-shadow:0 5px 14px -6px rgba(0,0,0,.55);touch-action:none}
    .ak-block-resize svg{width:12px;height:12px}
    .ak-block-resize:hover{background:var(--accent)}
    .ak-block.admin .ak-block-resize{display:flex}
    .ak-block.ak-block-resizing{outline:2px solid var(--accent)!important;outline-offset:-1px;z-index:40}
    .ak-block.ak-block-resizing .media{transition:none}
    @media(max-width:640px){.ak-block-resize{display:none!important}}
    .ak-btoolbar .grab{cursor:grab;color:var(--muted);display:flex;align-items:center;padding:2px 6px 2px 3px;margin:0;font-family:'Inter',sans-serif;font-size:.52rem;letter-spacing:.1em;text-transform:uppercase;gap:6px;border-right:1px solid var(--line)}
    .ak-btoolbar .grab:active{cursor:grabbing}
    .ak-tb{width:24px;height:24px;border-radius:7px;border:1px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer;
      display:flex;align-items:center;justify-content:center;transition:.15s}
    .ak-tb:hover{border-color:var(--accent);color:var(--accent)}
    .ak-tb.warn:hover{border-color:#ef4444;color:#ef4444}
    .ak-tb svg{width:13px;height:13px}
    .ak-tb[disabled]{opacity:.35;cursor:default}
    .ak-tb-w{width:auto;min-width:24px;padding:0 7px;font-family:'Inter',sans-serif;font-size:.62rem;font-weight:700;letter-spacing:.04em}
    .ak-tb-w span{line-height:1}
    .ak-block[data-bento] .ak-wide,.ak-block[data-bento] .ak-imghold,.ak-block[data-bento] .ak-pdf,.ak-block[data-bento] .ak-3d{height:var(--bh)}
    .ak-block[data-bento] .ak-wide{width:100%;margin-left:0;transform:none}
    .ak-block[data-bento] .media,.ak-block[data-bento] img.media{width:100%;height:100%;object-fit:cover}
    .ak-block[data-bento] .ak-wide iframe.media{height:var(--bh)}
    .ak-wide.ak-haspos{overflow:hidden}
    .ak-wide.ak-haspos .media{object-position:var(--mop,50% 50%);transform:var(--mtf,none);transform-origin:center;max-width:none}
    .ak-wide.ak-haspos img.media,.ak-wide.ak-haspos video.media{object-fit:cover}
    .ak-block.ak-adjusting{outline:2px solid var(--accent);outline-offset:2px;border-radius:14px}
    .ak-adjust-shield{position:absolute;inset:0;z-index:7;cursor:grab;touch-action:none}
    .ak-adjust-shield.drag{cursor:grabbing}
    .ak-adjust-bar{position:absolute;left:10px;right:10px;bottom:10px;z-index:8;display:flex;align-items:center;gap:10px;background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid var(--line);border-radius:11px;padding:7px 11px;backdrop-filter:blur(8px);box-shadow:0 10px 28px -14px rgba(0,0,0,.55)}
    .ak-adjust-bar .ak-adj-ico svg{width:16px;height:16px;color:var(--muted);display:block}
    .ak-adjust-bar input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:5px;border-radius:99px;background:var(--line);outline:none}
    .ak-adjust-bar input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:var(--accent);cursor:pointer;border:2px solid var(--surface)}
    .ak-adjust-bar input[type=range]::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:var(--accent);cursor:pointer;border:2px solid var(--surface)}
    .ak-adjust-bar button{font:600 .74rem 'Inter',sans-serif;border-radius:7px;padding:5px 11px;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--text)}
    .ak-adjust-bar .ak-adj-done{background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;border-color:transparent}
    .ak-adjust-bar .ak-adj-reset{color:var(--muted)}
    /* ---- project-cover move/scale (tiles): pan via background-position, zoom via --cz ---- */
    .ptile-img{transform:scale(var(--cz,1))}
    .ptile:hover .ptile-img{transform:scale(calc(var(--cz,1) * 1.06))}
    .ptile.ak-adjusting{outline:2px solid var(--accent);outline-offset:2px;z-index:30}
    .ptile.ak-adjusting .ptile-img{transition:none}
    .ak-cap{font-family:'Inter',sans-serif;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:10px;text-align:center}
    .ak-block img.media{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line)}
    .ak-imghold{position:relative;min-height:40vh;background:color-mix(in srgb,var(--text) 5%,var(--bg))}
    .ak-imghold.loaded{min-height:0;background:none}
    /* graceful placeholder shown when a block's media file can't be loaded (404 / moved) */
    .ak-missing{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;text-align:center;padding:44px 24px;min-height:220px;color:var(--muted);border:1px dashed color-mix(in srgb,var(--line) 92%,transparent);border-radius:12px;background:color-mix(in srgb,var(--text) 4%,var(--bg))}
    .ak-missing .ak-missing-ic{width:34px;height:34px;color:var(--accent);opacity:.85}
    .ak-missing .ak-missing-ic svg{width:100%;height:100%}
    .ak-missing p{margin:0;font-family:'Inter',sans-serif;font-size:.92rem;color:var(--text)}
    .ak-missing small{font-family:'Inter',sans-serif;font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;opacity:.7}
    .ak-block video.media,.ak-block iframe.media{display:block;width:100%;border-radius:12px;border:1px solid var(--line);background:#000}
    .ak-block iframe.media{height:min(78vh,760px)}
    .ak-block video.media{max-height:80vh}
    .ak-block audio.media{width:100%}
    .ak-pdf{height:min(82vh,860px);border-radius:12px;border:1px solid var(--line);overflow:hidden}
    .ak-pdf iframe{width:100%;height:100%;border:0}
    .ak-text h2{font-family:'Inter',sans-serif;font-size:clamp(1.4rem,3vw,2rem);color:var(--text);margin:0 0 12px;letter-spacing:-.02em}
    .ak-text h3{font-family:'Inter',sans-serif;font-size:clamp(1.05rem,2vw,1.35rem);font-weight:600;color:var(--text);margin:0 0 10px;letter-spacing:-.01em}
    .ak-text p{color:var(--muted);font-size:1.05rem;line-height:1.7;white-space:pre-wrap;max-width:760px}
    .ak-3d{width:100%;height:min(82vh,820px);border-radius:12px;border:1px solid var(--line);background:
      radial-gradient(120% 120% at 50% 0%,color-mix(in srgb,var(--accent) 12%,var(--surface)),var(--surface));overflow:hidden;position:relative}
    .ak-3d model-viewer,.ak-3d canvas{width:100%;height:100%;display:block}
    .ak-3d .fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;color:var(--muted)}

    /* tile admin controls */
    .ak-tile-ctl{position:absolute;top:10px;right:10px;z-index:6;display:none;gap:6px}
    body.ak-on .ak-tile-ctl{display:flex}
    .ak-grip{cursor:grab;touch-action:none}
    .ak-grip:active{cursor:grabbing}
    .ptile[data-ak-item]{cursor:pointer}
    .ak-size-pop{position:fixed;z-index:130;display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:7px;border-radius:12px;border:1px solid var(--line);background:var(--surface);box-shadow:0 20px 46px -18px rgba(0,0,0,.6)}
    .ak-size-opt{font:600 .74rem 'Inter',sans-serif;color:var(--muted);background:color-mix(in srgb,var(--surface) 55%,transparent);border:1px solid var(--line);border-radius:8px;padding:8px 12px;cursor:pointer;white-space:nowrap;transition:color .2s,background .2s,border-color .2s}
    .ak-size-opt:hover{color:var(--text);border-color:var(--accent)}
    .ak-size-opt.on{color:#fff;background:var(--accent);border-color:transparent}
    .ak-fab{position:fixed;right:22px;bottom:22px;z-index:115}
    @media(max-width:640px){.ak-menu{position:fixed;left:12px;right:12px;top:64px;min-width:0}
      .ak-d-bar .inner{padding:8px 16px;gap:10px;flex-wrap:nowrap;justify-content:flex-start}
      .ak-d-bar .cs-back{flex:0 0 auto;padding:7px 13px;font-size:.84rem}
      .ak-d-bar .title{display:none}
      .ak-d-bar .tabbar{flex:1 1 auto;min-width:0;justify-content:flex-start}
      .ak-item-actions{flex:0 0 auto}}
    /* touch targets inside an open project: the sticky bar + in-hero view switch were
       24-31px tall on phones and tablets. Grow the padding (not the type) up to 900px. */
    @media(max-width:900px){
      .ak-d-bar .tab{padding:11px 16px}
      .ak-d-bar .cs-back{padding:11px 14px}
      .ak-d-bar .tabnav{width:38px;height:38px}
      .ak-d-hero .view-bar .seg-btn,.ak-detail .view-bar .seg-btn{padding:10px 12px}
    }
    @media(max-width:640px){.ak-d-bar .cs-back{padding:11px 13px}}
    @media (pointer:coarse){
      .ak-d-bar .tab{padding:11px 16px}
      .ak-d-bar .cs-back{padding:11px 14px}
      .ak-d-bar .tabnav{width:38px;height:38px}
      .ak-d-hero .view-bar .seg-btn,.ak-detail .view-bar .seg-btn{padding:10px 12px}
    }

    /* full-bleed media (matches FinTrack gallery dimensions) */
    .ak-wide{width:min(1600px,93vw);margin-left:50%;transform:translateX(-50%)}
    .ak-wide img.media,.ak-wide video.media,.ak-wide iframe.media{display:block;width:100%;height:auto;border-radius:0;border:0;background:#000}
    .ak-wide iframe.media{height:min(80vh,820px)}
    /* phones + small tablets: 93vw is wider than the padded column, which pushed every media
       block ~14px past the right edge (and made the page scroll sideways) — sit flush instead */
    @media(max-width:700px){
      .ak-detail .ak-wide,.ak-blocks .ak-wide,.ak-case-blocks .ak-wide{width:100%;margin-left:0;transform:none}
      .ak-detail .ak-wide iframe.media{height:min(66vh,600px)}
    }
    /* prototype info header (admin-added prototypes) */
    .ak-proto-info{max-width:760px;margin:0 auto 26px;text-align:center}
    .ak-proto-info .eyebrow{font-family:'Inter',sans-serif;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);display:block;margin-bottom:12px}
    .ak-proto-info h2{font-family:'Inter',sans-serif;font-size:clamp(1.5rem,3vw,2.2rem);letter-spacing:-.02em;color:var(--text);margin:0 0 12px}
    .ak-proto-info p{color:var(--muted);font-size:1.05rem;line-height:1.6;margin:0 0 18px}
    .ak-proto-hint{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
    .ak-proto-hint .chip{display:inline-flex;align-items:center;gap:8px;font-family:'Inter',sans-serif;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:7px 13px;background:color-mix(in srgb,var(--surface) 55%,transparent)}
    .ak-proto-hint .chip .dot{width:6px;height:6px;border-radius:50%;background:var(--accent);flex:none}
    /* admin prototype info stays dark-themed even in light mode */
    [data-theme="light"] .ak-proto-info{--bg:#1C1A14;--surface:#1D1C1A;--line:#373634;
      --text:#FFFFFF;--muted:#C9C8C6;--accent:#E5783A;--accent-2:#C2410C;
      background:#141209;border:1px solid #373634;border-radius:18px;padding:32px 30px}
    .ak-block.admin:has(.ak-wide){outline-color:transparent;background:none;padding:0}
    .ak-block.admin:has(.ak-sec){outline-color:transparent;background:none;padding:0}
    /* section container: a heading plus the media that follows it, grouped in one rounded box.
       Media that flows under a section header is pulled inside the box; a section with no
       files stays compact (just the heading). Grouping is derived from block order. */
    .ak-secgroup{display:grid;grid-template-columns:repeat(6,1fr);gap:20px 18px;align-items:start;border:1px solid var(--line);border-radius:18px;background:var(--surface);box-shadow:0 1px 2px rgba(0,0,0,.05);padding:24px 26px}
    .ak-secgroup .ak-wide{width:100%;margin-left:0;transform:none}
    .ak-secgroup .ak-wide iframe.media{height:min(70vh,680px)}
    .ak-secgroup .ak-block{min-width:0}
    /* standalone section header rendered as a direct grid cell: give it the surface-card look + honor resize height */
    .ak-blocks>.ak-block>.ak-sec,.ak-case-blocks>.ak-block>.ak-sec{border:1px solid var(--line);border-radius:16px;background:var(--surface);padding:24px 26px;box-shadow:0 1px 2px rgba(0,0,0,.05)}
    .ak-block[data-bento]>.ak-sec{min-height:var(--bh);box-sizing:border-box}
    @media(max-width:640px){.ak-secgroup{grid-template-columns:1fr;padding:18px 16px;gap:16px}.ak-secgroup>.ak-block{grid-column:1/-1 !important}}
    /* inline "add content" for pre-existing case studies */
    .ak-case-blocks{display:grid;grid-template-columns:repeat(6,1fr);gap:18px;grid-auto-flow:dense;align-items:start;padding:8px 0 30px}
    .ak-case-blocks>.ak-secgroup,.ak-case-blocks>.ak-empty{grid-column:1/-1}
    .ak-case-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:34px;padding:24px 0 4px;border-top:1px solid var(--line)}
    .ak-case-acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .ak-cs-actions{display:flex;align-items:center;gap:9px}
    .nav-right .ak-cs-actions{display:none}
    body.detail .nav-right .ak-cs-actions{display:flex}
    .ak-case-tag{font-family:'Inter',sans-serif;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-2)}
    body:not(.ak-on) .ak-case-head{display:none}

    /* undo toast */
    .ak-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);z-index:2147483500;
      display:flex;align-items:center;gap:14px;padding:11px 13px 11px 18px;border-radius:13px;
      background:var(--surface);border:1px solid var(--line);box-shadow:0 24px 60px -22px rgba(0,0,0,.55);
      opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;max-width:min(92vw,460px)}
    .ak-toast.on{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}
    .ak-toast .msg{font-family:'Inter',sans-serif;font-weight:500;font-size:.9rem;color:var(--text);margin-right:auto}
    .ak-toast .undo{display:inline-flex;align-items:center;gap:6px;font-family:'Inter',sans-serif;font-weight:600;font-size:.85rem;
      color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);
      border-radius:99px;padding:7px 14px;cursor:pointer;transition:.18s;white-space:nowrap}
    .ak-toast .undo:hover{background:color-mix(in srgb,var(--accent) 20%,transparent)}
    .ak-toast .undo svg{width:14px;height:14px}
    .ak-toast .x{background:none;border:none;color:var(--muted);cursor:pointer;display:flex;padding:5px;border-radius:7px;transition:.15s}
    .ak-toast .x:hover{color:var(--text);background:color-mix(in srgb,var(--text) 8%,transparent)}
    .ak-toast .x svg{width:15px;height:15px}
    .ak-toast.warn{border-color:color-mix(in srgb,var(--accent) 58%,var(--line));box-shadow:0 24px 60px -22px rgba(0,0,0,.55),0 0 0 1px color-mix(in srgb,var(--accent) 18%,transparent)}
    .ak-toast.warn .msg{color:var(--text)}
    ` }));
  }

  /* ============================================================ MODAL */
  function modal(opts) {
    return new Promise(function (resolve) {
      var fieldEls = {};
      var errEl = h("div", { class: "ak-err" });
      var body = (opts.fields || []).map(function (f) {
        var input, holder;
        if (f.type === "textarea") input = h("textarea", { placeholder: f.placeholder || "" });
        else if (f.type === "select") input = h("select", {}, (f.options || []).map(function (o) { return h("option", { value: o.value }, [o.label]); }));
        else if (f.type === "file") {
          var label = h("div", { class: "ak-file" + (f.value ? " has" : "") }, [f.value ? "✓ file ready — click to replace" : (f.placeholder || "Click to choose a file")]);
          var fi = h("input", { type: "file", accept: f.accept || "", multiple: f.multiple ? "multiple" : null, style: "display:none" });
          var removeBtn = f.removable ? h("button", { type: "button", class: "ak-file-remove", style: f.value ? "" : "display:none" }, ["\u2715 Remove"]) : null;
          var cropper = f.crop ? makeCropper(f.cropAspect, function (d) { fieldEls[f.key]._data = d; }) : null;
          fi.addEventListener("change", function () {
            var files = Array.prototype.slice.call(fi.files); if (!files.length) return;
            if (f.multiple && files.length > 1) {
              label.textContent = "Loading " + files.length + " files…";
              Promise.all(files.map(function (file) { return readFileAsDataURL(file).then(function (d) { return { data: d, name: file.name }; }); })).then(function (arr) {
                var el = fieldEls[f.key];
                el._files = arr; el._data = arr[0].data; el._name = arr[0].name;
                label.classList.add("has"); label.textContent = "✓ " + arr.length + " files ready"; if (removeBtn) removeBtn.style.display = "";
                if (cropper) cropper.load(arr[0].data);
              });
              return;
            }
            var file = files[0];
            label.textContent = "Loading " + file.name + "…";
            readFileAsDataURL(file).then(function (d) {
              var el = fieldEls[f.key];
              el._data = d; el._name = file.name; el._files = [{ data: d, name: file.name }];
              label.classList.add("has"); label.textContent = "✓ " + file.name; if (removeBtn) removeBtn.style.display = "";
              if (cropper) cropper.load(d); // cropper overwrites _data with the cropped result
              if (f.onChange) f.onChange(d);
            });
          });
          if (removeBtn) removeBtn.addEventListener("click", function () {
            fieldEls[f.key]._data = ""; fieldEls[f.key]._name = ""; fieldEls[f.key]._files = []; try { fi.value = ""; } catch (e) {}
            label.classList.remove("has"); label.textContent = f.placeholder || "Click to choose a file";
            removeBtn.style.display = "none"; if (cropper) cropper.hide();
            if (f.onChange) f.onChange("");
          });
          holder = h("div", {}, [label, fi, removeBtn, cropper ? cropper.el : null]);
          label.addEventListener("click", function () { fi.click(); });
          input = { _holder: holder, _data: f.value || "", _name: f.name || "", _files: [] };
          fieldEls[f.key] = input;
          if (cropper && f.value) setTimeout(function () { cropper.load(f.value); }, 30);
          return h("div", { class: "ak-field" }, [h("label", {}, [f.label]), holder, f.hint ? h("div", { class: "ak-hint" }, [f.hint]) : null]);
        } else if (f.type === "range") {
          var unit = f.unit || "px";
          var startV = f.value != null && f.value !== "" ? f.value : (f.min || 0);
          var rvLabel = h("span", { style: "font-family:'Inter',sans-serif;font-weight:600;color:var(--text)" }, [startV + unit]);
          input = h("input", { type: "range", min: f.min != null ? f.min : 0, max: f.max != null ? f.max : 100, step: f.step || 1, style: "width:100%;accent-color:var(--accent);cursor:pointer" });
          input.value = startV;
          var rPrev = null, shPrevBox = null;
          if (f.preview === "radius") rPrev = h("div", { style: "height:58px;margin-top:4px;border:1.5px solid var(--accent);background:color-mix(in srgb,var(--accent) 10%,var(--surface));transition:border-radius .15s;border-radius:" + startV + "px" });
          else if (f.preview === "shadow") {
            shPrevBox = h("div", { style: "width:62%;height:42px;border-radius:10px;border:1px solid var(--line);background:var(--surface);transition:box-shadow .18s" });
            shPrevBox.style.boxShadow = shadowCss(startV) || "none";
            rPrev = h("div", { style: "height:92px;margin-top:4px;display:flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid var(--line);background:color-mix(in srgb,var(--bg) 62%,var(--surface))" }, [shPrevBox]);
          } else if (f.preview === "textshadow") {
            shPrevBox = h("div", { style: "font-family:'Inter',sans-serif;font-weight:700;font-size:1.5rem;letter-spacing:-.01em;color:var(--text);transition:text-shadow .18s" }, ["Heading Aa"]);
            shPrevBox.style.textShadow = textShadowCss(startV) || "none";
            rPrev = h("div", { style: "height:76px;margin-top:4px;display:flex;align-items:center;justify-content:center;border-radius:12px;border:1px solid var(--line);background:color-mix(in srgb,var(--bg) 62%,var(--surface))" }, [shPrevBox]);
          }
          input.addEventListener("input", function () {
            rvLabel.textContent = input.value + unit;
            if (rPrev && f.preview === "radius") rPrev.style.borderRadius = input.value + "px";
            if (shPrevBox && f.preview === "shadow") shPrevBox.style.boxShadow = shadowCss(input.value) || "none";
            if (shPrevBox && f.preview === "textshadow") shPrevBox.style.textShadow = textShadowCss(input.value) || "none";
            if (f.onInput) f.onInput(input.value);
          });
          fieldEls[f.key] = input;
          return h("div", { class: "ak-field" }, [
            h("div", { style: "display:flex;justify-content:space-between;align-items:center" }, [h("label", {}, [f.label]), rvLabel]),
            input, rPrev,
            f.hint ? h("div", { class: "ak-hint" }, [f.hint]) : null
          ]);
        } else input = h("input", { type: f.type || "text", placeholder: f.placeholder || "" });
        if (f.type === "custom") { fieldEls[f.key] = { _get: f.get }; return h("div", { class: "ak-field" }, [f.label ? h("label", {}, [f.label]) : null, f.el, f.hint ? h("div", { class: "ak-hint" }, [f.hint]) : null]); }
        if (input.tagName) { if (f.value != null) input.value = f.value; fieldEls[f.key] = input; }
        return h("div", { class: "ak-field" }, [h("label", {}, [f.label]), input, f.hint ? h("div", { class: "ak-hint" }, [f.hint]) : null]);
      });

      var ov = h("div", { class: "ak-ov" });
      function close(val) { ov.remove(); document.removeEventListener("keydown", onKey); resolve(val); }
      function onKey(e) { if (e.key === "Escape") close(null); }
      function collect() {
        var out = {};
        (opts.fields || []).forEach(function (f) {
          var el = fieldEls[f.key];
          if (f.type === "file") { out[f.key] = el._data; out[f.key + "_name"] = el._name; out[f.key + "_files"] = (el._files && el._files.length) ? el._files : (el._data ? [{ data: el._data, name: el._name }] : []); }
          else if (el._get) out[f.key] = el._get();
          else out[f.key] = el.value.trim();
        });
        return out;
      }
      var submit = h("button", { class: "ak-btn", onclick: function () {
        var v = collect();
        if (opts.validate) { var err = opts.validate(v); if (err) { errEl.textContent = err; return; } }
        close(v);
      } }, [opts.submitLabel || "Save"]);

      var m = h("div", { class: "ak-modal" + (opts.compact ? " compact" : "") }, [
        h("h3", {}, [opts.title]),
        opts.sub ? h("div", { class: "sub" }, [opts.sub]) : null
      ].concat(body).concat([errEl, h("div", { class: "ak-acts" }, [
        h("button", { class: "ak-btn ghost", onclick: function () { close(null); } }, ["Cancel"]),
        submit
      ])]));
      ov.appendChild(m);
      ov.addEventListener("click", function (e) { if (e.target === ov) close(null); });
      document.addEventListener("keydown", onKey);
      document.body.appendChild(ov);
      var first = m.querySelector("input,textarea,select"); if (first && first.type !== "file") first.focus();
    });
  }
  function confirmModal(title, sub, danger) {
    return new Promise(function (res) {
      var ov = h("div", { class: "ak-ov" });
      function close(v) { ov.remove(); res(v); }
      ov.appendChild(h("div", { class: "ak-modal", style: "width:min(420px,100%)" }, [
        h("h3", {}, [title]), sub ? h("div", { class: "sub" }, [sub]) : null,
        h("div", { class: "ak-acts" }, [
          h("button", { class: "ak-btn ghost", onclick: function () { close(false); } }, ["Cancel"]),
          h("button", { class: "ak-btn" + (danger ? " danger" : ""), onclick: function () { close(true); } }, [danger ? "Delete" : "Confirm"])
        ])
      ]));
      ov.addEventListener("click", function (e) { if (e.target === ov) close(false); });
      document.body.appendChild(ov);
    });
  }

  /* icons */
  var I = {
    lock: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2"/></svg>',
    cog: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3.2" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    img: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" stroke-width="2"/><circle cx="8.5" cy="9.5" r="1.6" fill="currentColor"/><path d="M5 18l5-5 4 3 3-2 2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 2h8l4 4v16H6z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M14 2v4h4" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    proto: '<svg viewBox="0 0 24 24" fill="none"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
    media: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M10 9.5v5l4-2.5z" fill="currentColor"/></svg>',
    cube: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 2.5l8 4.5v9l-8 4.5-8-4.5v-9z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 11.5l8-4.5M12 11.5v9M12 11.5L4 7" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 6h14M5 12h14M5 18h9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 19V6M6 11l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5v13M6 13l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17v3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    dots: '<svg viewBox="0 0 24 24" fill="none"><circle cx="5" cy="9" r="1.4" fill="currentColor"/><circle cx="5" cy="15" r="1.4" fill="currentColor"/><circle cx="12" cy="9" r="1.4" fill="currentColor"/><circle cx="12" cy="15" r="1.4" fill="currentColor"/><circle cx="19" cy="9" r="1.4" fill="currentColor"/><circle cx="19" cy="15" r="1.4" fill="currentColor"/></svg>',
    dl: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4v11m0 0l-4-4m4 4l4-4M5 19h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    ul: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 20V9m0 0L8 13m4-4l4 4M5 5h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    spacing: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 4h18M3 20h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M12 8v8M10 10l2-2 2 2M10 14l2 2 2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3s6 6.4 6 10.5a6 6 0 0 1-12 0C6 9.4 12 3 12 3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
    shapes: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="2"/><circle cx="16.5" cy="16.5" r="4.5" stroke="currentColor" stroke-width="2"/><path d="M14 4.5l5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    template: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" stroke="currentColor" stroke-width="2"/><path d="M3.5 9h17" stroke="currentColor" stroke-width="2"/><path d="M8 13h8M8 16.5h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
  };

  /* ============================================================ SECTION TEMPLATES
     One ready-made section skeleton per project type. The “Template” button (left of
     “Add content”, inside an open project) APPENDS these styled section titles so every
     project in a category reads with the same recruiter-friendly structure. You then drop
     images / video / prototype / 3D under each. Uses the site's default text styling
     (Inter heading in --text, muted body) — no gradients, matches the current vibe. */
  var SECTION_TS = { align: "left" };
  // Named bento sizes: width = grid column span (of 6), h = fixed card height (0 = natural).
  var SIZE_DEF = {
    full:   { span: 6, h: 0,   label: "Full",   short: "Full"   },
    small:  { span: 2, h: 334, label: "Small",  short: "Small"  },
    medium: { span: 3, h: 334, label: "Medium", short: "Medium" },
    wide:   { span: 4, h: 334, label: "Wide",   short: "Wide"   },
    tall:   { span: 2, h: 510, label: "Tall",   short: "Tall"   },
    hero:   { span: 6, h: 510, label: "Hero",   short: "Hero"   }
  };
  var SIZE_LEGACY = { "two-thirds": "wide", half: "medium", third: "small" };
  function sizeKey(v) { return SIZE_DEF[v] ? v : (SIZE_LEGACY[v] || "full"); }
  function sizeSpan(v) { return SIZE_DEF[sizeKey(v)].span; }
  function sizeH(v) { return SIZE_DEF[sizeKey(v)].h; }
  var SIZE_CYCLE = ["full", "small", "medium", "wide", "tall", "hero"];
  // A block is “in a section” (bento grid) if any earlier block is a section header.
  // ---- media position/scale. Images & video pan via object-position (moves the crop
  // within the card) and zoom via scale; pdf/prototype/3D pan+zoom via transform. Stored as
  // b.pos {x,y,s,mode}, applied through CSS vars on the .ak-wide host so it survives lazy
  // image mounts and works at every bento size (cover crop).
  function posMode(type) { return (type === "image" || type === "media") ? "op" : "tf"; }
  function applyMediaPos(container, b) {
    if (!b.pos) return; var host = container.querySelector(".ak-wide"); if (!host) return;
    host.classList.add("ak-haspos"); host.style.overflow = "hidden"; var p = b.pos;
    if (p.mode === "op") { host.style.setProperty("--mop", p.x + "% " + p.y + "%"); host.style.setProperty("--mtf", "scale(" + (p.s || 1) + ")"); }
    else host.style.setProperty("--mtf", "translate(" + (p.x || 0) + "%," + (p.y || 0) + "%) scale(" + (p.s || 1) + ")");
  }
  function enterAdjust(block, b, rerender) {
    var host = block.querySelector(".ak-wide"); if (!host) return;
    document.querySelectorAll(".ak-adjust-bar,.ak-adjust-shield").forEach(function (n) { n.remove(); });
    document.querySelectorAll(".ak-block.ak-adjusting").forEach(function (n) { n.classList.remove("ak-adjusting"); });
    block.classList.add("ak-adjusting"); block.setAttribute("draggable", "false");
    host.style.position = "relative"; host.style.overflow = "hidden"; host.classList.add("ak-haspos");
    var mode = posMode(b.type);
    var isOP = (mode === "op");
    var def = isOP ? { x: 50, y: 50 } : { x: 0, y: 0 };
    var p = (b.pos && b.pos.mode === mode) ? { x: b.pos.x, y: b.pos.y, s: b.pos.s || 1 } : { x: def.x, y: def.y, s: 1 };
    var apply;
    if (isOP) {
      // images / video: pan the cover crop via object-position — works at any zoom, including 1×
      var clampOP = function () { p.x = Math.max(0, Math.min(100, p.x)); p.y = Math.max(0, Math.min(100, p.y)); };
      apply = function () { clampOP(); host.style.setProperty("--mop", p.x + "% " + p.y + "%"); host.style.setProperty("--mtf", "scale(" + p.s + ")"); };
    } else {
      // pdf / prototype / 3D: pan via translate, clamped to the overflow the zoom exposes
      var clampPan = function () { var lim = Math.max(0, (p.s - 1) * 50); p.x = Math.max(-lim, Math.min(lim, p.x)); p.y = Math.max(-lim, Math.min(lim, p.y)); };
      apply = function () { clampPan(); host.style.setProperty("--mtf", "translate(" + p.x + "%," + p.y + "%) scale(" + p.s + ")"); };
    }
    apply();
    var shield = h("div", { class: "ak-adjust-shield" }); host.appendChild(shield);
    var drag = null;
    shield.addEventListener("pointerdown", function (e) { drag = { x: e.clientX, y: e.clientY, px: p.x, py: p.y }; try { shield.setPointerCapture(e.pointerId); } catch (_) {} shield.classList.add("drag"); });
    shield.addEventListener("pointermove", function (e) {
      if (!drag) return; var r = host.getBoundingClientRect();
      var dx = (e.clientX - drag.x) / r.width * 100, dy = (e.clientY - drag.y) / r.height * 100;
      if (isOP) { p.x = drag.px - dx; p.y = drag.py - dy; } // drag right reveals the right side of the image
      else { p.x = drag.px + dx; p.y = drag.py + dy; }
      apply();
    });
    var end = function () { if (drag) { drag = null; shield.classList.remove("drag"); } };
    shield.addEventListener("pointerup", end); shield.addEventListener("pointercancel", end);
    var zoomIco = '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4-4M8 11h6M11 8v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var zoom = h("input", { type: "range", min: "1", max: "3.5", step: "0.01" }); zoom.value = String(p.s);
    zoom.addEventListener("input", function () { p.s = parseFloat(zoom.value); apply(); });
    zoom.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    var reset = h("button", { class: "ak-adj-reset", type: "button" }, ["Reset"]);
    reset.addEventListener("click", function (e) { e.stopPropagation(); p.x = def.x; p.y = def.y; p.s = 1; zoom.value = "1"; apply(); });
    var done = h("button", { class: "ak-adj-done", type: "button" }, ["Done"]);
    done.addEventListener("click", function (e) {
      e.stopPropagation();
      var isDef = (p.x === def.x && p.y === def.y && p.s === 1);
      if (isDef) delete b.pos; else b.pos = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, s: Math.round(p.s * 100) / 100, mode: mode };
      save().then(function () { keepScroll(rerender || renderDetail)(); });
    });
    var bar = h("div", { class: "ak-adjust-bar" }, [h("span", { class: "ak-adj-ico", html: zoomIco }), zoom, reset, done]);
    bar.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    host.appendChild(bar);
  }
  // ---- cover move/scale for a project tile. Covers are background images on .ptile-img,
  // so pan = background-position (%) and zoom = element scale (via --cz / inline transform).
  // Stored on the item as coverPos {x,y,s} and re-applied in renderTiles for every visitor.
  function enterCoverAdjust(tile, holder, rerender) {
    var img = tile.querySelector(".ptile-img"); if (!img) return;
    document.querySelectorAll(".ak-adjust-bar,.ak-adjust-shield").forEach(function (n) { n.remove(); });
    document.querySelectorAll(".ak-adjusting").forEach(function (n) { n.classList.remove("ak-adjusting"); });
    tile.classList.add("ak-adjusting"); tile.setAttribute("draggable", "false");
    var def = { x: 50, y: 50 };
    var cp = holder.coverPos;
    var p = cp ? { x: cp.x, y: cp.y, s: cp.s || 1 } : { x: def.x, y: def.y, s: 1 };
    var apply = function () { img.style.backgroundPosition = p.x + "% " + p.y + "%"; img.style.transform = "scale(" + p.s + ")"; };
    apply();
    var stop = function (e) { e.stopPropagation(); };
    var shield = h("div", { class: "ak-adjust-shield" }); tile.appendChild(shield);
    shield.addEventListener("click", stop);
    var drag = null;
    shield.addEventListener("pointerdown", function (e) { e.stopPropagation(); drag = { x: e.clientX, y: e.clientY, px: p.x, py: p.y }; try { shield.setPointerCapture(e.pointerId); } catch (_) {} shield.classList.add("drag"); });
    shield.addEventListener("pointermove", function (e) {
      if (!drag) return; var r = tile.getBoundingClientRect();
      p.x = Math.max(0, Math.min(100, drag.px - (e.clientX - drag.x) / r.width * 100));
      p.y = Math.max(0, Math.min(100, drag.py - (e.clientY - drag.y) / r.height * 100));
      apply();
    });
    var end = function () { if (drag) { drag = null; shield.classList.remove("drag"); } };
    shield.addEventListener("pointerup", end); shield.addEventListener("pointercancel", end);
    var zoomIco = '<svg viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/><path d="M21 21l-4-4M8 11h6M11 8v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    var zoom = h("input", { type: "range", min: "1", max: "3.5", step: "0.01" }); zoom.value = String(p.s);
    zoom.addEventListener("input", function () { p.s = parseFloat(zoom.value); apply(); });
    zoom.addEventListener("pointerdown", stop);
    var reset = h("button", { class: "ak-adj-reset", type: "button" }, ["Reset"]);
    reset.addEventListener("click", function (e) { e.stopPropagation(); p.x = def.x; p.y = def.y; p.s = 1; zoom.value = "1"; apply(); });
    var done = h("button", { class: "ak-adj-done", type: "button" }, ["Done"]);
    done.addEventListener("click", function (e) {
      e.stopPropagation();
      var isDef = (p.x === def.x && p.y === def.y && p.s === 1);
      if (isDef) delete holder.coverPos; else holder.coverPos = { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100, s: Math.round(p.s * 100) / 100 };
      save().then(function () { keepScroll(rerender || renderTiles)(); });
    });
    var bar = h("div", { class: "ak-adjust-bar" }, [h("span", { class: "ak-adj-ico", html: zoomIco }), zoom, reset, done]);
    bar.addEventListener("pointerdown", stop); bar.addEventListener("click", stop);
    tile.appendChild(bar);
  }
  // Compact bento-size menu opened from the block toolbar (reuses .ak-size-pop chrome).
  function openBlockSizePop(item, b, btn, rerender) {
    wireSizePop();
    var open = document.querySelector(".ak-size-pop");
    document.querySelectorAll(".ak-size-pop").forEach(function (n) { n.remove(); });
    if (open && open.getAttribute("data-for") === b.id) return; // toggle off
    var cur = sizeKey(b.size);
    var pop = h("div", { class: "ak-size-pop", "data-for": b.id }, SIZE_CYCLE.map(function (k) {
      return h("button", { class: "ak-size-opt" + (k === cur ? " on" : ""), onclick: function (e) {
        e.stopPropagation(); e.preventDefault();
        if (k === "full") delete b.size; else b.size = k;
        delete b.span; delete b.customH;
        document.querySelectorAll(".ak-size-pop").forEach(function (n) { n.remove(); });
        save().then(function () { keepScroll(rerender || renderDetail)(); });
      } }, [SIZE_DEF[k].label]);
    }));
    document.body.appendChild(pop);
    var r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    var top = r.bottom + 6; if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    var left = Math.min(r.right - pw, innerWidth - pw - 8); if (left < 8) left = 8;
    pop.style.top = top + "px"; pop.style.left = left + "px";
  }
  var TEMPLATE_LABEL = { "gen-ai": "AI", "ui-ux": "UI/UX", "3d": "3D" };
  var TEMPLATES = {
    "gen-ai": [
      { heading: "Overview" },
      { heading: "Concept & Brief" },
      { heading: "Prompt & Process" },
      { heading: "Hero Shot" },
      { heading: "Before \u2192 After" },
      { heading: "Output Gallery" },
      { heading: "Variations" },
      { heading: "Final Showcase" }
    ],
    "ui-ux": [
      { heading: "Overview", body: "Introduce the product in a line or two \u2014 what it is, who it's for, and your role, timeline and tools." },
      { heading: "Problem", body: "What user or business problem existed, and why did it matter?" },
      { heading: "Research", body: "What did you learn? Insights, interviews, competitor scans and the key findings that shaped the work." },
      { heading: "Solution", body: "How you solved it \u2014 your process, flows, key features and the decisions behind them." },
      { heading: "Impact", body: "What changed? Metrics or qualitative outcomes." },
      { heading: "Reflection", body: "What you learned, and what you'd improve next time." }
    ],
    "3d": [
      { heading: "Overview" },
      { heading: "Hero Render" },
      { heading: "Detail Renders" },
      { heading: "Wireframe & Breakdown" },
      { heading: "3D Model" },
      { heading: "Final Shots" }
    ]
  };

  /* ============================================================ AUTH */
  function isUnlocked() { return UNLOCKED || sessionStorage.getItem(SESSION_KEY) === "1"; }
  function setupPassword() {
    return modal({
      title: "Set your admin password",
      sub: "This protects the admin tools. You'll enter it to make changes. Stored only in your browser.",
      fields: [
        { key: "p1", label: "New password", type: "password", placeholder: "Choose a strong password" },
        { key: "p2", label: "Confirm password", type: "password", placeholder: "Re-enter password" }
      ],
      submitLabel: "Set password",
      validate: function (v) { if (!v.p1 || v.p1.length < 4) return "Use at least 4 characters."; if (v.p1 !== v.p2) return "Passwords don't match."; }
    }).then(function (v) {
      if (!v) return false;
      return sha256(v.p1).then(function (hash) { localStorage.setItem(PW_KEY, hash); sessionStorage.setItem(SESSION_KEY, "1"); UNLOCKED = true; return true; });
    });
  }
  function login() {
    return modal({
      title: "Admin login", sub: "Enter your password to unlock editing.",
      fields: [{ key: "p", label: "Password", type: "password", placeholder: "Your password" }],
      submitLabel: "Unlock"
    }).then(function (v) {
      if (!v) return false;
      return sha256(v.p).then(function (hash) {
        if (hash === storedPW()) { sessionStorage.setItem(SESSION_KEY, "1"); UNLOCKED = true; return true; }
        alert("Incorrect password."); return false;
      });
    });
  }
  function changePassword() {
    return modal({
      title: "Change password",
      fields: [
        { key: "cur", label: "Current password", type: "password" },
        { key: "p1", label: "New password", type: "password" },
        { key: "p2", label: "Confirm new password", type: "password" }
      ], submitLabel: "Update",
      validate: function (v) { if (!v.p1 || v.p1.length < 4) return "Use at least 4 characters."; if (v.p1 !== v.p2) return "Passwords don't match."; }
    }).then(function (v) {
      if (!v) return;
      return sha256(v.cur).then(function (cur) {
        if (cur !== storedPW()) { alert("Current password is incorrect."); return; }
        return sha256(v.p1).then(function (nh) { localStorage.setItem(PW_KEY, nh); showBakeHash(nh); });
      });
    });
  }
  // Show the new hash + the exact code line so the owner can make the new password
  // site-wide (update BAKED_PW in admin.js and redeploy). Owner stays in full control.
  function showBakeHash(nh) {
    var line = 'var BAKED_PW = "' + nh + '";';
    var ov = h("div", { class: "ak-ov" });
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    function onKey(e) { if (e.key === "Escape") close(); }
    var code = h("textarea", { readonly: "", style: "width:100%;min-height:70px;resize:none;font-family:'Inter',sans-serif;font-size:.78rem;line-height:1.5;color:var(--text);background:color-mix(in srgb,var(--bg) 60%,var(--surface));border:1px solid var(--line);border-radius:10px;padding:11px 13px" });
    code.value = line;
    var copyBtn = h("button", { class: "ak-btn ghost", html: I.dl + "<span>Copy code line</span>", onclick: function () {
      code.select(); try { document.execCommand("copy"); } catch (e) {}
      try { if (navigator.clipboard) navigator.clipboard.writeText(line); } catch (e) {}
      copyBtn.querySelector("span").textContent = "Copied \u2713";
    } });
    var m = h("div", { class: "ak-modal", style: "width:min(560px,100%)" }, [
      h("h3", {}, ["Password changed on this browser"]),
      h("div", { class: "sub" }, ["It works here right now. To make it the password for the whole live site (every browser & device), do the two steps below \u2014 you stay in full control of the master password."]),
      h("div", { class: "ak-field" }, [
        h("label", {}, ["1 \u00b7 Replace this line in admin.js"]),
        code,
        h("div", { class: "ak-hint" }, ["Find the existing line that starts with \u201cvar BAKED_PW =\u201d near the top of admin.js and replace it with this one."])
      ]),
      h("div", { class: "ak-hint", style: "margin-top:-4px" }, ["2 \u00b7 Save the file and redeploy (push to GitHub \u2014 Vercel redeploys automatically)."]),
      h("div", { class: "ak-acts" }, [
        copyBtn,
        h("button", { class: "ak-btn", onclick: close }, ["Done"])
      ])
    ]);
    ov.appendChild(m);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
  }
  function requestUnlock() {
    if (!storedPW()) return setupPassword();
    if (!isUnlocked()) return login();
    return Promise.resolve(true);
  }

  /* ============================================================ HEADER UI */
  var menuEl, btnEl;
  function buildHeaderButton() {
    var navRight = $(".nav-right") || $(".nav");
    var wrap = h("div", { class: "ak-wrap" });
    btnEl = h("button", { class: "ak-btn ak-admin-toggle", title: "Admin — locked", "aria-label": "Admin — locked", html: I.cog + '<span class="ak-dot"></span>' });
    menuEl = h("div", { class: "ak-menu" });
    wrap.appendChild(btnEl); document.body.appendChild(menuEl);
    if (navRight) {
      var toggle = navRight.querySelector(".theme-toggle");
      navRight.insertBefore(wrap, toggle || null);
    } else document.body.appendChild(h("div", { class: "ak-fab" }, [wrap]));

    // Left-nav "Layout Studio" entry (admin-only; project pages in STUDIO_PAGES).
    // Opens the currently-open project in the whole-project Studio; on the grid it
    // starts a new project from the category template.
    if (studioEnabled()) {
      var navBar = navRight || $(".nav");
      if (navBar) {
        var lsBtn = h("button", { class: "ak-ls-nav", title: "Open in Layout Studio", html: I.shapes + "<span>Layout Studio</span>",
          onclick: function (e) {
            e.preventDefault(); e.stopPropagation();
            if (openItemId) { var it = DATA.items.find(function (x) { return x.id === openItemId; }); if (it) return openProjectStudio(it); }
            newProjectStudio();
          } });
        navBar.insertBefore(lsBtn, navBar.firstChild);
      }
    }

    btnEl.addEventListener("click", function (e) {
      e.stopPropagation();
      openCaseKey = null;
      if (!isUnlocked()) { requestUnlock().then(function (ok) { if (ok) { syncMode(); openMenu(); } }); return; }
      if (menuEl.classList.contains("on")) closeMenu(); else openMenu();
    });
    document.addEventListener("click", function (e) { if (menuEl.contains(e.target) || wrap.contains(e.target) || e.target.closest("[data-ak-trigger]")) return; closeMenu(); });
  }
  function openMenu() { renderMenu(); menuEl.classList.add("on"); }
  function closeMenu() { menuEl.classList.remove("on"); }

  function mi(icon, label, onclick, warn) {
    return h("button", { class: "ak-mi" + (warn ? " warn" : ""), onclick: function () { closeMenu(); onclick(); } },
      [h("span", { class: "ico", html: icon }), h("span", {}, [label])]);
  }
  function renderMenu() {
    menuEl.innerHTML = "";
    if (openCaseKey) {
      menuEl.appendChild(h("div", { class: "ak-label" }, ["Add to this case study"]));
      menuEl.appendChild(mi(I.img, "Add image", function () { addBlock("image"); }));
      menuEl.appendChild(mi(I.pdf, "Add PDF", function () { addBlock("pdf"); }));
      menuEl.appendChild(mi(I.proto, "Add prototype", function () { addBlock("prototype"); }));
      menuEl.appendChild(mi(I.media, "Add video / audio", function () { addBlock("media"); }));
      menuEl.appendChild(mi(I.cube, "Add 3D model", function () { addBlock("model"); }));
      menuEl.appendChild(mi(I.text, "Add text block", function () { addBlock("text"); }));
      menuEl.appendChild(h("div", { class: "ak-sep" }));
      menuEl.appendChild(h("div", { class: "ak-label" }, ["Layout Studio"]));
      menuEl.appendChild(mi(I.shapes, "Open Layout Studio", function () { openStudio(currentCtx().obj, null, currentCtx().rerender); }));
      menuEl.appendChild(h("div", { class: "ak-sep" }));
      menuEl.appendChild(h("div", { class: "ak-label" }, ["Appearance"]));
      menuEl.appendChild(mi(I.spacing, "Content spacing", function () { editSpacing(); }));
      menuEl.appendChild(mi(I.palette, "Background color", function () { editBackground(); }));
      menuEl.appendChild(h("div", { class: "ak-sep" }));
      menuEl.appendChild(mi(I.edit, "Edit case details", function () { editCase(openCaseKey); }));
      menuEl.appendChild(mi(I.trash, "Delete this case study", (function () { var k = openCaseKey; return function () { deleteCase(k); }; })(), true));
    } else if (openItemId) {
      var it = DATA.items.find(function (x) { return x.id === openItemId; });
      menuEl.appendChild(h("div", { class: "ak-label" }, ["Add to this " + CFG.noun]));
      menuEl.appendChild(mi(I.img, "Add image", function () { addBlock("image"); }));
      menuEl.appendChild(mi(I.pdf, "Add PDF", function () { addBlock("pdf"); }));
      menuEl.appendChild(mi(I.proto, "Add prototype", function () { addBlock("prototype"); }));
      menuEl.appendChild(mi(I.media, "Add video / audio", function () { addBlock("media"); }));
      menuEl.appendChild(mi(I.cube, "Add 3D model", function () { addBlock("model"); }));
      menuEl.appendChild(mi(I.text, "Add text block", function () { addBlock("text"); }));
      menuEl.appendChild(h("div", { class: "ak-sep" }));
      menuEl.appendChild(h("div", { class: "ak-label" }, ["Layout Studio"]));
      if (studioEnabled()) {
        menuEl.appendChild(mi(I.shapes, "Open project in Layout Studio", function () { openProjectStudio(it); }));
        if (it.studio && it.studio.els && it.studio.els.length) menuEl.appendChild(mi(I.template, "Reset Studio layout \u2014 back to project media", function () { resetProjectStudio(it); }));
      } else {
        menuEl.appendChild(mi(I.shapes, "Open Layout Studio", function () { openStudio(currentCtx().obj, null, currentCtx().rerender); }));
      }
      menuEl.appendChild(h("div", { class: "ak-sep" }));
      menuEl.appendChild(h("div", { class: "ak-label" }, ["Appearance"]));
      menuEl.appendChild(mi(I.spacing, "Content spacing", function () { editSpacing(); }));
      menuEl.appendChild(mi(I.palette, "Background color", function () { editBackground(); }));
      menuEl.appendChild(mi(I.media, "Home background (text / video)", function () { editHomeBg(); }));
      menuEl.appendChild(h("div", { class: "ak-sep" }));
      menuEl.appendChild(mi(I.edit, "Edit " + CFG.noun + " details", function () { editItem(it); }));
      menuEl.appendChild(mi(I.trash, "Delete this " + CFG.noun, function () { deleteItem(it); }, true));
    } else {
      menuEl.appendChild(h("div", { class: "ak-label" }, [CFG.noun + "s"]));
      menuEl.appendChild(mi(I.plus, "Add " + CFG.noun, function () { editItem(null); }));
      menuEl.appendChild(mi(I.shapes, "New " + CFG.noun + " — Layout Studio", function () { editItem(null, studioEnabled() ? "project" : true); }));
    }
    menuEl.appendChild(h("div", { class: "ak-sep" }));
    menuEl.appendChild(h("div", { class: "ak-label" }, ["Publish & account"]));
    menuEl.appendChild(mi(I.dl, "Export site data", exportData));
    menuEl.appendChild(mi(I.ul, "Import site data", importData));
    menuEl.appendChild(mi(I.img, "Optimise images", optimiseMedia));
    menuEl.appendChild(mi(I.lock, "Change password", changePassword));
    menuEl.appendChild(mi(I.lock, "Lock admin", function () { sessionStorage.removeItem(SESSION_KEY); UNLOCKED = false; syncMode(); }, true));
  }

  function syncMode() {
    document.body.classList.toggle("ak-on", isUnlocked());
    if (btnEl) { var on = isUnlocked(); btnEl.title = on ? "Admin — active (click for menu)" : "Admin — locked (click to unlock)"; btnEl.setAttribute("aria-label", btnEl.title); }
    renderTiles(); renderCases(); if (openItemId) renderDetail();
  }

  /* ============================================================ DRAG REORDER (projects + sticky tab bar) — pointer based, works on touch */
  var _akDrag = { id: null, el: null, start: null, moved: false }, _akSuppressTap = 0;
  function reorderItem(fromId, toId) {
    var a = DATA.items, fi = -1, ti = -1;
    for (var i = 0; i < a.length; i++) { if (a[i].id === fromId) fi = i; if (a[i].id === toId) ti = i; }
    if (fi < 0 || ti < 0 || fi === ti) return;
    a.splice(ti, 0, a.splice(fi, 1)[0]);
    renderTiles();
    save();
  }
  function _akClearOver() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-ak-item],[data-ak-item-tab]"), function (n) { n.style.outline = ""; n.style.outlineOffset = ""; });
  }
  function _akTargetUnder(x, y, selfId) {
    var stack = document.elementsFromPoint ? document.elementsFromPoint(x, y) : [document.elementFromPoint(x, y)];
    for (var i = 0; i < stack.length; i++) {
      var n = stack[i] && stack[i].closest && stack[i].closest("[data-ak-item],[data-ak-item-tab]");
      if (n) { var nid = n.getAttribute("data-ak-item") || n.getAttribute("data-ak-item-tab"); if (nid && nid !== selfId) return n; }
    }
    return null;
  }
  // el = the reorderable item; handle = optional child to grab from (defaults to el). Works with mouse, pen and touch.
  function makeDraggable(el, id, handle) {
    var grip = handle || el;
    grip.style.cursor = "grab";
    grip.style.touchAction = "none";
    grip.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button > 0) return;
      if (!handle && e.target.closest && e.target.closest(".ak-tile-ctl")) return; // let edit/delete buttons work
      _akDrag.id = id; _akDrag.el = el; _akDrag.moved = false; _akDrag.start = { x: e.clientX, y: e.clientY };
      try { grip.setPointerCapture(e.pointerId); } catch (er) {}
    });
    grip.addEventListener("pointermove", function (e) {
      if (_akDrag.id !== id) return;
      if (!_akDrag.moved) {
        if (Math.abs(e.clientX - _akDrag.start.x) + Math.abs(e.clientY - _akDrag.start.y) < 8) return;
        _akDrag.moved = true; el.style.opacity = ".45"; grip.style.cursor = "grabbing"; document.body.style.userSelect = "none";
      }
      e.preventDefault();
      _akClearOver();
      var t = _akTargetUnder(e.clientX, e.clientY, id);
      if (t) { t.style.outline = "2px dashed var(--accent)"; t.style.outlineOffset = "2px"; }
    });
    function finish(e) {
      if (_akDrag.id !== id) return;
      try { grip.releasePointerCapture(e.pointerId); } catch (er) {}
      el.style.opacity = ""; grip.style.cursor = "grab"; document.body.style.userSelect = "";
      var moved = _akDrag.moved, t = moved ? _akTargetUnder(e.clientX, e.clientY, id) : null;
      _akClearOver(); _akDrag.id = null; _akDrag.el = null;
      if (moved) {
        _akSuppressTap = Date.now();
        var toId = t && (t.getAttribute("data-ak-item") || t.getAttribute("data-ak-item-tab"));
        if (toId && toId !== id) reorderItem(id, toId);
      }
    }
    grip.addEventListener("pointerup", finish);
    grip.addEventListener("pointercancel", finish);
    // swallow the tap that fires right after a drag so we don't open the project
    el.addEventListener("click", function (e) { if (Date.now() - _akSuppressTap < 350) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  }

  /* ============================================================ TILES (index) */
  function tileGrid() { return $(CFG.gridSelector); }
  /* ---- per-card bento size control ---- */
  var TILE_SIZES = [["s", "Small"], ["m", "Medium"], ["l", "Large"], ["t", "Tall"], ["w", "Wide"], ["hero", "Hero"]];
  var I_SIZE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  function tileSize(it) { return it.size || (it.featured ? "hero" : (it.cover ? "m" : "s")); }
  var _sizePopWired = false;
  function wireSizePop() {
    if (_sizePopWired) return; _sizePopWired = true;
    document.addEventListener("click", function (e) {
      if (e.target.closest(".ak-size-pop") || e.target.closest("[data-ak-size-btn]")) return;
      document.querySelectorAll(".ak-size-pop").forEach(function (n) { n.remove(); });
    });
    addEventListener("scroll", function () { document.querySelectorAll(".ak-size-pop").forEach(function (n) { n.remove(); }); }, { passive: true });
  }
  function openSizePop(it, btn) {
    wireSizePop();
    var open = document.querySelector(".ak-size-pop");
    document.querySelectorAll(".ak-size-pop").forEach(function (n) { n.remove(); });
    if (open && open.getAttribute("data-for") === it.id) return; // toggle off
    var cur = tileSize(it);
    var tileEl = btn.closest(".ptile");
    if (tileEl) { var mm = tileEl.className.match(/ptile-(s|m|l|t|w|hero)\b/); if (mm) cur = mm[1]; }
    var pop = h("div", { class: "ak-size-pop", "data-for": it.id }, TILE_SIZES.map(function (s) {
      return h("button", { class: "ak-size-opt" + (s[0] === cur ? " on" : ""), onclick: function (e) {
        e.stopPropagation(); e.preventDefault();
        it.size = s[0]; it.featured = (s[0] === "hero");
        save().then(function () { renderTiles(); });
      } }, [s[1]]);
    }));
    document.body.appendChild(pop);
    var r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight;
    var top = r.bottom + 6; if (top + ph > innerHeight - 8) top = Math.max(8, r.top - ph - 6);
    var left = Math.min(r.right - pw, innerWidth - pw - 8); if (left < 8) left = 8;
    pop.style.top = top + "px"; pop.style.left = left + "px";
  }
  function renderTiles() {
    var grid = tileGrid(); if (!grid) return;
    grid.querySelectorAll("[data-ak-item]").forEach(function (n) { n.remove(); });
    var tileAnchor = grid.querySelector(".ptile[data-case]"); // newest items render before any built-in case tiles
    DATA.items.forEach(function (it) {
      var cp = it.coverPos;
      var cpos = cp ? (cp.x + "% " + cp.y + "%") : "center";
      var czoom = cp ? (cp.s || 1) : 1;
      var coverStyle = it.cover
        ? "background:url('" + dataURLtoBlobURL(it.cover) + "') " + cpos + "/cover no-repeat;--cz:" + czoom
        : "";
      var grip = isUnlocked() ? h("button", { class: "ak-tb ak-grip", title: "Drag to reorder", html: I.dots, onclick: function (e) { e.stopPropagation(); e.preventDefault(); } }) : null;
      var curSz = tileSize(it);
      var sizeBtn = h("button", { class: "ak-tb", "data-ak-size-btn": "1", title: "Card size (" + curSz + ")", "aria-label": "Card size", html: I_SIZE, onclick: function (e) { e.stopPropagation(); e.preventDefault(); openSizePop(it, e.currentTarget); } });
      var adjustBtn = it.cover ? h("button", { class: "ak-tb", title: "Move / scale cover \u2014 drag to reposition, slider to zoom", html: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', onclick: function (e) { e.stopPropagation(); e.preventDefault(); enterCoverAdjust(tile, it, function () { renderTiles(); }); } }) : null;
      var ctl = h("div", { class: "ak-tile-ctl" }, [
        grip,
        sizeBtn,
        adjustBtn,
        h("button", { class: "ak-tb", title: "Edit", html: I.edit, onclick: function (e) { e.stopPropagation(); editItem(it); } }),
        h("button", { class: "ak-tb warn", title: "Delete", html: I.trash, onclick: function (e) { e.stopPropagation(); deleteItem(it); } })
      ]);
      var tile = h(CFG.tileTag, { class: "ptile ptile-" + curSz + (it.cover ? "" : " ptile-empty"), "data-ak-item": it.id, tabindex: "0", role: "button", "aria-label": "Open " + (it.title || CFG.noun || "project"), style: "opacity:1;transform:none" }, [
        ctl,
        h("div", { class: "ptile-img", role: "img", style: coverStyle }, it.label ? [h("span", { class: "ph-label" }, [it.label])] : []),
        h("div", { class: "ptile-body" }, [
          h("h3", {}, [it.title || "Untitled"]),
          h("span", { class: "ptile-tag" }, [it.tag || "Project"])
        ]),
        h("span", { class: "ptile-go", "aria-hidden": "true", title: "Open project" }, [
          h("span", { class: "arr" }, ["\u2192"])
        ])
      ]);
      tile.addEventListener("click", function () { openDetail(it.id); });
      var warmTile = function () { warmSrcs(itemImageSrcs(it), 6); };
      tile.addEventListener("pointerenter", warmTile);
      tile.addEventListener("focus", warmTile);
      tile.addEventListener("touchstart", warmTile, { passive: true });
      tile.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") { e.preventDefault(); openDetail(it.id); } });
      // a cover whose file is missing would render as a blank tile — degrade to the placeholder look
      if (it.cover && String(it.cover).slice(0, 5) !== "data:") {
        (function (t) {
          var probe = new Image();
          probe.onerror = function () {
            t.classList.add("ptile-empty");
            var im = t.querySelector(".ptile-img");
            if (im) im.style.background = "";
          };
          probe.src = it.cover;
        })(tile);
      }
      if (isUnlocked()) makeDraggable(tile, it.id, grip);
      grid.insertBefore(tile, tileAnchor);
    });
    // Bento fallback: if no card has an explicit size/feature, promote the first real
    // tile to hero size so the layout always reads intentionally (no empty grid cells).
    if (!DATA.items.some(function (x) { return x.size || x.featured; })) {
      var firstReal = grid.querySelector(".ptile[data-ak-item]:not(.ptile-empty)") || grid.querySelector(".ptile[data-ak-item]");
      if (firstReal) { firstReal.classList.remove("ptile-s", "ptile-m", "ptile-l", "ptile-t", "ptile-w"); firstReal.classList.add("ptile-hero"); }
    }
    /* let the page's Canvas/Grid toggle re-measure the new tiles (grid view sizes each to its file) */
    document.dispatchEvent(new CustomEvent("ak-tiles-rendered"));
    renderItemTabs();
    if (!saveData()) whenIdle(function () {   /* first screens of the likeliest opens, after the wall itself is done */
      DATA.items.slice(0, 2).forEach(function (x) { warmSrcs(itemImageSrcs(x), 3); });
    }, 2500);
  }

  /* ---- built-in (non-removed) case-study tabs declared in the page ---- */
  function builtinTabs() {
    return Array.prototype.map.call(document.querySelectorAll(".cs-detail .tabbar .tab[data-tab]"), function (t) {
      return { key: t.getAttribute("data-tab"), label: t.textContent, hidden: t.style.display === "none" };
    }).filter(function (x) { return !x.hidden; });
  }
  /* ---- mirror admin-created case studies into the sticky tab bar ---- */
  function renderItemTabs() {
    var tabbar = document.querySelector(".cs-detail .tabbar");
    if (!tabbar) return;
    tabbar.querySelectorAll("[data-ak-item-tab]").forEach(function (n) { n.remove(); });
    var tabAnchor = tabbar.querySelector(".tab[data-tab]"); // newest items appear before built-in tabs
    DATA.items.forEach(function (it) {
      var tab = h("button", { class: "tab" + (openItemId === it.id ? " active" : ""), role: "tab", "data-ak-item-tab": it.id,
        onclick: function () { openDetail(it.id); } }, [it.title || "Untitled"]);
      if (isUnlocked()) makeDraggable(tab, it.id);
      tabbar.insertBefore(tab, tabAnchor);
    });
  }

  /* ============================================================ SEEDS (pre-existing tiles) */
  function adoptSeeds() {
    var grid = tileGrid(); if (!grid) return Promise.resolve();
    var seeds = grid.querySelectorAll("[data-ak-seed]");
    if (!seeds.length) return Promise.resolve();
    var changed = false;
    DATA.removedSeeds = DATA.removedSeeds || [];
    Array.prototype.forEach.call(seeds, function (node) {
      var s; try { s = JSON.parse(node.getAttribute("data-ak-seed")); } catch (e) { return; }
      if (!s || !s.id) return;
      node.style.display = "none";
      if (DATA.removedSeeds.indexOf(s.id) >= 0) return;
      if (!DATA.items.some(function (x) { return x.id === s.id; })) {
        DATA.items.push({ id: s.id, title: s.title || "", tag: s.tag || "", label: s.label || "", desc: s.desc || "", cover: "", meta: s.meta || {}, blocks: [], seeded: true });
        changed = true;
      }
    });
    return changed ? save() : Promise.resolve();
  }

  /* ============================================================ INLINE CASES (add content to existing case studies) */
  function adoptCases() {
    var mounts = document.querySelectorAll("[data-ak-case]");
    DATA.cases = DATA.cases || {};
    Array.prototype.forEach.call(mounts, function (m) {
      var key = m.getAttribute("data-ak-case");
      DATA.cases[key] = DATA.cases[key] || { blocks: [] };
    });
  }
  function renderCases() {
    var mounts = document.querySelectorAll("[data-ak-case]");
    renderCaseActions();
    renderCaseTiles();
    if (!mounts.length) return;
    var admin = isUnlocked();
    Array.prototype.forEach.call(mounts, function (m) {
      var key = m.getAttribute("data-ak-case");
      var store = caseStore(key);
      applyCaseInfo(key);
      var panel = document.querySelector('.panel[data-panel="' + key + '"]');
      if (panel) {
        panel.style.background = store.bg || "";
        var ph = panel.querySelector(".hero"); if (ph) ph.style.background = store.bg ? "var(--bg)" : "";
        var pf = panel.querySelector(".cs-foot"); if (pf) pf.style.background = store.bg ? "var(--bg)" : "";
      }
      m.innerHTML = "";
      if (!store.blocks.length && !admin) return;
      if (admin) {
        m.appendChild(h("div", { class: "ak-case-head" }, [
          h("span", { class: "ak-case-tag" }, [store.blocks.length ? "Added content" : "Use \u201cAdd content\u201d (top right) to add images, video, prototypes and more"])
        ]));
      }
      var wrap = h("div", { class: "ak-case-blocks" });
      if (store.spacing != null) wrap.style.gap = store.spacing + "px";
      store.blocks.forEach(function (b, i) { wrap.appendChild(renderBlock(store, b, i, admin, renderCases)); });
      var cstrip = buildMediaStrip(store, wrap);
      if (cstrip) m.appendChild(cstrip);
      m.appendChild(wrap);
    });
  }
  // Edit / delete controls on the cover of each built-in case-study card, plus hide deleted ones.
  function renderCaseTiles() {
    DATA.removedCases = DATA.removedCases || [];
    var admin = isUnlocked();
    Array.prototype.forEach.call(document.querySelectorAll(".ptile[data-case]"), function (tile) {
      var key = tile.getAttribute("data-case");
      var removed = DATA.removedCases.indexOf(key) >= 0;
      tile.style.display = removed ? "none" : "";
      var tab = document.querySelector('.tab[data-tab="' + key + '"]'); if (tab) tab.style.display = removed ? "none" : "";
      var ex = tile.querySelector(".ak-tile-ctl"); if (ex) ex.remove();
      if (admin && !removed) {
        tile.appendChild(h("div", { class: "ak-tile-ctl" }, [
          h("button", { class: "ak-tb", title: "Edit details & cover", html: I.edit, onclick: function (e) { e.preventDefault(); e.stopPropagation(); editCase(key); } }),
          h("button", { class: "ak-tb warn", title: "Delete case study", html: I.trash, onclick: function (e) { e.preventDefault(); e.stopPropagation(); deleteCase(key); } })
        ]));
      }
    });
  }
  function deleteCase(key) {
    var tile = document.querySelector('.ptile[data-case="' + key + '"]');
    var nm = tile ? ((tile.querySelector("h3") || {}).textContent || "this case study") : "this case study";
    confirmModal("Delete \u201c" + nm + "\u201d?", "This removes the case study, its tab and its card.", true).then(function (ok) {
      if (!ok) return;
      DATA.removedCases = DATA.removedCases || [];
      if (DATA.removedCases.indexOf(key) < 0) DATA.removedCases.push(key);
      save().then(function () {
        var active = document.querySelector(".cs-detail .panel.active");
        if (active && active.getAttribute("data-panel") === key) { var b = document.getElementById("csBack"); if (b) b.click(); }
        renderCases();
      });
      showUndoToast("Deleted \u201c" + nm + "\u201d", function () {
        DATA.removedCases = (DATA.removedCases || []).filter(function (x) { return x !== key; });
        save().then(function () { renderCases(); });
      });
    });
  }
  function activeCaseKey() { var p = document.querySelector(".cs-detail .panel.active"); return p ? p.getAttribute("data-panel") : null; }
  function renderCaseActions() {
    if (!document.querySelector("[data-ak-case]")) return;
    var navRight = document.querySelector(".nav-right");
    if (!navRight) return;
    var existing = navRight.querySelector(".ak-cs-actions");
    if (existing) existing.remove();
    var group;
    if (isUnlocked()) {
      group = h("div", { class: "ak-cs-actions" }, [
        h("button", { class: "ak-btn", "data-ak-trigger": "1", html: I.plus + "<span>Add content</span>",
          onclick: function (e) { e.stopPropagation(); var k = activeCaseKey(); if (!k) return; openItemId = null; openCaseKey = k; openMenu(); } })
      ]);
    } else {
      group = h("div", { class: "ak-cs-actions" }, [
        h("button", { class: "ak-btn ak-admin-toggle", title: "Admin — locked (click to unlock)", "aria-label": "Admin — locked (click to unlock)", html: I.cog + '<span class="ak-dot"></span>',
          onclick: function (e) { e.stopPropagation(); requestUnlock().then(function (ok) { if (ok) syncMode(); }); } })
      ]);
    }
    navRight.insertBefore(group, navRight.firstChild);
  }

  /* ---------- editable case-study hero / card / tab ---------- */
  function applyCaseInfo(key) {
    var info = (DATA.cases[key] || {}).info; if (!info) return;
    var panel = document.querySelector('.panel[data-panel="' + key + '"]');
    if (panel) {
      if (info.eyebrow != null) { var e = panel.querySelector(".hero-eyebrow"); if (e) e.textContent = info.eyebrow; }
      if (info.title != null) { var t = panel.querySelector(".hero-title"); if (t) t.textContent = info.title; }
      if (info.desc != null) { var d = panel.querySelector(".hero-desc"); if (d) d.textContent = info.desc; }
      if (info.metas) { var chips = panel.querySelectorAll(".hero-meta .meta"); info.metas.forEach(function (val, i) { if (chips[i]) { var mv = chips[i].querySelector(".mv"); if (mv && val != null) mv.textContent = val; } }); }
    }
    var tileTitle = document.querySelector('.ptile[data-case="' + key + '"] h3'); if (tileTitle && info.title != null) tileTitle.textContent = info.title;
    if (info.tag != null) { var pt = document.querySelector('.ptile[data-case="' + key + '"] .ptile-tag'); if (pt) pt.textContent = info.tag; }
    if (info.tab != null) { var tb = document.querySelector('.tab[data-tab="' + key + '"]'); if (tb) tb.textContent = info.tab; }
    if (info.cover) {
      var timg = document.querySelector('.ptile[data-case="' + key + '"] .ptile-img');
      if (timg) { timg.style.backgroundImage = "url('" + dataURLtoBlobURL(info.cover) + "')"; timg.style.backgroundSize = "cover"; timg.style.backgroundPosition = "center"; }
      /* hero home background keeps the site theme — cover applied to card only */
    } else if (info.coverCleared) {
      var timg2 = document.querySelector('.ptile[data-case="' + key + '"] .ptile-img');
      if (timg2) { timg2.style.background = ""; }
      if (panel) { var hc2 = panel.querySelector(".hero-cover"); if (hc2) { hc2.style.backgroundImage = ""; hc2.classList.remove("on"); } }
    }
  }
  function editCase(key) {
    var panel = document.querySelector('.panel[data-panel="' + key + '"]'); if (!panel) return;
    var eyebrow = panel.querySelector(".hero-eyebrow"), title = panel.querySelector(".hero-title"), desc = panel.querySelector(".hero-desc");
    var chips = Array.prototype.slice.call(panel.querySelectorAll(".hero-meta .meta"));
    var tileTag = document.querySelector('.ptile[data-case="' + key + '"] .ptile-tag');
    var tabBtn = document.querySelector('.tab[data-tab="' + key + '"]');
    var fields = [
      { key: "eyebrow", label: "Eyebrow / category", value: eyebrow ? eyebrow.textContent : "" },
      { key: "title", label: "Title", value: title ? title.textContent : "" },
      { key: "desc", label: "Description", type: "textarea", value: desc ? desc.textContent : "" },
      { key: "cover", label: "Cover image", type: "file", accept: "image/*", removable: true, crop: true, cropAspect: 16 / 9, value: (caseStore(key).info || {}).cover || "", hint: "Optional. After choosing an image, drag to reposition and use the slider to zoom — the framed area becomes the cover. Shown on the project card and the detail hero." }
    ];
    chips.forEach(function (c, i) { var mk = c.querySelector(".mk"), mv = c.querySelector(".mv"); fields.push({ key: "m" + i, label: mk ? mk.textContent : "Detail " + (i + 1), value: mv ? mv.textContent : "" }); });
    if (tileTag) fields.push({ key: "tag", label: "Card tag", value: tileTag.textContent });
    if (tabBtn) fields.push({ key: "tab", label: "Tab label", value: tabBtn.textContent });
    modal({
      title: "Edit case details", sub: "Updates the hero, the project card, its cover and the tab for this case study.",
      fields: fields, submitLabel: "Save changes",
      validate: function (v) { if (!v.title) return "Please enter a title."; }
    }).then(function (v) {
      if (!v) return;
      var store = caseStore(key);
      var prevCover = (store.info || {}).cover || "";
      var coverCleared = (store.info || {}).coverCleared || false;
      if (v.cover) coverCleared = false;
      else if (prevCover) coverCleared = true; // had a cover, user removed it
      store.info = { eyebrow: v.eyebrow, title: v.title, desc: v.desc, metas: chips.map(function (c, i) { return v["m" + i]; }), tag: v.tag, tab: v.tab, cover: v.cover || "", coverCleared: coverCleared };
      save().then(function () { applyCaseInfo(key); });
    });
  }

  /* ============================================================ ITEM add/edit/delete */
  function editItem(it, studio) {
    var creating = !it;
    modal({
      title: creating ? (studio ? "New " + CFG.noun + " — Layout Studio" : "Add " + CFG.noun) : "Edit " + CFG.noun,
      sub: creating ? (studio
        ? "Create the entry, then design its themed layout — shapes, text and media on a freeform canvas. Save it as your theme to reuse the same look on every " + CFG.noun + "."
        : "Create a new entry. You can add images, PDFs, prototypes and more once it's open.") : "",
      fields: [
        { key: "title", label: "Title", value: it ? it.title : "", placeholder: "e.g. FinTrack — Personal Finance App" },
        { key: "tag", label: "Tag / category", value: it ? it.tag : "", placeholder: "e.g. Fintech" },
        { key: "desc", label: "Short description", type: "textarea", value: it ? it.desc : "", placeholder: "One or two sentences about the project." },
        { key: "cover", label: "Cover image", type: "file", accept: "image/*", removable: true, crop: true, cropAspect: 16 / 9, value: it ? it.cover : "", hint: "Optional. After choosing an image, drag to reposition and use the slider to zoom — the framed area becomes the cover. Shown on the tile and detail hero." },
        { key: "role", label: "Role", value: it ? (it.meta || {}).role : "", placeholder: "e.g. Product Designer" },
        { key: "timeline", label: "Timeline", value: it ? (it.meta || {}).timeline : "", placeholder: "e.g. May 2026" },
        { key: "platform", label: "Platform", value: it ? (it.meta || {}).platform : "", placeholder: "e.g. iOS · Web" },
        { key: "focus", label: "Focus", value: it ? (it.meta || {}).focus : "", placeholder: "e.g. Research → UI" },
        { key: "software", label: "Software", value: it ? (it.meta || {}).software : "", placeholder: "e.g. Figma · Blender · After Effects" }
      ],
      submitLabel: creating ? "Create" : "Save changes",
      validate: function (v) { if (!v.title) return "Please enter a title."; }
    }).then(function (v) {
      if (!v) return;
      var meta = { role: v.role, timeline: v.timeline, platform: v.platform, focus: v.focus, software: v.software };
      if (creating) {
        var item = { id: uid(), title: v.title, tag: v.tag, desc: v.desc, cover: v.cover || "", meta: meta, blocks: [] };
        DATA.items.unshift(item); // newest project/case study first
        save().then(function () {
          renderTiles(); openDetail(item.id);
          if (studio === "project") openProjectStudio(item);
          else if (studio) openStudio(item, null, renderDetail);
        });
      } else {
        it.title = v.title; it.tag = v.tag; it.desc = v.desc; it.meta = meta;
        it.cover = v.cover || "";
        save().then(function () { renderTiles(); if (openItemId) renderDetail(); });
      }
    });
  }
  /* ============================================================ UNDO TOAST */
  var _toastEl, _toastTimer;
  function showUndoToast(message, undoFn) {
    var UNDO_ICO = '<svg viewBox="0 0 24 24" fill="none"><path d="M9 14L4 9l5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 9h11a5 5 0 0 1 0 10h-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var X_ICO = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    if (!_toastEl) { _toastEl = h("div", { class: "ak-toast" }); document.body.appendChild(_toastEl); }
    clearTimeout(_toastTimer);
    _toastEl.innerHTML = "";
    _toastEl.classList.remove("warn");
    var dismiss = function () { _toastEl.classList.remove("on"); clearTimeout(_toastTimer); };
    var undoBtn = h("button", { class: "undo", html: UNDO_ICO + "<span>Undo</span>" });
    undoBtn.addEventListener("click", function () { dismiss(); if (undoFn) undoFn(); });
    var xBtn = h("button", { class: "x", title: "Dismiss", html: X_ICO });
    xBtn.addEventListener("click", dismiss);
    _toastEl.appendChild(h("span", { class: "msg" }, [message]));
    _toastEl.appendChild(undoBtn);
    _toastEl.appendChild(xBtn);
    requestAnimationFrame(function () { _toastEl.classList.add("on"); });
    _toastTimer = setTimeout(dismiss, 6500);
  }
  /* same toast, no Undo — for things that just happened to a file the owner dropped in */
  function showNoteToast(message, warn) {
    var X_ICO = '<svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    if (!_toastEl) { _toastEl = h("div", { class: "ak-toast" }); document.body.appendChild(_toastEl); }
    clearTimeout(_toastTimer);
    _toastEl.innerHTML = "";
    _toastEl.classList.toggle("warn", !!warn);
    var dismiss = function () { _toastEl.classList.remove("on"); clearTimeout(_toastTimer); };
    var xBtn = h("button", { class: "x", title: "Dismiss", html: X_ICO });
    xBtn.addEventListener("click", dismiss);
    _toastEl.appendChild(h("span", { class: "msg" }, [message]));
    _toastEl.appendChild(xBtn);
    requestAnimationFrame(function () { _toastEl.classList.add("on"); });
    _toastTimer = setTimeout(dismiss, warn ? 9000 : 5000);
  }

  function deleteItem(it) {
    confirmModal("Delete \u201c" + (it.title || "this " + CFG.noun) + "\u201d?", "This removes the " + CFG.noun + " and all its content.", true)
      .then(function (ok) {
        if (!ok) return;
        var idx = DATA.items.indexOf(it);
        var wasSeed = !!it.seeded;
        if (it.seeded) { DATA.removedSeeds = DATA.removedSeeds || []; if (DATA.removedSeeds.indexOf(it.id) < 0) DATA.removedSeeds.push(it.id); }
        DATA.items = DATA.items.filter(function (x) { return x.id !== it.id; });
        save().then(function () { if (openItemId === it.id) closeDetail(); renderTiles(); });
        showUndoToast("Deleted \u201c" + (it.title || CFG.noun) + "\u201d", function () {
          if (DATA.items.indexOf(it) < 0) DATA.items.splice(Math.max(0, Math.min(idx < 0 ? DATA.items.length : idx, DATA.items.length)), 0, it);
          if (wasSeed && DATA.removedSeeds) DATA.removedSeeds = DATA.removedSeeds.filter(function (x) { return x !== it.id; });
          save().then(function () { renderTiles(); });
        });
      });
  }

  /* ============================================================ DETAIL VIEW */
  var detailEl;
  /* ---------- sticky tab cover preview: hover to peek (desktop) / press-and-hold (touch) ---------- */
  var _tp = { el: null, hideT: 0, touchActive: false, suppressClick: false, holdT: 0, peeked: false, sx: 0, sy: 0 };
  function tpEl() {
    if (_tp.el && document.body.contains(_tp.el)) return _tp.el;
    _tp.el = h("div", { class: "ak-tab-preview" }, [h("span", { class: "ak-tp-arrow" }), h("div", { class: "ak-tp-card" }, [])]);
    document.body.appendChild(_tp.el);
    addEventListener("resize", tpHide, { passive: true });
    return _tp.el;
  }
  function tpFill(el, item) {
    var card = el.querySelector(".ak-tp-card");
    card.innerHTML = "";
    var cover = item.cover ? dataURLtoBlobURL(item.cover) : "";
    if (cover) card.appendChild(h("img", { class: "ak-tp-img", alt: "", src: cover }));
    else card.appendChild(h("div", { class: "ak-tp-empty" }, ["Preview coming soon"]));
    card.appendChild(h("div", { class: "ak-tp-meta" }, [
      item.tag ? h("span", { class: "ak-tp-tag" }, [item.tag]) : null,
      h("span", { class: "ak-tp-title" }, [item.title || "Untitled"])
    ]));
  }
  function tpPosition(el, btn) {
    var r = btn.getBoundingClientRect(), pw = el.offsetWidth || 248, m = 10, vw = window.innerWidth;
    var left = Math.max(m, Math.min(r.left + r.width / 2 - pw / 2, vw - pw - m));
    el.style.left = left + "px";
    el.style.top = (r.bottom + 12) + "px";
    var arrow = el.querySelector(".ak-tp-arrow");
    if (arrow) arrow.style.left = (Math.max(16, Math.min(r.left + r.width / 2 - left, pw - 16)) - 6) + "px";
  }
  function tpShow(btn, item) {
    clearTimeout(_tp.hideT);
    var el = tpEl();
    tpFill(el, item);
    el.style.display = "block";
    tpPosition(el, btn);
    requestAnimationFrame(function () { if (_tp.el) _tp.el.classList.add("show"); });
  }
  function tpHide() {
    if (!_tp.el) return;
    _tp.el.classList.remove("show");
    _tp.hideT = setTimeout(function () { if (_tp.el) _tp.el.style.display = "none"; }, 200);
  }
  function tpCancelPeek() {
    clearTimeout(_tp.holdT);
    if (_tp.peeked) { _tp.peeked = false; tpHide(); }
    _tp.suppressClick = false;
  }
  function attachTabPreview(btn, item) {
    btn.addEventListener("mouseenter", function () { if (!_tp.touchActive) tpShow(btn, item); });
    btn.addEventListener("mouseleave", function () { if (!_tp.touchActive) tpHide(); });
    btn.addEventListener("focus", function () { if (!_tp.touchActive) tpShow(btn, item); });
    btn.addEventListener("blur", tpHide);
    btn.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "touch") return;
      _tp.touchActive = true; _tp.peeked = false; _tp.sx = e.clientX; _tp.sy = e.clientY;
      clearTimeout(_tp.holdT);
      _tp.holdT = setTimeout(function () { _tp.peeked = true; _tp.suppressClick = true; tpShow(btn, item); }, 300);
    });
    function endTouch(e) {
      if (e.pointerType && e.pointerType !== "touch") return;
      clearTimeout(_tp.holdT);
      if (_tp.peeked) tpHide();
      _tp.peeked = false;
      setTimeout(function () { _tp.touchActive = false; _tp.suppressClick = false; }, 450);
    }
    btn.addEventListener("pointerup", endTouch);
    btn.addEventListener("pointercancel", endTouch);
  }
  function builtinCover(key) {
    var el = document.querySelector('.ptile[data-case="' + key + '"] .ptile-img');
    if (!el) return "";
    var mm = (getComputedStyle(el).backgroundImage || "").match(/url\(["']?(.*?)["']?\)/);
    return mm ? mm[1] : "";
  }
  /* Inside an open project the page defaults to LIGHT mode. The visitor can still
     toggle (header switch) while inside — that choice is session-only (no localStorage
     write, via AK_THEME_NO_PERSIST) so the rest of the site keeps its dark default.
     On close the previous theme is restored. */
  function enterDetailTheme() {
    var r = document.documentElement;
    if (window.__akPrevTheme == null) {
      window.__akPrevTheme = r.dataset.theme || "dark";
      r.dataset.theme = "light";
      var k = document.getElementById("knob"); if (k) k.textContent = "\u2600\uFE0F";
    }
    window.AK_THEME_NO_PERSIST = true;
  }
  function exitDetailTheme() {
    var r = document.documentElement;
    if (window.__akPrevTheme != null) { r.dataset.theme = window.__akPrevTheme; window.__akPrevTheme = null; }
    window.AK_THEME_NO_PERSIST = false;
    var k = document.getElementById("knob"); if (k) k.textContent = r.dataset.theme === "light" ? "\u2600\uFE0F" : "\uD83C\uDF19";
  }
  function openDetail(id) {
    sessionView = { id: null, v: "canvas" }; /* every fresh open starts in Canvas */
    openItemId = id;
    document.body.classList.add("ak-item-detail");
    enterDetailTheme();
    renderDetail();
    window.scrollTo(0, 0);
    initBarHide();
    if (!saveData()) whenIdle(function () {   /* rest of this project, low priority — kills scroll stutter */
      var it = DATA.items.filter(function (x) { return x.id === id; })[0];
      warmSrcs(itemImageSrcs(it), 40);
    }, 2000);
  }
  // hide the "All projects / All case studies" sticky bar on scroll down, reveal on scroll up
  var barHideInit = false;
  function initBarHide() {
    if (barHideInit) return;
    barHideInit = true;
    var last = window.scrollY || document.documentElement.scrollTop, ticking = false;
    function update() {
      var y = window.scrollY || document.documentElement.scrollTop;
      var prev = last; last = y; ticking = false;
      if (!document.body.classList.contains("ak-item-detail")) return; // grid owns its own header
      tpHide();
      var bar = document.querySelector(".ak-d-bar");
      var head = document.querySelector("header");
      var foot = document.querySelector(".ak-d-foot");
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var atEnd = foot ? foot.getBoundingClientRect().top < vh - 40 : false; // thank-you note in view
      var hide = !atEnd && y > prev && y > 120;
      // top nav + sticky bar move together (both revealed at the end)
      if (bar) bar.classList.toggle("ak-bar-hidden", hide);
      if (head) head.classList.toggle("nav-hidden", hide);
    }
    addEventListener("scroll", function () {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
  }
  function closeDetail() {
    sessionView = { id: null, v: "canvas" };
    openItemId = null;
    tpHide();
    document.body.classList.remove("ak-item-detail");
    var _h = document.querySelector("header"); if (_h) _h.classList.remove("nav-hidden");
    exitDetailTheme();
    clearItemActions();
    if (detailEl) { detailEl.remove(); detailEl = null; }
    document.querySelectorAll(".ak-fab-top").forEach(function (n) { n.remove(); });
    window.scrollTo(0, 0);
  }
  // Put Edit details / Add content in the top-right nav bar (consistent with case studies),
  // and turn the page header's top-left link into a "Back" that closes the project.
  function renderItemActions(it, admin) {
    var navRight = document.querySelector(".nav-right");
    if (navRight) {
      navRight.querySelectorAll(".ak-item-actions, .ak-cs-actions").forEach(function (n) { n.remove(); });
      var group;
      if (admin) {
        group = h("div", { class: "ak-item-actions" }, [
          h("button", { class: "ak-btn", "data-ak-trigger": "1", html: I.plus + "<span>Add content</span>",
            onclick: function (e) { e.stopPropagation(); openItemId = it.id; openCaseKey = null; openMenu(); } })
        ]);
      } else {
        group = h("div", { class: "ak-item-actions" }, [
          h("button", { class: "ak-btn ak-admin-toggle", title: "Admin — locked (click to unlock)", "aria-label": "Admin — locked (click to unlock)", html: I.cog + '<span class="ak-dot"></span>',
            onclick: function (e) { e.stopPropagation(); requestUnlock().then(function (ok) { if (ok) syncMode(); }); } })
        ]);
      }
      navRight.insertBefore(group, navRight.firstChild);
    }
    var hb = document.querySelector("header .back");
    if (hb) {
      if (!hb.hasAttribute("data-ak-orig")) {
        hb.setAttribute("data-ak-orig", hb.innerHTML);
        hb.setAttribute("data-ak-orig-href", hb.getAttribute("href") || "");
      }
      hb.innerHTML = '<span class="arr">&larr;</span> Back';
      hb.setAttribute("href", "#");
      hb.onclick = function (e) { e.preventDefault(); closeDetail(); };
    }
  }
  function clearItemActions() {
    var navRight = document.querySelector(".nav-right");
    if (navRight) { navRight.querySelectorAll(".ak-item-actions").forEach(function (n) { n.remove(); }); }
    var hb = document.querySelector("header .back");
    if (hb && hb.hasAttribute("data-ak-orig")) {
      hb.innerHTML = hb.getAttribute("data-ak-orig");
      hb.setAttribute("href", hb.getAttribute("data-ak-orig-href"));
      hb.onclick = null;
      hb.removeAttribute("data-ak-orig");
      hb.removeAttribute("data-ak-orig-href");
    }
  }
  /* defer heavy embeds (iframes, 3D, video) until near the viewport — keeps project open snappy */
  function lazyMount(el, fn, margin) {
    if (!window.IntersectionObserver) { setTimeout(fn, 50); return; }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.disconnect();
        if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 900 }); else setTimeout(fn, 80);
      });
    }, { rootMargin: (margin || 400) + "px" });
    io.observe(el);
  }
  var _psFrameCache = {};
  function videoFrameThumb(src, thumb) {
    if (_psFrameCache[src]) { thumb.insertBefore(h("img", { src: _psFrameCache[src], alt: "", decoding: "async" }), thumb.firstChild); return; }
    var v = h("video", { preload: "metadata", playsinline: "", muted: "" });
    v.muted = true;
    v.addEventListener("loadeddata", function onld() {
      v.removeEventListener("loadeddata", onld);
      try {
        var c = document.createElement("canvas"), k = Math.min(1, 344 / (v.videoWidth || 344));
        c.width = Math.max(2, Math.round((v.videoWidth || 344) * k)); c.height = Math.max(2, Math.round((v.videoHeight || 260) * k));
        c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
        var d = c.toDataURL("image/jpeg", 0.72);
        _psFrameCache[src] = d;
        thumb.insertBefore(h("img", { src: d, alt: "", decoding: "async" }), thumb.firstChild);
      } catch (e) {}
      v.removeAttribute("src"); v.load();
    });
    v.src = src;
  }
  /* horizontal preview slider of every media block (images, video, pdf, prototypes, 3D), shown under the project home content */
  function buildMediaStrip(store, blocksWrap) {
    if (CFG.page === "ui-ux") return null; // UI/UX project: media/image preview strip disabled (current + new items)
    var MT = { image: 1, media: 1, pdf: 1, prototype: 1, model: 1 };
    var items = [];
    /* Canvas / bento projects hold their media as layout elements rather than blocks.
       The strip must read in the same order the visitor sees on the canvas — top to
       bottom, then left to right — NOT blocks-first, which put the newest additions
       (appended at the bottom of the canvas) at the front of the preview. */
    var cards = ((store.studio && store.studio.els) || []).filter(function (el) {
      return el && !el.hidden && el.content && MT[el.content.type];
    }).slice().sort(function (a, b) {
      return (a.y || 0) - (b.y || 0) || (a.x || 0) - (b.x || 0);
    });
    cards.forEach(function (el) {
      var c = el.content;
      items.push({ idx: -1, elId: el.id, b: { type: c.type, src: c.src, mime: c.mime, caption: (el.detail && el.detail.title) || c.caption || "" } });
    });
    (store.blocks || []).forEach(function (b, i) {
      if (!b || !MT[b.type]) return;
      var onCanvas = cards.some(function (el) { return el.sb === b.id || (b.src && el.content.src === b.src); });
      if (!onCanvas) items.push({ b: b, idx: i });
    });
    if (!items.length) return null;
    /* In Canvas (studio) mode there is no block stack to jump to — resolve the card's target
       inside the rendered canvas instead: match the media by src, else fall back to order. */
    function targetFor(b, blockIdx, ord, elId) {
      if (elId) { var e = document.querySelector('.ak-studio-body [data-el-id="' + elId + '"]'); if (e) return e; }
      if (blocksWrap && blocksWrap.isConnected && blocksWrap.children[blockIdx]) return blocksWrap.children[blockIdx];
      var body = document.querySelector(".ak-studio-body"); if (!body) return null;
      var media = [].slice.call(body.querySelectorAll("img,video,iframe,model-viewer"));
      var hit = null;
      if (b.src) {
        var url = dataURLtoBlobURL(b.src);
        media.forEach(function (m) { if (!hit && (m.src === url || m.getAttribute("src") === url)) hit = m; });
      }
      if (!hit) hit = media[ord] || null;
      return hit ? (hit.closest(".akls-el,.akls-gcard") || hit) : null;
    }
    var row = h("div", { class: "ps-row" });
    var drag = { down: false, moved: false, sx: 0, sl: 0 };
    items.forEach(function (en, n) {
      var b = en.b, badge = null;
      var thumb = h("div", { class: "ps-thumb" });
      if (b.type === "image") {
        thumb.appendChild(h("img", { src: dataURLtoBlobURL(b.src), alt: b.caption || "", loading: "lazy", fetchpriority: "low", decoding: "async" }));
      } else if (b.type === "media") {
        if ((b.mime || "").indexOf("audio") === 0) { thumb.appendChild(h("div", { class: "ps-glyph" }, ["\u266B"])); badge = "Audio"; }
        else {
          badge = "Video";
          thumb.appendChild(h("div", { class: "ps-glyph" }, ["\u25B8"]));
          lazyMount(thumb, function () { videoFrameThumb(dataURLtoBlobURL(b.src), thumb); }, 120);
        }
      } else if (b.type === "pdf") {
        badge = "PDF";
        thumb.appendChild(h("div", { class: "ps-glyph" }, ["\u25A4"]));
      } else if (b.type === "prototype") {
        badge = "Live";
        thumb.appendChild(h("div", { class: "ps-glyph" }, ["\u2196"]));
      } else if (b.type === "model") {
        badge = "3D";
        thumb.appendChild(h("div", { class: "ps-glyph" }, ["\u25C8"]));
      }
      if (badge) thumb.appendChild(h("span", { class: "ps-badge" }, [badge]));
      var cap = h("div", { class: "ps-cap" }, [
        h("span", { class: "ps-num" }, ["Ref " + ("0" + (n + 1)).slice(-2)]),
        h("span", { class: "ps-name" }, [b.caption || typeLabel(b.type)])
      ]);
      var card = h("button", { class: "ps-card", type: "button", title: "Jump to " + (b.caption || typeLabel(b.type)), onclick: function () {
        if (drag.moved) return;
        var t = targetFor(b, en.idx, n, en.elId); if (!t) return;
        var top = t.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop) - 120;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        t.classList.add("ak-blocktarget");
        setTimeout(function () { t.classList.add("fade"); }, 1200);
        setTimeout(function () { t.classList.remove("ak-blocktarget", "fade"); }, 2000);
      } }, [thumb, cap]);
      row.appendChild(card);
    });
    // drag to scroll (suppress the click that ends a drag)
    row.addEventListener("pointerdown", function (e) { if (e.button != null && e.button > 0) return; drag.down = true; drag.moved = false; drag.sx = e.clientX; drag.sl = row.scrollLeft; });
    row.addEventListener("pointermove", function (e) { if (!drag.down) return; var dx = e.clientX - drag.sx; if (!drag.moved && Math.abs(dx) > 6) { drag.moved = true; row.classList.add("dragging"); } if (drag.moved) row.scrollLeft = drag.sl - dx; });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { row.addEventListener(ev, function () { drag.down = false; row.classList.remove("dragging"); setTimeout(function () { drag.moved = false; }, 0); }); });
    var cta = h("button", { class: "ps-cta", type: "button", onclick: function () {
      var max = row.scrollWidth - row.clientWidth;
      if (row.scrollLeft >= max - 8) row.scrollTo({ left: 0, behavior: "smooth" });
      else row.scrollBy({ left: Math.max(240, row.clientWidth * 0.8), behavior: "smooth" });
    } }, ["Scroll to explore \u2192"]);
    function ctaVis() { if (!row.isConnected) return; cta.style.display = row.scrollWidth - row.clientWidth > 8 ? "" : "none"; }
    var ro = new ResizeObserver(function () { if (!row.isConnected) { ro.disconnect(); return; } ctaVis(); });
    ro.observe(row);
    setTimeout(ctaVis, 60);
    var noun = (CFG.noun || "project");
    var head = h("div", { class: "ps-head" }, [
      h("span", { class: "ps-eyebrow" }, ["Inside this " + noun + " \u2014 " + items.length + (items.length === 1 ? " preview" : " previews")]),
      cta
    ]);
    return h("section", { class: "ak-pstrip" }, [head, row]);
  }
  function renderDetail() {
    var it = DATA.items.find(function (x) { return x.id === openItemId; });
    if (!it) { closeDetail(); return; }
    /* Content added while the project is in Studio (canvas) mode lands on the canvas
       first — otherwise the new block is saved but invisible. */
    if (pendingStudioBlocks(it).length) {
      syncStudioBlocks(it).then(function (ok) { if (ok) keepScroll(renderDetail)(); });
    }
    if (detailEl) detailEl.remove();
    var admin = isUnlocked();
    var meta = it.meta || {};
    var metaChips = [["Role", meta.role], ["Timeline", meta.timeline], ["Platform", meta.platform], ["Focus", meta.focus], ["Software", meta.software]]
      .filter(function (m) { return m[1]; })
      .map(function (m) { return h("div", { class: "m" }, [h("span", { class: "mk" }, [m[0]]), h("span", { class: "mv" }, [m[1]])]); });

    var blocksWrap = h("div", { class: "ak-blocks" });
    if (!it.blocks.length) {
      blocksWrap.appendChild(h("div", { class: "ak-empty" }, [
        h("h4", {}, [admin ? "No content yet" : "Coming soon"]),
        h("p", { style: "color:var(--muted);margin:0" }, [admin ? "Use the Admin menu to add images, PDFs, prototypes, video, 3D models or text." : "This project is being prepared."])
      ]));
    } else {
      var _i = 0;
      while (_i < it.blocks.length) {
        var _b = it.blocks[_i];
        if (_b.type === "text" && _b.section) {
          var _els = [renderBlock(it, _b, _i, admin, renderDetail)];
          var _k = _i + 1;
          while (_k < it.blocks.length && !(it.blocks[_k].type === "text" && it.blocks[_k].section)) {
            _els.push(renderBlock(it, it.blocks[_k], _k, admin, renderDetail)); _k++;
          }
          if (_els.length > 1) {
            var _srad = (_b.radius != null ? _b.radius : 18);
            blocksWrap.appendChild(h("div", { class: "ak-secgroup has", style: "border-radius:" + _srad + "px" }, _els));
          } else {
            blocksWrap.appendChild(_els[0]); // standalone section header -> direct grid cell (sizable + resizable)
          }
          _i = _k;
        } else {
          blocksWrap.appendChild(renderBlock(it, it.blocks[_i], _i, admin, renderDetail)); _i++;
        }
      }
    }

    var hdrEl = document.querySelector("header");
    // sticky case-study / project tab bar (all project pages), with this one active
    var strip = h("div", { class: "tabbar" }, []);
    // cover-preview: swallow the navigation click that follows a touch long-press "peek"
    strip.addEventListener("click", function (e) { if (_tp.suppressClick) { _tp.suppressClick = false; e.stopPropagation(); e.preventDefault(); } }, true);
    // cover-preview: cancel a pending peek once the strip is scrolled or dragged
    strip.addEventListener("pointermove", function (e) { if (_tp.touchActive && (Math.abs(e.clientX - _tp.sx) > 8 || Math.abs(e.clientY - _tp.sy) > 8)) tpCancelPeek(); }, { passive: true });
    strip.addEventListener("scroll", function () { if (_tp.touchActive) tpCancelPeek(); }, { passive: true });
    DATA.items.forEach(function (x) { // newest items first
      var tb = h("button", { class: "tab" + (x.id === it.id ? " active" : ""), onclick: function () { if (x.id !== it.id) openDetail(x.id); } }, [x.title || "Untitled"]);
      if (x.id !== it.id) attachTabPreview(tb, { title: x.title, tag: x.tag, cover: x.cover });
      strip.appendChild(tb);
    });
    builtinTabs().forEach(function (b) {
      var tb = h("button", { class: "tab", onclick: function () { closeDetail(); if (window.openCase) window.openCase(b.key); } }, [b.label]);
      attachTabPreview(tb, { title: b.label, tag: "", cover: builtinCover(b.key) });
      strip.appendChild(tb);
    });
    var plural = CFG.noun === "case study" ? "case studies" : CFG.noun + "s";
    var prevBtn = h("button", { class: "tabnav prev", "aria-label": "Scroll left", html: "\u2039" });
    var nextBtn = h("button", { class: "tabnav next", "aria-label": "Scroll right", html: "\u203a" });
    var tabwrap = h("div", { class: "tabwrap" }, [strip, prevBtn, nextBtn]);
    var bar = h("div", { class: "ak-d-bar" }, [ h("div", { class: "inner" }, [
      h("button", { class: "cs-back", onclick: closeDetail, html: '<span class="arr">&larr;</span> All ' + plural }),
      tabwrap
    ]) ]);
    bar.style.top = (hdrEl ? hdrEl.offsetHeight : 0) + "px";
    renderItemActions(it, admin);

    var hb = it.homeBg || {};
    var hbOp = String((hb.opacity != null ? hb.opacity : 22) / 100);
    var hbMedia = "opacity:" + hbOp + ";transform:translate(" + (hb.x || 0) + "%," + (hb.y || 0) + "%) scale(" + ((hb.scale != null ? hb.scale : 100) / 100) + ")";
    var bgv = null;
    if (hb.video) {
      bgv = h("video", { class: "bgv", style: hbMedia, src: dataURLtoBlobURL(hb.video), playsinline: "", "aria-hidden": "true" });
      bgv.muted = true; bgv.loop = true; bgv.autoplay = true;
      setTimeout(function () { try { var p = bgv.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }, 0);
    }
    var hero = h("div", { class: "ak-d-hero" }, [
      hb.image ? h("img", { class: "bgi", style: hbMedia, src: dataURLtoBlobURL(hb.image), alt: "", decoding: "async", fetchpriority: "high", "aria-hidden": "true" }) : null,
      bgv,
      hb.text ? h("div", { class: "bgt", style: "opacity:" + hbOp, "aria-hidden": "true" }, [hb.text]) : null,
      (hb.image || hb.video || hb.text) ? h("div", { class: "scrim", "aria-hidden": "true" }) : null,
      h("div", { class: "gr" }),
      h("div", { class: "inner" }, [
        it.tag ? h("div", { class: "tag" }, [it.tag]) : null,
        h("h1", {}, [it.title || "Untitled"]),
        it.desc ? h("p", {}, [it.desc]) : null,
        metaChips.length ? h("div", { class: "ak-meta" }, metaChips) : null
      ])
    ]);

    var endNoun = CFG.noun === "case study" ? "End of case study" : "End of full project";
    var foot = h("footer", { class: "ak-d-foot" }, [
      h("span", { class: "mono" }, ["Thank you"]),
      h("h2", {}, ["Thanks for watching."]),
      h("p", { class: "credit" }, [endNoun + " · " + (it.title || "Untitled") + " © Ajay Katta"]),
      h("button", { class: "ak-totop", onclick: function () { (detailEl || document.scrollingElement || document.documentElement).scrollTo({ top: 0, behavior: "smooth" }); window.scrollTo({ top: 0, behavior: "smooth" }); }, html: 'Back to top <span aria-hidden="true">&uarr;</span>' })
    ]);

    var studioMode = !!(it.studio && it.studio.els && it.studio.els.length);
    var studioBody, bsaveT;
    var viewMode = bentoView(it.id);
    function paintStudioBody() {
      ensureStudio().then(function () {
        if (!window.AKLayout || !window.AKLayout.render) return;
        window.AKLayout.render(studioBody, Object.assign({}, it.studio, { layout: viewMode }), {
          editable: isUnlocked(),
          onChange: function () { clearTimeout(bsaveT); bsaveT = setTimeout(function () { save(); }, 600); }
        });
      });
    }
    function applyView(mode) {
      viewMode = mode === "grid" ? "grid" : "canvas";
      setBentoView(viewMode, it.id);
      if (viewBar) viewBar.querySelectorAll("button").forEach(function (b) {
        var on = b.getAttribute("data-view") === viewMode;
        b.classList.toggle("active", on); b.setAttribute("aria-selected", on ? "true" : "false");
      });
      if (studioMode) paintStudioBody();
      else blocksWrap.classList.toggle("ak-gridmode", viewMode === "grid");
    }
    var showSwitch = studioMode || (it.blocks && it.blocks.length > 1);
    var viewBar = showSwitch ? buildViewSwitch(viewMode, applyView, studioMode) : null;
    /* the layout switch lives in the project's home/hero block — highest visibility, seen before scrolling */
    if (viewBar) { viewBar.classList.add("in-hero"); hero.appendChild(viewBar); }
    if (studioMode) { studioBody = h("div", { class: "ak-studio-body" }); paintStudioBody(); }
    else if (viewMode === "grid" && showSwitch) blocksWrap.classList.add("ak-gridmode");
    detailEl = h("div", { class: "ak-detail" }, [bar, hero,
      buildMediaStrip(it, studioMode ? null : blocksWrap),
      studioMode ? studioBody : blocksWrap,
      foot]);
    if (it.bg) {
      detailEl.style.background = it.bg;
      hero.style.background = "var(--bg)";
      foot.style.background = "var(--bg)";
    }
    if (it.spacing != null) blocksWrap.style.gap = it.spacing + "px";
    document.body.appendChild(detailEl);
    document.querySelectorAll(".ak-fab-top").forEach(function (n) { n.remove(); });
    var fab = h("button", { class: "ak-fab-top", "aria-label": "Back to top", title: "Back to top", html: "\u2191", onclick: function () { window.scrollTo({ top: 0, behavior: "smooth" }); } });
    document.body.appendChild(fab); // on body: .ak-detail's will-change/transform would trap position:fixed
    function fabVis() { if (!fab.isConnected) { window.removeEventListener("scroll", fabVis); return; } fab.classList.toggle("show", (window.scrollY || document.documentElement.scrollTop) > 300); }
    window.addEventListener("scroll", fabVis, { passive: true });
    fabVis();
    detailEl.scrollTop = 0;
    wireTabScroller(strip, prevBtn, nextBtn);
  }

  /* modern interactive sticky tab scroller: edge fades, wheel + drag scroll, chevrons, auto-center */
  function wireTabScroller(strip, prev, next) {
    if (!strip) return;
    function update() {
      var max = strip.scrollWidth - strip.clientWidth;
      var x = strip.scrollLeft;
      var l = x > 2 ? 1 : 0, r = x < max - 2 ? 1 : 0;
      strip.style.setProperty("--l", l);
      strip.style.setProperty("--r", r);
      if (prev) prev.classList.toggle("show", !!l);
      if (next) next.classList.toggle("show", !!r);
    }
    strip.addEventListener("scroll", update, { passive: true });
    strip.addEventListener("wheel", function (e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      var max = strip.scrollWidth - strip.clientWidth; if (max <= 0) return;
      e.preventDefault(); strip.scrollLeft += e.deltaY;
    }, { passive: false });
    function step(dir) { strip.scrollBy({ left: dir * Math.max(170, strip.clientWidth * 0.7), behavior: "smooth" }); }
    if (prev) prev.addEventListener("click", function () { step(-1); });
    if (next) next.addEventListener("click", function () { step(1); });
    var down = false, sx = 0, sl = 0, moved = false, supTap = 0;
    strip.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button > 0) return;
      down = true; moved = false; sx = e.clientX; sl = strip.scrollLeft;
    });
    strip.addEventListener("pointermove", function (e) {
      if (!down) return;
      var dx = e.clientX - sx;
      if (!moved) { if (Math.abs(dx) < 6) return; moved = true; strip.classList.add("is-dragging"); try { strip.setPointerCapture(e.pointerId); } catch (_) {} }
      e.preventDefault(); strip.scrollLeft = sl - dx;
    });
    function end(e) {
      if (!down) return; down = false;
      try { strip.releasePointerCapture(e.pointerId); } catch (_) {}
      if (moved) { strip.classList.remove("is-dragging"); supTap = Date.now(); }
    }
    strip.addEventListener("pointerup", end);
    strip.addEventListener("pointercancel", end);
    strip.addEventListener("click", function (e) { if (supTap && Date.now() - supTap < 300) { e.stopPropagation(); e.preventDefault(); supTap = 0; } }, true);
    var active = strip.querySelector(".tab.active");
    if (active) strip.scrollLeft = Math.max(0, active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2);
    if (window.ResizeObserver) { try { new ResizeObserver(update).observe(strip); } catch (_) {} }
    requestAnimationFrame(update);
  }

  /* ---------- block rendering ---------- */
  var AK_FONTS = [["", "Theme (Inter)"], ["'Inter',sans-serif", "Inter"], ["Georgia,serif", "Georgia"], ["'Times New Roman',serif", "Times New Roman"], ["Arial,Helvetica,sans-serif", "Arial / Helvetica"], ["'Courier New',monospace", "Courier New"]];
  /* compact Figma-style type controls used by the Edit text dialog */
  function textStylePanel(init, shadowInit, headingInit, bodyInit, heading2Init) {
    var ts = Object.assign({ font: "", align: "left", hFont: "", hSize: "", hWeight: "", hColor: "", hBold: false, hI: false, hU: false, h2Font: "", h2Size: "", h2Weight: "", h2Color: "", h2Bold: false, h2I: false, h2U: false, bFont: "", bSize: "", bColor: "", bBold: false, bI: false, bU: false, lh: "", ls: "", italic: false, upper: false }, init || {});
    ts.shadow = shadowInit || 0;
    ts.heading = headingInit || ""; ts.body = bodyInit || ""; ts.heading2 = heading2Init || "";
    if (ts.font && !ts.hFont && !ts.h2Font && !ts.bFont) { ts.hFont = ts.font; ts.h2Font = ts.font; ts.bFont = ts.font; }
    ts.font = "";
    if (ts.italic) { ts.hI = true; ts.h2I = true; ts.bI = true; ts.italic = false; }
    var boxS = "display:flex;align-items:center;height:30px;border:1px solid var(--line);border-radius:8px;background:color-mix(in srgb,var(--bg) 60%,var(--surface));overflow:hidden;min-width:0;transition:border-color .15s";
    var rawS = "flex:1;min-width:0;height:100%;border:none;background:none;color:var(--text);font-family:'Inter',sans-serif;font-size:.78rem;padding:0 7px 0 5px;outline:none";
    var hIn = h("input", { type: "text", placeholder: "Heading (optional)" });
    hIn.value = ts.heading || "";
    hIn.addEventListener("input", function () { ts.heading = hIn.value; });
    var hIn2 = h("input", { type: "text", placeholder: "Subheading (optional)" });
    hIn2.value = ts.heading2 || "";
    hIn2.addEventListener("input", function () { ts.heading2 = hIn2.value; });
    var bIn = h("textarea", { placeholder: "Write a paragraph\u2026", rows: "3" });
    bIn.value = ts.body || "";
    var bGrow = function () { bIn.style.height = "auto"; bIn.style.height = Math.min(Math.max(bIn.scrollHeight, 56), 180) + "px"; };
    bIn.addEventListener("input", function () { ts.body = bIn.value; bGrow(); });
    function paint() {
      var tsh = textShadowCss(ts.shadow) || "none";
      var al = ts.align || "left";
      var base = "width:100%;box-sizing:border-box;border:none;background:none;outline:none;padding:0;text-align:" + al + ";letter-spacing:" + (ts.ls || 0) + "px;text-shadow:" + tsh + ";";
      hIn.style.cssText = base + "font-family:" + (ts.hFont || "'Inter',sans-serif") + ";font-weight:" + (ts.hWeight || (ts.hBold ? 800 : 700)) + ";color:" + (ts.hColor || "var(--text)") + ";font-size:" + Math.min(ts.hSize || 19, 26) + "px" + (ts.hI ? ";font-style:italic" : "") + (ts.hU ? ";text-decoration:underline;text-underline-offset:3px" : "") + (ts.upper ? ";text-transform:uppercase" : "");
      hIn2.style.cssText = base + "font-family:" + (ts.h2Font || "'Inter',sans-serif") + ";font-weight:" + (ts.h2Weight || (ts.h2Bold ? 800 : 600)) + ";color:" + (ts.h2Color || "var(--text)") + ";font-size:" + Math.min(ts.h2Size || 15, 22) + "px" + (ts.h2I ? ";font-style:italic" : "") + (ts.h2U ? ";text-decoration:underline;text-underline-offset:3px" : "") + (ts.upper ? ";text-transform:uppercase" : "");
      bIn.style.cssText = base + "resize:none;min-height:56px;max-height:180px;overflow-y:auto;font-family:" + (ts.bFont || "'Inter',sans-serif") + ";font-weight:" + (ts.bBold ? 700 : 400) + ";color:" + (ts.bColor || "var(--muted)") + ";font-size:" + Math.min(ts.bSize || 13, 18) + "px;line-height:" + (ts.lh || 1.6) + (ts.bI ? ";font-style:italic" : "") + (ts.bU ? ";text-decoration:underline;text-underline-offset:3px" : "");
      bGrow();
    }
    function micro(t) { return h("div", { style: "font-family:'Inter',sans-serif;font-size:.55rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin:11px 0 5px" }, [t]); }
    function focusable(box, input) {
      input.addEventListener("focus", function () { box.style.borderColor = "var(--accent)"; });
      input.addEventListener("blur", function () { box.style.borderColor = "var(--line)"; });
    }
    function pIn(pfx, input, tip) {
      input.style.cssText = rawS;
      var box = h("div", { class: "ak-num", title: tip || "", style: boxS }, [pfx ? h("span", { style: "flex:none;padding-left:8px;font-family:'Inter',sans-serif;font-size:.58rem;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)" }, [pfx]) : null, input]);
      if (input.type === "number") {
        function stepBtn(dir) {
          var b = h("button", { type: "button", tabindex: "-1", html: '<svg viewBox="0 0 8 8" width="7" height="7" fill="none"><path d="' + (dir > 0 ? "M1.5 5.2L4 2.8 6.5 5.2" : "M1.5 2.8L4 5.2 6.5 2.8") + '" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>', style: "flex:1;border:none;background:none;color:var(--muted);cursor:pointer;display:grid;place-items:center;padding:0;transition:.12s" });
          b.addEventListener("mouseenter", function () { b.style.color = "var(--accent)"; b.style.background = "color-mix(in srgb,var(--accent) 12%,transparent)"; });
          b.addEventListener("mouseleave", function () { b.style.color = "var(--muted)"; b.style.background = "none"; });
          b.addEventListener("click", function () {
            var st = parseFloat(input.step) || 1, v = parseFloat(input.value);
            if (isNaN(v)) v = parseFloat(input.placeholder);
            if (isNaN(v)) v = 0;
            v = Math.round((v + dir * st) * 100) / 100;
            var mn = input.getAttribute("min"), mx = input.getAttribute("max");
            if (mn !== null && mn !== "" && v < parseFloat(mn)) v = parseFloat(mn);
            if (mx !== null && mx !== "" && v > parseFloat(mx)) v = parseFloat(mx);
            input.value = v;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          });
          return b;
        }
        box.appendChild(h("div", { style: "flex:none;display:flex;flex-direction:column;align-self:stretch;width:17px;border-left:1px solid color-mix(in srgb,var(--line) 70%,transparent)" }, [stepBtn(1), stepBtn(-1)]));
      }
      focusable(box, input);
      return box;
    }
    function num(key, ph, step, min) {
      var i = h("input", { type: "number", placeholder: ph, step: step || 1 });
      if (min != null) i.setAttribute("min", min);
      if (ts[key] !== "" && ts[key] != null) i.value = ts[key];
      i.addEventListener("input", function () { var v = parseFloat(i.value); ts[key] = isNaN(v) ? "" : v; paint(); });
      return i;
    }
    function sel(key, opts, isInt) {
      var s = h("select", {}, opts.map(function (o) {
        var op = h("option", { value: String(o[0]) }, [o[1]]);
        if (String(ts[key] == null ? "" : ts[key]) === String(o[0])) op.setAttribute("selected", "");
        return op;
      }));
      s.addEventListener("change", function () { ts[key] = isInt ? (s.value ? parseInt(s.value, 10) : "") : s.value; paint(); });
      s.style.cssText = rawS + ";cursor:pointer;padding-left:8px";
      var box = h("div", { style: boxS }, [s]);
      focusable(box, s);
      return box;
    }
    function colorIn(key, tip) {
      var sw = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(ts[key] || "") ? ts[key] : "#c9c8c6", style: "flex:none;width:20px;height:20px;margin-left:5px;padding:0;border:none;border-radius:5px;background:none;cursor:pointer" });
      var tx = h("input", { type: "text", placeholder: "auto", value: ts[key] || "" });
      sw.addEventListener("input", function () { ts[key] = sw.value; tx.value = sw.value; paint(); });
      tx.addEventListener("input", function () { var v = tx.value.trim(); ts[key] = v; if (/^#[0-9a-f]{6}$/i.test(v)) sw.value = v; paint(); });
      tx.style.cssText = rawS;
      var box = h("div", { title: tip || "", style: boxS }, [sw, tx]);
      focusable(box, tx);
      return box;
    }
    var ALN = {
      left: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none"><path d="M2 3.5h12M2 8h8M2 12.5h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      center: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none"><path d="M2 3.5h12M4 8h8M3 12.5h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
      right: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none"><path d="M2 3.5h12M6 8h8M4 12.5h10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
    };
    function alignSeg() {
      var wrap = h("div", { style: "flex:none;display:flex;gap:2px;border:1px solid var(--line);border-radius:8px;padding:2px;background:color-mix(in srgb,var(--bg) 60%,var(--surface));height:30px;box-sizing:border-box" });
      function paintSeg() {
        Array.prototype.forEach.call(wrap.children, function (x) {
          var on = (ts.align || "left") === x.getAttribute("data-v");
          x.style.background = on ? "color-mix(in srgb,var(--accent) 20%,transparent)" : "none";
          x.style.color = on ? "var(--accent)" : "var(--muted)";
        });
      }
      ["left", "center", "right"].forEach(function (a) {
        var b = h("button", { type: "button", title: "Align " + a, "data-v": a, html: ALN[a], style: "width:30px;border:none;border-radius:6px;cursor:pointer;display:grid;place-items:center;padding:0;transition:.15s;background:none;color:var(--muted)" });
        b.addEventListener("click", function () { ts.align = a; paintSeg(); paint(); });
        wrap.appendChild(b);
      });
      paintSeg();
      return wrap;
    }
    function tog(key, htmlLbl, tip, w) {
      var b = h("button", { type: "button", title: tip, html: htmlLbl, style: "flex:none;width:" + (w || 34) + "px;height:30px;border:1px solid var(--line);border-radius:8px;cursor:pointer;display:grid;place-items:center;transition:.15s;padding:0" });
      function pb() {
        b.style.background = ts[key] ? "color-mix(in srgb,var(--accent) 16%,transparent)" : "color-mix(in srgb,var(--bg) 60%,var(--surface))";
        b.style.color = ts[key] ? "var(--accent)" : "var(--muted)";
        b.style.borderColor = ts[key] ? "var(--accent)" : "var(--line)";
      }
      b.addEventListener("click", function () { ts[key] = !ts[key]; pb(); paint(); });
      pb();
      return b;
    }
    var shNum = h("input", { type: "number", min: 0, max: 100, step: 5 }); shNum.value = ts.shadow || 0;
    var shRange = h("input", { type: "range", min: 0, max: 100, step: 5, value: ts.shadow || 0, style: "flex:1;accent-color:var(--accent);cursor:pointer;min-width:0" });
    shRange.addEventListener("input", function () { ts.shadow = parseInt(shRange.value, 10) || 0; shNum.value = shRange.value; paint(); });
    shNum.addEventListener("input", function () { var v = parseInt(shNum.value, 10); ts.shadow = isNaN(v) ? 0 : Math.max(0, Math.min(100, v)); shRange.value = ts.shadow; paint(); });
    var shBox = pIn("%", shNum, "Shadow intensity");
    shBox.style.flex = "none"; shBox.style.width = "84px";
    var lsBox = pIn("LS", num("ls", "0", 0.5), "Letter spacing (px)");
    lsBox.style.flex = "none"; lsBox.style.width = "86px";
    var g3 = "display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px";
    function mini(key, htmlLbl, tip) {
      var b = h("button", { type: "button", title: tip, html: htmlLbl, style: "width:24px;height:22px;border:1px solid var(--line);border-radius:6px;cursor:pointer;display:grid;place-items:center;padding:0;transition:.12s;background:none" });
      function pb() {
        b.style.background = ts[key] ? "color-mix(in srgb,var(--accent) 16%,transparent)" : "none";
        b.style.color = ts[key] ? "var(--accent)" : "var(--muted)";
        b.style.borderColor = ts[key] ? "var(--accent)" : "var(--line)";
      }
      b.addEventListener("click", function () { ts[key] = !ts[key]; pb(); paint(); });
      pb();
      return b;
    }
    function biu(bk, ik, uk) {
      return h("div", { style: "margin-left:auto;display:flex;gap:3px" }, [
        mini(bk, '<span style="font-family:\'Inter\',sans-serif;font-weight:800;font-size:.7rem">B</span>', "Bold"),
        mini(ik, '<span style="font-style:italic;font-family:Georgia,serif;font-size:.8rem;font-weight:600">I</span>', "Italic"),
        mini(uk, '<span style="font-family:\'Inter\',sans-serif;font-size:.7rem;font-weight:600;text-decoration:underline;text-underline-offset:2px">U</span>', "Underline")
      ]);
    }
    function card(tag, lbl, inputEl, ctlRow, focusEl, extras) {
      var c = h("div", { style: "border:1px solid var(--line);border-radius:12px;background:color-mix(in srgb,var(--bg) 55%,var(--surface));transition:border-color .15s" }, [
        h("div", { style: "display:flex;align-items:center;gap:7px;padding:9px 11px 0" }, [
          h("span", { style: "font-family:'Inter',sans-serif;font-size:.55rem;font-weight:800;letter-spacing:.08em;padding:2px 6px;border-radius:5px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--accent)" }, [tag]),
          h("span", { style: "font-family:'Inter',sans-serif;font-size:.55rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--muted)" }, [lbl]),
          extras || null
        ]),
        h("div", { style: "padding:8px 11px 10px" }, [inputEl]),
        h("div", { style: "padding:8px 9px 9px;border-top:1px dashed color-mix(in srgb,var(--line) 75%,transparent)" }, [ctlRow])
      ]);
      focusable(c, focusEl);
      return c;
    }
    var g4 = "display:grid;grid-template-columns:1.3fr .8fr .9fr 1fr;gap:5px";
    var WGT = [["", "Auto"], [300, "300"], [400, "400"], [500, "500"], [600, "600"], [700, "700"], [800, "800"]];
    var wrap = h("div", { style: "display:flex;flex-direction:column;gap:10px" }, [
      card("H1", "Heading", hIn, h("div", { style: g4 }, [
        sel("hFont", AK_FONTS),
        pIn("px", num("hSize", "auto", 1, 6), "Heading size"),
        sel("hWeight", WGT, true),
        colorIn("hColor", "Heading color")
      ]), hIn, biu("hBold", "hI", "hU")),
      card("H2", "Subheading", hIn2, h("div", { style: g4 }, [
        sel("h2Font", AK_FONTS),
        pIn("px", num("h2Size", "auto", 1, 6), "Subheading size"),
        sel("h2Weight", WGT, true),
        colorIn("h2Color", "Subheading color")
      ]), hIn2, biu("h2Bold", "h2I", "h2U")),
      card("P", "Body text", bIn, h("div", { style: g4 }, [
        sel("bFont", AK_FONTS),
        pIn("px", num("bSize", "auto", 1, 6), "Body size"),
        pIn("LH", num("lh", "1.7", 0.05, 0.8), "Line height"),
        colorIn("bColor", "Body color")
      ]), bIn, biu("bBold", "bI", "bU")),
      h("div", {}, [
        micro("Align \u00b7 case \u00b7 letter spacing \u00b7 drop shadow"),
        h("div", { style: "display:flex;gap:6px;align-items:center" }, [
          alignSeg(),
          tog("upper", '<span style="font-family:\'Inter\',sans-serif;font-size:.58rem;font-weight:700;letter-spacing:.06em">AA</span>', "Uppercase headings", 38),
          lsBox,
          shRange,
          shBox
        ])
      ])
    ]);
    paint();
    setTimeout(bGrow, 50);
    return { el: wrap, get: function () { return Object.assign({}, ts); } };
  }
  function cleanTstyle(t) {
    if (!t) return null;
    var o = {};
    if (t.font) o.font = t.font;
    if (t.hFont) o.hFont = t.hFont;
    if (t.h2Font) o.h2Font = t.h2Font;
    if (t.bFont) o.bFont = t.bFont;
    if (t.hBold) o.hBold = true;
    if (t.hI) o.hI = true;
    if (t.hU) o.hU = true;
    if (t.h2Bold) o.h2Bold = true;
    if (t.h2I) o.h2I = true;
    if (t.h2U) o.h2U = true;
    if (t.bBold) o.bBold = true;
    if (t.bI) o.bI = true;
    if (t.bU) o.bU = true;
    if (t.align && t.align !== "left") o.align = t.align;
    if (t.hSize) o.hSize = t.hSize;
    if (t.hWeight) o.hWeight = t.hWeight;
    if (t.hColor) o.hColor = t.hColor;
    if (t.h2Size) o.h2Size = t.h2Size;
    if (t.h2Weight) o.h2Weight = t.h2Weight;
    if (t.h2Color) o.h2Color = t.h2Color;
    if (t.bSize) o.bSize = t.bSize;
    if (t.bColor) o.bColor = t.bColor;
    if (t.lh) o.lh = t.lh;
    if (t.ls) o.ls = t.ls;
    if (t.italic) o.italic = true;
    if (t.upper) o.upper = true;
    return Object.keys(o).length ? o : null;
  }
  /* Figma-style tabbed editor for a TEXT block: Text · Fill & Stroke · Shapes.
     Returns {el,get}; get() merges the typography (from textStylePanel) with the
     box design (fill/stroke/radius/box-shadow) and any drawn shapes (deco). */
  function textDesignPanel(b) {
    b = b || {};
    var tsp = textStylePanel(b.tstyle || null, b.shadow != null ? b.shadow : 0, b.heading || "", b.body || "", b.heading2 || "");
    var box = { fill: b.fill || "", strokeColor: b.strokeColor || "", strokeWidth: (b.strokeWidth != null ? b.strokeWidth : 0), radius: (b.radius != null ? b.radius : 16), boxShadow: (b.boxShadow != null ? b.boxShadow : 0) };
    var deco = (b.deco && b.deco.els) ? JSON.parse(JSON.stringify(b.deco)) : null;
    var boxS = "display:flex;align-items:center;height:30px;border:1px solid var(--line);border-radius:8px;background:color-mix(in srgb,var(--bg) 60%,var(--surface));overflow:hidden;min-width:0";
    var rawS = "flex:1;min-width:0;height:100%;border:none;background:none;color:var(--text);font-family:'Inter',sans-serif;font-size:.78rem;padding:0 7px;outline:none";
    function micro(t) { return h("div", { style: "font-family:'Inter',sans-serif;font-size:.55rem;font-weight:700;letter-spacing:.15em;text-transform:uppercase;color:var(--muted);margin:13px 0 6px" }, [t]); }
    // live preview of the styled box
    var prev = h("div", {}, [
      h("div", { style: "font-family:'Inter',sans-serif;font-weight:700;font-size:1rem;color:var(--text)" }, ["Section heading"]),
      h("div", { style: "font-family:'Inter',sans-serif;font-size:.8rem;color:var(--muted);margin-top:3px" }, ["A line of body text inside the block."])
    ]);
    function paintPrev() {
      var s = "display:flex;flex-direction:column;justify-content:center;min-height:74px;padding:18px 20px;transition:.15s;";
      s += "background:" + (box.fill || "transparent") + ";";
      if (box.strokeWidth && box.strokeColor) s += "border:" + box.strokeWidth + "px solid " + box.strokeColor + ";";
      s += "border-radius:" + (box.radius || 0) + "px;";
      var sh = shadowCss(box.boxShadow); if (sh) s += "box-shadow:" + sh + ";";
      prev.setAttribute("style", s);
    }
    var prevStage = h("div", { style: "border:1px dashed color-mix(in srgb,var(--line) 80%,transparent);border-radius:12px;padding:14px;background:color-mix(in srgb,var(--bg) 62%,var(--surface))" }, [prev]);
    // reusable swatch + hex + native-picker color control
    function colorControl(getV, setV, swatches, onSet) {
      var sw = h("input", { type: "color", value: /^#[0-9a-f]{6}$/i.test(getV()) ? getV() : "#e5783a", style: "flex:none;width:22px;height:22px;margin:0 5px;padding:0;border:none;border-radius:6px;background:none;cursor:pointer" });
      var tx = h("input", { type: "text", placeholder: "none", value: getV() || "" }); tx.style.cssText = rawS;
      var chips = h("div", { style: "display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px" });
      function refresh() { Array.prototype.forEach.call(chips.children, function (c) { c.style.outline = (c.getAttribute("data-v") === (getV() || "")) ? "2px solid var(--accent)" : "none"; }); }
      function commit(v) { setV(v); if (onSet) onSet(v); refresh(); paintPrev(); }
      (swatches || []).forEach(function (s) {
        var val = s[0], css = val || "transparent";
        var c = h("button", { type: "button", title: s[1] || "", "data-v": val, style: "width:27px;height:27px;border-radius:7px;cursor:pointer;border:1px solid var(--line);outline-offset:2px;background:" + (val ? css : "repeating-conic-gradient(#c9c8c6 0 25%,#fff 0 50%) 50%/9px 9px") });
        c.addEventListener("click", function () { tx.value = val; if (/^#[0-9a-f]{6}$/i.test(val)) sw.value = val; commit(val); });
        chips.appendChild(c);
      });
      sw.addEventListener("input", function () { tx.value = sw.value; commit(sw.value); });
      tx.addEventListener("input", function () { var v = tx.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) sw.value = v; commit(v); });
      refresh();
      return h("div", {}, [chips, h("div", { style: boxS }, [sw, tx])]);
    }
    function rangeRow(label, get, set, min, max, step, unit) {
      var val = h("span", { style: "font-family:'Inter',sans-serif;font-weight:600;font-size:.78rem;color:var(--text)" }, [get() + (unit || "px")]);
      var r = h("input", { type: "range", min: min, max: max, step: step || 1, value: get(), style: "width:100%;accent-color:var(--accent);cursor:pointer" });
      r.addEventListener("input", function () { set(parseFloat(r.value)); val.textContent = r.value + (unit || "px"); paintPrev(); });
      return h("div", {}, [h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:5px" }, [h("label", { style: "font-family:'Inter',sans-serif;font-size:.72rem;color:var(--muted)" }, [label]), val]), r]);
    }
    var FILL_SW = [["", "No fill"], ["var(--surface)", "Surface"], ["color-mix(in srgb,var(--accent) 14%,var(--surface))", "Accent tint"], ["var(--accent)", "Accent"], ["#141209", "Dark"], ["#ffffff", "White"]];
    var STROKE_SW = [["", "No stroke"], ["var(--line)", "Line"], ["var(--accent)", "Accent"], ["var(--text)", "Text"], ["#ffffff", "White"]];
    var swLbl = h("span", { style: "font-family:'Inter',sans-serif;font-weight:600;font-size:.78rem;color:var(--text)" }, [box.strokeWidth + "px"]);
    var swRange = h("input", { type: "range", min: 0, max: 12, step: 1, value: box.strokeWidth, style: "width:100%;accent-color:var(--accent);cursor:pointer" });
    swRange.addEventListener("input", function () { box.strokeWidth = parseFloat(swRange.value); swLbl.textContent = swRange.value + "px"; paintPrev(); });
    var swWrap = h("div", { style: "margin-top:9px" }, [h("div", { style: "display:flex;justify-content:space-between;align-items:center;margin-bottom:5px" }, [h("label", { style: "font-family:'Inter',sans-serif;font-size:.72rem;color:var(--muted)" }, ["Stroke width"]), swLbl]), swRange]);
    function setSW(n) { box.strokeWidth = n; swRange.value = n; swLbl.textContent = n + "px"; }
    var fillPane = h("div", { style: "display:flex;flex-direction:column" }, [
      prevStage,
      micro("Fill"),
      colorControl(function () { return box.fill; }, function (v) { box.fill = v; }, FILL_SW),
      micro("Stroke"),
      colorControl(function () { return box.strokeColor; }, function (v) { box.strokeColor = v; }, STROKE_SW, function (v) { if (v && !box.strokeWidth) setSW(2); else if (!v) setSW(0); }),
      swWrap,
      micro("Corner radius"),
      rangeRow("Radius", function () { return box.radius; }, function (v) { box.radius = v; }, 0, 40, 1),
      micro("Box shadow"),
      rangeRow("Shadow", function () { return box.boxShadow; }, function (v) { box.boxShadow = v; }, 0, 100, 5, "%")
    ]);
    // Shapes pane -> launches Layout Studio (shapes, lines, arrows, fills & strokes)
    var shapeStat = h("div", { style: "font-family:'Inter',sans-serif;font-size:.8rem;color:var(--muted)" }, []);
    function paintShapeStat() { shapeStat.textContent = (deco && deco.els && deco.els.length) ? (deco.els.length + " shape" + (deco.els.length > 1 ? "s" : "") + " on this block — reopen to edit.") : "No shapes yet."; }
    paintShapeStat();
    var openShapes = h("button", { type: "button", class: "ak-btn", html: I.shapes + "<span>Open shape &amp; line editor</span>", style: "align-self:flex-start" });
    openShapes.addEventListener("click", function () {
      ensureStudio().then(function () {
        window.AKLayout.openEditor({
          design: (deco && deco.els) ? JSON.parse(JSON.stringify(deco)) : { h: 480, bg: "transparent", els: [] },
          onSave: function (d) { deco = (d && d.els && d.els.length) ? d : null; paintShapeStat(); },
          themes: DATA.canvasThemes || [],
          onThemesChange: function (l) { DATA.canvasThemes = l; save(); }
        });
      }).catch(function () { alert("Couldn't load the shape editor (layout-studio.js missing next to this page)."); });
    });
    var clearShapes = h("button", { type: "button", class: "ak-btn ghost", html: "Clear shapes", style: "align-self:flex-start" });
    clearShapes.addEventListener("click", function () { deco = null; paintShapeStat(); });
    var shapesPane = h("div", { style: "display:flex;flex-direction:column;gap:12px" }, [
      h("div", { style: "font-family:'Inter',sans-serif;font-size:.82rem;color:var(--muted);line-height:1.65" }, ["Draw rectangles, ellipses, lines, arrows and color fills on top of this block — with full fill & stroke control, like a design tool."]),
      openShapes, shapeStat, clearShapes
    ]);
    // tab shell
    var host = h("div", { style: "margin-top:13px" });
    var panes = { text: tsp.el, fill: fillPane, shapes: shapesPane };
    var tabBtns = {};
    var bar = h("div", { style: "display:inline-flex;gap:4px;padding:4px;border:1px solid var(--line);border-radius:11px;background:color-mix(in srgb,var(--bg) 60%,var(--surface))" });
    function show(name) {
      host.innerHTML = ""; host.appendChild(panes[name]);
      Object.keys(tabBtns).forEach(function (k) { var on = k === name, t = tabBtns[k]; t.style.background = on ? "linear-gradient(135deg,var(--accent),var(--accent-2))" : "none"; t.style.color = on ? "#fff" : "var(--muted)"; });
      if (name === "fill") paintPrev();
    }
    [["text", "Text"], ["fill", "Fill & Stroke"], ["shapes", "Shapes"]].forEach(function (d) {
      var t = h("button", { type: "button", style: "font-family:'Inter',sans-serif;font-weight:600;font-size:.8rem;border:none;border-radius:8px;padding:7px 15px;cursor:pointer;transition:.2s;color:var(--muted);background:none" }, [d[1]]);
      t.addEventListener("click", function () { show(d[0]); });
      tabBtns[d[0]] = t; bar.appendChild(t);
    });
    paintPrev();
    var wrap = h("div", {}, [bar, host]);
    show("text");
    return { el: wrap, get: function () { return Object.assign({}, tsp.get(), { fill: box.fill, strokeColor: box.strokeColor, strokeWidth: box.strokeWidth, radius: box.radius, boxShadow: box.boxShadow, deco: deco }); } };
  }
  /* box CSS (fill/stroke/radius/box-shadow) for a styled TEXT block; isSection keeps the card look */
  function textBoxCss(b, isSection) {
    var hasStroke = !!(b.strokeWidth && b.strokeColor);
    var hasBox = !!(b.fill || hasStroke || isSection);
    var s = "";
    if (b.fill) s += "background:" + b.fill + ";";
    if (hasStroke) s += "border:" + b.strokeWidth + "px solid " + b.strokeColor + ";";
    if (hasBox && b.radius != null) s += "border-radius:" + b.radius + "px;";
    var sh = shadowCss(b.boxShadow); if (hasBox && sh) s += "box-shadow:" + sh + ";";
    if (!isSection && (b.fill || hasStroke)) s += "padding:20px 22px;box-sizing:border-box;";
    return s;
  }
  /* drop-shadow CSS from a 0–100 intensity — shared by block render + editor previews */
  function shadowCss(v) {
    v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
    if (!v) return "";
    var t = v / 100;
    return "0 " + Math.round(6 + 26 * t) + "px " + Math.round(16 + 46 * t) + "px " + Math.round(-6 - 10 * t) + "px rgba(0,0,0," + (0.2 + 0.42 * t).toFixed(2) + "),0 " + Math.round(2 + 6 * t) + "px " + Math.round(8 + 14 * t) + "px rgba(0,0,0," + (0.12 + 0.24 * t).toFixed(2) + ")";
  }
  function textShadowCss(v) {
    v = Math.max(0, Math.min(100, parseInt(v, 10) || 0));
    if (!v) return "";
    var t = v / 100;
    return "0 " + Math.round(1 + 5 * t) + "px " + Math.round(3 + 17 * t) + "px rgba(0,0,0," + (0.22 + 0.4 * t).toFixed(2) + ")";
  }
  /* tasteful stand-in when a media file 404s, so a missing asset never shows a broken element */
  function mediaMissing(icon, label, rad) {
    return h("div", { class: "ak-missing", style: rad || "" }, [
      h("div", { class: "ak-missing-ic", html: icon || I.img }),
      h("p", {}, [label || "Media unavailable"]),
      h("small", {}, ["File not found"])
    ]);
  }
  var I_REPLACE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h14l-3.5-3.5M21 16H7l3.5 3.5"/></svg>';
  var I_BRESIZE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 21H3v-7M21 10V3h-7M3 21l7-7M21 3l-7 7"/></svg>';
  /* ---- one-click Replace: swap the file behind an image/video/PDF/3D block ---- */
  function replaceBlockFile(item, b, rerender) {
    var accept = { image: "image/*", pdf: "application/pdf", media: "video/*,audio/*", model: ".glb,.gltf,.obj,.fbx,model/gltf-binary,model/gltf+json" }[b.type] || "";
    var i = h("input", { type: "file", accept: accept, style: "display:none" });
    i.addEventListener("change", function () {
      var f = i.files[0]; if (!f) return;
      readFileAsDataURL(f).then(function (data) {
        b.src = data;
        if (b.type === "media") b.mime = (String(data).match(/^data:(.*?);/) || [])[1] || "";
        if (b.type === "model") b.format = modelFormat(f.name);
        delete b.pos; // reset framing for the new file
        save().then(keepScroll(rerender || renderDetail));
      });
    });
    document.body.appendChild(i); i.click();
    setTimeout(function () { i.remove(); }, 120000);
  }
  /* ---- Decorate a block: Layout Studio overlay (transparent) saved on b.deco ---- */
  /* ---- free drag-to-resize a content block: sets column span + height ---- */
  function wireBlockResize(block, item, b, handle, rerender) {
    handle.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button > 0) return;
      e.preventDefault(); e.stopPropagation();
      var gridEl = block.parentNode; if (!gridEl) return;
      var cs = getComputedStyle(gridEl);
      var cols = cs.gridTemplateColumns.split(" ").map(parseFloat).filter(function (n) { return !isNaN(n); });
      var nCols = cols.length || 6, colW = cols[0] || 100;
      var colGap = parseFloat(cs.columnGap || cs.gap) || 18;
      var r = block.getBoundingClientRect(), left = r.left, top = r.top, pending = null;
      block.classList.add("ak-block-resizing"); block.setAttribute("draggable", "false");
      try { handle.setPointerCapture(e.pointerId); } catch (er) {}
      function move(ev) {
        var w = ev.clientX - left, hgt = ev.clientY - top;
        var c = Math.max(1, Math.min(nCols, Math.round((w + colGap) / (colW + colGap))));
        var hh = Math.max(120, Math.round(hgt));
        block.style.gridColumn = "span " + c;
        block.setAttribute("data-bento", "1"); block.style.setProperty("--bh", hh + "px");
        pending = { c: c, h: hh };
      }
      function up() {
        handle.removeEventListener("pointermove", move); handle.removeEventListener("pointerup", up);
        block.classList.remove("ak-block-resizing"); block.setAttribute("draggable", "true");
        if (pending) { b.span = pending.c; b.customH = pending.h; delete b.size; save().then(keepScroll(rerender || renderDetail)); }
      }
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", up);
    });
  }
  function renderBlock(item, b, idx, admin, rerender) {
    rerender = rerender || renderDetail;
    var sh = shadowCss(b.shadow);
    var rad = "border-radius:" + (b.radius != null ? b.radius : 15) + "px" + (sh ? ";box-shadow:" + sh : "");
    var inner;
    if (b.type === "image") {
      var imgHold = h("div", { class: "ak-wide ak-imghold", style: rad });
      /* every image is in the DOM from the start (no observer + idle-callback delay);
         the top two load eagerly at high priority, the rest ride native lazy-loading
         at low priority so they can never starve the first screen. */
      var eagerImg = idx < 2;
      var im = h("img", { class: "media", style: rad, src: dataURLtoBlobURL(b.src), alt: b.caption || "",
        loading: eagerImg ? "eager" : "lazy", fetchpriority: eagerImg ? "high" : "low", decoding: "async" });
      im.addEventListener("load", function () { imgHold.classList.add("loaded"); });
      im.addEventListener("error", function () { imgHold.classList.add("loaded"); imgHold.innerHTML = ""; imgHold.appendChild(mediaMissing(I.img, "Image unavailable", rad)); });
      imgHold.appendChild(im);
      inner = h("div", {}, [imgHold, b.caption ? h("div", { class: "ak-cap" }, [b.caption]) : null]);
    } else if (b.type === "pdf") {
      var pdfHold = h("div", { class: "ak-pdf", style: rad });
      lazyMount(pdfHold, function () { pdfHold.appendChild(h("iframe", { src: dataURLtoBlobURL(b.src) + "#toolbar=1", title: b.caption || "PDF" })); });
      inner = h("div", {}, [pdfHold, b.caption ? h("div", { class: "ak-cap" }, [b.caption]) : null]);
    } else if (b.type === "prototype") {
      var protoInfo = h("div", { class: "ak-proto-info" }, [
        h("span", { class: "eyebrow" }, ["Live Prototype"]),
        h("h2", {}, [b.caption || "Try the prototype"]),
        h("p", {}, ["Tap through the interactive prototype below \u2014 the real flows, click the hotspots to move between screens."]),
        h("div", { class: "ak-proto-hint" }, [
          h("span", { class: "chip" }, [h("span", { class: "dot" }), "Fully interactive"]),
          h("span", { class: "chip" }, ["Best viewed on desktop"])
        ])
      ]);
      inner = h("div", {}, [protoInfo, h("div", { class: "ak-wide" }, [h("iframe", { class: "media", style: rad, src: b.src, allowfullscreen: "", loading: "lazy" })])]);
    } else if (b.type === "media") {
      var isAudio = (b.mime || "").indexOf("audio") === 0;
      var mEl = isAudio ? h("audio", { class: "media", src: dataURLtoBlobURL(b.src), controls: "", preload: "metadata" }) : h("video", { class: "media", style: rad, src: dataURLtoBlobURL(b.src), controls: "", playsinline: "", preload: "metadata" });
      mEl.addEventListener("error", function () { var ph = mediaMissing(I.media, isAudio ? "Audio unavailable" : "Video unavailable", rad); if (mEl.parentNode) mEl.parentNode.replaceChild(ph, mEl); });
      inner = h("div", {}, [isAudio ? mEl : h("div", { class: "ak-wide" }, [mEl]), b.caption ? h("div", { class: "ak-cap" }, [b.caption]) : null]);
    } else if (b.type === "model") {
      var holder = h("div", { class: "ak-3d", style: rad });
      lazyMount(holder, function () { mount3D(holder, b); });
      inner = h("div", {}, [h("div", { class: "ak-wide" }, [holder]), b.caption ? h("div", { class: "ak-cap" }, [b.caption]) : null]);
    } else if (b.type === "text") {
      var tsh = textShadowCss(b.shadow);
      var ts = b.tstyle || {};
      var wrapS = (tsh ? "text-shadow:" + tsh + ";" : "") + (ts.align && ts.align !== "left" ? "text-align:" + ts.align + ";" : "");
      var hS = "", pS = "", h2S = "";
      var hF = ts.hFont || ts.font, h2F = ts.h2Font || ts.font, bF = ts.bFont || ts.font;
      if (hF) hS += "font-family:" + hF + ";";
      if (h2F) h2S += "font-family:" + h2F + ";";
      if (bF) pS += "font-family:" + bF + ";";
      if (ts.hSize) hS += "font-size:" + ts.hSize + "px;";
      if (ts.hWeight) hS += "font-weight:" + ts.hWeight + ";"; else if (ts.hBold) hS += "font-weight:800;";
      if (ts.hColor) hS += "color:" + ts.hColor + ";";
      if (ts.h2Size) h2S += "font-size:" + ts.h2Size + "px;";
      if (ts.h2Weight) h2S += "font-weight:" + ts.h2Weight + ";"; else if (ts.h2Bold) h2S += "font-weight:800;";
      if (ts.h2Color) h2S += "color:" + ts.h2Color + ";";
      if (ts.bSize) pS += "font-size:" + ts.bSize + "px;";
      if (ts.bColor) pS += "color:" + ts.bColor + ";";
      if (ts.bBold) pS += "font-weight:700;";
      if (ts.lh) pS += "line-height:" + ts.lh + ";";
      if (ts.ls) { hS += "letter-spacing:" + ts.ls + "px;"; pS += "letter-spacing:" + ts.ls + "px;"; h2S += "letter-spacing:" + ts.ls + "px;"; }
      if (ts.italic || ts.hI) hS += "font-style:italic;";
      if (ts.italic || ts.h2I) h2S += "font-style:italic;";
      if (ts.italic || ts.bI) pS += "font-style:italic;";
      if (ts.hU) hS += "text-decoration:underline;text-underline-offset:4px;";
      if (ts.h2U) h2S += "text-decoration:underline;text-underline-offset:3px;";
      if (ts.bU) pS += "text-decoration:underline;text-underline-offset:3px;";
      if (ts.upper) { hS += "text-transform:uppercase;"; h2S += "text-transform:uppercase;"; }
      if (ts.align === "center") pS += "margin-left:auto;margin-right:auto;";
      else if (ts.align === "right") pS += "margin-left:auto;";
      var textInner = h("div", { class: "ak-text", style: wrapS }, [b.heading ? h("h2", { style: hS }, [b.heading]) : null, b.heading2 ? h("h3", { style: h2S }, [b.heading2]) : null, b.body ? h("p", { style: pS }, [b.body]) : null]);
      if (b.section) {
        var _sn = 0; for (var _j = 0; _j <= idx; _j++) { var _bb = item.blocks[_j]; if (_bb && _bb.type === "text" && _bb.section) _sn++; }
        var _num = ("0" + _sn).slice(-2);
        inner = h("div", { class: "ak-sec" }, [
          h("div", { class: "ak-sec-top", style: "display:flex;align-items:center;gap:14px;margin-bottom:14px" }, [
            h("span", { class: "ak-sec-num", style: "font-family:'Inter',sans-serif;font-weight:700;font-size:.72rem;letter-spacing:.18em;color:var(--accent);flex:none" }, [_num]),
            h("span", { style: "flex:1;height:1px;background:var(--line)" })
          ]),
          textInner
        ]);
      } else {
        inner = textInner;
      }
      var _tbc = textBoxCss(b, !!b.section);
      if (_tbc) { var _tbHost = b.section ? inner : textInner; _tbHost.setAttribute("style", (_tbHost.getAttribute("style") || "") + _tbc); }
    } else if (b.type === "canvas") {
      var cvh = h("div", { class: "ak-canvas" });
      ensureStudio().then(function () { window.AKLayout.render(cvh, b.design || { h: 600, els: [] }); });
      inner = h("div", {}, [h("div", { class: "ak-wide" }, [cvh]), b.caption ? h("div", { class: "ak-cap" }, [b.caption]) : null]);
    } else inner = h("div", {}, ["Unknown block"]);

    var block = h("div", { class: "ak-block" + (admin ? " admin" : ""), "data-bid": b.id || "" }, []);
    block.style.gridColumn = (b.section && b.span == null && b.size == null) ? "1 / -1" : ("span " + (b.span || sizeSpan(b.size)));
    var _bh = b.customH || (b.section ? 0 : sizeH(b.size));
    if (_bh) { block.setAttribute("data-bento", "1"); block.style.setProperty("--bh", _bh + "px"); }
    if (admin) {
      var toolbar = h("div", { class: "ak-btoolbar" }, [
        h("div", { class: "grab", html: I.dots + "<span>" + esc(typeLabel(b.type)) + "</span>" }),
        h("button", { class: "ak-tb", title: "Move up", html: I.up, onclick: function () { moveBlock(item, idx, -1, rerender); }, disabled: idx === 0 ? "" : null }),
        h("button", { class: "ak-tb", title: "Move down", html: I.down, onclick: function () { moveBlock(item, idx, 1, rerender); }, disabled: idx === item.blocks.length - 1 ? "" : null }),
        h("button", { class: "ak-tb ak-tb-w", "data-ak-size-btn": "1", title: "Card size", html: '<span>' + SIZE_DEF[sizeKey(b.size)].short + '</span>', onclick: function (e) { e.stopPropagation(); openBlockSizePop(item, b, e.currentTarget, rerender); } }),
        (["image", "media", "pdf", "prototype", "model"].indexOf(b.type) >= 0) ? h("button", { class: "ak-tb", title: "Move / scale \u2014 drag to reposition, slider to zoom", html: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3v18M3 12h18M12 3l-2.5 2.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', onclick: function (e) { e.stopPropagation(); enterAdjust(block, b, rerender); } }) : null,
        (["image", "media", "pdf", "model"].indexOf(b.type) >= 0) ? h("button", { class: "ak-tb", title: "Replace file", "aria-label": "Replace file", html: I_REPLACE, onclick: function (e) { e.stopPropagation(); replaceBlockFile(item, b, rerender); } }) : null,
        h("button", { class: "ak-tb", title: "Edit", html: I.edit, onclick: function () { editBlock(item, b, undefined, rerender); } }),
        h("button", { class: "ak-tb warn", title: "Delete", html: I.trash, onclick: function () { deleteBlock(item, b, rerender); } })
      ]);
      block.appendChild(toolbar);
      block.setAttribute("draggable", "true");
      block.addEventListener("dragstart", function (e) { block.classList.add("drag"); e.dataTransfer.setData("text/plain", idx); e.dataTransfer.effectAllowed = "move"; });
      block.addEventListener("dragend", function () { block.classList.remove("drag"); });
      block.addEventListener("dragover", function (e) { e.preventDefault(); block.classList.add("over"); });
      block.addEventListener("dragleave", function () { block.classList.remove("over"); });
      block.addEventListener("drop", function (e) {
        e.preventDefault(); block.classList.remove("over");
        var from = parseInt(e.dataTransfer.getData("text/plain"), 10);
        if (!isNaN(from) && from !== idx) reorderBlock(item, from, idx, rerender);
      });
    }
    block.appendChild(inner);
    if (b.pos) applyMediaPos(inner, b);
    if (b.deco && b.deco.els && b.deco.els.length) {
      var _dhost = inner.querySelector(".ak-wide") || ((inner.classList && (inner.classList.contains("ak-sec") || inner.classList.contains("ak-text"))) ? inner : null) || inner.firstElementChild;
      if (_dhost) {
        if (getComputedStyle(_dhost).position === "static") _dhost.style.position = "relative";
        var _deco = h("div", { class: "ak-block-deco", "aria-hidden": "true" });
        _dhost.appendChild(_deco);
        ensureStudio().then(function () { if (window.AKLayout && window.AKLayout.renderCover) window.AKLayout.renderCover(_deco, b.deco); });
      }
    }
    if (admin) {
      var _rez = h("button", { class: "ak-block-resize", title: "Drag to resize / scale this box", "aria-label": "Resize box", html: I_BRESIZE, onclick: function (e) { e.stopPropagation(); e.preventDefault(); } });
      block.appendChild(_rez);
      wireBlockResize(block, item, b, _rez, rerender);
    }
    return block;
  }
  function typeLabel(t) { return ({ image: "Image", pdf: "PDF", prototype: "Prototype", media: "Video / Audio", model: "3D model", text: "Text", canvas: "Layout canvas" })[t] || t; }

  // Wrap a rerender so the page scroll position is preserved across the
  // full DOM rebuild (move/reorder/delete blocks should NOT jump to top).
  function keepScroll(fn) {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0;
    return function () {
      var r = fn && fn.apply(this, arguments);
      window.scrollTo(0, y);
      requestAnimationFrame(function () { window.scrollTo(0, y); });
      return r;
    };
  }
  function moveBlock(item, idx, dir, rerender) {
    rerender = rerender || renderDetail;
    var j = idx + dir; if (j < 0 || j >= item.blocks.length) return;
    var a = item.blocks; var t = a[idx]; a[idx] = a[j]; a[j] = t;
    save().then(keepScroll(rerender));
  }
  function reorderBlock(item, from, to, rerender) {
    rerender = rerender || renderDetail;
    var a = item.blocks; var moved = a.splice(from, 1)[0]; a.splice(to, 0, moved);
    save().then(keepScroll(rerender));
  }
  function deleteBlock(item, b, rerender) {
    rerender = rerender || renderDetail;
    confirmModal("Delete this " + typeLabel(b.type).toLowerCase() + " block?", "", true).then(function (ok) {
      if (!ok) return;
      var idx = item.blocks.indexOf(b);
      item.blocks = item.blocks.filter(function (x) { return x.id !== b.id; });
      var shed = studioDropBlock(item, b);
      save().then(keepScroll(rerender));
      showUndoToast("Deleted " + typeLabel(b.type).toLowerCase() + " block", function () {
        if (item.blocks.indexOf(b) < 0) item.blocks.splice(Math.max(0, Math.min(idx < 0 ? item.blocks.length : idx, item.blocks.length)), 0, b);
        studioRestoreCards(item, b, shed);
        save().then(keepScroll(rerender));
      });
    });
  }

  /* ---------- block add/edit ---------- */
  function caseStore(key) { DATA.cases = DATA.cases || {}; DATA.cases[key] = DATA.cases[key] || { blocks: [] }; return DATA.cases[key]; }
  function currentCtx() {
    if (openCaseKey) return { obj: caseStore(openCaseKey), rerender: renderCases };
    if (openItemId) { var it = DATA.items.find(function (x) { return x.id === openItemId; }); return it ? { obj: it, rerender: renderDetail } : null; }
    return null;
  }
  function addBlock(type) { var c = currentCtx(); if (!c) return; editBlock(c.obj, null, type, c.rerender); }

  /* ---------- Layout Studio (freeform themed canvas — layout-studio.js) ---------- */
  /* Studio script is cache-busted per page-load so a redeploy is always picked up fresh. */
  var STUDIO_V = (window.AK_BUILD || Date.now());
  function ensureStudio() { return Promise.all([loadScript("layout-studio.js?v=" + STUDIO_V), loadScript("studio-templates.js?v=" + STUDIO_V)]); }

  /* ---------- Whole-project Layout Studio (category-aware, ADDITIVE) ----------
     A project opened here becomes a freeform canvas: every image / video /
     prototype / 3D model is a movable, resizable card. Saving writes item.studio;
     renderDetail then renders that canvas instead of the classic block stack.
     Nothing is destroyed — item.blocks stays intact, and a project with no
     item.studio renders exactly as before (safe fallback).
     ROLLOUT: only pages in STUDIO_PAGES expose the entry points. All three
     categories are now live. Per-category look lives in studio-templates.js. */
  var STUDIO_PAGES = ["ui-ux", "gen-ai", "3d"];
  function studioEnabled() { return STUDIO_PAGES.indexOf(CFG.page) >= 0; }
  function itemInfo(it) {
    var m = it.meta || {};
    return { title: it.title || "", tag: it.tag || "", desc: it.desc || "", role: m.role || "", timeline: m.timeline || "", platform: m.platform || "", focus: m.focus || "", software: m.software || "" };
  }
  function applyItemInfo(it, info) {
    it.title = info.title; it.tag = info.tag; it.desc = info.desc;
    it.meta = { role: info.role, timeline: info.timeline, platform: info.platform, focus: info.focus, software: info.software };
  }
  function openProjectStudio(it) {
    if (!it) return;
    ensureStudio().then(function () {      var T = window.AKStudioTemplates, cat = T.forPage(CFG.page);
      function launch(design) {
        /* blocks that were represented on the canvas at open time — the only ones
           a delete inside the Studio is allowed to remove */
        var hadCards = ((it.blocks) || []).filter(function (b) { return designHasBlock(design, b); }).map(function (b) { return b.id; });
        window.AKLayout.openEditor({
          design: design,
          title: it.title || ("Untitled " + CFG.noun),
          badge: cat.label,
          accent: cat.accent,
          accent2: cat.accent2,
          saveLabel: "Save project",
          templateKey: CFG.page,
          templateList: ["ui-ux", "gen-ai", "3d"].sort(function (a, b) { return (a === CFG.page ? -1 : 0) - (b === CFG.page ? -1 : 0); }).map(function (key) { var c = T.forPage(key); return { key: key, label: c.label, accent: c.accent, accent2: c.accent2, design: T.blankTemplate(key, TEMPLATES[key]) }; }),
          info: itemInfo(it),
          onInfo: function (info) { applyItemInfo(it, info); save().then(function () { renderTiles(); if (openItemId) renderDetail(); }); },
          onSave: function (design) {
            it.studio = design;
            reapBlocks(it, design, hadCards);   // cards deleted on the canvas take their block with them
            save().then(keepScroll(renderDetail));
          },
          themes: DATA.canvasThemes || [],
          onThemesChange: function (list) { DATA.canvasThemes = list; save(); }
        });
      }
      if (it.studio && it.studio.els && it.studio.els.length) {
        syncStudioBlocks(it).then(function () { launch(JSON.parse(JSON.stringify(it.studio))); });
      }
      else Promise.resolve(T.buildFromItem(it, CFG.page, TEMPLATES[CFG.page])).then(launch);
    }).catch(function () { alert("Couldn't load Layout Studio (layout-studio.js / studio-templates.js missing next to this page)."); });
  }
  function newProjectStudio() { editItem(null, "project"); }

  /* ---------- keeping "Add content" / "Template" alive inside a Studio project ----------
     A project with a saved it.studio renders the canvas INSTEAD of the block stack,
     so anything added afterwards through "Add content" or the section "Template"
     button used to save silently and never show up (and the same content was also
     missing next time the Studio opened). Every block that has no card on the canvas
     yet is appended to the bottom of the design, once. */
  var studioSyncTried = Object.create(null);
  /* …and the reverse: a card deleted inside the Studio drops the block it came
     from, so the sync above can never resurrect it on the next open / reload.
     Only blocks that HAD a card when the Studio opened are eligible — clearing the
     canvas or starting from a template can never wipe a project's media. */
  function reapBlocks(it, design, eligible) {
    if (!(it && it.blocks && it.blocks.length && design && design.els && eligible && eligible.length)) return [];
    var can = Object.create(null); eligible.forEach(function (id) { can[id] = 1; });
    var gone = it.blocks.filter(function (b) { return b && can[b.id] && !designHasBlock(design, b); });
    if (!gone.length) return [];
    var dead = Object.create(null); gone.forEach(function (b) { dead[b.id] = 1; });
    it.blocks = it.blocks.filter(function (b) { return !(b && dead[b.id]); });
    gone.forEach(function (b) { studioSyncTried[b.id] = 1; });   // don't re-append what was just removed
    return gone;
  }
  /* Deleting a block also pulls its card off the freeform canvas — otherwise the
     block is gone but the project still shows it in Studio (canvas) mode. */
  function studioDropBlock(it, b) {
    if (!(it && it.studio && it.studio.els && it.studio.els.length && b)) return null;
    var gone = it.studio.els.filter(function (e) { return e && (e.sb === b.id || (b.src && e.content && e.content.src === b.src)); });
    if (!gone.length) return null;
    var ids = {}; gone.forEach(function (e) { ids[e.id] = 1; });
    it.studio.els = it.studio.els.filter(function (e) { return !(e && ids[e.id]); });
    return gone;
  }
  function studioRestoreCards(it, b, cards) {
    delete studioSyncTried[b.id];
    if (!(it && it.studio && cards && cards.length)) return;
    it.studio.els = (it.studio.els || []).concat(cards);
  }
  function studioHasBlock(it, b) { return designHasBlock(it.studio, b); }
  function designHasBlock(design, b) {
    return ((design && design.els) || []).some(function (e) {
      if (!e) return false;
      if (e.sb && e.sb === b.id) return true;
      var c = e.content; if (!c) return false;
      if (b.src && c.src && c.src === b.src) return true;                       // pre-.sb layouts
      if (b.type === "text" && c.type === "text") {
        var t = (b.section ? (b.heading || b.body) : (b.text || b.body || b.heading || b.caption)) || "";
        return !!t && c.text === t;
      }
      return false;
    });
  }
  function pendingStudioBlocks(it) {
    if (!(it && it.studio && it.studio.els && it.studio.els.length)) return [];
    return (it.blocks || []).filter(function (b) {
      return b && b.type && b.type !== "canvas" && !studioSyncTried[b.id] && !studioHasBlock(it, b);
    });
  }
  function syncStudioBlocks(it) {
    var pend = pendingStudioBlocks(it);
    if (!pend.length) return Promise.resolve(false);
    pend.forEach(function (b) { studioSyncTried[b.id] = 1; });   // never retry-loop on a failed measure
    return ensureStudio()
      .then(function () { return window.AKStudioTemplates.appendBlocks(it.studio, pend, CFG.page); })
      .then(function () { return save(); })
      .then(function () { return true; })
      .catch(function () { return false; });
  }
  /* Recover from an unwanted freeform layout: drop item.studio so renderDetail
     falls back to the classic stacked project. Media + details are untouched;
     reopening the Studio rebuilds a fresh full-width layout from the media. */
  function resetProjectStudio(it) {
    if (!it) return;
    confirmModal("Reset Studio layout?", "This clears the saved freeform layout for \u201c" + (it.title || CFG.noun) + "\u201d and restores the original stacked project. Your media and details are kept.", true)
      .then(function (ok) {
        if (!ok) return;
        var prev = it.studio; delete it.studio;
        closeMenu();
        save().then(function () { if (openItemId) renderDetail(); else renderTiles(); });
        showUndoToast("Studio layout reset", function () { it.studio = prev; save().then(function () { if (openItemId) renderDetail(); else renderTiles(); }); });
      });
  }
  function openStudio(item, b, rerender) {
    rerender = rerender || renderDetail;
    ensureStudio().then(function () {
      var cat = window.AKStudioTemplates.forPage(CFG.page); // theme chrome + bento hover to this category's accent
      window.AKLayout.openEditor({
        accent: cat.accent,
        accent2: cat.accent2,
        // new canvases start from the saved theme layout, so every project matches
        design: b ? b.design : (DATA.themeLayout ? JSON.parse(JSON.stringify(DATA.themeLayout)) : null),
        onSave: function (design) {
          if (b) { b.design = design; }
          else { b = { id: uid(), type: "canvas", design: design }; item.blocks.push(b); }
          save().then(keepScroll(rerender));
        },
        onSaveTheme: function (design) { DATA.themeLayout = design; save(); },
        themes: DATA.canvasThemes || [],
        onThemesChange: function (list) { DATA.canvasThemes = list; save(); }
      });
    }).catch(function () { alert("Couldn't load Layout Studio (layout-studio.js missing next to this page)."); });
  }

  /* ============================================================ APPEARANCE: spacing + background */
  function spacingTargets() {
    if (openCaseKey) return Array.prototype.slice.call(document.querySelectorAll('.panel[data-panel="' + openCaseKey + '"] .ak-case-blocks'));
    if (openItemId) return Array.prototype.slice.call(document.querySelectorAll('.ak-detail .ak-blocks'));
    return [];
  }
  function bgTarget() {
    if (openCaseKey) return document.querySelector('.panel[data-panel="' + openCaseKey + '"]');
    if (openItemId) return document.querySelector('.ak-detail');
    return null;
  }
  function editSpacing() {
    var c = currentCtx(); if (!c) return;
    var targets = spacingTargets();
    var orig = c.obj.spacing != null ? c.obj.spacing : 30;
    var ov = h("div", { class: "ak-ov" });
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    function revert() { targets.forEach(function (t) { t.style.gap = orig + "px"; }); }
    function onKey(e) { if (e.key === "Escape") { revert(); close(); } }
    var valLabel = h("span", { style: "font-family:'Inter',sans-serif;font-weight:600;color:var(--text)" }, [orig + "px"]);
    var range = h("input", { type: "range", min: "0", max: "100", step: "2", value: orig, style: "width:100%;accent-color:var(--accent);cursor:pointer" });
    range.addEventListener("input", function () { valLabel.textContent = range.value + "px"; targets.forEach(function (t) { t.style.gap = range.value + "px"; }); });
    var where = openCaseKey ? "case study" : CFG.noun;
    var m = h("div", { class: "ak-modal", style: "width:min(440px,100%)" }, [
      h("h3", {}, ["Content spacing"]),
      h("div", { class: "sub" }, ["Adjust the gap between content blocks \u2014 images, PDFs, 3D models and more \u2014 in this " + where + ". Drag to preview live."]),
      h("div", { class: "ak-field" }, [
        h("div", { style: "display:flex;justify-content:space-between;align-items:center" }, [h("label", {}, ["Space between blocks"]), valLabel]),
        range
      ]),
      h("div", { class: "ak-acts" }, [
        h("button", { class: "ak-btn ghost", onclick: function () { revert(); close(); } }, ["Cancel"]),
        h("button", { class: "ak-btn", onclick: function () { c.obj.spacing = parseInt(range.value, 10); save().then(c.rerender); close(); } }, ["Save"])
      ])
    ]);
    ov.appendChild(m);
    ov.addEventListener("click", function (e) { if (e.target === ov) { revert(); close(); } });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
  }
  function editBackground() {
    var c = currentCtx(); if (!c) return;
    var target = bgTarget();
    var scopeHero = target ? target.querySelector(".hero, .ak-d-hero") : null;
    var scopeFoot = target ? target.querySelector(".cs-foot, .ak-d-foot") : null;
    var orig = c.obj.bg || "";
    var presets = ["#0b0b12", "#11131c", "#1a1c28", "#0e1a14", "#161022", "#1c1410", "#f5f6fb", "#ffffff"];
    var ov = h("div", { class: "ak-ov" });
    function close() { ov.remove(); document.removeEventListener("keydown", onKey); }
    function paint(val) {
      if (target) target.style.background = val || "";
      if (scopeHero) scopeHero.style.background = val ? "var(--bg)" : "";
      if (scopeFoot) scopeFoot.style.background = val ? "var(--bg)" : "";
    }
    function revert() { paint(orig); }
    function onKey(e) { if (e.key === "Escape") { revert(); close(); } }
    function applyLive(val) { paint(val); }
    var seed = /^#[0-9a-f]{6}$/i.test(orig) ? orig : "#11131c";
    var hexInput = h("input", { type: "text", value: orig, placeholder: "#11131c or any CSS color", style: "flex:1" });

    /* ---- self-contained color picker (no native dialog; works in any sandbox) ---- */
    function _clamp(v) { return Math.max(0, Math.min(1, v)); }
    function _hexToRgb(x) { var m2 = /^#?([0-9a-f]{6})$/i.exec((x || "").trim()); if (!m2) return null; var n = parseInt(m2[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    function _rgbToHex(r, g, b) { return "#" + [r, g, b].map(function (v) { return ("0" + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2); }).join(""); }
    function _hsvToRgb(h0, s, v) { var i = Math.floor(h0 / 60), f = h0 / 60 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), r, g, b; switch (i % 6) { case 0: r = v; g = t; b = p; break; case 1: r = q; g = v; b = p; break; case 2: r = p; g = v; b = t; break; case 3: r = p; g = q; b = v; break; case 4: r = t; g = p; b = v; break; default: r = v; g = p; b = q; } return [r * 255, g * 255, b * 255]; }
    function _rgbToHsv(r, g, b) { r /= 255; g /= 255; b /= 255; var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h0 = 0, s = mx ? d / mx : 0, v = mx; if (d) { if (mx === r) h0 = ((g - b) / d) % 6; else if (mx === g) h0 = (b - r) / d + 2; else h0 = (r - g) / d + 4; h0 *= 60; if (h0 < 0) h0 += 360; } return [h0, s, v]; }
    var _ir = _hexToRgb(seed) || [17, 19, 28];
    var hsv = _rgbToHsv(_ir[0], _ir[1], _ir[2]);

    var svArea = h("div", { style: "position:relative;width:100%;height:150px;border-radius:10px;overflow:hidden;cursor:crosshair;border:1px solid var(--line);touch-action:none" }, [
      h("div", { style: "position:absolute;inset:0;background:linear-gradient(to right,#fff,rgba(255,255,255,0))" }),
      h("div", { style: "position:absolute;inset:0;background:linear-gradient(to top,#000,rgba(0,0,0,0))" })
    ]);
    var svDot = h("div", { style: "position:absolute;width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.45);transform:translate(-50%,-50%);pointer-events:none" });
    svArea.appendChild(svDot);
    var hueBar = h("div", { style: "position:relative;width:100%;height:14px;border-radius:8px;margin-top:12px;cursor:pointer;border:1px solid var(--line);touch-action:none;background:linear-gradient(to right,#f00 0%,#ff0 17%,#0f0 33%,#0ff 50%,#00f 67%,#f0f 83%,#f00 100%)" });
    var hueDot = h("div", { style: "position:absolute;top:50%;width:12px;height:20px;border-radius:5px;border:2px solid #fff;box-shadow:0 0 0 1.5px rgba(0,0,0,.45);transform:translate(-50%,-50%);pointer-events:none" });
    hueBar.appendChild(hueDot);
    var preview = h("div", { style: "width:42px;height:42px;border-radius:9px;border:1px solid var(--line);flex:none;background:" + (orig || seed) });

    function paintDots() {
      svArea.style.background = "hsl(" + Math.round(hsv[0]) + ",100%,50%)";
      svDot.style.left = (hsv[1] * 100) + "%";
      svDot.style.top = ((1 - hsv[2]) * 100) + "%";
      hueDot.style.left = (hsv[0] / 360 * 100) + "%";
    }
    function commit() {
      var rgb = _hsvToRgb(hsv[0], hsv[1], hsv[2]);
      var hex = _rgbToHex(rgb[0], rgb[1], rgb[2]);
      paintDots();
      hexInput.value = hex;
      preview.style.background = hex;
      applyLive(hex);
    }
    function dragSV(e) { var r = svArea.getBoundingClientRect(); hsv[1] = _clamp((e.clientX - r.left) / r.width); hsv[2] = 1 - _clamp((e.clientY - r.top) / r.height); commit(); }
    function dragHue(e) { var r = hueBar.getBoundingClientRect(); hsv[0] = _clamp((e.clientX - r.left) / r.width) * 360; commit(); }
    function attachDrag(el, fn) {
      el.addEventListener("pointerdown", function (e) {
        e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (er) {} fn(e);
        function mv(ev) { fn(ev); }
        function up() { el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); }
        el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
      });
    }
    attachDrag(svArea, dragSV);
    attachDrag(hueBar, dragHue);
    hexInput.addEventListener("input", function () {
      var hv = hexInput.value.trim(); applyLive(hv); preview.style.background = hv || "transparent";
      var rgb = _hexToRgb(hv); if (rgb) { hsv = _rgbToHsv(rgb[0], rgb[1], rgb[2]); paintDots(); }
    });
    paintDots();

    /* convert any CSS color (hex / rgb / hsl / named) to #rrggbb */
    function _cssToHex(c) { try { var cv = document.createElement("canvas"); cv.width = cv.height = 1; var cx = cv.getContext("2d"); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); var d = cx.getImageData(0, 0, 1, 1).data; return _rgbToHex(d[0], d[1], d[2]); } catch (er) { return null; } }
    function _applyPicked(c) { var hx = _cssToHex(c); if (hx) { var rgb = _hexToRgb(hx); hsv = _rgbToHsv(rgb[0], rgb[1], rgb[2]); commit(); } else { hexInput.value = c; preview.style.background = c; applyLive(c); } }
    /* eyedropper — sample a color from anywhere on the page, or match the site background */
    var eyeBtn = h("button", { type: "button", title: "Pick a color from the page",
      style: "width:42px;height:42px;flex:none;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--line);border-radius:9px;background:var(--surface);color:var(--text);cursor:pointer;transition:.2s",
      html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22l1.5-4.5L15 6l3 3L6.5 20.5 2 22z"/><path d="M14.5 6.5l3 3 2.4-2.4a2 2 0 0 0 0-2.8l-.3-.3a2 2 0 0 0-2.8 0L14.5 6.5z"/></svg>',
      onclick: function () {
        if (window.EyeDropper) {
          ov.style.visibility = "hidden";
          try {
            new EyeDropper().open()
              .then(function (res) { ov.style.visibility = ""; _applyPicked(res.sRGBHex); })
              .catch(function () { ov.style.visibility = ""; });
            return;
          } catch (er) { ov.style.visibility = ""; }
        }
        var root = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
        _applyPicked(root || getComputedStyle(document.body).backgroundColor);
      }
    });
    eyeBtn.addEventListener("mouseenter", function () { eyeBtn.style.borderColor = "var(--accent)"; eyeBtn.style.color = "var(--accent)"; });
    eyeBtn.addEventListener("mouseleave", function () { eyeBtn.style.borderColor = "var(--line)"; eyeBtn.style.color = "var(--text)"; });

    var swatches = h("div", { style: "display:flex;flex-wrap:wrap;gap:8px" }, presets.map(function (col) {
      return h("button", { type: "button", title: col, style: "width:32px;height:32px;border-radius:9px;border:1px solid var(--line);cursor:pointer;background:" + col,
        onclick: function () { var rgb = _hexToRgb(col); if (rgb) { hsv = _rgbToHsv(rgb[0], rgb[1], rgb[2]); } commit(); } });
    }));
    var where = openCaseKey ? "case study" : CFG.noun;
    var m = h("div", { class: "ak-modal", style: "width:min(460px,100%)" }, [
      h("h3", {}, ["Background color"]),
      h("div", { class: "sub" }, ["Set the content background of this " + where + " so uploaded files blend in. The cover area and footer keep the theme color. Updates live as you pick."]),
      h("div", { class: "ak-field" }, [h("label", {}, ["Pick a color"]), svArea, hueBar, h("div", { style: "display:flex;gap:10px;align-items:center;margin-top:12px" }, [preview, eyeBtn, hexInput])]),
      h("div", { class: "ak-field" }, [h("label", {}, ["Presets"]), swatches]),
      h("div", { class: "ak-acts" }, [
        h("button", { class: "ak-btn ghost", onclick: function () { c.obj.bg = ""; applyLive(""); save().then(c.rerender); close(); } }, ["Reset to theme"]),
        h("button", { class: "ak-btn", onclick: function () { c.obj.bg = hexInput.value.trim(); save().then(c.rerender); close(); } }, ["Save"])
      ])
    ]);
    ov.appendChild(m);
    ov.addEventListener("click", function (e) { if (e.target === ov) { revert(); close(); } });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(ov);
  }
  /* ---- project-home background: big text watermark and/or looping video behind the hero ---- */
  function editHomeBg() {
    var c = currentCtx(); if (!c || !openItemId) return;
    var it = c.obj, hb = it.homeBg || {};
    /* drag-to-position preview: mirrors the hero's translate(x%,y%) scale() transform */
    var pos = { x: hb.x || 0, y: hb.y || 0, scale: hb.scale != null ? hb.scale : 100 };
    var pvMedia = null;
    var pvBox = h("div", { style: "position:relative;height:120px;border-radius:10px;overflow:hidden;background:var(--bg);border:1px dashed var(--line);cursor:grab;touch-action:none" });
    var pvHint = h("div", { style: "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.78rem;color:var(--muted);pointer-events:none;text-align:center;padding:0 14px" }, ["Add an image or video, then drag here to position it"]);
    pvBox.appendChild(pvHint);
    function pvTransform() { if (pvMedia) pvMedia.style.transform = "translate(" + pos.x + "%," + pos.y + "%) scale(" + pos.scale / 100 + ")"; }
    function pvSet(src, isVideo) {
      if (pvMedia) { pvMedia.remove(); pvMedia = null; }
      if (!src) { pvHint.style.display = "flex"; return; }
      pvHint.style.display = "none";
      pvMedia = h(isVideo ? "video" : "img", { style: "position:absolute;inset:0;width:100%;height:100%;object-fit:contain;pointer-events:none;opacity:.85", src: src.slice(0, 5) === "data:" ? dataURLtoBlobURL(src) : src });
      if (isVideo) { pvMedia.muted = true; pvMedia.loop = true; pvMedia.autoplay = true; pvMedia.playsInline = true; try { var p = pvMedia.play(); if (p && p.catch) p.catch(function () {}); } catch (e) {} }
      pvBox.insertBefore(pvMedia, pvHint); pvTransform();
    }
    var drag = null;
    pvBox.addEventListener("pointerdown", function (e) {
      if (!pvMedia) return;
      drag = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y };
      pvBox.setPointerCapture(e.pointerId); pvBox.style.cursor = "grabbing"; e.preventDefault();
    });
    pvBox.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var r = pvBox.getBoundingClientRect();
      pos.x = Math.max(-100, Math.min(100, Math.round(drag.x + (e.clientX - drag.sx) / r.width * 100)));
      pos.y = Math.max(-100, Math.min(100, Math.round(drag.y + (e.clientY - drag.sy) / r.height * 100)));
      pvTransform();
    });
    function endDrag() { drag = null; pvBox.style.cursor = "grab"; }
    pvBox.addEventListener("pointerup", endDrag); pvBox.addEventListener("pointercancel", endDrag);
    var resetBtn = h("button", { type: "button", class: "ak-btn ghost", style: "position:absolute;right:6px;bottom:6px;padding:3px 10px;font-size:.68rem", onclick: function () { pos.x = 0; pos.y = 0; pvTransform(); } }, ["Reset"]);
    pvBox.appendChild(resetBtn);
    setTimeout(function () { if (hb.video) pvSet(hb.video, true); else if (hb.image) pvSet(hb.image, false); }, 0);
    modal({
      compact: true,
      title: "Home background",
      sub: "Text watermark, image or looping video behind the title — video layers on top of image. Clear all to reset.",
      fields: [
        { key: "text", label: "Watermark text", value: hb.text || "", placeholder: "e.g. FINTRACK — short words work best" },
        { key: "image", label: "Image", type: "file", accept: "image/*", removable: true, value: hb.image || "", placeholder: "Choose image (PNG / JPG / WEBP)", onChange: function (d) { pvSet(d, false); } },
        { key: "video", label: "Video · muted loop", type: "file", accept: "video/*", removable: true, value: hb.video || "", placeholder: "Choose video (MP4 / WEBM)", onChange: function (d) { pvSet(d, true); } },
        { key: "pos", label: "Position · drag to move", type: "custom", el: pvBox, get: function () { return { x: pos.x, y: pos.y }; } },
        { key: "opacity", label: "Opacity · default 22%", type: "range", min: 0, max: 100, step: 1, unit: "%", value: hb.opacity != null ? hb.opacity : 22 },
        { key: "scale", label: "Zoom · 100% = fill", type: "range", min: 50, max: 300, step: 5, unit: "%", value: hb.scale != null ? hb.scale : 100, onInput: function (v) { pos.scale = parseInt(v, 10) || 100; pvTransform(); } }
      ],
      submitLabel: "Save"
    }).then(function (v) {
      if (!v) return;
      if (!v.text && !v.video && !v.image) delete it.homeBg;
      else {
        var op = parseInt(v.opacity, 10), sc = parseInt(v.scale, 10);
        it.homeBg = { text: v.text || "", image: v.image || "", video: v.video || "", opacity: isNaN(op) ? 22 : op, scale: isNaN(sc) ? 100 : sc, x: (v.pos && v.pos.x) || 0, y: (v.pos && v.pos.y) || 0 };
      }
      save().then(c.rerender);
    });
  }
  function editBlock(item, b, type, rerender) {
    if (!item) return;
    rerender = rerender || renderDetail;
    type = b ? b.type : type;
    if (type === "canvas") { openStudio(item, b, rerender); return; }
    var creating = !b;
    var radField = { key: "radius", label: "Corner radius", type: "range", min: 0, max: 60, step: 1, unit: "px", preview: "radius", value: b && b.radius != null ? b.radius : 15, hint: "Roundness of the corners — 0 is square, 15 is the default." };
    var shField = { key: "shadow", label: "Drop shadow", type: "range", min: 0, max: 100, step: 5, unit: "%", preview: "shadow", value: b && b.shadow != null ? b.shadow : 0, hint: "Soft shadow that lifts the block off the page — 0% is flat, higher is deeper." };
    var isSection = !!(b && b.section);
    var fields, title;
    if (type === "image") {
      title = "image"; fields = [
        { key: "src", label: "Image file", type: "file", accept: "image/*", multiple: creating, value: b ? b.src : "", hint: "PNG, JPG, GIF or WEBP. You can select multiple files to add several images at once." },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" },
        radField, shField
      ];
    } else if (type === "pdf") {
      title = "PDF"; fields = [
        { key: "src", label: "PDF file", type: "file", accept: "application/pdf", multiple: creating, value: b ? b.src : "", hint: "Displayed in an embedded viewer. You can select multiple PDFs at once." },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" },
        radField, shField
      ];
    } else if (type === "prototype") {
      title = "prototype"; fields = [
        { key: "raw", label: "Figma link or <iframe> embed code", type: "textarea", value: b ? b.raw : "", placeholder: "https://www.figma.com/proto/…  or  full <iframe …> code", hint: "Paste a Figma prototype share link, or any iframe embed code. To add several, put each link on its own line." },
        { key: "caption", label: "Title shown above the prototype (optional)", value: b ? b.caption : "", placeholder: "e.g. Try the FinTrack prototype", hint: "Shown as the heading on top of the prototype, on a black stage." },
        radField, shField
      ];
    } else if (type === "media") {
      title = "video / audio"; fields = [
        { key: "src", label: "Video or audio file", type: "file", accept: "video/*,audio/*", multiple: creating, value: b ? b.src : "", hint: "MP4, WEBM, MOV, MP3, WAV… You can select multiple files at once." },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" },
        radField, shField
      ];
    } else if (type === "model") {
      title = "3D model"; fields = [
        { key: "src", label: "3D model file", type: "file", accept: ".glb,.gltf,.obj,.fbx,model/gltf-binary,model/gltf+json", multiple: creating, value: b ? b.src : "", hint: "GLB / GLTF render fully interactive. OBJ / FBX are supported too (GLB recommended for best results). You can select multiple files at once." },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" },
        radField, shField
      ];
    } else if (type === "text") {
      var tdp = textDesignPanel(b);
      title = "text"; fields = [
        { key: "tstyle", label: "", type: "custom", el: tdp.el, get: tdp.get, hint: "Text · Fill & Stroke · Shapes — switch tabs to style the box and add shapes, lines & color like a design tool." }
      ];
    }
    modal({
      title: (creating ? "Add " : "Edit ") + title, fields: fields, submitLabel: creating ? "Add" : "Save", compact: true,
      validate: function (v) {
        if ((type === "image" || type === "pdf" || type === "media" || type === "model") && !v.src && creating) return "Please choose a file.";
        if (type === "prototype" && !v.raw && creating) return "Please paste a link or embed code.";
        if (type === "text" && v.tstyle && !v.tstyle.body && !v.tstyle.heading && !v.tstyle.heading2) return "Add a heading or some text.";
      }
    }).then(function (v) {
      if (!v) return;
      var radVal = v.radius != null && v.radius !== "" ? parseInt(v.radius, 10) : NaN;
      var shVal = v.shadow != null && v.shadow !== "" ? parseInt(v.shadow, 10) : NaN;
      if (isNaN(shVal) && v.tstyle && v.tstyle.shadow != null && v.tstyle.shadow !== "") shVal = parseInt(v.tstyle.shadow, 10);
      if (isNaN(radVal) && v.tstyle && v.tstyle.radius != null && v.tstyle.radius !== "") radVal = parseInt(v.tstyle.radius, 10);
      var multiFiles = v.src_files || [];
      if (creating && (type === "image" || type === "pdf" || type === "media" || type === "model") && multiFiles.length > 1) {
        multiFiles.forEach(function (fobj) {
          var nb = { id: uid(), type: type, src: fobj.data, caption: v.caption };
          if (v.size && v.size !== "full") nb.size = v.size;
          if (!isNaN(radVal)) nb.radius = radVal;
          if (shVal > 0) nb.shadow = shVal;
          if (type === "media") nb.mime = (fobj.data.match(/^data:(.*?);/) || [])[1] || "";
          if (type === "model") nb.format = modelFormat(fobj.name);
          item.blocks.push(nb);
        });
        save().then(rerender);
        return;
      }
      if (creating && type === "prototype") {
        var protoLines = (v.raw || "").split(/\r?\n/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (protoLines.length > 1) {
          protoLines.forEach(function (line) {
            var pb = { id: uid(), type: "prototype", raw: line, src: protoSrc(line), caption: v.caption };
            if (v.size && v.size !== "full") pb.size = v.size;
            if (!isNaN(radVal)) pb.radius = radVal;
            if (shVal > 0) pb.shadow = shVal;
            item.blocks.push(pb);
          });
          save().then(rerender);
          return;
        }
      }
      var block = b || { id: uid(), type: type };
      if (type === "image") { if (v.src) block.src = v.src; block.caption = v.caption; }
      else if (type === "pdf") { if (v.src) block.src = v.src; block.caption = v.caption; }
      else if (type === "prototype") { if (v.raw) { block.raw = v.raw; block.src = protoSrc(v.raw); } block.caption = v.caption; }
      else if (type === "media") { if (v.src) { block.src = v.src; block.mime = (v.src.match(/^data:(.*?);/) || [])[1] || ""; } block.caption = v.caption; }
      else if (type === "model") { if (v.src) { block.src = v.src; block.format = modelFormat(v.src_name || v.src); } block.caption = v.caption; }
      else if (type === "text") {
        block.heading = v.tstyle.heading; block.heading2 = v.tstyle.heading2; block.body = v.tstyle.body;
        var ct = cleanTstyle(v.tstyle); if (ct) block.tstyle = ct; else delete block.tstyle;
        if (v.tstyle.fill) block.fill = v.tstyle.fill; else delete block.fill;
        if (v.tstyle.strokeColor && v.tstyle.strokeWidth) { block.strokeColor = v.tstyle.strokeColor; block.strokeWidth = parseFloat(v.tstyle.strokeWidth); } else { delete block.strokeColor; delete block.strokeWidth; }
        if (v.tstyle.boxShadow) block.boxShadow = parseInt(v.tstyle.boxShadow, 10); else delete block.boxShadow;
        if (v.tstyle.deco && v.tstyle.deco.els && v.tstyle.deco.els.length) block.deco = v.tstyle.deco; else delete block.deco;
      }
      if (!isNaN(radVal)) block.radius = radVal;
      if (!isNaN(shVal)) { if (shVal > 0) block.shadow = shVal; else delete block.shadow; }
      if (v.size !== undefined) { if (v.size && v.size !== "full") block.size = v.size; else delete block.size; }
      if (creating) item.blocks.push(block);
      var frameNew = creating && type === "image" && !!block.src && multiFiles.length <= 1;
      save().then(function () {
        rerender();
        if (frameNew) autoFrameBlock(block.id, block, rerender);
      });
    });
  }
  // After a single image is added, scroll it into view and drop straight into
  // move/scale so it can be framed before the user moves on.
  function autoFrameBlock(bid, bdata, rerender) {
    if (!bid) return;
    requestAnimationFrame(function () {
      var el = document.querySelector('.ak-block.admin[data-bid="' + bid + '"]');
      if (!el) return;
      var r = el.getBoundingClientRect();
      var y = (window.pageYOffset || document.documentElement.scrollTop || 0) + r.top - Math.max(20, (window.innerHeight - r.height) / 2);
      window.scrollTo(0, Math.max(0, y));
      enterAdjust(el, bdata, rerender);
    });
  }
  function protoSrc(raw) {
    raw = raw.trim();
    var src = raw;
    var m = raw.match(/src="([^"]+)"/i); if (m) src = m[1];
    // unwrap legacy www.figma.com/embed?url=<encoded> wrapper
    try {
      var pu = new URL(src);
      if (/figma\.com$/i.test(pu.hostname.replace(/^www\./, "")) && /\/embed\/?$/i.test(pu.pathname) && pu.searchParams.get("url")) {
        src = pu.searchParams.get("url");
      }
    } catch (e) {}
    return figmaEmbed(src) || src;
  }
  // Rewrite a Figma share link to the embed.figma.com host so public prototypes
  // render directly without the "log in to Figma" interstitial.
  function figmaEmbed(url) {
    try {
      var u = new URL(String(url).trim());
      var host = u.hostname.replace(/^www\./, "");
      if (host !== "figma.com" && host !== "embed.figma.com") return null;
      u.protocol = "https:";
      u.hostname = "embed.figma.com";
      if (!u.searchParams.has("embed-host")) u.searchParams.set("embed-host", "share");
      return u.toString();
    } catch (e) { return null; }
  }
  function modelFormat(s) { var m = (s || "").toLowerCase().match(/\.(glb|gltf|obj|fbx)(\?|$|;)/); return m ? m[1] : "glb"; }

  /* ============================================================ 3D viewers */
  var loaded = {};
  function loadScript(src, type) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; if (type) s.type = type;
      s.onload = function () { res(); }; s.onerror = function () { rej(new Error("load " + src)); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  function fallback3D(holder, msg, dataURL, name) {
    holder.innerHTML = "";
    holder.appendChild(h("div", { class: "fallback" }, [
      h("div", { html: I.cube, style: "width:34px;height:34px;color:var(--accent)" }),
      h("p", { style: "margin:0;max-width:340px" }, [msg]),
      h("a", { class: "ak-btn ghost", href: dataURLtoBlobURL(dataURL), download: name || "model", html: I.dl + "<span>Download model</span>" })
    ]));
  }
  function mount3D(holder, b) {
    var fmt = b.format || modelFormat(b.src);
    var url = dataURLtoBlobURL(b.src);
    if (fmt === "glb" || fmt === "gltf") {
      loadScript("https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js", "module").then(function () {
        holder.innerHTML = "";
        var mv = document.createElement("model-viewer");
        mv.setAttribute("src", url); mv.setAttribute("camera-controls", ""); mv.setAttribute("auto-rotate", "");
        mv.setAttribute("shadow-intensity", "1"); mv.setAttribute("exposure", "1.1"); mv.setAttribute("ar", "");
        mv.setAttribute("environment-image", "neutral");
        mv.setAttribute("tone-mapping", "neutral");
        mv.style.cssText = "width:100%;height:100%;--poster-color:transparent";
        mv.addEventListener("error", function () { holder.innerHTML = ""; holder.appendChild(mediaMissing(I.cube, "3D model unavailable", "")); });
        holder.appendChild(mv);
      }).catch(function () { fallback3D(holder, "Couldn't load the 3D viewer.", b.src, "model." + fmt); });
    } else {
      mountThree(holder, url, fmt, b);
    }
  }
  function mountThree(holder, url, fmt, b) {
    var R = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
    loadScript(R).then(function () {
      var deps = ["https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"];
      if (fmt === "obj") deps.push("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/OBJLoader.js");
      if (fmt === "fbx") { deps.push("https://cdn.jsdelivr.net/npm/fflate@0.7.4/umd/index.js"); deps.push("https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/FBXLoader.js"); }
      return deps.reduce(function (p, s) { return p.then(function () { return loadScript(s); }); }, Promise.resolve());
    }).then(function () {
      try { initThreeScene(holder, url, fmt); }
      catch (e) { fallback3D(holder, "This model couldn't be rendered in the browser.", b.src, "model." + fmt); }
    }).catch(function () { fallback3D(holder, "This model couldn't be rendered in the browser. GLB is the most reliable web format.", b.src, "model." + fmt); });
  }
  function initThreeScene(holder, url, fmt) {
    var THREE = window.THREE;
    holder.innerHTML = "";
    var w = holder.clientWidth || 600, ht = holder.clientHeight || 400;
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(45, w / ht, 0.1, 5000);
    camera.position.set(0, 1.2, 4);
    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, ht); renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    holder.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444466, 1.1));
    var dir = new THREE.DirectionalLight(0xffffff, 1.1); dir.position.set(3, 6, 4); scene.add(dir);
    var controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.1;
    function frame(obj) {
      var box = new THREE.Box3().setFromObject(obj); var size = box.getSize(new THREE.Vector3()); var center = box.getCenter(new THREE.Vector3());
      var maxd = Math.max(size.x, size.y, size.z) || 1; obj.position.sub(center);
      var dist = maxd / (2 * Math.tan(Math.PI * camera.fov / 360)) * 1.6;
      camera.position.set(0, maxd * 0.25, dist); camera.near = dist / 100; camera.far = dist * 100; camera.updateProjectionMatrix();
      controls.target.set(0, 0, 0); controls.update(); scene.add(obj);
    }
    if (fmt === "obj") new THREE.OBJLoader().load(url, frame, null, function () { throw new Error("obj"); });
    else if (fmt === "fbx") new THREE.FBXLoader().load(url, function (o) { o.scale.setScalar(0.01); frame(o); }, null, function () { throw new Error("fbx"); });
    var ro = new ResizeObserver(function () { var nw = holder.clientWidth, nh = holder.clientHeight; if (nw && nh) { camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh); } });
    ro.observe(holder);
    (function loop() { if (!holder.isConnected) { ro.disconnect(); renderer.dispose && renderer.dispose(); return; } controls.update(); renderer.render(scene, camera); requestAnimationFrame(loop); })();
  }

  /* ============================================================ EXPORT / IMPORT */
  /* ---- dependency-free ZIP writer (STORE method, no compression) ---- */
  var _crcTable = (function () {
    var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t;
  })();
  function crc32(buf) { var c = 0xFFFFFFFF; for (var i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) {
    var enc = new TextEncoder();
    function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.bytes, crc = crc32(data);
      var lh = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)));
      parts.push(lh, name, data);
      var ch = new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)));
      central.push(ch, name);
      offset += lh.length + name.length + data.length;
    });
    var cs = 0; central.forEach(function (c) { cs += c.length; });
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cs), u32(offset), u16(0)));
    return new Blob(parts.concat(central, [end]), { type: "application/zip" });
  }
  /* ---- one-click image optimiser ------------------------------------------------
     Re-encodes anything already live in media/ that is wider or taller than
     IMG_MAX_EDGE, in this browser, and hands the fixed files back as a small ZIP to
     drop into media/. An oversized export (5000–8000px) is the single biggest cause
     of a slow case study: the phone spends longer DECODING the picture than
     downloading it, and the biggest ones fail outright on iOS. New uploads are capped
     automatically (see readFileAsDataURL) — this is for files published before that. */
  function _mediaImagePaths(o) {
    var out = {};
    (function walk(v) {
      if (!v) return;
      if (typeof v === "string") { if (/^media\/.+\.(webp|jpe?g|png)$/i.test(v)) out[v] = 1; return; }
      if (typeof v !== "object") return;
      if (Array.isArray(v)) { v.forEach(walk); return; }
      Object.keys(v).forEach(function (k) { walk(v[k]); });
    })(o);
    return Object.keys(out);
  }
  /* Decoding and re-encoding both differ per browser (Safari has ignored createImageBitmap's
     resize options, iPad throws on very large decodes, older engines refuse image/webp from
     toBlob). Every step below therefore has a fallback, and anything that still fails comes
     back with a reason so the owner sees which file to handle by hand instead of a silent
     "nothing needed changing". */
  function _optDecodeImg(blob) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(blob), im = new Image();
      im.onload = function () {
        if (!im.naturalWidth) { URL.revokeObjectURL(u); return rej(new Error("empty")); }
        res({ w: im.naturalWidth, h: im.naturalHeight, src: im, release: function () { URL.revokeObjectURL(u); } });
      };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error("decode")); };
      im.src = u;
    });
  }
  function _optDecode(blob) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(blob).then(function (bm) {
        return { w: bm.width, h: bm.height, src: bm, release: function () { if (bm.close) bm.close(); } };
      }, function () { return _optDecodeImg(blob); });
    }
    return _optDecodeImg(blob);
  }
  /* halve repeatedly before the final draw — one big downscale in a single drawImage is what
     makes re-saved photos look soft */
  function _optScaleTo(dec, w, h) {
    var src = dec.src, curW = dec.w, curH = dec.h, guard = 0;
    while (curW > w * 2 && guard++ < 8) {
      var t = document.createElement("canvas");
      t.width = Math.max(w, Math.round(curW / 2)); t.height = Math.max(h, Math.round(curH / 2));
      var tx = t.getContext("2d");
      tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = "high";
      tx.drawImage(src, 0, 0, t.width, t.height);
      src = t; curW = t.width; curH = t.height;
    }
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    var cx = cv.getContext("2d");
    if (!cx) throw new Error("no canvas");
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
    cx.drawImage(src, 0, 0, w, h);
    return cv;
  }
  /* keep transparency where the original had it; otherwise prefer the format already on disk */
  function _optTargets(p) {
    /* WebP first everywhere — the site ships WebP only; the others exist purely as a fallback
       for a browser that refuses to write it */
    if (/\.png$/i.test(p)) return [["image/webp", 0.92], ["image/png", undefined], ["image/jpeg", 0.88]];
    return [["image/webp", 0.92], ["image/jpeg", 0.88]];
  }
  function _optToBlob(cv, type, q) {
    return new Promise(function (res) {
      var done = false, t = setTimeout(function () { if (!done) { done = true; res(null); } }, 20000);
      function give(b) { if (done) return; done = true; clearTimeout(t); res(b); }
      try {
        if (cv.toBlob) return cv.toBlob(give, type, q);
        var d = cv.toDataURL(type, q), bin = atob(d.split(",")[1]), u8 = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        give(new Blob([u8], { type: (d.slice(5).split(";")[0] || type) }));
      } catch (e) { give(null); }
    });
  }
  function _optEncode(cv, list, origSize) {
    var best = null, i = 0;
    function step() {
      if (i >= list.length) return Promise.resolve(best);
      var t = list[i++];
      return _optToBlob(cv, t[0], t[1]).then(function (b) {
        if (b && b.size && (!best || b.size < best.size)) best = b;
        if (best && best.size < origSize) return best;
        return step();
      });
    }
    return step();
  }
  function _optImage(url) {
    return fetch(url, { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("not on the server (" + r.status + ")"); return r.blob(); })
      .then(function (blob) {
        if (!blob || !blob.size) throw new Error("empty file");
        var t = blob.type || "";
        if (t === "image/gif" || t.indexOf("svg") > -1 || (t && t.indexOf("image/") !== 0)) return { skip: "not a resizable image" };
        return _optDecode(blob).then(function (dec) {
          var long = Math.max(dec.w, dec.h), from = dec.w + "\u00d7" + dec.h;
          if (long <= IMG_OVER_EDGE) { dec.release(); return { skip: "already " + from }; }
          var w = Math.max(1, Math.round(dec.w * IMG_MAX_EDGE / long)),
              hh = Math.max(1, Math.round(dec.h * IMG_MAX_EDGE / long)), cv;
          try { cv = _optScaleTo(dec, w, hh); }
          catch (e) { dec.release(); return { fail: "too big for this browser to redraw — try a desktop browser" }; }
          dec.release();
          return _optEncode(cv, _optTargets(url), blob.size).then(function (out) {
            cv.width = cv.height = 1;   /* release the backing store on iOS */
            if (!out || !out.size) return { fail: "this browser could not re-save it" };
            /* a smaller file is the goal, but halving the pixels already cuts decode time —
               accept a near-identical size, reject only a genuinely worse one */
            if (out.size > blob.size * 1.15) return { skip: "already efficient at " + from };
            return out.arrayBuffer().then(function (ab) {
              return { bytes: new Uint8Array(ab), was: blob.size, now: out.size, from: from, to: w + "\u00d7" + hh };
            });
          });
        }, function () { return { fail: "could not open this file — it may be damaged" }; });
      })
      .catch(function (e) { return { fail: (e && e.message) || "could not be read" }; });
  }
  var _optMeas = {}, _optLastIx = null;
  var _OPT_LABEL = { "ui-ux": "UI / UX", "gen-ai": "Gen AI", "3d": "3D" };
  function _optMeasure(url) {
    if (_optMeas[url]) return Promise.resolve(_optMeas[url]);
    return fetch(url).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
      if (!b || b.type.indexOf("image/") !== 0 || b.type === "image/gif" || b.type.indexOf("svg") > -1) return (_optMeas[url] = { skip: true });
      return createImageBitmap(b).then(function (bm) {
        var m = { w: bm.width, h: bm.height, size: b.size, fmt: b.type };
        m.over = Math.max(m.w, m.h) > IMG_OVER_EDGE;
        m.notWebp = b.type !== "image/webp";
        if (bm.close) bm.close();
        return (_optMeas[url] = m);
      });
    }).catch(function () { return (_optMeas[url] = { skip: true }); });
  }
  /* measures every path once, four at a time, so a 130-file check stays quick */
  function _optScan(paths, onEach) {
    var i = 0, live = 0;
    return new Promise(function (done) {
      function next() {
        if (i >= paths.length && !live) return done();
        while (live < 4 && i < paths.length) {
          live++;
          _optMeasure(paths[i++]).then(function () { live--; if (onEach) onEach(); next(); });
        }
      }
      next();
    });
  }
  /* the scopes the owner can act on: everything · a category · one project · the home page */
  function _optGroups(pub) {
    var gs = [], all = {};
    ["ui-ux", "gen-ai", "3d"].forEach(function (k) {
      var page = pub && pub[k]; if (!page) return;
      var pagePaths = _mediaImagePaths(page); if (!pagePaths.length) return;
      pagePaths.forEach(function (p) { all[p] = 1; });
      gs.push({ key: "page:" + k, label: (_OPT_LABEL[k] || k), kind: "page", paths: pagePaths });
      (page.items || []).forEach(function (it) {
        var ip = _mediaImagePaths(it);
        if (ip.length) gs.push({ key: "item:" + it.id, label: it.title || "Untitled", kind: "item", paths: ip });
      });
    });
    if (pub && pub.home) {
      var hp = _mediaImagePaths(pub.home);
      if (hp.length) { hp.forEach(function (p) { all[p] = 1; }); gs.push({ key: "home", label: "Home page", kind: "page", paths: hp }); }
    }
    return { all: Object.keys(all), groups: gs };
  }
  function _optStat(paths) {
    var s = { total: paths.length, known: 0, over: 0, zipped: 0, bytes: 0, notWebp: 0, other: [] };
    paths.forEach(function (p) {
      var m = _optMeas[p]; if (!m) return;
      s.known++;
      if (m.notWebp && !m.skip) { s.notWebp++; if (s.other.length < 8) s.other.push(p + " \u00b7 " + fmtName(m.fmt)); }
      if (m.zipped) s.zipped++;
      else if (m.over) { s.over++; s.bytes += m.size; }
    });
    return s;
  }
  function _optSizeLabel(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.round(b / 1024) + " KB"; }
  function optimiseMedia() {
    var ov = h("div", { class: "ak-ov" });
    var status = h("div", { class: "sub" }, ["Reading what's published\u2026"]);
    var rowsWrap = h("div", {});
    var steps = h("div", {});
    ov.appendChild(h("div", { class: "ak-modal", style: "width:min(580px,100%)" }, [
      h("h3", {}, ["Optimise images"]),
      status, rowsWrap, steps,
      h("div", { class: "ak-hint", style: "margin-top:10px" }, ["Anything wider or taller than " + IMG_MAX_EDGE + "px is re-saved at " + IMG_MAX_EDGE + "px \u2014 same visible quality, a fraction of the weight. Files you upload from now on are capped automatically."]),
      h("div", { class: "ak-acts" }, [h("button", { class: "ak-btn ghost", onclick: function () { ov.remove(); } }, ["Close"])])
    ]));
    ov.addEventListener("click", function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);

    fetch("portfolio-data.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      .then(function (pub) {
        var ix = _optGroups(pub || {}); _optLastIx = ix;
        if (!ix.all.length) { status.textContent = "Nothing published to check yet."; return; }
        var rowFor = {};
        function mkRow(g) {
          var val = h("span", { class: "v" }, ["\u2026"]);
          var btn = h("button", { class: "ak-btn ghost", style: "display:none;padding:4px 10px;font-size:.7rem;flex:0 0 auto", onclick: function () { run(g); } }, ["Optimise"]);
          rowFor[g.key] = { val: val, btn: btn, g: g };
          return h("div", { class: "ak-xrow" }, [
            h("span", { class: "k", style: g.kind === "item" ? "padding-left:16px;opacity:.86" : (g.kind === "all" ? "font-weight:600" : "") }, [g.label]),
            h("span", { style: "display:flex;align-items:center;gap:9px;justify-content:flex-end" }, [val, btn])
          ]);
        }
        var allG = { key: "all", label: "Everything", kind: "all", paths: ix.all };
        rowsWrap.appendChild(h("div", { class: "ak-xsec" }, ["What to optimise"]));
        rowsWrap.appendChild(h("div", { class: "ak-xrows" }, [mkRow(allG)].concat(ix.groups.map(mkRow))));
        function paint() {
          Object.keys(rowFor).forEach(function (k) {
            var e = rowFor[k], s = _optStat(e.g.paths);
            if (s.known < s.total) { e.val.textContent = s.known + " / " + s.total + " checked"; return; }
            var fmtTail = s.notWebp ? " \u00b7 " + s.notWebp + " not WebP" : "";
            if (s.over) { e.val.textContent = s.over + " of " + s.total + " oversized \u00b7 " + _optSizeLabel(s.bytes) + fmtTail; e.btn.style.display = ""; return; }
            e.btn.style.display = "none";
            e.val.textContent = (s.zipped ? (s.zipped + " fixed \u2014 in your ZIP \u2713") : (s.total + " image" + (s.total === 1 ? "" : "s") + " \u00b7 all good \u2713")) + fmtTail;
          });
        }
        paint();
        var n = 0;
        _optScan(ix.all, function () {
          n++; status.textContent = "Checking " + n + " of " + ix.all.length + "\u2026";
          if (n % 3 === 0) paint();
        }).then(function () {
          paint();
          var s = _optStat(ix.all);
          status.textContent = s.over
            ? (s.over + " of " + s.total + " images are oversized \u2014 pick a scope below.")
            : ("All " + s.total + " images are already the right size \u2014 nothing to do.");
          if (s.notWebp) {
            var box = h("div", { style: "margin-top:12px" }, [
              h("div", { class: "ak-xsec" }, [s.notWebp + " published image" + (s.notWebp === 1 ? " is" : "s are") + " not WebP"])
            ]);
            box.appendChild(h("div", { class: "ak-xrows" }, s.other.map(function (t) {
              var bits = t.split(" \u00b7 ");
              return h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, [bits[0]]), h("span", { class: "v", style: "color:var(--accent)" }, [bits[1]])]);
            })));
            box.appendChild(h("div", { class: "ak-hint", style: "margin-top:8px" }, [
              "This site is WebP-only. Re-upload " + (s.notWebp === 1 ? "this one" : "these") + " through the editor \u2014 anything you drop in is converted to WebP automatically \u2014 then publish."
            ]));
            rowsWrap.appendChild(box);
          }
        });
        function run(g) {
          var queue = g.paths.filter(function (p) { var m = _optMeas[p]; return m && m.over && !m.zipped; });
          if (!queue.length) { status.textContent = "Nothing left to optimise in " + g.label + "."; return; }
          var count = queue.length, done = 0, fixed = [], saved = 0, failed = [];
          steps.innerHTML = "";
          var detail = h("div", { class: "ak-xrows" });
          steps.appendChild(h("div", { class: "ak-xsec" }, [g.label]));
          steps.appendChild(detail);
          (function nextOne() {
            if (!document.body.contains(ov)) return;
            if (!queue.length) return finish();
            var p = queue.shift();
            status.textContent = "Optimising " + (done + 1) + " of " + count + "\u2026";
            _optImage(p).then(function (r) {
              done++;
              r = r || { fail: "could not be read" };
              if (r.bytes) {
                fixed.push({ name: p, bytes: r.bytes }); saved += (r.was - r.now);
                var m = _optMeas[p]; if (m) { m.zipped = true; m.size = r.now; }
                detail.appendChild(h("div", { class: "ak-xrow" }, [
                  h("span", { class: "k" }, [p.split("/").pop()]),
                  h("span", { class: "v" }, [r.from + " \u2192 " + r.to + " \u00b7 " + Math.round(r.was / 1024) + " \u2192 " + Math.round(r.now / 1024) + " KB"])
                ]));
              } else {
                var why = r.fail || r.skip;
                if (r.skip) { var mm = _optMeas[p]; if (mm) mm.over = false; }
                else failed.push(p);
                detail.appendChild(h("div", { class: "ak-xrow" }, [
                  h("span", { class: "k" }, [p.split("/").pop()]),
                  h("span", { class: "v", style: r.fail ? "color:var(--accent)" : "" }, [(r.fail ? "\u26A0 " : "") + why])
                ]));
              }
              paint(); nextOne();
            });
          })();
          function failNote() {
            steps.appendChild(h("div", { class: "ak-hint", style: "margin-top:8px" }, [
              failed.length + " file" + (failed.length === 1 ? " was" : "s were") + " skipped above. Re-run this on a desktop Chrome or Edge window \u2014 it handles the very large ones \u2014 or resize " + (failed.length === 1 ? "it" : "them") + " to " + IMG_MAX_EDGE + "px in Preview/Photos and re-upload."
            ]));
          }
          function finish() {
            if (!fixed.length) {
              status.textContent = failed.length
                ? (failed.length + " image" + (failed.length === 1 ? "" : "s") + " could not be re-saved here \u2014 see below.")
                : ("Nothing needed changing in " + g.label + ".");
              if (failed.length) failNote();
              return;
            }
            var zip = makeZip(fixed.map(function (f) { return { name: "Ajaykatta_Website/GitRepo/" + f.name, bytes: f.bytes }; }));
            var a2 = h("a", { href: URL.createObjectURL(zip), download: "optimised-images.zip" });
            document.body.appendChild(a2); a2.click(); a2.remove();
            status.textContent = fixed.length + " image" + (fixed.length === 1 ? "" : "s") + " shrunk \u00b7 " + _optSizeLabel(saved) + " lighter \u00b7 optimised-images.zip downloaded";
            steps.appendChild(h("div", { class: "ak-xsec" }, ["To publish"]));
            steps.appendChild(h("ol", { class: "ak-xsteps" }, [
              h("li", {}, ["Unzip optimised-images.zip."]),
              h("li", {}, ["From Ajaykatta_Website / GitRepo, copy the media folder into your repo \u2014 replace the old files."]),
              h("li", {}, ["Push to GitHub. Vercel redeploys automatically."])
            ]));
            if (failed.length) failNote();
          }
        }
      });
  }
  /* the size check shown in the Export / Publish pre-flight, so nothing oversized ships by accident */
  function optCheckRow() {
    var val = h("span", { class: "v" }, []);
    var row = h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["Image sizes"]), val]);
    function txt(t) { val.innerHTML = ""; val.appendChild(document.createTextNode(t)); }
    function render() {
      if (!_optLastIx) {
        val.innerHTML = "";
        val.appendChild(h("button", { class: "ak-btn ghost", style: "padding:4px 10px;font-size:.7rem", onclick: check }, ["Check now"]));
        return;
      }
      var s = _optStat(_optLastIx.all);
      if (s.known < s.total) return txt("checking " + s.known + " / " + s.total + "\u2026");
      if (s.over) {
        val.innerHTML = "";
        val.appendChild(h("strong", { style: "color:var(--accent)" }, ["\u26A0 " + s.over + " oversized" + (s.notWebp ? " \u00b7 " + s.notWebp + " not WebP" : "")]));
        val.appendChild(h("button", { class: "ak-btn ghost", style: "padding:4px 10px;font-size:.7rem;margin-left:8px", onclick: function () { optimiseMedia(); } }, ["Optimise"]));
        return;
      }
      if (s.notWebp) {
        val.innerHTML = "";
        val.appendChild(h("strong", { style: "color:var(--accent)" }, ["\u26A0 " + s.notWebp + " not WebP"]));
        val.appendChild(h("button", { class: "ak-btn ghost", style: "padding:4px 10px;font-size:.7rem;margin-left:8px", onclick: function () { optimiseMedia(); } }, ["Show"]));
        return;
      }
      txt(s.zipped ? (s.zipped + " fixed \u2014 drop your ZIP in first") : ("All " + s.total + " optimised \u00b7 WebP \u2713"));
    }
    function check() {
      txt("Reading\u2026");
      fetch("portfolio-data.json", { cache: "no-store" })
        .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
        .then(function (pub) {
          _optLastIx = _optGroups(pub || {});
          if (!_optLastIx.all.length) return txt("nothing published yet");
          var n = 0;
          _optScan(_optLastIx.all, function () { n++; txt("Checking " + n + " of " + _optLastIx.all.length + "\u2026"); }).then(render);
        });
    }
    render();
    return row;
  }
  window.AK_OPTIMISE = optimiseMedia;   /* so the site editor can deep-link the fixer */
  /* ---- media extraction helpers ---- */
  function _slug(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); }
  function _extFor(mime, fallback) {
    var map = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
      "application/pdf": "pdf", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/ogg": "ogv",
      "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "oga",
      "model/gltf-binary": "glb", "model/gltf+json": "gltf" };
    return map[(mime || "").toLowerCase()] || fallback || "bin";
  }
  function _dataURLBytes(d) {
    var comma = d.indexOf(","), meta = d.slice(5, comma), body = d.slice(comma + 1), bytes;
    if (/;base64/i.test(meta)) { var bin = atob(body); bytes = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); }
    else { bytes = new TextEncoder().encode(decodeURIComponent(body)); }
    return { mime: (meta.split(";")[0] || ""), bytes: bytes };
  }
  /* Same result, but the browser does the base64 for us. atob() + a per-character loop over a
     100 MB video is where the export used to stall or run the tab out of memory — and a video
     that never finished decoding was a video missing from the ZIP. */
  function _dataBytesAsync(d) {
    var mime = (d.slice(5).split(";")[0] || "").split(",")[0];
    if (typeof fetch === "function") {
      return fetch(d).then(function (r) { return r.arrayBuffer(); })
        .then(function (b) { return { mime: mime, bytes: new Uint8Array(b) }; })
        ["catch"](function () { return _dataURLBytes(d); });
    }
    return Promise.resolve(_dataURLBytes(d));
  }
  function _kindOf(mime, ext) {
    var m = String(mime || "").toLowerCase(), e = String(ext || "").toLowerCase();
    if (m.indexOf("image/") === 0 || /^(webp|jpe?g|png|gif|svg|avif)$/.test(e)) return "photo";
    if (m.indexOf("video/") === 0 || /^(mp4|webm|mov|m4v|ogv)$/.test(e)) return "video";
    if (m.indexOf("audio/") === 0 || /^(mp3|wav|m4a|aac|oga|ogg)$/.test(e)) return "audio";
    if (m === "application/pdf" || e === "pdf") return "pdf";
    if (m.indexOf("model/") === 0 || /^(glb|gltf|usdz|obj|fbx|stl)$/.test(e)) return "model";
    return "other";
  }
  function _sizeLabel(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }

  /* ---- canvas images: ship them at the size they are actually shown --------------------
     A reference photo dropped on a canvas at 280 units wide was still a full-size file — the
     visitor downloaded roughly ten times the pixels the browser drew. The canvas is 1200
     units fitted to the column, so 2.5× the element's own box covers a retina screen at any
     realistic column width; the floor keeps a small thumbnail from turning to mush. Only
     images ON A CANVAS are touched — covers and full-width blocks keep their full size. */
  var CANVAS_PX_PER_UNIT = 2.5, CANVAS_MIN_EDGE = 1280;
  function _canvasTarget(el) {
    var long = Math.max(+el.w || 0, +el.h || 0);
    if (!long) return 0;
    return Math.min(IMG_MAX_EDGE, Math.max(CANVAS_MIN_EDGE, Math.round(long * CANVAS_PX_PER_UNIT)));
  }
  function _refit(src, target) {
    return fetch(src).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
      if (!blob || blob.type.indexOf("image/") !== 0 || blob.type === "image/gif" || blob.type.indexOf("svg") > -1) return null;
      return _optDecode(blob).then(function (dec) {
        var long = Math.max(dec.w, dec.h);
        if (!long || (long <= target * 1.15 && blob.type === "image/webp")) { dec.release(); return null; }
        var k = Math.min(1, target / long);
        var w = Math.max(1, Math.round(dec.w * k)), hh = Math.max(1, Math.round(dec.h * k)), cv;
        try { cv = _optScaleTo(dec, w, hh); } catch (e) { dec.release(); return null; }
        dec.release();
        var out = null;
        try { out = cv.toDataURL("image/webp", 0.86); } catch (e) {}
        cv.width = cv.height = 1;
        if (!out || out.indexOf("data:image/webp") !== 0) return null;
        var bytes = (out.length - out.indexOf(",") - 1) * 0.75;
        if (bytes > blob.size * 0.9) return null;          // no real saving — keep the original
        return { src: out, saved: blob.size - bytes };
      });
    })["catch"](function () { return null; });
  }
  function _rightSizeCanvas(bundle, showUI) {
    var jobs = [];    (function walk(node, depth) {
      if (!node || typeof node !== "object" || depth > 12) return;
      if (Array.isArray(node)) { node.forEach(function (v) { walk(v, depth + 1); }); return; }
      var c = node.content;
      if (c && c.type === "image" && typeof c.src === "string" && c.src && (+node.w || +node.h)) {
        var t = _canvasTarget(node);
        if (t) jobs.push({ c: c, t: t });
      }
      Object.keys(node).forEach(function (k) { if (node[k] && typeof node[k] === "object") walk(node[k], depth + 1); });
    })(bundle, 0);
    if (!jobs.length) return Promise.resolve(0);
    /* The same picture placed in several spots is ONE file: group by source and re-encode
       once, at the largest size any of those spots needs. */
    var byS = {};
    jobs.forEach(function (j) {
      var g = byS[j.c.src] || (byS[j.c.src] = { src: j.c.src, t: 0, cs: [] });
      g.t = Math.max(g.t, j.t); g.cs.push(j.c);
    });
    jobs = Object.keys(byS).map(function (k) { return byS[k]; });

    var ov = null, line = null;
    if (showUI && jobs.length > 3) {
      line = h("div", { class: "sub" }, ["0 of " + jobs.length]);
      ov = h("div", { class: "ak-ov", style: "z-index:2147483600" }, [
        h("div", { class: "ak-modal", style: "width:min(380px,100%)" }, [h("h3", {}, ["Right-sizing canvas photos…"]), line])
      ]);
      document.body.appendChild(ov);
    }
    var i = 0, done = 0, saved = 0;
    function next() {
      if (i >= jobs.length) return Promise.resolve();
      var j = jobs[i++];
      return _refit(j.src, j.t).then(function (out) {
        if (out) { j.cs.forEach(function (c) { c.src = out.src; }); saved += out.saved; }
        done++;
        if (line) line.textContent = done + " of " + jobs.length;
        return next();
      });
    }
    /* two at a time — decoding several large photos at once is what makes an iPad give up */
    return Promise.all([next(), next()]).then(function () {
      if (ov) ov.remove();
      return saved;
    }, function () { if (ov) ov.remove(); return 0; });
  }
  /* ---- one file per picture -----------------------------------------------------------
     The same photo can arrive by several routes: uploaded twice, on a canvas AND in a block,
     already published under two names. Identical bytes are written once and every reference
     points at that one file — the ZIP, the repo and the visitor's browser all carry it once. */
  function _fnv(b) { var x = 2166136261; for (var i = 0; i < b.length; i++) { x ^= b[i]; x = (x * 16777619) >>> 0; } return "f" + x.toString(36); }
  function _hashBytes(b) {
    try {
      if (window.crypto && crypto.subtle && crypto.subtle.digest) {
        var buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
        return crypto.subtle.digest("SHA-1", buf).then(function (d) {
          var a = new Uint8Array(d), s = "";
          for (var i = 0; i < a.length; i++) s += ("0" + a[i].toString(16)).slice(-2);
          return s;
        })["catch"](function () { return _fnv(b); });
      }
    } catch (e) {}
    return Promise.resolve(_fnv(b));
  }
  function _dedupeFiles(files, bundle) {
    if (files.length < 2) return Promise.resolve(0);
    var i = 0, byHash = {}, remap = {}, keep = [], saved = 0, dropped = 0;
    function step() {
      if (i >= files.length) return Promise.resolve();
      var f = files[i++];
      return _hashBytes(f.bytes).then(function (hx) {
        var key = f.bytes.length + ":" + hx;
        if (byHash[key]) { remap[f.name] = byHash[key]; saved += f.bytes.length; dropped++; }
        else { byHash[key] = f.name; keep.push(f); }
        return step();
      });
    }
    return step().then(function () {
      if (!dropped) return 0;
      files.length = 0;
      keep.forEach(function (f) { files.push(f); });
      (function walk(node, depth) {
        if (!node || typeof node !== "object" || depth > 14) return;
        Object.keys(node).forEach(function (k) {
          var v = node[k];
          if (typeof v === "string") { if (remap[v]) node[k] = remap[v]; return; }
          if (v && typeof v === "object") walk(v, depth + 1);
        });
      })(bundle, 0);
      return saved;
    })["catch"](function () { return 0; });
  }

  /* ---- export: tiny JSON + media/ folder, zipped (GitHub & Vercel ready) ---- */
  function exportData(silent) {
    silent = (silent === true);
    return save().then(function () {
      var keys = ["ui-ux", "gen-ai", "3d"];
      // Read BOTH this browser's local edits (IndexedDB) AND the currently-published JSON.
      // A page only has a local copy if it was edited on THIS device; untouched pages must
      // fall back to the published data, otherwise they'd be dropped from the export.
      return Promise.all([
        fetch("portfolio-data.json", { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
      ].concat(keys.map(function (k) { return idbGet("data:" + k); }))).then(function (res) {
        var pub = res[0] || {};
        var vals = res.slice(1);
        var bundle = {};
        keys.forEach(function (k, i) {
          var local = vals[i];
          var localUsable = local && local.items && local.items.length > 0;
          var hasLocalEdits = false; try { hasLocalEdits = !!localStorage.getItem("ak-local-edits:" + k); } catch (e) {}
          if (hasLocalEdits && localUsable) { bundle[k] = local; }          // edited on this device — use working copy
          else if (pub[k] && pub[k].items) { bundle[k] = pub[k]; }          // untouched — keep what's already published
          else if (localUsable) { bundle[k] = local; }                      // no published copy yet — use local
        });
        // The page open right now: what is on screen is fresher than anything on disk. If a save
        // failed (full quota), the stored copy is stale — shipping it would drop the new work.
        if (DATA && DATA.items && DATA.items.length) { bundle[CFG.page] = DATA; }
        else if (!bundle[CFG.page]) { bundle[CFG.page] = DATA; }

        // ---- HOME PAGE content (certificates + project cover photos) ----
        // These live in localStorage on the home page, NOT in any project's IndexedDB.
        // Same merge rule as projects: this device's local edits win, else keep what's published.
        var home = {};
        var lsCerts = null;
        try { var rawC = localStorage.getItem("ak-certs"); if (rawC) { var arrC = JSON.parse(rawC); if (Array.isArray(arrC)) lsCerts = arrC; } } catch (e) {}
        if (lsCerts) { home.certs = lsCerts; }
        else if (pub.home && Array.isArray(pub.home.certs)) { home.certs = pub.home.certs; }
        var covers = {};
        keys.forEach(function (k) {
          var lv = null; try { lv = localStorage.getItem("ak-cover-" + k); } catch (e) {}
          if (lv) { covers[k] = lv; }
          else if (pub.home && pub.home.covers && pub.home.covers[k]) { covers[k] = pub.home.covers[k]; }
        });
        if (Object.keys(covers).length) { home.covers = covers; }
        var lsProfile = null; try { lsProfile = localStorage.getItem("ak-profile-photo"); } catch (e) {}
        if (lsProfile) { home.profile = lsProfile; }
        else if (pub.home && pub.home.profile) { home.profile = pub.home.profile; }
        if (home.certs || home.covers || home.profile) { bundle.home = home; }

        bundle = JSON.parse(JSON.stringify(bundle)); // clone — never corrupt live data

        return _rightSizeCanvas(bundle, !silent).then(function (canvasSaved) {

        var files = [], used = {}, seen = {}, made = {}, fetches = [];
        var resumeIncluded = false;
        var mstat = { photo: 0, video: 0, audio: 0, pdf: 0, model: 0, other: 0, bytes: 0, missing: [] };
        // include a replaced résumé PDF (admin) at media/home/ — the exact path the pages reference
        fetches.push(idbGet("ak-resume-pdf").then(function (d) {
          if (d && d.indexOf("data:") === 0) { var got = _dataURLBytes(d); files.push({ name: "media/home/Ajay-Katta-uiux-product-designer-2026.pdf", bytes: got.bytes }); resumeIncluded = true; }
        }).catch(function () {}));
        // Each asset is filed under media/<folder>/ where <folder> is the project key
        // (ui-ux | gen-ai | 3d | home). nameFor returns the path AFTER "media/".
        function nameFor(folder, base, ext) {
          base = (base || "asset").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "asset";
          var dir = folder ? folder + "/" : "";
          var nm = dir + base + "." + ext, n = 2;
          while (used[nm]) nm = dir + base + "-" + (n++) + "." + ext;
          used[nm] = 1; return nm;
        }
        function stash(ref, folder, hintBase, hintExt) {
          if (!ref || typeof ref !== "string") return ref;
          if (made[ref]) return ref;                        // already a file we produced this run
          if (ref.indexOf("data:") === 0) {                 // freshly uploaded file (inline data URL)
            if (seen[ref]) return seen[ref];
            var mime = (ref.slice(5).split(";")[0] || "").split(",")[0];
            var ext = _extFor(mime, hintExt);
            var path = "media/" + nameFor(folder, _slug(hintBase), ext);
            seen[ref] = path; made[path] = 1;
            mstat[_kindOf(mime, ext)]++;
            fetches.push(_dataBytesAsync(ref).then(function (got) {
              files.push({ name: path, bytes: got.bytes });
              mstat.bytes += got.bytes.length;
            })["catch"](function () { mstat.missing.push(path); }));
            return path;
          }
          if (/^media\//i.test(ref)) {                      // already-published file — re-bundle AND migrate it into media/<folder>/
            if (seen[ref]) return seen[ref];
            var basename = ref.replace(/^media\//, "").replace(/^.*\//, "");
            var dot = basename.lastIndexOf("."), b = dot > 0 ? basename.slice(0, dot) : basename, e = dot > 0 ? basename.slice(dot + 1) : "bin";
            var path2 = "media/" + nameFor(folder, b, e);
            seen[ref] = path2; made[path2] = 1;
            mstat[_kindOf("", e)]++;
            fetches.push(fetch(ref).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (buf) {
              if (buf) { files.push({ name: path2, bytes: new Uint8Array(buf) }); mstat.bytes += buf.byteLength; }
              else { mstat.missing.push(ref); }
            })["catch"](function () { mstat.missing.push(ref); }));
            return path2;
          }
          return ref; // root-level file (e.g. cert-google-ux.webp) or external URL — leave untouched
        }
        function walkBlocks(blocks, folder, base) {
          (blocks || []).forEach(function (b, i) {
            if (!b || b.type === "prototype") return; // prototype src is an embed URL
            if (b.src) b.src = stash(b.src, folder, base + "-" + (b.type || "asset") + "-" + (i + 1), b.format);
          });
        }
        /* Blocks are only ONE of the places a file lives. A Layout-Studio canvas keeps its
           pictures in studio.els[].content.src, a block's shapes in deco.els[], a canvas block
           in design.els[] — and none of those were ever extracted, so those photos and videos
           stayed as base64 inside portfolio-data.json: nothing in media/, and a data file tens
           of MB heavy. This sweeps every nested object so a file cannot hide again, wherever a
           future feature decides to keep it. */
        var INLINE_MIN = 2048;   // under this a data: URL stays inline — not worth its own file
        var NOISE = { content: 1, els: 1, design: 1, blocks: 1, items: 1, cases: 1, src: 1, meta: 1, info: 1 };
        function sweep(node, folder, base, depth) {
          if (!node || typeof node !== "object" || depth > 12) return;
          if (Array.isArray(node)) {
            node.forEach(function (v, i) { if (v && typeof v === "object") sweep(v, folder, base + "-" + (i + 1), depth + 1); });
            return;
          }
          if (node.type === "prototype") return;            // embed URL, not a file
          Object.keys(node).forEach(function (k) {
            var v = node[k];
            if (typeof v === "string") {
              var isData = v.indexOf("data:") === 0, isMedia = /^media\//i.test(v);
              if (!isData && !isMedia) return;
              if (isData && v.length < INLINE_MIN) return;   // tiny inline glyph — ships fine inside the JSON
              node[k] = stash(v, folder, base + (NOISE[k] ? "" : "-" + _slug(k)), node.format);
              return;
            }
            if (v && typeof v === "object") sweep(v, folder, base + (NOISE[k] ? "" : "-" + _slug(k)), depth + 1);
          });
        }
        Object.keys(bundle).forEach(function (page) {
          if (page === "home") return; // home images handled separately below
          var d = bundle[page] || {};
          (d.items || []).forEach(function (it, i) {
            var base = _slug(it.title) || (page + "-" + i);
            if (it.cover) it.cover = stash(it.cover, page, base + "-cover");
            if (it.homeBg && it.homeBg.video) it.homeBg.video = stash(it.homeBg.video, page, base + "-home-bg");
            if (it.homeBg && it.homeBg.image) it.homeBg.image = stash(it.homeBg.image, page, base + "-home-bg-image");
            walkBlocks(it.blocks, page, base);
            sweep(it, page, base, 0);                       // canvas layouts, shapes, anything nested
          });
          var cases = d.cases || {};
          Object.keys(cases).forEach(function (ck) {
            var c = cases[ck] || {};
            if (c.info && c.info.cover) c.info.cover = stash(c.info.cover, page, ck + "-cover");
            walkBlocks(c.blocks, page, ck);
            sweep(c, page, ck, 0);
          });
          sweep(d, page, page, 0);                          // page-level extras (canvas themes, defaults)
        });

        // stash home-page images (certificate scans + project cover photos) under media/home/
        if (bundle.home) {
          (bundle.home.certs || []).forEach(function (c, i) {
            if (c && c.img) c.img = stash(c.img, "home", "certificate-" + (_slug(c.title) || (i + 1)));
          });
          if (bundle.home.covers) Object.keys(bundle.home.covers).forEach(function (k) {
            bundle.home.covers[k] = stash(bundle.home.covers[k], "home", k + "-cover");
          });
          if (bundle.home.profile) bundle.home.profile = stash(bundle.home.profile, "home", "profile-photo");
          sweep(bundle.home, "home", "home", 0);
        }

        return Promise.all(fetches).then(function () {
          return _dedupeFiles(files, bundle);
        }).then(function (dupSaved) {
          var jsonText = JSON.stringify(bundle, null, 2);
          if (silent) return { json: jsonText, files: files };
          var mediaCount = files.length; // media only — JSON not added yet
          var mediaBytes = 0; files.forEach(function (f) { mediaBytes += f.bytes.length; });
          // Nothing big should be left inline: a data: URL still in here means a file the ZIP does not
          // carry. Tiny ones are deliberate (see INLINE_MIN) and must not raise a false alarm.
          var leftInline = (jsonText.match(/"data:[^"]*"/g) || []).filter(function (s) { return s.length >= INLINE_MIN; }).length;
          function counts(obj) { var o = { total: 0 }; keys.forEach(function (k) { var n = (obj && obj[k] && obj[k].items) ? obj[k].items.length : 0; o[k] = n; o.total += n; }); return o; }
          var nowC = counts(bundle);
          function doneModal(info) {
            var ov2 = h("div", { class: "ak-ov" });
            function close2() { ov2.remove(); }
            ov2.appendChild(h("div", { class: "ak-modal", style: "width:min(480px,100%)" }, [
              h("h3", {}, [!info ? "Export complete \u2713" : (info.mode === "delta" ? "Your changes are downloaded \u2713" : "Your updated website is downloaded \u2713")]),
              h("div", { class: "sub" }, [info ? info.name + " \u00b7 " + info.sizeLabel + " \u00b7 " + info.count + " files"
                                              : "portfolio-site-data.zip is downloading."]),
              h("div", { class: "ak-xsec" }, ["Inside the ZIP"]),
              h("div", { class: "ak-xrows" }, info ? (info.mode === "delta"
                ? (info.changed || []).slice(0, 12).map(function (n) { return h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, [n]), h("span", { class: "v" }, ["changed"])]); })
                    .concat((info.changed || []).length > 12 ? [h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["+ " + ((info.changed || []).length - 12) + " more"]), h("span", { class: "v" }, [""])])] : [])
                : [
                h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["Whole website"]), h("span", { class: "v" }, ["pages, scripts, photos"])]),
                h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["portfolio-data.json"]), h("span", { class: "v" }, ["your case studies"])]),
                h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["site-content.json"]), h("span", { class: "v" }, ["your page edits"])])
              ]) : [
                h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["portfolio-data.json"]), h("span", { class: "v" }, ["your content"])]),
                h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["media/"]), h("span", { class: "v" }, [mediaCount + " file" + (mediaCount === 1 ? "" : "s")])])
              ]),
              h("div", { class: "ak-xsec" }, ["To publish"]),
              h("ol", { class: "ak-xsteps" }, info ? (info.mode === "delta" ? [
                h("li", {}, ["Unzip it."]),
                h("li", {}, ["Open Ajaykatta_Website / GitRepo and copy these files into your repo, same folder layout \u2014 replace what's there."]),
                h("li", {}, ["Push to GitHub. Vercel redeploys automatically."])
              ] : [
                h("li", {}, ["Unzip it."]),
                h("li", {}, ["Copy everything inside Ajaykatta_Website / GitRepo into your repo, keeping the same folder layout \u2014 replace the old files."]),
                h("li", {}, ["Push to GitHub. Vercel redeploys automatically."]),
                h("li", {}, ["Want to check it first? Open GitRepo/index.html."])
              ]) : [
                h("li", {}, ["Unzip it."]),
                h("li", {}, ["From Ajaykatta_Website / GitRepo, copy portfolio-data.json AND the media folder into your site repo, next to your HTML pages \u2014 replace the old ones."]),
                h("li", {}, ["Push to GitHub. Vercel redeploys automatically."])
              ]),
              h("div", { class: "ak-acts" }, [
                h("button", { class: "ak-btn", onclick: close2 }, ["Done"])
              ])
            ]));
            ov2.addEventListener("click", function (e) { if (e.target === ov2) close2(); });
            document.body.appendChild(ov2);
          }
          function legacyZip() {
            var f2 = files.slice();
            f2.unshift({ name: "portfolio-data.json", bytes: new TextEncoder().encode(jsonText) });
            f2 = f2.map(function (f) { return { name: "Ajaykatta_Website/GitRepo/" + f.name, bytes: f.bytes }; });
            var zip = makeZip(f2);
            var a = h("a", { href: URL.createObjectURL(zip), download: "portfolio-site-data.zip" });
            document.body.appendChild(a); a.click(); a.remove();
            markCasesPublished();
            setTimeout(function () { doneModal(null); }, 200);
          }
          function proceed(mode) {
            if (location.protocol === "file:") return legacyZip();
            ensurePkg().then(function (pkg) {
              return pkg.full({ mode: mode === "delta" ? "delta" : "full", portfolioJSON: jsonText, portfolioFiles: files });
            }).then(function (info) {
              if (info && info.empty) { alert("Nothing to publish \u2014 the live site already matches your changes."); return; }
              markCasesPublished();
              setTimeout(function () { doneModal(info); }, 200);
            })["catch"](function () { legacyZip(); });
          }
          // pre-flight: compare against the currently-published JSON so a partial export can't silently wipe projects
          fetch("portfolio-data.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }).then(function (pub) {
            var labels = { "ui-ux": "UI / UX", "gen-ai": "Gen AI", "3d": "3D" };
            var warn = [];
            if (pub) {
              var pubC = counts(pub);
              keys.forEach(function (k) { if (nowC[k] < pubC[k]) warn.push(labels[k] + ": live has " + pubC[k] + ", this export has only " + nowC[k]); });
            }
            var homeCerts = (bundle.home && Array.isArray(bundle.home.certs)) ? bundle.home.certs.length : 0;
            var homeCovers = (bundle.home && bundle.home.covers) ? Object.keys(bundle.home.covers).length : 0;
            var homeProfile = !!(bundle.home && bundle.home.profile);
            function row(k, v) { return h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, [k]), h("span", { class: "v" }, [String(v)])]); }
            var ov = h("div", { class: "ak-ov" });
            function close() { ov.remove(); }
            ov.appendChild(h("div", { class: "ak-modal", style: "width:min(480px,100%)" }, [
              h("h3", {}, ["Export site data"]),
              h("div", { class: "sub" }, ["You get your whole website, updated \u2014 this replaces all content on your live site."]),
              h("div", { class: "ak-xsec" }, ["Projects"]),
              h("div", { class: "ak-xrows" }, [
                row("UI / UX", nowC["ui-ux"] + " project" + (nowC["ui-ux"] === 1 ? "" : "s")),
                row("Gen AI", nowC["gen-ai"] + " project" + (nowC["gen-ai"] === 1 ? "" : "s")),
                row("3D", nowC["3d"] + " project" + (nowC["3d"] === 1 ? "" : "s"))
              ]),
              h("div", { class: "ak-xsec" }, ["Home page"]),
              h("div", { class: "ak-xrows" }, [
                row("Certifications", homeCerts),
                row("Project covers", homeCovers),
                row("Profile photo", homeProfile ? "Included" : "Default"),
                row("R\u00e9sum\u00e9 PDF", resumeIncluded ? "Updated \u2014 in ZIP" : "Unchanged")
              ]),
              h("div", { class: "ak-xsec" }, ["Bundle"]),
              h("div", { class: "ak-xrows" }, [
                row("Photos", mstat.photo),
                mstat.video ? row("Video", mstat.video) : null,
                mstat.audio ? row("Audio", mstat.audio) : null,
                mstat.pdf ? row("PDFs", mstat.pdf) : null,
                mstat.model ? row("3D models", mstat.model) : null,
                row("Files in media/", mediaCount + " \u00b7 " + _sizeLabel(mediaBytes)),
                canvasSaved ? row("Canvas photos right-sized", _sizeLabel(canvasSaved) + " lighter") : null,
                dupSaved ? row("Duplicates merged", _sizeLabel(dupSaved) + " saved") : null,
                row("Data file", _sizeLabel(jsonText.length)),
                optCheckRow()
              ].filter(Boolean)),
              (leftInline || mstat.missing.length) ? h("div", { class: "ak-xwarn" }, [
                h("strong", {}, ["\u26A0 " + (leftInline + mstat.missing.length) + " file" + ((leftInline + mstat.missing.length) === 1 ? "" : "s") + " could not be packed."]),
                leftInline ? h("div", { style: "margin-top:6px" }, [leftInline + " still sitting inside the data file instead of media/."]) : null,
                mstat.missing.length ? h("div", { style: "margin-top:6px" }, ["Couldn't read: " + mstat.missing.slice(0, 4).join(", ") + (mstat.missing.length > 4 ? " +" + (mstat.missing.length - 4) + " more" : "")]) : null,
                h("div", { style: "margin-top:6px" }, ["Tell Claude before you publish \u2014 those items would go missing on the live site."])
              ].filter(Boolean)) : null,
              warn.length ? h("div", { class: "ak-xwarn" }, [
                h("strong", {}, ["\u26A0 This export has FEWER projects than your live site."]),
                h("div", { style: "margin-top:6px" }, warn.map(function (w) { return h("div", {}, ["\u2022 " + w]); })),
                h("div", { style: "margin-top:6px" }, ["Publishing it will DELETE those missing projects."])
              ]) : null,
              h("div", { class: "ak-xsec" }, ["Download"]),
              h("div", { class: "ak-xrows" }, [
                h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["Only my changes"]), h("span", { class: "v" }, ["about " + _sizeLabel(mediaBytes + jsonText.length)])]),
                h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["Whole website"]), h("span", { class: "v" }, ["much larger \u2014 every page and photo"])])
              ]),
              h("div", { class: "ak-hint", style: "margin-top:8px" }, ["\u201CWhole website\u201D also re-downloads every photo already on your live site, so it is always the bigger file. Both publish the same content \u2014 pick \u201COnly my changes\u201D unless you want a full backup."]),
              h("div", { class: "ak-acts" }, [
                h("button", { class: "ak-btn ghost", onclick: close }, ["Cancel"]),
                h("button", { class: "ak-btn ghost", onclick: function () { close(); proceed("full"); } }, ["Whole website"]),
                h("button", { class: "ak-btn" + (warn.length ? " danger" : ""), onclick: function () { close(); proceed("delta"); } }, [warn.length ? "Changes only (anyway)" : "Only my changes"])
              ])
            ]));
            ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
            document.body.appendChild(ov);
          });
        });
        });
      });
    });
  }
  /* the whole-website packager is shared with site-edit.js — fetched on demand */
  function ensurePkg() {
    if (window.AK_PACKAGE) return Promise.resolve(window.AK_PACKAGE);
    return new Promise(function (res, rej) {
      var id = "ak-package-js";
      if (!document.getElementById(id)) document.body.appendChild(h("script", { id: id, src: "site-package.js?v=2" }));
      var tries = 0;
      (function poll() {
        if (window.AK_PACKAGE) return res(window.AK_PACKAGE);
        if (++tries > 120) return rej(new Error("packager unavailable"));
        setTimeout(poll, 50);
      })();
    });
  }
  // lets Settings → Publish include unpublished case-study edits from this device
  // markPublished(): after a successful download, the projects on this device ARE the
  // live ones — the snapshot is what stops Settings → Projects showing them as edited.
  function markCasesPublished() {
    var ks = ["ui-ux", "gen-ai", "3d"];
    return Promise.all(ks.map(function (k) { return idbGet("data:" + k); })).then(function (vals) {
      var data = {};
      ks.forEach(function (k, i) { if (vals[i]) data[k] = vals[i]; });
      return idbSet("case:pub-base", { at: Date.now(), data: data });
    }).then(function () {
      try { document.dispatchEvent(new CustomEvent("ak-cases-changed")); } catch (e) {}
    })["catch"](function () {});
  }
  window.AK_ADMIN_DATA = { build: function () { return exportData(true); }, markPublished: markCasesPublished };

  function importData() {
    var fi = h("input", { type: "file", accept: "application/json,.json", style: "display:none" });
    document.body.appendChild(fi);
    fi.addEventListener("change", function () {
      var f = fi.files[0]; if (!f) return;
      f.text().then(function (txt) {
        try {
          var obj = JSON.parse(txt);
          var keys = Object.keys(obj).filter(function (k) { return obj[k] && obj[k].items; });
          if (!keys.length && obj.items) { obj = { ["" + CFG.page]: obj }; keys = [CFG.page]; }
          return Promise.all(keys.map(function (k) { return idbSet("data:" + k, obj[k]); })).then(function () {
            if (obj[CFG.page]) DATA = obj[CFG.page];
            renderTiles(); renderCases(); if (openItemId) renderDetail();
            alert("Imported successfully.");
          });
        } catch (e) { alert("That file isn't a valid portfolio-data.json."); }
      });
      fi.remove();
    });
    fi.click();
  }

  /* ============================================================ INIT */
  var _revealed = false;
  function revealTiles() {
    if (_revealed) return; _revealed = true;
    document.body.classList.remove("ak-hydrating");
  }
  function init() {
    // Hide the tile grid up front so built-in/default tiles can't flash before
    // the saved project list is loaded and reconciled below.
    document.body.classList.add("ak-hydrating");
    // Safety net: never leave the grid hidden if loading hangs or errors.
    setTimeout(revealTiles, 3000);
    injectCSS();
    buildHeaderButton();
    load().then(function () {
      DATA.cases = DATA.cases || {};
      DATA.removedSeeds = DATA.removedSeeds || [];
      DATA.removedCases = DATA.removedCases || [];
      return adoptSeeds();
    }).then(function () {
      adoptCases();
      syncMode();
      renderTiles();
      renderCases();
      requestAnimationFrame(revealTiles);
    }).catch(revealTiles);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
