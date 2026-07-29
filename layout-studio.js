/* ============================================================================
   Ajay Katta Portfolio — Layout Studio
   ----------------------------------------------------------------------------
   Freeform themed-canvas builder used by admin.js ("canvas" blocks).
   Editor is structured like a desktop design app (Figma / Photoshop):
   • Top bar — insert tools, undo/redo, grid, zoom controls, save.
   • Left — Layers panel (click to select, drag to reorder z-order).
   • Center — zoomable canvas (Ctrl+scroll, Ctrl +/− /0/1) with smart guides,
     12-column layout grid and 8px baseline snapping.
   • Gap rulers (Photoshop-style): dragging, scaling or nudging a layer shows its
     pixel gap to the nearest neighbour on all four sides (pink) AND the gap that
     neighbouring pair already keeps to ITS neighbour (blue dashed, "ref") — so a
     top↔middle spacing can be replicated between middle↔bottom. Both readouts
     turn green when the gaps match, and the equal-gap magnet snaps them flush.
     Hold Alt/Option to measure a selected layer without moving it.
   • Right — inspector: position/size, appearance, fill, stroke, layer ops,
     content (text / image / video / audio / PDF / 3D / prototype embed).
   • Bottom — status bar (canvas size, grid state, zoom).
   Design is stored in the block as {h, bg, layout, els:[…]} at a fixed 1200-unit
   design width and rendered responsively (scaled) for visitors.
   BENTO LAYOUT — two options, toggled in the top bar and saved on design.layout:
   • "canvas" (default) — the freeform bento boxes exactly as placed.
   • "grid"             — the same cards reflowed into ONE vertical column, each
                          full width at full size (image / video / prototype /
                          PDF / 3D) in reading order, title beneath. Nothing is
                          destroyed: positions/sizes stay, switch back any time.
                          Options: design.gridGap (row gap), design.gridCaps.
   Exposes: window.AKLayout = { openEditor(opts), render(holder, design) }
============================================================================ */
(function () {
  "use strict";
  if (window.AKLayout) return;
  var DW = 1200; // design width in units

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
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function copy(o) { return JSON.parse(JSON.stringify(o)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  var _loaded = {};
  function loadScript(src, type) {
    if (_loaded[src]) return _loaded[src];
    _loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; if (type) s.type = type;
      s.onload = res; s.onerror = function () { rej(new Error("load " + src)); };
      document.head.appendChild(s);
    });
    return _loaded[src];
  }
  function protoSrc(raw) {
    raw = String(raw || "").trim();
    var m = raw.match(/src="([^"]+)"/i); var src = m ? m[1] : raw;
    try {
      var u = new URL(src); var host = u.hostname.replace(/^www\./, "");
      if (host === "figma.com" || host === "embed.figma.com") {
        u.protocol = "https:"; u.hostname = "embed.figma.com";
        if (!u.searchParams.has("embed-host")) u.searchParams.set("embed-host", "share");
        return u.toString();
      }
    } catch (e) {}
    return src;
  }
  /* ---- file facts (real pixel size + weight) shown to viewers ---- */
  function fmtBytes(n) {
    if (!n && n !== 0) return "";
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + " KB";
    return (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + " MB";
  }
  function srcKind(src, mime) {
    var m = String(mime || ""), u = String(src || "").split("?")[0];
    /* data: URLs carry their own type — read it before falling back to extensions */
    if (!m && u.indexOf("data:") === 0) m = u.slice(5, (u.indexOf(";") + 1 || u.indexOf(",") + 1) - 1) || "";
    if (u.indexOf("data:") === 0) u = "";
    if (/^video\//.test(m) || /\.(mp4|webm|mov|m4v|ogv)$/i.test(u)) return "video";
    if (/pdf/.test(m) || /\.pdf$/i.test(u)) return "pdf";
    if (/^audio\//.test(m) || /\.(mp3|wav|m4a)$/i.test(u)) return "audio";
    if (/(gltf|glb)/.test(m) || /\.(glb|gltf)$/i.test(u)) return "model";
    if (/^image\//.test(m) || /\.(png|jpe?g|webp|gif|avif|svg)$/i.test(u)) return "image";
    return "file";
  }
  function srcLabel(src, mime) {
    var raw = String(mime || "");
    var u = String(src || "").split("?")[0];
    if (!raw && u.indexOf("data:") === 0) raw = u.slice(5, (u.indexOf(";") + 1 || u.indexOf(",") + 1) - 1) || "";
    var m = raw.split("/")[1] || (u.indexOf("data:") === 0 ? "" : (u.split(".").pop() || ""));
    m = m.split("+")[0];
    return m && m.length <= 5 ? m.toUpperCase() : srcKind(src, mime).toUpperCase();
  }
  function srcBytes(src, cb) {
    if (!src) return cb(0);
    if (src.indexOf("data:") === 0) {
      var i = src.indexOf(","), b = src.slice(i + 1);
      if (src.slice(0, i).indexOf(";base64") < 0) return cb(b.length);
      var pad = b.slice(-2) === "==" ? 2 : (b.slice(-1) === "=" ? 1 : 0);
      return cb(Math.max(0, Math.floor(b.length * 3 / 4) - pad));
    }
    try { fetch(src, { method: "HEAD" }).then(function (r) { cb(parseInt(r.headers.get("content-length"), 10) || 0); }).catch(function () { cb(0); }); }
    catch (e) { cb(0); }
  }
  /* cb({dims:"1920 × 1080", bytes, label}) — dims resolve async off the real file */
  function fileFacts(src, mime, cb) {
    var kind = srcKind(src, mime), out = { dims: "", bytes: null, label: srcLabel(src, mime), kind: kind, w: 0, h: 0 };
    /* reserve every slot BEFORE any lookup starts — data: URLs answer synchronously */
    var done = 0, need = 1 + (kind === "image" || kind === "video" ? 1 : 0);
    function fire() { if (--need <= 0 && !done) { done = 1; cb(out); } }
    srcBytes(src, function (n) { out.bytes = n; fire(); });
    if (kind === "image") {
      var im = new Image();
      im.onload = function () { out.w = im.naturalWidth; out.h = im.naturalHeight; out.dims = im.naturalWidth + " \u00D7 " + im.naturalHeight; fire(); };
      im.onerror = fire; im.src = blobURL(src);
    } else if (kind === "video") {
      var v = document.createElement("video"); v.preload = "metadata"; v.muted = true;
      v.onloadedmetadata = function () {
        out.w = v.videoWidth; out.h = v.videoHeight;
        out.dims = v.videoWidth + " \u00D7 " + v.videoHeight;
        if (v.duration && isFinite(v.duration)) out.dur = Math.floor(v.duration / 60) + ":" + String(Math.round(v.duration % 60)).padStart(2, "0");
        fire();
      };
      v.onerror = fire; v.src = blobURL(src);
    }
  }
  function factsText(f) {
    return [f.dims, f.dur, fmtBytes(f.bytes), f.label].filter(Boolean).join("  \u00B7  ");
  }
  var _blobCache = {};
  function blobURL(d) {
    if (!d || d.indexOf("data:") !== 0) return d;
    if (_blobCache[d]) return _blobCache[d];
    try {
      var p = d.split(","), mime = p[0].match(/:(.*?);/)[1], bin = atob(p[1]);
      var arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var url = URL.createObjectURL(new Blob([arr], { type: mime })); _blobCache[d] = url; return url;
    } catch (e) { return d; }
  }
  function pickFile(accept, cb) {
    var i = h("input", { type: "file", accept: accept, style: "display:none" });
    i.addEventListener("change", function () {
      var f = i.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () { cb(r.result, f.name); };
      r.readAsDataURL(f);
    });
    document.body.appendChild(i); i.click();
    setTimeout(function () { i.remove(); }, 120000);
  }

  /* ============================================================ CSS */
  var cssDone = false;
  function injectCSS() {
    if (cssDone) return; cssDone = true;
    document.head.appendChild(h("style", { html: `
    /* ---- viewer (visitor-facing) ---- */
    .akls-view{position:relative;width:100%;overflow:hidden}
    .akls-stage{position:relative;transform-origin:0 0}
    .akls-el{position:absolute;box-sizing:border-box}
    /* ---- GRID MODE viewer: the same tiles reflowed into one vertical, full-width column ---- */
    .akls-gridview{position:relative;width:100%;box-sizing:border-box;padding:26px 0 42px}
    .akls-gcol{display:flex;flex-direction:column;gap:var(--ggap,34px);width:100%;margin:0 auto;padding:0;box-sizing:border-box;container-type:inline-size}
    .akls-gitem{display:flex;flex-direction:column;gap:11px;min-width:0}
    .akls-gcard{position:relative;overflow:hidden;box-sizing:border-box;isolation:isolate}
    .akls-gcard>img,.akls-gcard>video{width:100%;height:auto;display:block}
    .akls-gmedia{position:relative;width:100%}
    .akls-gmedia>*{position:absolute;inset:0;width:100%;height:100%}
    .akls-gcap{display:flex;flex-direction:column;gap:5px;padding:0 3px}
    .akls-geye{font:700 9.5px 'Inter',sans-serif;letter-spacing:.15em;text-transform:uppercase;color:var(--ac,var(--accent,#E5783A))}
    .akls-gttl{font:600 17px/1.34 'Inter',sans-serif;letter-spacing:-.012em;color:var(--tx,var(--text,#fff));text-wrap:pretty}
    .akls-gph{display:flex;align-items:center;justify-content:center;width:100%;min-height:200px;text-align:center;padding:20px;
      font:600 11.5px 'Inter',sans-serif;letter-spacing:.02em;color:var(--mut,var(--muted,#9C9891))}
    .akls-gempty{padding:52px 14px;text-align:center;font:500 12.5px/1.7 'Inter',sans-serif;color:var(--mut,var(--muted,#9C9891))}
    @media(max-width:640px){.akls-gcol{gap:22px}.akls-gttl{font-size:15px}}
    /* grid-mode preview inside the editor */
    .akls-gprev{position:relative;margin:30px auto 60px;max-width:1200px;border-radius:16px;overflow:hidden;
      box-shadow:0 0 0 1px color-mix(in srgb,var(--ln) 90%,transparent),0 30px 80px -34px rgba(0,0,0,.6)}
    /* ---- editor shell: floating premium workspace ---- */
    .akls-ov{position:fixed;inset:0;z-index:340;display:flex;flex-direction:column;user-select:none;color-scheme:dark;
      --pnl:var(--surface,#1D1C1A);--ln:var(--line,#373634);--tx:var(--text,#fff);--mut:var(--muted,#9C9891);--ac:var(--accent,#E5783A);
      --glass:color-mix(in srgb,var(--pnl) 88%,transparent);
      --shdw:0 20px 55px -20px rgba(0,0,0,.55),0 2px 12px -6px rgba(0,0,0,.3);
      background:color-mix(in srgb,var(--bg,#141311) 93%,#000);color:var(--tx);font-family:'Inter',system-ui,sans-serif;font-size:12px}
    [data-theme="light"] .akls-ov{color-scheme:light;--shdw:0 20px 48px -20px rgba(28,26,20,.22),0 2px 12px -6px rgba(28,26,20,.1)}
    .akls-ov *{box-sizing:border-box}
    .akls-ov ::-webkit-scrollbar{width:9px;height:9px}
    .akls-ov ::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--tx) 15%,transparent);border-radius:99px}
    .akls-ov ::-webkit-scrollbar-track,.akls-ov ::-webkit-scrollbar-corner{background:transparent}
    .akls-ov .akls-el > *{pointer-events:none}
    .akls-ov .akls-el{cursor:grab}
    .akls-ov .akls-el.akls-dragging{cursor:grabbing}
    /* custom tooltips */
    .akls-ov [data-tip]{position:relative}
    .akls-ov [data-tip]::after{content:attr(data-tip);position:absolute;left:50%;bottom:calc(100% + 10px);transform:translate(-50%,4px);
      background:color-mix(in srgb,var(--tx) 95%,transparent);color:color-mix(in srgb,var(--bg,#141311) 96%,#000);
      font:600 10.5px/1 'Inter',sans-serif;letter-spacing:.01em;padding:6px 9px;border-radius:7px;white-space:pre;
      opacity:0;pointer-events:none;transition:opacity .15s ease,transform .15s ease;z-index:80;box-shadow:0 8px 22px -8px rgba(0,0,0,.45)}
    .akls-ov [data-tip]:hover::after{opacity:1;transform:translate(-50%,0);transition-delay:.4s}
    .akls-top [data-tip]::after{bottom:auto;top:calc(100% + 10px);transform:translate(-50%,-4px)}
    .akls-top [data-tip]:hover::after{transform:translate(-50%,0)}
    /* top bar */
    .akls-top{flex:none;display:flex;align-items:center;gap:8px;height:54px;padding:0 14px 0 16px;position:relative;z-index:50;
      background:var(--glass);-webkit-backdrop-filter:blur(20px) saturate(1.15);backdrop-filter:blur(20px) saturate(1.15);
      border-bottom:1px solid var(--ln);animation:aklsFade .3s ease both}
    .akls-top .ttl{display:flex;align-items:center;gap:11px;font-family:'Inter',sans-serif;font-weight:600;font-size:13.5px;letter-spacing:-.01em;white-space:nowrap;margin-right:6px}
    .akls-top .ttl .lg{display:grid;place-items:center;width:29px;height:29px;border-radius:9px;color:#fff;
      background:linear-gradient(135deg,var(--ac),var(--accent-2,#C2410C));box-shadow:0 5px 14px -5px color-mix(in srgb,var(--ac) 70%,transparent)}
    .akls-top .ttl .lg svg{width:15px;height:15px}
    .akls-top .sp{flex:1}
    .akls-vsep{flex:none;width:1px;height:22px;background:var(--ln);margin:0 4px}
    /* icon buttons */
    .akls-ib{flex:none;width:32px;height:32px;display:inline-grid;place-items:center;background:none;border:none;border-radius:9px;padding:0;cursor:pointer;
      color:color-mix(in srgb,var(--tx) 80%,transparent);transition:background .12s ease,color .12s ease,transform .08s ease}
    .akls-ib:hover{background:color-mix(in srgb,var(--tx) 7%,transparent);color:var(--tx)}
    .akls-ib:active{transform:scale(.92)}
    .akls-ib:disabled{opacity:.26;pointer-events:none}
    .akls-ib.on{color:var(--ac);background:color-mix(in srgb,var(--ac) 15%,transparent)}
    .akls-ib svg{width:17px;height:17px}
    /* zoom pill */
    .akls-zoom{flex:none;display:flex;align-items:center;gap:2px;border:1px solid var(--ln);border-radius:10px;padding:2px;background:color-mix(in srgb,var(--tx) 3%,transparent)}
    .akls-zoom .akls-ib{width:26px;height:26px;border-radius:8px}
    .akls-zoom .akls-ib svg{width:14px;height:14px}
    .akls-zoom .zl{min-width:50px;height:26px;border:none;background:none;color:var(--mut);cursor:pointer;font:600 11px 'Inter',sans-serif;font-variant-numeric:tabular-nums;border-radius:8px;padding:0 4px}
    .akls-zoom .zl:hover{color:var(--tx);background:color-mix(in srgb,var(--tx) 7%,transparent)}
    /* buttons */
    .akls-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:7px;height:33px;padding:0 16px;font-family:'Inter',sans-serif;font-weight:600;font-size:12.5px;
      color:#fff;background:var(--ac);border:none;border-radius:10px;cursor:pointer;white-space:nowrap;
      box-shadow:0 6px 18px -6px color-mix(in srgb,var(--ac) 60%,transparent);transition:filter .12s ease,transform .08s ease}
    .akls-btn:hover{filter:brightness(1.08)}
    .akls-btn:active{filter:brightness(.94);transform:translateY(1px)}
    .akls-btn.ghost{background:none;color:var(--tx);border:1px solid var(--ln);box-shadow:none}
    .akls-btn.ghost:hover{filter:none;border-color:color-mix(in srgb,var(--tx) 30%,var(--ln));background:color-mix(in srgb,var(--tx) 5%,transparent)}
    .akls-btn svg{width:14px;height:14px}
    /* workspace */
    .akls-main{position:relative;flex:1;min-height:0}
    .akls-area.pan{cursor:grab}
    .akls-area.panning{cursor:grabbing}
    .akls-area.panning *{cursor:grabbing!important}
    .akls-area{position:absolute;inset:0;overflow:auto;padding:18px 306px 132px 282px;
      background-image:radial-gradient(color-mix(in srgb,var(--tx) 8%,transparent) 1px,transparent 1.4px);
      background-size:24px 24px;background-attachment:local}
    .akls-frame{position:relative;margin:44px auto 64px;
      box-shadow:0 0 0 1px color-mix(in srgb,var(--ln) 90%,transparent),0 34px 90px -34px rgba(0,0,0,.62),0 8px 28px -14px rgba(0,0,0,.4);
      background:repeating-conic-gradient(color-mix(in srgb,var(--tx) 8%,transparent) 0 25%,transparent 0 50%) 0 0/18px 18px}
    .akls-flbl{position:absolute;left:0;top:-26px;font:500 11px 'Inter',sans-serif;letter-spacing:.005em;color:var(--mut);white-space:nowrap;pointer-events:none}
    .akls-hint{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;pointer-events:none;padding:20px;color:var(--mut)}
    .akls-hint svg{width:30px;height:30px;opacity:.45}
    .akls-hint b{font:600 15px 'Inter',sans-serif;color:color-mix(in srgb,var(--tx) 80%,transparent)}
    .akls-hint span{font:500 11.5px 'Inter',sans-serif;letter-spacing:.01em;max-width:420px;line-height:1.7}
    /* floating panels */
    .akls-side{position:absolute;left:0;top:0;bottom:0;width:240px;z-index:30;display:flex;flex-direction:column;min-height:0;overflow:hidden;
      background:var(--glass);-webkit-backdrop-filter:blur(22px) saturate(1.2);backdrop-filter:blur(22px) saturate(1.2);
      border:none;border-right:1px solid var(--ln);border-radius:0;box-shadow:var(--shdw);animation:aklsL .35s cubic-bezier(.2,.8,.3,1) both}
    .akls-panel{position:absolute;right:0;top:0;bottom:0;width:264px;z-index:30;overflow-y:auto;overflow-x:hidden;padding:0 14px 22px;
      background:var(--glass);-webkit-backdrop-filter:blur(22px) saturate(1.2);backdrop-filter:blur(22px) saturate(1.2);
      border:none;border-left:1px solid var(--ln);border-radius:0;box-shadow:var(--shdw);animation:aklsR .35s cubic-bezier(.2,.8,.3,1) both}
    @keyframes aklsL{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:none}}
    @keyframes aklsR{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:none}}
    @keyframes aklsUp{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
    @keyframes aklsFade{from{opacity:0}to{opacity:1}}
    /* resizable layers panel + canvas scale grip */
    .akls-sgrip{position:absolute;top:0;bottom:0;z-index:31;width:16px;margin-left:-8px;cursor:ew-resize;display:flex;align-items:center;justify-content:center;touch-action:none}
    .akls-sgrip::before{content:"";width:3px;height:36px;border-radius:3px;background:color-mix(in srgb,var(--tx) 16%,transparent);transition:background .15s ease,height .15s ease}
    .akls-sgrip:hover::before,.akls-sgrip.on::before{background:var(--ac);height:62px}
    .akls-czoom{position:absolute;right:-14px;bottom:-14px;width:28px;height:28px;border-radius:50%;z-index:8;cursor:nwse-resize;display:grid;place-items:center;
      background:var(--glass);-webkit-backdrop-filter:blur(18px) saturate(1.2);backdrop-filter:blur(18px) saturate(1.2);
      border:1px solid var(--ln);box-shadow:var(--shdw);color:var(--mut);transition:color .15s,border-color .15s,transform .12s;touch-action:none}
    .akls-czoom:hover{color:var(--ac);border-color:color-mix(in srgb,var(--ac) 70%,var(--ln));transform:scale(1.09)}
    .akls-czoom.on{color:var(--ac);border-color:var(--ac);transform:scale(1.09)}
    .akls-czoom svg{width:15px;height:15px;pointer-events:none}
    /* layers */
    .akls-ph{flex:none;display:flex;align-items:center;justify-content:space-between;padding:15px 16px 9px;
      font-family:'Inter',sans-serif;font-size:11px;font-weight:600;letter-spacing:.005em;color:var(--mut)}
    .akls-ll{flex:1;overflow-y:auto;overflow-x:hidden;padding:0 8px 10px;position:relative}
    .akls-lr{display:flex;align-items:center;gap:10px;height:34px;padding:0 10px;border-radius:9px;color:color-mix(in srgb,var(--tx) 88%,transparent);cursor:default;touch-action:none}
    .akls-lr:hover{background:color-mix(in srgb,var(--tx) 6%,transparent)}
    .akls-lr.on{background:color-mix(in srgb,var(--ac) 17%,transparent);color:var(--tx)}
    .akls-lr svg{width:15px;height:15px;flex:none;color:var(--mut)}
    .akls-lr.on svg{color:var(--ac)}
    .akls-lr .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:500}
    .akls-lr.drag{opacity:.35}
    .akls-ins{position:absolute;left:8px;right:8px;height:2px;border-radius:2px;background:var(--ac);pointer-events:none;display:none;z-index:2}
    .akls-lempty{padding:10px 10px 0;font-size:11.5px;line-height:1.65;color:var(--mut)}
    .akls-lrn{flex:1;min-width:0;background:var(--bg);border:1px solid var(--ac);border-radius:6px;color:var(--tx);font:inherit;font-size:12px;padding:3px 6px;outline:none}
    .akls-lr .lops{display:flex;align-items:center;gap:1px;flex:none;margin-right:-4px}
    .akls-lr .lop{display:grid;place-items:center;width:23px;height:23px;border:none;background:none;color:var(--mut);border-radius:6px;cursor:pointer;padding:0;opacity:0;transition:opacity .12s,color .12s,background .12s}
    .akls-lr .lop svg{width:14px;height:14px}
    .akls-lr:hover .lop,.akls-lr.on .lop{opacity:.72}
    .akls-lr .lop:hover{opacity:1;color:var(--tx);background:color-mix(in srgb,var(--tx) 10%,transparent)}
    .akls-lr .lop.act{opacity:1;color:var(--ac)}
    .akls-lr.dim{opacity:.5}
    .akls-lr.dim .nm{font-style:italic}
    .akls-lr .cvt{flex:none;width:15px;height:15px;display:grid;place-items:center;color:var(--mut);cursor:pointer;margin-left:-2px}
    .akls-lr .cvt svg{width:13px;height:13px;transition:transform .16s ease}
    .akls-lr .cvt.col svg{transform:rotate(-90deg)}
    .akls-lr.grp .nm{font-weight:600}
    .akls-lr.grp{background:color-mix(in srgb,var(--tx) 3.5%,transparent)}
    .akls-lr.grp.on{background:color-mix(in srgb,var(--ac) 17%,transparent)}
    .akls-lr .gct{flex:none;font:600 10px 'Inter',sans-serif;color:var(--mut);font-variant-numeric:tabular-nums}
    .akls-lr.mbr .nm{padding-left:1px}
    .akls-mgap{width:13px;flex:none;align-self:stretch;position:relative;margin-right:-4px}
    .akls-mgap::before{content:"";position:absolute;left:6px;top:-3px;bottom:-3px;width:1.5px;background:color-mix(in srgb,var(--tx) 12%,transparent)}
    .akls-mi.warn:hover{background:color-mix(in srgb,#ef4444 16%,transparent);color:#ef4444}
    .akls-mi.warn:hover > svg{color:#ef4444}
    .akls-mi .kb{flex:none;font:600 9.5px 'Inter',sans-serif;color:var(--mut);letter-spacing:.02em}
    .akls-menu.ctx{min-width:198px;max-width:252px}
    .akls-sf{flex:none;display:flex;align-items:center;gap:12px;padding:10px 16px;border-top:1px solid var(--ln);
      font:500 10.5px 'Inter',sans-serif;letter-spacing:.01em;font-variant-numeric:tabular-nums;color:var(--mut);white-space:nowrap;overflow:hidden}
    /* floating tool dock */
    .akls-dock{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:40;display:flex;align-items:center;gap:3px;padding:7px;
      background:var(--glass);-webkit-backdrop-filter:blur(22px) saturate(1.2);backdrop-filter:blur(22px) saturate(1.2);
      border:1px solid var(--ln);border-radius:17px;box-shadow:var(--shdw);animation:aklsUp .42s cubic-bezier(.18,.9,.26,1.08) both}
    .akls-dock .akls-ib{width:40px;height:40px;border-radius:12px}
    .akls-dock .akls-ib svg{width:20px;height:20px}
    .akls-dock .akls-vsep{height:24px;margin:0 5px}
    /* selection + handles */
    .akls-selbox{position:absolute;pointer-events:none;outline:2px solid var(--ac)}
    .akls-selbox.crop{outline-style:dashed}
    .akls-selbox.multi{outline-color:color-mix(in srgb,var(--ac) 60%,transparent)}
    .akls-hd{position:absolute;width:var(--hs,11px);height:var(--hs,11px);background:#fff;border:1.5px solid var(--ac);border-radius:3px;
      transform:translate(-50%,-50%);pointer-events:auto;box-shadow:0 1px 4px rgba(0,0,0,.35)}
    .akls-hd.nw{left:0;top:0;cursor:nwse-resize}.akls-hd.n{left:50%;top:0;cursor:ns-resize}.akls-hd.ne{left:100%;top:0;cursor:nesw-resize}
    .akls-hd.e{left:100%;top:50%;cursor:ew-resize}.akls-hd.se{left:100%;top:100%;cursor:nwse-resize}.akls-hd.s{left:50%;top:100%;cursor:ns-resize}
    .akls-hd.sw{left:0;top:100%;cursor:nesw-resize}.akls-hd.w{left:0;top:50%;cursor:ew-resize}
    .akls-hd.scale{left:100%;top:100%;margin-left:calc(var(--hs,11px)*.95);margin-top:calc(var(--hs,11px)*.95);border-radius:50%;
      background:var(--ac);border:1.5px solid #fff;cursor:nwse-resize}
    .akls-cropbadge{position:absolute;left:0;top:0;transform:translateY(-135%);font:600 10.5px 'Inter',sans-serif;letter-spacing:.01em;
      color:#fff;background:var(--ac);padding:4px 10px;border-radius:7px;white-space:nowrap;pointer-events:none}
    /* layout grid + smart guides */
    .akls-grid{position:absolute;inset:0;display:flex;pointer-events:none}
    .akls-grid > div{flex:1;background:color-mix(in srgb,var(--ac) 7%,transparent);
      border-left:1px solid color-mix(in srgb,var(--ac) 24%,transparent);border-right:1px solid color-mix(in srgb,var(--ac) 24%,transparent)}
    .akls-gl{position:absolute;pointer-events:none;background:#FF3B9A;display:none}
    .akls-gl.gv{top:0;bottom:0;width:1px}
    .akls-gl.gh{left:0;right:0;height:1px}
    .akls-meas{position:absolute;pointer-events:none;display:none;background:#FF3B9A;z-index:3}
    .akls-meas b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:#FF3B9A;color:#fff;
      font:600 10px/1 'Inter',sans-serif;font-variant-numeric:tabular-nums;padding:3px 6px;border-radius:5px;white-space:nowrap}
    /* equal-gap magnet (matched spacing) + reference gap on a neighbouring pair */
    .akls-meas.mag,.akls-meas.mag b{background:#12B76A}
    .akls-meas.ref{background:transparent}
    .akls-meas.ref b{background:#2E90FA}
    .akls-meas.ref.eq b{background:#12B76A}
    .akls-meas.diag{background:transparent}
    .akls-meas b i{font-style:normal;opacity:.72;font-weight:600}
    .akls-marq{position:absolute;border:1px dashed var(--ac);background:color-mix(in srgb,var(--ac) 10%,transparent);pointer-events:none;z-index:4}
    /* inspector */
    .akls-sec{display:flex;align-items:center;gap:8px;margin:16px -14px 10px;padding:13px 16px 0;border-top:1px solid var(--ln);
      font-family:'Inter',sans-serif;font-size:11px;font-weight:600;letter-spacing:.005em;color:var(--mut)}
    .akls-panel .akls-sec:first-child{border-top:none;margin-top:0;padding-top:16px}
    .akls-lab{display:block;font-size:10.5px;color:var(--mut);margin:0 0 5px}
    .akls-f{margin-bottom:10px}
    .akls-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
    .akls-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px}
    .akls-in{display:flex;align-items:center;height:30px;border:1px solid var(--ln);border-radius:9px;background:color-mix(in srgb,var(--tx) 3.5%,transparent);overflow:hidden;min-width:0;transition:border-color .12s ease,box-shadow .12s ease}
    .akls-in:focus-within{border-color:var(--ac);box-shadow:0 0 0 2.5px color-mix(in srgb,var(--ac) 18%,transparent)}
    .akls-in .pfx{flex:none;padding:0 1px 0 9px;font-family:'Inter',sans-serif;font-size:10px;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:var(--mut)}
    .akls-grid4 .akls-in .pfx{padding-left:6px}
    .akls-in input,.akls-in select{flex:1;min-width:0;height:100%;border:none;background:none;color:var(--tx);font:500 12px 'Inter',sans-serif;padding:0 8px 0 6px;outline:none;font-variant-numeric:tabular-nums;user-select:text}
    .akls-in select{cursor:pointer;padding-left:9px}
    .akls-in select option{background:var(--pnl);color:var(--tx)}
    .akls-in input:disabled{opacity:.45}
    .akls-in input[type=number]{-moz-appearance:textfield}
    .akls-in input[type=number]::-webkit-inner-spin-button,.akls-in input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
    .akls-panel textarea{width:100%;min-height:84px;resize:vertical;border:1px solid var(--ln);border-radius:9px;background:color-mix(in srgb,var(--tx) 3.5%,transparent);
      color:var(--tx);font:500 12px/1.55 'Inter',sans-serif;padding:8px 9px;outline:none;user-select:text;transition:border-color .12s ease,box-shadow .12s ease}
    .akls-panel textarea:focus{border-color:var(--ac);box-shadow:0 0 0 2.5px color-mix(in srgb,var(--ac) 18%,transparent)}
    .akls-mixrow{display:grid;grid-template-columns:1fr 66px;gap:9px;align-items:center;margin-bottom:9px}
    .akls-colorrow{display:flex;gap:8px;align-items:center;margin-bottom:9px}
    .akls-colorrow .akls-in{flex:1}
    .akls-colorrow .akls-in.wsm{flex:0 0 64px}
    .akls-sw{flex:none;width:28px;height:28px;padding:1px;border:1px solid var(--ln);border-radius:8px;background:none;cursor:pointer}
    input[type=color].akls-sw::-webkit-color-swatch-wrapper{padding:1px}
    input[type=color].akls-sw::-webkit-color-swatch{border:none;border-radius:6px}
    .akls-seg{display:flex;gap:2px;border:1px solid var(--ln);border-radius:9px;padding:2px;background:color-mix(in srgb,var(--tx) 3%,transparent)}
    .akls-seg button{flex:1;height:23px;border:none;border-radius:7px;background:none;color:var(--mut);font:600 11px 'Inter',sans-serif;cursor:pointer;padding:0;transition:background .12s,color .12s}
    .akls-seg button:hover{color:var(--tx)}
    .akls-seg button.on{background:color-mix(in srgb,var(--ac) 20%,transparent);color:var(--ac)}
    .akls-act{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;padding:8px 2px;border:1px solid var(--ln);border-radius:9px;background:none;color:var(--tx);cursor:pointer;transition:border-color .12s,color .12s,background .12s}
    .akls-act svg{width:15px;height:15px}
    .akls-act span{font-family:'Inter',sans-serif;font-size:9px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--mut)}
    .akls-act:hover{border-color:var(--ac);color:var(--ac);background:color-mix(in srgb,var(--ac) 7%,transparent)}
    .akls-act:hover span{color:var(--ac)}
    .akls-act.warn:hover{border-color:#ef4444;color:#ef4444;background:color-mix(in srgb,#ef4444 7%,transparent)}
    .akls-act.warn:hover span{color:#ef4444}
    .akls-sm{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:29px;padding:0 11px;border:1px solid var(--ln);border-radius:9px;
      background:none;color:var(--tx);font:600 11px 'Inter',sans-serif;cursor:pointer;white-space:nowrap;transition:border-color .12s,color .12s}
    .akls-sm:hover{border-color:var(--ac);color:var(--ac)}
    .akls-sm svg{width:12px;height:12px;flex:none}
    .akls-sm.w100{width:100%;margin-bottom:8px}
    .akls-chk{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--mut);cursor:pointer;user-select:none;margin-bottom:8px}
    .akls-chk input{accent-color:var(--ac);margin:0}
    .akls-note{font-size:10.5px;line-height:1.55;color:var(--mut);margin:2px 0 10px}
    .akls-key{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 0;font-size:11px;color:var(--mut)}
    .akls-key .k{font-family:'Inter',sans-serif;font-size:9.5px;font-weight:600;color:var(--tx);background:color-mix(in srgb,var(--tx) 7%,transparent);border:1px solid var(--ln);border-radius:5px;padding:2.5px 6px;white-space:nowrap}
    .akls-panel input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:4px;border-radius:99px;background:var(--ln);outline:none;margin:0;user-select:none}
    .akls-panel input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:var(--ac);border:2.5px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4);cursor:pointer}
    .akls-panel input[type=range]::-moz-range-thumb{width:11px;height:11px;border-radius:50%;background:var(--ac);border:2.5px solid #fff;cursor:pointer}
    /* theme menu */
    .akls-menu{position:fixed;z-index:420;min-width:262px;max-width:310px;background:var(--glass);-webkit-backdrop-filter:blur(24px) saturate(1.2);backdrop-filter:blur(24px) saturate(1.2);
      border:1px solid var(--ln);border-radius:14px;box-shadow:var(--shdw);padding:6px;animation:aklsMenu .16s ease both}
    @keyframes aklsMenu{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
    .akls-mhd{padding:9px 11px 5px;font-family:'Inter',sans-serif;font-size:10.5px;font-weight:600;letter-spacing:.005em;color:var(--mut)}
    .akls-mi{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border:none;background:none;color:var(--tx);border-radius:8px;cursor:pointer;text-align:left;font:500 12.5px 'Inter',sans-serif}
    .akls-mi:hover{background:color-mix(in srgb,var(--tx) 7%,transparent)}
    .akls-mi > svg{width:14px;height:14px;flex:none;color:var(--mut)}
    .akls-mi:hover > svg{color:var(--ac)}
    .akls-mi .grow{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .akls-mi .tag{flex:none;font-family:'Inter',sans-serif;font-size:8.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ac);border:1px solid color-mix(in srgb,var(--ac) 45%,transparent);border-radius:5px;padding:2px 5px}
    .akls-mi .x{flex:none;display:grid;place-items:center;width:21px;height:21px;border-radius:6px;color:var(--mut)}
    .akls-mi .x:hover{background:color-mix(in srgb,#ef4444 18%,transparent);color:#ef4444}
    .akls-mi .x svg{width:11px;height:11px}
    .akls-msep{height:1px;background:var(--ln);margin:6px 4px}
    .akls-mnote{padding:2px 11px 9px;font-size:10.5px;line-height:1.5;color:var(--mut)}
    /* in-studio dialogs + toast */
    .akls-dlgov{position:absolute;inset:0;z-index:430;display:grid;place-items:center;background:rgba(0,0,0,.45);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);animation:aklsFade .15s ease both}
    .akls-dlg{width:min(330px,86vw);background:var(--pnl);border:1px solid var(--ln);border-radius:16px;padding:18px;box-shadow:var(--shdw);animation:aklsDlg .2s cubic-bezier(.2,.9,.3,1.15) both}
    @keyframes aklsDlg{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:none}}
    .akls-dlg h4{margin:0 0 12px;font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:var(--tx)}
    .akls-dlg p{margin:0 0 14px;font-size:12px;line-height:1.55;color:var(--mut)}
    .akls-dlg .row{display:flex;gap:8px;justify-content:flex-end;margin-top:15px}
    .akls-toast{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);z-index:440;background:color-mix(in srgb,var(--tx) 94%,transparent);color:color-mix(in srgb,var(--bg,#141311) 96%,#000);
      padding:9px 16px;border-radius:99px;font:600 12px 'Inter',sans-serif;box-shadow:var(--shdw);white-space:nowrap;animation:aklsToast .22s cubic-bezier(.2,.9,.3,1.1) both}
    @keyframes aklsToast{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
    .akls-audio{width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:10px}
    @media(max-width:1280px){.akls-side{width:214px}.akls-panel{width:246px}.akls-area{padding:18px 288px 132px 256px}}
    @media(max-width:1024px){.akls-side{width:192px}.akls-panel{width:230px}.akls-area{padding:18px 268px 124px 230px}
      .akls-dock{gap:2px;padding:6px}.akls-dock .akls-ib{width:36px;height:36px}.akls-dock .akls-ib svg{width:18px;height:18px}}
    @media(prefers-reduced-motion:reduce){.akls-ov,.akls-ov *{animation:none!important;transition:none!important}}
    .akls-view .akls-bento{cursor:pointer}
    .akls-bento{transition:box-shadow .25s,outline-color .2s,filter .25s;outline:0 solid transparent}
    .akls-bento:hover{outline:2px solid var(--ac,var(--accent,#E5783A));outline-offset:-2px;box-shadow:0 20px 54px -20px rgba(0,0,0,.55);filter:brightness(1.05);z-index:6}
    .akls-bento-open{position:absolute;top:12px;right:12px;z-index:7;width:46px;height:46px;display:flex;align-items:center;justify-content:center;border:none;border-radius:13px;cursor:pointer;color:#fff;background:rgba(12,10,8,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:.92;transition:opacity .18s,background .2s,transform .12s;box-shadow:0 6px 18px -8px rgba(0,0,0,.6)}
    .akls-bento:hover .akls-bento-open{opacity:1}
    .akls-bento-open:hover{background:var(--ac,var(--accent,#E5783A));transform:scale(1.06)}
    .akls-bento-open svg{width:26px;height:26px}
    /* hover reveal on a bento tile: hero line + "open prompt" cue with an arrow */
    .akls-bhov{position:absolute;inset:0;z-index:5;pointer-events:none;border-radius:inherit;box-sizing:border-box;display:flex;flex-direction:column;justify-content:flex-end;gap:4px;padding:16px 18px;opacity:0;transition:opacity .26s ease;background:linear-gradient(to top,rgba(11,9,7,.9) 0%,rgba(11,9,7,.58) 40%,rgba(11,9,7,0) 78%)}
    .akls-bento:hover .akls-bhov{opacity:1}
    .akls-bhero{font:600 15px/1.32 'Inter',sans-serif;letter-spacing:-.01em;color:#fff;text-wrap:pretty;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transform:translateY(9px);transition:transform .34s cubic-bezier(.2,.8,.3,1)}
    .akls-bhero.ph{font-weight:600;color:rgba(255,255,255,.52)}
    .akls-bcta{display:flex;align-items:center;gap:9px;font:700 9px 'Inter',sans-serif;letter-spacing:.13em;text-transform:uppercase;color:#fff;transform:translateY(12px);transition:transform .34s cubic-bezier(.2,.8,.3,1) .05s}
    .akls-bento:hover .akls-bhero,.akls-bento:hover .akls-bcta{transform:none}
    /* arrow disc — same language as the project tiles' open button (fills with accent, glyph rotates -45°) */
    .akls-barr{flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;color:#fff;background:color-mix(in srgb,var(--ac,var(--accent,#E5783A)) 26%,rgba(8,7,5,.5));border:1px solid rgba(255,255,255,.28);transition:background .25s,border-color .25s}
    .akls-barr span{display:block;transition:transform .25s}
    .akls-bento:hover .akls-barr{background:var(--ac,var(--accent,#E5783A));border-color:color-mix(in srgb,var(--ac,var(--accent,#E5783A)) 55%,#fff)}
    .akls-bento:hover .akls-barr span{transform:rotate(-45deg)}
    .akld-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(8,7,6,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);animation:akldIn .2s ease both;font-family:'Inter',sans-serif}
    @keyframes akldIn{from{opacity:0}to{opacity:1}}
    .akld-card{position:relative;display:flex;width:min(1160px,96vw);height:min(860px,92vh);background:#FBF9F5;border-radius:22px;overflow:hidden;box-shadow:0 40px 120px -30px rgba(0,0,0,.7);animation:akldPop .26s cubic-bezier(.2,.8,.3,1.1) both}
    @keyframes akldPop{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}
    .akld-media{position:relative;flex:1 1 52%;min-width:0;background:#E7E3DC;display:flex;align-items:center;justify-content:center;overflow:hidden;transition:flex-basis .2s ease}
    .akld-media img,.akld-media video{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;background:#E7E3DC}
    .akld-media iframe{width:100%;height:100%;border:0;display:block;background:#fff}
    .akld-media img,.akld-media video{transform-origin:0 0;transition:transform .22s cubic-bezier(.22,.61,.36,1)}
    .akld-media.zoomed img,.akld-media.zoomed video{transition:none;cursor:grab}
    .akld-media.grabbing img,.akld-media.grabbing video{cursor:grabbing}
    .akld-zoom{position:absolute;right:14px;bottom:14px;z-index:6;display:flex;gap:6px}
    .akld-zbtn{border:0;cursor:pointer;height:32px;min-width:32px;padding:0 10px;border-radius:999px;background:rgba(14,12,10,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;font:600 12px/1 ui-monospace,'SFMono-Regular',Menlo,monospace;display:flex;align-items:center;justify-content:center;gap:6px}
    .akld-zbtn:hover{background:#1C1A14}.akld-zbtn[disabled]{opacity:.4;cursor:default}
    .akld-drag{position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:6;display:none;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:rgba(14,12,10,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;font:600 11px/1 'Inter',sans-serif;letter-spacing:.04em;pointer-events:none}
    .akld-media.zoomed .akld-drag{display:flex}
    /* real file facts — pixel size, duration, weight, format */
    .akld-facts{position:absolute;left:14px;bottom:14px;z-index:6;display:flex;align-items:center;gap:8px;padding:7px 11px;border-radius:999px;background:rgba(14,12,10,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;font:600 11px/1 ui-monospace,'SFMono-Regular',Menlo,monospace;letter-spacing:.04em;white-space:nowrap;pointer-events:none}
    .akls-bsize{position:absolute;top:12px;right:12px;padding:5px 9px;border-radius:999px;background:rgba(14,12,10,.66);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);color:#fff;font:600 10px/1 ui-monospace,'SFMono-Regular',Menlo,monospace;letter-spacing:.04em;white-space:nowrap}
    .akld-empty{color:#8a857c;font:600 13px 'Inter',sans-serif;letter-spacing:.05em;text-align:center;padding:24px}
    .akld-nav{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;border:none;background:rgba(255,255,255,.72);color:#333;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;box-shadow:0 4px 14px rgba(0,0,0,.18)}
    .akld-nav:hover{background:#fff}
    .akld-nav.prev{left:14px}.akld-nav.next{right:14px}
    .akld-info{flex:1 1 48%;min-width:0;background:#FCFBF8;padding:34px 38px;overflow-y:auto}
    .akld-eyebrow{display:flex;align-items:center;gap:10px;font:700 12px 'Inter',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#7c5cff;min-height:14px}
    .akld-eyebrow:before{content:'';width:22px;height:2px;background:#7c5cff;display:inline-block;flex:none}
    .akld-title{font:700 26px/1.22 'Inter',sans-serif;color:#1b1b1f;margin:12px 0 0}
    .akld-hr{height:1px;background:#ece8e0;margin:20px 0}
    .akld-lbl{font:700 11px 'Inter',sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#9a948a;margin-bottom:11px}
    .akld-refs{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .akld-ref{width:58px;height:54px;border-radius:9px;object-fit:cover;border:1px solid #e2ddd3}
    .akld-refnote{font:500 13px 'Inter',sans-serif;color:#a49e93}
    .akld-code{background:#151317;color:#cfc9e6;border-radius:12px;padding:18px;font:500 12.5px/1.7 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word;border-left:3px solid #7c5cff;min-height:20px}
    .akld-tags{display:flex;flex-wrap:wrap;gap:9px}
    .akld-tag{font:600 12px 'Inter',sans-serif;color:#6d4bff;background:#efeafe;border:1px solid #ddd2fb;border-radius:99px;padding:7px 13px}
    .akld-add{font:600 12px 'Inter',sans-serif;color:#7c5cff;background:none;border:1px dashed #c9bdf5;border-radius:99px;padding:7px 13px;cursor:pointer}
    .akld-add:hover{background:#f3effe}
    .akld-x{position:absolute;top:16px;right:16px;z-index:4;width:34px;height:34px;border:none;border-radius:9px;background:rgba(0,0,0,.06);color:#333;cursor:pointer;display:flex;align-items:center;justify-content:center}
    .akld-x:hover{background:rgba(0,0,0,.12)}
    .akld-x svg{width:18px;height:18px}
    .akld-edit:focus{outline:2px solid #7c5cff;outline-offset:3px;border-radius:5px}
    .akld-edit:empty:before{content:attr(data-ph);color:#c0bab0}
    .akld-code.akld-edit:empty:before{color:#6b6580}
    @media(max-width:760px){.akld-card{flex-direction:column;height:min(92vh,880px)}.akld-media{flex:0 0 42%}.akld-info{flex:1 1 auto;padding:24px}}
    ` }));
  }

  var ICO = {
    logo: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="10.6" height="10.6" rx="3" fill="currentColor"/><rect x="10.9" y="10.9" width="10.1" height="10.1" rx="3.2" stroke="currentColor" stroke-width="1.7"/></svg>',
    distV: '<svg viewBox="0 0 24 24" fill="none"><rect x="4" y="3" width="16" height="4" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="10" width="16" height="4" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="4" y="17" width="16" height="4" rx="1.2" stroke="currentColor" stroke-width="1.6"/></svg>',
    distH: '<svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="4" height="16" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="10" y="4" width="4" height="16" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="17" y="4" width="4" height="16" rx="1.2" stroke="currentColor" stroke-width="1.6"/></svg>',
    ruler: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5v17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M7.5 5.2h9M7.5 18.8h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9.6 8.2L12 5.6l2.4 2.6M9.6 15.8L12 18.4l2.4-2.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none"><rect x="4.9" y="10.4" width="14.2" height="9.9" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M8.2 10.4V7.9a3.8 3.8 0 0 1 7.6 0v2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="15.3" r="1.5" fill="currentColor"/></svg>',
    rect: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.75" y="5.5" width="16.5" height="13" rx="2.8" stroke="currentColor" stroke-width="1.7"/></svg>',
    bento: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="9" height="9" rx="1.7" stroke="currentColor" stroke-width="1.7"/><rect x="14.5" y="3.5" width="6" height="5" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="14.5" y="10.5" width="6" height="10" rx="1.5" stroke="currentColor" stroke-width="1.7"/><rect x="3.5" y="14.5" width="9" height="6" rx="1.5" stroke="currentColor" stroke-width="1.7"/></svg>',
    circ: '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.3" stroke="currentColor" stroke-width="1.7"/></svg>',
    line: '<svg viewBox="0 0 24 24" fill="none"><path d="M5.2 18.8L18.8 5.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="5.2" cy="18.8" r="1.9" fill="currentColor"/><circle cx="18.8" cy="5.2" r="1.9" fill="currentColor"/></svg>',
    text: '<svg viewBox="0 0 24 24" fill="none"><path d="M5.5 7.75V5.25h13v2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 5.25v13.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9.25 18.75h5.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    img: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.75" width="17" height="14.5" rx="3" stroke="currentColor" stroke-width="1.7"/><circle cx="8.9" cy="9.4" r="1.65" fill="currentColor"/><path d="M6 16.6l3.7-3.3a1.7 1.7 0 0 1 2.3.05L17.5 18" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.6 15.2l1.5-1.4a1.7 1.7 0 0 1 2.3 0l2.1 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    film: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.75" width="17" height="14.5" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M10.3 9.1v5.8c0 .66.73 1.06 1.28.7l4.4-2.9a.85.85 0 0 0 0-1.4l-4.4-2.9a.85.85 0 0 0-1.28.7z" fill="currentColor"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" fill="none"><path d="M6.25 3.75h7.4a1 1 0 0 1 .7.3l3.6 3.6a1 1 0 0 1 .3.7v11.9H6.25z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M13.9 3.9V8h4.1" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.4 13.4h5.2M9.4 16.4h3.6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    proto: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.5" y="4.75" width="17" height="14.5" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 9.4h17" stroke="currentColor" stroke-width="1.7"/><circle cx="6.7" cy="7.1" r=".95" fill="currentColor"/><circle cx="9.5" cy="7.1" r=".95" fill="currentColor"/></svg>',
    dup: '<svg viewBox="0 0 24 24" fill="none"><rect x="8.75" y="8.75" width="11.5" height="11.5" rx="2.8" stroke="currentColor" stroke-width="1.7"/><path d="M15.25 5.5a2 2 0 0 0-2-1.75H6a2.25 2.25 0 0 0-2.25 2.25v7.25a2 2 0 0 0 1.75 2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    fwd: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 19.25V4.75M5.9 10.85L12 4.75l6.1 6.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    bck: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4.75v14.5M5.9 13.15l6.1 6.1 6.1-6.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.75 6.5h14.5M9.75 6.25V5.5a1.75 1.75 0 0 1 1.75-1.75h1a1.75 1.75 0 0 1 1.75 1.75v.75" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6.5 6.75l.7 11.4a2 2 0 0 0 2 1.85h5.6a2 2 0 0 0 2-1.85l.7-11.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.1 10.5v6M13.9 10.5v6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    cube: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3l8 4.4v9.2L12 21l-8-4.4V7.4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 12l8-4.5M12 12v8.8M12 12L4 7.5" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    audio: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 10v4h3.3l4.7 3.7V6.3L7.3 10H4z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M15.4 9.1a4.6 4.6 0 0 1 0 5.8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M18 6.9a8 8 0 0 1 0 10.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    move: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5v17M3.5 12h17" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M9.6 5.9L12 3.5l2.4 2.4M9.6 18.1l2.4 2.4 2.4-2.4M5.9 9.6L3.5 12l2.4 2.4M18.1 9.6l2.4 2.4-2.4 2.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none"><path d="M8.7 14.2L4.25 9.75 8.7 5.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.6 9.75h9.9a5.25 5.25 0 0 1 0 10.5h-3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none"><path d="M15.3 14.2l4.45-4.45L15.3 5.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M19.4 9.75H9.5a5.25 5.25 0 0 0 0 10.5h3.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none"><rect x="3.75" y="3.75" width="16.5" height="16.5" rx="2.8" stroke="currentColor" stroke-width="1.7"/><path d="M9.25 3.75v16.5M14.75 3.75v16.5" stroke="currentColor" stroke-width="1.5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 5.25v13.5M5.25 12h13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none"><path d="M5.25 12h13.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    fit: '<svg viewBox="0 0 24 24" fill="none"><path d="M9 4.5H6.75A2.25 2.25 0 0 0 4.5 6.75V9M15 4.5h2.25a2.25 2.25 0 0 1 2.25 2.25V9M9 19.5H6.75A2.25 2.25 0 0 1 4.5 17.25V15M15 19.5h2.25a2.25 2.25 0 0 0 2.25-2.25V15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    arrowRt: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.75 12h13.5M12.5 6.25 18.75 12l-6.25 5.75" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.75 12.75L9.5 17.5 19.25 7.25" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    palette: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h6.5A2.5 2.5 0 0 0 21 9.5 8 8 0 0 0 12 3z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10" cy="7.5" r="1.2" fill="currentColor"/><circle cx="14.5" cy="6.5" r="1.2" fill="currentColor"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9l-5.3 2.7 1-5.8-4.2-4.1 5.9-.9z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 4.25V15M7.75 10.75L12 15l4.25-4.25" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.75 19.25h14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none"><path d="M12 15V4.25M7.75 8.5L12 4.25 16.25 8.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.75 19.25h14.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    xsm: '<svg viewBox="0 0 24 24" fill="none"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    eye: '<svg viewBox="0 0 24 24" fill="none"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12" r="2.7" stroke="currentColor" stroke-width="1.7"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" fill="none"><path d="M4.6 8.1C3.2 9.4 2.5 12 2.5 12s3.5 6.5 9.5 6.5c1.4 0 2.7-.36 3.8-.95M9.9 6.05c.66-.13 1.36-.2 2.1-.2 6 0 9.5 6.15 9.5 6.15s-.9 1.66-2.55 3.25" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M4 4l16 16" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" fill="none"><rect x="4.9" y="10.4" width="14.2" height="9.9" rx="3" stroke="currentColor" stroke-width="1.7"/><path d="M8.2 10.4V7.9a3.8 3.8 0 0 1 7.35-1.35" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="15.3" r="1.5" fill="currentColor"/></svg>',
    group: '<svg viewBox="0 0 24 24" fill="none"><path d="M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor"/></svg>',
    ungroup: '<svg viewBox="0 0 24 24" fill="none"><path d="M3.5 7.5V5.5A1.5 1.5 0 0 1 5 4h2M10 4h1.5A1.5 1.5 0 0 1 13 5.5v1.7M13 10.4v1.1A1.5 1.5 0 0 1 11.5 13H10M7 13H5a1.5 1.5 0 0 1-1.5-1.5V10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13.5 16.8v1.7A1.5 1.5 0 0 0 15 20h1.5m4-3.2v1.7A1.5 1.5 0 0 1 19 20h-1.5m3-8.5V13a1.5 1.5 0 0 1-1.5 1.5H17.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none"><path d="M3.75 6.9A1.9 1.9 0 0 1 5.65 5h3.2a1.9 1.9 0 0 1 1.52.76l.86 1.14h7.12A1.9 1.9 0 0 1 21.25 8.8v8.3A1.9 1.9 0 0 1 19.35 19H5.65a1.9 1.9 0 0 1-1.9-1.9z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    caret: '<svg viewBox="0 0 24 24" fill="none"><path d="M7.25 10.25L12 15l4.75-4.75" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };

  var FONTS = [
    ["'Inter',sans-serif", "Inter"],
    ["Georgia,serif", "Georgia"],
    ["'Times New Roman',serif", "Times New Roman"],
    ["Arial,Helvetica,sans-serif", "Arial / Helvetica"],
    ["'Courier New',monospace", "Courier New"]
  ];

  /* ============================================================ BUILT-IN THEME: award-style UI/UX case study */
  function caseStudyTheme() {
    var SG = "'Inter',sans-serif", INT = "'Inter',sans-serif", MONO = "'Inter',sans-serif";
    var AC = "#E5783A", TX = "#FFFFFF", MUT = "#C9C8C6", CARD = "#26231D", LN = "#373634";
    var els = [];
    function T(x, y, w, hh, text, o) {
      els.push({ id: uid(), kind: "rect", x: x, y: y, w: w, h: hh, r: 0, fill: "none", stroke: "", strokeW: 0, opacity: 1,
        content: Object.assign({ type: "text", text: text, font: SG, size: 16, weight: 500, color: TX, ls: 0, lh: 1.4, align: "left", valign: "top", pt: 0, pr: 0, pb: 0, pl: 0, strokeW: 0, strokeC: "#000000" }, o) });
    }
    function R(x, y, w, hh, o) {
      els.push(Object.assign({ id: uid(), kind: "rect", x: x, y: y, w: w, h: hh, r: 0, fill: CARD, stroke: "", strokeW: 0, opacity: 1, content: null }, o));
    }
    function IMG(x, y, w, hh, label) {
      R(x, y, w, hh, { r: 18, stroke: LN, strokeW: 1 });
      T(x, y, w, hh, label + "\nSet Content \u2192 Image on this frame, then double-click to adjust", { font: MONO, size: 12, color: MUT, ls: 2, lh: 1.9, align: "center", valign: "middle", pt: 20, pr: 40, pb: 20, pl: 40 });
    }
    function SEC(y, eyebrow, title) {
      R(84, y, 1032, 1, { fill: "#2E2B24" });
      T(84, y + 36, 700, 22, eyebrow, { font: MONO, size: 12.5, weight: 700, color: AC, ls: 3 });
      T(84, y + 66, 860, 48, title, { size: 34, weight: 700, lh: 1.15 });
    }
    /* hero */
    T(84, 96, 640, 22, "UI/UX CASE STUDY \u2014 2026", { font: MONO, size: 13, weight: 700, color: AC, ls: 4 });
    T(84, 134, 980, 150, "Checkout, redesigned:\nfrom five steps to one page", { size: 60, weight: 700, lh: 1.12, ls: -0.5 });
    T(84, 306, 800, 90, "End-to-end case study of a payments flow redesign \u2014 research, iteration, and a shipped experience that raised conversion 38% in eight weeks.", { font: INT, size: 19, color: MUT, lh: 1.6 });
    [["ROLE", "Product Designer \u2014 research to ship"], ["TIMELINE", "8 weeks \u00b7 Q1 2026"], ["PLATFORM", "iOS \u00b7 Android \u00b7 Web"], ["TOOLS", "Figma \u00b7 Maze \u00b7 Hotjar"]].forEach(function (m, i) {
      var x = 84 + i * 258;
      T(x, 432, 234, 16, m[0], { font: MONO, size: 10, weight: 700, color: AC, ls: 2 });
      T(x, 454, 234, 48, m[1], { font: INT, size: 14, color: TX, lh: 1.45 });
    });
    IMG(84, 540, 1032, 520, "HERO IMAGE \u2014 FINAL PRODUCT SHOT");
    /* impact metrics */
    [["+38%", "checkout conversion after launch"], ["\u221252%", "payment-related support tickets"], ["4.8\u2605", "post-launch app-store rating"]].forEach(function (m, i) {
      var x = 84 + i * 352;
      R(x, 1100, 328, 150, { r: 16 });
      T(x + 26, 1128, 276, 52, m[0], { size: 42, weight: 700, color: AC, lh: 1 });
      T(x + 26, 1186, 276, 44, m[1], { font: INT, size: 13, color: MUT, lh: 1.45 });
    });
    /* 01 problem */
    SEC(1310, "01 \u2014 THE PROBLEM", "Users hit a wall at payment");
    T(84, 1436, 680, 150, "Checkout abandonment sat at 71%. The flow forced account creation, hid fees until the final step, and stretched five screens on mobile. Analytics, support tickets and session recordings all pointed at the same wall: paying was the hardest part of the product.", { font: INT, size: 16.5, color: MUT, lh: 1.65 });
    R(824, 1436, 292, 180, { r: 16, fill: "none", stroke: LN, strokeW: 1 });
    T(848, 1460, 246, 96, "\u201cI just want to pay \u2014 why do I need an account?\u201d", { size: 16.5, weight: 600, lh: 1.5 });
    T(848, 1562, 246, 24, "\u2014 usability session #7", { font: MONO, size: 10.5, color: MUT, ls: 1 });
    /* 02 research */
    SEC(1690, "02 \u2014 RESEARCH", "What twelve users made obvious");
    [["Guest checkout is non-negotiable", "9 of 12 usability participants abandoned at forced signup. Deferring account creation to after purchase removed the spike entirely."],
     ["Trust breaks at surprise fees", "Sessions with fees shown inline from step one completed 2.1\u00d7 more often in the A/B test than end-loaded totals."],
     ["Design for thumbs, not cursors", "82% of drop-off sessions were mobile. A sticky CTA, larger targets and single-column forms drove the mobile lift."]].forEach(function (c, i) {
      var x = 84 + i * 352;
      R(x, 1816, 328, 200, { r: 16 });
      T(x + 24, 1842, 280, 48, c[0], { size: 16.5, weight: 700, lh: 1.3 });
      T(x + 24, 1898, 280, 100, c[1], { font: INT, size: 13, color: MUT, lh: 1.55 });
    });
    /* 03 process */
    SEC(2090, "03 \u2014 DESIGN PROCESS", "Iterating toward one page");
    T(84, 2216, 680, 90, "Twelve wireframe variants were tested down to three, then one. Each round removed a step \u2014 merging address and payment, deferring signup, surfacing fees inline.", { font: INT, size: 16.5, color: MUT, lh: 1.65 });
    IMG(84, 2330, 1032, 420, "PROCESS IMAGE \u2014 WIREFRAMES, FLOWS, ITERATIONS");
    /* 04 solution */
    SEC(2820, "04 \u2014 THE SOLUTION", "One page, zero surprises");
    IMG(84, 2946, 504, 380, "UI SHOT \u2014 BEFORE / AFTER");
    IMG(612, 2946, 504, 380, "UI SHOT \u2014 FEES & EXPRESS PAY");
    T(84, 3340, 504, 24, "SINGLE-PAGE CHECKOUT \u2014 BEFORE / AFTER", { font: MONO, size: 10.5, color: MUT, ls: 1.5 });
    T(612, 3340, 504, 24, "FEE TRANSPARENCY & EXPRESS PAY", { font: MONO, size: 10.5, color: MUT, ls: 1.5 });
    /* 05 outcomes */
    SEC(3420, "05 \u2014 OUTCOMES", "Results & what's next");
    T(84, 3546, 720, 120, "Shipped to 100% of traffic in Q1. Checkout conversion rose 38%, payment tickets fell 52%, and the flow now closes in under 90 seconds on mobile. Next: saved payment methods and one-tap reorder.", { font: INT, size: 16.5, color: MUT, lh: 1.65 });
    /* footer */
    R(84, 3710, 1032, 1, { fill: "#2E2B24" });
    T(84, 3742, 500, 44, "Thanks for reading", { size: 28, weight: 700 });
    T(616, 3752, 500, 24, "AJAYKATTA.COM \u00b7 HELLO@AJAYKATTA.COM", { font: MONO, size: 11, color: MUT, ls: 1.5, align: "right" });
    return { h: 3860, bg: "#1C1A14", grid: { on: false, cols: 12, gutter: 24, margin: 84, snap: true }, els: els };
  }

  /* ============================================================ BUILT-IN THEME: AI prompt showcase (split image + spec panel) */
  function promptShowcaseTheme() {
    var INT = "'Inter',sans-serif", MONO = "'Courier New',monospace";
    var PUR = "#8B7CF6", INK = "#17181C", GRAY = "#8A8794", LAB = "#5A5668", HAIR = "#E9E7F0";
    var els = [];
    function T(x, y, w, hh, text, o) {
      els.push({ id: uid(), kind: "rect", x: x, y: y, w: w, h: hh, r: 0, fill: "none", stroke: "", strokeW: 0, opacity: 1,
        content: Object.assign({ type: "text", text: text, font: INT, size: 14, weight: 500, color: INK, ls: 0, lh: 1.4, align: "left", valign: "top", pt: 0, pr: 0, pb: 0, pl: 0, strokeW: 0, strokeC: "#000000" }, o) });
    }
    function R(x, y, w, hh, o) {
      els.push(Object.assign({ id: uid(), kind: "rect", x: x, y: y, w: w, h: hh, r: 0, fill: "#FFFFFF", stroke: "", strokeW: 0, opacity: 1, content: null }, o));
    }
    function CHIP(x, y, w, label) {
      R(x, y, w, 32, { r: 99, fill: "#EFEAFB", stroke: "#F0D7EE", strokeW: 1 });
      T(x, y, w, 32, label, { size: 11.5, weight: 600, color: PUR, align: "center", valign: "middle" });
    }
    /* white split card on dark backdrop */
    R(40, 40, 1120, 880, { r: 26, shadow: 45 });
    /* left: image placeholder frame + soft nav arrows */
    R(40, 40, 656, 880, { r: 26, fill: "#EDE6DC" });
    T(40, 40, 656, 880, "SHOWCASE IMAGE\nSet Content \u2192 Image on this frame, then double-click to adjust", { font: MONO, size: 12, color: "#8F857A", ls: 2, lh: 1.9, align: "center", valign: "middle", pt: 20, pr: 60, pb: 20, pl: 60 });
    els.push({ id: uid(), kind: "ellipse", x: 64, y: 458, w: 44, h: 44, r: 0, fill: "rgba(255,255,255,.55)", stroke: "", strokeW: 0, opacity: 1,
      content: { type: "text", text: "\u2039", font: INT, size: 20, weight: 500, color: "#6B6560", ls: 0, lh: 1, align: "center", valign: "middle", pt: 0, pr: 0, pb: 4, pl: 0, strokeW: 0, strokeC: "#000" } });
    els.push({ id: uid(), kind: "ellipse", x: 628, y: 458, w: 44, h: 44, r: 0, fill: "rgba(255,255,255,.55)", stroke: "", strokeW: 0, opacity: 1,
      content: { type: "text", text: "\u203A", font: INT, size: 20, weight: 500, color: "#6B6560", ls: 0, lh: 1, align: "center", valign: "middle", pt: 0, pr: 0, pb: 4, pl: 0, strokeW: 0, strokeC: "#000" } });
    /* right panel */
    T(1066, 78, 30, 30, "\u2715", { size: 17, weight: 400, color: "#4A4750", align: "center", valign: "middle" });
    T(727, 86, 320, 20, "\u2014  PROMPT 06", { font: INT, size: 12, weight: 700, color: PUR, ls: 2.6, caseT: "uppercase" });
    T(727, 114, 356, 42, "Female Model Wearing Handbag", { size: 21, weight: 700, lh: 1.2, ls: -0.3 });
    R(727, 172, 366, 1, { fill: HAIR });
    T(727, 194, 366, 18, "REFERENCES USED FOR THIS PROMPT", { size: 10.5, weight: 700, color: LAB, ls: 1.8 });
    [0, 1, 2].forEach(function (i) {
      var x = 727 + i * 68;
      R(x, 222, 58, 58, { r: 10, fill: "#F6F3EC", stroke: "#E5E1D6", strokeW: 1 });
      T(x, 222, 58, 58, "REF " + (i + 1), { font: MONO, size: 8.5, color: "#A9A294", ls: 1, align: "center", valign: "middle" });
    });
    T(935, 228, 158, 50, "+ all 10 refs provided for product fidelity", { size: 11, color: GRAY, lh: 1.5 });
    R(727, 304, 366, 1, { fill: HAIR });
    T(727, 326, 366, 18, "AI PROMPT USED", { size: 10.5, weight: 700, color: LAB, ls: 1.8 });
    /* code block with purple accent bar */
    R(727, 354, 4, 328, { r: 2, fill: PUR });
    R(737, 354, 356, 328, { r: 10, fill: "#0D1130", stroke: "#23284D", strokeW: 1 });
    T(737, 354, 356, 328, '{\n  "id": 7,\n  "name": "Female Model Wearing Handbag",\n  "type": "product",\n  "prompt": "Use all input images as\nreference for the same handbag design,\nshape, material, color and proportions.\nDo not change the product design.\nGenerate a lifestyle product photo with\na female model wearing the bag on one\nshoulder. Premium indoor studio,\nneutral tones, fashion brand lighting."\n}', { font: MONO, size: 12, weight: 500, color: "#A9B2F0", lh: 1.72, valign: "top", pt: 16, pr: 16, pb: 16, pl: 16 });
    T(727, 702, 366, 18, "SHOT PARAMETERS", { size: 10.5, weight: 700, color: LAB, ls: 1.8 });
    CHIP(727, 728, 108, "Lifestyle Shot"); CHIP(845, 728, 108, "Female Model"); CHIP(963, 728, 118, "Shoulder Carry");
    CHIP(727, 770, 112, "Cherry Charm"); CHIP(849, 770, 100, "Trench Coat"); CHIP(959, 770, 128, "Fashion Editorial");
    CHIP(727, 812, 140, "Studio Background");
    return { h: 960, bg: "#161519", grid: { on: false, cols: 12, gutter: 24, margin: 40, snap: true }, els: els };
  }

  /* ============================================================ PDF → case-study theme */
  function loadPdfJs() {
    return loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js").then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      return window.pdfjsLib;
    });
  }
  function extractPageText(page) {
    return page.getTextContent().then(function (tc) {
      var lines = [];
      tc.items.forEach(function (it) {
        if (!it.str || !it.str.trim()) return;
        var y = it.transform[5], sz = Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 10;
        var ln = null;
        for (var i = 0; i < lines.length; i++) if (Math.abs(lines[i].y - y) < Math.max(3, sz * 0.45)) { ln = lines[i]; break; }
        if (!ln) { ln = { y: y, size: sz, parts: [] }; lines.push(ln); }
        ln.parts.push({ x: it.transform[4], str: it.str });
        if (sz > ln.size) ln.size = sz;
      });
      lines.sort(function (a, b) { return b.y - a.y; });
      lines.forEach(function (l) {
        l.parts.sort(function (a, b) { return a.x - b.x; });
        l.text = l.parts.map(function (p) { return p.str; }).join(" ").replace(/\s+/g, " ").trim();
      });
      lines = lines.filter(function (l) { return l.text; });
      var maxSz = 0;
      lines.forEach(function (l) { if (l.size > maxSz) maxSz = l.size; });
      var title = "", body = [], prev = null;
      lines.forEach(function (l) {
        if (!title && l.size >= maxSz * 0.85 && l.text.length < 90) { title = l.text; prev = l; return; }
        if (prev && (prev.y - l.y) > Math.max(prev.size, l.size) * 2 && body.length) body.push("");
        body.push(l.text);
        prev = l;
      });
      var txt = body.join("\n").replace(/\n{3,}/g, "\n\n");
      txt = txt.split("\n\n").map(function (p) { return p.replace(/\n/g, " "); }).join("\n\n");
      return { title: title, body: txt, chars: txt.replace(/\s/g, "").length };
    }, function () { return { title: "", body: "", chars: 0 }; });
  }
  function imgObjToDataURL(obj) {
    if (!obj) return null;
    try {
      var w = obj.width, hgt = obj.height, cv, ctx;
      var bmp = (typeof ImageBitmap !== "undefined" && obj instanceof ImageBitmap) ? obj : obj.bitmap;
      if (bmp) {
        w = w || bmp.width; hgt = hgt || bmp.height;
        cv = document.createElement("canvas"); cv.width = w; cv.height = hgt;
        cv.getContext("2d").drawImage(bmp, 0, 0);
        return { src: cv.toDataURL("image/jpeg", 0.82), w: w, h: hgt };
      }
      if (obj.data && w && hgt) {
        cv = document.createElement("canvas"); cv.width = w; cv.height = hgt;
        ctx = cv.getContext("2d");
        var id = ctx.createImageData(w, hgt), d = id.data, s = obj.data, npx = w * hgt, i;
        if (s.length === npx * 4) { d.set(s); }
        else if (s.length === npx * 3) { for (i = 0; i < npx; i++) { d[i * 4] = s[i * 3]; d[i * 4 + 1] = s[i * 3 + 1]; d[i * 4 + 2] = s[i * 3 + 2]; d[i * 4 + 3] = 255; } }
        else if (s.length === npx) { for (i = 0; i < npx; i++) { d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = s[i]; d[i * 4 + 3] = 255; } }
        else return null;
        ctx.putImageData(id, 0, 0);
        return { src: cv.toDataURL("image/jpeg", 0.82), w: w, h: hgt };
      }
    } catch (e) {}
    return null;
  }
  function extractPageImages(page, pdfjs) {
    return page.getOperatorList().then(function (ops) {
      var names = [], i;
      for (i = 0; i < ops.fnArray.length; i++) {
        var fn = ops.fnArray[i];
        if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintImageXObjectRepeat || fn === pdfjs.OPS.paintJpegXObject) names.push(ops.argsArray[i][0]);
      }
      var out = [], seen = {};
      names.forEach(function (nm) {
        if (seen[nm] || out.length >= 2) return; seen[nm] = 1;
        var obj = null;
        try { obj = page.objs.get(nm); } catch (e) { try { obj = page.commonObjs.get(nm); } catch (e2) {} }
        var r = imgObjToDataURL(obj);
        if (r && r.w >= 200 && r.h >= 110) out.push({ src: r.src, ar: r.h / r.w });
      });
      return { imgs: out, hadImages: names.length > 0 };
    }, function () { return { imgs: [], hadImages: false }; });
  }
  function pdfCaseTheme(title, pages) {
    var SG = "'Inter',sans-serif", INT = "'Inter',sans-serif", MONO = "'Inter',sans-serif";
    var AC = "#E5783A", TX = "#FFFFFF", MUT = "#C9C8C6", LN = "#373634";
    var els = [];
    function T(x, y, w, hh, text, o) {
      els.push({ id: uid(), kind: "rect", x: x, y: y, w: w, h: hh, r: 0, fill: "none", stroke: "", strokeW: 0, opacity: 1,
        content: Object.assign({ type: "text", text: text, font: SG, size: 16, weight: 500, color: TX, ls: 0, lh: 1.4, align: "left", valign: "top", pt: 0, pr: 0, pb: 0, pl: 0, strokeW: 0, strokeC: "#000000" }, o) });
    }
    function R(x, y, w, hh, o) {
      els.push(Object.assign({ id: uid(), kind: "rect", x: x, y: y, w: w, h: hh, r: 0, fill: "none", stroke: "", strokeW: 0, opacity: 1, content: null }, o));
    }
    function bodyH(txt, w, fs, lh) {
      var cpl = Math.max(16, Math.floor(w / (fs * 0.52))), n = 0;
      String(txt).split("\n").forEach(function (p) { n += Math.max(1, Math.ceil(p.length / cpl)); });
      return Math.ceil(n * fs * lh) + 10;
    }
    function IMGEL(x, yy, w, hh2, src, rr) {
      els.push({ id: uid(), kind: "rect", x: x, y: yy, w: w, h: hh2, r: rr || 14, fill: "#14120D", stroke: LN, strokeW: 1, opacity: 1, content: { type: "image", src: src, fit: "contain" } });
    }
    T(84, 96, 640, 22, "UI/UX CASE STUDY", { font: MONO, size: 13, weight: 700, color: AC, ls: 4 });
    var tt = String(title || "Case study").slice(0, 120);
    var tH = bodyH(tt, 980, 54, 1.15);
    T(84, 134, 980, tH, tt, { size: 54, weight: 700, lh: 1.15, ls: -0.5 });
    var first = pages[0] || { title: "", body: "" };
    var paras = String(first.body || "").split("\n").filter(function (p) { return p.trim(); });
    var intro = (paras[0] || "").slice(0, 280) || "Replace this line with a one-sentence summary of the project.";
    var y = 134 + tH + 20;
    var iH = bodyH(intro, 800, 18, 1.55);
    T(84, y, 800, iH, intro, { font: INT, size: 18, color: MUT, lh: 1.55 });
    y += iH + 30;
    [["ROLE", "Add your role"], ["TIMELINE", "Add timeline"], ["PLATFORM", "Add platforms"], ["TOOLS", "Add tools"]].forEach(function (m, i) {
      var x = 84 + i * 258;
      T(x, y, 234, 16, m[0], { font: MONO, size: 10, weight: 700, color: AC, ls: 2 });
      T(x, y + 22, 234, 40, m[1], { font: INT, size: 14, color: TX, lh: 1.45 });
    });
    y += 96;
    var heroImg = (first.imgs && first.imgs[0]) || first.img;
    if (heroImg) {
      var hh0 = Math.min(640, Math.round(1032 * heroImg.ar));
      IMGEL(84, y, 1032, hh0, heroImg.src, 18);
      y += hh0 + 56;
    }
    var secs = [];
    var rest = paras.length ? paras.slice(1).join("\n") : "";
    if (rest.trim().length > 80 || (first.imgs && first.imgs.length > 1) || first.pageShot) {
      secs.push({ title: first.title && first.title !== tt ? first.title : "Overview", body: rest, imgs: (first.imgs || []).slice(1), pageShot: first.pageShot });
    }
    for (var i2 = 1; i2 < pages.length; i2++) secs.push(pages[i2]);
    if (!secs.length && !first.img) secs.push({ title: "Overview", body: "Add the story of this project here \u2014 problem, process, solution and outcomes." });
    secs.forEach(function (pg, i) {
      var num = ("0" + (i + 1)).slice(-2);
      R(84, y, 1032, 1, { fill: "#2E2B24" });
      T(84, y + 30, 200, 20, num, { font: MONO, size: 12.5, weight: 700, color: AC, ls: 3 });
      var st = String(pg.title || "Untitled section").slice(0, 90);
      var stH = bodyH(st, 860, 30, 1.2);
      T(84, y + 56, 860, stH, st, { size: 30, weight: 700, lh: 1.2 });
      y += 56 + stH + 22;
      var b = String(pg.body || "").slice(0, 2600);
      if (b.trim()) {
        var bh = bodyH(b, 780, 16.5, 1.65);
        T(84, y, 780, bh, b, { font: INT, size: 16.5, color: MUT, lh: 1.65 });
        y += bh + 30;
      }
      var gal = (pg.imgs || []).slice();
      if (pg.pageShot) gal.push(pg.pageShot);
      if (pg.img) gal.push(pg.img);
      if (gal.length >= 2) {
        var rh = Math.min(560, Math.max(Math.round(504 * gal[0].ar), Math.round(504 * gal[1].ar)));
        IMGEL(84, y, 504, rh, gal[0].src); IMGEL(612, y, 504, rh, gal[1].src);
        y += rh + 30;
      } else if (gal.length === 1) {
        var ih = Math.min(700, Math.round(1032 * gal[0].ar));
        IMGEL(84, y, 1032, ih, gal[0].src);
        y += ih + 30;
      }
      y += 34;
    });
    R(84, y, 1032, 1, { fill: "#2E2B24" });
    T(84, y + 32, 500, 44, "Thanks for reading", { size: 28, weight: 700 });
    T(616, y + 42, 500, 24, "ADD YOUR SITE \u00b7 ADD YOUR EMAIL", { font: MONO, size: 11, color: MUT, ls: 1.5, align: "right" });
    return { h: y + 160, bg: "#1C1A14", grid: { on: false, cols: 12, gutter: 24, margin: 84, snap: true }, els: els };
  }

  /* ============================================================ ELEMENT RENDER (shared) */
  function applyBoxStyle(node, el) {
    node.style.left = el.x + "px"; node.style.top = el.y + "px";
    node.style.width = el.w + "px"; node.style.height = el.h + "px";
    node.style.borderRadius = el.kind === "ellipse" ? "50%" : (el.r || 0) + "px";
    node.style.background = (el.fill && el.fill !== "none") ? el.fill : "transparent";
    node.style.border = (el.stroke && el.strokeW) ? el.strokeW + "px solid " + el.stroke : "none";
    node.style.opacity = el.opacity != null ? el.opacity : 1;
    node.style.overflow = "hidden";
    var sv = clamp(el.shadow || 0, 0, 100);
    if (sv) {
      var t = sv / 100, hasBox = (el.fill && el.fill !== "none") || (el.stroke && el.strokeW);
      if (hasBox) {
        node.style.boxShadow = "0 " + Math.round(6 + 26 * t) + "px " + Math.round(16 + 46 * t) + "px " + Math.round(-6 - 10 * t) + "px rgba(0,0,0," + (0.2 + 0.42 * t).toFixed(2) + "),0 " + Math.round(2 + 6 * t) + "px " + Math.round(8 + 14 * t) + "px rgba(0,0,0," + (0.12 + 0.24 * t).toFixed(2) + ")";
        node.style.filter = "";
      } else {
        /* no fill or stroke (plain text, transparent frames): shadow the rendered pixels, not the box */
        node.style.filter = "drop-shadow(0 " + Math.round(3 + 14 * t) + "px " + Math.round(6 + 22 * t) + "px rgba(0,0,0," + (0.25 + 0.45 * t).toFixed(2) + "))";
        node.style.boxShadow = "";
      }
    } else { node.style.boxShadow = ""; node.style.filter = ""; }
  }
  function imgTf(c) {
    var z = c.z || 1, ox = c.ox || 0, oy = c.oy || 0;
    if (z === 1 && !ox && !oy) return "";
    return "transform:translate(" + ox + "px," + oy + "px) scale(" + z + ");transform-origin:center center;";
  }
  /* Text as a flex block. flow = grid mode (height follows the text, no clipping). */
  function textBlock(c, flow) {
      var wrapS = "width:100%;" + (flow ? "" : "height:100%;overflow:hidden;") + "display:flex;box-sizing:border-box;" +
        "padding:" + (c.pt || 0) + "px " + (c.pr || 0) + "px " + (c.pb || 0) + "px " + (c.pl || 0) + "px;" +
        "align-items:" + ({ top: "flex-start", middle: "center", bottom: "flex-end" }[c.valign || "middle"]) + ";" +
        "justify-content:" + ({ left: "flex-start", center: "center", right: "flex-end" }[c.align || "left"]) + ";";
      var tsz = c.size || 28;
      var tS = "font-family:" + (c.font || FONTS[0][0]) + ";font-size:" + (flow ? "min(" + tsz + "px," + (tsz / 11.2).toFixed(3) + "cqw)" : tsz + "px") + ";font-weight:" + (c.weight || 600) +
        ";color:" + (c.color || "#FFFFFF") + ";letter-spacing:" + (c.ls || 0) + "px;line-height:" + (c.lh || 1.3) +
        ";text-align:" + (c.align || "left") + ";white-space:pre-wrap;word-break:break-word;max-width:100%;";
      if (c.strokeW) tS += "-webkit-text-stroke:" + c.strokeW + "px " + (c.strokeC || "#000") + ";";
      if (c.italic) tS += "font-style:italic;";
      if (c.deco) tS += "text-decoration:" + c.deco + ";";
      if (c.caseT) tS += "text-transform:" + c.caseT + ";";
      return h("div", { style: wrapS }, [h("div", { style: tS }, [c.text || ""])]);
  }
  function renderContent(el, editing) {
    var c = el.content; if (!c) return null;
    if (c.type === "text") return textBlock(c, false);
    var common = "width:100%;height:100%;border:0;display:block;";
    if (c.type === "image") return h("img", { src: blobURL(c.src), draggable: "false", style: common + "object-fit:" + (c.fit || "cover") + ";" + imgTf(c) });
    if (c.type === "media") {
      if ((c.mime || "").indexOf("audio") === 0) {
        if (editing) return h("div", { class: "akls-audio", style: "color:var(--muted,#999)", html: ICO.audio });
        return h("div", { class: "akls-audio" }, [h("audio", { src: blobURL(c.src), controls: "", style: "width:100%" })]);
      }
      var v = h("video", { src: blobURL(c.src), playsinline: "", style: common + "object-fit:" + (c.fit || "cover") + ";" + imgTf(c) });
      if (!editing) v.setAttribute("controls", "");
      return v;
    }
    if (c.type === "pdf") return h("iframe", { src: blobURL(c.src) + "#toolbar=0", title: "PDF", style: common + "background:#fff" });
    if (c.type === "prototype") return h("iframe", { src: c.src, allowfullscreen: "", loading: "lazy", style: common + "background:#000" });
    if (c.type === "model") {
      var holder = h("div", { style: common + "position:relative" });
      loadScript("https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js", "module").then(function () {
        var mv = document.createElement("model-viewer");
        mv.setAttribute("src", blobURL(c.src));
        mv.setAttribute("camera-controls", ""); mv.setAttribute("auto-rotate", "");
        mv.setAttribute("shadow-intensity", "1"); mv.setAttribute("exposure", "1.1");
        mv.setAttribute("environment-image", "neutral"); mv.setAttribute("tone-mapping", "neutral");
        mv.style.cssText = "width:100%;height:100%;--poster-color:transparent";
        holder.appendChild(mv);
      }).catch(function () { holder.appendChild(h("div", { class: "akls-audio", style: "color:#999", html: ICO.cube })); });
      return holder;
    }
    return null;
  }
  /* Hover layer on a bento tile: hero line (the detail title) + open cue. */
  function bentoHover(el, editing) {
    var d = el.detail || {};
    var hero = String(d.title || "").trim() || String(d.eyebrow || "").trim();
    var ov = h("div", { class: "akls-bhov" });
    var c = el.content;
    if (c && c.src) {
      var chip = h("div", { class: "akls-bsize" });
      fileFacts(c.src, c.mime, function (f) { var t = factsText(f); if (t) chip.textContent = t; else chip.remove(); });
      ov.appendChild(chip);
    }
    if (hero) ov.appendChild(h("div", { class: "akls-bhero" }, [hero]));
    else if (editing) ov.appendChild(h("div", { class: "akls-bhero ph" }, ["Add a title in the detail view"]));
    ov.appendChild(h("div", { class: "akls-bcta" }, [
      h("span", {}, [String(d.cta || "Open prompt")]),
      h("span", { class: "akls-barr" }, [h("span", {}, ["\u2192"])])
    ]));
    return ov;
  }
  function renderEl(el, editing) {
    var node = h("div", { class: "akls-el" + (el.bento ? " akls-bento" : "") });
    node.setAttribute("data-el-id", el.id);
    applyBoxStyle(node, el);
    var c = renderContent(el, editing);
    if (c) node.appendChild(c);
    if (el.bento) node.appendChild(bentoHover(el, editing));
    return node;
  }

  /* ============================================================ GRID MODE
     Two layout options for a bento canvas, stored on design.layout:
       "canvas" (default) — the freeform bento boxes, untouched.
       "grid"            — the SAME cards reflowed into one vertical column,
                            each full width at full size (image / video /
                            prototype / PDF / 3D), in reading order. */
  function readingOrder(els) {
    var list = els.slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
    var rows = [], cur = null;
    list.forEach(function (e) {
      if (!cur || e.y > cur.bottom - Math.min(e.h, cur.maxH) * 0.45) { cur = { bottom: e.y + e.h, maxH: e.h, items: [e] }; rows.push(cur); }
      else { cur.items.push(e); cur.bottom = Math.max(cur.bottom, e.y + e.h); cur.maxH = Math.max(cur.maxH, e.h); }
    });
    var out = [];
    rows.forEach(function (r) { r.items.sort(function (a, b) { return a.x - b.x; }).forEach(function (e) { out.push(e); }); });
    return out;
  }
  /* Rows worth stacking: media, text and bento cards. Pure decoration (empty
     rects, lines, circles) only means something at a fixed position — skipped. */
  function gridEls(design) {
    return readingOrder((design.els || []).filter(function (el) {
      if (el.hidden) return false;
      return !!(el.content || el.bento);
    }));
  }
  function gridAspect(el) { return Math.max(1, Math.round(el.w || 16)) + "/" + Math.max(1, Math.round(el.h || 10)); }
  function gridMedia(el) {
    var c = el.content;
    if (c.type === "image") return h("img", { src: blobURL(c.src), draggable: "false", alt: "", style: "width:100%;height:auto;display:block" });
    if (c.type === "media" && (c.mime || "").indexOf("audio") !== 0)
      return h("video", { src: blobURL(c.src), playsinline: "", controls: "", style: "width:100%;height:auto;display:block;background:#000" });
    var inner = renderContent(el, false);
    if (c.type === "media") return h("div", { style: "padding:16px" }, [inner]); /* audio */
    /* prototype / PDF / 3D: keep the card's own aspect so the frame stays usable */
    var box = h("div", { class: "akls-gmedia", style: "aspect-ratio:" + gridAspect(el) + ";min-height:340px" });
    if (inner) box.appendChild(inner);
    return box;
  }
  function gridRow(el, design) {
    if (el.content && el.content.type === "text" && !el.bento)
      return h("div", { class: "akls-gitem" }, [textBlock(el.content, true)]);
    var card = h("div", { class: "akls-gcard" + (el.bento ? " akls-bento" : "") });
    card.setAttribute("data-el-id", el.id);
    card.style.borderRadius = (el.r != null ? el.r : 14) + "px";
    if (el.fill && el.fill !== "none") card.style.background = el.fill;
    if (el.stroke && el.strokeW) card.style.border = el.strokeW + "px solid " + el.stroke;
    if (el.content) card.appendChild(gridMedia(el));
    else card.appendChild(h("div", { class: "akls-gph", style: "aspect-ratio:" + gridAspect(el) },
      [(el.detail && el.detail.eyebrow) ? String(el.detail.eyebrow) : "Empty card \u2014 open it to add media"]));
    if (el.bento) card.appendChild(bentoHover(el, false));
    var kids = [card];
    if (el.bento && design.gridCaps !== false) {
      var d = el.detail || {}, eye = String(d.eyebrow || "").trim(), ttl = String(d.title || "").trim();
      if (eye || ttl) kids.push(h("div", { class: "akls-gcap" }, [
        eye ? h("div", { class: "akls-geye" }, [eye]) : null,
        ttl ? h("div", { class: "akls-gttl" }, [ttl]) : null
      ]));
    }
    return h("div", { class: "akls-gitem" }, kids);
  }
  function renderGrid(holder, design, opts) {
    injectCSS();
    design = design || { els: [] };
    holder.innerHTML = "";
    var editable = !!(opts && opts.editable), capT = null;
    var items = gridEls(design), sibs = (design.els || []).filter(function (x) { return x.bento; });
    var col = h("div", { class: "akls-gcol", style: "--ggap:" + (design.gridGap != null ? design.gridGap : 34) + "px" });
    items.forEach(function (el) { col.appendChild(gridRow(el, design)); });
    if (!items.length) col.appendChild(h("div", { class: "akls-gempty" }, ["Nothing to stack yet \u2014 add bento cards or media on the canvas and they show up here, full width."]));
    col.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest(".akls-bento") : null;
      if (!t || !col.contains(t)) return;
      var id = t.getAttribute("data-el-id"), el = null;
      (design.els || []).forEach(function (x) { if (x.id === id) el = x; });
      if (!el) return;
      openBentoDetail(el, sibs, editable, function (tEl, kind) {
        if (kind === "content") renderGrid(holder, design, opts);
        else { clearTimeout(capT); capT = setTimeout(function () { renderGrid(holder, design, opts); }, 500); }
        if (opts && opts.onChange) opts.onChange(tEl, kind);
      });
    });
    holder.appendChild(h("div", { class: "akls-gridview", style: design.bg ? "background:" + design.bg : "" }, [col]));
  }

  /* ============================================================ VIEWER */
  /* Live height of a design: trim any unused canvas below the last element so a
     visitor never scrolls through empty space the author left in the editor.
     A small tail keeps the last card off the very edge; never grows the canvas. */
  function liveH(design) {
    var declared = design.h || 600, bottom = 0;
    (design.els || []).forEach(function (el) { if (el && !el.hidden) bottom = Math.max(bottom, (el.y || 0) + (el.h || 0)); });
    if (!bottom) return declared;
    return Math.max(120, Math.min(declared, Math.round(bottom + 20)));
  }

  function render(holder, design, opts) {
    injectCSS();
    design = design || { h: 600, els: [] };
    if (design.layout === "grid") return renderGrid(holder, design, opts);
    var DH = liveH(design);
    holder.innerHTML = "";
    var stage = h("div", { class: "akls-stage", style: "width:" + DW + "px;height:" + DH + "px;background:" + (design.bg || "transparent") });
    (design.els || []).forEach(function (el) { if (el.hidden) return; stage.appendChild(renderEl(el, false)); });
    stage.addEventListener("click", function (e) {
      var t = e.target && e.target.closest ? e.target.closest(".akls-bento") : null; if (!t || !stage.contains(t)) return;
      var id = t.getAttribute("data-el-id"), list = (design.els || []).filter(function (x) { return x.bento; }), el = null;
      (design.els || []).forEach(function (x) { if (x.id === id) el = x; });
      var editable = !!(opts && opts.editable);
      var oc = function (t, kind) {
        if (kind === "content") { var old = stage.querySelector('[data-el-id="' + t.id + '"]'); if (old) old.replaceWith(renderEl(t, false)); fit(); }
        if (opts && opts.onChange) opts.onChange(t, kind);
      };
      if (el) openBentoDetail(el, list, editable, editable ? oc : null);
    });
    var wrap = h("div", { class: "akls-view" }, [stage]);
    holder.appendChild(wrap);
    function fit() {
      var w = wrap.clientWidth || 1, k = w / DW, dh = liveH(design);
      stage.style.height = dh + "px";
      stage.style.transform = "scale(" + k + ")";
      wrap.style.height = (dh * k) + "px";
    }
    if (window.ResizeObserver) { try { new ResizeObserver(fit).observe(wrap); } catch (e) {} }
    fit(); requestAnimationFrame(fit);
  }

  /* Cover-fit renderer: scales the design to FILL the holder box (any aspect),
     centered and clipped. Used for decoration overlays on the index tiles. */
  function renderCover(holder, design) {
    injectCSS();
    design = design || { h: 700, els: [] };
    holder.innerHTML = "";
    var dh = design.h || 700;   // cover-fit crops to its box — trimming here would rescale existing overlays
    var stage = h("div", { class: "akls-stage", style: "width:" + DW + "px;height:" + dh + "px;background:" + (design.bg || "transparent") });
    (design.els || []).forEach(function (el) { if (el.hidden) return; stage.appendChild(renderEl(el, false)); });
    var wrap = h("div", { class: "akls-view", style: "height:100%" }, [stage]);
    holder.appendChild(wrap);
    function fit() {
      var w = wrap.clientWidth || 1, hgt = wrap.clientHeight || 1;
      var k = Math.max(w / DW, hgt / dh);
      stage.style.transformOrigin = "0 0";
      stage.style.transform = "translate(" + ((w - DW * k) / 2) + "px," + ((hgt - dh * k) / 2) + "px) scale(" + k + ")";
    }
    if (window.ResizeObserver) { try { new ResizeObserver(fit).observe(wrap); } catch (e) {} }
    fit(); requestAnimationFrame(fit);
  }

  /* ============================================================ EDITOR */
  function openEditor(opts) {
    injectCSS();
    opts = opts || {};
    var D = opts.design ? copy(opts.design) : { h: 700, bg: "#1C1A14", els: [] };
    D.els = D.els || []; D.h = D.h || 700; D.groups = D.groups || {};
    var HMAXCAP = 60000;  // a real case study stacks far past the old 6000-unit ceiling
    D.layout = D.layout === "grid" ? "grid" : "canvas";
    var sel = null, selSet = new Set(), adjust = false, k = 0.7, zoomMode = "fit";
    var lastLayerId = null, collapsed = new Set();
    function setSel(id) { sel = id; selSet.clear(); if (id) selSet.add(id); adjust = false; }
    function selEls() { return D.els.filter(function (x) { return selSet.has(x.id); }); }
    function memberEls(g) { return D.els.filter(function (x) { return x.grp === g; }); }
    function memberIds(g) { return memberEls(g).map(function (x) { return x.id; }); }
    function expandGroups(ids) {
      var s = new Set(ids), grps = new Set();
      s.forEach(function (id) { var e = D.els.find(function (x) { return x.id === id; }); if (e && e.grp) grps.add(e.grp); });
      grps.forEach(function (g) { memberIds(g).forEach(function (id) { s.add(id); }); });
      return s;
    }
    function editableEls() { return selEls().filter(function (x) { return !x.locked; }); }
    function visualIds() { return D.els.map(function (e) { return e.id; }).reverse(); }
    function newGrpId() { return "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
    function pruneGroups() {
      Object.keys(D.groups).forEach(function (g) { if (!memberEls(g).length) { delete D.groups[g]; collapsed.delete(g); } });
    }
    /* keep every group's members contiguous in the z-order array (front-anchored, order-stable) */
    function reclusterGroups() {
      var out = [], emitted = {};
      D.els.forEach(function (e) {
        if (e.grp) { if (!emitted[e.grp]) { emitted[e.grp] = 1; out.push.apply(out, memberEls(e.grp)); } }
        else out.push(e);
      });
      D.els = out;
    }

    /* ---- history: 20-step undo / redo ---- */
    var HMAX = 20, hist = [], redoS = [], lastTok = null, lastT = 0;
    function copyDesign(d) {
      return { h: d.h, bg: d.bg, layout: d.layout, gridGap: d.gridGap, gridCaps: d.gridCaps, groups: JSON.parse(JSON.stringify(d.groups || {})), els: (d.els || []).map(function (e) {
        return Object.assign({}, e, { content: e.content ? Object.assign({}, e.content) : null });
      }) };
    }
    function sig(d) {
      return JSON.stringify(d, function (k2, v) { return (typeof v === "string" && v.length > 80) ? v.length + ":" + v.slice(0, 40) : v; });
    }
    function pushPre(pre) {
      if (hist.length && sig(hist[hist.length - 1]) === sig(pre)) { redoS.length = 0; updateHistBtns(); return; }
      hist.push(pre); if (hist.length > HMAX) hist.shift();
      redoS.length = 0; lastTok = null; updateHistBtns();
    }
    function snapNow() { pushPre(copyDesign(D)); }
    function mark(tok) {
      var now = Date.now();
      if (tok !== lastTok || now - lastT > 900) pushPre(copyDesign(D));
      lastTok = tok; lastT = now;
    }
    function undo() {
      while (hist.length) {
        var s = hist.pop();
        if (sig(s) !== sig(D)) { redoS.push(copyDesign(D)); if (redoS.length > HMAX) redoS.shift(); D = s; afterHistory(); return; }
      }
      updateHistBtns();
    }
    function redoFn() {
      while (redoS.length) {
        var s = redoS.pop();
        if (sig(s) !== sig(D)) { hist.push(copyDesign(D)); if (hist.length > HMAX) hist.shift(); D = s; afterHistory(); return; }
      }
      updateHistBtns();
    }
    function afterHistory() {
      D.els = D.els || []; D.groups = D.groups || {};
      selSet = new Set(Array.from(selSet).filter(function (id) { return D.els.some(function (x) { return x.id === id; }); }));
      if (sel && !selSet.has(sel)) sel = selSet.size ? Array.from(selSet)[selSet.size - 1] : null;
      adjust = false; lastTok = null;
      D.layout = D.layout === "grid" ? "grid" : "canvas";
      fit(); paintStage(); paintPanel(); applyLayoutMode(); updateHistBtns();
    }
    function updateHistBtns() {
      if (!undoBtn || !redoBtn) return;
      undoBtn.disabled = !hist.length; redoBtn.disabled = !redoS.length;
    }

    /* ---- layout grid: 12-col web grid + 8px baseline snap ---- */
    var grid = Object.assign({ on: false, cols: 12, gutter: 24, margin: 36, snap: true }, D.grid || {});
    var gridEl = h("div", { class: "akls-grid" });
    function syncGrid() { D.grid = { on: grid.on, cols: grid.cols, gutter: grid.gutter, margin: grid.margin, snap: grid.snap }; }
    function paintGrid() {
      gridEl.innerHTML = "";
      gridEl.style.display = grid.on ? "" : "none";
      gridEl.style.padding = "0 " + grid.margin + "px";
      gridEl.style.gap = grid.gutter + "px";
      for (var i = 0; i < grid.cols; i++) gridEl.appendChild(h("div"));
      syncGrid();
    }
    function toggleGrid() { grid.on = !grid.on; gridBtn.classList.toggle("on", grid.on); paintGrid(); updateStatus(); if (!sel) paintPanel(); }
    function toggleLock() { grid.snap = !grid.snap; syncGrid(); lockBtn.classList.toggle("on", grid.snap); updateStatus(); if (!sel) paintPanel(); toast(grid.snap ? "Grid lock on \u2014 content snaps to the grid and can't leave it" : "Grid lock off \u2014 free placement"); }
    function colEdges() {
      var cw = (DW - 2 * grid.margin - (grid.cols - 1) * grid.gutter) / grid.cols;
      var edges = []; /* column edges only — canvas edges are outside the grid */
      for (var i = 0; i < grid.cols; i++) {
        var L = grid.margin + i * (cw + grid.gutter);
        edges.push(L, L + cw);
      }
      return edges;
    }
    function snapX(v) {
      if (!grid.snap) return v;
      var best = null, bd = Infinity;
      colEdges().forEach(function (e2) { var d = Math.abs(e2 - v); if (d < bd) { bd = d; best = e2; } });
      if (best != null && bd <= 12) return Math.round(best); /* magnet to column edge */
      return Math.round(v / 8) * 8; /* hard 8px quantize — nothing lands off-grid */
    }
    function snapY(v) {
      if (!grid.snap) return v;
      return Math.round(v / 8) * 8;
    }
    /* hard grid bounds: with lock on, nothing moves or scales past the grid area */
    function gridB() { return { l: grid.margin, r: DW - grid.margin, t: 0, b: D.h }; }
    function clampBoxToGrid(b) {
      if (!grid.snap) return b;
      var g = gridB();
      b.w = Math.min(b.w, g.r - g.l);
      b.h = Math.min(b.h, g.b - g.t);
      b.x = clamp(b.x, g.l, g.r - b.w);
      b.y = clamp(b.y, g.t, g.b - b.h);
      return b;
    }

    /* ---- smart alignment guides ---- */
    var guideV = h("div", { class: "akls-gl gv" }), guideH = h("div", { class: "akls-gl gh" });
    var measL = mkMeas(), measR = mkMeas(), measT = mkMeas(), measB = mkMeas();
    /* reference gaps: the spacing the NEIGHBOURING pair already keeps, on each side,
       so a gap can be replicated by eye (top\u2194middle shown while you drag bottom) */
    var measRefL = mkMeas(), measRefR = mkMeas(), measRefT = mkMeas(), measRefB = mkMeas();
    var MEAS = [measL, measR, measT, measB, measRefL, measRefR, measRefT, measRefB];
    function mkMeas() { return h("div", { class: "akls-meas" }, [h("b")]); }
    function hideGuides() { guideV.style.display = "none"; guideH.style.display = "none"; MEAS.forEach(function (m) { m.style.display = "none"; }); }
    /* pixel gap readout: nearest neighbor distance on each side while dragging.
       `sp` (from spacingSnap) optionally flags which side(s) locked to an equal /
       matched gap so those readouts turn green and the reference gap is drawn. */
    function paintGaps(el, sp) {
      var MAX = 420;
      var others = D.els.filter(function (o) { return o.id !== el.id && !selSet.has(o.id) && !o.hidden; });
      function oX(a, b) { return Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x); }
      function oY(a, b) { return Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y); }
      function midX(a, b) { var lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w); return hi > lo ? (lo + hi) / 2 : (a.x + a.w / 2 + b.x + b.w / 2) / 2; }
      function midY(a, b) { var lo = Math.max(a.y, b.y), hi = Math.min(a.y + a.h, b.y + b.h); return hi > lo ? (lo + hi) / 2 : (a.y + a.h / 2 + b.y + b.h / 2) / 2; }
      function pick(list, fn) {
        var bo = null, bg = Infinity;
        list.forEach(function (o) { var g = fn(o); if (g > 0.5 && g <= MAX && g < bg) { bg = g; bo = o; } });
        return bo ? { o: bo, g: bg } : null;
      }
      var NEAR = 320;  /* diagonal reach: how far off-axis a neighbour may sit and still be measured */
      function strict(a, list, ax) { return list.filter(function (o) { return (ax === "x" ? oX(a, o) : oY(a, o)) > 1; }); }
      function loose(a, list, ax) { return list.filter(function (o) { var v = ax === "x" ? oX(a, o) : oY(a, o); return v <= 1 && v > -NEAR; }); }
      function pick2(a, list, ax, fn) { return pick(strict(a, list, ax), fn) || pick(loose(a, list, ax), fn); }
      function rest(a) { return others.filter(function (o) { return o !== a; }); }
      var T = pick2(el, others, "x", function (o) { return el.y - (o.y + o.h); });
      var B = pick2(el, others, "x", function (o) { return o.y - (el.y + el.h); });
      var L = pick2(el, others, "y", function (o) { return el.x - (o.x + o.w); });
      var R = pick2(el, others, "y", function (o) { return o.x - (el.x + el.w); });
      var best = { l: null, r: null, t: null, b: null };
      if (T) {
        best.t = { g: T.g, x: midX(el, T.o), y: T.o.y + T.o.h, diag: oX(el, T.o) <= 1 };
        var t2 = pick2(T.o, rest(T.o), "x", function (o) { return T.o.y - (o.y + o.h); });
        if (t2) best.t.ref = { g: t2.g, x: midX(T.o, t2.o), y: t2.o.y + t2.o.h };
      }
      if (B) {
        best.b = { g: B.g, x: midX(el, B.o), y: el.y + el.h, diag: oX(el, B.o) <= 1 };
        var b2n = pick2(B.o, rest(B.o), "x", function (o) { return o.y - (B.o.y + B.o.h); });
        if (b2n) best.b.ref = { g: b2n.g, x: midX(B.o, b2n.o), y: B.o.y + B.o.h };
      }
      if (L) {
        best.l = { g: L.g, x: L.o.x + L.o.w, y: midY(el, L.o), diag: oY(el, L.o) <= 1 };
        var l2 = pick2(L.o, rest(L.o), "y", function (o) { return L.o.x - (o.x + o.w); });
        if (l2) best.l.ref = { g: l2.g, x: l2.o.x + l2.o.w, y: midY(L.o, l2.o) };
      }
      if (R) {
        best.r = { g: R.g, x: el.x + el.w, y: midY(el, R.o), diag: oY(el, R.o) <= 1 };
        var r2 = pick2(R.o, rest(R.o), "y", function (o) { return o.x - (R.o.x + R.o.w); });
        if (r2) best.r.ref = { g: r2.g, x: R.o.x + R.o.w, y: midY(R.o, r2.o) };
      }
      var lw = Math.max(1, 1.2 / k), fs = Math.round(clamp(10 / k, 9, 20));
      function bar(m, b2, horiz, cls, label) {
        if (!b2) { m.style.display = "none"; return; }
        var isRef = (cls || "").indexOf("ref") >= 0;
        m.className = "akls-meas" + (cls ? " " + cls : "") + (b2.diag && !isRef ? " diag" : "");
        var g = Math.max(0, b2.g);
        m.style.cssText = "display:block;left:" + b2.x + "px;top:" + b2.y + "px" +
          (horiz ? ";width:" + g + "px;height:" + lw + "px" : ";width:" + lw + "px;height:" + g + "px");
        if (isRef || b2.diag) m.style.backgroundImage = "repeating-linear-gradient(" + (horiz ? "to right" : "to bottom") +
          "," + (isRef ? "#2E90FA" : "#FF3B9A") + " 0 " + (3 / k) + "px,transparent " + (3 / k) + "px " + (6 / k) + "px)";
        var lb = m.firstChild; lb.style.fontSize = fs + "px";
        lb.innerHTML = Math.round(b2.g) + (label ? " <i>" + label + "</i>" : "");
      }
      /* a side reads green when it already matches the neighbouring pair's gap, or
         when the equal-gap magnet has it locked */
      function eq(s) { return s && s.ref && Math.abs(s.g - s.ref.g) < 0.51; }
      var magL = eq(best.l), magR = eq(best.r), magT = eq(best.t), magB = eq(best.b);
      if (sp && sp.magX && sp.xInfo) { if (sp.xInfo.kind === "center") { magL = magR = true; } else if (sp.xInfo.kind === "matchL") magL = true; else if (sp.xInfo.kind === "matchR") magR = true; }
      if (sp && sp.magY && sp.yInfo) { if (sp.yInfo.kind === "center") { magT = magB = true; } else if (sp.yInfo.kind === "matchT") magT = true; else if (sp.yInfo.kind === "matchB") magB = true; }
      bar(measL, best.l, true, magL ? "mag" : ""); bar(measR, best.r, true, magR ? "mag" : "");
      bar(measT, best.t, false, magT ? "mag" : ""); bar(measB, best.b, false, magB ? "mag" : "");
      bar(measRefL, best.l && best.l.ref, true, "ref" + (magL ? " eq" : ""), "ref");
      bar(measRefR, best.r && best.r.ref, true, "ref" + (magR ? " eq" : ""), "ref");
      bar(measRefT, best.t && best.t.ref, false, "ref" + (magT ? " eq" : ""), "ref");
      bar(measRefB, best.b && best.b.ref, false, "ref" + (magB ? " eq" : ""), "ref");
    }
    /* show the rulers for a moment after a keyboard nudge / on demand */
    var gapTimer = null;
    var measOn = false;   /* toolbar toggle: keep the rulers up for the selection */
    function flashGaps(el, ms) {
      if (!el) return;
      paintGaps(el, null);
      clearTimeout(gapTimer);
      if (measOn) return;
      gapTimer = setTimeout(function () { if (!measOn) hideGuides(); }, ms || 1400);
    }
    /* after a drag / resize / selection change: keep or drop the rulers per the toggle */
    function syncMeas() {
      clearTimeout(gapTimer);
      var el = measOn ? getSel() : null;
      if (el) paintGaps(el, null); else hideGuides();
    }
    function toggleMeas() {
      measOn = !measOn;
      measBtn.classList.toggle("on", measOn);
      syncMeas();
      toast(measOn ? "Gap rulers on \u2014 spacing to neighbours always visible" : "Gap rulers off \u2014 shown while dragging, or hold Alt");
    }
    /* equal-gap / matched-spacing magnet used during free (non-grid) drag.
       Snaps the element so its gap to a neighbour equals the opposite gap
       (centred) OR equals the gap that neighbour already keeps to ITS neighbour
       (even distribution). Returns the adjusted position + info for paintGaps. */
    function spacingSnap(el, nx, ny) {
      var th = 7 / k, out = { x: nx, y: ny, magX: false, magY: false, xInfo: null, yInfo: null };
      var others = D.els.filter(function (o) { return o.id !== el.id && !selSet.has(o.id) && !o.hidden; });
      function ovY(y, hh, o) { return Math.min(y + hh, o.y + o.h) - Math.max(y, o.y); }
      function ovX(x, ww, o) { return Math.min(x + ww, o.x + o.w) - Math.max(x, o.x); }
      (function () {
        var band = others.filter(function (o) { return ovY(ny, el.h, o) > 1; });
        if (!band.length) return;
        var L = null, R = null;
        band.forEach(function (o) {
          if (o.x + o.w <= nx + th) { if (!L || o.x + o.w > L.x + L.w) L = o; }
          if (o.x >= nx + el.w - th) { if (!R || o.x < R.x) R = o; }
        });
        function midY(a, b) { var lo = Math.max(a.y, b.y), hi = Math.min(a.y + a.h, b.y + b.h); return hi > lo ? (lo + hi) / 2 : ny + el.h / 2; }
        var cands = [];
        if (L && R) cands.push({ x: (L.x + L.w + R.x - el.w) / 2, kind: "center" });
        if (L) { var L2 = null; band.forEach(function (o) { if (o !== L && o.x + o.w <= L.x + th) { if (!L2 || o.x + o.w > L2.x + L2.w) L2 = o; } });
          if (L2) { var g = L.x - (L2.x + L2.w); if (g > 0.5) cands.push({ x: L.x + L.w + g, kind: "matchL", ref: { x: L2.x + L2.w, y: midY(L2, L), g: g } }); } }
        if (R) { var R2 = null; band.forEach(function (o) { if (o !== R && o.x >= R.x + R.w - th) { if (!R2 || o.x < R2.x) R2 = o; } });
          if (R2) { var g2 = R2.x - (R.x + R.w); if (g2 > 0.5) cands.push({ x: R.x - el.w - g2, kind: "matchR", ref: { x: R.x + R.w, y: midY(R, R2), g: g2 } }); } }
        var bc = null, bd = th; cands.forEach(function (c) { var d = Math.abs(c.x - nx); if (d < bd) { bd = d; bc = c; } });
        if (bc) { out.x = Math.round(bc.x); out.magX = true; out.xInfo = bc; }
      })();
      (function () {
        var band = others.filter(function (o) { return ovX(out.x, el.w, o) > 1; });
        if (!band.length) return;
        var T = null, B = null;
        band.forEach(function (o) {
          if (o.y + o.h <= ny + th) { if (!T || o.y + o.h > T.y + T.h) T = o; }
          if (o.y >= ny + el.h - th) { if (!B || o.y < B.y) B = o; }
        });
        function midX(a, b) { var lo = Math.max(a.x, b.x), hi = Math.min(a.x + a.w, b.x + b.w); return hi > lo ? (lo + hi) / 2 : out.x + el.w / 2; }
        var cands = [];
        if (T && B) cands.push({ y: (T.y + T.h + B.y - el.h) / 2, kind: "center" });
        if (T) { var T2 = null; band.forEach(function (o) { if (o !== T && o.y + o.h <= T.y + th) { if (!T2 || o.y + o.h > T2.y + T2.h) T2 = o; } });
          if (T2) { var g = T.y - (T2.y + T2.h); if (g > 0.5) cands.push({ y: T.y + T.h + g, kind: "matchT", ref: { x: midX(T2, T), y: T2.y + T2.h, g: g } }); } }
        if (B) { var B2 = null; band.forEach(function (o) { if (o !== B && o.y >= B.y + B.h - th) { if (!B2 || o.y < B2.y) B2 = o; } });
          if (B2) { var g2 = B2.y - (B.y + B.h); if (g2 > 0.5) cands.push({ y: B.y - el.h - g2, kind: "matchB", ref: { x: midX(B, B2), y: B.y + B.h, g: g2 } }); } }
        var bc = null, bd = th; cands.forEach(function (c) { var d = Math.abs(c.y - ny); if (d < bd) { bd = d; bc = c; } });
        if (bc) { out.y = Math.round(bc.y); out.magY = true; out.yInfo = bc; }
      })();
      return out;
    }
    function smartSnap(el, nx, ny) {
      var th = 6 / k, gx = null, gy = null, bx = th, by = th;
      var xs = [0, DW / 2, DW], ys = [0, D.h / 2, D.h];
      D.els.forEach(function (o) {
        if (o.id === el.id) return;
        xs.push(o.x, o.x + o.w / 2, o.x + o.w);
        ys.push(o.y, o.y + o.h / 2, o.y + o.h);
      });
      var nx0 = nx, ny0 = ny;
      [0, el.w / 2, el.w].forEach(function (off) {
        xs.forEach(function (c2) {
          var d = Math.abs((nx0 + off) - c2);
          if (d < bx) { bx = d; nx = Math.round(c2 - off); gx = c2; }
        });
      });
      [0, el.h / 2, el.h].forEach(function (off) {
        ys.forEach(function (c2) {
          var d = Math.abs((ny0 + off) - c2);
          if (d < by) { by = d; ny = Math.round(c2 - off); gy = c2; }
        });
      });
      if (gx != null) { guideV.style.left = gx + "px"; guideV.style.width = (1.2 / k) + "px"; guideV.style.display = "block"; }
      else guideV.style.display = "none";
      if (gy != null) { guideH.style.top = gy + "px"; guideH.style.height = (1.2 / k) + "px"; guideH.style.display = "block"; }
      else guideH.style.display = "none";
      return { x: nx, y: ny };
    }
    function snapEdge(el, val, axis) {
      var th = 6 / k, best = val, bd = th, g = null;
      var cands = axis === "x" ? [0, DW / 2, DW] : [0, D.h / 2, D.h];
      D.els.forEach(function (o) {
        if (o.id === el.id) return;
        if (axis === "x") cands.push(o.x, o.x + o.w / 2, o.x + o.w);
        else cands.push(o.y, o.y + o.h / 2, o.y + o.h);
      });
      cands.forEach(function (c2) { var d = Math.abs(c2 - val); if (d < bd) { bd = d; best = Math.round(c2); g = c2; } });
      if (g != null) {
        if (axis === "x") { guideV.style.left = g + "px"; guideV.style.width = (1.2 / k) + "px"; guideV.style.display = "block"; }
        else { guideH.style.top = g + "px"; guideH.style.height = (1.2 / k) + "px"; guideH.style.display = "block"; }
      }
      return best;
    }

    var prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    /* ---- shell ---- */
    var stage = h("div", { class: "akls-stage" });
    var frameLbl = h("div", { class: "akls-flbl" }, ["Canvas"]);
    var czoom = h("div", { class: "akls-czoom", title: "Drag to scale the canvas \u2014 or Ctrl + scroll", html: '<svg viewBox="0 0 24 24" fill="none"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>' });
    var frame = h("div", { class: "akls-frame" }, [frameLbl, stage, czoom]);
    var gridPrev = h("div", { class: "akls-gprev", style: "display:none" });
    var area = h("div", { class: "akls-area" }, [frame, gridPrev]);
    var panel = h("div", { class: "akls-panel" });
    var hint = h("div", { class: "akls-hint", html: ICO.plus + "<b>Blank canvas</b><span>Add shapes, text &amp; media from the dock below \u2014 or open Themes for a head start</span>" });

    /* layers panel */
    var insLine = h("div", { class: "akls-ins" });
    var layersList = h("div", { class: "akls-ll" });
    var lCount = h("span", {}, [""]);
    var stSize = h("span", {}, [""]);
    var stGrid = h("span", {}, [""]);
    var side = h("div", { class: "akls-side" }, [
      h("div", { class: "akls-ph" }, ["Layers", lCount]),
      layersList,
      h("div", { class: "akls-sf" }, [stSize, stGrid])
    ]);

    /* top bar */
    function itool(icon, tip, fn) { return h("button", { class: "akls-ib", "data-tip": tip, html: icon, onclick: fn }); }
    function vsep() { return h("span", { class: "akls-vsep" }); }
    var undoBtn = itool(ICO.undo, "Undo (Ctrl+Z)", function () { undo(); });
    var redoBtn = itool(ICO.redo, "Redo (Ctrl+Shift+Z)", function () { redoFn(); });
    var gridBtn = itool(ICO.grid, "Layout grid (G)", function () { toggleGrid(); });
    var lockBtn = itool(ICO.lock, "Grid lock (L) \u2014 snap to columns + 8px baseline", function () { toggleLock(); });
    var measBtn = itool(ICO.ruler, "Gap rulers (M) \u2014 always show spacing to neighbours", function () { toggleMeas(); });
    undoBtn.disabled = true; redoBtn.disabled = true;
    gridBtn.classList.toggle("on", grid.on);
    lockBtn.classList.toggle("on", grid.snap);

    var zoomLbl = h("button", { class: "zl", "data-tip": "Reset to 100%", onclick: function () { zoomMode = "manual"; k = 1; applyZoom(); } }, ["100%"]);
    var zoomWrap = h("div", { class: "akls-zoom" }, [
      itool(ICO.minus, "Zoom out (Ctrl −)", function () { zoomMode = "manual"; k = clamp(k / 1.2, 0.08, 4); applyZoom(); }),
      zoomLbl,
      itool(ICO.plus, "Zoom in (Ctrl +)", function () { zoomMode = "manual"; k = clamp(k * 1.2, 0.08, 4); applyZoom(); }),
      itool(ICO.fit, "Zoom to fit (Ctrl+0)", function () { zoomMode = "fit"; fit(); })
    ]);

    /* ---- in-studio dialogs (prompt/confirm/alert don't work in embedded previews) ---- */
    function toast(msg) {
      ov.querySelectorAll(".akls-toast").forEach(function (n) { n.remove(); });
      var t = h("div", { class: "akls-toast" }, [msg]);
      ov.appendChild(t);
      setTimeout(function () { t.remove(); }, 2600);
    }
    function uiDialog(build) {
      var bd = h("div", { class: "akls-dlgov" });
      function closeDlg() { bd.remove(); }
      var card = h("div", { class: "akls-dlg" });
      bd.appendChild(card);
      bd.addEventListener("pointerdown", function (e) { if (e.target === bd) closeDlg(); });
      bd.addEventListener("keydown", function (e) { e.stopPropagation(); if (e.key === "Escape") closeDlg(); });
      build(card, closeDlg);
      ov.appendChild(bd);
      var inp = card.querySelector("input"); if (inp) { inp.focus(); inp.select(); }
    }
    function uiPrompt(title, defVal, okLabel, cb) {
      uiDialog(function (card, closeDlg) {
        var inp = h("input", { type: "text", value: defVal });
        function ok() { var v = inp.value.trim(); if (!v) { inp.focus(); return; } closeDlg(); cb(v); }
        inp.addEventListener("keydown", function (e) { if (e.key === "Enter") ok(); });
        card.appendChild(h("h4", {}, [title]));
        card.appendChild(h("div", { class: "akls-in" }, [inp]));
        card.appendChild(h("div", { class: "row" }, [
          h("button", { class: "akls-btn ghost", onclick: closeDlg }, ["Cancel"]),
          h("button", { class: "akls-btn", onclick: ok }, [okLabel])
        ]));
      });
    }
    function uiConfirm(title, msg, okLabel, cb) {
      uiDialog(function (card, closeDlg) {
        card.appendChild(h("h4", {}, [title]));
        card.appendChild(h("p", {}, [msg]));
        card.appendChild(h("div", { class: "row" }, [
          h("button", { class: "akls-btn ghost", onclick: closeDlg }, ["Cancel"]),
          h("button", { class: "akls-btn", onclick: function () { closeDlg(); cb(); } }, [okLabel])
        ]));
      });
    }

    /* ---- Theme menu: presets + save / new / delete / import / export ---- */
    var themes = (opts.themes || []).map(copy);
    function themesChanged() { if (opts.onThemesChange) opts.onThemesChange(copy(themes)); }
    function applyDesign(d) {
      snapNow();
      D = { h: d.h || 700, bg: d.bg || "", els: copy(d.els || []),
        layout: d.layout || D.layout || "canvas", gridGap: d.gridGap != null ? d.gridGap : D.gridGap, gridCaps: d.gridCaps != null ? d.gridCaps : D.gridCaps };
      setSel(null);
      Object.assign(grid, { on: false, cols: 12, gutter: 24, margin: 36, snap: true }, d.grid || {});
      gridBtn.classList.toggle("on", grid.on);
      lockBtn.classList.toggle("on", grid.snap);
      fit(); paintStage(); paintPanel(); applyLayoutMode();
    }
    /* relative luminance of a #rrggbb / #rgb fill; null when not an opaque hex */
    function lumOf(c) {
      var s = String(c || "").trim();
      var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
      if (!m) return null;
      var x = m[1]; if (x.length === 3) x = x[0] + x[0] + x[1] + x[1] + x[2] + x[2];
      var n = parseInt(x, 16);
      return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    }
    /* Add a template's elements BELOW everything already on the canvas, instead of
       replacing them. Lets a project that already has real media still pick up a
       template — the old behaviour just refused. Ids and groups are re-keyed so
       nothing collides, and text is re-inked against whatever it actually lands on
       (a template authored for a white sheet must stay legible on a dark canvas). */
    function appendDesign(d) {
      var src = copy(d && d.els || []);
      if (!src.length) return 0;
      /* the starter's "New <category> project" banner is wrong copy for an append */
      src = src.filter(function (e) {
        var t = e.content && e.content.type === "text" && e.content.text;
        return !(t && /^new\s+.*\bproject$/i.test(String(t).trim()));
      });
      if (!src.length) return 0;
      snapNow();
      var top = Infinity;
      src.forEach(function (e) { top = Math.min(top, e.y || 0); });
      if (!isFinite(top)) top = 0;
      var dy = (bottomOfContent() + 64) - top;
      var gmap = {};
      Object.keys((d && d.groups) || {}).forEach(function (g) {
        var ng = "g" + Math.random().toString(36).slice(2, 8);
        gmap[g] = ng; D.groups[ng] = copy(d.groups[g]);
      });
      var made = [], bottom = 0;
      var canvasLum = lumOf(D.bg); if (canvasLum == null) canvasLum = 0.1;
      src.forEach(function (e) { e.y = (e.y || 0) + dy; });   // shift first, so plate hit-tests use final coords
      var plates = src.filter(function (e) { return !(e.content && e.content.type === "text") && lumOf(e.fill) != null; });
      src.forEach(function (e) {
        e.id = uid();
        if (e.grp) e.grp = gmap[e.grp] || e.grp;
        var c = e.content;
        if (c && c.type === "text") {
          /* what is actually behind this text: the template's own card, else the canvas */
          var behind = canvasLum;
          plates.forEach(function (p) {
            if (e.x >= p.x - 1 && e.y >= p.y - 1 && e.x + e.w <= p.x + p.w + 1 && e.y + e.h <= p.y + p.h + 1) behind = lumOf(p.fill);
          });
          var tl = lumOf(c.color);
          if (tl == null || Math.abs(tl - behind) < 0.35) c.color = behind > 0.55 ? "#11141A" : "#F4F6FA";
        }
        D.els.push(e); made.push(e.id);
        bottom = Math.max(bottom, e.y + e.h);
      });
      if (D.h < bottom + 40) D.h = Math.round(bottom + 40);
      selSet = new Set(made); sel = made[made.length - 1]; adjust = false;
      fit(); paintStage(); paintPanel(); paintLayers();
      var first = D.els.filter(function (e) { return made.indexOf(e.id) >= 0; })[0];
      if (first) revealEl(first);
      return made.length;
    }
    // real, user-supplied content that must never be wiped by a template switch
    // (placeholders are bento slots [content null] and text scaffolding [type "text"])
    function hasUserMedia() {
      return D.els.some(function (e) { return e.content && e.content.type && e.content.type !== "text"; });
    }
    function flashTheme(msg) {
      var old = themeLbl.textContent; themeLbl.textContent = msg;
      setTimeout(function () { themeLbl.textContent = old; }, 1500);
    }
    var menuEl = null;
    function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; removeEventListener("pointerdown", outsideMenu, true); } }
    function outsideMenu(e) { if (menuEl && !menuEl.contains(e.target) && !themeBtn.contains(e.target)) closeMenu(); }
    function mItem(icon, label, fn, extras) {
      var b = h("button", { class: "akls-mi", html: icon });
      b.appendChild(h("span", { class: "grow" }, [label]));
      (extras || []).forEach(function (x) { b.appendChild(x); });
      b.addEventListener("click", fn);
      return b;
    }
    function openMenu() {
      if (menuEl) { closeMenu(); return; }
      menuEl = h("div", { class: "akls-menu" });
      if (opts.templateList && opts.templateList.length) {
        menuEl.appendChild(h("div", { class: "akls-mhd" }, ["Project templates"]));
        opts.templateList.forEach(function (t) {
          menuEl.appendChild(mItem(ICO.star, t.label + " template", function () {
            if (t.accent) ov.style.setProperty("--accent", t.accent);
            if (t.accent2) ov.style.setProperty("--accent-2", t.accent2);
            // clean canvas -> swap the starter layout; real media -> append below it
            if (!hasUserMedia()) { applyDesign(copy(t.design)); flashTheme(t.label + " template \u2713"); }
            else { appendDesign(t.design); flashTheme(t.label + " template added below \u2713"); }
            closeMenu();
          }, t.key === opts.templateKey ? [h("span", { class: "tag" }, ["primary"])] : []));
        });
        menuEl.appendChild(h("div", { class: "akls-msep" }));
      }
      menuEl.appendChild(h("div", { class: "akls-mhd" }, ["Built-in"]));
      var BUILTIN_HIDE_KEY = "akls-hidden-builtins";
      function hiddenBuiltins() { try { return JSON.parse(localStorage.getItem(BUILTIN_HIDE_KEY) || "[]") || []; } catch (e) { return []; } }
      function setHiddenBuiltins(a) { try { localStorage.setItem(BUILTIN_HIDE_KEY, JSON.stringify(a)); } catch (e) {} }
      var BUILTINS = [
        { id: "uiux-award", label: "UI/UX Case Study \u2014 Award", apply: caseStudyTheme, note: "Case study applied \u2713" },
        { id: "ai-split", label: "AI Prompt Showcase \u2014 Split", apply: promptShowcaseTheme, note: "Prompt showcase applied \u2713" }
      ];
      var _hidB = hiddenBuiltins();
      var _shownB = BUILTINS.filter(function (bt) { return _hidB.indexOf(bt.id) < 0; });
      if (!_shownB.length) menuEl.appendChild(h("div", { class: "akls-mnote" }, ["All built-in templates hidden \u2014 restore them below."]));
      _shownB.forEach(function (bt) {
        var del = h("span", { class: "x", title: "Delete built-in template", html: ICO.xsm });
        del.addEventListener("click", function (e) {
          e.stopPropagation(); closeMenu();
          uiConfirm("Delete built-in template", '\u201c' + bt.label + '\u201d will be hidden from this menu. You can restore it anytime from \u201cRestore built-in templates\u201d.', "Delete", function () {
            var a = hiddenBuiltins(); if (a.indexOf(bt.id) < 0) a.push(bt.id); setHiddenBuiltins(a);
            toast("Built-in template deleted");
          });
        });
        menuEl.appendChild(mItem(ICO.star, bt.label, function () { applyDesign(bt.apply()); closeMenu(); flashTheme(bt.note); }, [h("span", { class: "tag" }, ["preset"]), del]));
      });
      if (_hidB.length) menuEl.appendChild(mItem(ICO.undo, "Restore built-in templates", function () { setHiddenBuiltins([]); toast("Built-in templates restored"); closeMenu(); openMenu(); }));
      menuEl.appendChild(h("div", { class: "akls-mhd" }, ["My themes"]));
      if (!themes.length) menuEl.appendChild(h("div", { class: "akls-mnote" }, ["No saved themes yet \u2014 design a canvas, then \u201cSave canvas as theme\u201d."]));
      themes.forEach(function (t, i) {
        var del = h("span", { class: "x", title: "Delete theme", html: ICO.xsm });
        del.addEventListener("click", function (e) {
          e.stopPropagation();
          closeMenu();
          uiConfirm("Delete theme", '\u201c' + t.name + '\u201d will be removed from your saved themes.', "Delete", function () {
            themes.splice(i, 1); themesChanged();
            toast("Theme deleted");
          });
        });
        menuEl.appendChild(mItem(ICO.palette, t.name || "Theme " + (i + 1), function () { applyDesign(t.design || {}); closeMenu(); flashTheme("Theme applied \u2713"); }, [del]));
      });
      menuEl.appendChild(h("div", { class: "akls-msep" }));
      menuEl.appendChild(mItem(ICO.plus, "Save canvas as theme\u2026", function () {
        closeMenu();
        uiPrompt("Save canvas as theme", "Theme " + (themes.length + 1), "Save", function (nm) {
          themes.push({ name: nm, design: copy(D) }); themesChanged();
          flashTheme("Theme saved \u2713");
        });
      }));
      menuEl.appendChild(mItem(ICO.rect, "Clear canvas (start blank)", function () { applyDesign({ h: 700, bg: "#1C1A14", els: [] }); closeMenu(); toast("Canvas cleared \u2014 Ctrl+Z restores it"); }));
      menuEl.appendChild(mItem(ICO.down, "Import theme (JSON)\u2026", function () {
        closeMenu();
        pickFile(".json,application/json", function (data, fname) {
          try {
            var m = String(data).match(/^data:[^,]*;base64,(.*)$/), txt;
            if (m) { try { txt = decodeURIComponent(escape(atob(m[1]))); } catch (e2) { txt = atob(m[1]); } }
            else txt = decodeURIComponent(String(data).split(",").slice(1).join(","));
            var j = JSON.parse(txt), base = String(fname || "Imported theme").replace(/\.[^.]+$/, ""), added = 0;
            (Array.isArray(j) ? j : [j]).forEach(function (t) {
              if (t && t.design && t.design.els) { themes.push({ name: t.name || base, design: t.design }); added++; }
              else if (t && t.els) { themes.push({ name: base, design: { h: t.h || 700, bg: t.bg || "", els: t.els, grid: t.grid } }); added++; }
            });
            if (!added) { toast("No theme found in that file"); return; }
            themesChanged(); flashTheme("Imported \u2713");
          } catch (e) { toast("Couldn't read that file as a theme JSON"); }
        });
      }));
      menuEl.appendChild(mItem(ICO.pdf, "Convert PDF \u2192 case study\u2026", function () {
        closeMenu();
        pickFile("application/pdf,.pdf", convertPdfFile);
      }));
      menuEl.appendChild(mItem(ICO.up, "Export canvas as JSON", function () {
        closeMenu();
        uiPrompt("Export canvas as JSON", "my-theme", "Export", function (nm) {
          nm = nm.toLowerCase().replace(/[^a-z0-9\-]+/g, "-") || "my-theme";
          var blob = new Blob([JSON.stringify({ name: nm, design: copy(D) }, null, 2)], { type: "application/json" });
          var a = h("a", { href: URL.createObjectURL(blob), download: nm + ".theme.json" });
          document.body.appendChild(a); a.click(); a.remove();
          toast("Theme exported");
        });
      }));
      if (opts.onSaveTheme) {
        menuEl.appendChild(h("div", { class: "akls-msep" }));
        menuEl.appendChild(mItem(ICO.check, "Use canvas as default start", function () {
          opts.onSaveTheme(copy(D)); closeMenu(); flashTheme("Default saved \u2713");
        }));
        menuEl.appendChild(h("div", { class: "akls-mnote" }, ["Default start = the layout every new canvas opens with."]));
      }
      ov.appendChild(menuEl);
      var r = themeBtn.getBoundingClientRect();
      menuEl.style.top = (r.bottom + 6) + "px";
      menuEl.style.right = Math.max(8, innerWidth - r.right) + "px";
      addEventListener("pointerdown", outsideMenu, true);
    }
    function convertPdfFile(data, fname) {
      themeLbl.textContent = "Converting\u2026";
      loadPdfJs().then(function (pdfjs) {
        var b64 = String(data).split(",")[1], bin = atob(b64), arr = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return pdfjs.getDocument({ data: arr }).promise;
      }).then(function (doc) {
        var n = Math.min(doc.numPages, 24), pages = [], chain = Promise.resolve();
        for (var p = 1; p <= n; p++) (function (p) {
          chain = chain.then(function () {
            return doc.getPage(p).then(function (page) {
              themeLbl.textContent = "Page " + p + "/" + n + "\u2026";
              function snapshot() {
                var vp = page.getViewport({ scale: 1 });
                vp = page.getViewport({ scale: Math.min(2.5, 1400 / vp.width) });
                var cv = document.createElement("canvas");
                cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
                return page.render({ canvasContext: cv.getContext("2d"), viewport: vp }).promise.then(function () {
                  return { src: cv.toDataURL("image/jpeg", 0.8), ar: cv.height / cv.width };
                });
              }
              return Promise.all([extractPageText(page), extractPageImages(page, window.pdfjsLib)]).then(function (r) {
                var tx = r[0], im = r[1];
                tx.imgs = im.imgs;
                if (tx.chars < 25 && !im.imgs.length) {
                  return snapshot().then(function (shot) { pages.push({ title: tx.title, body: tx.body, chars: tx.chars, img: shot }); });
                }
                if (im.hadImages && !im.imgs.length && tx.chars < 400) {
                  return snapshot().then(function (shot) { tx.pageShot = shot; pages.push(tx); });
                }
                pages.push(tx);
              });
            });
          });
        })(p);
        return chain.then(function () {
          return doc.getMetadata().then(function (md) { return { pages: pages, md: md }; }, function () { return { pages: pages, md: null }; });
        });
      }).then(function (res) {
        var t = (res.md && res.md.info && res.md.info.Title) || (res.pages[0] && res.pages[0].title) || String(fname || "Case study").replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
        var d = pdfCaseTheme(t, res.pages);
        themes.push({ name: (t.length > 34 ? t.slice(0, 34) + "\u2026" : t) + " \u2014 case study", design: copy(d) });
        themesChanged();
        applyDesign(d);
        themeLbl.textContent = "Theme";
        flashTheme("PDF converted \u2713");
      }).catch(function (e) {
        console.error(e);
        themeLbl.textContent = "Theme";
        toast("Couldn't convert that PDF \u2014 make sure it's a valid PDF file");
      });
    }
    window.__aklsConvertPdf = convertPdfFile;
    var themeLbl = h("span", {}, ["Theme"]);
    var themeBtn = h("button", { class: "akls-btn ghost", title: "Themes \u2014 apply, save, import & export canvas layouts", onclick: openMenu }, [themeLbl]);
    themeBtn.insertAdjacentHTML("beforeend", ICO.caret);

    /* ---- Project info editor (optional; opts.info + opts.onInfo). Uses the
       studio's own dialog (z-430) so it sits ABOVE this overlay. ---- */
    function uiProjectInfo() {
      var info = Object.assign({ title: "", tag: "", desc: "", role: "", timeline: "", platform: "", focus: "", software: "" }, opts.info || {});
      uiDialog(function (card, closeDlg) {
        card.style.width = "min(460px,92vw)";
        card.appendChild(h("h4", {}, ["Project info"]));
        card.appendChild(h("p", {}, ["Edits here update the live project \u2014 title, tag, description and the detail meta chips."]));
        var lblS = "display:block;font:600 9.5px 'Inter',sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--mut);margin-bottom:11px";
        var inpS = "width:100%;background:color-mix(in srgb,var(--tx) 5%,transparent);border:1px solid var(--ln);border-radius:8px;color:var(--tx);font:inherit;font-size:12.5px;padding:7px 9px;outline:none;margin-top:5px";
        var wrap = h("div", { style: "display:grid;grid-template-columns:1fr 1fr;gap:2px 12px" });
        function field(key, label, full, ta) {
          var inp = ta ? h("textarea", { rows: "2", style: inpS + ";resize:vertical" }, [info[key] || ""]) : h("input", { type: "text", value: info[key] || "", style: inpS });
          inp.dataset.k = key;
          inp.addEventListener("focus", function () { inp.style.borderColor = "var(--ac)"; });
          inp.addEventListener("blur", function () { inp.style.borderColor = "var(--ln)"; });
          wrap.appendChild(h("label", { style: lblS + (full ? ";grid-column:1/-1" : "") }, [label, inp]));
        }
        field("title", "Title", true); field("tag", "Tag / category", true); field("desc", "Description", true, true);
        field("role", "Role"); field("timeline", "Timeline"); field("platform", "Platform"); field("focus", "Focus"); field("software", "Software");
        card.appendChild(wrap);
        card.appendChild(h("div", { class: "row" }, [
          h("button", { class: "akls-btn ghost", onclick: closeDlg }, ["Cancel"]),
          h("button", { class: "akls-btn", onclick: function () {
            wrap.querySelectorAll("input,textarea").forEach(function (el) { info[el.dataset.k] = el.value; });
            if (opts.onInfo) opts.onInfo(copy(info));
            titleLabel.textContent = info.title || "Untitled";
            closeDlg(); toast("Project info saved \u2713");
          } }, ["Save info"])
        ]));
      });
    }
    var titleLabel = h("span", { style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:32ch" }, [opts.title || "Layout Studio"]);
    var titleNode = h("span", { class: "ttl" }, [
      h("span", { class: "lg", html: ICO.logo }),
      titleLabel,
      opts.badge ? h("span", { style: "margin-left:1px;font:700 9px 'Inter',sans-serif;letter-spacing:.1em;text-transform:uppercase;color:var(--ac);background:color-mix(in srgb,var(--ac) 16%,transparent);padding:3px 7px;border-radius:6px" }, [opts.badge]) : null
    ]);
    var infoBtn = opts.onInfo ? h("button", { class: "akls-btn ghost", "data-tip": "Edit project title, tag & details", onclick: uiProjectInfo, html: ICO.text + "<span>Project info</span>" }) : null;
    var saveLbl = opts.saveLabel || "Save layout";

    /* ---- layout mode: Canvas (freeform bento) · Grid (vertical full-width stack).
       Switched from the "Bento layout" segment in the right-hand properties panel. ---- */
    function setLayout(mode) {
      mode = mode === "grid" ? "grid" : "canvas";
      if (D.layout === mode) return;
      snapNow(); D.layout = mode;
      applyLayoutMode(); paintPanel();
      toast(mode === "grid" ? "Grid mode \u2014 cards stack full width, one per row" : "Canvas mode \u2014 freeform bento layout");
    }
    function paintGridPrev() { renderGrid(gridPrev, D, { editable: true, onChange: function () { paintLayers(); } }); }
    function applyLayoutMode() {
      var g = D.layout === "grid";
      frame.style.display = g ? "none" : "";
      dock.style.display = g ? "none" : "";
      zoomWrap.style.display = g ? "none" : "";
      gridPrev.style.display = g ? "" : "none";
      if (g) paintGridPrev(); else { gridPrev.innerHTML = ""; fit(); }
      updateStatus();
    }

    var top = h("div", { class: "akls-top" }, [
      titleNode, infoBtn,
      h("span", { class: "sp" }),
      zoomWrap,
      vsep(),
      themeBtn,
      h("button", { class: "akls-btn ghost", onclick: function () { close(); } }, ["Cancel"]),
      h("button", { class: "akls-btn", html: ICO.check + "<span>" + saveLbl + "</span>", onclick: function () { if (opts.onSave) opts.onSave(copy(D)); close(); } })
    ]);

    /* floating tool dock */
    var dock = h("div", { class: "akls-dock" }, [
      itool(ICO.rect, "Rectangle", function () { addEl({ kind: "rect", w: 480, h: 320, fill: "#26231D", r: 16 }); }),
      itool(ICO.circ, "Circle", function () { addEl({ kind: "ellipse", w: 300, h: 300, fill: "#26231D" }); }),
      itool(ICO.line, "Line", function () { addEl({ kind: "rect", w: 520, h: 5, fill: "#E5783A", r: 2.5 }); }),
      itool(ICO.text, "Text", function () {
        addEl({ kind: "rect", w: 620, h: 110, fill: "none", content: { type: "text", text: "Heading", font: FONTS[0][0], size: 48, weight: 600, color: "#FFFFFF", ls: 0, lh: 1.25, align: "left", valign: "middle", pt: 8, pr: 8, pb: 8, pl: 8, strokeW: 0, strokeC: "#000000" } });
      }),
      itool(ICO.img, "Image\u2026", function () {
        pickFile("image/*", function (data) {
          addEl({ kind: "rect", w: 640, h: 420, r: 12, fill: "none", content: { type: "image", src: data, fit: "cover" } });
        });
      }),
      itool(ICO.bento, "Bento grid — 6 sized tiles", function () { addBento(); }),
      vsep(),
      undoBtn, redoBtn,
      vsep(),
      gridBtn, lockBtn, measBtn
    ]);

    /* canvas readout (layers panel footer) */
    function updateStatus() {
      stSize.textContent = (selSet.size > 1 ? selSet.size + " selected \u00b7 " : "") + "1200 \u00d7 " + D.h;
      stGrid.textContent = D.layout === "grid" ? "grid mode \u00b7 stacked full width"
        : ((grid.on ? "grid " + grid.cols : "grid off") + " \u00b7 " + (grid.snap ? "locked" : "free"));
    }

    var sgrip = h("div", { class: "akls-sgrip", title: "Drag to resize the Layers panel" });
    var ov = h("div", { class: "akls-ov" }, [top, h("div", { class: "akls-main" }, [area, side, sgrip, panel, dock])]);
    if (opts.accent) ov.style.setProperty("--accent", opts.accent);
    if (opts.accent2) ov.style.setProperty("--accent-2", opts.accent2);
    document.body.appendChild(ov);

    /* snapshot state before any inspector edit begins */
    panel.addEventListener("pointerdown", function (e) { if (e.target.closest("input,select,textarea,button")) mark("panel"); }, true);
    panel.addEventListener("keydown", function (e) { if (e.target.closest("input,textarea,select")) mark("panel"); }, true);

    function close() {
      closeMenu(); closeCtx();
      ov.remove();
      document.body.style.overflow = prevOverflow;
      removeEventListener("keydown", onKey);
      removeEventListener("keydown", altMeasure);
      removeEventListener("keyup", altRelease);
      removeEventListener("paste", onPaste);
      removeEventListener("resize", fit);
    }

    /* ---- zoom ---- */
    function applyZoom() {
      stage.style.width = DW + "px"; stage.style.height = D.h + "px";
      stage.style.transform = "scale(" + k + ")";
      stage.style.background = D.bg || "transparent";
      frame.style.width = (DW * k) + "px"; frame.style.height = (D.h * k) + "px";
      zoomLbl.textContent = Math.round(k * 100) + "%";
      frameLbl.textContent = "Canvas \u00b7 1200 \u00d7 " + D.h;
      paintSel(); updateStatus();
    }
    function fit() {
      if (zoomMode === "fit") {
        var cs = getComputedStyle(area), aw = Math.max(160, area.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0) - 40);
        k = clamp(aw / DW, 0.08, 1.25);
      }
      applyZoom();
    }
    addEventListener("resize", fit);
    area.addEventListener("wheel", function (e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        var old = k, nk = clamp(k * (e.deltaY < 0 ? 1.1 : 0.9), 0.08, 4);
        if (nk === old) return;
        var fr = frame.getBoundingClientRect();
        var px = (e.clientX - fr.left) / old, py = (e.clientY - fr.top) / old;
        zoomMode = "manual"; k = nk; applyZoom();
        var fr2 = frame.getBoundingClientRect();
        area.scrollLeft += (fr2.left + px * k) - e.clientX;
        area.scrollTop += (fr2.top + py * k) - e.clientY;
        return;
      }
      /* shift + vertical wheel = horizontal pan (Figma) */
      if (e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault(); area.scrollLeft += e.deltaY;
      }
      /* plain wheel / trackpad two-finger pans natively via overflow:auto */
    }, { passive: false });

    /* ---- Figma-style panning: middle-mouse drag, or hold Space + drag ---- */
    var spaceDown = false;
    function setPanCursor() { area.classList.toggle("pan", spaceDown); }
    addEventListener("keydown", function (e) {
      if (e.code !== "Space" && e.key !== " ") return;
      var t = e.target && e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT" || (e.target && e.target.isContentEditable)) return;
      if (!spaceDown) { spaceDown = true; setPanCursor(); }
      e.preventDefault();
    });
    addEventListener("keyup", function (e) {
      if (e.code === "Space" || e.key === " ") { spaceDown = false; setPanCursor(); }
    });
    addEventListener("blur", function () { spaceDown = false; setPanCursor(); });
    /* suppress the browser middle-click autoscroll bubble */
    area.addEventListener("mousedown", function (e) { if (e.button === 1) e.preventDefault(); });
    area.addEventListener("pointerdown", function (e) {
      var isPan = e.button === 1 || (e.button === 0 && spaceDown);
      if (!isPan) return;
      e.preventDefault(); e.stopPropagation();
      try { area.setPointerCapture(e.pointerId); } catch (er) {}
      area.classList.add("panning");
      var sx = e.clientX, sy = e.clientY, sl = area.scrollLeft, st = area.scrollTop;
      function mv(ev) { area.scrollLeft = sl - (ev.clientX - sx); area.scrollTop = st - (ev.clientY - sy); }
      function up(ev) {
        try { area.releasePointerCapture(ev.pointerId); } catch (er) {}
        area.removeEventListener("pointermove", mv); area.removeEventListener("pointerup", up); area.removeEventListener("pointercancel", up);
        area.classList.remove("panning");
      }
      area.addEventListener("pointermove", mv); area.addEventListener("pointerup", up); area.addEventListener("pointercancel", up);
    }, true);

    /* ---- resizable layers panel (drag its right edge) ---- */
    var SIDE_MIN = 200, SIDE_MAX = 480;
    function applySideWidth(w) {
      w = clamp(Math.round(w), SIDE_MIN, SIDE_MAX);
      side.style.width = w + "px";
      sgrip.style.left = w + "px";
      area.style.paddingLeft = (w + 24) + "px";
      return w;
    }
    (function () {
      var saved = parseInt(localStorage.getItem("ak-ls-sidew"), 10);
      applySideWidth(saved > 0 ? saved : 240);
    })();
    sgrip.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      sgrip.classList.add("on");
      var originLeft = sgrip.parentNode.getBoundingClientRect().left;
      try { sgrip.setPointerCapture(e.pointerId); } catch (er) {}
      function mv(ev) { applySideWidth(ev.clientX - originLeft); if (zoomMode === "fit") fit(); }
      function up(ev) {
        sgrip.classList.remove("on");
        try { sgrip.releasePointerCapture(ev.pointerId); } catch (er) {}
        sgrip.removeEventListener("pointermove", mv); sgrip.removeEventListener("pointerup", up); sgrip.removeEventListener("pointercancel", up);
        try { localStorage.setItem("ak-ls-sidew", parseInt(side.style.width, 10) || 240); } catch (er2) {}
      }
      sgrip.addEventListener("pointermove", mv); sgrip.addEventListener("pointerup", up); sgrip.addEventListener("pointercancel", up);
    });

    /* ---- drag the corner grip to scale the canvas ---- */
    czoom.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation();
      czoom.classList.add("on");
      var sx = e.clientX, sy = e.clientY, k0 = k;
      try { czoom.setPointerCapture(e.pointerId); } catch (er) {}
      function mv(ev) {
        var d = ((ev.clientX - sx) + (ev.clientY - sy)) / 2;
        zoomMode = "manual"; k = clamp(k0 * (1 + d / 260), 0.08, 4); applyZoom();
      }
      function up(ev) {
        czoom.classList.remove("on");
        try { czoom.releasePointerCapture(ev.pointerId); } catch (er) {}
        czoom.removeEventListener("pointermove", mv); czoom.removeEventListener("pointerup", up); czoom.removeEventListener("pointercancel", up);
      }
      czoom.addEventListener("pointermove", mv); czoom.addEventListener("pointerup", up); czoom.addEventListener("pointercancel", up);
    });

    /* ---- stage painting ---- */
    function getSel() { for (var i = 0; i < D.els.length; i++) if (D.els[i].id === sel) return D.els[i]; return null; }
    function nodeFor(id) { return stage.querySelector('[data-el="' + id + '"]'); }
    function paintStage() {
      stage.innerHTML = "";
      if (!D.els.length) stage.appendChild(hint);
      D.els.forEach(function (el) {
        if (el.hidden) return;
        var n = renderEl(el, true);
        n.setAttribute("data-el", el.id);
        if (el.locked) n.style.pointerEvents = "none";
        wireEl(n, el);
        if (el.bento) {
          var openDetail = function () { snapNow(); openBentoDetail(el, D.els.filter(function (x) { return x.bento; }), true, function (t, kind) { if (kind === "content") refreshNode(t, true); }); };
          var ob = h("button", { class: "akls-bento-open", title: "Open detail view", html: ICO.fit });
          ob.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
          ob.addEventListener("click", function (ev) { ev.stopPropagation(); openDetail(); });
          n.appendChild(ob);
          n.addEventListener("dblclick", function (ev) { ev.preventDefault(); ev.stopPropagation(); openDetail(); });
        }
        stage.appendChild(n);
      });
      paintGrid();
      stage.appendChild(gridEl);
      stage.appendChild(guideV); stage.appendChild(guideH); MEAS.forEach(function (m) { stage.appendChild(m); }); hideGuides();
      paintSel(); paintLayers(); updateStatus();
    }
    function refreshNode(el, structural) {
      var n = nodeFor(el.id); if (!n) return;
      if (structural) {
        var nn = renderEl(el, true); nn.setAttribute("data-el", el.id); wireEl(nn, el); n.replaceWith(nn);
        paintLayers();
      } else applyBoxStyle(n, el);
      paintSel();
    }
    function paintSel() {
      stage.querySelectorAll(".akls-selbox").forEach(function (n) { n.remove(); });
      updateStatus();
      var el = getSel();
      if (measOn) syncMeas();
      if (!el) return;
      selEls().forEach(function (o) {
        if (o.id === el.id || o.hidden) return;
        var mb = h("div", { class: "akls-selbox multi", "data-selbox": o.id, style: "left:" + o.x + "px;top:" + o.y + "px;width:" + o.w + "px;height:" + o.h + "px" });
        mb.style.outlineWidth = (2 / Math.max(k, 0.05)) + "px";
        stage.appendChild(mb);
      });
      var box = h("div", { class: "akls-selbox", "data-selbox": el.id, style: "left:" + el.x + "px;top:" + el.y + "px;width:" + el.w + "px;height:" + el.h + "px" });
      box.style.outlineWidth = (2 / Math.max(k, 0.05)) + "px";
      if (!el.hidden && !el.locked) {
        var hs = Math.round(clamp(12 / k, 8, 28));
        ["nw", "n", "ne", "e", "se", "s", "sw", "w"].forEach(function (dir) {
          var hd = h("div", { class: "akls-hd " + dir });
          hd.style.setProperty("--hs", hs + "px");
          wireHandle(hd, dir, el);
          box.appendChild(hd);
        });
        var sg = h("div", { class: "akls-hd scale", title: "Drag to scale uniformly (content untouched)" });
        sg.style.setProperty("--hs", Math.round(clamp(14 / k, 9, 32)) + "px");
        wireScale(sg, el);
        box.appendChild(sg);
      }
      if (adjust && pannable(el)) {
        box.classList.add("crop");
        box.appendChild(h("div", { class: "akls-cropbadge", style: "font-size:" + Math.round(clamp(10.5 / k, 9, 20)) + "px" }, ["Adjust image \u2014 drag moves \u00b7 scroll zooms"]));
      }
      stage.appendChild(box);
    }
    function syncSelBox(el) {
      var box = stage.querySelector('[data-selbox="' + el.id + '"]');
      if (!box) return;
      box.style.left = el.x + "px"; box.style.top = el.y + "px";
      box.style.width = el.w + "px"; box.style.height = el.h + "px";
    }
    function select(id) { if (sel === id && selSet.size === 1) return; setSel(id); paintSel(); paintPanel(); paintLayers(); }
    function toggleSel(id) {
      if (selSet.has(id)) { selSet.delete(id); if (sel === id) sel = selSet.size ? Array.from(selSet)[selSet.size - 1] : null; }
      else { selSet.add(id); sel = id; }
      adjust = false; paintSel(); paintPanel(); paintLayers();
    }
    function selectAll() {
      if (!D.els.length) return;
      selSet = new Set(D.els.map(function (x) { return x.id; }));
      sel = D.els[D.els.length - 1].id; adjust = false;
      paintSel(); paintPanel(); paintLayers();
    }
    area.addEventListener("pointerdown", function (e) {
      if (!(e.target === area || e.target === stage || e.target === frame || e.target === hint)) return;
      if (e.button != null && e.button > 0) return;
      var r = stage.getBoundingClientRect();
      var sx = (e.clientX - r.left) / k, sy = (e.clientY - r.top) / k;
      var base = e.shiftKey ? new Set(selSet) : new Set();
      var marq = null, moved = false;
      try { area.setPointerCapture(e.pointerId); } catch (er) {}
      function mv(ev) {
        var x2 = (ev.clientX - r.left) / k, y2 = (ev.clientY - r.top) / k;
        if (!moved && Math.abs(x2 - sx) + Math.abs(y2 - sy) < 3 / k) return;
        if (!moved) { moved = true; marq = h("div", { class: "akls-marq" }); stage.appendChild(marq); }
        var x = Math.min(sx, x2), y = Math.min(sy, y2), w = Math.abs(x2 - sx), hh = Math.abs(y2 - sy);
        marq.style.cssText = "left:" + x + "px;top:" + y + "px;width:" + w + "px;height:" + hh + "px;border-width:" + Math.max(1, 1 / k) + "px";
        selSet = new Set(base);
        D.els.forEach(function (o) { if (o.hidden || o.locked) return; if (o.x < x + w && x < o.x + o.w && o.y < y + hh && y < o.y + o.h) selSet.add(o.id); });
        selSet = expandGroups(selSet);
        sel = selSet.size ? Array.from(selSet)[selSet.size - 1] : null;
        adjust = false;
        paintSel(); paintLayers();
      }
      function up(ev) {
        try { area.releasePointerCapture(ev.pointerId); } catch (er) {}
        area.removeEventListener("pointermove", mv); area.removeEventListener("pointerup", up); area.removeEventListener("pointercancel", up);
        if (marq) marq.remove();
        if (!moved) { setSel(null); }
        paintSel(); paintPanel(); paintLayers();
      }
      area.addEventListener("pointermove", mv); area.addEventListener("pointerup", up); area.addEventListener("pointercancel", up);
    });

    /* ---- layers panel ---- */
    function layerName(el) {
      if (el.name) return el.name.slice(0, 26);
      var c = el.content;
      if (c) {
        if (c.type === "text") return ((c.text || "Text").split("\n")[0].trim().slice(0, 26)) || "Text";
        return { image: "Image", media: (c.mime || "").indexOf("audio") === 0 ? "Audio" : "Video", pdf: "PDF", model: "3D model", prototype: "Prototype" }[c.type] || "Shape";
      }
      if (el.kind === "ellipse") return "Ellipse";
      if (el.h <= 8 && el.w > 40) return "Line";
      return "Rectangle";
    }
    function layerIcon(el) {
      var c = el.content;
      if (c) {
        if (c.type === "text") return ICO.text;
        return { image: ICO.img, media: (c.mime || "").indexOf("audio") === 0 ? ICO.audio : ICO.film, pdf: ICO.pdf, model: ICO.cube, prototype: ICO.proto }[c.type] || ICO.rect;
      }
      if (el.kind === "ellipse") return ICO.circ;
      if (el.h <= 8 && el.w > 40) return ICO.line;
      return ICO.rect;
    }
    function groupName(g) { return (D.groups[g] && D.groups[g].name) || "Group"; }
    function elById(id) { for (var i = 0; i < D.els.length; i++) if (D.els[i].id === id) return D.els[i]; return null; }

    /* ---- selection (group-aware) ---- */
    function selectElement(el, o) {
      o = o || {};
      if (o.range && lastLayerId && lastLayerId !== el.id) {
        var order = visualIds(), i1 = order.indexOf(lastLayerId), i2 = order.indexOf(el.id);
        if (i1 >= 0 && i2 >= 0) {
          var a = Math.min(i1, i2), b = Math.max(i1, i2), s = new Set();
          for (var i = a; i <= b; i++) s.add(order[i]);
          selSet = expandGroups(s); sel = el.id; adjust = false;
          paintSel(); paintPanel(); paintLayers(); return;
        }
      }
      if (o.additive) {
        var grp = (el.grp && !o.alt) ? new Set(memberIds(el.grp)) : new Set([el.id]);
        var allIn = Array.from(grp).every(function (id) { return selSet.has(id); });
        if (allIn) { grp.forEach(function (id) { selSet.delete(id); }); if (!selSet.has(sel)) sel = selSet.size ? Array.from(selSet).slice(-1)[0] : null; }
        else { grp.forEach(function (id) { selSet.add(id); }); sel = el.id; }
        lastLayerId = el.id; adjust = false; paintSel(); paintPanel(); paintLayers(); return;
      }
      if (el.grp && !o.alt) { selSet = new Set(memberIds(el.grp)); sel = el.id; }
      else setSel(el.id);
      lastLayerId = el.id; adjust = false; paintSel(); paintPanel(); paintLayers();
    }
    function selectGroup(g, additive) {
      var ids = memberIds(g); if (!ids.length) return;
      if (additive) {
        var allIn = ids.every(function (id) { return selSet.has(id); });
        if (allIn) ids.forEach(function (id) { selSet.delete(id); });
        else ids.forEach(function (id) { selSet.add(id); });
        sel = selSet.size ? Array.from(selSet).slice(-1)[0] : null;
      } else { selSet = new Set(ids); sel = ids.slice(-1)[0]; }
      lastLayerId = ids.slice(-1)[0]; adjust = false; paintSel(); paintPanel(); paintLayers();
    }

    /* ---- group / ungroup ---- */
    function groupSelection() {
      var ids = Array.from(selSet);
      if (ids.length < 2) { toast("Select 2+ layers to group \u2014 Shift or \u2318-click"); return; }
      snapNow();
      var g = newGrpId();
      D.groups[g] = { name: "Group " + (Object.keys(D.groups).length + 1) };
      selEls().forEach(function (e) { e.grp = g; });
      reclusterGroups(); pruneGroups(); collapsed.delete(g);
      selSet = new Set(memberIds(g)); sel = memberIds(g).slice(-1)[0]; adjust = false;
      paintStage(); paintPanel();
      toast("Grouped " + selSet.size + " layers");
    }
    function ungroupSelection() {
      var grps = new Set(); selEls().forEach(function (e) { if (e.grp) grps.add(e.grp); });
      if (!grps.size) { toast("Select a group to ungroup"); return; }
      snapNow();
      D.els.forEach(function (e) { if (grps.has(e.grp)) delete e.grp; });
      grps.forEach(function (g) { delete D.groups[g]; collapsed.delete(g); });
      paintStage(); paintPanel();
      toast("Ungrouped");
    }

    /* ---- hide / lock ---- */
    function setHiddenEls(els, val) {
      els = (els || []).filter(Boolean); if (!els.length) return;
      var pre = copyDesign(D);
      els.forEach(function (e) { if (val) e.hidden = true; else delete e.hidden; });
      if (sig(pre) !== sig(D)) pushPre(pre);
      paintStage(); paintPanel();
    }
    function setLockedEls(els, val) {
      els = (els || []).filter(Boolean); if (!els.length) return;
      var pre = copyDesign(D);
      els.forEach(function (e) { if (val) e.locked = true; else delete e.locked; });
      if (sig(pre) !== sig(D)) pushPre(pre);
      paintStage(); paintPanel();
    }
    function toggleHideSel() { var e = selEls(); if (!e.length) return; setHiddenEls(e, e.some(function (x) { return !x.hidden; })); }
    function toggleLockSel() { var e = selEls(); if (!e.length) return; setLockedEls(e, e.some(function (x) { return !x.locked; })); }

    /* ---- rename ---- */
    function renameRow(row, getName, setName) {
      var nm = row.querySelector(".nm"); if (!nm) return;
      var inp = h("input", { class: "akls-lrn", type: "text", value: getName() });
      nm.replaceWith(inp); inp.focus(); inp.select();
      var done = false;
      function commit(save) {
        if (done) return; done = true;
        if (save) { var pre = copyDesign(D); setName(inp.value.trim()); if (sig(pre) !== sig(D)) pushPre(pre); }
        paintLayers();
      }
      inp.addEventListener("keydown", function (ev) { ev.stopPropagation(); if (ev.key === "Enter") commit(true); else if (ev.key === "Escape") commit(false); });
      inp.addEventListener("blur", function () { commit(true); });
      inp.addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    }
    function renameViaDialog(el, grp) {
      var cur = el ? (el.name || layerName(el)) : groupName(grp);
      uiPrompt(grp ? "Rename group" : "Rename layer", cur, "Rename", function (v) {
        v = (v || "").trim(); var pre = copyDesign(D);
        if (el) { if (v) el.name = v; else delete el.name; }
        else { D.groups[grp] = D.groups[grp] || {}; D.groups[grp].name = v || "Group"; }
        if (sig(pre) !== sig(D)) pushPre(pre); paintLayers();
      });
    }

    /* ---- z-order helpers for drag reorder (collapse-safe, group-contiguous) ---- */
    function applyVisualOrder(orderFB) { D.els = orderFB.map(elById).filter(Boolean).reverse(); reclusterGroups(); }
    function dropElement(id, anchorId) {
      var vis = visualIds().filter(function (x) { return x !== id; });
      var at = anchorId ? vis.indexOf(anchorId) : vis.length; if (at < 0) at = vis.length;
      vis.splice(at, 0, id); applyVisualOrder(vis);
    }
    function dropGroup(grp, anchorId) {
      var run = memberEls(grp).map(function (x) { return x.id; }).reverse();
      var rs = new Set(run), vis = visualIds().filter(function (x) { return !rs.has(x); });
      var at = anchorId ? vis.indexOf(anchorId) : vis.length; if (at < 0) at = vis.length;
      vis.splice.apply(vis, [at, 0].concat(run)); applyVisualOrder(vis);
    }

    /* ---- row action button (eye / lock) ---- */
    function lopBtn(icon, title, active, fn) {
      var b = h("button", { class: "lop" + (active ? " act" : ""), title: title, html: icon, type: "button" });
      b.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      b.addEventListener("click", function (e) { e.stopPropagation(); e.preventDefault(); fn(); });
      return b;
    }

    /* ---- context menu ---- */
    var ctxEl = null;
    function closeCtx() { if (ctxEl) { ctxEl.remove(); ctxEl = null; removeEventListener("pointerdown", ctxOut, true); removeEventListener("wheel", closeCtx, true); } }
    function ctxOut(e) { if (ctxEl && !ctxEl.contains(e.target)) closeCtx(); }
    function openCtx(x, y, items) {
      closeCtx(); if (typeof closeMenu === "function") closeMenu();
      ctxEl = h("div", { class: "akls-menu ctx" });
      items.forEach(function (it) {
        if (it.sep) { ctxEl.appendChild(h("div", { class: "akls-msep" })); return; }
        var extras = it.kb ? [h("span", { class: "kb" }, [it.kb])] : [];
        var b = mItem(it.icon, it.label, function () { closeCtx(); it.fn(); }, extras);
        if (it.warn) b.classList.add("warn");
        ctxEl.appendChild(b);
      });
      ov.appendChild(ctxEl);
      ctxEl.style.left = "0px"; ctxEl.style.top = "0px";
      var r = ctxEl.getBoundingClientRect();
      ctxEl.style.left = Math.max(8, Math.min(x, innerWidth - r.width - 8)) + "px";
      ctxEl.style.top = Math.max(8, Math.min(y, innerHeight - r.height - 8)) + "px";
      setTimeout(function () { addEventListener("pointerdown", ctxOut, true); addEventListener("wheel", closeCtx, true); }, 0);
    }
    function openLayerCtx(x, y, el, grp, row) {
      var items = [];
      if (grp) {
        var members = memberEls(grp);
        var allHidden = members.every(function (m) { return m.hidden; });
        var allLocked = members.every(function (m) { return m.locked; });
        items.push({ icon: ICO.text, label: "Rename group", fn: function () { if (row) renameRow(row, function () { return groupName(grp); }, function (v) { D.groups[grp] = D.groups[grp] || {}; D.groups[grp].name = v || "Group"; }); else renameViaDialog(null, grp); } });
        items.push({ icon: ICO.ungroup, label: "Ungroup", kb: "\u2318\u21e7G", fn: ungroupSelection });
        items.push({ sep: true });
        items.push({ icon: allHidden ? ICO.eye : ICO.eyeOff, label: allHidden ? "Show group" : "Hide group", fn: function () { setHiddenEls(members, !allHidden); } });
        items.push({ icon: allLocked ? ICO.unlock : ICO.lock, label: allLocked ? "Unlock group" : "Lock group", fn: function () { setLockedEls(members, !allLocked); } });
        items.push({ icon: ICO.caret, label: collapsed.has(grp) ? "Expand" : "Collapse", fn: function () { if (collapsed.has(grp)) collapsed.delete(grp); else collapsed.add(grp); paintLayers(); } });
        items.push({ sep: true });
        items.push({ icon: ICO.dup, label: "Duplicate group", fn: dupSel });
        items.push({ icon: ICO.del, label: "Delete group", warn: true, fn: removeSel });
        openCtx(x, y, items); return;
      }
      var els = selEls().length ? selEls() : [el];
      var multi = els.length > 1;
      var anyGrp = els.some(function (e) { return e.grp; });
      if (els.length >= 2) items.push({ icon: ICO.group, label: "Group selection", kb: "\u2318G", fn: groupSelection });
      if (els.length >= 2) {
        items.push({ icon: ICO.distV, label: "Equal gaps between rows", kb: "\u2325\u21e7V", fn: function () { selGap("y", null); } });
        items.push({ icon: ICO.distH, label: "Equal gaps between columns", kb: "\u2325\u21e7H", fn: function () { selGap("x", null); } });
      }
      if (anyGrp) items.push({ icon: ICO.ungroup, label: "Ungroup", kb: "\u2318\u21e7G", fn: ungroupSelection });
      if (items.length) items.push({ sep: true });
      var anyVis = els.some(function (e) { return !e.hidden; });
      items.push({ icon: anyVis ? ICO.eyeOff : ICO.eye, label: (anyVis ? "Hide" : "Show") + (multi ? " layers" : ""), fn: function () { setHiddenEls(els, anyVis); } });
      var anyUnl = els.some(function (e) { return !e.locked; });
      items.push({ icon: anyUnl ? ICO.lock : ICO.unlock, label: (anyUnl ? "Lock" : "Unlock") + (multi ? " layers" : ""), fn: function () { setLockedEls(els, anyUnl); } });
      items.push({ sep: true });
      if (!multi) {
        items.push({ icon: ICO.fwd, label: "Bring forward", kb: "\u2318]", fn: function () { zMove(el, 1); } });
        items.push({ icon: ICO.bck, label: "Send backward", kb: "\u2318[", fn: function () { zMove(el, -1); } });
        items.push({ icon: ICO.text, label: "Rename", fn: function () { if (row) renameRow(row, function () { return el.name || layerName(el); }, function (v) { if (v) el.name = v; else delete el.name; }); else renameViaDialog(el, null); } });
      }
      items.push({ icon: ICO.dup, label: "Duplicate" + (multi ? " layers" : ""), kb: "\u2318D", fn: dupSel });
      items.push({ sep: true });
      items.push({ icon: ICO.del, label: "Delete" + (multi ? " layers" : ""), warn: true, fn: removeSel });
      openCtx(x, y, items);
    }

    /* ---- paint ---- */
    function paintLayers() {
      layersList.innerHTML = "";
      layersList.appendChild(insLine); insLine.style.display = "none";
      lCount.textContent = D.els.length ? String(D.els.length) : "";
      if (!D.els.length) {
        layersList.appendChild(h("div", { class: "akls-lempty" }, ["No layers yet \u2014 add from the dock below. Top of this list = front of the canvas; drag to reorder, \u2318G to group."]));
        return;
      }
      var i = D.els.length - 1;
      while (i >= 0) {
        var el = D.els[i];
        if (el.grp) {
          var g = el.grp, members = [];
          while (i >= 0 && D.els[i].grp === g) { members.push(D.els[i]); i--; }
          appendGroup(g, members);
        } else { appendElRow(el, false); i--; }
      }
    }
    function appendGroup(g, members) {
      var isCol = collapsed.has(g);
      var anySel = members.some(function (m) { return selSet.has(m.id); });
      var hd = h("div", { class: "akls-lr grp" + (anySel ? " on" : ""), "data-lgrp": g });
      var cvt = h("div", { class: "cvt" + (isCol ? " col" : ""), html: ICO.caret });
      cvt.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      cvt.addEventListener("click", function (e) { e.stopPropagation(); if (collapsed.has(g)) collapsed.delete(g); else collapsed.add(g); paintLayers(); });
      hd.appendChild(cvt);
      hd.insertAdjacentHTML("beforeend", ICO.folder);
      hd.appendChild(h("span", { class: "nm" }, [groupName(g)]));
      hd.appendChild(h("span", { class: "gct" }, [String(members.length)]));
      var allHidden = members.every(function (m) { return m.hidden; });
      var allLocked = members.every(function (m) { return m.locked; });
      hd.appendChild(h("div", { class: "lops" }, [
        lopBtn(ICO.text, "Rename group", false, function () { renameRow(hd, function () { return groupName(g); }, function (v) { D.groups[g] = D.groups[g] || {}; D.groups[g].name = v || "Group"; }); }),
        lopBtn(allHidden ? ICO.eyeOff : ICO.eye, allHidden ? "Show group" : "Hide group", allHidden, function () { setHiddenEls(members, !allHidden); }),
        lopBtn(allLocked ? ICO.lock : ICO.unlock, allLocked ? "Unlock group" : "Lock group", allLocked, function () { setLockedEls(members, !allLocked); })
      ]));
      wireGroupHeader(hd, g);
      layersList.appendChild(hd);
      if (!isCol) members.forEach(function (m) { appendElRow(m, true); });
    }
    function appendElRow(el, isMember) {
      var row = h("div", { class: "akls-lr" + (selSet.has(el.id) ? " on" : "") + (isMember ? " mbr" : "") + ((el.hidden || el.locked) ? " dim" : ""), "data-lid": el.id });
      if (isMember) row.appendChild(h("div", { class: "akls-mgap" }));
      row.insertAdjacentHTML("beforeend", layerIcon(el));
      row.appendChild(h("span", { class: "nm" }, [layerName(el)]));
      row.appendChild(h("div", { class: "lops" }, [
        lopBtn(el.hidden ? ICO.eyeOff : ICO.eye, el.hidden ? "Show" : "Hide", !!el.hidden, function () { setHiddenEls([el], !el.hidden); }),
        lopBtn(el.locked ? ICO.lock : ICO.unlock, el.locked ? "Unlock" : "Lock", !!el.locked, function () { setLockedEls([el], !el.locked); })
      ]));
      wireLayerRow(row, el);
      layersList.appendChild(row);
    }

    /* ---- drag reorder (shared by element rows and group headers) ---- */
    function startRowDrag(e, row, kind, key) {
      e.preventDefault();
      var sy = e.clientY, started = false, pre = copyDesign(D), dropTarget = null;
      var visList = [];
      Array.prototype.forEach.call(layersList.children, function (n) {
        if (!n.classList) return;
        if (n.hasAttribute("data-lgrp")) visList.push({ kind: "grp", key: n.getAttribute("data-lgrp"), node: n });
        else if (n.hasAttribute("data-lid")) visList.push({ kind: "el", key: n.getAttribute("data-lid"), node: n });
      });
      var exMembers = kind === "grp" ? new Set(memberIds(key)) : null;
      function excluded(it) {
        if (kind === "grp") return (it.kind === "grp" && it.key === key) || (it.kind === "el" && exMembers.has(it.key));
        return it.kind === "el" && it.key === key;
      }
      try { row.setPointerCapture(e.pointerId); } catch (er) {}
      function mv(ev) {
        if (!started && Math.abs(ev.clientY - sy) < 5) return;
        if (!started) { started = true; row.classList.add("drag"); }
        var below = null, lastNode = null;
        for (var idx = 0; idx < visList.length; idx++) {
          var it = visList[idx]; if (excluded(it)) continue;
          lastNode = it.node;
          var b = it.node.getBoundingClientRect();
          if (below === null && ev.clientY < b.top + b.height / 2) below = it;
        }
        dropTarget = below;
        insLine.style.top = (below ? below.node.offsetTop : (lastNode ? lastNode.offsetTop + lastNode.offsetHeight : 4)) + "px";
        insLine.style.display = "block";
      }
      function up(ev) {
        try { row.releasePointerCapture(ev.pointerId); } catch (er) {}
        row.removeEventListener("pointermove", mv); row.removeEventListener("pointerup", up); row.removeEventListener("pointercancel", up);
        insLine.style.display = "none"; row.classList.remove("drag");
        if (!started) { onRowClick(ev, kind, key); return; }
        var anchorId = null;
        if (dropTarget) {
          if (dropTarget.kind === "el") anchorId = dropTarget.key;
          else { var mm = memberEls(dropTarget.key); anchorId = mm.length ? mm[mm.length - 1].id : null; }
        }
        if (kind === "el") dropElement(key, anchorId); else dropGroup(key, anchorId);
        if (sig(pre) !== sig(D)) pushPre(pre);
        paintStage();
        if (kind === "grp") selectGroup(key, false);
        else if (!selSet.has(key)) { var e2 = elById(key); if (e2) selectElement(e2, {}); } else { paintSel(); paintPanel(); paintLayers(); }
      }
      row.addEventListener("pointermove", mv); row.addEventListener("pointerup", up); row.addEventListener("pointercancel", up);
    }
    function onRowClick(ev, kind, key) {
      if (kind === "grp") { selectGroup(key, ev.metaKey || ev.ctrlKey || ev.shiftKey); return; }
      var el = elById(key); if (!el) return;
      if (ev.shiftKey) selectElement(el, { range: true });
      else if (ev.metaKey || ev.ctrlKey) selectElement(el, { additive: true });
      else selectElement(el, { alt: ev.altKey });
    }
    function wireLayerRow(row, el) {
      row.addEventListener("dblclick", function (e) {
        if (e.target.closest(".lop")) return;
        e.preventDefault(); e.stopPropagation();
        renameRow(row, function () { return el.name || layerName(el); }, function (v) { if (v) el.name = v; else delete el.name; });
      });
      row.addEventListener("pointerdown", function (e) { if (e.button != null && e.button > 0) return; startRowDrag(e, row, "el", el.id); });
      row.addEventListener("contextmenu", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (!selSet.has(el.id)) selectElement(el, { alt: e.altKey });
        openLayerCtx(e.clientX, e.clientY, el, null, row);
      });
    }
    function wireGroupHeader(row, g) {
      row.addEventListener("dblclick", function (e) {
        if (e.target.closest(".cvt") || e.target.closest(".lop")) return;
        e.preventDefault(); e.stopPropagation();
        renameRow(row, function () { return groupName(g); }, function (v) { D.groups[g] = D.groups[g] || {}; D.groups[g].name = v || "Group"; });
      });
      row.addEventListener("pointerdown", function (e) { if (e.button != null && e.button > 0) return; if (e.target.closest(".cvt")) return; startRowDrag(e, row, "grp", g); });
      row.addEventListener("contextmenu", function (e) {
        e.preventDefault(); e.stopPropagation();
        selectGroup(g, false);
        openLayerCtx(e.clientX, e.clientY, null, g, row);
      });
    }

    /* ---- move (shape) + adjust mode (image inside shape) ---- */
    function pannable(el) { var c = el.content; return !!(c && (c.type === "image" || (c.type === "media" && (c.mime || "").indexOf("audio") !== 0))); }
    function applyContentTransform(node, el) {
      var m = node.querySelector("img,video"); if (!m) return;
      var c = el.content || {};
      m.style.transform = "translate(" + (c.ox || 0) + "px," + (c.oy || 0) + "px) scale(" + (c.z || 1) + ")";
      m.style.transformOrigin = "center center";
    }
    function wireEl(node, el) {
      node.addEventListener("contextmenu", function (e) {
        e.preventDefault(); e.stopPropagation();
        if (!selSet.has(el.id)) selectElement(el, { alt: e.altKey });
        openLayerCtx(e.clientX, e.clientY, el, null, null);
      });
      node.addEventListener("dblclick", function (e) {
        var isText = el.content && el.content.type === "text";
        if (!pannable(el) && !isText) return;
        e.preventDefault(); e.stopPropagation();
        if (sel !== el.id) setSel(el.id);
        if (isText) {
          adjust = false; paintSel(); paintPanel(); paintLayers();
          var ta = panel.querySelector("textarea"); if (ta) { ta.focus(); ta.select(); }
          return;
        }
        adjust = !adjust; paintSel(); paintPanel(); paintLayers();
      });
      node.addEventListener("wheel", function (e) {
        if (!(adjust && sel === el.id && pannable(el))) return;
        e.preventDefault();
        var c = el.content;
        mark("wheel:" + el.id);
        c.z = clamp((c.z || 1) * (e.deltaY < 0 ? 1.07 : 0.93), 0.25, 6);
        applyContentTransform(node, el);
      }, { passive: false });
      node.addEventListener("pointerdown", function (e) {
        if (e.button != null && e.button > 0) return;
        e.preventDefault(); e.stopPropagation();
        var additive = e.shiftKey || e.metaKey || e.ctrlKey;
        if (additive) { selectElement(el, { additive: true, alt: e.altKey }); if (!selSet.has(el.id)) return; }
        else if (!selSet.has(el.id)) selectElement(el, { alt: e.altKey });
        else if (sel !== el.id) { sel = el.id; adjust = false; paintSel(); paintPanel(); paintLayers(); }
        var isAdj = adjust && sel === el.id && pannable(el);
        var group = selSet.size > 1 ? selEls().filter(function (o) { return o.id !== el.id && !o.locked; }).map(function (o) { return { o: o, x0: o.x, y0: o.y }; }) : [];
        var c = el.content || {};
        var sx = e.clientX, sy = e.clientY, x0 = el.x, y0 = el.y, ox0 = c.ox || 0, oy0 = c.oy || 0, moved = false;
        var pre = copyDesign(D);
        node.classList.add("akls-dragging");
        try { node.setPointerCapture(e.pointerId); } catch (er) {}
        function mv(ev) {
          var dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 2) return;
          if (!moved) pushPre(pre);
          moved = true;
          if (isAdj) {
            c.ox = Math.round(ox0 + dx); c.oy = Math.round(oy0 + dy);
            applyContentTransform(node, el);
          } else {
            var nx = Math.round(x0 + dx), ny = Math.round(y0 + dy);
            if (grid.snap) {
              var sl = snapX(nx), sr = snapX(nx + el.w);
              nx = (Math.abs(sl - nx) <= Math.abs(sr - (nx + el.w))) ? sl : sr - el.w;
              ny = snapY(ny);
            }
            var sp = spacingSnap(el, nx, ny); /* equal-gap magnet: works locked or free */
            var sm = grid.snap ? { x: nx, y: ny } : smartSnap(el, nx, ny); /* hard lock: grid wins, no guide override */
            if (sp) { if (sp.magX) { sm.x = sp.x; guideV.style.display = "none"; } if (sp.magY) { sm.y = sp.y; guideH.style.display = "none"; } }
            if (grid.snap) {
              guideV.style.display = "none"; guideH.style.display = "none";
              /* clamp the move so el AND the rest of the selection stay inside the grid */
              var g3 = gridB();
              var dLo = g3.l - x0, dHi = g3.r - el.w - x0, dLoY = g3.t - y0, dHiY = g3.b - el.h - y0;
              group.forEach(function (g2) {
                dLo = Math.max(dLo, g3.l - g2.x0); dHi = Math.min(dHi, g3.r - g2.o.w - g2.x0);
                dLoY = Math.max(dLoY, g3.t - g2.y0); dHiY = Math.min(dHiY, g3.b - g2.o.h - g2.y0);
              });
              sm.x = x0 + clamp(sm.x - x0, dLo, Math.max(dLo, dHi));
              sm.y = y0 + clamp(sm.y - y0, dLoY, Math.max(dLoY, dHiY));
            }
            el.x = sm.x; el.y = sm.y;
            applyBoxStyle(node, el); syncSelBox(el);
            group.forEach(function (g2) {
              g2.o.x = g2.x0 + (el.x - x0); g2.o.y = g2.y0 + (el.y - y0);
              var n2 = nodeFor(g2.o.id); if (n2) applyBoxStyle(n2, g2.o);
              syncSelBox(g2.o);
            });
            paintGaps(el, sp);
          }
        }
        function up(ev) {
          node.classList.remove("akls-dragging");
          syncMeas();
          try { node.releasePointerCapture(ev.pointerId); } catch (er) {}
          node.removeEventListener("pointermove", mv); node.removeEventListener("pointerup", up); node.removeEventListener("pointercancel", up);
          if (moved) paintPanel();
          else if (!ev.shiftKey && !ev.metaKey && !ev.ctrlKey && selSet.size > 1) { setSel(el.id); paintSel(); paintPanel(); paintLayers(); }
        }
        node.addEventListener("pointermove", mv); node.addEventListener("pointerup", up); node.addEventListener("pointercancel", up);
      });
    }

    /* ---- resize handles ---- */
    function wireHandle(hd, dir, el) {
      hd.addEventListener("pointerdown", function (e) {
        e.preventDefault(); e.stopPropagation();
        var sx = e.clientX, sy = e.clientY, x0 = el.x, y0 = el.y, w0 = el.w, h0 = el.h;
        var pre = copyDesign(D), hMoved = false;
        function mv(ev) {
          ev.preventDefault();
          if (!hMoved) { pushPre(pre); hMoved = true; }
          var dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
          var x = x0, y = y0, w = w0, hh = h0;
          if (dir.indexOf("e") >= 0) w = w0 + dx;
          if (dir.indexOf("s") >= 0) hh = h0 + dy;
          if (dir.indexOf("w") >= 0) { w = w0 - dx; x = x0 + dx; }
          if (dir.indexOf("n") >= 0) { hh = h0 - dy; y = y0 + dy; }
          if (ev.shiftKey && dir.length === 2 && w0 > 0 && h0 > 0) {
            var f = Math.max(0.02, Math.max(w / w0, hh / h0));
            w = w0 * f; hh = h0 * f;
            x = dir.indexOf("w") >= 0 ? x0 + (w0 - w) : x0;
            y = dir.indexOf("n") >= 0 ? y0 + (h0 - hh) : y0;
          }
          if (grid.snap && !ev.shiftKey) {
            if (dir.indexOf("e") >= 0) w = snapX(x + w) - x;
            if (dir.indexOf("w") >= 0) { var nl = snapX(x); w += x - nl; x = nl; }
            if (dir.indexOf("s") >= 0) hh = snapY(y + hh) - y;
            if (dir.indexOf("n") >= 0) { var nt = snapY(y); hh += y - nt; y = nt; }
          }
          hideGuides();
          if (!ev.shiftKey && !grid.snap) { /* neighbor-edge magnets never override grid lock */
            if (dir.indexOf("e") >= 0) w = snapEdge(el, x + w, "x") - x;
            if (dir.indexOf("w") >= 0) { var nl2 = snapEdge(el, x, "x"); w += x - nl2; x = nl2; }
            if (dir.indexOf("s") >= 0) hh = snapEdge(el, y + hh, "y") - y;
            if (dir.indexOf("n") >= 0) { var nt2 = snapEdge(el, y, "y"); hh += y - nt2; y = nt2; }
          }
          if (grid.snap) { /* hard bounds — resizing (incl. \u21e7 proportional) stops at the grid */
            var gb = gridB();
            if (x < gb.l) { w -= (gb.l - x); x = gb.l; }
            if (x + w > gb.r) w = gb.r - x;
            if (y < gb.t) { hh -= (gb.t - y); y = gb.t; }
            if (y + hh > gb.b) hh = gb.b - y;
          }
          if (w < 14) { if (dir.indexOf("w") >= 0) x -= (14 - w); w = 14; }
          if (hh < 4) { if (dir.indexOf("n") >= 0) y -= (4 - hh); hh = 4; }
          el.x = Math.round(x); el.y = Math.round(y); el.w = Math.round(w); el.h = Math.round(hh);
          var n = nodeFor(el.id); if (n) applyBoxStyle(n, el);
          syncSelBox(el);
          paintGaps(el, null); /* scaling shows the same gap + reference readouts as dragging */
        }
        function up() {
          syncMeas();
          removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
          paintSel(); paintPanel();
        }
        addEventListener("pointermove", mv); addEventListener("pointerup", up); addEventListener("pointercancel", up);
      });
    }

    /* ---- uniform scale grip ---- */
    function wireScale(hd, el) {
      hd.addEventListener("pointerdown", function (e) {
        e.preventDefault(); e.stopPropagation();
        var cx = el.x + el.w / 2, cy = el.y + el.h / 2, w0 = el.w, h0 = el.h;
        var r = stage.getBoundingClientRect();
        var sx = (e.clientX - r.left) / k, sy = (e.clientY - r.top) / k;
        var d0 = Math.max(20, Math.hypot(sx - cx, sy - cy));
        var pre = copyDesign(D), sMoved = false;
        function mv(ev) {
          ev.preventDefault();
          if (!sMoved) { pushPre(pre); sMoved = true; }
          var px = (ev.clientX - r.left) / k, py = (ev.clientY - r.top) / k;
          var f = clamp(Math.hypot(px - cx, py - cy) / d0, 0.05, 20);
          el.w = Math.max(14, Math.round(w0 * f));
          el.h = Math.max(4, Math.round(h0 * f));
          el.x = Math.round(cx - el.w / 2); el.y = Math.round(cy - el.h / 2);
          clampBoxToGrid(el);
          var n = nodeFor(el.id); if (n) applyBoxStyle(n, el);
          syncSelBox(el);
          paintGaps(el, null);
        }
        function up() {
          syncMeas();
          removeEventListener("pointermove", mv); removeEventListener("pointerup", up); removeEventListener("pointercancel", up);
          paintSel(); paintPanel();
        }
        addEventListener("pointermove", mv); addEventListener("pointerup", up); addEventListener("pointercancel", up);
      });
    }

    /* ---- element ops ---- */
    /* lowest occupied y across visible content (0 when empty) */
    function bottomOfContent() {
      var b = 0;
      D.els.forEach(function (e) { if (!e.hidden) b = Math.max(b, e.y + e.h); });
      return b;
    }
    /* first genuinely empty slot for a new w×h box: fills gaps beside existing
       content before falling back to the space below, so nothing lands hidden. */
    function freeSpot(w, hh) {
      var G = 24, boxes = [];
      D.els.forEach(function (e) { if (!e.hidden) boxes.push({ x: e.x, y: e.y, w: e.w, h: e.h }); });
      if (!boxes.length) return { x: Math.round((DW - w) / 2), y: 40 };
      function hits(x, y) {
        if (x < 0 || y < 0 || x + w > DW) return true;
        return boxes.some(function (b) { return x < b.x + b.w + G && x + w + G > b.x && y < b.y + b.h + G && y + hh + G > b.y; });
      }
      var cand = [{ x: 40, y: 40 }];
      boxes.forEach(function (b) {
        cand.push({ x: b.x + b.w + G, y: b.y });
        cand.push({ x: b.x, y: b.y + b.h + G });
        cand.push({ x: 40, y: b.y + b.h + G });
      });
      cand = cand.filter(function (p) { return !hits(p.x, p.y); })
        .sort(function (a, b) { return (a.y - b.y) || (a.x - b.x); });
      if (cand.length) return cand[0];
      var below = bottomOfContent();
      return { x: Math.round((DW - w) / 2), y: below + G };
    }
    function addEl(preset) {
      snapNow();
      var el = Object.assign({ id: uid(), kind: "rect", x: 0, y: 0, w: 300, h: 200, r: 0, fill: "#26231D", stroke: "", strokeW: 0, opacity: 1, content: null }, preset);
      var spot = freeSpot(el.w, el.h);
      el.x = spot.x;
      el.y = spot.y;
      var need = el.y + el.h + 40;
      if (D.h < need) { D.h = need; fit(); }
      if (grid.snap) { var l2 = snapX(el.x), r2 = snapX(el.x + el.w); el.w = Math.max(14, r2 - l2); el.x = l2; el.y = snapY(el.y); }
      D.els.push(el);
      paintStage(); select(el.id); paintPanel();
      revealEl(el);
    }
    /* bring a just-added element into view so it is never "added somewhere off-screen" */
    function revealEl(el) {
      requestAnimationFrame(function () {
        var n = stage && stage.querySelector('[data-el-id="' + el.id + '"]');
        if (!n || !area) return;
        var r = n.getBoundingClientRect(), a = area.getBoundingClientRect();
        if (r.top < a.top + 12 || r.bottom > a.bottom - 12) area.scrollTop += r.top - a.top - (a.height - r.height) / 2;
        if (r.left < a.left + 12 || r.right > a.right - 12) area.scrollLeft += r.left - a.left - (a.width - r.width) / 2;
      });
    }
    /* insert a 6-tile bento grid — six distinct sizes, every tile a plain editable rect */
    function addBento() {
      snapNow();
      var boxes = [
        { name: "HERO",   x: 40,  y: 40,  w: 550,  h: 380, hero: true },
        { name: "MEDIUM", x: 610, y: 40,  w: 550,  h: 180 },
        { name: "SMALL",  x: 610, y: 240, w: 265,  h: 180 },
        { name: "TALL",   x: 895, y: 240, w: 265,  h: 380 },
        { name: "WIDE",   x: 40,  y: 440, w: 835,  h: 180 },
        { name: "FULL",   x: 40,  y: 660, w: 1120, h: 620 }
      ];
      function ph(b) {
        var ac = b.hero ? "#E5783A" : "#8A857C", ts = b.hero ? 26 : 16;
        var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + b.w + '" height="' + b.h + '" viewBox="0 0 ' + b.w + ' ' + b.h + '">'
          + '<defs><pattern id="s" width="16" height="16" patternTransform="rotate(45)" patternUnits="userSpaceOnUse"><line x1="0" y1="0" x2="0" y2="16" stroke="#33302A" stroke-width="8"/></pattern></defs>'
          + '<rect width="100%" height="100%" fill="#26231D"/><rect width="100%" height="100%" fill="url(#s)" opacity=".55"/>'
          + '<text x="50%" y="' + (b.h / 2 - 8) + '" fill="' + ac + '" font-family="Inter,sans-serif" font-size="' + ts + '" font-weight="700" letter-spacing="2" text-anchor="middle" dominant-baseline="central">' + b.name + '</text>'
          + '<text x="50%" y="' + (b.h / 2 + 16) + '" fill="#6E6A60" font-family="Inter,sans-serif" font-size="10" letter-spacing="3" text-anchor="middle" dominant-baseline="central">IMAGE \u00b7 COVER</text>'
          + '</svg>';
        return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
      }
      var _cb = bottomOfContent(), delta = _cb > 0 ? (_cb + 24 - 40) : 0;
      var made = [];
      boxes.forEach(function (b) {
        var id = uid(); made.push(id);
        D.els.push({
          id: id, kind: "rect", x: b.x, y: b.y + delta, w: b.w, h: b.h, r: 20,
          fill: "#26231D", stroke: b.hero ? "#E5783A" : "#373634", strokeW: b.hero ? 1.5 : 1, opacity: 1,
          content: null,
          bento: true,
          detail: { eyebrow: b.name, title: "", body: "", tags: [], refs: [] }
        });
      });
      var need = 1260 + delta + 40;
      if (D.h < need) { D.h = need; fit(); }
      selSet = new Set(made); sel = made[made.length - 1]; adjust = false;
      paintStage(); paintPanel();
    }
    function removeEl(el) {
      snapNow();
      D.els = D.els.filter(function (x) { return x.id !== el.id; });
      setSel(null); paintStage(); paintPanel();
    }
    function removeSel() {
      if (!selSet.size) return;
      snapNow();
      D.els = D.els.filter(function (x) { return !(selSet.has(x.id) && !x.locked); });
      setSel(null); pruneGroups(); paintStage(); paintPanel();
    }
    function dupEl(el) {
      snapNow();
      var c = copy(el); c.id = uid(); c.x += 24; c.y += 24; delete c.grp; clampBoxToGrid(c);
      D.els.push(c); paintStage(); select(c.id);
    }
    function dupSel() {
      if (selSet.size < 2) { var el = getSel(); if (el) dupEl(el); return; }
      snapNow();
      var made = [], gmap = {};
      selEls().forEach(function (o) {
        var c2 = copy(o); c2.id = uid(); c2.x += 10; c2.y += 10; clampBoxToGrid(c2);
        if (o.grp) {
          if (!gmap[o.grp]) { var ng = newGrpId(); gmap[o.grp] = ng; D.groups[ng] = { name: groupName(o.grp) + " copy" }; }
          c2.grp = gmap[o.grp];
        }
        D.els.push(c2); made.push(c2.id);
      });
      reclusterGroups();
      selSet = new Set(made); sel = made[made.length - 1]; adjust = false;
      paintStage(); paintPanel();
    }
    /* ---- clipboard: copy / cut / paste els. In-memory + localStorage (cross
       project / page, same origin) + system clipboard (cross tab) = "from anywhere". */
    var LS_CLIP = "AKLS_CLIP", clip = null;
    function clipPayload() {
      var els = selEls(); if (!els.length) return null;
      var groups = {};
      els.forEach(function (e) { if (e.grp && D.groups[e.grp]) groups[e.grp] = D.groups[e.grp]; });
      return { __akls_clip: 1, els: els.map(function (e) { return copy(e); }), groups: JSON.parse(JSON.stringify(groups)) };
    }
    function parseClip(txt) { try { var o = JSON.parse(txt); if (o && o.__akls_clip && o.els && o.els.length) return o; } catch (e) {} return null; }
    function readLSClip() { try { return parseClip(localStorage.getItem(LS_CLIP) || ""); } catch (e) { return null; } }
    function copySel() {
      var d = clipPayload(); if (!d) { toast("Nothing selected to copy"); return; }
      clip = d; var json = JSON.stringify(d);
      try { localStorage.setItem(LS_CLIP, json); } catch (e) {}
      try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json).catch(function () {}); } catch (e) {}
      toast(d.els.length + (d.els.length > 1 ? " layers copied" : " copied"));
    }
    function cutSel() { if (!selSet.size) return; copySel(); removeSel(); }
    function pasteData(d, dx, dy) {
      if (!d || !d.els || !d.els.length) return false;
      snapNow();
      dx = dx == null ? 28 : dx; dy = dy == null ? 28 : dy;
      var gmap = {}, made = [], maxB = 0;
      d.els.forEach(function (o) {
        var c2 = copy(o); c2.id = uid();
        c2.x = Math.round((o.x || 0) + dx); c2.y = Math.round((o.y || 0) + dy);
        if (o.grp) {
          if (!gmap[o.grp]) { var ng = newGrpId(); gmap[o.grp] = ng; D.groups[ng] = { name: (d.groups && d.groups[o.grp] && d.groups[o.grp].name) || "Group" }; }
          c2.grp = gmap[o.grp];
        } else delete c2.grp;
        clampBoxToGrid(c2);
        D.els.push(c2); made.push(c2.id); maxB = Math.max(maxB, c2.y + c2.h);
      });
      reclusterGroups();
      if (D.h < maxB + 40) { D.h = maxB + 40; fit(); }
      selSet = new Set(made); sel = made[made.length - 1]; adjust = false;
      paintStage(); paintPanel();
      toast(made.length + (made.length > 1 ? " layers pasted" : " pasted"));
      return true;
    }
    function pasteInternal() { return pasteData(clip || readLSClip()); }
    function zMove(el, dir) {
      var i = D.els.indexOf(el), j = i + dir;
      if (i < 0 || j < 0 || j >= D.els.length) return;
      snapNow();
      D.els.splice(j, 0, D.els.splice(i, 1)[0]);
      paintStage(); paintPanel();
    }

    /* ---- paste (Figma → studio): images, SVG, text ---- */
    function addImageFromData(data) {
      var im = new Image();
      im.onload = function () {
        var nw = im.naturalWidth || 700, nh = im.naturalHeight || 400;
        var w = Math.min(700, nw), hh = Math.min(900, Math.round(w * nh / nw));
        addEl({ kind: "rect", w: w, h: hh, r: 10, fill: "none", content: { type: "image", src: data, fit: "contain" } });
      };
      im.onerror = function () { addEl({ kind: "rect", w: 520, h: 340, r: 10, fill: "none", content: { type: "image", src: data, fit: "cover" } }); };
      im.src = data;
    }
    function onPaste(e) {
      var t = e.target && e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      var cd = e.clipboardData;
      if (!cd) { if (pasteInternal()) e.preventDefault(); return; }
      var txt = cd.getData("text/plain") || "";
      var mine = parseClip(txt);
      if (mine) { e.preventDefault(); pasteData(mine); return; }   // studio els copied here or in another tab
      for (var i = 0; i < cd.items.length; i++) {
        var it = cd.items[i];
        if (it.kind === "file" && it.type.indexOf("image/") === 0) {
          var f = it.getAsFile();
          if (f) {
            var r = new FileReader();
            r.onload = function () { addImageFromData(r.result); };
            r.readAsDataURL(f);
            e.preventDefault();
            toast("Image pasted");
            return;
          }
        }
      }
      if (/^\s*<svg[\s\S]*<\/svg>\s*$/i.test(txt)) {
        addImageFromData("data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(txt))));
        e.preventDefault();
        toast("SVG pasted as image");
        return;
      }
      if (txt.trim()) {
        var lines = txt.trim().split("\n").length;
        addEl({ kind: "rect", w: 640, h: clamp(40 + lines * 32, 80, 800), fill: "none",
          content: { type: "text", text: txt.trim(), font: FONTS[0][0], size: 20, weight: 500, color: "#FFFFFF", ls: 0, lh: 1.5, align: "left", valign: "top", pt: 8, pr: 8, pb: 8, pl: 8, strokeW: 0, strokeC: "#000000" } });
        e.preventDefault();
        toast("Text pasted \u2014 style it in the inspector");
        return;
      }
      if (pasteInternal()) e.preventDefault();   // fallback when the OS clipboard is unreadable
    }
    addEventListener("paste", onPaste);

    /* ---- keyboard ---- */
    function onKey(e) {
      var t = e.target && e.target.tagName;
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      if (D.layout === "grid") {
        /* grid mode is a generated stack — only history + escape apply */
        if (e.key === "Escape") { if (sel) { setSel(null); paintPanel(); paintLayers(); } return; }
        if (!((e.ctrlKey || e.metaKey) && /^[zZyY]$/.test(e.key))) return;
      }
      var mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); if (e.shiftKey) redoFn(); else undo(); return; }
      if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); redoFn(); return; }
      if (mod && (e.key === "=" || e.key === "+")) { e.preventDefault(); zoomMode = "manual"; k = clamp(k * 1.2, 0.08, 4); applyZoom(); return; }
      if (mod && e.key === "-") { e.preventDefault(); zoomMode = "manual"; k = clamp(k / 1.2, 0.08, 4); applyZoom(); return; }
      if (mod && e.key === "0") { e.preventDefault(); zoomMode = "fit"; fit(); return; }
      if (mod && e.key === "1") { e.preventDefault(); zoomMode = "manual"; k = 1; applyZoom(); return; }
      if (!mod && !e.altKey && (e.key === "g" || e.key === "G")) { e.preventDefault(); toggleGrid(); return; }
      if (!mod && !e.altKey && (e.key === "l" || e.key === "L")) { e.preventDefault(); toggleLock(); return; }
      if (!mod && !e.altKey && (e.key === "m" || e.key === "M")) { e.preventDefault(); toggleMeas(); return; }
      if (e.altKey && e.shiftKey && (e.key === "v" || e.key === "V")) { e.preventDefault(); selGap("y", null); return; }
      if (e.altKey && e.shiftKey && (e.key === "h" || e.key === "H")) { e.preventDefault(); selGap("x", null); return; }
      if (mod && e.shiftKey && (e.key === "g" || e.key === "G")) { e.preventDefault(); ungroupSelection(); return; }
      if (mod && (e.key === "g" || e.key === "G")) { e.preventDefault(); groupSelection(); return; }
      if (mod && e.shiftKey && (e.key === "h" || e.key === "H")) { e.preventDefault(); toggleHideSel(); return; }
      if (mod && e.shiftKey && (e.key === "l" || e.key === "L")) { e.preventDefault(); toggleLockSel(); return; }
      if (mod && (e.key === "a" || e.key === "A")) { e.preventDefault(); selectAll(); return; }
      if (mod && !e.shiftKey && (e.key === "c" || e.key === "C")) { e.preventDefault(); copySel(); return; }
      if (mod && !e.shiftKey && (e.key === "x" || e.key === "X")) { e.preventDefault(); cutSel(); return; }
      var el = getSel();
      if (e.key === "Escape") {
        if (adjust) { adjust = false; paintSel(); paintPanel(); }
        else if (sel) { setSel(null); paintSel(); paintPanel(); paintLayers(); }
        return;
      }
      if (!el) return;
      if (mod && (e.key === "d" || e.key === "D")) { e.preventDefault(); dupSel(); return; }
      if (mod && e.key === "]") { e.preventDefault(); zMove(el, 1); return; }
      if (mod && e.key === "[") { e.preventDefault(); zMove(el, -1); return; }
      var st = grid.snap ? (e.shiftKey ? 1 : 8) : (e.shiftKey ? 10 : 1);
      if (e.key.indexOf("Arrow") === 0) mark("nudge:" + el.id);
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeSel(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); editableEls().forEach(function (o) { o.x -= st; clampBoxToGrid(o); refreshNode(o); }); }
      else if (e.key === "ArrowRight") { e.preventDefault(); editableEls().forEach(function (o) { o.x += st; clampBoxToGrid(o); refreshNode(o); }); }
      else if (e.key === "ArrowUp") { e.preventDefault(); editableEls().forEach(function (o) { o.y -= st; clampBoxToGrid(o); refreshNode(o); }); }
      else if (e.key === "ArrowDown") { e.preventDefault(); editableEls().forEach(function (o) { o.y += st; clampBoxToGrid(o); refreshNode(o); }); }
      if (e.key.indexOf("Arrow") === 0) flashGaps(el);
    }
    addEventListener("keydown", onKey);
    /* hold Alt/Option \u2014 measure the selected layer against its neighbours without moving it */
    function altMeasure(e) {
      if (!e.altKey || !sel) return;
      var el = D.els.filter(function (o) { return o.id === sel; })[0];
      if (el) { clearTimeout(gapTimer); paintGaps(el, null); }
    }
    function altRelease(e) { if (!e.altKey) syncMeas(); }
    addEventListener("keydown", altMeasure);
    addEventListener("keyup", altRelease);

    /* ---- inspector field helpers ---- */
    function sec(t) { return h("div", { class: "akls-sec" }, [t]); }
    function lab(t) { return h("label", { class: "akls-lab" }, [t]); }
    function fw(label, node) { return h("div", { class: "akls-f" }, [label ? lab(label) : null, node]); }
    function grid2(a, b) { return h("div", { class: "akls-grid2" }, [a, b]); }
    function pin(pfx, input, tip) {
      return h("div", { class: "akls-in", title: tip || null }, [pfx ? h("span", { class: "pfx" }, [pfx]) : null, input]);
    }
    function numRaw(val, cb, step, min, max) {
      var i = h("input", { type: "number", value: Math.round(val * 100) / 100, step: step || 1 });
      if (min != null) i.setAttribute("min", min);
      if (max != null) i.setAttribute("max", max);
      i.addEventListener("input", function () { var v = parseFloat(i.value); if (!isNaN(v)) cb(v); });
      return i;
    }
    function mixRow(rmin, rmax, rstep, val, fmt, apply) {
      var r = h("input", { type: "range", min: rmin, max: rmax, step: rstep, value: val });
      var n = h("input", { type: "number", value: val, step: rstep });
      r.addEventListener("input", function () { n.value = r.value; apply(parseFloat(r.value)); });
      n.addEventListener("input", function () { var v = parseFloat(n.value); if (!isNaN(v)) { v = clamp(v, rmin, rmax); r.value = v; apply(v); } });
      return h("div", { class: "akls-mixrow" }, [r, pin(fmt, n)]);
    }
    function colorRow(val, cb, extra) {
      var c = h("input", { type: "color", class: "akls-sw", value: /^#[0-9a-f]{6}$/i.test(val || "") ? val : "#26231D" });
      var t = h("input", { type: "text", value: val || "", placeholder: "#26231D" });
      c.addEventListener("input", function () { t.value = c.value; cb(c.value); });
      t.addEventListener("input", function () { var v = t.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) c.value = v; cb(v); });
      return h("div", { class: "akls-colorrow" }, [c, pin(null, t), extra || null]);
    }
    function chkRow(input, txt) { return h("label", { class: "akls-chk" }, [input, txt]); }
    function act(icon, txt, tip, fn, warn) {
      return h("button", { class: "akls-act" + (warn ? " warn" : ""), title: tip, html: icon + "<span>" + txt + "</span>", onclick: fn });
    }
    function keyRow(l, kk) { return h("div", { class: "akls-key" }, [h("span", {}, [l]), h("span", { class: "k" }, [kk])]); }
    function note(txt) { return h("p", { class: "akls-note" }, [txt]); }
    function seg(opts2, cur, cb) {
      var wrap = h("div", { class: "akls-seg" });
      opts2.forEach(function (o) {
        var b = h("button", { class: o[0] === cur ? "on" : "", onclick: function () {
          wrap.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on"); cb(o[0]);
        } }, [o[1]]);
        wrap.appendChild(b);
      });
      return wrap;
    }

    /* ---- equal pixel gaps across a multi-selection ----------------------------
       Works on BANDS, not a flat chain: tiles that overlap on the axis (a bento
       row, or a column) move together as one unit, so a grid keeps its structure
       and only the gutters change. gap === null averages the existing spread. */
    function bandsOf(arr, p, s) {
      var out = [], cur = null;
      arr.slice().sort(function (a, b) { return a[p] - b[p]; }).forEach(function (e) {
        if (cur && e[p] < cur.end - 1) {
          cur.els.push(e); cur.start = Math.min(cur.start, e[p]); cur.end = Math.max(cur.end, e[p] + e[s]);
        } else { cur = { els: [e], start: e[p], end: e[p] + e[s] }; out.push(cur); }
      });
      return out;
    }
    function spaceBands(list, p, s, gap) {
      var bands = bandsOf(list, p, s);
      if (bands.length < 2) return null;
      var g = gap;
      if (g == null || isNaN(g)) {
        var span = bands[bands.length - 1].end - bands[0].start, filled = 0;
        bands.forEach(function (b2) { filled += b2.end - b2.start; });
        g = Math.round((span - filled) / (bands.length - 1));
      }
      g = Math.max(0, Math.round(g));
      var pos = bands[0].end + g;
      for (var i = 1; i < bands.length; i++) {
        var b = bands[i], d = Math.round(pos - b.start);
        if (d) b.els.forEach(function (e) { e[p] += d; refreshNode(e); });
        b.start += d; b.end += d;
        pos = b.end + g;
      }
      return { n: bands.length, gap: g };
    }
    /* axis "y": whole rows shift, keeping each row intact.
       axis "x": gutters are evened INSIDE each row, so a full-width tile below
       never blocks the columns above it. */
    function selGap(axis, gap, quiet) {
      var all = selEls();
      var arr = all.filter(function (e) { return !e.locked; });
      if (arr.length < 2) {
        if (!quiet) toast(all.length > arr.length ? "Unlock the selected layers first (\u2318\u21e7L)" : "Select 2+ layers \u2014 Shift or \u2318-click");
        return false;
      }
      var lists = axis === "y" ? [arr] : bandsOf(arr, "y", "h").map(function (r) { return r.els; });
      var can = lists.some(function (l) { return bandsOf(l, axis === "y" ? "y" : "x", axis === "y" ? "h" : "w").length > 1; });
      if (!can) {
        if (!quiet) toast(axis === "y" ? "Nothing stacked \u2014 these layers share one row. Try Cols \u2192" : "Nothing side by side \u2014 these layers share one column. Try Rows \u2193");
        return false;
      }
      snapNow();
      var used = null, moved = 0;
      lists.forEach(function (l) {
        var r = spaceBands(l, axis === "y" ? "y" : "x", axis === "y" ? "h" : "w", gap);
        if (r) { used = r.gap; moved += r.n; }
      });
      if (axis === "y") {
        var need = 0;
        arr.forEach(function (e) { need = Math.max(need, e.y + e.h); });
        if (need + 40 > D.h) { D.h = Math.min(HMAXCAP, Math.round(need + 40)); fit(); }
      }
      paintSel(); paintPanel(); paintLayers();
      var over = axis === "x" && arr.some(function (e) { return e.x + e.w > DW; });
      if (!quiet) {
        toast((axis === "y" ? "Row gaps" : "Column gaps") + " set to " + used + "px" +
          (over ? " \u2014 a row now runs past the canvas edge" : "") + (all.length > arr.length ? " (locked skipped)" : ""));
        flashGaps(getSel(), 2200);
      }
      return true;
    }
    /* both axes at once \u2014 the bento case: uniform gutters in x and y */
    function selGapBoth(gap) {
      var okY = selGap("y", gap, true), okX = selGap("x", gap, true);
      if (!okX && !okY) { toast("Select 2+ layers that sit apart in a row or a stack"); return; }
      toast("Gutters set to " + Math.max(0, Math.round(gap)) + "px both ways");
      flashGaps(getSel(), 2200);
    }
    /* the gap the selection currently averages on an axis \u2014 seeds the input */
    function avgGap(axis) {
      var arr = selEls();
      if (arr.length < 2) return 24;
      var lists = axis === "y" ? [arr] : bandsOf(arr, "y", "h").map(function (r) { return r.els; });
      var gaps = [];
      lists.forEach(function (l) {
        var p = axis === "y" ? "y" : "x", s = axis === "y" ? "h" : "w";
        var bands = bandsOf(l, p, s);
        if (bands.length < 2) return;
        var span = bands[bands.length - 1].end - bands[0].start, filled = 0;
        bands.forEach(function (b2) { filled += b2.end - b2.start; });
        gaps.push((span - filled) / (bands.length - 1));
      });
      if (!gaps.length) return 24;
      var sum = 0; gaps.forEach(function (g) { sum += g; });
      return Math.max(0, Math.round(sum / gaps.length));
    }
    /* which way the selection reads \u2014 stacked or in a row */
    function selAxis() {
      var arr = selEls();
      if (arr.length < 2) return "y";
      return bandsOf(arr, "y", "h").length > 1 ? "y" : "x";
    }

    /* ---- inspector ---- */
    function paintPanel() {
      panel.innerHTML = "";
      var el = getSel();

      if (selSet.size > 1) {
        var selArr = selEls();
        var anyGrp = selArr.some(function (e) { return e.grp; });
        var anyVis = selArr.some(function (e) { return !e.hidden; });
        var anyUnl = selArr.some(function (e) { return !e.locked; });
        panel.appendChild(sec(selSet.size + " layers selected"));
        panel.appendChild(grid2(
          act(ICO.group, "Group", "Group selection (Ctrl+G)", groupSelection),
          act(ICO.ungroup, "Ungroup", "Ungroup (Ctrl+Shift+G)", ungroupSelection)
        ));
        if (anyGrp) panel.appendChild(note("A group keeps its layers together \u2014 click any member to select the whole group."));
        panel.appendChild(sec("Equal spacing"));
        var gapAx = selAxis();
        var gapPx = avgGap(gapAx);
        var gapIn = numRaw(gapPx, function (v) { gapPx = v; }, 1, 0, 900);
        function gapVal() { var v = parseFloat(gapIn.value); return isNaN(v) ? null : v; }
        gapIn.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); selGap(gapAx, gapVal()); } });
        panel.appendChild(grid2(
          act(ICO.distV, "Rows \u2193", "Equal gaps between rows \u2014 tiles sharing a row move together", function () { selGap("y", null); }),
          act(ICO.distH, "Cols \u2192", "Equal gaps between columns \u2014 tiles sharing a column move together", function () { selGap("x", null); })
        ));
        panel.appendChild(grid2(
          pin("GAP", gapIn, "Exact pixel gutter \u2014 Enter applies"),
          seg([["y", "Rows \u2193"], ["x", "Cols \u2192"]], gapAx, function (v) { gapAx = v; gapPx = avgGap(v); gapIn.value = gapPx; })
        ));
        panel.appendChild(h("button", { class: "akls-sm w100", html: ICO.ruler + "<span>Apply gap on this axis</span>",
          onclick: function () { selGap(gapAx, gapVal()); } }));
        panel.appendChild(h("button", { class: "akls-sm w100", html: ICO.bento + "<span>Apply gap both ways (bento)</span>",
          onclick: function () { var v = gapVal(); selGapBoth(v == null ? avgGap("y") : v); } }));
        panel.appendChild(note("Gutter-aware: layers that overlap on the axis count as one row (or column) and shift together, so a bento keeps its shape."));
        panel.appendChild(grid2(
          act(anyVis ? ICO.eyeOff : ICO.eye, anyVis ? "Hide" : "Show", "Toggle visibility (Ctrl+Shift+H)", function () { setHiddenEls(selArr, anyVis); }),
          act(anyUnl ? ICO.lock : ICO.unlock, anyUnl ? "Lock" : "Unlock", "Toggle lock (Ctrl+Shift+L)", function () { setLockedEls(selArr, anyUnl); })
        ));
        panel.appendChild(grid2(
          act(ICO.dup, "Copy", "Duplicate (Ctrl+D)", dupSel),
          act(ICO.del, "Delete", "Delete (Del)", removeSel, true)
        ));
        panel.appendChild(note("Drag on canvas to move all selected together. Click one layer to edit its properties."));
        return;
      }

      if (!el) {
        /* page settings — like clicking empty canvas in a design app */
        function bgSection() {
          var bgNone = h("input", { type: "checkbox" });
          bgNone.checked = !D.bg;
          function repaintBg() { applyZoom(); if (D.layout === "grid") paintGridPrev(); }
          var bgRow = colorRow(/^#[0-9a-f]{6}$/i.test(D.bg || "") ? D.bg : "#1C1A14", function (v) { bgNone.checked = false; D.bg = v; repaintBg(); });
          bgNone.addEventListener("change", function () {
            D.bg = bgNone.checked ? "" : bgRow.querySelector("input[type=color]").value;
            repaintBg();
          });
          panel.appendChild(fw("Background", bgRow));
          panel.appendChild(chkRow(bgNone, "Transparent background"));
        }

        panel.appendChild(sec("Bento layout"));
        panel.appendChild(seg([["canvas", "Canvas"], ["grid", "Grid"]], D.layout === "grid" ? "grid" : "canvas", function (v) { setLayout(v); paintPanel(); }));

        if (D.layout === "grid") {
          panel.appendChild(grid2(
            pin("GAP", numRaw(D.gridGap != null ? D.gridGap : 34, function (v) { D.gridGap = clamp(Math.round(v), 0, 160); paintGridPrev(); }, 2, 0, 160), "Space between stacked cards"),
            h("span", {})
          ));
          var capOn = h("input", { type: "checkbox" }); capOn.checked = D.gridCaps !== false;
          capOn.addEventListener("change", function () { D.gridCaps = capOn.checked; paintGridPrev(); });
          panel.appendChild(chkRow(capOn, "Show card titles"));
          panel.appendChild(sec("Canvas"));
          bgSection();
          panel.appendChild(note("Grid mode stacks every card full width, one per row, in reading order \u2014 images, video, prototypes and 3D play at full size. Positions and sizes stay saved: switch back to Canvas any time."));
          return;
        }

        panel.appendChild(sec("Canvas"));
        var wFix = h("input", { type: "number", value: 1200, disabled: "" });
        panel.appendChild(grid2(
          pin("W", wFix, "Design width is fixed at 1200 units"),
          pin("H", numRaw(D.h, function (v) { if (v >= 120 && v <= HMAXCAP) { D.h = v; fit(); } }, 10, 120, HMAXCAP), "Canvas height")
        ));
        bgSection();

        panel.appendChild(sec("Layout grid"));
        var gOn = h("input", { type: "checkbox" }); gOn.checked = grid.on;
        gOn.addEventListener("change", function () { grid.on = gOn.checked; gridBtn.classList.toggle("on", grid.on); paintGrid(); updateStatus(); });
        var gSnap = h("input", { type: "checkbox" }); gSnap.checked = grid.snap;
        gSnap.addEventListener("change", function () { grid.snap = gSnap.checked; syncGrid(); lockBtn.classList.toggle("on", grid.snap); updateStatus(); });
        panel.appendChild(h("div", { style: "display:flex;gap:16px" }, [chkRow(gOn, "Show (G)"), chkRow(gSnap, "Grid lock (L)")]));
        panel.appendChild(grid2(
          pin("Col", numRaw(grid.cols, function (v) { grid.cols = clamp(Math.round(v), 1, 24); paintGrid(); updateStatus(); }, 1, 1, 24), "Columns"),
          pin("Gut", numRaw(grid.gutter, function (v) { grid.gutter = clamp(v, 0, 120); paintGrid(); }, 1, 0, 120), "Gutter")
        ));
        panel.appendChild(grid2(
          pin("Mar", numRaw(grid.margin, function (v) { grid.margin = clamp(v, 0, 300); paintGrid(); }, 1, 0, 300), "Side margins"),
          h("span", {})
        ));
        panel.appendChild(note("12 col \u00b7 24 gutter \u00b7 36 margin = the standard 1200px web grid. Grid lock snaps shapes to column edges and an 8px baseline even when the grid is hidden \u2014 toggle it off for free placement."));

        panel.appendChild(sec("Shortcuts"));
        panel.appendChild(keyRow("Move / resize", "drag / pull edges"));
        panel.appendChild(keyRow("Multi-select", "\u21e7 / \u2318 click \u00b7 drag canvas"));
        panel.appendChild(keyRow("Select all", "Ctrl A"));
        panel.appendChild(keyRow("Group / ungroup", "Ctrl G / Ctrl \u21e7 G"));
        panel.appendChild(keyRow("Hide / lock", "Ctrl \u21e7 H / Ctrl \u21e7 L"));
        panel.appendChild(keyRow("Rename layer", "dbl-click its row"));
        panel.appendChild(keyRow("Uniform scale", "\u21e7 + corner"));
        panel.appendChild(keyRow("Edit text / adjust image", "double-click"));
        panel.appendChild(keyRow("Grid show / lock", "G / L"));
        panel.appendChild(keyRow("Duplicate", "Ctrl D"));
        panel.appendChild(keyRow("Copy / paste", "Ctrl C / V"));
        panel.appendChild(keyRow("Undo / redo", "Ctrl Z / Y"));
        panel.appendChild(keyRow("Front / back", "Ctrl ] / ["));
        panel.appendChild(keyRow("Pan canvas", "Space-drag \u00b7 middle-drag"));
        panel.appendChild(keyRow("Zoom", "Ctrl scroll \u00b7 \u00b1 \u00b7 0 fit \u00b7 1 = 100%"));
        panel.appendChild(keyRow("Scroll", "wheel \u00b7 \u21e7 wheel = sideways"));
        panel.appendChild(keyRow("Nudge (8px locked \u00b7 \u21e7 fine)", "arrow keys"));
        panel.appendChild(keyRow("Measure gaps (pink = this layer \u00b7 blue dashed = neighbours\u2019 gap)", "hold \u2325 Alt"));
        panel.appendChild(keyRow("Gap rulers always on", "M"));
        panel.appendChild(keyRow("Delete selection", "Del"));
        return;
      }

      /* --- selected element --- */
      var typeName = el.content && el.content.type === "text" ? "Text" : el.kind === "ellipse" ? "Ellipse" : (el.h <= 8 && !el.content ? "Line" : "Rectangle");
      panel.appendChild(sec(typeName));
      panel.appendChild(grid2(
        pin("X", numRaw(el.x, function (v) { el.x = v; clampBoxToGrid(el); refreshNode(el); })),
        pin("Y", numRaw(el.y, function (v) { el.y = v; clampBoxToGrid(el); refreshNode(el); }))
      ));
      panel.appendChild(grid2(
        pin("W", numRaw(el.w, function (v) { if (v >= 14) { el.w = v; clampBoxToGrid(el); refreshNode(el); } }, 1, 14)),
        pin("H", numRaw(el.h, function (v) { if (v >= 4) { el.h = v; clampBoxToGrid(el); refreshNode(el); } }, 1, 4))
      ));
      panel.appendChild(note("Scale uniformly: drag the round corner grip on canvas, or \u21e7-drag a corner."));

      panel.appendChild(sec("Appearance"));
      if (el.kind !== "ellipse") {
        var rMax = Math.max(1, Math.ceil(Math.min(el.w, el.h) / 2));
        panel.appendChild(lab("Corner radius"));
        panel.appendChild(mixRow(0, rMax, 1, Math.min(el.r || 0, rMax), "R", function (v) { el.r = Math.round(v); refreshNode(el); }));
      }
      panel.appendChild(lab("Opacity"));
      panel.appendChild(mixRow(0, 100, 1, Math.round((el.opacity != null ? el.opacity : 1) * 100), "%", function (v) { el.opacity = v / 100; refreshNode(el); }));
      panel.appendChild(lab("Drop shadow"));
      panel.appendChild(mixRow(0, 100, 1, Math.round(el.shadow || 0), "%", function (v) { el.shadow = Math.round(v); refreshNode(el); }));

      panel.appendChild(sec("Fill"));
      var fillNone = h("input", { type: "checkbox" });
      fillNone.checked = (!el.fill || el.fill === "none");
      var fillRow = colorRow(el.fill === "none" ? "" : el.fill, function (v) { fillNone.checked = false; el.fill = v; refreshNode(el); });
      fillNone.addEventListener("change", function () {
        el.fill = fillNone.checked ? "none" : fillRow.querySelector("input[type=color]").value;
        refreshNode(el);
      });
      panel.appendChild(fillRow);
      panel.appendChild(chkRow(fillNone, "No fill (transparent)"));

      panel.appendChild(sec("Stroke"));
      var strokeWIn = numRaw(el.strokeW || 0, function (v) { el.strokeW = Math.max(0, v); refreshNode(el); }, 1, 0);
      var strokeWBox = pin("W", strokeWIn); strokeWBox.classList.add("wsm");
      panel.appendChild(colorRow(el.stroke, function (v) {
        el.stroke = v;
        if (!el.strokeW) { el.strokeW = 2; strokeWIn.value = 2; }
        refreshNode(el);
      }, strokeWBox));

      panel.appendChild(sec("Layer"));
      panel.appendChild(grid2(
        act(el.hidden ? ICO.eye : ICO.eyeOff, el.hidden ? "Show" : "Hide", "Toggle visibility (Ctrl+Shift+H)", function () { setHiddenEls([el], !el.hidden); }),
        act(el.locked ? ICO.unlock : ICO.lock, el.locked ? "Unlock" : "Lock", "Toggle lock (Ctrl+Shift+L)", function () { setLockedEls([el], !el.locked); })
      ));
      panel.appendChild(h("div", { class: "akls-grid4" }, [
        act(ICO.fwd, "Front", "Bring forward (Ctrl+])", function () { zMove(el, 1); }),
        act(ICO.bck, "Back", "Send backward (Ctrl+[)", function () { zMove(el, -1); }),
        act(ICO.dup, "Copy", "Duplicate (Ctrl+D)", function () { dupEl(el); }),
        act(ICO.del, "Delete", "Delete (Del)", function () { removeEl(el); }, true)
      ]));

      panel.appendChild(sec("Content"));
      var curType = el.content ? el.content.type : "";
      var cSel = h("select", {}, [
        ["", "None"], ["text", "Text"], ["image", "Image"], ["media", "Video / Audio"],
        ["pdf", "PDF"], ["model", "3D model (GLB)"], ["prototype", "Prototype embed"]
      ].map(function (o) { var op = h("option", { value: o[0] }, [o[1]]); if (o[0] === curType) op.setAttribute("selected", ""); return op; }));
      cSel.addEventListener("change", function () {
        var v = cSel.value;
        if (!v) { el.content = null; refreshNode(el, true); paintPanel(); return; }
        if (v === "text") {
          el.content = { type: "text", text: "Your text", font: FONTS[0][0], size: 28, weight: 500, color: "#FFFFFF", ls: 0, lh: 1.4, align: "left", valign: "middle", pt: 14, pr: 14, pb: 14, pl: 14, strokeW: 0, strokeC: "#000000" };
          refreshNode(el, true); paintPanel(); return;
        }
        if (v === "prototype") { el.content = { type: "prototype", src: "", raw: "" }; refreshNode(el, true); paintPanel(); return; }
        var accept = { image: "image/*", media: "video/*,audio/*", pdf: "application/pdf", model: ".glb,.gltf,model/gltf-binary,model/gltf+json" }[v];
        pickFile(accept, function (data) {
          if (!data) { cSel.value = curType; return; }
          el.content = { type: v, src: data, fit: "cover" };
          if (v === "media") el.content.mime = (data.match(/^data:(.*?);/) || [])[1] || "";
          refreshNode(el, true); paintPanel();
        });
      });
      panel.appendChild(fw("Type", pin(null, cSel)));

      var c = el.content;
      if (c && (c.type === "image" || c.type === "media" || c.type === "pdf" || c.type === "model")) {
        if (c.type === "image" || (c.type === "media" && (c.mime || "").indexOf("audio") !== 0)) {
          panel.appendChild(fw("Fit", seg([["cover", "Cover"], ["contain", "Contain"], ["fill", "Stretch"]], c.fit || "cover", function (v) { c.fit = v; refreshNode(el, true); })));
          panel.appendChild(grid2(
            h("button", { class: "akls-sm", html: ICO.move + "<span>" + (adjust ? "Done adjusting" : "Adjust on canvas") + "</span>", onclick: function () { adjust = !adjust; paintSel(); paintPanel(); } }),
            h("button", { class: "akls-sm", onclick: function () { c.z = 1; c.ox = 0; c.oy = 0; refreshNode(el, true); paintPanel(); } }, ["Reset view"])
          ));
          panel.appendChild(note("Double-click the shape on canvas: drag pans the image, scroll zooms it. Esc exits."));
        }
        panel.appendChild(h("button", { class: "akls-sm w100", html: ICO.dup + "<span>Replace file\u2026</span>", onclick: function () {
          var accept = { image: "image/*", media: "video/*,audio/*", pdf: "application/pdf", model: ".glb,.gltf" }[c.type];
          pickFile(accept, function (data) {
            if (!data) return;
            c.src = data;
            if (c.type === "media") c.mime = (data.match(/^data:(.*?);/) || [])[1] || "";
            refreshNode(el, true);
          });
        } }));
      }
      if (c && c.type === "prototype") {
        var pIn = h("input", { type: "text", value: c.raw || "", placeholder: "Figma link or iframe src\u2026" });
        panel.appendChild(fw("Prototype link", pin(null, pIn)));
        panel.appendChild(h("button", { class: "akls-sm w100", onclick: function () {
          c.raw = pIn.value.trim(); c.src = protoSrc(c.raw); refreshNode(el, true);
        } }, ["Apply link"]));
      }

      if (c && c.type === "text") {
        panel.appendChild(sec("Text"));
        var ta = h("textarea", {}); ta.value = c.text || "";
        ta.addEventListener("input", function () { c.text = ta.value; refreshNode(el, true); });
        panel.appendChild(fw("Content", ta));
        var fSel = h("select", {}, FONTS.map(function (f) { var o = h("option", { value: f[0] }, [f[1]]); if (f[0] === c.font) o.setAttribute("selected", ""); return o; }));
        fSel.addEventListener("change", function () { c.font = fSel.value; refreshNode(el, true); });
        panel.appendChild(fw("Font", pin(null, fSel)));
        var wSel = h("select", {}, [300, 400, 500, 600, 700, 800].map(function (w) { var o = h("option", { value: w }, [String(w)]); if (w === (c.weight || 600)) o.setAttribute("selected", ""); return o; }));
        wSel.addEventListener("change", function () { c.weight = parseInt(wSel.value, 10); refreshNode(el, true); });
        panel.appendChild(grid2(
          pin("px", numRaw(c.size || 28, function (v) { c.size = Math.max(6, v); refreshNode(el, true); }, 1, 6), "Font size"),
          pin(null, wSel, "Weight")
        ));
        panel.appendChild(fw("Style", seg([["reg", "Regular"], ["italic", "Italic"]], c.italic ? "italic" : "reg", function (v) { c.italic = v === "italic"; refreshNode(el, true); })));
        panel.appendChild(fw("Decoration", seg([["", "None"], ["underline", "Under"], ["line-through", "Strike"]], c.deco || "", function (v) { c.deco = v; refreshNode(el, true); })));
        panel.appendChild(fw("Case", seg([["", "As typed"], ["uppercase", "AA"], ["capitalize", "Aa"]], c.caseT || "", function (v) { c.caseT = v; refreshNode(el, true); })));
        panel.appendChild(fw("Color", colorRow(c.color || "#FFFFFF", function (v) { c.color = v; refreshNode(el, true); })));
        panel.appendChild(grid2(
          pin("LS", numRaw(c.ls || 0, function (v) { c.ls = v; refreshNode(el, true); }, 0.5), "Letter spacing"),
          pin("LH", numRaw(c.lh || 1.3, function (v) { c.lh = Math.max(0.7, v); refreshNode(el, true); }, 0.05, 0.7), "Line height")
        ));
        var tsWIn = numRaw(c.strokeW || 0, function (v) { c.strokeW = Math.max(0, v); refreshNode(el, true); }, 0.5, 0);
        var tsWBox = pin("W", tsWIn); tsWBox.classList.add("wsm");
        panel.appendChild(fw("Text stroke", colorRow(c.strokeC || "#000000", function (v) {
          c.strokeC = v;
          if (!c.strokeW) { c.strokeW = 1; tsWIn.value = 1; }
          refreshNode(el, true);
        }, tsWBox)));
        panel.appendChild(fw("Align", seg([["left", "Left"], ["center", "Center"], ["right", "Right"]], c.align || "left", function (v) { c.align = v; refreshNode(el, true); })));
        panel.appendChild(fw("Vertical", seg([["top", "Top"], ["middle", "Middle"], ["bottom", "Bottom"]], c.valign || "middle", function (v) { c.valign = v; refreshNode(el, true); })));
        panel.appendChild(fw("Inner padding \u2014 T R B L", h("div", { class: "akls-grid4" }, [
          pin("T", numRaw(c.pt || 0, function (v) { c.pt = Math.max(0, v); refreshNode(el, true); }, 1, 0)),
          pin("R", numRaw(c.pr || 0, function (v) { c.pr = Math.max(0, v); refreshNode(el, true); }, 1, 0)),
          pin("B", numRaw(c.pb || 0, function (v) { c.pb = Math.max(0, v); refreshNode(el, true); }, 1, 0)),
          pin("L", numRaw(c.pl || 0, function (v) { c.pl = Math.max(0, v); refreshNode(el, true); }, 1, 0))
        ])));
      }
    }

    reclusterGroups(); pruneGroups();
    paintStage();
    paintPanel();
    applyLayoutMode();
    fit(); requestAnimationFrame(fit);
  }

  function bentoDetailData(el) {
    el.detail = el.detail || {};
    var d = el.detail;
    if (d.eyebrow == null) d.eyebrow = "";
    if (d.title == null) d.title = "";
    if (d.body == null) d.body = "";
    if (!Array.isArray(d.tags)) d.tags = [];
    if (!Array.isArray(d.refs)) d.refs = [];
    return d;
  }
  /* Shared bento detail overlay — editor (editable) + published viewer (read-only). */
  function openBentoDetail(el, sibs, editable, onChange) {
    injectCSS();
    sibs = (sibs && sibs.length) ? sibs : [el];
    var idx = sibs.indexOf(el); if (idx < 0) idx = 0;
    var lock = document.body.style.overflow; document.body.style.overflow = "hidden";
    var ov = h("div", { class: "akld-ov" });
    var card = h("div", { class: "akld-card" });
    ov.appendChild(card);
    function close() { ov.remove(); document.body.style.overflow = lock; document.removeEventListener("keydown", onKey); }
    function go(dir) { idx = (idx + dir + sibs.length) % sibs.length; paint(); }
    function onKey(e) { if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1); }
    document.addEventListener("keydown", onKey);
    ov.addEventListener("pointerdown", function (e) { if (e.target === ov) close(); });
    var closeBtn = h("button", { class: "akld-x", title: "Close (Esc)", html: ICO.xsm, onclick: close });
    function commit(kind) {
      var el = sibs[idx];
      if (kind === "text") {
        /* keep the tile's hover hero line in sync while typing (no media reload) */
        var nodes = document.querySelectorAll('.akls-bento[data-el-id="' + el.id + '"]');
        for (var i = 0; i < nodes.length; i++) {
          var old = nodes[i].querySelector(".akls-bhov");
          if (old) old.replaceWith(bentoHover(el, nodes[i].hasAttribute("data-el")));
        }
      }
      if (onChange) onChange(el, kind);
    }
    function editField(cls, ph, val, onInput, multiline) {
      var e = h("div", { class: cls });
      if (val) e.textContent = val;
      if (editable) {
        e.classList.add("akld-edit"); e.setAttribute("contenteditable", "true"); e.setAttribute("data-ph", ph);
        e.addEventListener("input", function () { onInput(multiline ? e.innerText : e.textContent); });
        e.addEventListener("keydown", function (ev) { if (!multiline && ev.key === "Enter") { ev.preventDefault(); e.blur(); } });
      } else if (!val) { e.style.display = "none"; }
      return e;
    }
    function paint() {
      var el = sibs[idx], d = bentoDetailData(el); card.innerHTML = "";
      var media = h("div", { class: "akld-media" });
      var c = el.content;
      if (c && c.src) {
        var url = blobURL(c.src), kind = srcKind(c.src, c.mime);
        if (kind === "video") media.appendChild(h("video", { src: url, controls: "", playsinline: "", preload: "metadata" }));
        else if (kind === "audio") media.appendChild(h("audio", { src: url, controls: "", style: "width:82%" }));
        else if (kind === "pdf" || kind === "file") media.appendChild(h("iframe", { src: url, title: d.title || "File preview" }));
        else media.appendChild(h("img", { src: url, alt: d.title || "" }));
        media.style.flexBasis = "50%";
        var dragged = false;
        var mEl = media.querySelector("img,video");
        if (mEl) {
          var z = 1, px = 0, py = 0, MAXZ = 5;
          function clamp() {
            var b = media.getBoundingClientRect(), w = mEl.offsetWidth * z, hh = mEl.offsetHeight * z;
            var ox = (b.width - mEl.offsetWidth) / 2, oy = (b.height - mEl.offsetHeight) / 2;
            px = w <= b.width ? (b.width - w) / 2 - ox : Math.min(-ox, Math.max(px, b.width - ox - w));
            py = hh <= b.height ? (b.height - hh) / 2 - oy : Math.min(-oy, Math.max(py, b.height - oy - hh));
          }
          function apply() {
            clamp();
            mEl.style.transform = "translate(" + px + "px," + py + "px) scale(" + z + ")";
            media.classList.toggle("zoomed", z > 1.001);
            out.disabled = z <= 1.001;
            fit.textContent = (Math.round(z * 10) / 10) + "x";
          }
          function zoomAt(nz, cx, cy) {
            nz = Math.max(1, Math.min(nz, MAXZ));
            var b = media.getBoundingClientRect();
            cx = cx == null ? b.width / 2 : cx - b.left; cy = cy == null ? b.height / 2 : cy - b.top;
            var k = nz / z; px = cx - (cx - px) * k; py = cy - (cy - py) * k; z = nz; apply();
          }
          var out = h("button", { class: "akld-zbtn", title: "Zoom out", onclick: function (e) { e.stopPropagation(); zoomAt(z / 1.5); } }, ["\u2212"]);
          var inn = h("button", { class: "akld-zbtn", title: "Zoom in", onclick: function (e) { e.stopPropagation(); zoomAt(z * 1.5); } }, ["+"]);
          var fit = h("button", { class: "akld-zbtn", title: "Reset zoom", onclick: function (e) { e.stopPropagation(); z = 1; px = py = 0; apply(); } }, ["1x"]);
          media.appendChild(h("div", { class: "akld-zoom" }, [out, inn, fit]));
          media.appendChild(h("div", { class: "akld-drag" }, ["\u2725  Drag to move"]));
          media.addEventListener("wheel", function (e) { e.preventDefault(); zoomAt(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX, e.clientY); }, { passive: false });
          media.addEventListener("dblclick", function (e) { if (e.target.closest("button")) return; zoomAt(z > 1.001 ? 1 : 2.5, e.clientX, e.clientY); });
          mEl.addEventListener("pointerdown", function (e) {
            if (z <= 1.001 || e.button) return;
            var sx = e.clientX, sy = e.clientY, ox = px, oy = py, live = false;
            function mv(ev) {
              if (!live) {
                if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 4) return;
                live = true; dragged = true; media.classList.add("grabbing");
              }
              ev.preventDefault();
              px = ox + (ev.clientX - sx); py = oy + (ev.clientY - sy); apply();
            }
            function up() { media.classList.remove("grabbing"); window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }
            window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
          });
          out.disabled = true;
          /* open every file already at 1.5×, centred — 1x stays the reset floor */
          requestAnimationFrame(function () { zoomAt(1.5); });
        }
      } else media.appendChild(h("div", { class: "akld-empty" }, [editable ? "Click to add an image" : "No image yet"]));
      if (editable) { media.style.cursor = "pointer"; media.addEventListener("click", function (ev) { if (dragged) { dragged = false; return; } if (ev.target.closest(".akld-zoom,.akld-nav")) return; pickFile("image/*", function (data) { if (!data) return; el.content = { type: "image", src: data, fit: "cover", tx: 0, ty: 0, sc: 1 }; commit("content"); paint(); }); }); }
      if (sibs.length > 1) {
        media.appendChild(h("button", { class: "akld-nav prev", title: "Previous", onclick: function (e) { e.stopPropagation(); go(-1); } }, ["\u2039"]));
        media.appendChild(h("button", { class: "akld-nav next", title: "Next", onclick: function (e) { e.stopPropagation(); go(1); } }, ["\u203A"]));
      }
      card.appendChild(media);
      var info = h("div", { class: "akld-info" });
      info.appendChild(editField("akld-eyebrow", "PROMPT LABEL", d.eyebrow, function (v) { d.eyebrow = v; commit("text"); }));
      info.appendChild(editField("akld-title", "Add a title \u2014 shows on card hover", d.title, function (v) { d.title = v; commit("text"); }));
      info.appendChild(h("div", { class: "akld-hr" }));
      info.appendChild(h("div", { class: "akld-lbl" }, ["References used for this prompt"]));
      var refs = h("div", { class: "akld-refs" });
      d.refs.forEach(function (src, ri) {
        var im = h("img", { class: "akld-ref", src: blobURL(src), alt: "" });
        if (editable) { im.title = "Click to remove"; im.style.cursor = "pointer"; im.addEventListener("click", function () { d.refs.splice(ri, 1); commit("text"); paint(); }); }
        refs.appendChild(im);
      });
      if (editable) refs.appendChild(h("button", { class: "akld-add", onclick: function () { pickFile("image/*", function (data) { if (!data) return; d.refs.push(data); commit("text"); paint(); }); } }, ["+ ref"]));
      else if (!d.refs.length) refs.appendChild(h("div", { class: "akld-refnote" }, ["\u2014"]));
      info.appendChild(refs);
      info.appendChild(h("div", { class: "akld-hr" }));
      info.appendChild(h("div", { class: "akld-lbl" }, ["AI prompt used"]));
      info.appendChild(editField("akld-code", "Add the prompt or a detailed description\u2026", d.body, function (v) { d.body = v; commit("text"); }, true));
      info.appendChild(h("div", { class: "akld-hr" }));
      info.appendChild(h("div", { class: "akld-lbl" }, ["Shot parameters"]));
      var tags = h("div", { class: "akld-tags" });
      d.tags.forEach(function (t, ti) {
        var chip = h("span", { class: "akld-tag" }, [t]);
        if (editable) {
          chip.classList.add("akld-edit"); chip.setAttribute("contenteditable", "true");
          chip.addEventListener("input", function () { d.tags[ti] = chip.textContent; commit("text"); });
          chip.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); chip.blur(); } });
          chip.addEventListener("blur", function () { if (!chip.textContent.trim()) { d.tags.splice(ti, 1); commit("text"); paint(); } });
        }
        tags.appendChild(chip);
      });
      if (editable) tags.appendChild(h("button", { class: "akld-add", onclick: function () { d.tags.push("New tag"); commit("text"); paint(); } }, ["+ tag"]));
      else if (!d.tags.length) tags.appendChild(h("div", { class: "akld-refnote" }, ["\u2014"]));
      info.appendChild(tags);
      card.appendChild(info);
      card.appendChild(closeBtn);
    }
    document.body.appendChild(ov); paint();
  }
  window.AKLayout = { openEditor: openEditor, render: render, renderGrid: renderGrid, renderCover: renderCover, openBentoDetail: openBentoDetail, _pdfCaseTheme: pdfCaseTheme };
})();
