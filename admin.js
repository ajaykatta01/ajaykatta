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
  var PW_KEY = "ak-admin-pw";            // shared SHA-256 password hash (all pages)
  var SESSION_KEY = "ak-admin-unlocked"; // session unlock flag (all pages)

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

  function load() {
    return idbGet("data:" + CFG.page).then(function (local) {
      if (local && local.items) { DATA = local; return; }
      // fall back to a published bundle if one is hosted next to the page
      return fetch("portfolio-data.json", { cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (pub) { if (pub && pub[CFG.page] && pub[CFG.page].items) DATA = pub[CFG.page]; })
        .catch(function () {});
    });
  }
  function save() { return idbSet("data:" + CFG.page, DATA); }

  /* ============================================================ STYLES */
  function injectCSS() {
    document.head.appendChild(h("style", { html: `
    .ak-btn{display:inline-flex;align-items:center;gap:7px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.86rem;
      color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-2));border:none;border-radius:99px;padding:8px 15px;cursor:pointer;transition:.2s;white-space:nowrap}
    .ak-btn:hover{filter:brightness(1.08);transform:translateY(-1px)}
    .ak-btn.ghost{background:var(--surface);color:var(--text);border:1px solid var(--line)}
    .ak-btn.ghost:hover{border-color:var(--accent);color:var(--accent);filter:none}
    .ak-btn.danger{background:linear-gradient(135deg,#ef4444,#f87171)}
    .ak-btn svg{width:15px;height:15px;flex:none}
    .ak-wrap{position:relative}
    .ak-menu{position:fixed;right:20px;top:62px;min-width:240px;background:var(--surface);border:1px solid var(--line);
      border-radius:14px;padding:7px;box-shadow:0 24px 60px -28px rgba(0,0,0,.6),0 0 0 1px color-mix(in srgb,var(--accent) 10%,transparent);
      z-index:250;display:none;flex-direction:column;gap:2px}
    .ak-menu.on{display:flex;animation:akpop .18s ease}
    @keyframes akpop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
    .ak-mi{display:flex;align-items:center;gap:11px;font-family:'Space Grotesk',sans-serif;font-weight:500;font-size:.9rem;color:var(--text);
      background:none;border:none;text-align:left;padding:10px 12px;border-radius:9px;cursor:pointer;transition:.15s;width:100%}
    .ak-mi:hover{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--accent)}
    .ak-mi .ico{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex:none;
      background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent)}
    .ak-mi .ico svg{width:15px;height:15px}
    .ak-mi.warn:hover{background:color-mix(in srgb,#ef4444 14%,transparent);color:#ef4444}
    .ak-mi.warn .ico{background:color-mix(in srgb,#ef4444 14%,transparent);color:#ef4444}
    .ak-sep{height:1px;background:var(--line);margin:5px 8px}
    .ak-label{font-family:'Space Mono',monospace;font-size:.58rem;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);padding:8px 12px 3px}
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

    /* detail overlay */
    .ak-detail{position:relative;z-index:1;background:var(--bg);animation:akfade .25s ease}
    body.ak-item-detail .index-view,body.ak-item-detail .cs-detail{display:none!important}
    body.ak-item-detail .phead,body.ak-item-detail .phead ~ section:has(> .pgrid){display:none!important}
    body.ak-item-detail .nav-right .home,body.ak-item-detail .nav-right .ak-wrap,body.ak-item-detail .nav-right .theme-toggle{display:none}
    .ak-item-actions{display:flex;align-items:center;gap:9px}
    .ak-d-bar{position:sticky;top:0;z-index:40;border-bottom:1px solid var(--line);
      background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:blur(14px);
      transition:transform .35s cubic-bezier(.2,.7,.3,1),opacity .35s}
    .ak-d-bar.ak-bar-hidden{transform:translateY(calc(-100% - 90px));opacity:0;pointer-events:none}
    .ak-d-bar .inner{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:8px 28px;max-width:1180px;margin:0 auto}
    .ak-d-bar .title{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:1rem;color:var(--text)}
    .ak-d-bar .tabbar{display:inline-flex;gap:5px;padding:5px;border:1px solid var(--line);border-radius:99px;background:color-mix(in srgb,var(--surface) 60%,transparent);backdrop-filter:blur(8px);overflow-x:auto;max-width:100%}
    .ak-d-bar .tab{font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.88rem;color:var(--muted);padding:7px 16px;border-radius:99px;border:none;background:none;cursor:pointer;transition:.3s;white-space:nowrap}
    .ak-d-bar .tab:hover{color:var(--text)}
    .ak-d-bar .tab.active{color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-2))}
    .ak-d-bar .cs-back{display:inline-flex;align-items:center;gap:8px;font-family:'Space Grotesk',sans-serif;font-weight:600;font-size:.88rem;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:99px;padding:7px 15px;cursor:pointer;transition:.25s;white-space:nowrap}
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
    .ak-3d{width:100%;height:min(70vh,620px);border-radius:12px;border:1px solid var(--line);background:
      radial-gradient(120% 120% at 50% 0%,color-mix(in srgb,var(--accent) 12%,var(--surface)),var(--surface));overflow:hidden;position:relative}
    .ak-3d model-viewer,.ak-3d canvas{width:100%;height:100%;display:block}
    .ak-3d .fallback{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;color:var(--muted)}

    /* tile admin controls */
    .ak-tile-ctl{position:absolute;top:10px;right:10px;z-index:6;display:none;gap:6px}
    body.ak-on .ak-tile-ctl{display:flex}
    .ptile[data-ak-item]{cursor:pointer}
    .ak-fab{position:fixed;right:22px;bottom:22px;z-index:115}
    @media(max-width:640px){.ak-menu{position:fixed;left:12px;right:12px;top:64px;min-width:0}}

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
          var fi = h("input", { type: "file", accept: f.accept || "", style: "display:none" });
          var removeBtn = f.removable ? h("button", { type: "button", class: "ak-file-remove", style: f.value ? "" : "display:none" }, ["\u2715 Remove"]) : null;
          fi.addEventListener("change", function () {
            var file = fi.files[0]; if (!file) return;
            label.textContent = "Loading " + file.name + "…";
            readFileAsDataURL(file).then(function (d) { fieldEls[f.key]._data = d; fieldEls[f.key]._name = file.name; label.classList.add("has"); label.textContent = "✓ " + file.name; if (removeBtn) removeBtn.style.display = ""; });
          });
          if (removeBtn) removeBtn.addEventListener("click", function () {
            fieldEls[f.key]._data = ""; fieldEls[f.key]._name = ""; try { fi.value = ""; } catch (e) {}
            label.classList.remove("has"); label.textContent = f.placeholder || "Click to choose a file";
            removeBtn.style.display = "none";
          });
          holder = h("div", {}, [label, fi, removeBtn]);
          label.addEventListener("click", function () { fi.click(); });
          input = { _holder: holder, _data: f.value || "", _name: f.name || "" };
          fieldEls[f.key] = input;
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
          if (f.type === "file") out[f.key] = el._data, out[f.key + "_name"] = el._name;
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
        if (hash === localStorage.getItem(PW_KEY)) { sessionStorage.setItem(SESSION_KEY, "1"); UNLOCKED = true; return true; }
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
        if (cur !== localStorage.getItem(PW_KEY)) { alert("Current password is incorrect."); return; }
        return sha256(v.p1).then(function (nh) { localStorage.setItem(PW_KEY, nh); alert("Password updated."); });
      });
    });
  }
  function requestUnlock() {
    if (!localStorage.getItem(PW_KEY)) return setupPassword();
    if (!isUnlocked()) return login();
    return Promise.resolve(true);
  }

  /* ============================================================ HEADER UI */
  var menuEl, btnEl;
  function buildHeaderButton() {
    var navRight = $(".nav-right") || $(".nav");
    var wrap = h("div", { class: "ak-wrap" });
    btnEl = h("button", { class: "ak-btn", html: I.cog + "<span>Admin</span>" });
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
    if (btnEl) btnEl.querySelector("span").textContent = isUnlocked() ? "Admin ●" : "Admin";
    renderTiles(); renderCases(); if (openItemId) renderDetail();
  }

  /* ============================================================ TILES (index) */
  function tileGrid() { return $(CFG.gridSelector); }
  function renderTiles() {
    var grid = tileGrid(); if (!grid) return;
    grid.querySelectorAll("[data-ak-item]").forEach(function (n) { n.remove(); });
    DATA.items.forEach(function (it) {
      var coverStyle = it.cover
        ? "background:url('" + dataURLtoBlobURL(it.cover) + "') center/cover no-repeat"
        : "";
      var ctl = h("div", { class: "ak-tile-ctl" }, [
        h("button", { class: "ak-tb", title: "Edit", html: I.edit, onclick: function (e) { e.stopPropagation(); editItem(it); } }),
        h("button", { class: "ak-tb warn", title: "Delete", html: I.trash, onclick: function (e) { e.stopPropagation(); deleteItem(it); } })
      ]);
      var tile = h(CFG.tileTag, { class: "ptile", "data-ak-item": it.id, style: "opacity:1;transform:none" }, [
        ctl,
        h("div", { class: "ptile-img", role: "img", style: coverStyle }, [h("span", { class: "ph-label" }, [it.label || it.tag || CFG.noun])]),
        h("div", { class: "ptile-body" }, [
          h("span", { class: "ptile-tag" }, [it.tag || "Project"]),
          h("h3", {}, [it.title || "Untitled"]),
          h("span", { class: "ptile-link" }, ["Open project ", h("span", { class: "arr" }, ["\u2192"])])
        ])
      ]);
      tile.addEventListener("click", function () { openDetail(it.id); });
      grid.appendChild(tile);
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
    DATA.items.forEach(function (it) {
      var tab = h("button", { class: "tab" + (openItemId === it.id ? " active" : ""), role: "tab", "data-ak-item-tab": it.id,
        onclick: function () { openDetail(it.id); } }, [it.title || "Untitled"]);
      tabbar.appendChild(tab);
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
        h("button", { class: "ak-btn", html: I.cog + "<span>Admin</span>",
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
      { key: "cover", label: "Cover image", type: "file", accept: "image/*", removable: true, value: (caseStore(key).info || {}).cover || "", hint: "Optional. Shown on the project card and the detail hero." }
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
        { key: "cover", label: "Cover image", type: "file", accept: "image/*", removable: true, value: it ? it.cover : "", hint: "Optional. Shown on the tile and detail hero." },
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
        DATA.items.push(item);
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
          h("button", { class: "ak-btn", html: I.cog + "<span>Admin</span>",
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
    builtinTabs().forEach(function (b) {
      strip.appendChild(h("button", { class: "tab", onclick: function () { closeDetail(); if (window.openCase) window.openCase(b.key); } }, [b.label]));
    });
    DATA.items.forEach(function (x) {
      strip.appendChild(h("button", { class: "tab" + (x.id === it.id ? " active" : ""), onclick: function () { if (x.id !== it.id) openDetail(x.id); } }, [x.title || "Untitled"]));
    });
    var plural = CFG.noun === "case study" ? "case studies" : CFG.noun + "s";
    var bar = h("div", { class: "ak-d-bar" }, [ h("div", { class: "inner" }, [
      h("button", { class: "cs-back", onclick: closeDetail, html: '<span class="arr">&larr;</span> All ' + plural }),
      strip
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
      inner = h("div", {}, [holder, b.caption ? h("div", { class: "ak-cap" }, [b.caption]) : null]);
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

  function moveBlock(item, idx, dir, rerender) {
    rerender = rerender || renderDetail;
    var j = idx + dir; if (j < 0 || j >= item.blocks.length) return;
    var a = item.blocks; var t = a[idx]; a[idx] = a[j]; a[j] = t;
    save().then(rerender);
  }
  function reorderBlock(item, from, to, rerender) {
    rerender = rerender || renderDetail;
    var a = item.blocks; var moved = a.splice(from, 1)[0]; a.splice(to, 0, moved);
    save().then(rerender);
  }
  function deleteBlock(item, b, rerender) {
    rerender = rerender || renderDetail;
    confirmModal("Delete this " + typeLabel(b.type).toLowerCase() + " block?", "", true).then(function (ok) {
      if (!ok) return;
      var idx = item.blocks.indexOf(b);
      item.blocks = item.blocks.filter(function (x) { return x.id !== b.id; }); save().then(rerender);
      showUndoToast("Deleted " + typeLabel(b.type).toLowerCase() + " block", function () {
        if (item.blocks.indexOf(b) < 0) item.blocks.splice(Math.max(0, Math.min(idx < 0 ? item.blocks.length : idx, item.blocks.length)), 0, b);
        save().then(rerender);
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
    var colorInput = h("input", { type: "color", value: seed, style: "width:54px;height:42px;border:1px solid var(--line);background:none;cursor:pointer;border-radius:9px;padding:2px" });
    var hexInput = h("input", { type: "text", value: orig, placeholder: "#11131c or any CSS color", style: "flex:1" });
    colorInput.addEventListener("input", function () { hexInput.value = colorInput.value; applyLive(colorInput.value); });
    hexInput.addEventListener("input", function () { var hv = hexInput.value.trim(); applyLive(hv); if (/^#[0-9a-f]{6}$/i.test(hv)) colorInput.value = hv; });
    var swatches = h("div", { style: "display:flex;flex-wrap:wrap;gap:8px" }, presets.map(function (col) {
      return h("button", { type: "button", title: col, style: "width:32px;height:32px;border-radius:9px;border:1px solid var(--line);cursor:pointer;background:" + col,
        onclick: function () { hexInput.value = col; colorInput.value = col; applyLive(col); } });
    }));
    var where = openCaseKey ? "case study" : CFG.noun;
    var m = h("div", { class: "ak-modal", style: "width:min(460px,100%)" }, [
      h("h3", {}, ["Background color"]),
      h("div", { class: "sub" }, ["Set the content background of this " + where + " so uploaded files blend in. The cover area and footer keep the theme color. Updates live as you pick."]),
      h("div", { class: "ak-field" }, [h("label", {}, ["Pick a color"]), h("div", { style: "display:flex;gap:10px;align-items:center" }, [colorInput, hexInput])]),
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
        { key: "src", label: "Image file", type: "file", accept: "image/*", value: b ? b.src : "", hint: "PNG, JPG, GIF or WEBP." },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" }
      ];
    } else if (type === "pdf") {
      title = "PDF"; fields = [
        { key: "src", label: "PDF file", type: "file", accept: "application/pdf", value: b ? b.src : "", hint: "Displayed in an embedded viewer." },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" }
      ];
    } else if (type === "prototype") {
      title = "prototype"; fields = [
        { key: "raw", label: "Figma link or <iframe> embed code", type: "textarea", value: b ? b.raw : "", placeholder: "https://www.figma.com/proto/…  or  full <iframe …> code", hint: "Paste a Figma prototype share link, or any iframe embed code." },
        { key: "caption", label: "Title shown above the prototype (optional)", value: b ? b.caption : "", placeholder: "e.g. Try the FinTrack prototype", hint: "Shown as the heading on top of the prototype, on a black stage." }
      ];
    } else if (type === "media") {
      title = "video / audio"; fields = [
        { key: "src", label: "Video or audio file", type: "file", accept: "video/*,audio/*", value: b ? b.src : "", hint: "MP4, WEBM, MOV, MP3, WAV…" },
        { key: "caption", label: "Caption (optional)", value: b ? b.caption : "" }
      ];
    } else if (type === "model") {
      title = "3D model"; fields = [
        { key: "src", label: "3D model file", type: "file", accept: ".glb,.gltf,.obj,.fbx,model/gltf-binary,model/gltf+json", value: b ? b.src : "", hint: "GLB / GLTF render fully interactive. OBJ / FBX are supported too (GLB recommended for best results)." },
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
    var m = raw.match(/src="([^"]+)"/i); if (m) return m[1];
    if (/figma\.com/i.test(raw)) { var u = "https://www.figma.com/embed?embed_host=share&url=" + encodeURIComponent(raw); return u; }
    return raw;
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
        mv.setAttribute("shadow-intensity", "1"); mv.setAttribute("exposure", "1"); mv.setAttribute("ar", "");
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
      Promise.all(keys.map(function (k) { return idbGet("data:" + k); })).then(function (vals) {
        var bundle = {};
        keys.forEach(function (k, i) { if (vals[i]) bundle[k] = vals[i]; });
        if (!bundle[CFG.page]) bundle[CFG.page] = DATA;
        bundle = JSON.parse(JSON.stringify(bundle)); // clone — never corrupt live data

        var files = [], used = {}, seen = {}, fetches = [];
        function nameFor(base, ext) { base = base || "asset"; var nm = base + "." + ext, n = 2; while (used[nm]) nm = base + "-" + (n++) + "." + ext; used[nm] = 1; return nm; }
        function stash(ref, hintBase, hintExt) {
          if (!ref || typeof ref !== "string") return ref;
          if (ref.indexOf("data:") === 0) {
            if (seen[ref]) return seen[ref];
            var got = _dataURLBytes(ref);
            var path = "media/" + nameFor(_slug(hintBase), _extFor(got.mime, hintExt));
            files.push({ name: path, bytes: got.bytes });
            seen[ref] = path; return path;
          }
          if (/^media\//i.test(ref)) { // already-published file — re-bundle its bytes so re-exports stay complete
            if (!seen[ref]) {
              seen[ref] = ref; used[ref.replace(/^media\//, "")] = 1;
              fetches.push(fetch(ref).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (buf) { if (buf) files.push({ name: ref, bytes: new Uint8Array(buf) }); }).catch(function () {}));
            }
            return ref;
          }
          return ref; // external URL (figma / http) — leave untouched
        }
        function walkBlocks(blocks, base) {
          (blocks || []).forEach(function (b, i) {
            if (!b || b.type === "prototype") return; // prototype src is an embed URL
            if (b.src) b.src = stash(b.src, base + "-" + (b.type || "asset") + "-" + (i + 1), b.format);
          });
        }
        Object.keys(bundle).forEach(function (page) {
          var d = bundle[page] || {};
          (d.items || []).forEach(function (it, i) {
            if (it.cover) it.cover = stash(it.cover, (_slug(it.title) || (page + "-item")) + "-cover");
            walkBlocks(it.blocks, _slug(it.title) || (page + "-" + i));
          });
          var cases = d.cases || {};
          Object.keys(cases).forEach(function (ck) {
            var c = cases[ck] || {};
            if (c.info && c.info.cover) c.info.cover = stash(c.info.cover, ck + "-cover");
            walkBlocks(c.blocks, ck);
          });
        });

        Promise.all(fetches).then(function () {
          files.unshift({ name: "portfolio-data.json", bytes: new TextEncoder().encode(JSON.stringify(bundle, null, 2)) });
          var zip = makeZip(files);
          var a = h("a", { href: URL.createObjectURL(zip), download: "portfolio-site-data.zip" });
          document.body.appendChild(a); a.click(); a.remove();
          var mediaCount = files.length - 1;
          setTimeout(function () {
            alert("Exported portfolio-site-data.zip\n\nInside:\n  \u2022 portfolio-data.json  (your content \u2014 now tiny)\n  \u2022 media/  (" + mediaCount + " file" + (mediaCount === 1 ? "" : "s") + ")\n\nTo publish:\n1. Unzip it.\n2. Copy portfolio-data.json AND the media folder into your site repo, next to your HTML pages \u2014 replace the old ones.\n3. Push to GitHub. Vercel redeploys automatically.");
          }, 200);
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
  function init() {
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
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
