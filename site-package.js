/* ============================================================================
   Ajay Katta Portfolio — PUBLISH PIPELINE  (site-package.js · admin only)
   ----------------------------------------------------------------------------
   The ONE place that turns this device's edits into something the live site
   can use. Loaded on demand by site-edit.js; visitors never fetch it.

   AK_PACKAGE.publish({ siteContent, onProgress })
     → one ZIP holding only what differs from the live site:
         • portfolio-data.json      case studies + home data (minified)
         • <page>.html              page edits written straight into the HTML
         • media/…                  new uploads, named like the rest of the site
                                    (<project>-cover / -image-<n> / -media-<n> /
                                    -model-<n>; identical bytes ship once)
         • media fixes staged by Optimise images
       WHAT-CHANGED.txt lists every file, plus files the site no longer uses.

   AK_PACKAGE.optimiser   index · measure · stat · run · show  (Tools tab)
========================================================================== */
(function () {
  "use strict";
  if (window.AK_PACKAGE) return;

  var BASE = location.href.split("#")[0].split("?")[0].replace(/[^\/]*$/, "");
  var ROOT = "Ajaykatta_Website", REPO = ROOT + "/GitRepo";
  var PAGES = ["index", "project-ui-ux", "project-gen-ai", "project-3d", "resume"];
  var BUILTIN = ["ui-ux", "gen-ai", "3d"];
  var LABEL = { "ui-ux": "UI / UX", "gen-ai": "Gen AI", "3d": "3D" };
  var RESUME_PATH = "media/home/Ajay-Katta-uiux-product-designer-2026.pdf";
  var FIXES = "media:fixes";
  var INLINE_MIN = 2048;                         // a data: URL under this stays inside the JSON
  var IMG_MAX_EDGE = 2560, IMG_OVER_EDGE = 2592; // rebuilt files land on 2560±1
  var CANVAS_PX_PER_UNIT = 2.5, CANVAS_MIN_EDGE = 1280;
  var BUCKETS = ["text", "html", "img", "href", "attr", "hide"];

  /* ------------------------------------------------------------------ utils */
  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function slug(s) { return String(s == null ? "" : s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40); }
  function isData(v) { return typeof v === "string" && v.slice(0, 5) === "data:"; }
  function mimeOf(d) { return (String(d).slice(5).split(";")[0] || "").split(",")[0].toLowerCase(); }
  var EXT = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
    "image/avif": "avif", "application/pdf": "pdf", "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/ogg": "ogv",
    "audio/mpeg": "mp3", "audio/mp3": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/ogg": "oga", "audio/mp4": "m4a",
    "model/gltf-binary": "glb", "model/gltf+json": "gltf" };
  function extFor(mime, fb) { return EXT[mime] || (fb ? String(fb).toLowerCase().replace(/[^a-z0-9]/g, "") : "") || "bin"; }
  /* canonical JSON — key order never counts as a change */
  function canon(v) {
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (v && typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
    return JSON.stringify(v === undefined ? null : v);
  }
  /* page hashes must match the editor's rebase check exactly — one implementation */
  function strHash(s) { return window.AK_EDIT.strHash(s); }
  function pool(items, n, worker, tick) {
    var i = 0, done = 0, total = items.length, active = 0;
    return new Promise(function (res) {
      if (!total) return res();
      (function next() {
        while (active < n && i < total) {
          active++;
          Promise.resolve().then(worker.bind(null, items[i++]))["catch"](function () {}).then(function () {
            active--; done++;
            if (tick) tick(done, total);
            if (done === total) res(); else next();
          });
        }
      })();
    });
  }
  function walkStrings(node, fn, depth) {
    if (!node || typeof node !== "object" || (depth || 0) > 16) return;
    Object.keys(node).forEach(function (k) {
      var v = node[k];
      if (typeof v === "string") { var r = fn(v); if (r !== undefined && r !== v) node[k] = r; }
      else if (v && typeof v === "object") walkStrings(v, fn, (depth || 0) + 1);
    });
  }

  /* -------------------------------------------------------------------- idb */
  var _db;
  function db() {
    if (_db) return _db;
    _db = new Promise(function (res, rej) {
      var rq = indexedDB.open("ak-portfolio", 1);
      rq.onupgradeneeded = function () { try { rq.result.createObjectStore("kv"); } catch (e) {} };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error); };
    });
    return _db;
  }
  function idbGet(k) {
    return db().then(function (d) { return new Promise(function (res) { var r = d.transaction("kv").objectStore("kv").get(k); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(null); }; }); })["catch"](function () { return null; });
  }
  function idbSet(k, v) {
    return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = function () { res(); }; t.onerror = function () { rej(t.error); }; }); });
  }
  function idbKeys() {
    return db().then(function (d) { return new Promise(function (res) { var r = d.transaction("kv").objectStore("kv").getAllKeys(); r.onsuccess = function () { res(r.result || []); }; r.onerror = function () { res([]); }; }); })["catch"](function () { return []; });
  }

  /* ---------------------------------------------------------------- network */
  function getText(path) {
    return fetch(BASE + path, { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : null; })["catch"](function () { return null; });
  }
  function getJSON(path) { return getText(path).then(function (t) { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } }); }
  /* 0 = not on the live site · -1 = live, size unknown · n = live, n bytes */
  function liveSize(path) {
    return fetch(BASE + path, { method: "HEAD", cache: "no-store" })
      .then(function (r) { return r.ok ? (+r.headers.get("content-length") || -1) : 0; })["catch"](function () { return 0; });
  }

  /* ------------------------------------------------------- bytes + hashing */
  function bytesOf(d) {
    /* the browser decodes the base64 — atob() over a 100 MB video stalls the tab */
    return fetch(d).then(function (r) { return r.arrayBuffer(); }).then(function (b) { return new Uint8Array(b); })["catch"](function () {
      var bin = atob(String(d).split(",")[1] || ""), a = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
      return a;
    });
  }
  function fnvHex(b) { var x = 2166136261; for (var i = 0; i < b.length; i++) { x ^= b[i]; x = Math.imul(x, 16777619) >>> 0; } return ("0000000" + x.toString(16)).slice(-8); }
  function digest(b) {
    try {
      if (window.crypto && crypto.subtle && crypto.subtle.digest) {
        return crypto.subtle.digest("SHA-1", b).then(function (d) {
          var a = new Uint8Array(d), s = "";
          for (var i = 0; i < 5; i++) s += ("0" + a[i].toString(16)).slice(-2);
          return s;
        })["catch"](function () { return fnvHex(b); });
      }
    } catch (e) {}
    return Promise.resolve(fnvHex(b));
  }
  function blobToDataURL(b) { return new Promise(function (res) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { res(null); }; r.readAsDataURL(b); }); }

  /* -------------------------------------------------------------------- zip */
  var _crc = (function () { var t = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = _crc[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function makeZip(files) {
    var enc = new TextEncoder();
    function u16(n) { return [n & 0xFF, (n >>> 8) & 0xFF]; }
    function u32(n) { return [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]; }
    var parts = [], central = [], offset = 0, cs = 0;
    files.forEach(function (f) {
      var name = enc.encode(f.name), data = f.bytes, crc = crc32(data);
      var lf = new Uint8Array([].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0)));
      var cf = new Uint8Array([].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset)));
      parts.push(lf, name, data); central.push(cf, name);
      offset += lf.length + name.length + data.length; cs += cf.length + name.length;
    });
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cs), u32(offset), u16(0)));
    return new Blob(parts.concat(central, [end]), { type: "application/zip" });
  }
  function download(blob, name) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
  }

  /* ------------------------------------ gather: working copy merged with live
     Same rule everywhere: a category edited on THIS device ships its working
     copy; an untouched one keeps exactly what is live. Nothing is ever dropped. */
  function pageKeys(pub, local) {
    var out = [], seen = {};
    BUILTIN.concat(Object.keys(pub || {}), local || []).forEach(function (k) {
      if (!k || k === "home" || seen[k]) return;
      seen[k] = 1; out.push(k);
    });
    return out;
  }
  function gather() {
    return Promise.all([getJSON("portfolio-data.json"), idbKeys(), idbGet("ak-resume-pdf")]).then(function (pre) {
      var pub = pre[0] || {};
      var local = pre[1].filter(function (k) { return typeof k === "string" && k.indexOf("data:") === 0; }).map(function (k) { return k.slice(5); });
      var keys = pageKeys(pub, local);
      return Promise.all(keys.map(function (k) { return idbGet("data:" + k); })).then(function (vals) {
        var cur = (window.AK_CASES && window.AK_CASES.current) ? window.AK_CASES.current() : null;
        var bundle = {};
        keys.forEach(function (k, i) {
          var mine = vals[i];
          if (cur && cur.page === k && cur.data && cur.data.items) mine = cur.data;   // the page on screen is the freshest
          var usable = !!(mine && mine.items && mine.items.length);
          if (lsGet("ak-local-edits:" + k) && usable) bundle[k] = mine;
          else if (pub[k] && pub[k].items) bundle[k] = pub[k];
          else if (usable) bundle[k] = mine;
        });
        var ph = pub.home || {}, home = {};
        try { var raw = lsGet("ak-certs"), a = raw ? JSON.parse(raw) : null; if (Array.isArray(a)) home.certs = a; } catch (e) {}
        if (!home.certs && Array.isArray(ph.certs)) home.certs = ph.certs;
        var covers = {};
        keys.forEach(function (k) { var v = lsGet("ak-cover-" + k) || (ph.covers && ph.covers[k]); if (v) covers[k] = v; });
        if (Object.keys(covers).length) home.covers = covers;
        var prof = lsGet("ak-profile-photo") || ph.profile;
        if (prof) home.profile = prof;
        if (Object.keys(home).length) bundle.home = home;
        Object.keys(pub).forEach(function (k) { if (!(k in bundle)) bundle[k] = pub[k]; });
        return { pub: pub, keys: keys, bundle: clone(bundle), resume: isData(pre[2]) ? pre[2] : null };
      });
    });
  }

  /* ---------------------------------------------------------- image codec
     Decode/encode differ per browser (Safari ignores createImageBitmap resize,
     iPad throws on huge decodes, older engines refuse WebP from toBlob), so every
     step has a fallback and a failure comes back with a reason. */
  function decodeImg(blob) {
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
  function decode(blob) {
    if (typeof createImageBitmap !== "function") return decodeImg(blob);
    return createImageBitmap(blob).then(function (bm) {
      return { w: bm.width, h: bm.height, src: bm, release: function () { if (bm.close) bm.close(); } };
    }, function () { return decodeImg(blob); });
  }
  /* halve repeatedly before the final draw — one big downscale looks soft */
  function scaleTo(dec, w, h) {
    var src = dec.src, cw = dec.w, ch = dec.h, guard = 0;
    while (cw > w * 2 && guard++ < 8) {
      var t = document.createElement("canvas");
      t.width = Math.max(w, Math.round(cw / 2)); t.height = Math.max(h, Math.round(ch / 2));
      var tx = t.getContext("2d"); tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = "high";
      tx.drawImage(src, 0, 0, t.width, t.height);
      src = t; cw = t.width; ch = t.height;
    }
    var cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    var cx = cv.getContext("2d"); if (!cx) throw new Error("no canvas");
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
    cx.drawImage(src, 0, 0, w, h);
    return cv;
  }
  function toBlob(cv, type, q) {
    return new Promise(function (res) {
      var done = false, t = setTimeout(function () { give(null); }, 20000);
      function give(b) { if (done) return; done = true; clearTimeout(t); res(b); }
      try { cv.toBlob(give, type, q); } catch (e) { give(null); }
    });
  }
  /* WebP first — the site ships WebP; PNG/JPEG only if a browser refuses to write it */
  function encodeBest(cv, isPng, origSize) {
    var list = isPng ? [["image/webp", 0.92], ["image/png"], ["image/jpeg", 0.88]] : [["image/webp", 0.92], ["image/jpeg", 0.88]];
    var best = null, i = 0;
    function step() {
      if (i >= list.length) return Promise.resolve(best);
      var t = list[i++];
      return toBlob(cv, t[0], t[1]).then(function (b) {
        if (b && b.size && (!best || b.size < best.size)) best = b;
        return (best && best.size < origSize) ? best : step();
      });
    }
    return step();
  }
  function resizable(t) { return /^image\/(webp|jpe?g|png)$/i.test(t || ""); }

  /* canvas photos ship at the size they are drawn: 1200 canvas units fitted to the
     column, so 2.5× the element covers a retina screen. Uploads only — published
     files are left to Optimise images. */
  function canvasTarget(el) {
    var long = Math.max(+el.w || 0, +el.h || 0);
    return long ? Math.min(IMG_MAX_EDGE, Math.max(CANVAS_MIN_EDGE, Math.round(long * CANVAS_PX_PER_UNIT))) : 0;
  }
  function refit(src, target) {
    return fetch(src).then(function (r) { return r.blob(); }).then(function (blob) {
      if (!resizable(blob.type)) return null;
      return decode(blob).then(function (dec) {
        var long = Math.max(dec.w, dec.h);
        if (!long || (long <= target * 1.15 && blob.type === "image/webp")) { dec.release(); return null; }
        var k = Math.min(1, target / long), cv;
        try { cv = scaleTo(dec, Math.max(1, Math.round(dec.w * k)), Math.max(1, Math.round(dec.h * k))); }
        catch (e) { dec.release(); return null; }
        dec.release();
        return toBlob(cv, "image/webp", 0.86).then(function (b) {
          cv.width = cv.height = 1;
          if (!b || b.type !== "image/webp" || b.size > blob.size * 0.9) return null;
          return blobToDataURL(b);
        });
      });
    })["catch"](function () { return null; });
  }
  function rightSizeUploads(bundle) {
    var groups = {};
    (function walk(node, depth) {
      if (!node || typeof node !== "object" || depth > 14) return;
      if (Array.isArray(node)) { node.forEach(function (v) { walk(v, depth + 1); }); return; }
      var c = node.content;
      if (c && c.type === "image" && isData(c.src) && (+node.w || +node.h)) {
        var t = canvasTarget(node);
        if (t) { var g = groups[c.src] || (groups[c.src] = { src: c.src, t: 0, cs: [] }); g.t = Math.max(g.t, t); g.cs.push(c); }
      }
      Object.keys(node).forEach(function (k) { if (node[k] && typeof node[k] === "object") walk(node[k], depth + 1); });
    })(bundle, 0);
    var jobs = Object.keys(groups).map(function (k) { return groups[k]; });
    /* two at a time — several large decodes at once is what makes an iPad give up */
    return pool(jobs, 2, function (g) { return refit(g.src, g.t).then(function (out) { if (out) g.cs.forEach(function (c) { c.src = out; }); }); });
  }

  /* ------------------------------------------------------------ file names
     Every upload is named like the files already on the site:
       <project>-cover.<ext> · <project>-image-<n> · <project>-media-<n> (video, other)
       <project>-model-<n> (3D) · home: profile-photo, cert-<name>, <category>-cover
       pages (media/site/): <page>-image-<n> · og-<page>   (index → home)
     Numbered files: one counter per project, carrying on after the highest number it
     already uses; a name taken by live data, this publish, or a server file with
     different bytes is skipped.
     Fixed names (cover, profile-photo, cert-*, <category>-cover, og-*, the résumé PDF)
     never change: a replacement overwrites the file and every reference gets ?v=<n+1>,
     because media/ is cached for 30 days and the old bytes would keep showing. */
  var MODEL_RX = /^(glb|gltf|usdz|obj|fbx|stl)$/i;
  var PSLUG = { "index": "home", "project-ui-ux": "ui-ux", "project-gen-ai": "gen-ai", "project-3d": "3d", "resume": "resume" };
  function verMap(objs, texts) {
    var v = {};
    function note(p, n) { n = +n; if (!(v[p] >= n)) v[p] = n; }
    objs.forEach(function (o) { walkStrings({ o: o }, function (s) { var m = /^(media\/[^?#]+)\?v=(\d+)$/i.exec(s); if (m) note(m[1], m[2]); }); });
    (texts || []).forEach(function (t) { var re = /(media\/[^"'()\s,<>?#\\]+\.[a-z0-9]{2,5})\?v=(\d+)/gi, m; while ((m = re.exec(t || ""))) note(m[1], m[2]); });
    return v;
  }
  function reEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function kindOf(mime, ext) { return /^image\//i.test(mime) ? "image" : MODEL_RX.test(ext) ? "model" : "media"; }
  function topNum(taken, dir, base) {
    var pre = dir + base + "-", max = 0;
    Object.keys(taken).forEach(function (n) {
      if (n.indexOf(pre) !== 0) return;
      var m = /^[a-z]+-(\d+)\.[a-z0-9]+$/i.exec(n.slice(pre.length));
      if (m) max = Math.max(max, +m[1]);
    });
    return max;
  }
  /* taken: paths in live data + this publish · ver: highest ?v per path · inUse: paths the new data still references */
  function namer(taken, ver, inUse) {
    var ctr = {}, mine = {};
    ver = ver || {}; inUse = inUse || {};
    function sameAs(path, f) {             // 0 not on the server · 1 same bytes · -1 different
      return liveSize(path).then(function (n) {
        if (n === 0) return 0;
        if (n > 0 && n !== f.bytes.length) return -1;
        return fetch(BASE + path, { cache: "no-store" }).then(function (r) { return r.ok ? r.arrayBuffer() : null; })
          .then(function (ab) { return ab ? digest(new Uint8Array(ab)).then(function (hx) { return hx === f.hx ? 1 : -1; }) : -1; })["catch"](function () { return -1; });
      });
    }
    function fixedName(f) {
      var i = 0;
      function next() {
        var p = f.dir + f.fixed + (i ? "-" + (i + 1) : "") + "." + f.ext;
        if (mine[p] || inUse[p]) { i++; return next(); }   // two uploads in one slot, or still used elsewhere
        return sameAs(p, f).then(function (r) {
          mine[p] = taken[p] = 1;
          if (r === 0) return { path: p, ref: p };
          if (r === 1) return { path: p, ref: ver[p] ? p + "?v=" + ver[p] : p };
          return { path: p, ref: p + "?v=" + ((ver[p] || 1) + 1), over: true };
        });
      }
      return next();
    }
    /* f: {dir, base, fixed, kind, ext, bytes, hx} — resolves to {path, ref, over}, in call order */
    return function (f) {
      if (f.fixed) return fixedName(f);
      var k = f.dir + f.base, tries = 0;
      if (!ctr[k]) ctr[k] = topNum(taken, f.dir, f.base) + 1;
      function next() {
        var p = f.dir + f.base + "-" + f.kind + "-" + ctr[k] + "." + f.ext;
        if (++tries > 400) { p = f.dir + f.base + "-" + f.kind + "-" + f.hx + "." + f.ext; taken[p] = 1; return Promise.resolve({ path: p, ref: p }); }
        if (taken[p]) { ctr[k]++; return next(); }
        return sameAs(p, f).then(function (r) {
          ctr[k]++;
          if (r < 0) return next();
          taken[p] = mine[p] = 1;
          return { path: p, ref: p };
        });
      }
      return next();
    };
  }
  function serial(list, fn) { return list.reduce(function (p, x) { return p.then(function () { return fn(x); }); }, Promise.resolve()); }

  /* --------------------------------------------------------- extract files
     Every upload (data: URL) anywhere in the bundle becomes one file (names above);
     identical bytes collapse to one file. */
  function extract(bundle, tick, pub, texts) {
    var refs = [], at = {};
    function want(v) { return isData(v) && v.length >= INLINE_MIN; }
    function note(v, folder, base, ext, fixed) { if (!at[v]) { at[v] = { folder: folder, base: base, ext: ext, fixed: fixed }; refs.push(v); } }
    function extHint(node) {
      if (node.format) return node.format;
      var m = typeof node.name === "string" && /\.([a-z0-9]{2,5})$/i.exec(node.name);
      return m ? m[1] : null;
    }
    function walk(node, folder, base, depth) {
      if (!node || typeof node !== "object" || depth > 14) return;
      if (Array.isArray(node)) {
        node.forEach(function (v) { if (want(v)) note(v, folder, base); else if (v && typeof v === "object") walk(v, folder, base, depth + 1); });
        return;
      }
      if (node.type === "prototype" || node.type === "html") return;       // embed URL / inline code
      Object.keys(node).forEach(function (k) {
        var v = node[k];
        var cover = k === "cover" || (node.type === "cover" && (k === "src" || k === "content"));
        if (want(v)) note(v, folder, base, extHint(node), cover ? base + "-cover" : null);
        else if (v && typeof v === "object") walk(v, folder, base, depth + 1);
      });
    }
    Object.keys(bundle).forEach(function (page) {
      var d = bundle[page]; if (!d || typeof d !== "object") return;
      if (page === "home") {
        (d.certs || []).forEach(function (c, i) { if (c && want(c.img)) note(c.img, "home", "cert", null, "cert-" + (slug(c.title) || i + 1)); });
        Object.keys(d.covers || {}).forEach(function (k) { if (want(d.covers[k])) note(d.covers[k], "home", "home", null, k + "-cover"); });
        if (want(d.profile)) note(d.profile, "home", "home", null, "profile-photo");
        walk(d, "home", "home", 0);
        return;
      }
      (d.items || []).forEach(function (it, i) { walk(it, page, slug(it && it.title) || page + "-" + (i + 1), 0); });
      Object.keys(d.cases || {}).forEach(function (ck) { walk(d.cases[ck], page, slug(ck) || "case", 0); });
      walk(d, page, page, 0);
    });

    var files = [], missing = [], byHash = {}, map = {}, taken = {}, bumps = {};
    return pool(refs, 4, function (ref) {
      return bytesOf(ref).then(function (bytes) {
        return digest(bytes).then(function (hx) { at[ref].bytes = bytes; at[ref].hx = hx; });
      }, function () { missing.push(at[ref].fixed || at[ref].base); });
    }, tick).then(function () {
      [mediaRefs(pub || {}), mediaRefs(bundle)].forEach(function (o) { Object.keys(o).forEach(function (r) { taken[r] = 1; }); });
      var name = namer(taken, verMap([pub || {}, bundle], texts), mediaRefs(bundle));
      return serial(refs, function (ref) {           // document order, so numbers follow the page
        var a = at[ref]; if (!a.bytes) return;
        var key = a.bytes.length + ":" + a.hx;
        if (byHash[key]) { map[ref] = byHash[key]; return; }
        var ext = extFor(mimeOf(ref), a.ext);
        return name({ dir: "media/" + a.folder + "/", base: slug(a.base).slice(0, 48) || "file", fixed: a.fixed ? slug(a.fixed).slice(0, 56) : null,
                      kind: kindOf(mimeOf(ref), ext), ext: ext, bytes: a.bytes, hx: a.hx }).then(function (r) {
          byHash[key] = r.ref; map[ref] = r.ref;
          files.push({ name: r.path, bytes: a.bytes, hx: a.hx, fixed: !!a.fixed, over: !!r.over });
          if (r.over) bumps[r.path] = r.ref;
        });
      });
    }).then(function () {
      walkStrings(bundle, function (v) { return map[v]; });
      return { files: files, missing: missing, bumps: bumps };
    });
  }

  /* ------------------------------------------------------------- page edits */
  function hasEdits(d) {
    if (!d || typeof d !== "object") return false;
    for (var i = 0; i < BUCKETS.length; i++) if (d[BUCKETS[i]] && Object.keys(d[BUCKETS[i]]).length) return true;
    if (d.order && Object.keys(d.order).length) return true;
    if (d.meta && Object.keys(d.meta).some(function (k) { return d.meta[k]; })) return true;
    return !!(d.vars && ["dark", "light"].some(function (m) { return d.vars[m] && Object.keys(d.vars[m]).some(function (k) { return d.vars[m][k]; }); }));
  }
  /* uploaded photos / PDFs in page edits become files under media/site/ */
  function materialiseSite(sc, html) {
    var jobs = [], taken = {}, re = /media\/site\/[^"'()\s,<>?#\\]+\.[a-z0-9]{2,5}/gi;
    Object.keys(html || {}).forEach(function (p) { var t = html[p] || "", m; while ((m = re.exec(t))) taken[m[0]] = 1; });
    walkStrings({ o: sc }, function (v) { if (/^media\/site\//i.test(v)) taken[v] = 1; });
    Object.keys(sc).forEach(function (p) {
      var d = sc[p]; if (!d) return;
      ["img", "href"].forEach(function (b) {
        var set = d[b] || {};
        Object.keys(set).forEach(function (k) { if (isData(set[k])) jobs.push({ set: set, k: k, p: p }); });
      });
      if (d.meta && isData(d.meta.image)) jobs.push({ set: d.meta, k: "image", p: p, og: true });
    });
    var files = [], byHash = {}, bumps = {};
    var name = namer(taken, verMap([sc], Object.keys(html || {}).map(function (p) { return html[p]; })), mediaRefs(sc));
    return pool(jobs, 4, function (j) {
      return bytesOf(j.set[j.k]).then(function (bytes) {
        return digest(bytes).then(function (hx) { j.bytes = bytes; j.hx = hx; });
      });
    }).then(function () {
      return serial(jobs, function (j) {
        if (!j.bytes) return;
        var v = j.set[j.k], ext = extFor(mimeOf(v)), path = byHash[j.hx];
        if (path) { j.set[j.k] = path; return; }
        var base = PSLUG[j.p] || slug(j.p);
        return name({ dir: "media/site/", base: base, fixed: j.og ? "og-" + base : null, kind: kindOf(mimeOf(v), ext), ext: ext, bytes: j.bytes, hx: j.hx })
          .then(function (r) {
            byHash[j.hx] = r.ref; j.set[j.k] = r.ref;
            files.push({ name: r.path, bytes: j.bytes, hx: j.hx, fixed: !!j.og, over: !!r.over });
            if (r.over) bumps[r.path] = r.ref;
          });
      });
    }).then(function () { return { files: files, bumps: bumps }; });
  }
  function bakePage(src, d) {
    var E = window.AK_EDIT, doc;
    try { doc = new DOMParser().parseFromString(src, "text/html"); } catch (e) { doc = null; }
    if (!doc || !doc.body || !E || !E.applyDraft) return { html: null, skipped: [] };
    var skipped = E.applyDraft(doc, d) || [];
    var dt = /^\s*(<!doctype[^>]*>)/i.exec(src);
    var html = (dt ? dt[1] : "<!DOCTYPE html>") + "\n" + doc.documentElement.outerHTML + "\n";
    if (html.indexOf("</body>") < 0 || html.length < src.length * 0.6) return { html: null, skipped: skipped };   // round-trip safety net
    return { html: html, skipped: skipped };
  }
  function mediaRefs(obj) {
    var out = {};
    walkStrings({ o: obj }, function (v) { if (/^media\//i.test(v)) out[v.split(/[?#]/)[0]] = 1; });
    return out;
  }
  /* An upload whose bytes are already live under another name (an older export,
     the same photo re-uploaded) points back at that file instead of shipping a
     copy. Only files the new data would otherwise stop using are candidates, and
     only a size match is downloaded and hashed. */
  function reuseLive(files, bundle, pub) {
    var now = mediaRefs(bundle), cands = Object.keys(mediaRefs(pub)).filter(function (r) { return !now[r]; });
    if (!cands.length || !files.length) return Promise.resolve(files);
    var bySize = {}, remap = {};
    files.forEach(function (f) { if (!f.fixed) (bySize[f.bytes.length] = bySize[f.bytes.length] || []).push(f); });
    return pool(cands, 6, function (ref) {
      return liveSize(ref).then(function (n) {
        if (n === 0 || (n > 0 && !bySize[n])) return;      // gone, or no upload of that size
        return fetch(BASE + ref, { cache: "no-store" }).then(function (r) { return r.ok ? r.arrayBuffer() : null; }).then(function (ab) {
          var same = ab && bySize[ab.byteLength];
          if (!same) return;
          return digest(new Uint8Array(ab)).then(function (hx) {
            same.forEach(function (f) { if (!f.reuse && f.hx === hx) { f.reuse = ref; remap[f.name] = ref; } });
          });
        });
      });
    }).then(function () {
      if (Object.keys(remap).length) walkStrings(bundle, function (v) { return remap[v.split("?")[0]]; });
      return files.filter(function (f) { return !f.reuse; });
    });
  }

  /* ---------------------------------------------------------------- publish */
  function publish(opts) {
    opts = opts || {};
    if (location.protocol === "file:") return Promise.reject(new Error("Open the site over http(s) to publish."));
    var say = opts.onProgress || function () {};
    var sc = clone(opts.siteContent || {});
    var enc = new TextEncoder();
    var G, html = {}, baked = {}, bumps = {}, media = [], out = [], fixes = [], pageHashes = {};
    var notes = { missing: [], skipped: [], failed: [], orphaned: [] };
    function add(name, bytes) { out = out.filter(function (f) { return f.name !== name; }); out.push({ name: name, bytes: bytes }); }

    say("Reading your projects\u2026", 3);
    return gather().then(function (g) {
      G = g;   /* uploads ship exactly as added — no automatic right-sizing */
      say("Reading your pages\u2026", 6);
      return Promise.all(PAGES.map(function (p) { return getText(p + ".html"); }));
    }).then(function (texts) {
      PAGES.forEach(function (p, i) { html[p] = texts[i]; });
      return extract(G.bundle, function (d, t) { say("Packing photos and videos \u2014 " + d + " of " + t, 10 + 40 * d / t); }, G.pub, texts);
    }).then(function (x) {
      notes.missing = x.missing; bumps = x.bumps;
      say("Matching files already on the live site\u2026", 50);
      return reuseLive(x.files, G.bundle, G.pub);
    }).then(function (files) {
      media = files;
      if (canon(G.bundle) !== canon(G.pub)) add("portfolio-data.json", enc.encode(JSON.stringify(G.bundle)));
      return materialiseSite(sc, html);
    }).then(function (s) {
      media = media.concat(s.files);
      Object.keys(s.bumps).forEach(function (k) { bumps[k] = s.bumps[k]; });
      say("Writing your edits into the pages\u2026", 60);
      PAGES.forEach(function (p) {
        var d = sc[p], src = html[p];
        if (!src || !hasEdits(d)) return;
        var r = bakePage(src, d);
        r.skipped.forEach(function (k) { notes.skipped.push(p + ".html \u00b7 " + k); });
        if (!r.html) { notes.failed.push(p + ".html"); return; }
        baked[p] = r.html;
      });
      say("Checking what is already live\u2026", 70);
      return pool(media, 6, function (f) {
        return liveSize(f.name).then(function (n) { if (f.over || (n !== -1 && n !== f.bytes.length)) f.ship = true; });
      }, function (d, t) { say("Checking what is already live \u2014 " + d + " of " + t, 70 + 15 * d / t); });
    }).then(function () {
      media.forEach(function (f) { if (f.ship) add(f.name, f.bytes); });
      if (!G.resume) return;
      return bytesOf(G.resume).then(function (b) {
        return liveSize(RESUME_PATH).then(function (n) {
          if (n === b.length) return;
          add(RESUME_PATH, b);
          if (n > 0) bumps[RESUME_PATH] = RESUME_PATH + "?v=" + ((verMap([], PAGES.map(function (p) { return html[p]; }))[RESUME_PATH] || 1) + 1);
        });
      });
    }).then(function () {
      /* a fixed-name file was replaced: every page pointing at it gets the new ?v= */
      PAGES.forEach(function (p) {
        var src = html[p]; if (!src) return;
        var t = baked[p] || src;
        Object.keys(bumps).forEach(function (path) {
          t = t.replace(new RegExp(reEsc(path) + "(\\?v=\\d+)?", "g"), function () { return bumps[path]; });
        });
        if (baked[p] || t !== src) pageHashes[p] = strHash(t);
        if (t !== src) add(p + ".html", enc.encode(t));
      });
      return idbGet(FIXES);
    }).then(function (fx) {
      Object.keys(fx || {}).forEach(function (p) { if (fx[p] && fx[p].bytes) { add(p.split("?")[0], fx[p].bytes); fixes.push(p); } });
      var now = mediaRefs(G.bundle), all = PAGES.map(function (p) { return html[p] || ""; }).join("\n");
      notes.orphaned = Object.keys(mediaRefs(G.pub)).filter(function (r) { return !now[r] && all.indexOf(r) < 0; });
      if (!out.length) return { empty: true, notes: notes };

      say("Zipping " + out.length + " file" + (out.length === 1 ? "" : "s") + "\u2026", 92);
      var names = out.map(function (f) { return f.name; }).sort();
      var d = new Date(), stamp = d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
      function list(title, arr) { return arr.length ? "\n" + title + "\n" + arr.map(function (n) { return "  " + n; }).join("\n") + "\n" : ""; }
      var readme =
        "AJAY KATTA \u2014 PUBLISH \u00b7 " + d.toLocaleString() + "\n\n" +
        "Only what differs from the live site is in here (" + names.length + " file" + (names.length === 1 ? "" : "s") + ").\n" +
        list("IN THIS ZIP", names) +
        list("NO LONGER USED \u2014 safe to delete from the repo after this push", notes.orphaned) +
        list("COULD NOT BE PACKED \u2014 re-upload these", notes.missing) +
        list("PAGE EDITS THAT NO LONGER MATCH AN ELEMENT (skipped)", notes.skipped) +
        "\nTO GO LIVE\n" +
        "1. Unzip.\n" +
        "2. Copy everything inside GitRepo into your repo, keeping the folders,\n" +
        "   replacing files that already exist.\n" +
        "3. Push to GitHub \u2014 Vercel redeploys in about a minute.\n";
      var zipFiles = out.map(function (f) { return { name: REPO + "/" + f.name, bytes: f.bytes }; });
      zipFiles.push({ name: ROOT + "/WHAT-CHANGED.txt", bytes: enc.encode(readme) });
      var blob = makeZip(zipFiles), name = "ajay-katta-publish-" + stamp + ".zip";
      download(blob, name);
      say("Done", 100);
      return { name: name, size: blob.size, sizeLabel: kb(blob.size), count: names.length, changed: names,
               fixes: fixes, pageHashes: pageHashes, notes: notes };
    });
  }
  function clearFixes(paths) {
    return idbGet(FIXES).then(function (fx) {
      if (!fx) return;
      (paths || Object.keys(fx)).forEach(function (p) { delete fx[p]; });
      return idbSet(FIXES, Object.keys(fx).length ? fx : null);
    })["catch"](function () {});
  }

  /* -------------------------------------------------------------- optimiser
     Finds every image larger than IMG_MAX_EDGE — published files and uploads
     still on this device — and fixes it in this browser. A published file is
     staged and ships with the next Publish; an upload is rewritten in place. */
  var meas = {}, names = {};
  function optRefs(o) {
    var out = {};
    walkStrings({ o: o }, function (v) {
      if (/^media\/.+\.(webp|jpe?g|png)(\?v=\d+)?$/i.test(v)) out[v] = 1;
      else if (/^data:image\/(webp|jpe?g|png)[;,]/i.test(v) && v.length >= INLINE_MIN) out[v] = 1;
    });
    return Object.keys(out);
  }
  function optShow(p) { return isData(p) ? (names[p] || "new upload") : p.split("/").pop(); }
  function optIndex() {
    return Promise.all([gather(), idbGet(FIXES)]).then(function (r) {
      var g = r[0], fx = r[1] || {}, pubIds = {}, groups = [], all = {};
      Object.keys(g.pub).forEach(function (k) { (((g.pub[k] || {}).items) || []).forEach(function (it) { if (it && it.id) pubIds[it.id] = 1; }); });
      Object.keys(g.bundle).forEach(function (k) {
        if (k === "home") return;
        var page = g.bundle[k], pp = optRefs(page);
        if (!pp.length) return;
        pp.forEach(function (p) { all[p] = 1; });
        groups.push({ key: "page:" + k, label: LABEL[k] || k, kind: "page", paths: pp });
        (page.items || []).forEach(function (it) {
          var ip = optRefs(it); if (!ip.length) return;
          var title = it.title || "Untitled";
          ip.forEach(function (p, n) { if (isData(p)) names[p] = title + " \u00b7 photo " + (n + 1); });
          groups.push({ key: "item:" + it.id, label: title + (pubIds[it.id] ? "" : " \u00b7 not published yet"), kind: "item", paths: ip });
        });
      });
      if (g.bundle.home) {
        var hp = optRefs(g.bundle.home);
        if (hp.length) {
          hp.forEach(function (p) { all[p] = 1; if (isData(p)) names[p] = "Home page photo"; });
          groups.push({ key: "home", label: "Home page", kind: "page", paths: hp });
        }
      }
      Object.keys(fx).forEach(function (p) { if (meas[p]) meas[p].staged = true; else meas[p] = { staged: true }; });
      return { all: Object.keys(all), groups: groups };
    });
  }
  function measureOne(url) {
    if (meas[url] && (meas[url].w || meas[url].skip)) return Promise.resolve(meas[url]);
    var staged = meas[url] && meas[url].staged;
    return fetch(url).then(function (r) { return r.ok ? r.blob() : null; }).then(function (b) {
      if (!b || !resizable(b.type)) return (meas[url] = { skip: true });
      return decode(b).then(function (dec) {
        var m = { w: dec.w, h: dec.h, size: b.size, fmt: b.type, staged: staged };
        dec.release();
        m.over = Math.max(m.w, m.h) > IMG_OVER_EDGE;
        m.notWebp = b.type !== "image/webp";
        return (meas[url] = m);
      });
    })["catch"](function () { return (meas[url] = { skip: true }); });
  }
  function optMeasure(paths, onEach) { return pool(paths, 4, measureOne, onEach); }
  function optStat(paths) {
    var s = { total: paths.length, known: 0, over: 0, staged: 0, bytes: 0, notWebp: 0, other: [] };
    paths.forEach(function (p) {
      var m = meas[p]; if (!m || (!m.w && !m.skip)) return;
      s.known++;
      if (m.notWebp && !m.skip) { s.notWebp++; if (s.other.length < 8) s.other.push(optShow(p)); }
      if (m.staged) s.staged++;
      else if (m.over) { s.over++; s.bytes += m.size; }
    });
    return s;
  }
  function shrink(blob, isPng) {
    return decode(blob).then(function (dec) {
      var long = Math.max(dec.w, dec.h), from = dec.w + "\u00d7" + dec.h;
      if (long <= IMG_OVER_EDGE) { dec.release(); return { skip: "already " + from }; }
      var w = Math.max(1, Math.round(dec.w * IMG_MAX_EDGE / long)), h = Math.max(1, Math.round(dec.h * IMG_MAX_EDGE / long)), cv;
      try { cv = scaleTo(dec, w, h); } catch (e) { dec.release(); return { fail: "too big for this browser to redraw \u2014 try desktop Chrome or Edge" }; }
      dec.release();
      return encodeBest(cv, isPng, blob.size).then(function (b) {
        cv.width = cv.height = 1;   // release the backing store on iOS
        if (!b || !b.size) return { fail: "this browser could not re-save it" };
        if (b.size > blob.size * 1.15) return { skip: "already efficient at " + from };
        return { blob: b, was: blob.size, now: b.size, from: from, to: w + "\u00d7" + h };
      });
    }, function () { return { fail: "could not open this file \u2014 it may be damaged" }; });
  }
  function fixOne(p) {
    return fetch(p, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("not on the server (" + r.status + ")");
      return r.blob();
    }).then(function (blob) {
      if (!blob.size) throw new Error("empty file");
      if (!resizable(blob.type)) return { skip: "not a resizable image" };
      return shrink(blob, /png/i.test(blob.type) || /\.png$/i.test(p));
    })["catch"](function (e) { return { fail: (e && e.message) || "could not be read" }; });
  }
  /* uploads that are still only on this device are rewritten where they live */
  function writeLocal(map) {
    if (!Object.keys(map).length) return Promise.resolve(0);
    function swap(o) { var n = 0; walkStrings(o, function (v) { if (map[v]) { n++; return map[v]; } }); return n; }
    var cur = (window.AK_CASES && window.AK_CASES.current) ? window.AK_CASES.current() : null;
    if (cur && cur.data) swap(cur.data);
    return idbKeys().then(function (ks) {
      var dk = ks.filter(function (k) { return typeof k === "string" && k.indexOf("data:") === 0; });
      return Promise.all(dk.map(function (k) {
        return idbGet(k).then(function (d) { return (d && swap(d)) ? idbSet(k, d) : null; })["catch"](function () {});
      })).then(function () {
        dk.map(function (k) { return "ak-cover-" + k.slice(5); }).concat(["ak-profile-photo"]).forEach(function (k) {
          var v = lsGet(k); if (v && map[v]) lsSet(k, map[v]);
        });
        try { var raw = lsGet("ak-certs"), a = raw ? JSON.parse(raw) : null; if (Array.isArray(a) && swap({ a: a })) lsSet("ak-certs", JSON.stringify(a)); } catch (e) {}
        try { document.dispatchEvent(new CustomEvent("ak-data-replaced")); } catch (e) {}
      });
    });
  }
  function optRun(paths, onEach) {
    var queue = paths.filter(function (p) { var m = meas[p]; return m && m.over && !m.staged; });
    var res = { staged: 0, local: 0, saved: 0, failed: [] }, localMap = {}, stage = {};
    function next() {
      if (!queue.length) return Promise.resolve();
      var p = queue.shift(), local = isData(p);
      return (local ? fetch(p).then(function (r) { return r.blob(); }).then(function (b) { return shrink(b, /png/i.test(b.type)); }) : fixOne(p))
        .then(function (r) {
          r = r || { fail: "could not be read" };
          if (!r.blob) {
            if (r.skip && meas[p]) meas[p].over = false; else if (r.fail) res.failed.push(p);
            if (onEach) onEach(p, r);
            return next();
          }
          res.saved += r.was - r.now;
          if (meas[p]) { meas[p].staged = true; meas[p].size = r.now; }
          var done = local
            ? blobToDataURL(r.blob).then(function (u) { if (u) { localMap[p] = u; res.local++; } })
            : r.blob.arrayBuffer().then(function (ab) { stage[p] = { bytes: new Uint8Array(ab), was: r.was, now: r.now, at: Date.now() }; res.staged++; });
          return done.then(function () { if (onEach) onEach(p, r); return next(); });
        });
    }
    return next().then(function () { return writeLocal(localMap); }).then(function () {
      if (!res.staged) return res;
      return idbGet(FIXES).then(function (fx) {
        fx = fx || {};
        Object.keys(stage).forEach(function (p) { fx[p] = stage[p]; });
        return idbSet(FIXES, fx);
      }).then(function () { return res; });
    });
  }

  /* ------------------------------------------------- full-site backup ZIP
     The live site as it is right now — every page, script, data file and every
     media/ file they reference — in the same Ajaykatta_Website/GitRepo layout.
     Read-only: it never touches drafts, baselines or the publish snapshot.
     Unpublished edits are NOT in it; Publish is still the only way to ship them. */
  function fullSite(o) {
    o = o || {};
    var tick = o.onProgress || function () {}, enc = new TextEncoder();
    var want = {}, out = {}, missing = [], bytes = 0;
    (o.files || []).forEach(function (f) { if (f) want[f] = 1; });
    function grab(path) {
      return fetch(BASE + path.split("/").map(encodeURIComponent).join("/"), { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw 0;
        return r.arrayBuffer();
      }).then(function (b) { out[path] = new Uint8Array(b); bytes += b.byteLength; })["catch"](function () { missing.push(path); });
    }
    var core = Object.keys(want);
    tick("Reading pages and scripts\u2026", 2);
    return pool(core, 4, grab, function (d, t) { tick("Reading pages and scripts \u00b7 " + d + " of " + t, 2 + d / t * 13); }).then(function () {
      var media = {}, dec = new TextDecoder(), re = /media\/[^"'()\s,<>?#\\]+\.[a-z0-9]{2,5}/gi;
      core.forEach(function (f) {                 // images the content uses — pages + data, not code
        if (!out[f] || /\.(js|css)$/i.test(f)) return;
        var t = dec.decode(out[f]), m;
        while ((m = re.exec(t))) { var u = m[0]; try { u = decodeURIComponent(u); } catch (e) {} if (!out[u]) media[u] = 1; }
      });
      var list = Object.keys(media).sort();
      return pool(list, 4, grab, function (d, t) { tick("Media \u00b7 " + d + " of " + t + " \u00b7 " + kb(bytes), 15 + d / t * 80); });
    }).then(function () {
      tick("Building the ZIP\u2026", 97);
      var names = Object.keys(out).sort(), at = new Date();
      var keep = (out["vercel.json"] ? [] : ["vercel.json"]).concat(["README.md", ".gitignore"]);
      missing = missing.filter(function (m) { return keep.indexOf(m) < 0; });
      var info = "Ajay Katta portfolio \u2014 full-site backup\n" + at.toString() + "\nFrom " + BASE + "\n\n" +
        names.length + " files \u00b7 " + kb(bytes) + "\n" +
        "This is the LIVE site only. Edits not yet published are not included.\n\n" +
        "GitRepo/ holds exactly the files the site uses \u2014 pages, scripts, data, config and every\n" +
        "media file they reference. Nothing unused is included.\n\n" +
        "To restore: copy everything inside GitRepo into your repo (same folders, replace existing\n" +
        "files) and push. GitHub's web uploader takes 100 files at a time \u2014 upload media/ folder by folder,\n" +
        "or use GitHub Desktop / git.\n" +
        (keep.length ? "\nNot in this ZIP \u2014 keep the copies already in your repo:\n  " + keep.join("\n  ") + "\n" : "") +
        (missing.length ? "\nCouldn't download (" + missing.length + "):\n  " + missing.join("\n  ") + "\n" : "");
      var files = names.map(function (n) { return { name: REPO + "/" + n, bytes: out[n] }; });
      files.unshift({ name: ROOT + "/BACKUP.txt", bytes: enc.encode(info) });
      var blob = makeZip(files), pad = function (n) { return (n < 10 ? "0" : "") + n; };
      var name = ROOT + "-full-" + at.getFullYear() + pad(at.getMonth() + 1) + pad(at.getDate()) + "-" + pad(at.getHours()) + pad(at.getMinutes()) + ".zip";
      download(blob, name);
      return { name: name, count: names.length, size: blob.size, sizeLabel: kb(blob.size), missing: missing, keep: keep };
    });
  }

  window.AK_PACKAGE = {
    publish: publish,
    fullSite: fullSite,
    clearFixes: clearFixes,
    optimiser: { index: optIndex, measure: optMeasure, stat: optStat, run: optRun, show: optShow }
  };
})();
