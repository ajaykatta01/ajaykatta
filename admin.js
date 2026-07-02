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
  var NS = "ak-admin:" + CFG.page;
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
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function $(s, r) { return (r || document).querySelector(s); }

  function sha256(str) {
    var enc = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }
  function readFileAsDataURL(file) {
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(file); });
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
      onChange(cv.toDataURL("image/jpeg", 0.9));
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
    return fetch("portfolio-data.json", { cache: "no-store" })
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
  function save() {
    try { if (typeof isUnlocked === "function" && isUnlocked()) localStorage.setItem(EDIT_FLAG, "1"); } catch (e) {}
    return idbSet("data:" + CFG.page, DATA);
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
    .ak-btn{display:inline-flex;align-items:center;gap:7px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.86rem;
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
    .ak-menu{position:fixed;right:20px;top:62px;min-width:230px;max-height:calc(100vh - 80px);overflow-y:auto;background:var(--surface);border:1px solid var(--line);
      border-radius:14px;padding:6px;box-shadow:0 24px 60px -28px rgba(0,0,0,.6),0 0 0 1px color-mix(in srgb,var(--accent) 10%,transparent);
      z-index:250;display:none;flex-direction:column;gap:1px}
    .ak-menu.on{display:flex;animation:akpop .18s ease}
    @keyframes akpop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
    .ak-mi{display:flex;align-items:center;gap:9px;font-family:'Space Grotesk',sans-serif;font-weight:500;font-size:.86rem;color:var(--text);
      background:none;border:none;text-align:left;padding:6px 11px;border-radius:8px;cursor:pointer;transition:.15s;width:100%}
    .ak-mi:hover{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)}
    .ak-mi .ico{width:22px;height:22px;border-radius:6px;display:flex;align-items:center;justify-content:center;flex:none;
      background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
    .ak-mi .ico svg{width:13px;height:13px}
    .ak-mi.warn:hover{background:color-mix(in srgb,#ef4444 14%,transparent);color:#ef4444}
    .ak-mi.warn .ico{background:color-mix(in srgb,#ef4444 14%,transparent);color:#ef4444}
    .ak-sep{height:1px;background:var(--line);margin:3px 8px}
    .ak-label{font-family:'Space Mono',monospace;font-size:.58rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);padding:5px 11px 2px}
    .ak-badge{font-family:'Space Mono',monospace;font-size:.5rem;letter-spacing:.14em;text-transform:uppercase;color:#fff;
      background:linear-gradient(135deg,var(--accent),var(--accent-2));padding:3px 7px;border-radius:5px;margin-left:7px}

    /* modal */
    .ak-ov{position:fixed;inset:0;z-index:300;background:color-mix(in srgb,#05060a 72%,transparent);backdrop-filter:blur(7px);
      display:flex;align-items:center;justify-content:center;padding:24px;animation:akfade .2s ease}
    @keyframes akfade{from{opacity:0}to{opacity:1}}
    .ak-modal{width:min(560px,100%);max-height:88vh;overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:18px;
      padding:26px;box-shadow:0 40px 100px -30px rgba(0,0,0,.7)}
    .ak-modal h3{font-family:'Space Grotesk',sans-serif;font-size:1.3rem;margin:0 0 4px;color:var(--text)}
    .ak-modal .sub{color:var(--muted);font-size:.9rem;margin-bottom:20px}
    .ak-field{display:flex;flex-direction:column;gap:7px;margin-bottom:16px}
    .ak-field label{font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-2)}
    .ak-field input[type=text],.ak-field input[type=password],.ak-field input[type=url],.ak-field textarea,.ak-field select{
      font-family:'Inter',sans-serif;font-size:.95rem;color:var(--text);background:color-mix(in srgb,var(--bg) 60%,var(--surface));
      border:1px solid var(--line);border-radius:10px;padding:11px 13px;width:100%;transition:.2s}
    .ak-field textarea{min-height:84px;resize:vertical;line-height:1.5}
    .ak-field input:focus,.ak-field textarea:focus,.ak-field select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}
    .ak-file{border:1.5px dashed var(--line);border-radius:11px;padding:18px;text-align:center;cursor:pointer;transition:.2s;color:var(--muted);font-size:.88rem}
    .ak-file:hover{border-color:var(--accent);color:var(--text)}
    .ak-file.has{border-style:solid;border-color:var(--accent);color:var(--text)}
    .ak-file-remove{margin-top:9px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.8rem;color:#f87171;background:none;border:none;cursor:pointer;padding:3px 2px;display:inline-flex;align-items:center;gap:6px}
    .ak-file-remove:hover{text-decoration:underline}
    .ak-acts{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
    .ak-hint{font-size:.78rem;color:var(--muted);margin-top:-8px;margin-bottom:14px;line-height:1.45}
    .ak-err{color:#f87171;font-size:.82rem;margin-top:8px;min-height:1em}
    /* export summary modal */
    .ak-xsec{font-family:'Space Mono',monospace;font-size:.58rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-2);margin:16px 0 8px}
    .ak-xrows{display:flex;flex-direction:column;border:1px solid var(--line);border-radius:12px;overflow:hidden}
    .ak-xrow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;font-size:.9rem;background:color-mix(in srgb,var(--bg) 55%,var(--surface))}
    .ak-xrow + .ak-xrow{border-top:1px solid var(--line)}
    .ak-xrow .k{color:var(--muted)}
    .ak-xrow .v{font-family:'Space Grotesk',sans-serif;font-weight:600;color:var(--text)}
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
    .ak-crop-reset{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.78rem;color:var(--muted);background:none;border:none;cursor:pointer;padding:3px 4px;white-space:nowrap}
    .ak-crop-reset:hover{color:var(--accent)}

    /* detail overlay */
    .ak-detail{position:relative;z-index:1;background:var(--bg);animation:akdetail .34s cubic-bezier(.2,.7,.3,1) both;will-change:opacity,transform}
    @keyframes akdetail{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
    @media (prefers-reduced-motion: reduce){.ak-detail{animation:none}}
    body.ak-item-detail .index-view,body.ak-item-detail .cs-detail{display:none!important}
    body.ak-item-detail .phead,body.ak-item-detail .phead ~ section:has(> .pgrid){display:none!important}
    body.ak-item-detail .nav-right .home,body.ak-item-detail .nav-right .ak-wrap,body.ak-item-detail .nav-right .theme-toggle{display:none}
    .ak-item-actions{display:flex;align-items:center;gap:9px}
    .ak-d-bar{position:sticky;top:0;z-index:40;border-bottom:1px solid var(--line);
      background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(14px);
      transition:transform .35s cubic-bezier(.2,.7,.3,1),opacity .35s}
    .ak-d-bar.ak-bar-hidden{transform:translateY(calc(-100% - 90px));opacity:0;pointer-events:none}
    .ak-d-bar .inner{display:flex;align-items:center;gap:14px;flex-wrap:nowrap;padding:8px 28px;max-width:1180px;margin:0 auto}
    .ak-d-bar .title{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:1rem;color:var(--text)}
    .ak-d-bar .tabwrap{position:relative;display:flex;flex:1 1 auto;min-width:0;max-width:100%}
    .ak-d-bar .tabbar{display:flex;gap:5px;padding:5px;border:1px solid var(--line);border-radius:99px;background:color-mix(in srgb,var(--surface) 60%,transparent);backdrop-filter:blur(8px);max-width:100%;overflow-x:auto;scroll-behavior:smooth;cursor:grab;-webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 calc(22px*var(--l,0)),#000 calc(100% - 22px*var(--r,0)),transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 calc(22px*var(--l,0)),#000 calc(100% - 22px*var(--r,0)),transparent 100%)}
    .ak-d-bar .tabbar::-webkit-scrollbar{display:none}
    .ak-d-bar .tabbar.is-dragging{cursor:grabbing;scroll-behavior:auto}
    .ak-d-bar .tabnav{position:absolute;top:50%;transform:translateY(-50%);z-index:3;width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:color-mix(in srgb,var(--surface) 90%,transparent);backdrop-filter:blur(8px);color:var(--text);font-family:'Space Grotesk',sans-serif;font-size:1.15rem;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .25s,transform .25s,background .25s,color .25s,border-color .25s;box-shadow:0 8px 22px -10px rgba(0,0,0,.55)}
    .ak-d-bar .tabnav.show{opacity:1;pointer-events:auto}
    .ak-d-bar .tabnav.prev{left:-7px}
    .ak-d-bar .tabnav.next{right:-7px}
    .ak-d-bar .tabnav:hover{background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;border-color:transparent}
    .ak-d-bar .tabnav.prev:hover{transform:translateY(-50%) translateX(-2px)}
    .ak-d-bar .tabnav.next:hover{transform:translateY(-50%) translateX(2px)}
    .ak-d-bar .tab{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.88rem;color:var(--muted);padding:7px 16px;border-radius:99px;border:none;background:none;cursor:pointer;transition:.3s;white-space:nowrap}
    .ak-d-bar .tab:hover{color:var(--text)}
    .ak-d-bar .tab.active{color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-2))}
    .ak-d-bar .cs-back{flex:0 0 auto;display:inline-flex;align-items:center;gap:8px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.88rem;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:99px;padding:7px 15px;cursor:pointer;transition:.25s;white-space:nowrap}
    .ak-d-bar .cs-back:hover{border-color:var(--accent);color:var(--accent)}
    .ak-d-bar .cs-back .arr{transition:transform .3s}
    .ak-d-bar .cs-back:hover .arr{transform:translateX(-4px)}
    .ak-d-hero{position:relative;padding:60px 28px;text-align:center;border-bottom:1px solid var(--line);overflow:hidden}
    .ak-d-foot{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:74px 24px 100px}
    .ak-d-foot .mono{display:block;font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent-2)}
    .ak-d-foot h2{font-family:'Space Grotesk',sans-serif;font-size:clamp(1.8rem,3.2vw,2.6rem);letter-spacing:-.02em;color:var(--text);margin:0}
    .ak-d-foot .credit{color:var(--muted);font-size:.88rem;margin:0}
    .ak-totop{margin-top:18px;display:inline-flex;align-items:center;gap:9px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.9rem;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:99px;padding:11px 22px;cursor:pointer;transition:.25s}
    .ak-totop:hover{border-color:var(--accent);color:var(--accent);transform:translateY(-2px)}
    .ak-d-hero .cover{position:absolute;inset:0;background-size:cover;background-position:center;opacity:.18;
      mask:radial-gradient(80% 80% at 50% 36%,#000,transparent 86%);-webkit-mask:radial-gradient(80% 80% at 50% 36%,#000,transparent 86%)}
    .ak-d-hero .gr{position:absolute;inset:0;background:radial-gradient(60% 60% at 50% 0%,color-mix(in srgb,var(--accent) 22%,transparent),transparent 70%)}
    .ak-d-hero .inner{position:relative;max-width:760px;margin:0 auto}
    .ak-d-hero .tag{font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent-2)}
    .ak-d-hero h1{font-family:'Space Grotesk',sans-serif;font-size:clamp(2rem,5vw,3.3rem);letter-spacing:-.03em;margin:14px 0 16px;color:var(--text);
      background:linear-gradient(180deg,var(--text),color-mix(in srgb,var(--text) 55%,var(--accent)));-webkit-background-clip:text;background-clip:text;color:transparent}
    .ak-d-hero p{color:var(--muted);font-size:1.05rem;max-width:600px;margin:0 auto 26px}
    .ak-meta{display:flex;flex-wrap:wrap;justify-content:center;gap:12px}
    .ak-meta .m{display:flex;flex-direction:column;gap:4px;padding:12px 16px;border:1px solid var(--line);border-radius:13px;background:color-mix(in srgb,var(--surface) 55%,transparent);min-width:120px}
    .ak-meta .mk{font-family:'Space Mono',monospace;font-size:.56rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-2)}
    .ak-meta .mv{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.9rem;color:var(--text)}
    .ak-blocks{max-width:1100px;margin:0 auto;padding:48px 24px 110px;display:flex;flex-direction:column;gap:30px}
    .ak-empty{text-align:center;color:var(--muted);padding:70px 20px;border:1.5px dashed var(--line);border-radius:18px;
      background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--accent) 5%,transparent) 0 1.5px,transparent 1.5px 16px)}
    .ak-empty h4{font-family:'Space Grotesk',sans-serif;font-size:1.15rem;color:var(--text);margin:0 0 8px}

    /* blocks */
    .ak-block{position:relative;border:1px solid transparent;border-radius:14px;transition:.2s}
    .ak-block.admin{border-color:transparent;padding:0;background:none;outline:1px dashed color-mix(in srgb,var(--accent) 32%,transparent);outline-offset:-1px;border-radius:12px}
    .ak-block.admin.drag{opacity:.4}
    .ak-block.admin.over{outline-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 16%,transparent)}
    .ak-btoolbar{position:absolute;top:10px;right:10px;left:auto;z-index:6;display:none;align-items:center;gap:5px;margin:0;padding:5px;border-radius:11px;background:color-mix(in srgb,var(--surface) 90%,transparent);border:1px solid var(--line);box-shadow:0 8px 22px -10px rgba(0,0,0,.5);backdrop-filter:blur(7px)}
    .ak-block.admin .ak-btoolbar{display:flex}
    .ak-btoolbar .grab{cursor:grab;color:var(--muted);display:flex;align-items:center;padding:3px 7px 3px 4px;margin:0;font-family:'Space Mono',monospace;font-size:.58rem;letter-spacing:.1em;text-transform:uppercase;gap:6px;border-right:1px solid var(--line)}
    .ak-btoolbar .grab:active{cursor:grabbing}
    .ak-tb{width:30px;height:30px;border-radius:8px;border:1px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer;
      display:flex;align-items:center;justify-content:center;transition:.15s}
    .ak-tb:hover{border-color:var(--accent);color:var(--accent)}
    .ak-tb.warn:hover{border-color:#ef4444;color:#ef4444}
    .ak-tb svg{width:15px;height:15px}
    .ak-tb[disabled]{opacity:.35;cursor:default}
    .ak-cap{font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-top:10px;text-align:center}
    .ak-block img.media{display:block;width:100%;height:auto;border-radius:12px;border:1px solid var(--line)}
    .ak-block video.media,.ak-block iframe.media{display:block;width:100%;border-radius:12px;border:1px solid var(--line);background:#000}
    .ak-block iframe.media{height:min(78vh,760px)}
    .ak-block video.media{max-height:80vh}
    .ak-block audio.media{width:100%}
    .ak-pdf{height:min(82vh,860px);border-radius:12px;border:1px solid var(--line);overflow:hidden}
    .ak-pdf iframe{width:100%;height:100%;border:0}
    .ak-text h2{font-family:'Space Grotesk',sans-serif;font-size:clamp(1.4rem,3vw,2rem);color:var(--text);margin:0 0 12px;letter-spacing:-.02em}
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
    .ak-fab{position:fixed;right:22px;bottom:22px;z-index:115}
    @media(max-width:640px){.ak-menu{position:fixed;left:12px;right:12px;top:64px;min-width:0}
      .ak-d-bar .inner{padding:8px 16px;gap:10px;flex-wrap:nowrap;justify-content:flex-start}
      .ak-d-bar .cs-back{flex:0 0 auto;padding:7px 13px;font-size:.84rem}
      .ak-d-bar .title{display:none}
      .ak-d-bar .tabbar{flex:1 1 auto;min-width:0;justify-content:flex-start}
      .ak-item-actions{flex:0 0 auto}}

    /* full-bleed media (matches FinTrack gallery dimensions) */
    .ak-wide{width:min(1600px,93vw);margin-left:50%;transform:translateX(-50%)}
    .ak-wide img.media,.ak-wide video.media,.ak-wide iframe.media{display:block;width:100%;height:auto;border-radius:0;border:0;background:#000}
    .ak-wide iframe.media{height:min(80vh,820px)}
    /* prototype info header (admin-added prototypes) */
    .ak-proto-info{max-width:760px;margin:0 auto 26px;text-align:center}
    .ak-proto-info .eyebrow{font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.18em;text-transform:uppercase;color:var(--accent);display:block;margin-bottom:12px}
    .ak-proto-info h2{font-family:'Space Grotesk',sans-serif;font-size:clamp(1.5rem,3vw,2.2rem);letter-spacing:-.02em;color:var(--text);margin:0 0 12px}
    .ak-proto-info p{color:var(--muted);font-size:1.05rem;line-height:1.6;margin:0 0 18px}
    .ak-proto-hint{display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
    .ak-proto-hint .chip{display:inline-flex;align-items:center;gap:8px;font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);border:1px solid var(--line);border-radius:99px;padding:7px 13px;background:color-mix(in srgb,var(--surface) 55%,transparent)}
    .ak-proto-hint .chip .dot{width:6px;height:6px;border-radius:50%;background:var(--accent);flex:none}
    /* admin prototype info stays dark-themed even in light mode */
    [data-theme="light"] .ak-proto-info{--bg:#1C1A14;--surface:#1D1C1A;--line:#373634;
      --text:#FFFFFF;--muted:#C9C8C6;--accent:#E5783A;--accent-2:#C2410C;
      background:#141209;border:1px solid #373634;border-radius:18px;padding:32px 30px}
    .ak-block.admin:has(.ak-wide){outline-color:transparent;background:none;padding:0}
    /* inline "add content" for pre-existing case studies */
    .ak-case-blocks{display:flex;flex-direction:column;gap:30px;padding:8px 0 30px}
    .ak-case-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:34px;padding:24px 0 4px;border-top:1px solid var(--line)}
    .ak-case-acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .ak-cs-actions{display:flex;align-items:center;gap:9px}
    .nav-right .ak-cs-actions{display:none}
    body.detail .nav-right .ak-cs-actions{display:flex}
    .ak-case-tag{font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-2)}
    body:not(.ak-on) .ak-case-head{display:none}

    /* undo toast */
    .ak-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%) translateY(20px);z-index:400;
      display:flex;align-items:center;gap:14px;padding:11px 13px 11px 18px;border-radius:13px;
      background:var(--surface);border:1px solid var(--line);box-shadow:0 24px 60px -22px rgba(0,0,0,.55);
      opacity:0;pointer-events:none;transition:opacity .25s,transform .25s;max-width:min(92vw,460px)}
    .ak-toast.on{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}
    .ak-toast .msg{font-family:'Space Grotesk',sans-serif;font-weight:500;font-size:.9rem;color:var(--text);margin-right:auto}
    .ak-toast .undo{display:inline-flex;align-items:center;gap:6px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.85rem;
      color:var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent);border:1px solid color-mix(in srgb,var(--accent) 30%,transparent);
      border-radius:99px;padding:7px 14px;cursor:pointer;transition:.18s;white-space:nowrap}
    .ak-toast .undo:hover{background:color-mix(in srgb,var(--accent) 20%,transparent)}
    .ak-toast .undo svg{width:14px;height:14px}
    .ak-toast .x{background:none;border:none;color:var(--muted);cursor:pointer;display:flex;padding:5px;border-radius:7px;transition:.15s}
    .ak-toast .x:hover{color:var(--text);background:color-mix(in srgb,var(--text) 8%,transparent)}
    .ak-toast .x svg{width:15px;height:15px}
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
            });
          });
          if (removeBtn) removeBtn.addEventListener("click", function () {
            fieldEls[f.key]._data = ""; fieldEls[f.key]._name = ""; fieldEls[f.key]._files = []; try { fi.value = ""; } catch (e) {}
            label.classList.remove("has"); label.textContent = f.placeholder || "Click to choose a file";
            removeBtn.style.display = "none"; if (cropper) cropper.hide();
          });
          holder = h("div", {}, [label, fi, removeBtn, cropper ? cropper.el : null]);
          label.addEventListener("click", function () { fi.click(); });
          input = { _holder: holder, _data: f.value || "", _name: f.name || "", _files: [] };
          fieldEls[f.key] = input;
          if (cropper && f.value) setTimeout(function () { cropper.load(f.value); }, 30);
          return h("div", { class: "ak-field" }, [h("label", {}, [f.label]), holder, f.hint ? h("div", { class: "ak-hint" }, [f.hint]) : null]);
        } else input = h("input", { type: f.type || "text", placeholder: f.placeholder || "" });
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
          else out[f.key] = el.value.trim();
        });
        return out;
      }
      var submit = h("button", { class: "ak-btn", onclick: function () {
        var v = collect();
        if (opts.validate) { var err = opts.validate(v); if (err) { errEl.textContent = err; return; } }
        close(v);
      } }, [opts.submitLabel || "Save"]);

      var m = h("div", { class: "ak-modal" }, [
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
    palette: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3s6 6.4 6 10.5a6 6 0 0 1-12 0C6 9.4 12 3 12 3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
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
    var code = h("textarea", { readonly: "", style: "width:100%;min-height:70px;resize:none;font-family:'Space Mono',monospace;font-size:.78rem;line-height:1.5;color:var(--text);background:color-mix(in srgb,var(--bg) 60%,var(--surface));border:1px solid var(--line);border-radius:10px;padding:11px 13px" });
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
      menuEl.appendChild(h("div", { class: "ak-label" }, ["Appearance"]));
      menuEl.appendChild(mi(I.spacing, "Content spacing", function () { editSpacing(); }));
      menuEl.appendChild(mi(I.palette, "Background color", function () { editBackground(); }));
      menuEl.appendChild(h("div", { class: "ak-sep" }));
      menuEl.appendChild(mi(I.edit, "Edit " + CFG.noun + " details", function () { editItem(it); }));
      menuEl.appendChild(mi(I.trash, "Delete this " + CFG.noun, function () { deleteItem(it); }, true));
    } else {
      menuEl.appendChild(h("div", { class: "ak-label" }, [CFG.noun + "s"]));
      menuEl.appendChild(mi(I.plus, "Add " + CFG.noun, function () { editItem(null); }));
    }
    menuEl.appendChild(h("div", { class: "ak-sep" }));
    menuEl.appendChild(h("div", { class: "ak-label" }, ["Publish & account"]));
    menuEl.appendChild(mi(I.dl, "Export site data", exportData));
    menuEl.appendChild(mi(I.ul, "Import site data", importData));
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
  function renderTiles() {
    var grid = tileGrid(); if (!grid) return;
    grid.querySelectorAll("[data-ak-item]").forEach(function (n) { n.remove(); });
    var tileAnchor = grid.querySelector(".ptile[data-case]"); // newest items render before any built-in case tiles
    DATA.items.forEach(function (it) {
      var coverStyle = it.cover
        ? "background:url('" + dataURLtoBlobURL(it.cover) + "') center/cover no-repeat"
        : "";
      var grip = isUnlocked() ? h("button", { class: "ak-tb ak-grip", title: "Drag to reorder", html: I.dots, onclick: function (e) { e.stopPropagation(); e.preventDefault(); } }) : null;
      var ctl = h("div", { class: "ak-tile-ctl" }, [
        grip,
        h("button", { class: "ak-tb", title: "Edit", html: I.edit, onclick: function (e) { e.stopPropagation(); editItem(it); } }),
        h("button", { class: "ak-tb warn", title: "Delete", html: I.trash, onclick: function (e) { e.stopPropagation(); deleteItem(it); } })
      ]);
      var tile = h(CFG.tileTag, { class: "ptile", "data-ak-item": it.id, style: "opacity:1;transform:none" }, [
        ctl,
        h("div", { class: "ptile-img", role: "img", style: coverStyle }, it.label ? [h("span", { class: "ph-label" }, [it.label])] : []),
        h("div", { class: "ptile-body" }, [
          h("span", { class: "ptile-tag" }, [it.tag || "Project"]),
          h("h3", {}, [it.title || "Untitled"]),
          h("span", { class: "ptile-link" }, ["Open project ", h("span", { class: "arr" }, ["\u2192"])])
        ])
      ]);
      tile.addEventListener("click", function () { openDetail(it.id); });
      if (isUnlocked()) makeDraggable(tile, it.id, grip);
      grid.insertBefore(tile, tileAnchor);
    });
    renderItemTabs();
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
        h("button", { class: "ak-btn ghost", "data-ak-trigger": "1", html: I.edit + "<span>Edit details</span>",
          onclick: function (e) { e.stopPropagation(); var k = activeCaseKey(); if (k) editCase(k); } }),
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
  function editItem(it) {
    var creating = !it;
    modal({
      title: creating ? "Add " + CFG.noun : "Edit " + CFG.noun,
      sub: creating ? "Create a new entry. You can add images, PDFs, prototypes and more once it's open." : "",
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
        save().then(function () { renderTiles(); openDetail(item.id); });
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
  function openDetail(id) {
    openItemId = id;
    document.body.classList.add("ak-item-detail");
    renderDetail();
    window.scrollTo(0, 0);
    initBarHide();
  }
  // hide the "All projects / All case studies" sticky bar on scroll down, reveal on scroll up
  var barHideInit = false;
  function initBarHide() {
    if (barHideInit) return;
    barHideInit = true;
    var last = window.scrollY || document.documentElement.scrollTop, ticking = false;
    function update() {
      var bar = document.querySelector(".ak-d-bar");
      var y = window.scrollY || document.documentElement.scrollTop;
      if (bar) {
        if (y > last && y > 120) bar.classList.add("ak-bar-hidden");
        else bar.classList.remove("ak-bar-hidden");
      }
      last = y;
      ticking = false;
    }
    addEventListener("scroll", function () {
      if (!ticking) { requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
  }
  function closeDetail() {
    openItemId = null;
    document.body.classList.remove("ak-item-detail");
    clearItemActions();
    if (detailEl) { detailEl.remove(); detailEl = null; }
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
          h("button", { class: "ak-btn ghost", "data-ak-trigger": "1", html: I.edit + "<span>Edit details</span>",
            onclick: function (e) { e.stopPropagation(); editItem(it); } }),
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
  function renderDetail() {
    var it = DATA.items.find(function (x) { return x.id === openItemId; });
    if (!it) { closeDetail(); return; }
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
      it.blocks.forEach(function (b, i) { blocksWrap.appendChild(renderBlock(it, b, i, admin, renderDetail)); });
    }

    var hdrEl = document.querySelector("header");
    // sticky case-study / project tab bar (all project pages), with this one active
    var strip = h("div", { class: "tabbar" }, []);
    DATA.items.forEach(function (x) { // newest items first
      strip.appendChild(h("button", { class: "tab" + (x.id === it.id ? " active" : ""), onclick: function () { if (x.id !== it.id) openDetail(x.id); } }, [x.title || "Untitled"]));
    });
    builtinTabs().forEach(function (b) {
      strip.appendChild(h("button", { class: "tab", onclick: function () { closeDetail(); if (window.openCase) window.openCase(b.key); } }, [b.label]));
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

    var hero = h("div", { class: "ak-d-hero" }, [
      null,
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

    detailEl = h("div", { class: "ak-detail" }, [bar, hero, blocksWrap, foot]);
    if (it.bg) {
      detailEl.style.background = it.bg;
      hero.style.background = "var(--bg)";
      foot.style.background = "var(--bg)";
    }
    if (it.spacing != null) blocksWrap.style.gap = it.spacing + "px";
    document.body.appendChild(detailEl);
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
  function renderBlock(item, b, idx, admin, rerender) {
    rerender = rerender || renderDetail;
    var inner;
    if (b.type === "image") {
      inner = h("div", {}, [h("div", { class: "ak-wide" }, [h("img", { class: "media", src: dataURLtoBlobURL(b.src), alt: b.caption || "" })]), b.caption ? h("div", { class: "ak-cap" }, [b.caption]) : null]);
    } else if (b.type === "pdf") {
      inner = h("div", {}, [h("div", { class: "ak-pdf" }, [h("iframe", { src: dataURLtoBlobURL(b.src) + "#toolbar=1", title: b.caption || "PDF" })]), b.caption ? h("div", { class: "ak-cap" }, [b.caption]) : null]);
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
      inner = h("div", {}, [protoInfo, h("div", { class: "ak-wide" }, [h("iframe", { class: "media", src: b.src, allowfullscreen: "", loading: "lazy" })])]);
    } else if (b.type === "media") {
      var isAudio = (b.mime || "").indexOf("audio") === 0;
      var mEl = isAudio ? h("audio", { class: "media", src: dataURLtoBlobURL(b.src), controls: "" }) : h("video", { class: "media", src: dataURLtoBlobURL(b.src), controls: "", playsinline: "" });
      inner = h("div", {}, [isAudio ? mEl : h("div", { class: "ak-wide" }, [mEl]), b.caption ? h("div", { class: "ak-cap" }, [b.caption]) : null]);
    } else if (b.type === "model") {
      var holder = h("div", { class: "ak-3d" });
      mount3D(holder, b);
      inner = h("div", {}, [h("div", { class: "ak-wide" }, [holder]), b.caption ? h("div", { class: "ak-cap" }, [b.caption]) : null]);
    } else if (b.type === "text") {
      inner = h("div", { class: "ak-text" }, [b.heading ? h("h2", {}, [b.heading]) : null, b.body ? h("p", {}, [b.body]) : null]);
    } else inner = h("div", {}, ["Unknown block"]);

    var block = h("div", { class: "ak-block" + (admin ? " admin" : "") }, []);
    if (admin) {
      var toolbar = h("div", { class: "ak-btoolbar" }, [
        h("div", { class: "grab", html: I.dots + "<span>" + esc(typeLabel(b.type)) + "</span>" }),
        h("button", { class: "ak-tb", title: "Move up", html: I.up, onclick: function () { moveBlock(item, idx, -1, rerender); }, disabled: idx === 0 ? "" : null }),
        h("button", { class: "ak-tb", title: "Move down", html: I.down, onclick: function () { moveBlock(item, idx, 1, rerender); }, disabled: idx === item.blocks.length - 1 ? "" : null }),
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
    return block;
  }
  function typeLabel(t) { return ({ image: "Image", pdf: "PDF", prototype: "Prototype", media: "Video / Audio", model: "3D model", text: "Text" })[t] || t; }

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
      item.blocks = item.blocks.filter(function (x) { return x.id !== b.id; }); save().then(keepScroll(rerender));
      showUndoToast("Deleted " + typeLabel(b.type).toLowerCase() + " block", function () {
        if (item.blocks.indexOf(b) < 0) item.blocks.splice(Math.max(0, Math.min(idx < 0 ? item.blocks.length : idx, item.blocks.length)), 0, b);
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
    var valLabel = h("span", { style: "font-family:'Space Grotesk',sans-serif;font-weight:600;color:var(--text)" }, [orig + "px"]);
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
  function editBlock(item, b, type, rerender) {
    if (!item) return;
    rerender = rerender || renderDetail;
    type = b ? b.type : type;
    var creating = !b;
    var fields, title;
    if (type === "image") {
      title = "image"; fields = [
        { key: "src", label: "Image file", type: "file", accept: "image/*", multiple: creating, value: b ? b.src : "", hint: "PNG, JPG, GIF or WEBP. You can select multiple files to add several images at once." },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" }
      ];
    } else if (type === "pdf") {
      title = "PDF"; fields = [
        { key: "src", label: "PDF file", type: "file", accept: "application/pdf", multiple: creating, value: b ? b.src : "", hint: "Displayed in an embedded viewer. You can select multiple PDFs at once." },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" }
      ];
    } else if (type === "prototype") {
      title = "prototype"; fields = [
        { key: "raw", label: "Figma link or <iframe> embed code", type: "textarea", value: b ? b.raw : "", placeholder: "https://www.figma.com/proto/…  or  full <iframe …> code", hint: "Paste a Figma prototype share link, or any iframe embed code. To add several, put each link on its own line." },
        { key: "caption", label: "Title shown above the prototype (optional)", value: b ? b.caption : "", placeholder: "e.g. Try the FinTrack prototype", hint: "Shown as the heading on top of the prototype, on a black stage." }
      ];
    } else if (type === "media") {
      title = "video / audio"; fields = [
        { key: "src", label: "Video or audio file", type: "file", accept: "video/*,audio/*", multiple: creating, value: b ? b.src : "", hint: "MP4, WEBM, MOV, MP3, WAV… You can select multiple files at once." },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" }
      ];
    } else if (type === "model") {
      title = "3D model"; fields = [
        { key: "src", label: "3D model file", type: "file", accept: ".glb,.gltf,.obj,.fbx,model/gltf-binary,model/gltf+json", multiple: creating, value: b ? b.src : "", hint: "GLB / GLTF render fully interactive. OBJ / FBX are supported too (GLB recommended for best results). You can select multiple files at once." },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" }
      ];
    } else if (type === "text") {
      title = "text"; fields = [
        { key: "heading", label: "Heading (optional)", value: b ? b.heading : "" },
        { key: "body", label: "Body text", type: "textarea", value: b ? b.body : "", placeholder: "Write a paragraph…" }
      ];
    }
    modal({
      title: (creating ? "Add " : "Edit ") + title, fields: fields, submitLabel: creating ? "Add" : "Save",
      validate: function (v) {
        if ((type === "image" || type === "pdf" || type === "media" || type === "model") && !v.src && creating) return "Please choose a file.";
        if (type === "prototype" && !v.raw && creating) return "Please paste a link or embed code.";
        if (type === "text" && !v.body && !v.heading) return "Add a heading or some text.";
      }
    }).then(function (v) {
      if (!v) return;
      var multiFiles = v.src_files || [];
      if (creating && (type === "image" || type === "pdf" || type === "media" || type === "model") && multiFiles.length > 1) {
        multiFiles.forEach(function (fobj) {
          var nb = { id: uid(), type: type, src: fobj.data, caption: v.caption };
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
            item.blocks.push({ id: uid(), type: "prototype", raw: line, src: protoSrc(line), caption: v.caption });
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
      else if (type === "text") { block.heading = v.heading; block.body = v.body; }
      if (creating) item.blocks.push(block);
      save().then(rerender);
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
  /* ---- export: tiny JSON + media/ folder, zipped (GitHub & Vercel ready) ---- */
  function exportData() {
    save().then(function () {
      var keys = ["ui-ux", "gen-ai", "3d"];
      // Read BOTH this browser's local edits (IndexedDB) AND the currently-published JSON.
      // A page only has a local copy if it was edited on THIS device; untouched pages must
      // fall back to the published data, otherwise they'd be dropped from the export.
      Promise.all([
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
        if (!bundle[CFG.page]) bundle[CFG.page] = DATA;                      // safety net for the current page

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
        if (home.certs || home.covers) { bundle.home = home; }

        bundle = JSON.parse(JSON.stringify(bundle)); // clone — never corrupt live data

        var files = [], used = {}, seen = {}, fetches = [];
        var resumeIncluded = false;
        // include a replaced résumé PDF (admin) at media/home/ — the exact path the pages reference
        fetches.push(idbGet("ak-resume-pdf").then(function (d) {
          if (d && d.indexOf("data:") === 0) { var got = _dataURLBytes(d); files.push({ name: "media/home/Ajay-Katta-uiux-product-designer-2026.pdf", bytes: got.bytes }); resumeIncluded = true; }
        }).catch(function () {}));
        // Each asset is filed under media/<folder>/ where <folder> is the project key
        // (ui-ux | gen-ai | 3d | home). nameFor returns the path AFTER "media/".
        function nameFor(folder, base, ext) {
          base = base || "asset"; var dir = folder ? folder + "/" : "";
          var nm = dir + base + "." + ext, n = 2;
          while (used[nm]) nm = dir + base + "-" + (n++) + "." + ext;
          used[nm] = 1; return nm;
        }
        function stash(ref, folder, hintBase, hintExt) {
          if (!ref || typeof ref !== "string") return ref;
          if (ref.indexOf("data:") === 0) {                 // freshly uploaded image (inline data URL)
            if (seen[ref]) return seen[ref];
            var got = _dataURLBytes(ref);
            var path = "media/" + nameFor(folder, _slug(hintBase), _extFor(got.mime, hintExt));
            files.push({ name: path, bytes: got.bytes });
            seen[ref] = path; return path;
          }
          if (/^media\//i.test(ref)) {                      // already-published file — re-bundle AND migrate it into media/<folder>/
            if (seen[ref]) return seen[ref];
            var basename = ref.replace(/^media\//, "").replace(/^.*\//, "");
            var dot = basename.lastIndexOf("."), b = dot > 0 ? basename.slice(0, dot) : basename, e = dot > 0 ? basename.slice(dot + 1) : "bin";
            var path = "media/" + nameFor(folder, b, e);
            seen[ref] = path;
            fetches.push(fetch(ref).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (buf) { if (buf) files.push({ name: path, bytes: new Uint8Array(buf) }); }).catch(function () {}));
            return path;
          }
          return ref; // root-level file (e.g. cert-google-ux.webp) or external URL — leave untouched
        }
        function walkBlocks(blocks, folder, base) {
          (blocks || []).forEach(function (b, i) {
            if (!b || b.type === "prototype") return; // prototype src is an embed URL
            if (b.src) b.src = stash(b.src, folder, base + "-" + (b.type || "asset") + "-" + (i + 1), b.format);
          });
        }
        Object.keys(bundle).forEach(function (page) {
          if (page === "home") return; // home images handled separately below
          var d = bundle[page] || {};
          (d.items || []).forEach(function (it, i) {
            if (it.cover) it.cover = stash(it.cover, page, (_slug(it.title) || (page + "-item")) + "-cover");
            walkBlocks(it.blocks, page, _slug(it.title) || (page + "-" + i));
          });
          var cases = d.cases || {};
          Object.keys(cases).forEach(function (ck) {
            var c = cases[ck] || {};
            if (c.info && c.info.cover) c.info.cover = stash(c.info.cover, page, ck + "-cover");
            walkBlocks(c.blocks, page, ck);
          });
        });

        // stash home-page images (certificate scans + project cover photos) under media/home/
        if (bundle.home) {
          (bundle.home.certs || []).forEach(function (c, i) {
            if (c && c.img) c.img = stash(c.img, "home", "certificate-" + (_slug(c.title) || (i + 1)));
          });
          if (bundle.home.covers) Object.keys(bundle.home.covers).forEach(function (k) {
            bundle.home.covers[k] = stash(bundle.home.covers[k], "home", k + "-cover");
          });
        }

        Promise.all(fetches).then(function () {
          var mediaCount = files.length; // media only — JSON not added yet
          function counts(obj) { var o = { total: 0 }; keys.forEach(function (k) { var n = (obj && obj[k] && obj[k].items) ? obj[k].items.length : 0; o[k] = n; o.total += n; }); return o; }
          var nowC = counts(bundle);
          function proceed() {
            files.unshift({ name: "portfolio-data.json", bytes: new TextEncoder().encode(JSON.stringify(bundle, null, 2)) });
            var zip = makeZip(files);
            var a = h("a", { href: URL.createObjectURL(zip), download: "portfolio-site-data.zip" });
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () {
              var ov2 = h("div", { class: "ak-ov" });
              function close2() { ov2.remove(); }
              ov2.appendChild(h("div", { class: "ak-modal", style: "width:min(480px,100%)" }, [
                h("h3", {}, ["Export complete \u2713"]),
                h("div", { class: "sub" }, ["portfolio-site-data.zip is downloading."]),
                h("div", { class: "ak-xsec" }, ["Inside the ZIP"]),
                h("div", { class: "ak-xrows" }, [
                  h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["portfolio-data.json"]), h("span", { class: "v" }, ["your content"])]),
                  h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, ["media/"]), h("span", { class: "v" }, [mediaCount + " file" + (mediaCount === 1 ? "" : "s")])])
                ]),
                h("div", { class: "ak-xsec" }, ["To publish"]),
                h("ol", { class: "ak-xsteps" }, [
                  h("li", {}, ["Unzip it."]),
                  h("li", {}, ["Copy portfolio-data.json AND the media folder into your site repo, next to your HTML pages \u2014 replace the old ones."]),
                  h("li", {}, ["Push to GitHub. Vercel redeploys automatically."])
                ]),
                h("div", { class: "ak-acts" }, [
                  h("button", { class: "ak-btn", onclick: close2 }, ["Done"])
                ])
              ]));
              ov2.addEventListener("click", function (e) { if (e.target === ov2) close2(); });
              document.body.appendChild(ov2);
            }, 200);
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
            function row(k, v) { return h("div", { class: "ak-xrow" }, [h("span", { class: "k" }, [k]), h("span", { class: "v" }, [String(v)])]); }
            var ov = h("div", { class: "ak-ov" });
            function close() { ov.remove(); }
            ov.appendChild(h("div", { class: "ak-modal", style: "width:min(480px,100%)" }, [
              h("h3", {}, ["Export site data"]),
              h("div", { class: "sub" }, ["This ZIP replaces all content on your live site."]),
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
                row("R\u00e9sum\u00e9 PDF", resumeIncluded ? "Updated \u2014 in ZIP" : "Unchanged")
              ]),
              h("div", { class: "ak-xsec" }, ["Bundle"]),
              h("div", { class: "ak-xrows" }, [row("Media files", mediaCount)]),
              warn.length ? h("div", { class: "ak-xwarn" }, [
                h("strong", {}, ["\u26A0 This export has FEWER projects than your live site."]),
                h("div", { style: "margin-top:6px" }, warn.map(function (w) { return h("div", {}, ["\u2022 " + w]); })),
                h("div", { style: "margin-top:6px" }, ["Publishing it will DELETE those missing projects."])
              ]) : null,
              h("div", { class: "ak-acts" }, [
                h("button", { class: "ak-btn ghost", onclick: close }, ["Cancel"]),
                h("button", { class: "ak-btn" + (warn.length ? " danger" : ""), onclick: function () { close(); proceed(); } }, [warn.length ? "Export anyway" : "Export ZIP"])
              ])
            ]));
            ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
            document.body.appendChild(ov);
          });
        });
      });
    });
  }
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
