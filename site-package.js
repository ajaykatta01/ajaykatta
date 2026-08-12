/* ============================================================================
   Ajay Katta Portfolio — SHARED PUBLISH PACKAGER  (site-package.js)
   ----------------------------------------------------------------------------
   One code path behind BOTH publish buttons:
     • Settings → Publish → "Download updated website ZIP"   (site-edit.js)
     • Admin menu → "Export site data"                       (admin.js)
   Either one produces the SAME artefact: the complete, deploy-ready website —
   every page, script, photo and file — with the owner's edits already written
   into the HTML (text, photos, links, hidden/reordered sections, theme colours,
   title + description + og/twitter tags), plus fresh site-content.json and
   portfolio-data.json.

   Loaded on demand by the two editors; visitors never fetch it.

   AK_PACKAGE.full({ siteContent?, portfolioJSON?, portfolioFiles?, title?, zipName? })
     → Promise<{ blob, count, size }>  (also downloads the ZIP)
   Anything not passed is gathered from the other editor if it is loaded, then
   from this device's working copy (IndexedDB), then from the live site.
========================================================================== */
(function () {
  "use strict";
  if (window.AK_PACKAGE) return;

  var PAGES = ["index", "project-ui-ux", "project-gen-ai", "project-3d", "resume"];
  var SITE_FILES = PAGES.map(function (p) { return p + ".html"; }).concat([
    "site-content.js", "site-edit.js", "site-package.js", "admin.js", "theme-ripple.js",
    "scroll-progress.js", "layout-studio.js", "studio-templates.js",
    "site-content.json", "portfolio-data.json", "robots.txt", "vercel.json", "README.md"
  ]);
  /* Videos, audio and 3D models count as much as photos — a case study that leans on an .mp4
     or a .glb was shipping a page that pointed at a file the ZIP never carried. */
  var ASSET_RE = /(?:media|assets)\/[A-Za-z0-9._@()%+\-\/]+?\.(?:webp|jpe?g|png|gif|svg|avif|pdf|mp4|webm|mov|m4v|ogv|mp3|wav|m4a|oga|glb|gltf|usdz|obj|woff2?|ico)/g;
  var BASE = location.href.split("#")[0].split("?")[0].replace(/[^\/]*$/, "");
  var ROOT = "Ajaykatta_Website";          // top folder inside the ZIP
  var REPO = ROOT + "/GitRepo";            // its contents are exactly what goes in the repo

  /* ------------------------------------------------------------------ utils */
  function el(tag, style, txt) {
    var e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function skipEl(e) {
    if (window.AK_SITE && window.AK_SITE.skip) return window.AK_SITE.skip(e);
    var c = (e.getAttribute && e.getAttribute("class")) || "";
    if (/(^|\s)(ak-|aks-)/.test(c)) return true;
    if (e.hasAttribute && e.hasAttribute("data-ak-transient")) return true;
    return ["SCRIPT", "STYLE", "LINK", "TEMPLATE", "NOSCRIPT", "META"].indexOf(e.tagName) >= 0;
  }
  function idbGet(k) {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open("ak-portfolio", 1);
        rq.onupgradeneeded = function () { try { rq.result.createObjectStore("kv"); } catch (e) {} };
        rq.onerror = function () { res(null); };
        rq.onsuccess = function () {
          try {
            var r = rq.result.transaction("kv").objectStore("kv").get(k);
            r.onsuccess = function () { res(r.result); };
            r.onerror = function () { res(null); };
          } catch (e) { res(null); }
        };
      } catch (e) { res(null); }
    });
  }
  function pool(items, n, worker, tick) {
    var i = 0, done = 0, total = items.length, active = 0;
    return new Promise(function (res) {
      if (!total) return res();
      function next() {
        while (active < n && i < total) {
          active++;
          worker(items[i++])["catch"](function () {}).then(function () {
            active--; done++;
            if (tick) tick(done, total);
            if (done === total) res(); else next();
          });
        }
      }
      next();
    });
  }

  /* --------------------------------------------------------------- progress */
  function progress(title) {
    var bar = el("i", "display:block;height:100%;width:2%;background:#E5783A;transition:width .25s");
    var lab = el("div", "font:500 12.5px/1.4 system-ui,-apple-system,sans-serif;opacity:.7;margin-top:9px", "Starting…");
    var track = el("div", "height:6px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden;margin-top:12px");
    track.appendChild(bar);
    var box = el("div", "position:fixed;z-index:2147483600;left:50%;bottom:104px;transform:translateX(-50%);width:min(370px,88vw);padding:16px 18px;border-radius:14px;background:#1D1C1A;color:#fff;border:1px solid rgba(255,255,255,.13);box-shadow:0 20px 54px rgba(0,0,0,.5)");
    box.className = "ak-transient aks-ui";
    box.setAttribute("data-ak-transient", "");
    box.appendChild(el("div", "font:600 14px/1.3 system-ui,-apple-system,sans-serif", title));
    box.appendChild(track);
    box.appendChild(lab);
    document.body.appendChild(box);
    return {
      set: function (t, pct) { lab.textContent = t; bar.style.width = Math.max(2, Math.min(100, pct)) + "%"; },
      close: function () { box.remove(); }
    };
  }

  /* -------------------------------------------------------------- STORE zip */
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
    var cs = 0; central.forEach(function (c) { cs += c.length; });
    var end = new Uint8Array([].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cs), u32(offset), u16(0)));
    return new Blob(parts.concat(central, [end]), { type: "application/zip" });
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
  function hashKey(s) { var x = 0; for (var i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0; return x.toString(36); }

  /* uploaded data: URLs in a site-content object become real files */
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

  /* ------------------------------- bake overrides into a pristine page ----- */
  function bResolve(doc, key) {
    if (!key) return null;
    if (key.charAt(0) === "#") {
      try { return doc.querySelector('[data-ak-id="' + key.slice(1).replace(/["\\]/g, "") + '"]'); } catch (e) { return null; }
    }
    var segs = key.split(">"), node = doc.body;
    for (var i = 0; i < segs.length && node; i++) {
      var m = /^([a-z0-9-]+)(?::(\d+))?$/i.exec(segs[i]); if (!m) return null;
      var tag = m[1].toUpperCase(), want = m[2] ? +m[2] : 1, c = 0, found = null, ch = node.firstElementChild;
      while (ch) { if (ch.tagName === tag && !skipEl(ch)) { c++; if (c === want) { found = ch; break; } } ch = ch.nextElementSibling; }
      node = found;
    }
    return node;
  }
  function metaTag(doc, attr, name, val) {
    var e = doc.head.querySelector("meta[" + attr + '="' + name + '"]');
    if (!e) { e = doc.createElement("meta"); e.setAttribute(attr, name); doc.head.appendChild(e); }
    e.setAttribute("content", val);
  }
  function bakeSEOText(src, m) {
    if (!m) return src;
    function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
    function tag(html, attr, name, val) {
      var re = new RegExp("<meta[^>]*" + attr + "=[\"']" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "[\"'][^>]*>", "i");
      var t = "<meta " + attr + '="' + name + '" content="' + esc(val) + '">';
      return re.test(html) ? html.replace(re, function () { return t; })
                           : html.replace(/<\/head>/i, function () { return t + "\n</head>"; });
    }
    var out = src;
    if (m.title) {
      out = out.replace(/<title>[\s\S]*?<\/title>/i, function () { return "<title>" + esc(m.title) + "</title>"; });
      out = tag(out, "property", "og:title", m.title);
      out = tag(out, "name", "twitter:title", m.title);
    }
    if (m.description) {
      out = tag(out, "name", "description", m.description);
      out = tag(out, "property", "og:description", m.description);
      out = tag(out, "name", "twitter:description", m.description);
    }
    if (m.image) { out = tag(out, "property", "og:image", m.image); out = tag(out, "name", "twitter:image", m.image); }
    return out;
  }
  function bakePage(src, d) {
    d = d || {};
    var doc;
    try { doc = new DOMParser().parseFromString(src, "text/html"); } catch (e) { return bakeSEOText(src, d.meta); }
    if (!doc || !doc.body || !doc.head) return bakeSEOText(src, d.meta);

    ["text", "html", "img", "href", "attr", "hide"].forEach(function (b) {
      var set = d[b]; if (!set) return;
      for (var k in set) {
        var node = bResolve(doc, k); if (!node) continue;
        var v = set[k];
        if (b === "text") node.textContent = v;
        else if (b === "html") node.innerHTML = v;
        else if (b === "img") {
          if (node.tagName === "IMG") { node.removeAttribute("srcset"); node.setAttribute("src", v); }
          else if (node.tagName === "SOURCE") node.setAttribute("srcset", v);
          else node.style.backgroundImage = 'url("' + v + '")';
        }
        else if (b === "href") node.setAttribute("href", v);
        else if (b === "attr") { for (var a in v) node.setAttribute(a, v[a]); }
        else if (b === "hide" && v) node.style.setProperty("display", "none", "important");
      }
    });
    if (d.order) for (var ck in d.order) {
      var box = ck === "" ? doc.body : bResolve(doc, ck);
      if (!box || !Array.isArray(d.order[ck])) continue;
      var kids = Array.prototype.filter.call(box.children, function (c) { return !skipEl(c); });
      kids.forEach(function (c, i) { if (!c.hasAttribute("data-ak-oi")) c.setAttribute("data-ak-oi", i); });
      var by = {}; kids.forEach(function (c) { by[c.getAttribute("data-ak-oi")] = c; });
      d.order[ck].forEach(function (oi) { if (by[oi]) box.appendChild(by[oi]); });
    }
    if (d.vars) {
      function blk(sel, set) { var o = ""; for (var k in (set || {})) if (set[k]) o += k + ":" + set[k] + ";"; return o ? sel + "{" + o + "}" : ""; }
      var css = blk(":root", d.vars.dark) + blk('[data-theme="light"]', d.vars.light);
      if (css) {
        var st = doc.getElementById("ak-site-vars") || doc.createElement("style");
        st.id = "ak-site-vars"; st.textContent = css; doc.head.appendChild(st);
      }
    }
    var m = d.meta;
    if (m) {
      if (m.title) {
        var t = doc.head.querySelector("title");
        if (!t) { t = doc.createElement("title"); doc.head.appendChild(t); }
        t.textContent = m.title;
        metaTag(doc, "property", "og:title", m.title);
        metaTag(doc, "name", "twitter:title", m.title);
      }
      if (m.description) {
        metaTag(doc, "name", "description", m.description);
        metaTag(doc, "property", "og:description", m.description);
        metaTag(doc, "name", "twitter:description", m.description);
      }
      if (m.image) {
        metaTag(doc, "property", "og:image", m.image);
        metaTag(doc, "name", "twitter:image", m.image);
      }
    }
    var html = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
    if (html.indexOf("</body>") < 0 || html.length < src.length * 0.6) return bakeSEOText(src, d.meta);  // round-trip sanity net
    return html;
  }

  /* JSON compares by value, so re-indentation alone never counts as a change */
  function sameFile(name, a, b) {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (!/\.json$/i.test(name)) return false;
    try { return JSON.stringify(JSON.parse(a)) === JSON.stringify(JSON.parse(b)); } catch (e) { return false; }
  }

  /* --------------------------------------------------- gather both datasets */
  function getSiteContent(opts) {
    if (opts.siteContent) return Promise.resolve(opts.siteContent);
    if (window.AK_EDIT && window.AK_EDIT.content) {
      try { var c = window.AK_EDIT.content(); if (c) return Promise.resolve(c); } catch (e) {}
    }
    var flagged = false;
    try { flagged = !!localStorage.getItem("ak-site-edits"); } catch (e) {}
    if (!flagged) return Promise.resolve(null);
    return idbGet("site:content").then(function (v) { return (v && typeof v === "object") ? v : null; });
  }
  function getPortfolio(opts) {
    if (opts.portfolioJSON) return Promise.resolve({ json: opts.portfolioJSON, files: opts.portfolioFiles || [] });
    if (window.AK_ADMIN_DATA && window.AK_ADMIN_DATA.build) {
      return window.AK_ADMIN_DATA.build().then(function (r) {
        return r ? { json: r.json, files: r.files || [] } : null;
      })["catch"](function () { return null; });
    }
    return Promise.resolve(null);
  }

  /* ------------------------------------------------------------------ full */
  /* mode "full"  → the entire deploy-ready website
     mode "delta" → only the files that differ from what is live right now   */
  function full(opts) {
    opts = opts || {};
    if (location.protocol === "file:") return Promise.reject(new Error("needs http"));
    var delta = opts.mode === "delta";
    var zipName = opts.zipName || (delta ? "ajay-katta-changes.zip" : "ajay-katta-website.zip");
    var pr = progress(opts.title || (delta ? "Packaging your changes" : "Packaging your website"));
    var enc = new TextEncoder();
    var files = [], text = {}, live = {}, sc = null, pf = null, changed = [];

    return Promise.all([getSiteContent(opts), getPortfolio(opts)])
      .then(function (got) {
        sc = got[0]; pf = got[1];
        if (sc) { sc = JSON.parse(JSON.stringify(sc)); files = files.concat(materialise(sc)); }
        if (pf && pf.files) files = files.concat(pf.files);
        pr.set("Reading your pages…", 6);
        return pool(SITE_FILES, 8, function (f) {
          return fetch(BASE + f, { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.text(); })
            .then(function (t) { text[f] = t; live[f] = t; });
        }, function (d, t) { pr.set("Reading your pages — " + d + " of " + t, 6 + (d / t) * 16); });
      })
      .then(function () {
        text["site-content.json"] = sc ? JSON.stringify(sc, null, 2) : (live["site-content.json"] || "{}");
        text["portfolio-data.json"] = pf ? pf.json : (live["portfolio-data.json"] || "{}");
        if (delta) return;                       // a change pack ships no untouched media
        var all = "", k;
        for (k in text) all += text[k] + "\n";
        var found = {}, m, re = new RegExp(ASSET_RE.source, "g");
        while ((m = re.exec(all))) found[m[0]] = 1;
        var have = {}; files.forEach(function (f) { have[f.name] = 1; });
        var list = Object.keys(found).filter(function (p) { return !have[p]; });
        return pool(list, 10, function (p) {
          return fetch(BASE + p, { cache: "no-store" }).then(function (r) { if (!r.ok) throw 0; return r.arrayBuffer(); })
            .then(function (b) { files.push({ name: p, bytes: new Uint8Array(b) }); });
        }, function (d, t) { pr.set("Collecting photos and files — " + d + " of " + t, 22 + (d / t) * 60); });
      })
      .then(function () {
        pr.set("Writing your edits into the pages…", 86);
        var scObj = sc || {}, k;
        PAGES.forEach(function (p) {
          var fn = p + ".html"; if (!text[fn]) return;
          var d = scObj[p];
          var baked = (d && Object.keys(d).length) ? bakePage(text[fn], d) : text[fn];
          delete text[fn];
          if (delta && baked === live[fn]) return;               // page untouched
          files.push({ name: fn, bytes: enc.encode(baked) });
          changed.push(fn);
        });
        for (k in text) {
          if (delta && sameFile(k, text[k], live[k])) continue;    // script / json untouched
          files.push({ name: k, bytes: enc.encode(text[k]) });
          changed.push(k);
        }
        // last write wins, so a name can only appear once
        var seen = {}, dedup = [];
        for (var i = files.length - 1; i >= 0; i--) { if (seen[files[i].name]) continue; seen[files[i].name] = 1; dedup.unshift(files[i]); }
        files = dedup;
        var media = files.filter(function (f) { return /^media\//.test(f.name); }).map(function (f) { return f.name; });
        if (delta) changed = changed.concat(media);

        if (delta && !files.length) { pr.close(); return null; }

        files.push({ name: "__ROOT__" + (delta ? "WHAT-CHANGED.txt" : "READ-ME-FIRST.txt"), bytes: enc.encode(delta ?
          ("AJAY KATTA — CHANGES SINCE YOUR LIVE SITE\n\n" +
           "Only the files that are different are in here (" + changed.length + ").\n\n" +
           changed.map(function (n) { return "  " + n; }).join("\n") + "\n\n" +
           "TO GO LIVE\n" +
           "1. Unzip.\n" +
           "2. Open the GitRepo folder and copy these files into your repo, keeping the\n" +
           "   same folder layout — replacing the ones already there.\n" +
           "3. Push to GitHub. Vercel redeploys automatically in about a minute.\n\n" +
           "Exported " + new Date().toLocaleString() + "\n")
          :
          ("AJAY KATTA — WEBSITE PUBLISH\n\n" +
           "This ZIP is your complete, updated website. Everything you changed —\n" +
           "case studies, text, photos, links, colours, titles and SEO — is already\n" +
           "written into these files.\n\n" +
           "TO GO LIVE\n" +
           "1. Unzip.\n" +
           "2. Copy everything inside the GitRepo folder into your repo, keeping the same\n" +
           "   folder layout, replacing the old files.\n" +
           "3. Push to GitHub. Vercel redeploys automatically in about a minute.\n\n" +
           "TO CHECK IT FIRST\n" +
           "Open GitRepo/index.html from the unzipped folder.\n\n" +
           "Exported " + new Date().toLocaleString() + "\n")) });

        // GitRepo/ holds the deployable tree; the read-me sits beside it at the top
        files = files.map(function (f) {
          return { name: f.name.indexOf("__ROOT__") === 0 ? ROOT + "/" + f.name.slice(8) : REPO + "/" + f.name, bytes: f.bytes };
        });
        pr.set("Zipping " + files.length + " files…", 93);
        return new Promise(function (r) { setTimeout(r, 50); });
      })
      .then(function (cont) {
        if (cont === null) return { empty: true, count: 0, changed: [], name: zipName };
        var blob = makeZip(files);
        pr.close();
        var a = el("a");
        a.href = URL.createObjectURL(blob); a.download = zipName;
        document.body.appendChild(a); a.click(); a.remove();
        return { blob: blob, count: files.length, size: blob.size, sizeLabel: kb(blob.size), name: zipName, changed: changed, mode: delta ? "delta" : "full" };
      })
      ["catch"](function (e) { pr.close(); throw e; });
  }

  window.AK_PACKAGE = {
    full: full,
    materialise: materialise,
    bakePage: bakePage,
    makeZip: makeZip,
    kb: kb,
    PAGES: PAGES
  };
})();
