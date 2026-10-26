/* svg-embed.js — makes an uploaded SVG look exactly as it was designed, everywhere.
   An SVG shown through <img> is sealed off: it can't use the page's web fonts, can't fetch
   anything, and only sees fonts installed on the viewer's machine — so text falls back to
   Times / Arial. prepare() fixes that at upload time, inside the file itself:
     · the fonts its text uses are embedded (Google Fonts subset to just the SVG's own
       characters; otherwise a font on this computer or a font file the owner picks)
     · remote @import CSS, @font-face files and <image> links are pulled in as data
     · a root with no size gets width/height from its viewBox (and vice versa) so it can't
       collapse to 300×150; missing xmlns / xmlns:xlink are added so it renders at all
   Nothing changes → the original bytes are returned untouched. Loaded on demand by admin.js. */
(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg", XL = "http://www.w3.org/1999/xlink";
  var GEN = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-serif|ui-sans-serif|ui-monospace|ui-rounded|emoji|math|fangsong|inherit|initial|unset|revert|-apple-system|blinkmacsystemfont)$/i;
  var STYLE_W = [["thin", 100], ["hairline", 100], ["extralight", 200], ["ultralight", 200], ["light", 300], ["regular", 400], ["book", 400], ["normal", 400], ["roman", 400],
    ["medium", 500], ["semibold", 600], ["demibold", 600], ["extrabold", 800], ["ultrabold", 800], ["bold", 700], ["heavy", 900], ["black", 900]];
  var PS_RE = /^(.+?)[-_ ]((?:(?:thin|hairline|extralight|ultralight|light|regular|book|normal|roman|medium|semibold|demibold|extrabold|ultrabold|bold|heavy|black|italic|oblique|it)[\s_-]*)+)$/i;

  /* ---------- small helpers ---------- */
  function svgText(d) {
    d = String(d || ""); var i = d.indexOf(","); if (d.indexOf("data:") !== 0 || i < 0) return d;
    var meta = d.slice(0, i), body = d.slice(i + 1);
    if (!/;base64/i.test(meta)) { try { return decodeURIComponent(body); } catch (e) { return body; } }
    var bin = atob(body.replace(/\s/g, "")), u = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k);
    return new TextDecoder("utf-8").decode(u);
  }
  function b64(u) { var s = "", CH = 0x8000; for (var i = 0; i < u.length; i += CH) s += String.fromCharCode.apply(null, u.subarray(i, i + CH)); return btoa(s); }
  function toData(s) { return "data:image/svg+xml;base64," + b64(new TextEncoder().encode(s)); }
  function get(url, text) {
    return fetch(url, { mode: "cors", credentials: "omit" }).then(function (r) { if (!r.ok) throw new Error(r.status); return text ? r.text() : r.blob(); });
  }
  function fontData(blob) {
    return blob.arrayBuffer().then(function (ab) {
      var u = new Uint8Array(ab), sig = String.fromCharCode(u[0], u[1], u[2], u[3]);
      var t = sig === "wOF2" ? ["font/woff2", "woff2"] : sig === "wOFF" ? ["font/woff", "woff"] : sig === "OTTO" ? ["font/otf", "opentype"] : ["font/ttf", "truetype"];
      return { url: "data:" + t[0] + ";base64," + b64(u), fmt: t[1], size: u.length };
    });
  }
  function blobData(b) {
    if (/font|octet|^$/.test(b.type || "")) return fontData(b).then(function (f) { return f.url; });
    return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsDataURL(b); });
  }
  function families(s) {
    var out = [], cur = "", q = null;
    for (var i = 0; i < (s || "").length; i++) {
      var c = s[i];
      if (q) { if (c === q) q = null; else cur += c; }
      else if (c === '"' || c === "'") q = c;
      else if (c === ",") { if (cur.trim()) out.push(cur.trim()); cur = ""; }
      else cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function styleWeight(s) {
    s = String(s || "").toLowerCase().replace(/[\s_-]/g, "");
    for (var i = 0; i < STYLE_W.length; i++) if (s.indexOf(STYLE_W[i][0]) > -1) return STYLE_W[i][1];
    return 400;
  }
  function camel(s) { return s.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/([A-Za-z])(\d)/g, "$1 $2"); }
  function wName(w) { return ({ 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" })[w] || String(w); }
  function label(f) { return f.fam + " " + wName(f.w) + (f.it ? " Italic" : ""); }
  function q(s) { return '"' + String(s).replace(/["\\]/g, "\\$&") + '"'; }
  function kb(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) { if (k === "onclick") e.onclick = attrs[k]; else if (attrs[k] != null) e.setAttribute(k, attrs[k]); }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  /* ---------- structure fixes ---------- */
  function fixNamespaces(src) {
    var m = /<svg\b[^>]*>/i.exec(src); if (!m) return src;
    var tag = m[0], add = "";
    if (!/\sxmlns\s*=/.test(tag)) add += ' xmlns="' + NS + '"';
    if (/xlink:/.test(src) && !/\sxmlns:xlink\s*=/.test(tag)) add += ' xmlns:xlink="' + XL + '"';
    return add ? src.slice(0, m.index) + tag.replace(/^<svg\b/i, "<svg" + add) + src.slice(m.index + tag.length) : src;
  }
  function num(v) { var m = /^\s*([\d.]+(?:e[-+]?\d+)?)\s*(px)?\s*$/i.exec(v || ""); return m ? parseFloat(m[1]) : null; }
  function r3(n) { return String(Math.round(n * 1000) / 1000); }
  function fixSize(root) {
    var aw = root.getAttribute("width"), ah = root.getAttribute("height"), w = num(aw), hh = num(ah);
    var vb = (root.getAttribute("viewBox") || "").trim().split(/[\s,]+/).map(parseFloat);
    var hasVB = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
    if (hasVB && (w == null || hh == null)) {
      // real units (mm, pt, in…) are left alone — only missing or % sizes are filled in
      if ((aw && w == null && !/%\s*$/.test(aw)) || (ah && hh == null && !/%\s*$/.test(ah))) return false;
      if (w == null && hh == null) { w = vb[2]; hh = vb[3]; }
      else if (w == null) w = hh * vb[2] / vb[3]; else hh = w * vb[3] / vb[2];
      root.setAttribute("width", r3(w)); root.setAttribute("height", r3(hh)); return true;
    }
    if (!hasVB && w > 0 && hh > 0) { root.setAttribute("viewBox", "0 0 " + r3(w) + " " + r3(hh)); return true; }
    return false;
  }

  /* ---------- remote CSS / files → data ---------- */
  function inlineCss(css, rep, depth) {
    var imps = [], re = /@import\s+(?:url\(\s*)?["']?(https?:\/\/[^"')\s;]+)["']?\s*\)?[^;]*;/gi, m;
    while ((m = re.exec(css))) imps.push({ all: m[0], url: m[1] });
    return Promise.all(imps.map(function (x) {
      // Google Fonts imports are dropped — the font step below embeds a far smaller exact subset
      if (/^https?:\/\/fonts\.googleapis\.com\//i.test(x.url)) return { x: x, t: "" };
      if (depth > 2) return null;
      return get(x.url, true).then(function (t) { return inlineCss(t, rep, depth + 1); })
        .then(function (t) { return { x: x, t: t }; }, function () { rep.badRefs.push(x.url); return null; });
    })).then(function (rs) {
      rs.forEach(function (r) { if (r) css = css.split(r.x.all).join(r.t); });
      var urls = {}, ure = /url\(\s*(["']?)(https?:\/\/[^"')]+)\1\s*\)/gi, mm;
      while ((mm = ure.exec(css))) urls[mm[2]] = 1;
      return Promise.all(Object.keys(urls).map(function (u) {
        return get(u).then(blobData).then(function (dd) { return [u, dd]; }, function () { rep.badRefs.push(u); return null; });
      }));
    }).then(function (pairs) {
      (pairs || []).forEach(function (p) { if (p) css = css.split(p[0]).join(p[1]); });
      return css;
    });
  }
  function inlineStyles(doc, rep) {
    var styles = Array.prototype.slice.call(doc.getElementsByTagNameNS(NS, "style"));
    return Promise.all(styles.map(function (st) {
      var css = st.textContent || "";
      if (!/@import|url\(\s*["']?https?:/i.test(css)) return false;
      return inlineCss(css, rep, 0).then(function (out) { if (out !== css) { st.textContent = out; return true; } return false; });
    })).then(function (r) { return r.indexOf(true) > -1; });
  }
  function inlineImages(doc, rep) {
    var imgs = Array.prototype.slice.call(doc.getElementsByTagNameNS(NS, "image"));
    return Promise.all(imgs.map(function (im) {
      var xl = im.getAttributeNS(XL, "href"), href = im.getAttribute("href") || xl || "";
      if (!href || /^data:/i.test(href)) return false;
      if (!/^https?:/i.test(href)) { rep.badRefs.push(href); return false; }
      return get(href).then(blobData).then(function (dd) {
        if (xl) im.setAttributeNS(XL, "xlink:href", dd); else im.setAttribute("href", dd);
        rep.images++; return true;
      }, function () { rep.badRefs.push(href); return false; });
    })).then(function (r) { return r.indexOf(true) > -1; });
  }

  /* ---------- which fonts does the text actually use? ---------- */
  function definedFamilies(root) {
    var out = {};
    Array.prototype.forEach.call(root.getElementsByTagNameNS(NS, "style"), function (st) {
      var re = /@font-face\s*{([^}]*)}/gi, m, css = st.textContent || "";
      while ((m = re.exec(css))) {
        if (!/url\(\s*["']?data:/i.test(m[1])) continue;
        var f = /font-family\s*:\s*([^;]+)/i.exec(m[1]);
        if (f) families(f[1]).forEach(function (n) { out[n.toLowerCase()] = 1; });
      }
    });
    return out;
  }
  // Real cascade (classes, <style>, inheritance from <g>) — measured on a sealed clone so the
  // page's own CSS can't leak in.
  function needFonts(root, src) {
    var host = el("div", { "data-ak-transient": "", "aria-hidden": "true" });
    host.style.cssText = "position:fixed;left:-100000px;top:0;width:10px;height:10px;overflow:hidden;pointer-events:none";
    var sh = host.attachShadow({ mode: "open" });
    sh.appendChild(el("style", {}, [":host{all:initial}"]));
    var clone = document.importNode(root, true);
    Array.prototype.slice.call(clone.querySelectorAll("script,image,iframe,video,audio")).forEach(function (n) { n.remove(); });
    Array.prototype.forEach.call(clone.querySelectorAll("*"), function (n) {
      for (var i = n.attributes.length - 1; i >= 0; i--) if (/^on/i.test(n.attributes[i].name)) n.removeAttribute(n.attributes[i].name);
    });
    Array.prototype.forEach.call(clone.querySelectorAll("style"), function (st) { st.textContent = (st.textContent || "").replace(/@import[^;]*;/gi, ""); });
    sh.appendChild(clone); document.body.appendChild(host);
    var lc = src.toLowerCase(), defined = definedFamilies(root), groups = {}, n;
    try {
      var walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      while ((n = walker.nextNode())) {
        var t = n.nodeValue; if (!t || !t.trim()) continue;
        var p = n.parentNode; if (!p || !p.closest || p.closest("style,script,title,desc,metadata")) continue;
        var cs = getComputedStyle(p);
        var fams = families(cs.fontFamily).filter(function (f) { return !GEN.test(f) && lc.indexOf(f.toLowerCase()) > -1; });
        if (!fams.length || fams.some(function (f) { return defined[f.toLowerCase()]; })) continue;
        var w = parseInt(cs.fontWeight, 10) || 400, it = /italic|oblique/i.test(cs.fontStyle);
        var key = fams.join("|").toLowerCase() + "|" + w + "|" + (it ? 1 : 0);
        var g = groups[key] || (groups[key] = { fams: fams, w: w, it: it, chars: {} });
        Array.from(t + t.toUpperCase() + t.toLowerCase()).forEach(function (c) { if (c.trim()) g.chars[c] = 1; });
        g.chars[" "] = 1;
      }
    } finally { host.remove(); }
    return Object.keys(groups).map(function (k) { return groups[k]; });
  }

  /* ---------- Google Fonts (subset to the SVG's own characters) ---------- */
  var G = "https://fonts.googleapis.com/css2?family=", _css = {}, _gfam = {};
  function gUrl(name, w, it, text) {
    return G + encodeURIComponent(name).replace(/%20/g, "+") + (it ? ":ital,wght@1," + w : ":wght@" + w) + (text ? "&text=" + encodeURIComponent(text) : "") + "&display=block";
  }
  function gCss(url) { return _css[url] || (_css[url] = get(url, true).then(function (t) { return /@font-face/.test(t) ? t : null; }, function () { return null; })); }
  function gHas(name) {   // is this family on Google Fonts at all?
    return _gfam[name] || (_gfam[name] = gCss(G + encodeURIComponent(name).replace(/%20/g, "+") + "&text=a").then(function (t) {
      return t ? true : gCss(gUrl(name, 700, false, "a")).then(Boolean);
    }));
  }
  function nearW(w) {
    var all = [100, 200, 300, 400, 500, 600, 700, 800, 900];
    return all.slice().sort(function (a, b) { return Math.abs(a - w) - Math.abs(b - w) || (w >= 500 ? b - a : a - b); });
  }
  function gFind(name, w, it) {
    return gHas(name).then(function (ok) {
      if (!ok) return null;
      var tries = [[w, it]].concat(nearW(w).filter(function (x) { return x !== w; }).map(function (x) { return [x, it]; }));
      if (it) tries = tries.concat(nearW(w).map(function (x) { return [x, false]; }));
      var i = 0;
      function next() {
        if (i >= tries.length) return null;
        var t = tries[i++];
        return gCss(gUrl(name, t[0], t[1], "a")).then(function (css) { return css ? { name: name, w: t[0], it: t[1] } : next(); });
      }
      return next();
    });
  }
  var _probe = {};
  function probe(fam, w, it) {
    var k = fam.toLowerCase() + "|" + w + "|" + (it ? 1 : 0);
    if (_probe[k]) return _probe[k];
    var cands = [[fam, w, it]], ps = PS_RE.exec(fam);
    if (ps) {
      var pw = styleWeight(ps[2]), pit = /italic|oblique|it$/i.test(ps[2]) || it;
      if (/^(italic|oblique|it)\s*$/i.test(ps[2])) pw = w;
      cands.push([ps[1], pw, pit], [camel(ps[1]), pw, pit]);
    }
    if (camel(fam) !== fam) cands.push([camel(fam), w, it]);
    var seen = {}, i = 0;
    cands = cands.filter(function (c) { var s = c.join("|").toLowerCase(); if (seen[s]) return false; seen[s] = 1; return true; });
    function next() { if (i >= cands.length) return null; var c = cands[i++]; return gFind(c[0], c[1], c[2]).then(function (r) { if (r) r.want = [c[1], !!c[2]]; return r || next(); }); }
    return (_probe[k] = next());
  }
  function rangeHit(range, cps) {
    if (!range) return true;
    return range.split(",").some(function (r) {
      var m = /U\+([0-9a-f?]+)(?:-([0-9a-f]+))?/i.exec(r.trim()); if (!m) return false;
      var lo = parseInt(m[1].replace(/\?/g, "0"), 16), hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, "f"), 16);
      return cps.some(function (c) { return c >= lo && c <= hi; });
    });
  }
  function googleFace(f, rep) {
    var chars = Object.keys(f.chars).join(""), cps = Array.from(chars).map(function (c) { return c.codePointAt(0); });
    var url = gUrl(f.g.name, f.g.w, f.g.it, chars.length <= 900 ? chars : "");
    return gCss(url).then(function (css) {
      if (!css) return null;
      var blocks = [], re = /@font-face\s*{([^}]*)}/gi, m;
      while ((m = re.exec(css))) {
        var s = /url\(\s*["']?([^"')]+)["']?\s*\)/i.exec(m[1]), ur = /unicode-range\s*:\s*([^;]+)/i.exec(m[1]);
        if (s && rangeHit(ur && ur[1], cps)) blocks.push({ src: s[1], range: ur && ur[1].trim() });
      }
      return Promise.all(blocks.map(function (b) {
        return get(b.src).then(fontData).then(function (fd) {
          return "@font-face{font-family:" + q(f.fam) + ";font-style:" + (f.it ? "italic" : "normal") + ";font-weight:" + f.w +
            ";font-display:block;src:url(" + fd.url + ") format(\"" + fd.fmt + "\")" + (b.range ? ";unicode-range:" + b.range : "") + "}";
        });
      })).then(function (rules) {
        rules = rules.filter(Boolean);
        if (!rules.length) return null;
        var got = f.g.name + " " + wName(f.g.w) + (f.g.it ? " Italic" : ""), want = f.g.want || [f.w, f.it];
        if (rep.fonts.indexOf(got) < 0) rep.fonts.push(got);
        if (f.g.w !== want[0] || !!f.g.it !== !!want[1]) rep.approx.push(f.g.name + " " + wName(want[0]) + (want[1] ? " Italic" : "") + " \u2192 " + wName(f.g.w) + (f.g.it ? " Italic" : ""));
        return rules.join("");
      });
    }).catch(function () { return null; });
  }

  /* ---------- fonts Google doesn't have: this computer, or a file ---------- */
  function matchLocal(list, m) {
    var want = m.fam.toLowerCase(), flat = want.replace(/[\s_-]/g, ""), best = null, score = 1e9;
    for (var i = 0; i < list.length; i++) {
      var f = list[i], ps = (f.postscriptName || "").toLowerCase(), full = (f.fullName || "").toLowerCase();
      if (ps === want || ps === flat || full === want) return f;
      var fam = (f.family || "").toLowerCase();
      if (fam !== want && fam.replace(/[\s_-]/g, "") !== flat) continue;
      var sc = Math.abs(styleWeight(f.style) - m.w) + (/italic|oblique/i.test(f.style || "") !== !!m.it ? 1000 : 0);
      if (sc < score) { score = sc; best = f; }
    }
    return best;
  }
  var _ui = Promise.resolve();
  function askFonts(miss, fileName) {
    var p = _ui.then(function () {
      return new Promise(function (done) {
        var picked = miss.map(function () { return null; }), rows = [];
        var ov = el("div", { class: "ak-ov", style: "z-index:2147483600" });
        var embedBtn = el("button", { class: "ak-btn", onclick: function () { close(picked); } }, ["Embed fonts"]);
        embedBtn.disabled = true;
        function close(v) { document.removeEventListener("keydown", onKey); ov.remove(); done(v); }
        function onKey(e) { if (e.key === "Escape") close(picked.map(function () { return null; })); }
        function set(i, fd, how) {
          picked[i] = fd; rows[i].st.textContent = "\u2713 " + how + " \u00b7 " + kb(fd.size);
          rows[i].st.style.color = "var(--text)"; embedBtn.disabled = false;
        }
        miss.forEach(function (m, i) {
          var st = el("span", { class: "v", style: "color:var(--muted)" }, ["not found"]);
          var fi = el("input", { type: "file", accept: ".woff2,.woff,.ttf,.otf,font/*", style: "display:none" });
          fi.addEventListener("change", function () { var f = fi.files[0]; if (f) fontData(f).then(function (fd) { set(i, fd, f.name); }); });
          var pick = el("button", { type: "button", class: "ak-btn ghost", style: "padding:6px 12px;font-size:.8rem", onclick: function () { fi.click(); } }, ["Choose file"]);
          rows.push({ st: st });
          rows[i].el = el("div", { class: "ak-xrow", style: "gap:10px;align-items:center;flex-wrap:wrap" }, [
            el("span", { class: "k", style: "flex:1 1 160px" }, [label(m)]), st, pick, fi]);
        });
        var localBtn = ("queryLocalFonts" in window) ? el("button", { type: "button", class: "ak-btn ghost", style: "width:100%;justify-content:center;margin-top:12px", onclick: function () {
          localBtn.disabled = true; localBtn.textContent = "Looking\u2026";
          window.queryLocalFonts().then(function (list) {
            var hits = 0;
            return Promise.all(miss.map(function (m, i) {
              if (picked[i]) return null;
              var fd = matchLocal(list, m); if (!fd) return null;
              hits++;
              return fd.blob().then(fontData).then(function (x) { set(i, x, fd.fullName || fd.postscriptName); });
            })).then(function () { localBtn.textContent = hits ? "Found " + hits + " on this computer" : "None of them are installed here"; });
          }).catch(function () { localBtn.disabled = false; localBtn.textContent = "Use fonts installed on this computer"; });
        } }, ["Use fonts installed on this computer"]) : null;
        var nm = String(fileName || "This SVG"); if (nm.length > 34) nm = nm.slice(0, 32) + "\u2026";
        ov.appendChild(el("div", { class: "ak-modal", style: "width:min(500px,100%)" }, [
          el("h3", {}, ["Embed the fonts?"]),
          el("div", { class: "sub" }, [nm + " uses " + (miss.length === 1 ? "a font" : miss.length + " fonts") + " that isn't on Google Fonts. Without it, visitors see a fallback font instead."]),
          el("div", { class: "ak-xrows", style: "margin-top:14px" }, rows.map(function (r) { return r.el; })),
          localBtn,
          el("div", { class: "ak-hint", style: "margin-top:10px" }, ["The font is stored inside the SVG, so it looks identical on every device. Only use fonts you're licensed to embed. Outlining text before export (Figma: Outline text, Illustrator: Create Outlines) also works."]),
          el("div", { class: "ak-acts" }, [el("button", { class: "ak-btn ghost", onclick: function () { close(picked.map(function () { return null; })); } }, ["Skip"]), embedBtn])
        ]));
        document.addEventListener("keydown", onKey);
        document.body.appendChild(ov);
      });
    });
    _ui = p.then(function () {}, function () {});
    return p;
  }

  function resolveFonts(groups, rep, opts) {
    if (!groups.length) return Promise.resolve("");
    var faces = {}, missing = {};
    function merge(map, k, base, chars) { var f = map[k] || (map[k] = Object.assign({ chars: {} }, base)); Object.assign(f.chars, chars); }
    return groups.reduce(function (pr, g) {
      return pr.then(function () {
        var i = 0;
        function next() {
          if (i >= g.fams.length) return null;
          var fam = g.fams[i++];
          return probe(fam, g.w, g.it).then(function (r) { return r ? { fam: fam, g: r } : next(); });
        }
        return next().then(function (r) {
          if (r) merge(faces, r.fam.toLowerCase() + "|" + g.w + "|" + (g.it ? 1 : 0), { fam: r.fam, w: g.w, it: g.it, g: r.g }, g.chars);
          else merge(missing, g.fams[0].toLowerCase() + "|" + g.w + "|" + (g.it ? 1 : 0), { fam: g.fams[0], w: g.w, it: g.it }, g.chars);
        });
      });
    }, Promise.resolve()).then(function () {
      var fk = Object.keys(faces);
      return Promise.all(fk.map(function (k) { return googleFace(faces[k], rep); })).then(function (rules) {
        fk.forEach(function (k, i) { if (!rules[i]) { var f = faces[k]; missing[k] = { fam: f.fam, w: f.w, it: f.it, chars: f.chars }; } });
        return rules.filter(Boolean);
      });
    }).then(function (rules) {
      var miss = Object.keys(missing).map(function (k) { return missing[k]; });
      if (!miss.length) return rules.join("");
      if (opts.ui === false) { miss.forEach(function (m) { rep.missing.push(label(m)); }); return rules.join(""); }
      return askFonts(miss, opts.name).then(function (picked) {
        miss.forEach(function (m, i) {
          var fd = picked[i];
          if (!fd) { rep.missing.push(label(m)); return; }
          rules.push("@font-face{font-family:" + q(m.fam) + ";font-style:" + (m.it ? "italic" : "normal") + ";font-weight:" + m.w + ";font-display:block;src:url(" + fd.url + ") format(\"" + fd.fmt + "\")}");
          rep.fonts.push(label(m));
        });
        return rules.join("");
      });
    });
  }

  function prepare(d, opts) {
    opts = opts || {};
    var rep = { fonts: [], approx: [], missing: [], images: 0, badRefs: [], sized: false };
    var src0 = svgText(d), src = fixNamespaces(src0), changed = src !== src0;
    var doc = new DOMParser().parseFromString(src, "image/svg+xml"), root = doc.documentElement;
    if (!root || root.localName !== "svg" || root.namespaceURI !== NS || doc.getElementsByTagName("parsererror").length) {
      rep.invalid = true; return Promise.resolve({ data: d, report: rep });
    }
    if (fixSize(root)) { changed = true; rep.sized = true; }
    return inlineStyles(doc, rep).then(function (c) { changed = c || changed; return inlineImages(doc, rep); })
      .then(function (c) { changed = c || changed; return resolveFonts(needFonts(root, src), rep, opts); })
      .then(function (css) {
        if (css) {
          var st = doc.createElementNS(NS, "style");
          st.setAttribute("data-ak-fonts", "");
          st.textContent = css;
          root.appendChild(st);     // last, so these @font-face rules win over any broken ones in the file
          changed = true;
        }
        return { data: changed ? toData(new XMLSerializer().serializeToString(doc)) : d, report: rep };
      });
  }

  window.AK_SVG = { prepare: prepare, text: svgText };
})();
