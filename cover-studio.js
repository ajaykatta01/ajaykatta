/* ============================================================================
   Ajay Katta Portfolio — COVER STUDIO (UI/UX standard cover)
   ----------------------------------------------------------------------------
   The one standard look for every UI/UX case-study cover (ref: owner's dp.JPG,
   28.10.2026): a multi-colour gradient led by the project's primary colour,
   logo + project name on top, a hero of 1–3 phones and/or 1–3 laptops showing
   the project's own screens, and 3–5 tilted glass labels from the case study.

   • Settings live on the item as `coverKit` (v2). kit.devices = paint order
     (last = front); each device { id, t:"phone"|"laptop", slot, scr:{ref|src,x,y,w},
     dx, dy, s (%), r (°) } sits on an automatic slot for its type/count, then the
     global Size / Spread / Height and its own offsets apply. v1 kits migrate.
   • Save bakes a 1920×1200 WebP that becomes the item's cover — the fixed file
     <slug>-cover.webp on Publish. Canvas output, so it is WebP without asking.
   • Editor: click to select; drag moves; ○ handle rotates, □ handle resizes;
     Alt-drag (or "Pan screen") pans a screen; wheel on a screen zooms it;
     [ ] change layer; Delete removes; Ctrl/Cmd Z undo.

   Exposes window.AKCoverStudio = {
     open(env)      env = { item, toWebp(canvas), fromFile(file), thumb(src),
                            onSave(url, kit), prevCover, onRestore() }
     bake(env)      -> Promise<{url, kit}>   (no UI — current kit or the standard)
     defaults(item) -> Promise<kit>
   }
============================================================================ */
(function () {
  "use strict";
  if (window.AKCoverStudio) return;

  var W = 1920, H = 1200, D = Math.sqrt(W * W + H * H);
  var PHONE_AR = 2.0, PHONE_INSET = 0.03, LAP_AR = 1.6;   // iPhone 15 Pro body 146.6×70.6 mm
  var BASE = { phone: 500, laptop: 1400 }, ANCHOR = { phone: 440, laptop: 340 }, MAXN = 3;
  var ASP = { phone: (1 - 2 * PHONE_INSET) / (PHONE_AR - 2 * PHONE_INSET), laptop: LAP_AR };
  /* automatic slots per type and count: x = centre, y = top, s = size (1 = base width) */
  var LAYOUT = {
    phone: {
      solo: [
        [{ x: 960, y: 440, s: 1 }],
        [{ x: 740, y: 520, s: 0.94 }, { x: 1180, y: 440, s: 1 }],
        [{ x: 540, y: 630, s: 0.912 }, { x: 960, y: 440, s: 1 }, { x: 1380, y: 630, s: 0.912 }]
      ],
      mix: [   // phones in front of laptops
        [{ x: 1580, y: 600, s: 0.66 }],
        [{ x: 340, y: 620, s: 0.62 }, { x: 1580, y: 600, s: 0.66 }],
        [{ x: 300, y: 640, s: 0.6 }, { x: 1620, y: 640, s: 0.6 }, { x: 960, y: 760, s: 0.62 }]
      ]
    },
    laptop: {
      solo: [
        [{ x: 960, y: 340, s: 1 }],
        [{ x: 660, y: 300, s: 0.74 }, { x: 1260, y: 470, s: 0.74 }],
        [{ x: 500, y: 330, s: 0.62 }, { x: 960, y: 420, s: 0.74 }, { x: 1420, y: 330, s: 0.62 }]
      ]
    }
  };
  var ZORD = { 1: [0], 2: [0, 1], 3: [0, 2, 1] };    // paint order of slots (back → front)
  var FRONT = { 1: [0], 2: [1, 0], 3: [1, 0, 2] };   // slots from most to least prominent

  /* ---------- the four case studies (owner's brief 28.10.2026) ----------
     screens: ref = image block id, src = fallback file, x/y/w = crop (fractions of the source)
     place: one [x, y, tilt°] per label (label centre, 1920×1200 units) — every cover has its own arrangement */
  var PRESETS = {
    jobly: {
      hero: "laptop", mono: "J",
      colors: ["#12805C", "#3FA98A", "#1C4C5A", "#04130E"],
      chips: ["AI Job Search", "Transparent Fit Scores", "Smart Ranking", "Application Tracking"],
      place: [[330, 345, -12], [1520, 150, 8], [1680, 700, 14], [300, 960, -9]],
      laptop: [{ ref: "mvp6uvnsc8wju", idx: 9, x: 0.0125, y: 0.1645, w: 0.976 }]
    },
    motocare: {
      hero: "phones", mono: "MC",
      colors: ["#2F6BFF", "#5B8EF0", "#1A2C6B", "#04060F"],
      chips: ["Nearby Mechanics", "Real-time Booking", "Live Tracking", "Roadside Support", "Puncture Repair"],
      place: [[1470, 112, 9], [1660, 440, -11], [690, 400, -15], [410, 262, 12], [250, 500, 14]],
      phones: [
        { ref: "mqxzwbuxyhwew", src: "media/ui-ux/motocare-image-15.webp", x: 0.568, y: 0.287, w: 0.306 },
        { ref: "mqxzwbuxyhwew", src: "media/ui-ux/motocare-image-15.webp", x: 0.1235, y: 0.287, w: 0.3045 },
        { ref: "mqxzwbuxyhwew", src: "media/ui-ux/motocare-image-15.webp", x: 0.568, y: 0.519, w: 0.306 }
      ]
    },
    fintrack: {
      hero: "phones", mono: "FT",
      colors: ["#7B5CF0", "#9B82F5", "#3B2391", "#07051A"],
      chips: ["Split Bill Lens", "Spending Insights", "Savings Goals", "Expense Tracking"],
      place: [[510, 118, -9], [1640, 560, 15], [290, 440, -13], [1250, 372, 10]],
      phones: [
        { ref: "mqxzp877jlp1f", src: "media/ui-ux/fintrack-image-16.webp", x: 0.383, y: 0.0545, w: 0.247 },
        { ref: "mqxzp877jlp1f", src: "media/ui-ux/fintrack-image-16.webp", x: 0.092, y: 0.0545, w: 0.246 },
        { ref: "mqxzp877jlp1f", src: "media/ui-ux/fintrack-image-16.webp", x: 0.674, y: 0.3705, w: 0.249 }
      ]
    },
    coinwave: {
      hero: "phones", mono: "CW",
      colors: ["#14D8C4", "#1E7BFF", "#6A45F5", "#02040A"],
      chips: ["Live Markets", "Buy · Sell · Swap", "Price Alerts", "Secure Wallet", "Face ID Login"],
      place: [[540, 300, -8], [1690, 500, 12], [260, 490, 16], [1420, 108, -12], [1255, 440, -18]],
      phones: [
        { ref: "mqxzt3b4pt3vu", src: "media/ui-ux/coinwave-image-21.webp", x: 0.386, y: 0.449, w: 0.0995 },
        { ref: "mqxzt3b4pt3vu", src: "media/ui-ux/coinwave-image-21.webp", x: 0.128, y: 0.449, w: 0.0995 },
        { ref: "mqxzt3b4pt3vu", src: "media/ui-ux/coinwave-image-21.webp", x: 0.773, y: 0.449, w: 0.0995 }
      ]
    }
  };

  /* ---------- small helpers ---------- */
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function key(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, ""); }
  function uid() { return Math.random().toString(36).slice(2, 9); }
  function presetFor(item) {
    var s = key(item && item.title);
    for (var k in PRESETS) if (s === k || s.indexOf(k) === 0) return PRESETS[k];
    return null;
  }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function hexRgb(h) {
    h = String(h || "").replace("#", "");
    if (h.length === 3) h = h.split("").map(function (c) { return c + c; }).join("");
    var n = parseInt(h, 16); if (isNaN(n)) n = 0;
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function rgbHex(c) { return "#" + c.map(function (v) { v = clamp(Math.round(v), 0, 255).toString(16); return v.length < 2 ? "0" + v : v; }).join(""); }
  function mix(a, b, t) { var A = hexRgb(a), B = hexRgb(b); return rgbHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]); }
  function rgba(h, a) { var c = hexRgb(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function lum(h) {
    var c = hexRgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function toHsl(hex) {
    var c = hexRgb(hex), r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
    if (mx !== mn) {
      var d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60;
    }
    return [h, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    if (!s) return rgbHex([l * 255, l * 255, l * 255]);
    var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    return rgbHex([f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]);
  }
  function paletteFrom(p) {
    var h = toHsl(p);
    return [p, fromHsl(h[0] + 30, Math.min(1, h[1] * 0.9), clamp(h[2] + 0.08, 0.35, 0.6)),
      fromHsl(h[0] - 25, Math.min(1, h[1] * 0.75), 0.22), fromHsl(h[0], 0.45, 0.035)];
  }
  function mono(t) {
    t = String(t || "").trim();
    var caps = t.replace(/[^A-Z]/g, "");
    if (caps.length >= 2) return caps.slice(0, 2);
    var w = t.split(/\s+/).filter(Boolean);
    if (w.length >= 2) return (w[0][0] + w[1][0]).toUpperCase();
    return (t[0] || "A").toUpperCase();
  }
  function imgBlocks(item) { return ((item && item.blocks) || []).filter(function (b) { return b && b.type === "image" && b.src; }); }
  function srcOf(slot, item) {
    if (!slot) return "";
    var bl = imgBlocks(item);
    if (slot.ref) for (var i = 0; i < bl.length; i++) if (bl[i].id === slot.ref) return bl[i].src;
    if (slot.src) return slot.src;
    if (slot.idx != null && bl[slot.idx]) return bl[slot.idx].src;
    return "";
  }

  /* ---------- loading ---------- */
  var _img = {};
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (_img[src]) return _img[src];
    _img[src] = new Promise(function (res) {
      var im = new Image(); im.decoding = "async";
      im.onload = function () { res(im); }; im.onerror = function () { delete _img[src]; res(null); };
      im.src = src;
    });
    return _img[src];
  }
  var _fonts = null;
  function fonts() {
    if (_fonts) return _fonts;
    var f = document.fonts;
    _fonts = !f || !f.load ? Promise.resolve() : Promise.all(["700 120px Inter", "800 60px Inter", "500 34px Inter", "700 120px 'Space Grotesk'"].map(function (s) {
      return f.load(s)["catch"](function () {});
    }))["catch"](function () {});
    return _fonts;
  }
  var FILTER_OK = (function () { try { var x = document.createElement("canvas").getContext("2d"); if (typeof x.filter !== "string") return false; x.filter = "blur(2px)"; return x.filter === "blur(2px)"; } catch (e) { return false; } })();
  var _noise = null;
  function noise() {
    if (_noise) return _noise;
    var c = document.createElement("canvas"); c.width = c.height = 256;
    var x = c.getContext("2d"), d = x.createImageData(256, 256);
    for (var i = 0; i < d.data.length; i += 4) { var v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); _noise = c; return c;
  }

  /* ---------- the kit ---------- */
  function baseKit(item) {
    return {
      v: 2,
      colors: ["#FF6B5C", "#E85949", "#5A1E17", "#0A0505"],
      bg: "mesh", angle: 135, flip: false, glow: 30, grain: 20, depth: 45,
      title: (item && item.title) || "", font: "Inter", titleSize: 100, titleY: 0,
      logo: { mode: "mono", text: mono(item && item.title), src: "" },
      devices: [], frame: "dark", dev: { scale: 100, y: 0, spread: 100 },
      chips: [],
      glass: { tone: "dark", tint: 45, blur: 24, size: 100 }
    };
  }
  function chip(t) { return { t: t, x: null, y: null, r: null, s: 100 }; }
  function mkDev(t, slot, scr) { return { id: uid(), t: t, slot: slot, scr: clone(scr) || {}, dx: 0, dy: 0, s: 100, r: 0 }; }
  function count(k, t) { var n = 0; k.devices.forEach(function (d) { if (d.t === t) n++; }); return n; }
  function isMix(k) { return count(k, "phone") > 0 && count(k, "laptop") > 0; }
  function sig(k) { var l = count(k, "laptop"), p = count(k, "phone"); return (l ? "l" + l : "") + (p ? "p" + p : ""); }
  function devById(k, id) { for (var i = 0; i < k.devices.length; i++) if (k.devices[i].id === id) return k.devices[i]; return null; }
  function zrank(k, d) {
    var n = clamp(count(k, d.t), 1, MAXN), z = d.t === "phone" && isMix(k) ? [0, 1, 2] : ZORD[n];
    var i = z.indexOf(d.slot); return (d.t === "laptop" ? 0 : 10) + (i < 0 ? d.slot : i);
  }
  function restack(k) { k.devices.sort(function (a, b) { return zrank(k, a) - zrank(k, b); }); }
  function fixSlots(k) {
    ["phone", "laptop"].forEach(function (t) {
      var mine = k.devices.filter(function (d) { return d.t === t; });
      if (mine.length > MAXN) { var drop = mine.slice(MAXN); k.devices = k.devices.filter(function (d) { return drop.indexOf(d) < 0; }); mine = mine.slice(0, MAXN); }
      var n = mine.length, seen = {};
      var bad = mine.some(function (d) { var s = d.slot; if (typeof s !== "number" || s < 0 || s >= n || seen[s]) return true; seen[s] = 1; return false; });
      if (bad) mine.forEach(function (d, j) { d.slot = FRONT[n][j]; });
    });
  }
  function migrate(k) {   // v1: hero + screens.{phones[3],laptop[1]} + device.{frame,scale,y}
    var sc = k.screens || {}, dv = k.device || {}, p = sc.phones || [];
    k.devices = k.hero === "laptop" ? [mkDev("laptop", 0, (sc.laptop || [])[0])] : [mkDev("phone", 0, p[0]), mkDev("phone", 2, p[2]), mkDev("phone", 1, p[1])];
    k.frame = dv.frame || "dark";
    k.dev = { scale: dv.scale != null ? dv.scale : 100, y: dv.y || 0, spread: 100 };
    if (k.layout && k.layout.hero) k.layout = { sig: k.layout.hero === "laptop" ? "l1" : "p3", pts: k.layout.pts };
    delete k.screens; delete k.device; delete k.hero; k.v = 2;
  }
  function normalize(k, item) {
    var b = baseKit(item);
    if (!Array.isArray(k.devices)) migrate(k);
    Object.keys(b).forEach(function (p) { if (k[p] == null) k[p] = b[p]; });
    ["logo", "glass", "dev"].forEach(function (p) { Object.keys(b[p]).forEach(function (q) { if (k[p][q] == null) k[p][q] = b[p][q]; }); });
    k.devices = k.devices.filter(function (d) { return d && (d.t === "phone" || d.t === "laptop"); });
    if (!k.devices.length) k.devices = [mkDev("phone", 0, {})];
    k.devices.forEach(function (d) {
      if (!d.id) d.id = uid(); if (!d.scr) d.scr = {};
      if (d.dx == null) d.dx = 0; if (d.dy == null) d.dy = 0; if (d.r == null) d.r = 0; if (d.s == null) d.s = 100;
    });
    fixSlots(k);
    if (!k.colors || k.colors.length < 2) k.colors = b.colors;
    k.chips = (k.chips || []).map(function (c) { if (c.s == null) c.s = 100; return c; });
    /* undo of the 28.10 label-size / float experiment: kits it touched (fv) go back to the preset placement at 100% */
    var pr = (k.fv || k.sz) && presetFor(item);
    if (pr) {
      var ps = pr.hero === "laptop" ? "l1" : "p3";
      if (pr.place && sig(k) === ps) k.layout = { sig: ps, pts: clone(pr.place) };
      k.chips.forEach(function (c, i) { if (c.t === pr.chips[i] && c.x == null) { c.r = null; c.s = 100; } });
    }
    delete k.fv; delete k.sz;
    return k;
  }
  function genericChips(item) {
    var m = (item && item.meta) || {}, out = [];
    String(m.focus || "").split(/\s*[·|\/,]\s*|\s+\.\s+|\s*\.\s*(?=[A-Z])|\s{2,}|\s*→\s*/).forEach(function (s) { s = s.replace(/\.$/, "").trim(); if (s && s.length < 28 && out.indexOf(s) < 0) out.push(s); });
    ["UX Research", "UI Design", "Prototyping", "Design System"].forEach(function (s) { if (out.length < 3 && out.indexOf(s) < 0) out.push(s); });
    return out.slice(0, 4);
  }
  function extractPrimary(img) {
    try {
      var c = document.createElement("canvas"); c.width = c.height = 48;
      var x = c.getContext("2d"); x.drawImage(img, 0, 0, 48, 48);
      var d = x.getImageData(0, 0, 48, 48).data, B = [];
      for (var i = 0; i < d.length; i += 4) {
        var hex = rgbHex([d[i], d[i + 1], d[i + 2]]), hsl = toHsl(hex);
        if (hsl[1] < 0.35 || hsl[2] < 0.18 || hsl[2] > 0.82) continue;
        var bi = Math.floor(hsl[0] / 15) % 24, wt = hsl[1] * (1 - Math.abs(hsl[2] - 0.5) * 1.2);
        B[bi] = B[bi] || { w: 0, r: 0, g: 0, b: 0 }; B[bi].w += wt; B[bi].r += d[i] * wt; B[bi].g += d[i + 1] * wt; B[bi].b += d[i + 2] * wt;
      }
      var best = null; B.forEach(function (b) { if (b && (!best || b.w > best.w)) best = b; });
      if (best && best.w > 4) return rgbHex([best.r / best.w, best.g / best.w, best.b / best.w]);
    } catch (e) {}
    return null;
  }
  function threePhones(p) { return [mkDev("phone", 0, p[0]), mkDev("phone", 2, p[2]), mkDev("phone", 1, p[1])]; }
  function defaults(item) {
    var k = baseKit(item), p = presetFor(item), bl = imgBlocks(item);
    var auto = function (i) { var b = bl[i] || bl[0]; return b ? { ref: b.id } : {}; };
    if (p) {
      k.colors = p.colors.slice(); k.logo.text = p.mono || k.logo.text;
      k.chips = p.chips.map(chip);
      k.devices = p.hero === "laptop" ? [mkDev("laptop", 0, p.laptop[0])] : threePhones(p.phones);
      if (p.place) k.layout = { sig: sig(k), pts: clone(p.place) };
      return Promise.resolve(k);
    }
    var plat = String(((item && item.meta) || {}).platform || "");
    var phones = /ios|android|mobile|app/i.test(plat) || !plat;
    k.devices = phones ? threePhones([auto(1), auto(0), auto(2)]) : [mkDev("laptop", 0, auto(0))];
    k.chips = genericChips(item).map(chip);
    return loadImg((item && item.cover) || (bl[0] && bl[0].src)).then(function (im) {
      var c = im && extractPrimary(im); if (c) k.colors = paletteFrom(c);
      return k;
    });
  }
  /* change how many devices of one type are on the cover — the most prominent screens are kept */
  function setCount(k, t, n, item) {
    n = clamp(n, 0, MAXN);
    var mine = k.devices.filter(function (d) { return d.t === t; }), others = k.devices.filter(function (d) { return d.t !== t; });
    if (n === mine.length || (!n && !others.length)) return false;
    var pri = FRONT[mine.length] || [];
    mine.sort(function (a, b) { return pri.indexOf(a.slot) - pri.indexOf(b.slot); });
    var used = k.devices.map(function (d) { return d.scr && d.scr.ref; }), bl = imgBlocks(item), next = [];
    for (var j = 0; j < n; j++) {
      var old = mine[j], scr;
      if (old) scr = old.scr;
      else {
        var fresh = bl.filter(function (b) { return used.indexOf(b.id) < 0; })[0] || bl[j % Math.max(1, bl.length)];
        scr = fresh ? { ref: fresh.id } : {}; if (fresh) used.push(fresh.id);
      }
      var nd = mkDev(t, FRONT[n][j], scr); if (old) nd.id = old.id; next.push(nd);
    }
    k.devices = others.concat(next); restack(k);
    return true;
  }
  function slotOf(k, d) {
    var n = clamp(count(k, d.t), 1, MAXN), tab = LAYOUT[d.t][d.t === "phone" && isMix(k) ? "mix" : "solo"][n - 1];
    return tab[clamp(d.slot || 0, 0, tab.length - 1)];
  }
  function lapDims(lw) { var bz = lw * 0.017, bt = lw * 0.021, sw = lw - 2 * bz, sh = sw / LAP_AR; return { bz: bz, bt: bt, sw: sw, sh: sh, h: sh + bt + bz * 1.6 }; }
  function geom(k, d) {
    var sl = slotOf(k, d), g = k.dev, S = g.scale / 100, A = ANCHOR[d.t];
    var w = BASE[d.t] * sl.s * S * d.s / 100, h = d.t === "phone" ? w * PHONE_AR : lapDims(w).h;
    var cx = 960 + (sl.x - 960) * S * g.spread / 100 + d.dx, top = A + (sl.y - A) * S + g.y + d.dy;
    return { t: d.t, x: cx - w / 2, y: top, w: w, h: h, cx: cx, cy: top + h / 2, r: d.r || 0 };
  }

  /* ---------- drawing ---------- */
  function rr(x, X, Y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }
  var ANCH = {
    2: [[0, 0, 0.95], [1, 0.75, 0.6]],
    3: [[0, 0, 0.7], [0.1, 1, 0.55], [1, 0.45, 0.6]],
    4: [[0, 0, 0.62], [0.44, 0.06, 0.4], [0.1, 1, 0.52], [1, 0.5, 0.58]],
    5: [[0, 0, 0.62], [0.44, 0.06, 0.4], [0.1, 1, 0.52], [0.7, 1.05, 0.4], [1, 0.45, 0.55]]
  };
  function blob(x, col, ax, ay, r, a) {
    var cx = ax * W, cy = ay * H, R = r * D, g = x.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(0.4, rgba(col, a * 0.78)); g.addColorStop(0.75, rgba(col, a * 0.28)); g.addColorStop(1, rgba(col, 0));
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  }
  function drawBg(x, k, cv) {
    var cs = k.colors, n = cs.length, last = cs[n - 1];
    x.fillStyle = last; x.fillRect(0, 0, W, H);
    if (k.bg === "linear") {
      var a = (k.flip ? 180 - k.angle : k.angle) * Math.PI / 180, dx = Math.cos(a), dy = Math.sin(a);
      var L = Math.abs(W * dx) / 2 + Math.abs(H * dy) / 2;
      var g = x.createLinearGradient(W / 2 - dx * L, H / 2 - dy * L, W / 2 + dx * L, H / 2 + dy * L);
      cs.forEach(function (c, i) { g.addColorStop(i / (n - 1), c); });
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    } else {
      var A = ANCH[Math.min(5, n)];
      var at = function (i) { var p = A[Math.min(i, A.length - 1)]; return [k.flip ? 1 - p[0] : p[0], p[1], p[2]]; };
      for (var i = n - 2; i >= 0; i--) { var p = at(i); blob(x, cs[i], p[0], p[1], p[2], 1); }
      var q = at(n - 1); blob(x, last, q[0], q[1], q[2], 0.95);
    }
    if (k.glow) {
      var gg = x.createRadialGradient(W / 2, 150, 0, W / 2, 150, 900);
      gg.addColorStop(0, "rgba(255,255,255," + (k.glow / 100 * 0.28).toFixed(3) + ")"); gg.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = gg; x.fillRect(0, 0, W, H);
    }
    if (k.depth) {
      var v = x.createRadialGradient(W * 0.5, H * 0.42, H * 0.25, W * 0.5, H * 0.5, D * 0.62);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0," + (k.depth / 100 * 0.75).toFixed(3) + ")");
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    }
    if (k.grain) {
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalAlpha = k.grain / 100 * 0.5; x.globalCompositeOperation = "overlay";
      x.fillStyle = x.createPattern(noise(), "repeat"); x.fillRect(0, 0, cv.width, cv.height);
      x.restore();
    }
  }
  function cropOf(img, slot, aspect) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (slot && slot.x != null && slot.w) return { x: slot.x, y: slot.y || 0, w: slot.w };
    var w = Math.min(1, ih * aspect / iw);
    return { x: (1 - w) / 2, y: 0, w: w };
  }
  function drawCrop(x, img, slot, dx, dy, dw, dh) {
    var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, c = cropOf(img, slot, dw / dh);
    var sx = c.x * iw, sy = c.y * ih, sw = c.w * iw, sh = sw * dh / dw, k = dw / sw;
    var x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(iw, sx + sw), y1 = Math.min(ih, sy + sh);
    if (x1 > x0 && y1 > y0) x.drawImage(img, x0, y0, x1 - x0, y1 - y0, dx + (x0 - sx) * k, dy + (y0 - sy) * k, (x1 - x0) * k, (y1 - y0) * k);
  }
  function placeholder(x, X, Y, w, h, k) {
    var g = x.createLinearGradient(X, Y, X, Y + h);
    g.addColorStop(0, mix(k.colors[0], "#ffffff", 0.82)); g.addColorStop(1, mix(k.colors[0], "#ffffff", 0.6));
    x.fillStyle = g; x.fillRect(X, Y, w, h);
    x.fillStyle = rgba(k.colors[0], 0.7); x.font = "600 " + Math.round(w * 0.06) + "px Inter, sans-serif";
    x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("Choose a screen", X + w / 2, Y + Math.min(h / 2, w * 0.9));
  }
  function sheen(x, X, Y, w, h) {
    var g = x.createLinearGradient(X, Y, X + w, Y + h * 0.6);
    g.addColorStop(0, "rgba(255,255,255,.09)"); g.addColorStop(0.35, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(X, Y, w, h);
  }
  function phone(x, P, k, img, slot, S) {
    var w = P.w, h = w * PHONE_AR, r = w * 0.16, X = P.x, Y = P.y, u = w / 400, light = k.frame === "light", f = Math.max(0.45, w / 500);
    x.save(); x.shadowColor = "rgba(0,0,0,.55)"; x.shadowBlur = 90 * S * f; x.shadowOffsetY = 40 * S * f;
    rr(x, X, Y, w, h, r); x.fillStyle = light ? "#c9ccd2" : "#232428"; x.fill(); x.restore();
    var g = x.createLinearGradient(X, 0, X + w, 0);
    (light ? ["#f4f5f7", "#c9ccd3", "#b9bcc4", "#c9ccd3", "#f4f5f7"] : ["#4a4b52", "#2a2b30", "#1b1c20", "#2a2b30", "#4a4b52"])
      .forEach(function (c, j) { g.addColorStop([0, 0.06, 0.5, 0.94, 1][j], c); });
    rr(x, X, Y, w, h, r); x.fillStyle = g; x.fill();
    x.fillStyle = light ? "#aeb2ba" : "#2c2d32";
    rr(x, X - 3.5 * u, Y + h * 0.19, 5 * u, h * 0.045, 2 * u); x.fill();
    rr(x, X - 3.5 * u, Y + h * 0.26, 5 * u, h * 0.08, 2 * u); x.fill();
    rr(x, X - 3.5 * u, Y + h * 0.36, 5 * u, h * 0.08, 2 * u); x.fill();
    rr(x, X + w - 1.5 * u, Y + h * 0.29, 5 * u, h * 0.12, 2 * u); x.fill();
    x.lineWidth = Math.max(1, 2 * u); x.strokeStyle = light ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.16)";
    rr(x, X + 1, Y + 1, w - 2, h - 2, r - 1); x.stroke();
    var b1 = w * 0.013; rr(x, X + b1, Y + b1, w - 2 * b1, h - 2 * b1, r - b1); x.fillStyle = "#050506"; x.fill();
    var b2 = w * PHONE_INSET, sx = X + b2, sy = Y + b2, sw = w - 2 * b2, sh = h - 2 * b2;
    x.save(); rr(x, sx, sy, sw, sh, r - b2); x.clip();
    x.fillStyle = "#0d0e12"; x.fillRect(sx, sy, sw, sh);
    if (img) drawCrop(x, img, slot, sx, sy, sw, sh); else placeholder(x, sx, sy, sw, sh, k);
    sheen(x, sx, sy, sw, sh);
    x.restore();
    var iw = w * 0.28, ih = w * 0.08; rr(x, X + w / 2 - iw / 2, sy + w * 0.032, iw, ih, ih / 2); x.fillStyle = "#000"; x.fill();
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  }
  function laptop(x, P, k, img, slot, S) {
    /* display only — no keyboard deck — zoomed so the screen reads (owner, 28.10.2026) */
    var lw = P.w, X = P.x, top = P.y, light = k.frame === "light", L = lapDims(lw), f = Math.max(0.45, lw / 1400);
    var bz = L.bz, bt = L.bt, sw = L.sw, sh = L.sh, lh = L.h, r = lw * 0.022;
    x.save(); x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 100 * S * f; x.shadowOffsetY = 44 * S * f;
    rr(x, X, top, lw, lh, r); x.fillStyle = light ? "#c9ccd2" : "#1d1e22"; x.fill(); x.restore();
    var g = x.createLinearGradient(0, top, 0, top + lh);
    g.addColorStop(0, light ? "#e6e8ec" : "#2e2f34"); g.addColorStop(1, light ? "#b6bac1" : "#16171a");
    rr(x, X, top, lw, lh, r); x.fillStyle = g; x.fill();
    x.lineWidth = Math.max(1, 2 * f); x.strokeStyle = light ? "rgba(255,255,255,.85)" : "rgba(255,255,255,.14)"; rr(x, X + 1, top + 1, lw - 2, lh - 2, r - 1); x.stroke();
    var gi = lw * 0.005; rr(x, X + gi, top + gi, lw - 2 * gi, lh - 2 * gi, r - gi); x.fillStyle = "#050506"; x.fill();
    var sx = X + bz, sy = top + bt;
    x.save(); rr(x, sx, sy, sw, sh, lw * 0.004); x.clip();
    x.fillStyle = "#0d0e12"; x.fillRect(sx, sy, sw, sh);
    if (img) drawCrop(x, img, slot, sx, sy, sw, sh); else placeholder(x, sx, sy, sw, sh, k);
    sheen(x, sx, sy, sw, sh);
    x.restore();
    var mx = X + lw / 2;
    x.beginPath(); x.arc(mx, top + bt / 2, lw * 0.003, 0, Math.PI * 2); x.fillStyle = "#1d1e22"; x.fill();
    x.beginPath(); x.arc(mx, top + bt / 2, lw * 0.0013, 0, Math.PI * 2); x.fillStyle = "#33405a"; x.fill();
    return { sx: sx, sy: sy, sw: sw, sh: sh };
  }
  function drawDevices(x, k, res, S, hits) {
    return k.devices.map(function (d) {
      var g = geom(k, d), img = res.imgs[d.id];
      x.save();
      if (g.r) { x.translate(g.cx, g.cy); x.rotate(g.r * Math.PI / 180); x.translate(-g.cx, -g.cy); }
      var s = d.t === "laptop" ? laptop(x, g, k, img, d.scr, S) : phone(x, g, k, img, d.scr, S);
      x.restore();
      hits.push({ type: "dev", id: d.id, t: d.t, x: g.x, y: g.y, w: g.w, h: g.h, cx: g.cx, cy: g.cy, r: g.r, s: s });
      return g;
    });
  }
  function setLS(x, v) { try { x.letterSpacing = v; } catch (e) {} }
  function drawTitle(x, k, res, S, hits) {
    var fs = 128 * k.titleSize / 100, base = 236 + k.titleY;
    var fam = k.font === "Space Grotesk" ? "'Space Grotesk', Inter, sans-serif" : "Inter, sans-serif";
    x.font = "700 " + fs + "px " + fam; setLS(x, (-0.025 * fs).toFixed(1) + "px");
    var txt = k.title || "", tw = txt ? x.measureText(txt).width : 0;
    var lg = k.logo, box = fs * 0.86, lw = 0, lim = res.logo;
    if (lg.mode === "mono" && lg.text) lw = box;
    else if (lg.mode === "image" && lim) lw = Math.min(box * 3, box * lim.naturalWidth / lim.naturalHeight);
    var gap = lw && tw ? fs * 0.2 : 0, total = lw + gap + tw, x0 = 960 - total / 2, cy = base - fs * 0.36;
    if (lw && lg.mode === "mono") {
      x.save(); x.shadowColor = "rgba(0,0,0,.28)"; x.shadowBlur = 30 * S; x.shadowOffsetY = 8 * S;
      rr(x, x0, cy - box / 2, box, box, box * 0.24); x.fillStyle = "#fff"; x.fill(); x.restore();
      var p = k.colors[0], ink = lum(p) > 0.3 ? mix(p, k.colors[k.colors.length - 1], 0.45) : p;
      x.save(); x.fillStyle = ink; x.textAlign = "center"; x.textBaseline = "middle";
      x.font = "800 " + (box * (lg.text.length > 1 ? 0.44 : 0.58)) + "px " + fam; setLS(x, (-0.02 * box).toFixed(1) + "px");
      x.fillText(lg.text.slice(0, 3), x0 + box / 2, cy + box * 0.03); x.restore();
      x.font = "700 " + fs + "px " + fam; setLS(x, (-0.025 * fs).toFixed(1) + "px");
    } else if (lw && lim) {
      var lh = lw * lim.naturalHeight / lim.naturalWidth;
      x.save(); x.shadowColor = "rgba(0,0,0,.25)"; x.shadowBlur = 24 * S; x.drawImage(lim, x0, cy - lh / 2, lw, lh); x.restore();
    }
    if (txt) {
      x.save(); x.fillStyle = "#fff"; x.textAlign = "left"; x.textBaseline = "alphabetic";
      x.shadowColor = "rgba(0,0,0,.3)"; x.shadowBlur = 34 * S; x.shadowOffsetY = 6 * S;
      x.fillText(txt, x0 + lw + gap, base); x.restore();
    }
    setLS(x, "0px");
    hits.push({ type: "title", x: x0, y: cy - fs * 0.55, w: total, h: fs * 1.1, cx: x0 + total / 2, cy: cy, r: 0 });
    return { x0: x0, x1: x0 + total, cy: cy, fs: fs };
  }
  /* label slots, in fill order: 3 labels → first 3, 4 → first 4, 5 → all.
     ax: 1 = x is the label's right edge, -1 = its left edge (so the title-side labels only kiss the name) */
  function chipSlots(k, gs, tb) {
    if (k.layout && k.layout.sig === sig(k) && k.layout.pts && k.layout.pts.length) return k.layout.pts.map(function (p) { return { x: p[0], y: p[1], r: p[2] }; });
    var A = { x: tb.x0 + tb.fs * 0.06, y: tb.cy - tb.fs * 0.08, r: 12, ax: 1 }, B = { x: tb.x1 - tb.fs * 0.04, y: tb.cy - tb.fs * 0.46, r: -11, ax: -1 };
    if (!gs.length) return [A, B];
    if (gs.length === 1 && gs[0].t === "laptop") {
      var L = gs[0];
      return [A, { x: L.x + L.w, y: L.y + L.h * 0.22, r: 15 }, { x: L.x, y: L.y + L.h * 0.36, r: -13 }, B, { x: L.x + L.w * 0.86, y: L.y + L.h * 0.95, r: -8 }];
    }
    /* labels rest on the outer edges of the outermost devices (ax keeps them off the screens) */
    var xs = gs.slice().sort(function (a, b) { return a.cx - b.cx; }), Lg = xs[0], Rg = xs[xs.length - 1], R = Rg.x + Rg.w;
    return [A,
      { x: R - Rg.w * 0.12, y: Rg.y + 70, r: 14, ax: -1 },
      { x: Lg.x + Lg.w * 0.12, y: Lg.y + 210, r: -12, ax: 1 },
      B,
      { x: R - Rg.w * 0.08, y: Rg.y + Math.min(Rg.h * 0.45, 400), r: -9, ax: -1 }];
  }
  function blurCopy(src, px) {
    var b = document.createElement("canvas"); b.width = src.width; b.height = src.height;
    var x = b.getContext("2d");
    if (FILTER_OK) { x.filter = "blur(" + Math.max(0.5, px).toFixed(1) + "px)"; x.drawImage(src, 0, 0); x.filter = "none"; return b; }
    var f = Math.max(2, Math.round(px / 2)), s = document.createElement("canvas");
    s.width = Math.max(1, Math.round(src.width / f)); s.height = Math.max(1, Math.round(src.height / f));
    var sx = s.getContext("2d"); sx.imageSmoothingQuality = "high"; sx.drawImage(src, 0, 0, s.width, s.height);
    x.imageSmoothingQuality = "high"; x.drawImage(s, 0, 0, b.width, b.height);
    return b;
  }
  function chipBox(x, k, c) {
    var z = k.glass.size / 100 * (c.s || 100) / 100, fs = 42 * z;
    x.font = "500 " + fs + "px Inter, sans-serif"; setLS(x, "0px");
    var tw = x.measureText(c.t || " ").width;
    return { fs: fs, w: tw + 72 * z, h: fs * 1.18 + 46 * z, rad: 20 * z, z: z };
  }
  function drawChip(x, k, c, i, slots, snap, bl, S, hits) {
    if (!c.t) return;
    var b = chipBox(x, k, c), s = slots[i] || slots[slots.length - 1], w = b.w, h = b.h;
    var cx = c.x != null ? c.x : clamp(s.x - (s.ax || 0) * w / 2, w / 2 + 12, W - w / 2 - 12);
    var cy = c.y != null ? c.y : clamp(s.y, h / 2 + 12, H - h / 2 - 12), r = c.r != null ? c.r : s.r;
    x.save(); x.translate(cx, cy); x.rotate(r * Math.PI / 180);
    x.save(); x.shadowColor = "rgba(0,0,0,.38)"; x.shadowBlur = 44 * S * b.z; x.shadowOffsetY = 18 * S * b.z;
    rr(x, -w / 2, -h / 2, w, h, b.rad); x.fillStyle = "rgba(0,0,0,.22)"; x.fill(); x.restore();
    x.save(); rr(x, -w / 2, -h / 2, w, h, b.rad); x.clip();
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(snap, 0, 0); x.drawImage(bl, 0, 0); x.restore();
    x.fillStyle = k.glass.tone === "light" ? "rgba(255,255,255,.16)" : "rgba(14,17,24,.30)"; x.fillRect(-w / 2, -h / 2, w, h);
    x.fillStyle = rgba(k.colors[0], (0.05 + 0.3 * k.glass.tint / 100).toFixed(3)); x.fillRect(-w / 2, -h / 2, w, h);
    var sh = x.createLinearGradient(0, -h / 2, 0, h / 2);
    sh.addColorStop(0, "rgba(255,255,255,.2)"); sh.addColorStop(0.5, "rgba(255,255,255,.04)"); sh.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = sh; x.fillRect(-w / 2, -h / 2, w, h);
    x.restore();
    var bg = x.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    bg.addColorStop(0, "rgba(255,255,255,.62)"); bg.addColorStop(0.5, "rgba(255,255,255,.16)"); bg.addColorStop(1, "rgba(255,255,255,.34)");
    rr(x, -w / 2 + 0.75, -h / 2 + 0.75, w - 1.5, h - 1.5, b.rad); x.strokeStyle = bg; x.lineWidth = 1.6 * b.z; x.stroke();
    x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle";
    x.shadowColor = "rgba(0,0,0,.28)"; x.shadowBlur = 6 * S;
    x.font = "500 " + b.fs + "px Inter, sans-serif"; x.fillText(c.t, 0, b.fs * 0.04);
    x.restore();
    hits.push({ type: "chip", i: i, x: cx - w / 2, y: cy - h / 2, w: w, h: h, cx: cx, cy: cy, r: r });
  }

  /* ---------- selection geometry (shared by the overlay and the editor) ---------- */
  function selOf(h) { return h.type === "dev" ? { type: "dev", id: h.id } : h.type === "chip" ? { type: "chip", i: h.i } : { type: "title" }; }
  function sameSel(a, b) { return !!a && !!b && a.type === b.type && a.id === b.id && a.i === b.i; }
  function findHit(hits, s) { if (!s) return null; for (var i = 0; i < hits.length; i++) if (sameSel(selOf(hits[i]), s)) return hits[i]; return null; }
  function local(h, p) {
    if (!h.r) return p;
    var a = -h.r * Math.PI / 180, dx = p.x - h.cx, dy = p.y - h.cy;
    return { x: h.cx + dx * Math.cos(a) - dy * Math.sin(a), y: h.cy + dx * Math.sin(a) + dy * Math.cos(a) };
  }
  function inHit(h, p, pad) { var q = local(h, p); return q.x >= h.x - pad && q.x <= h.x + h.w + pad && q.y >= h.y - pad && q.y <= h.y + h.h + pad; }
  function handlePts(h, u) {
    var pad = (h.type === "chip" ? 8 : 6) * u, a = h.r * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), w2 = h.w / 2 + pad, h2 = h.h / 2 + pad;
    function wp(lx, ly) { return { x: h.cx + lx * co - ly * si, y: h.cy + lx * si + ly * co }; }
    return { pad: pad, stem: wp(0, -h2), rot: wp(0, -h2 - 26 * u), scl: wp(w2, -h2) };
  }
  function outline(x, h, col, lw, dash, pad) {
    x.save(); x.translate(h.cx, h.cy); x.rotate(h.r * Math.PI / 180);
    x.strokeStyle = col; x.lineWidth = lw; if (dash) x.setLineDash(dash);
    var w2 = h.w / 2 + pad, h2 = h.h / 2 + pad;
    if (h.type === "chip") rr(x, -w2, -h2, w2 * 2, h2 * 2, Math.min(h2, 24)); else { x.beginPath(); x.rect(-w2, -h2, w2 * 2, h2 * 2); }
    x.stroke(); x.restore();
  }
  function overlay(x, ed, hits) {
    var u = ed.u || 1, GOLD = "#E3B04B";
    if (ed.guides) {
      x.save(); x.setLineDash([10 * u, 8 * u]); x.lineWidth = 1.5 * u; x.strokeStyle = "rgba(255,255,255,.45)";
      x.beginPath(); x.moveTo(0, 60); x.lineTo(W, 60); x.moveTo(0, 1140); x.lineTo(W, 1140); x.moveTo(60, 0); x.lineTo(60, H); x.moveTo(1860, 0); x.lineTo(1860, H); x.stroke();
      x.setLineDash([]); x.fillStyle = "rgba(255,255,255,.7)"; x.font = "600 " + Math.round(11 * u) + "px Inter, sans-serif"; x.textAlign = "left"; x.textBaseline = "top";
      x.fillText("16:9 crop", 10 * u, 60 + 6 * u); x.fillText("3:2 crop", 60 + 8 * u, H - 20 * u);
      x.restore();
    }
    if (ed.snap) {
      x.save(); x.strokeStyle = GOLD; x.lineWidth = 1.5 * u; x.setLineDash([6 * u, 5 * u]);
      x.beginPath(); x.moveTo(960, 0); x.lineTo(960, H); x.stroke(); x.restore();
    }
    if (ed.hover && !sameSel(ed.hover, ed.sel)) { var hv = findHit(hits, ed.hover); if (hv) outline(x, hv, "rgba(255,255,255,.55)", 1.5 * u, null, (hv.type === "chip" ? 8 : 6) * u); }
    var h = findHit(hits, ed.sel); if (!h) return;
    var hp = handlePts(h, u);
    outline(x, h, GOLD, 2 * u, [7 * u, 5 * u], hp.pad);
    if (h.type === "title") return;
    x.save();
    x.strokeStyle = GOLD; x.lineWidth = 1.5 * u; x.beginPath(); x.moveTo(hp.stem.x, hp.stem.y); x.lineTo(hp.rot.x, hp.rot.y); x.stroke();
    x.fillStyle = "#fff"; x.lineWidth = 2 * u; x.shadowColor = "rgba(0,0,0,.35)";
    x.shadowBlur = 6; x.beginPath(); x.arc(hp.rot.x, hp.rot.y, 7 * u, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0; x.stroke();
    x.translate(hp.scl.x, hp.scl.y); x.rotate(h.r * Math.PI / 180);
    x.shadowBlur = 6; x.fillRect(-6 * u, -6 * u, 12 * u, 12 * u); x.shadowBlur = 0; x.strokeRect(-6 * u, -6 * u, 12 * u, 12 * u);
    x.restore();
  }
  function paint(cv, k, res, ed) {
    var S = cv.width / W, x = cv.getContext("2d"), hits = [];
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.setTransform(S, 0, 0, S, 0, 0);
    drawBg(x, k, cv);
    var gs = drawDevices(x, k, res, S, hits);
    var tb = drawTitle(x, k, res, S, hits);
    if (k.chips.length) {
      var snap = document.createElement("canvas"); snap.width = cv.width; snap.height = cv.height; snap.getContext("2d").drawImage(cv, 0, 0);
      var bl = blurCopy(snap, k.glass.blur * S), slots = chipSlots(k, gs, tb);
      k.chips.forEach(function (c, i) { drawChip(x, k, c, i, slots, snap, bl, S, hits); });
    }
    if (ed) overlay(x, ed, hits);
    return hits;
  }
  function prepare(k, item) {
    var ids = k.devices.map(function (d) { return d.id; });
    var lj = k.logo.mode === "image" && k.logo.src ? loadImg(k.logo.src) : Promise.resolve(null);
    return Promise.all([Promise.all(k.devices.map(function (d) { return loadImg(srcOf(d.scr, item)); })), lj, fonts()]).then(function (r) {
      var imgs = {}; ids.forEach(function (id, i) { imgs[id] = r[0][i]; });
      return { imgs: imgs, logo: r[1] };
    });
  }
  function bakeKit(k, item, toWebp) {
    return prepare(k, item).then(function (res) {
      var out = document.createElement("canvas"); out.width = W; out.height = H;
      paint(out, k, res, null);
      var url = toWebp ? toWebp(out) : out.toDataURL("image/webp", 0.92);
      out.width = out.height = 1;
      return url;
    });
  }
  function bake(env) {
    var item = env.item;
    var kp = item.coverKit ? Promise.resolve(normalize(clone(item.coverKit), item)) : defaults(item);
    return kp.then(function (k) { return bakeKit(k, item, env.toWebp).then(function (url) { return { url: url, kit: k }; }); });
  }

  /* ---------- editor ---------- */
  var CSS = `
  .ak-cs-ov{position:fixed;inset:0;z-index:2147483100;background:color-mix(in srgb,#05060a 72%,transparent);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);display:flex;justify-content:center;padding:14px;animation:akcsfade .22s ease}
  @keyframes akcsfade{from{opacity:0}to{opacity:1}}
  @keyframes akcsin{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}
  .ak-cs{--cs-line:color-mix(in srgb,var(--text) 10%,transparent);--cs-soft:color-mix(in srgb,var(--text) 5%,transparent);--cs-mid:color-mix(in srgb,var(--text) 16%,transparent);
    width:min(1560px,100%);display:grid;grid-template-rows:auto minmax(0,1fr);background:var(--surface);border:1px solid var(--cs-line);border-radius:16px;overflow:hidden;box-shadow:0 40px 120px -40px rgba(0,0,0,.75);font:400 13px/1.4 'Inter',sans-serif;color:var(--text);animation:akcsin .3s cubic-bezier(.22,1,.36,1)}
  .ak-cs *{box-sizing:border-box}
  .ak-cs button{font-family:inherit}
  .ak-cs-top{display:flex;align-items:center;gap:10px;padding:10px 12px 10px 18px;border-bottom:1px solid var(--cs-line);flex-wrap:wrap}
  .ak-cs-ttl{flex:1;min-width:180px;display:flex;align-items:baseline;gap:10px;min-height:32px}
  .ak-cs-ttl b{font-weight:650;font-size:14px;letter-spacing:-.01em;white-space:nowrap}
  .ak-cs-ttl span{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ak-cs-acts{display:flex;gap:6px;align-items:center}
  .ak-cs-dirty{display:flex;align-items:center;gap:7px;margin-right:6px;font-size:11.5px;color:var(--muted);white-space:nowrap;opacity:0;transform:translateX(4px);transition:opacity .25s,transform .25s cubic-bezier(.22,1,.36,1);pointer-events:none}
  .ak-cs-dirty::before{content:'';width:6px;height:6px;border-radius:50%;background:#E3B04B;box-shadow:0 0 0 3px color-mix(in srgb,#E3B04B 22%,transparent)}
  .ak-cs-dirty.on{opacity:1;transform:none}
  .ak-cs-menu{position:relative}
  .ak-cs-dd{position:absolute;right:0;top:calc(100% + 6px);z-index:5;min-width:236px;display:none;gap:2px;padding:4px;background:var(--surface);border:1px solid var(--cs-line);border-radius:12px;box-shadow:0 20px 44px -18px rgba(0,0,0,.7)}
  .ak-cs-dd.open{display:grid;animation:akcsin .18s cubic-bezier(.22,1,.36,1)}
  .ak-cs-dd button{display:grid;gap:1px;text-align:left;border:0;background:none;padding:8px 10px;border-radius:8px;cursor:pointer;color:var(--text);font-size:12.5px;font-weight:500;transition:background .15s}
  .ak-cs-dd button small{font-size:11px;color:var(--muted);font-weight:400}
  .ak-cs-dd button:hover,.ak-cs-dd button:focus-visible{background:var(--cs-soft);outline:none}
  .ak-cs-sep{width:1px;height:18px;background:var(--cs-line);margin:0 4px}
  .ak-cs-icb.q{border-color:transparent;color:var(--muted)}
  .ak-cs-icb.q:hover,.ak-cs-icb.q[aria-expanded=true]{color:var(--text);background:var(--cs-soft)}
  .ak-cs-b{height:32px;padding:0 12px;border-radius:9px;border:1px solid var(--cs-line);background:transparent;cursor:pointer;font-size:12.5px;font-weight:550;color:var(--text);transition:background .18s,border-color .18s,color .18s,opacity .18s;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}
  .ak-cs-b:hover{background:var(--cs-soft);border-color:var(--cs-mid)}
  .ak-cs-b[disabled]{opacity:.35;pointer-events:none}
  .ak-cs-b.q{border-color:transparent;color:var(--muted)}
  .ak-cs-b.q:hover{color:var(--text);background:var(--cs-soft)}
  .ak-cs-b.pri{background:var(--accent);border-color:transparent;color:#fff;padding:0 14px;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.18)}
  .ak-cs-b.pri:hover{background:color-mix(in srgb,var(--accent) 88%,#000)}
  .ak-cs-body{min-height:0;display:grid;grid-template-columns:minmax(0,1fr) 300px}
  .ak-cs-stage{min-width:0;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;gap:10px;padding:12px 18px;background:color-mix(in srgb,var(--bg) 78%,var(--surface))}
  .ak-cs-tools{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
  .ak-cs-tools>div{display:flex;align-items:center;gap:6px}
  .ak-cs-cvw{min-height:0;min-width:0;display:grid;place-items:center;overflow:hidden}
  .ak-cs-cvw canvas{display:block;border-radius:10px;box-shadow:0 24px 60px -28px rgba(0,0,0,.7),0 0 0 1px var(--cs-line);touch-action:none;background:#111;outline:none}
  .ak-cs-hint{font-size:11.5px;color:var(--muted);text-align:center;min-height:16px;text-wrap:pretty}
  .ak-cs-icb{width:32px;height:32px;border-radius:9px;border:1px solid var(--cs-line);background:transparent;display:grid;place-items:center;cursor:pointer;color:var(--text);transition:background .18s,opacity .18s;padding:0}
  .ak-cs-icb:hover{background:var(--cs-soft)}
  .ak-cs-icb[disabled]{opacity:.3;pointer-events:none}
  .ak-cs-icb svg{width:16px;height:16px}
  .ak-cs-panel{min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr);border-left:1px solid var(--cs-line);background:var(--surface)}
  .ak-cs-tabs{display:flex;gap:22px;padding:0 18px;border-bottom:1px solid var(--cs-line)}
  .ak-cs-tab{position:relative;height:44px;border:0;background:none;padding:0;color:var(--muted);font-size:12.5px;font-weight:500;cursor:pointer;transition:color .18s}
  .ak-cs-tab:hover{color:var(--text)}
  .ak-cs-tab.on{color:var(--text)}
  .ak-cs-tab::after{content:'';position:absolute;left:0;right:0;bottom:-1px;height:1.5px;border-radius:2px;background:var(--text);transform:scaleX(0);transition:transform .25s cubic-bezier(.22,1,.36,1)}
  .ak-cs-tab.on::after{transform:scaleX(1)}
  .ak-cs-pane{position:relative;overflow-y:auto;overflow-x:hidden;padding:0 10px 24px 18px;scrollbar-width:thin;scrollbar-color:var(--cs-mid) transparent;scrollbar-gutter:stable;overscroll-behavior:contain}
  .ak-cs-pane::-webkit-scrollbar{width:8px}
  .ak-cs-pane::-webkit-scrollbar-track{background:transparent}
  .ak-cs-pane::-webkit-scrollbar-thumb{background:var(--cs-mid);border-radius:99px;border:2px solid transparent;background-clip:padding-box}
  .ak-cs-pane::-webkit-scrollbar-thumb:hover{background-color:color-mix(in srgb,var(--text) 28%,transparent)}
  .ak-cs-sec{display:grid;gap:6px;padding:18px 0}
  .ak-cs-sec+.ak-cs-sec{border-top:1px solid var(--cs-line)}
  .ak-cs-h{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 0 4px;min-height:20px}
  .ak-cs-h>b{font-size:12.5px;font-weight:600;color:var(--text)}
  .ak-cs-h small{font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
  .ak-cs-r{display:grid;grid-template-columns:64px minmax(0,1fr) 40px;align-items:center;column-gap:12px;min-height:30px}
  .ak-cs-r.w2{grid-template-columns:64px minmax(0,1fr)}
  .ak-cs-r.w2>.ak-cs-b{justify-self:stretch;height:30px}
  .ak-cs-r>span{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .ak-cs-r>output{font-size:11.5px;text-align:right;font-variant-numeric:tabular-nums;color:var(--muted)}
  .ak-cs input[type=range]{-webkit-appearance:none;appearance:none;width:100%;min-width:0;height:18px;margin:0;background:transparent;cursor:pointer}
  .ak-cs input[type=range]:focus{outline:none}
  .ak-cs input[type=range]::-webkit-slider-runnable-track{height:3px;border-radius:99px;background:linear-gradient(90deg,var(--text) var(--p,50%),var(--cs-mid) var(--p,50%))}
  .ak-cs input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;margin-top:-4.5px;border-radius:50%;background:#fff;border:0;box-shadow:0 0 0 1px rgba(0,0,0,.18),0 1px 4px rgba(0,0,0,.35);transition:transform .15s}
  .ak-cs input[type=range]:hover::-webkit-slider-thumb{transform:scale(1.15)}
  .ak-cs input[type=range]:active::-webkit-slider-thumb{transform:scale(1.3)}
  .ak-cs input[type=range]:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 45%,transparent)}
  .ak-cs input[type=range]::-moz-range-track{height:3px;border-radius:99px;background:var(--cs-mid)}
  .ak-cs input[type=range]::-moz-range-progress{height:3px;border-radius:99px;background:var(--text)}
  .ak-cs input[type=range]::-moz-range-thumb{width:12px;height:12px;border:0;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.18),0 1px 4px rgba(0,0,0,.35)}
  [data-theme="light"] .ak-cs input[type=range]::-webkit-slider-thumb{box-shadow:0 0 0 1px rgba(0,0,0,.28),0 1px 3px rgba(0,0,0,.2)}
  .ak-cs-seg{display:flex;background:var(--cs-soft);border-radius:8px;padding:2px;gap:2px;min-width:0}
  .ak-cs-seg button{flex:1;height:26px;border:0;background:transparent;color:var(--muted);font-size:12px;font-weight:500;border-radius:6px;cursor:pointer;transition:background .18s,color .18s,box-shadow .18s;white-space:nowrap;padding:0 10px}
  .ak-cs-seg button:hover{color:var(--text)}
  .ak-cs-seg button.on{background:var(--surface);color:var(--text);box-shadow:0 1px 2px rgba(0,0,0,.2),0 0 0 1px var(--cs-line)}
  .ak-cs-dots{display:flex;gap:10px;justify-content:flex-end;align-items:center}
  .ak-cs-dots button{position:relative;width:18px;height:18px;border-radius:50%;border:0;padding:0;cursor:pointer;background:var(--c);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2),0 0 0 1px var(--cs-mid);transition:box-shadow .18s}
  .ak-cs-dots button::after{content:'';position:absolute;inset:-8px}
  .ak-cs-dots button.on{box-shadow:inset 0 0 0 1px rgba(255,255,255,.2),0 0 0 2px var(--surface),0 0 0 3.5px var(--text)}
  .ak-cs-dots small{font-size:11.5px;color:var(--muted);margin-right:auto}
  .ak-cs-in{width:100%;min-width:0;height:30px;font:500 12.5px 'Inter',sans-serif;color:var(--text);background:var(--cs-soft);border:1px solid transparent;border-radius:8px;padding:0 10px;transition:border-color .15s,background .15s}
  .ak-cs-in:hover{border-color:var(--cs-line)}
  .ak-cs-in:focus{outline:none;border-color:var(--cs-mid);background:var(--surface)}
  .ak-cs-link{border:0;background:none;color:var(--muted);font-size:11.5px;font-weight:500;cursor:pointer;padding:4px 0;white-space:nowrap;transition:color .15s}
  .ak-cs-link:hover{color:var(--text)}
  .ak-cs-link[disabled]{opacity:.35;pointer-events:none}
  .ak-cs-note{font-size:11px;color:var(--muted);margin:2px 0 4px;text-wrap:pretty}
  .ak-cs-steps{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:4px}
  .ak-cs-step{display:flex;align-items:center;justify-content:space-between;gap:4px;height:34px;border:1px solid var(--cs-line);border-radius:9px;padding:0 3px 0 10px}
  .ak-cs-step>span{font-size:12px;color:var(--muted)}
  .ak-cs-step>div{display:flex;align-items:center}
  .ak-cs-step b{min-width:16px;text-align:center;font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums}
  .ak-cs-step button{width:24px;height:24px;border:0;border-radius:6px;background:transparent;cursor:pointer;font-size:14px;line-height:1;color:var(--muted);transition:background .15s,color .15s}
  .ak-cs-step button:hover{background:var(--cs-soft);color:var(--text)}
  .ak-cs-step button[disabled]{opacity:.25;pointer-events:none}
  .ak-cs-lyr{position:relative;border-radius:10px;transition:background .2s,box-shadow .2s}
  .ak-cs-lyr.drag{z-index:3;background:var(--surface);box-shadow:0 14px 34px -12px rgba(0,0,0,.65),0 0 0 1px var(--cs-mid)}
  .ak-cs-lyr.drag .ak-cs-lyrh{cursor:grabbing}
  .ak-cs-grip{width:14px;height:30px;flex:none;margin:0 -4px 0 -2px;display:grid;place-items:center;color:var(--muted);cursor:grab;touch-action:none;opacity:.35;transition:opacity .15s,color .15s}
  .ak-cs-grip svg{width:10px;height:14px}
  .ak-cs-lyrh:hover .ak-cs-grip,.ak-cs-lyr.drag .ak-cs-grip{opacity:1;color:var(--text)}
  .ak-cs-dragging,.ak-cs-dragging *{cursor:grabbing!important;user-select:none}
  .ak-cs-lyr.open{background:var(--cs-soft)}
  .ak-cs-lyrh{display:flex;align-items:center;gap:10px;padding:5px 4px 5px 5px;border-radius:10px;cursor:grab;transition:background .15s}
  .ak-cs-lyrh:hover{background:var(--cs-soft)}
  .ak-cs-lyr.open .ak-cs-lyrh:hover{background:transparent}
  .ak-cs-lyrh canvas{width:30px;height:30px;border-radius:7px;flex:none;background:#111;box-shadow:0 0 0 1px var(--cs-line)}
  .ak-cs-lyr.open .ak-cs-lyrh canvas{box-shadow:0 0 0 1.5px #E3B04B}
  .ak-cs-nm{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.3}
  .ak-cs-nm b{font-size:12.5px;font-weight:500}
  .ak-cs-nm small{font-size:11px;color:var(--muted)}
  .ak-cs-mini{width:24px;height:24px;flex:none;border:0;border-radius:6px;background:transparent;display:grid;place-items:center;cursor:pointer;color:var(--muted);padding:0;transition:background .15s,color .15s,opacity .15s}
  .ak-cs-mini:hover{background:var(--surface);color:var(--text)}
  .ak-cs-mini[disabled]{opacity:.2;pointer-events:none}
  .ak-cs-mini svg{width:13px;height:13px}
  @media(hover:hover){.ak-cs-lyrh .ak-cs-mini,.ak-cs-lbl .ak-cs-mini{opacity:0}.ak-cs-lyr:hover .ak-cs-mini,.ak-cs-lyr.open .ak-cs-mini,.ak-cs-lbl:hover .ak-cs-mini,.ak-cs-lbl.open .ak-cs-mini,.ak-cs-mini:focus-visible{opacity:1}.ak-cs-lyr:hover .ak-cs-mini[disabled],.ak-cs-lyr.open .ak-cs-mini[disabled]{opacity:.2}}
  .ak-cs-lyrb{display:none;gap:6px;padding:4px 10px 10px}
  .ak-cs-lyr.open .ak-cs-lyrb{display:grid;animation:akcsfade .2s ease}
  .ak-cs-sub{font-size:11px;color:var(--muted);font-weight:500;margin:6px 0 0;display:flex;justify-content:space-between;align-items:center;min-height:22px}
  .ak-cs-btns{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;margin-top:6px}
  .ak-cs-btns .ak-cs-b{height:28px;padding:0 6px;font-size:11.5px;font-weight:500;color:var(--muted)}
  .ak-cs-btns .ak-cs-b:hover{color:var(--text)}
  .ak-cs-btns .ak-cs-b.del:hover{color:#ef4444;border-color:color-mix(in srgb,#ef4444 40%,transparent);background:transparent}
  .ak-cs-pick{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px;margin:4px 0 6px}
  .ak-cs-pick button{aspect-ratio:1;border-radius:6px;border:0;box-shadow:0 0 0 1px var(--cs-line);background:#111 center top/cover no-repeat;cursor:pointer;padding:0;font-size:10.5px;color:var(--muted);transition:box-shadow .15s}
  .ak-cs-pick button:hover{box-shadow:0 0 0 1px var(--cs-mid)}
  .ak-cs-pick button.on{box-shadow:0 0 0 1.5px var(--text)}
  .ak-cs-pick .up{background:transparent;box-shadow:inset 0 0 0 1px var(--cs-mid)}
  .ak-cs-lbl{border-radius:10px;padding:3px;transition:background .2s}
  .ak-cs-lbl.open{background:var(--cs-soft)}
  .ak-cs-lbl .hd{position:relative;display:flex;gap:4px;align-items:center}
  .ak-cs-lbl .hd .ak-cs-in{padding-right:32px}
  .ak-cs-lbl .hd .ak-cs-mini{position:absolute;right:3px;top:50%;transform:translateY(-50%)}
  .ak-cs-lbl .hd i{width:18px;flex:none;text-align:center;font-style:normal;font-size:11px;color:var(--muted);font-variant-numeric:tabular-nums}
  .ak-cs-lbl.open .hd i{color:#E3B04B}
  .ak-cs-lbl.open .ak-cs-in{background:var(--surface)}
  .ak-cs-lbl .bd{display:none;gap:6px;padding:6px 6px 4px 22px}
  .ak-cs-lbl.open .bd{display:grid;animation:akcsfade .2s ease}
  .ak-cs-sws{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px}
  .ak-cs-swb{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px}
  .ak-cs-sw{position:relative;display:block;width:34px;height:34px;border-radius:50%;cursor:pointer;box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 0 0 1px var(--cs-line);overflow:hidden}
  .ak-cs-sw input{position:absolute;inset:-6px;opacity:0;cursor:pointer;width:calc(100% + 12px);height:calc(100% + 12px);border:0;padding:0}
  .ak-cs-swb small{font-size:10px;color:var(--muted)}
  .ak-cs-swx{position:absolute;top:-4px;right:-4px;width:16px;height:16px;border-radius:50%;border:0;background:var(--surface);box-shadow:0 0 0 1px var(--cs-mid);color:var(--muted);font-size:10px;line-height:1;cursor:pointer;display:grid;place-items:center;padding:0;opacity:0;transition:opacity .15s,color .15s}
  .ak-cs-swb:hover .ak-cs-swx,.ak-cs-swx:focus-visible{opacity:1}
  .ak-cs-swx:hover{color:#ef4444}
  .ak-cs-add{width:34px;height:34px;border-radius:50%;border:1px dashed var(--cs-mid);background:transparent;color:var(--muted);font-size:15px;cursor:pointer;transition:border-color .15s,color .15s}
  .ak-cs-add:hover{border-color:var(--text);color:var(--text)}
  .ak-cs-tg{position:relative;justify-self:end;width:28px;height:16px;border-radius:99px;border:0;background:var(--cs-mid);cursor:pointer;transition:background .2s;flex:none;padding:0}
  .ak-cs-tg::before{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;transition:transform .22s cubic-bezier(.22,1,.36,1);box-shadow:0 1px 2px rgba(0,0,0,.3)}
  .ak-cs-tg::after{content:'';position:absolute;inset:-14px -8px}
  .ak-cs-tg[aria-pressed=true]{background:var(--accent)}
  .ak-cs-tg[aria-pressed=true]::before{transform:translateX(12px)}
  .ak-cs-tgl{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muted);cursor:pointer;min-height:32px;padding:0 4px;user-select:none}
  .ak-cs-busy{opacity:.6;pointer-events:none}
  @media(max-width:900px){.ak-cs-ov{padding:0}.ak-cs{border-radius:0;border:0}.ak-cs-body{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}.ak-cs-stage{padding:10px}.ak-cs-panel{border-left:0;border-top:1px solid var(--cs-line)}.ak-cs-in{font-size:16px;height:36px}}
  @media(pointer:coarse){.ak-cs-b,.ak-cs-icb{height:40px;min-width:40px}.ak-cs-seg button{height:36px}.ak-cs-tab{height:48px}.ak-cs-mini,.ak-cs-step button{width:36px;height:36px}.ak-cs-r{min-height:40px}.ak-cs input[type=range]{height:28px}.ak-cs input[type=range]::-webkit-slider-thumb{width:20px;height:20px;margin-top:-8px}}
  `;
  var IC = {
    more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>',
    grip: '<svg viewBox="0 0 10 14" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="2.5" r="1.3"/><circle cx="7.5" cy="2.5" r="1.3"/><circle cx="2.5" cy="7" r="1.3"/><circle cx="7.5" cy="7" r="1.3"/><circle cx="2.5" cy="11.5" r="1.3"/><circle cx="7.5" cy="11.5" r="1.3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>'
  };
  var _css = false;
  function el(tag, a, kids) {
    var n = document.createElement(tag);
    if (a) Object.keys(a).forEach(function (k) {
      var v = a[k]; if (v == null || v === false) return;
      if (k === "class") n.className = v; else if (k === "html") n.innerHTML = v; else if (k === "text") n.textContent = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? "" : v);
    });
    (kids || []).forEach(function (c) { if (c != null) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function pct(v) { return v + "%"; }
  function deg(v) { return v + "\u00b0"; }

  function open(env) {
    if (!_css) { _css = true; document.head.appendChild(el("style", { html: CSS })); }
    var item = env.item, kit = null, res = { imgs: {}, logo: null }, hits = [];
    var ed = { sel: null, hover: null, guides: true, tool: "move", tab: "devices", snap: false, u: 1 };
    var raf = 0, rafT = 0, drag = null, lastLyrDrag = 0, startJSON = "", hist = [], hi = -1, inputs = [], nameEls = {}, picker = null, _ct = 0, _tt = 0;
    var TABS = [["devices", "Devices"], ["labels", "Labels"], ["colour", "Colour"], ["title", "Title"]];

    var cv = el("canvas", { "aria-label": "Cover preview", tabindex: "0" });
    var cvw = el("div", { class: "ak-cs-cvw" }, [cv]);
    var hint = el("div", { class: "ak-cs-hint", "aria-live": "polite" });
    var undoB = iconBtn(IC.undo, "Undo (Ctrl/\u2318 Z)", undo), redoB = iconBtn(IC.redo, "Redo (Ctrl/\u2318 Shift Z)", redo);
    var toolSeg = segEl([["move", "Move"], ["pan", "Pan screen"]], function () { return ed.tool; }, function (v) { ed.tool = v; setHint(); });
    var guideT = toggleEl(function () { return ed.guides; }, function (v) { ed.guides = v; draw(); });
    var tabs = el("div", { class: "ak-cs-tabs", role: "tablist" }), pane = el("div", { class: "ak-cs-pane" });
    var saveBtn = el("button", { type: "button", class: "ak-cs-b pri", title: "Save cover (Ctrl/\u2318 S)", onclick: doSave }, ["Save cover"]);
    var dirtyEl = el("span", { class: "ak-cs-dirty", "aria-live": "polite" }, ["Unsaved changes"]);
    var dd = el("div", { class: "ak-cs-dd", role: "menu" }, [
      el("button", { type: "button", role: "menuitem", onclick: function () { menu(false); doReset(); } }, [el("span", { text: "Reset to standard" }), el("small", { text: "Start again from this project\u2019s preset" })]),
      env.prevCover ? el("button", { type: "button", role: "menuitem", onclick: function () { menu(false); doRestore(); } }, [el("span", { text: "Restore previous cover" }), el("small", { text: "The cover from before Cover Studio" })]) : null
    ]);
    var moreB = el("button", { type: "button", class: "ak-cs-icb q", title: "More", "aria-label": "More options", "aria-haspopup": "menu", "aria-expanded": "false", html: IC.more, onclick: function (e) { e.stopPropagation(); menu(!dd.classList.contains("open")); } });
    function menu(o) { dd.classList.toggle("open", o); moreB.setAttribute("aria-expanded", String(o)); if (o) { var f = dd.querySelector("button"); if (f) f.focus(); } }
    function outside(e) { if (dd.classList.contains("open") && !dd.contains(e.target) && e.target !== moreB) menu(false); }
    var ov = el("div", { class: "ak-cs-ov", "data-ak-transient": "1", role: "dialog", "aria-modal": "true", "aria-label": "Cover Studio" }, [
      el("div", { class: "ak-cs" }, [
        el("div", { class: "ak-cs-top" }, [
          el("div", { class: "ak-cs-ttl" }, [el("b", { text: "Cover Studio" }), el("span", { text: (item.title || "Case study") + " \u00b7 1920\u00d71200 WebP" })]),
          el("div", { class: "ak-cs-acts" }, [
            dirtyEl,
            el("div", { class: "ak-cs-menu" }, [moreB, dd]),
            saveBtn,
            el("span", { class: "ak-cs-sep", "aria-hidden": "true" }),
            el("button", { type: "button", class: "ak-cs-icb q", title: "Close (Esc)", "aria-label": "Close Cover Studio", html: IC.x, onclick: function () { close(false); } })
          ])
        ]),
        el("div", { class: "ak-cs-body" }, [
          el("div", { class: "ak-cs-stage" }, [
            el("div", { class: "ak-cs-tools" }, [
              el("div", {}, [toolSeg]),
              el("div", {}, [undoB, redoB, el("label", { class: "ak-cs-tgl", title: "Dashed lines show what the 16:9 tiles and the 3:2 home rail crop" }, [guideT, "Crop guides"])])
            ]),
            cvw, hint
          ]),
          el("aside", { class: "ak-cs-panel" }, [tabs, pane])
        ])
      ])
    ]);
    document.body.appendChild(ov);
    var prevOverflow = document.documentElement.style.overflow; document.documentElement.style.overflow = "hidden";
    var ro = window.ResizeObserver ? new ResizeObserver(function () { draw(); }) : null; if (ro) ro.observe(cvw);
    window.addEventListener("resize", draw);
    document.addEventListener("keydown", onKey, true);
    ov.addEventListener("pointerdown", outside, true);
    updUndo(); setHint();

    (item.coverKit ? Promise.resolve(normalize(clone(item.coverKit), item)) : defaults(item)).then(function (k) {
      kit = k; startJSON = JSON.stringify(k); hist = [startJSON]; hi = 0;
      buildPanel(); setHint(); reload();
    });

    function close(saved) {
      if (!saved && kit && JSON.stringify(kit) !== startJSON && !confirm("Discard your cover changes?")) return;
      document.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", draw); if (ro) ro.disconnect();
      clearTimeout(_ct); clearTimeout(_tt);
      document.documentElement.style.overflow = prevOverflow; ov.remove();
    }

    /* ---- history ---- */
    function commit() {
      clearTimeout(_ct); if (!kit) return;
      var s = JSON.stringify(kit); if (hist[hi] === s) return;
      hist = hist.slice(0, hi + 1); hist.push(s); if (hist.length > 80) hist.shift(); hi = hist.length - 1; updUndo();
    }
    function commitSoon() { clearTimeout(_ct); _ct = setTimeout(commit, 400); }
    function undo() { commit(); if (hi <= 0) return; hi--; restoreState(); }
    function redo() { if (hi >= hist.length - 1) return; hi++; restoreState(); }
    function restoreState() {
      kit = JSON.parse(hist[hi]);
      if (ed.sel && ed.sel.type === "dev" && !devById(kit, ed.sel.id)) ed.sel = null;
      if (ed.sel && ed.sel.type === "chip" && !kit.chips[ed.sel.i]) ed.sel = null;
      buildPanel(); reload(); updUndo(); setHint();
    }
    function updUndo() { undoB.disabled = hi <= 0; redoB.disabled = hi >= hist.length - 1; dirtyEl.classList.toggle("on", hi >= 0 && hist[hi] !== startJSON); }

    /* ---- canvas ---- */
    function fit() {
      var ww = cvw.clientWidth, wh = cvw.clientHeight, narrow = window.matchMedia && matchMedia("(max-width:900px)").matches;
      var w = Math.max(240, Math.floor(narrow || wh < 140 ? ww : Math.min(ww, wh * W / H))), h = Math.round(w * H / W);
      if (cv.style.width !== w + "px") { cv.style.width = w + "px"; cv.style.height = h + "px"; }
      var px = Math.min(W, Math.round(w * Math.min(2, window.devicePixelRatio || 1)));
      if (cv.width !== px) { cv.width = px; cv.height = Math.round(px * H / W); }
      ed.u = W / w;
    }
    function draw() {
      if (raf) return;
      var run = function () {
        if (!raf) return; cancelAnimationFrame(raf); clearTimeout(rafT); raf = 0; if (!kit) return;
        fit(); hits = paint(cv, kit, res, ed); syncInputs();
      };
      raf = requestAnimationFrame(run);
      rafT = setTimeout(run, 80);   // a tab that never gets a frame still paints
    }
    function reload() {
      var k = kit;
      return prepare(k, item).then(function (r) { if (k !== kit) return; res = r; draw(); thumbs(); });
    }
    function pt(e) { var b = cv.getBoundingClientRect(); return { x: (e.clientX - b.left) / b.width * W, y: (e.clientY - b.top) / b.height * H }; }
    function hitAt(p) { for (var i = hits.length - 1; i >= 0; i--) if (inHit(hits[i], p, hits[i].type === "chip" ? 6 : 0)) return hits[i]; return null; }
    function handleAt(p) {
      var h = findHit(hits, ed.sel); if (!h || h.type === "title") return null;
      var hp = handlePts(h, ed.u), r = 14 * ed.u;
      if (dist(p, hp.rot) <= r) return { kind: "rot", h: h };
      if (dist(p, hp.scl) <= r) return { kind: "scl", h: h };
      return null;
    }
    function cropNow(d) {
      var img = res.imgs[d.id]; if (!img) return null;
      return { c: cropOf(img, d.scr, ASP[d.t]), iw: img.naturalWidth, ih: img.naturalHeight, asp: ASP[d.t] };
    }
    function screenCtx(d) {
      var img = d && res.imgs[d.id]; if (!img) return null;
      var slot = d.scr, asp = ASP[d.t], c = cropOf(img, slot, asp), iw = img.naturalWidth, ih = img.naturalHeight;
      slot.x = c.x; slot.y = c.y; slot.w = c.w;
      return { slot: slot, hN: function () { return slot.w * iw / asp / ih; } };
    }
    function clampCrop(slot, hN) {
      slot.w = clamp(slot.w, 0.03, 1);
      slot.x = clamp(slot.x, 0, Math.max(0, 1 - slot.w));
      slot.y = clamp(slot.y, 0, Math.max(0, 1 - hN));
    }
    function zoomTo(s, w) {
      var cxn = s.slot.x + s.slot.w / 2, cyn = s.slot.y + s.hN() / 2;
      s.slot.w = clamp(w, 0.03, 1); s.slot.x = cxn - s.slot.w / 2; s.slot.y = cyn - s.hN() / 2; clampCrop(s.slot, s.hN());
    }
    function cursorFor(hd, h, alt) {
      if (hd) return hd.kind === "rot" ? "grab" : "nwse-resize";
      if (!h) return "default";
      if (h.type === "title") return "ns-resize";
      return h.type === "dev" && (ed.tool === "pan" || alt) ? "grab" : "move";
    }
    cv.addEventListener("pointerdown", function (e) {
      if (!kit || e.button > 0) return;
      var p = pt(e), hd = handleAt(p), h = hd ? hd.h : hitAt(p);
      if (!h) { select(null); return; }
      select(selOf(h));
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      cv.focus({ preventScroll: true });
      var mode = hd ? hd.kind : h.type === "dev" && (ed.tool === "pan" || e.altKey) ? "pan" : "move";
      drag = { h: h, p: p, mode: mode, moved: false };
      if (h.type === "dev") {
        var d = devById(kit, h.id); drag.d = d; drag.o = { dx: d.dx, dy: d.dy, r: d.r, s: d.s };
        if (mode === "pan") { var s = screenCtx(d); if (!s) drag.mode = "move"; else { drag.s = s; drag.o.x = s.slot.x; drag.o.y = s.slot.y; } }
      } else if (h.type === "chip") {
        var c = kit.chips[h.i]; drag.c = c; drag.o = { x: h.cx, y: h.cy, r: h.r, s: c.s || 100 };
      } else drag.o = { y: kit.titleY };
      if (mode === "rot") drag.a0 = Math.atan2(p.y - h.cy, p.x - h.cx);
      if (mode === "scl") drag.l0 = h.type === "dev" ? Math.max(1, Math.abs(local(h, p).x - h.cx)) : Math.max(1, dist(p, { x: h.cx, y: h.cy }));
      ed.hover = null;
      cv.style.cursor = drag.mode === "pan" || mode === "rot" ? "grabbing" : cursorFor(hd, h, e.altKey);
      draw();
    });
    cv.addEventListener("pointermove", function (e) {
      if (!kit) return;
      var p = pt(e);
      if (!drag) {
        var hd = handleAt(p), h = hd ? null : hitAt(p), hv = h ? selOf(h) : null;
        cv.style.cursor = cursorFor(hd, h, e.altKey);
        if (!(sameSel(hv, ed.hover) || (!hv && !ed.hover))) { ed.hover = hv; draw(); }
        return;
      }
      var dx = p.x - drag.p.x, dy = p.y - drag.p.y, hh = drag.h, m = drag.mode, snapR = 10 * ed.u;
      drag.moved = true; ed.snap = false;
      if (m === "move") {
        if (hh.type === "dev") {
          var ndx = drag.o.dx + dx, ncx = hh.cx + dx;
          if (Math.abs(ncx - 960) < snapR) { ndx += 960 - ncx; ed.snap = true; }
          drag.d.dx = Math.round(ndx); drag.d.dy = Math.round(drag.o.dy + dy);
        } else if (hh.type === "chip") {
          var nx = drag.o.x + dx; if (Math.abs(nx - 960) < snapR) { nx = 960; ed.snap = true; }
          drag.c.x = Math.round(nx); drag.c.y = Math.round(drag.o.y + dy); if (drag.c.r == null) drag.c.r = drag.o.r;
        } else kit.titleY = Math.round(clamp(drag.o.y + dy, -140, 260));
      } else if (m === "pan") {
        var a = -hh.r * Math.PI / 180, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a), s = drag.s;
        s.slot.x = drag.o.x - lx / hh.s.sw * s.slot.w; s.slot.y = drag.o.y - ly / hh.s.sh * s.hN(); clampCrop(s.slot, s.hN());
      } else if (m === "rot") {
        var dg = drag.o.r + (Math.atan2(p.y - hh.cy, p.x - hh.cx) - drag.a0) * 180 / Math.PI;
        dg = ((dg + 540) % 360) - 180;
        dg = e.shiftKey ? Math.round(dg / 15) * 15 : Math.abs(dg) < 2 ? 0 : Math.round(dg);
        if (hh.type === "dev") drag.d.r = clamp(dg, -90, 90); else drag.c.r = clamp(dg, -45, 45);
      } else if (m === "scl") {
        if (hh.type === "dev") drag.d.s = Math.round(clamp(drag.o.s * Math.abs(local(hh, p).x - hh.cx) / drag.l0, 30, 250));
        else drag.c.s = Math.round(clamp(drag.o.s * dist(p, { x: hh.cx, y: hh.cy }) / drag.l0, 50, 250));
      }
      draw();
    });
    function endDrag() {
      if (!drag) return;
      var d = drag; drag = null; ed.snap = false; cv.style.cursor = "default";
      if (d.mode === "pan") thumbs();
      if (d.moved) commit();
      draw();
    }
    cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
    cv.addEventListener("pointerleave", function () { if (!drag && ed.hover) { ed.hover = null; draw(); } });
    cv.addEventListener("wheel", function (e) {
      if (!kit) return;
      var p = pt(e), h = hitAt(p); if (!h || h.type !== "dev") return;
      var q = local(h, p), sr = h.s; if (q.x < sr.sx || q.x > sr.sx + sr.sw || q.y < sr.sy || q.y > sr.sy + sr.sh) return;
      e.preventDefault();
      var s = screenCtx(devById(kit, h.id)); if (!s) return;
      zoomTo(s, s.slot.w * Math.exp(e.deltaY * 0.0015));
      draw(); thumbsSoon(); commitSoon();
    }, { passive: false });

    function onKey(e) {
      var t = e.target, tag = t && t.tagName, typing = (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && t.type !== "range" && t.type !== "checkbox" && t.type !== "color";
      if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); if (dd.classList.contains("open")) { menu(false); moreB.focus(); } else if (typing) t.blur(); else if (ed.sel) select(null); else close(false); return; }
      var mod = e.metaKey || e.ctrlKey, kk = (e.key || "").toLowerCase();
      if (mod && kk === "s") { e.preventDefault(); e.stopPropagation(); if (typing) t.blur(); commit(); doSave(); return; }
      if (typing || !kit) return;
      if (mod && kk === "z") { e.preventDefault(); e.stopPropagation(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && kk === "y") { e.preventDefault(); e.stopPropagation(); redo(); return; }
      if (mod || (t && t.type === "range")) return;
      var s = ed.sel; if (!s) return;
      var st = e.shiftKey ? 10 : 2, mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      if (mv) {
        e.preventDefault(); e.stopPropagation();
        if (s.type === "dev") { var d = devById(kit, s.id); if (d) { d.dx += mv[0]; d.dy += mv[1]; } }
        else if (s.type === "chip") { var c = kit.chips[s.i], h = findHit(hits, s); if (c && h) { c.x = Math.round(h.cx + mv[0]); c.y = Math.round(h.cy + mv[1]); if (c.r == null) c.r = h.r; } }
        else kit.titleY = clamp(kit.titleY + mv[1], -140, 260);
        draw(); commitSoon(); return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (s.type === "chip" && kit.chips.length > 1) { e.preventDefault(); removeChip(s.i); }
        else if (s.type === "dev" && kit.devices.length > 1) { e.preventDefault(); removeDev(s.id); }
        return;
      }
      if (s.type === "dev" && "[]{}".indexOf(e.key) >= 0) { e.preventDefault(); layer(s.id, e.key === "]" ? 1 : e.key === "[" ? -1 : e.key === "}" ? "front" : "back"); }
    }

    /* ---- selection ---- */
    function select(s) {
      var same = sameSel(s, ed.sel) || (!s && !ed.sel);
      ed.sel = s;
      var want = s ? (s.type === "dev" ? "devices" : s.type === "chip" ? "labels" : "title") : ed.tab;
      if (want !== ed.tab) { ed.tab = want; buildPanel(); pane.scrollTop = 0; }
      if (!same) { markSel(true); setHint(); }
      draw();
    }
    function markSel(reveal) {
      var on = null, s = ed.sel;
      pane.querySelectorAll("[data-dev]").forEach(function (n) { var o = !!(s && s.type === "dev" && s.id === n.getAttribute("data-dev")); n.classList.toggle("open", o); if (o) on = n; });
      pane.querySelectorAll("[data-chip]").forEach(function (n) { var o = !!(s && s.type === "chip" && s.i === +n.getAttribute("data-chip")); n.classList.toggle("open", o); if (o) on = n; });
      if (reveal && on) {
        var top = on.offsetTop, bot = top + on.offsetHeight;
        if (top < pane.scrollTop || bot > pane.scrollTop + pane.clientHeight) pane.scrollTo({ top: Math.max(0, top - 48), behavior: "smooth" });
      }
    }
    function setHint() {
      var s = ed.sel;
      hint.textContent = !s ? "Click a device, a label or the name to edit it \u00b7 scroll on a screen to zoom it \u00b7 Alt (\u2325) + drag pans a screen"
        : s.type === "dev" ? (ed.tool === "pan" ? "Drag to pan the screen" : "Drag to move") + " \u00b7 \u25cb rotates \u00b7 \u25a1 resizes \u00b7 [ ] changes layer \u00b7 Delete removes"
        : s.type === "chip" ? "Drag to move \u00b7 \u25cb tilts \u00b7 \u25a1 resizes \u00b7 arrow keys nudge \u00b7 Delete removes"
        : "Drag up or down to set the height of the name";
    }

    /* ---- panel controls ---- */
    function iconBtn(svg, title, fn) { return el("button", { type: "button", class: "ak-cs-icb", title: title, "aria-label": title, html: svg, onclick: fn }); }
    function mini(svg, title, disabled, fn) { return el("button", { type: "button", class: "ak-cs-mini", title: title, "aria-label": title, disabled: disabled, html: svg, onclick: fn }); }
    function link(text, fn, disabled) { return el("button", { type: "button", class: "ak-cs-link", disabled: disabled, onclick: fn }, [text]); }
    function btn(text, fn, disabled, cls) { return el("button", { type: "button", class: "ak-cs-b" + (cls ? " " + cls : ""), disabled: disabled, onclick: fn }, [text]); }
    function note(t) { return el("div", { class: "ak-cs-note", text: t }); }
    function sec(title, right, kids) { return el("div", { class: "ak-cs-sec" }, [el("div", { class: "ak-cs-h" }, [el("b", { text: title }), right || null])].concat(kids || [])); }
    function rowW(label, ctrl) { return el("div", { class: "ak-cs-r w2" }, [el("span", { text: label }), ctrl]); }
    function dotsEl(opts, get, set) {
      var s = el("div", { class: "ak-cs-dots", role: "group" }), nm = el("small");
      function mark(v) { opts.forEach(function (o, j) { var b = s.children[j + 1], on = o[0] === v; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); if (on) nm.textContent = o[2]; }); }
      s.appendChild(nm);
      opts.forEach(function (o) { s.appendChild(el("button", { type: "button", title: o[2], "aria-label": o[2], style: "--c:" + o[1], onclick: function () { if (get() !== o[0]) { set(o[0]); mark(o[0]); } } })); });
      mark(get());
      return s;
    }
    function segEl(opts, get, set) {
      var s = el("div", { class: "ak-cs-seg", role: "group" });
      opts.forEach(function (o) {
        s.appendChild(el("button", { type: "button", class: get() === o[0] ? "on" : "", "aria-pressed": String(get() === o[0]), onclick: function () {
          if (get() === o[0]) return;
          set(o[0]);
          [].forEach.call(s.children, function (b, j) { var on = opts[j][0] === o[0]; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
        } }, [o[1]]));
      });
      return s;
    }
    function toggleEl(get, set) {
      var b = el("button", { type: "button", class: "ak-cs-tg", "aria-pressed": String(!!get()) });
      b.addEventListener("click", function () { var v = !get(); set(v); b.setAttribute("aria-pressed", String(v)); });
      return b;
    }
    function rng(label, min, max, get, set, o) {
      o = o || {};
      var r = el("input", { type: "range", min: min, max: max, step: o.step || 1, "aria-label": label }), out = el("output");
      function show(v) {
        r.value = v; out.textContent = o.fmt ? o.fmt(v) : String(v);
        r.style.setProperty("--p", ((clamp(v, min, max) - min) / (max - min) * 100).toFixed(1) + "%");
      }
      show(get());
      r.addEventListener("input", function () { set(+r.value); show(+r.value); draw(); });
      r.addEventListener("change", commit);
      if (o.def != null) r.addEventListener("dblclick", function () { set(o.def); show(o.def); draw(); commit(); });
      inputs.push({ show: show, get: get });
      var tip = [o.tip, o.def != null ? "Double-click to reset" : ""].filter(Boolean).join(" \u00b7 ");
      return el("div", { class: "ak-cs-r", title: tip || null }, [el("span", { text: label }), r, out]);
    }
    function textIn(get, set, ph, max) {
      var i = el("input", { type: "text", class: "ak-cs-in", placeholder: ph || "", maxlength: max || 60 });
      i.value = get() || ""; i.setAttribute("value", i.value);
      i.addEventListener("input", function () { set(i.value); draw(); });
      i.addEventListener("change", commit);
      return i;
    }
    function stepper(label, n, min, max, set) {
      return el("div", { class: "ak-cs-step" }, [el("span", { text: label }), el("div", {}, [
        el("button", { type: "button", "aria-label": "Fewer " + label.toLowerCase(), disabled: n <= min, onclick: function () { set(n - 1); } }, ["\u2212"]),
        el("b", { text: String(n), "aria-live": "polite" }),
        el("button", { type: "button", "aria-label": "More " + label.toLowerCase(), disabled: n >= max, onclick: function () { set(n + 1); } }, ["+"])
      ])]);
    }
    function syncInputs() {
      inputs.forEach(function (q) { var v = q.get(); if (v != null) q.show(v); });
      if (kit) { var nm = devNames(kit); Object.keys(nameEls).forEach(function (id) { if (nm[id] && nameEls[id].textContent !== nm[id]) nameEls[id].textContent = nm[id]; }); }
    }
    function devNames(k) {
      var out = {};
      ["phone", "laptop"].forEach(function (t) {
        var a = k.devices.filter(function (d) { return d.t === t; }).map(function (d) { return { id: d.id, cx: geom(k, d).cx }; }).sort(function (p, q) { return p.cx - q.cx; });
        var pre = a.length === 1 ? [""] : a.length === 2 ? ["Left ", "Right "] : ["Left ", "Centre ", "Right "];
        a.forEach(function (o, j) { var s = pre[j] + t; out[o.id] = s.charAt(0).toUpperCase() + s.slice(1); });
      });
      return out;
    }

    /* ---- structure ---- */
    function structural(fn) {
      if (fn() === false) return;
      if (ed.sel && ed.sel.type === "dev" && !devById(kit, ed.sel.id)) ed.sel = null;
      buildPanel(); reload(); commit(); setHint();
    }
    function layer(id, dir) {
      var a = kit.devices, i = -1; a.forEach(function (d, j) { if (d.id === id) i = j; }); if (i < 0) return;
      var d = a.splice(i, 1)[0], ni = dir === "front" ? a.length : dir === "back" ? 0 : clamp(i + dir, 0, a.length);
      a.splice(ni, 0, d); buildPanel(); draw(); commit();
    }
    function removeDev(id) {
      var k = kit, d = devById(k, id); if (!d || k.devices.length <= 1) return;
      var rest = k.devices.filter(function (x) { return x.t === d.t && x.id !== id; }), pri = FRONT[rest.length + 1];
      rest.sort(function (a, b) { return pri.indexOf(a.slot) - pri.indexOf(b.slot); });
      rest.forEach(function (x, j) { x.slot = FRONT[rest.length][j]; x.dx = x.dy = x.r = 0; x.s = 100; });
      k.devices = k.devices.filter(function (x) { return x.id !== id; }); restack(k);
      ed.sel = null; structural(function () {});
    }
    function removeChip(i) { kit.chips.splice(i, 1); ed.sel = null; buildPanel(); draw(); commit(); setHint(); }
    function resetPositions() { kit.devices.forEach(function (d) { d.dx = d.dy = d.r = 0; d.s = 100; }); restack(kit); buildPanel(); draw(); commit(); }

    /* ---- panes ---- */
    function buildPanel() {
      if (!kit) return;
      var st = pane.scrollTop; inputs = []; nameEls = {}; picker = null;
      tabs.innerHTML = ""; pane.innerHTML = "";
      TABS.forEach(function (t) {
        var on = ed.tab === t[0];
        tabs.appendChild(el("button", { type: "button", role: "tab", class: "ak-cs-tab" + (on ? " on" : ""), "aria-selected": String(on), onclick: function () {
          if (ed.tab === t[0]) return; ed.tab = t[0]; buildPanel(); pane.scrollTop = 0;
        } }, [t[1]]));
      });
      ({ devices: paneDevices, labels: paneLabels, colour: paneColour, title: paneTitle })[ed.tab]();
      pane.scrollTop = st; markSel(false); thumbs(); updUndo();
    }
    function paneDevices() {
      var k = kit, np = count(k, "phone"), nl = count(k, "laptop"), n = k.devices.length;
      pane.appendChild(sec("Devices", link("Reset", resetPositions), [
        el("div", { class: "ak-cs-steps" }, [
          stepper("Phones", np, nl ? 0 : 1, MAXN, function (v) { structural(function () { return setCount(kit, "phone", v, item); }); }),
          stepper("Laptops", nl, np ? 0 : 1, MAXN, function (v) { structural(function () { return setCount(kit, "laptop", v, item); }); })
        ]),
        rowW("Frame", dotsEl([["dark", "#2a2b30", "Graphite"], ["light", "#d3d6dc", "Silver"]], function () { return k.frame; }, function (v) { k.frame = v; draw(); commit(); })),
        rng("Size", 50, 150, function () { return k.dev.scale; }, function (v) { k.dev.scale = v; }, { fmt: pct, def: 100 }),
        rng("Spread", 0, 160, function () { return k.dev.spread; }, function (v) { k.dev.spread = v; }, { fmt: pct, def: 100, tip: "0% merges every device onto the centre line" }),
        rng("Height", -300, 400, function () { return k.dev.y; }, function (v) { k.dev.y = v; }, { def: 0 })
      ]));
      var names = devNames(k), ly = sec("Layers", null, []);
      k.devices.slice().reverse().forEach(function (d, ri) { ly.appendChild(layerRow(d, names[d.id], ri, n)); });
      pane.appendChild(ly);
    }
    function layerRow(d, name, ri, n) {
      var nm = el("b", { text: name }); nameEls[d.id] = nm;
      var where = n < 2 ? "" : ri === 0 ? " \u00b7 front" : ri === n - 1 ? " \u00b7 back" : "";
      var head = el("div", { class: "ak-cs-lyrh", title: "Drag to change the layer order", onclick: function (e) {
        if (e.target.closest("button") || Date.now() - lastLyrDrag < 300) return;
        select(ed.sel && ed.sel.type === "dev" && ed.sel.id === d.id ? null : { type: "dev", id: d.id });
      } }, [
        el("span", { class: "ak-cs-grip", html: IC.grip }),
        el("canvas", { width: 68, height: 68, "data-thumb": d.id }),
        el("div", { class: "ak-cs-nm" }, [nm, el("small", { text: (d.t === "phone" ? "Phone" : "Laptop") + where })]),
        mini(IC.up, "Bring forward  ]", ri === 0, function () { layer(d.id, 1); }),
        mini(IC.down, "Send backward  [", ri === n - 1, function () { layer(d.id, -1); })
      ]);
      var pickWrap = el("div");
      var zget = function () { var q = cropNow(d); return q ? Math.round(100 / q.c.w) : 100; };
      var panGet = function (ax) { return function () {
        var q = cropNow(d); if (!q) return 0; var c = q.c;
        if (ax === "x") return 1 - c.w > 0.0001 ? Math.round(c.x / (1 - c.w) * 100) : 50;
        var hN = c.w * q.iw / q.asp / q.ih; return 1 - hN > 0.0001 ? Math.round(c.y / (1 - hN) * 100) : 0;
      }; };
      var panSet = function (ax) { return function (v) {
        var s = screenCtx(d); if (!s) return;
        if (ax === "x") s.slot.x = v / 100 * Math.max(0, 1 - s.slot.w); else s.slot.y = v / 100 * Math.max(0, 1 - s.hN());
        thumbsSoon();
      }; };
      var body = el("div", { class: "ak-cs-lyrb" }, [
        el("div", { class: "ak-cs-sub" }, ["Screen", link("Change screen", function () { togglePicker(pickWrap, d); })]),
        pickWrap,
        rng("Zoom", 100, 1400, zget, function (v) { var s = screenCtx(d); if (s) { zoomTo(s, 100 / v); thumbsSoon(); } }, { fmt: function (v) { return (v / 100).toFixed(1) + "\u00d7"; } }),
        rng("Pan X", 0, 100, panGet("x"), panSet("x"), { fmt: pct }),
        rng("Pan Y", 0, 100, panGet("y"), panSet("y"), { fmt: pct }),
        el("div", { class: "ak-cs-sub" }, ["Device"]),
        rng("Size", 30, 250, function () { return d.s; }, function (v) { d.s = v; }, { fmt: pct, def: 100 }),
        rng("Rotate", -90, 90, function () { return d.r; }, function (v) { d.r = v; }, { fmt: deg, def: 0 }),
        rng("Move X", -1000, 1000, function () { return d.dx; }, function (v) { d.dx = v; }, { def: 0 }),
        rng("Move Y", -700, 700, function () { return d.dy; }, function (v) { d.dy = v; }, { def: 0 }),
        el("div", { class: "ak-cs-btns" }, [
          btn("To front", function () { layer(d.id, "front"); }, ri === 0),
          btn("To back", function () { layer(d.id, "back"); }, ri === n - 1),
          btn("Reset", function () { d.dx = d.dy = d.r = 0; d.s = 100; draw(); commit(); }),
          btn("Remove", function () { removeDev(d.id); }, n <= 1, "del")
        ])
      ]);
      var row = el("div", { class: "ak-cs-lyr", "data-dev": d.id }, [head, body]);
      head.addEventListener("pointerdown", function (e) { layerDrag(e, row); });
      return row;
    }
    /* free drag in the Layers list — top = front; the cover re-stacks live while dragging */
    function layerDrag(e, row) {
      if (e.button > 0 || e.target.closest("button")) return;
      if (e.pointerType !== "mouse" && !e.target.closest(".ak-cs-grip")) return;   // touch: grip only, so the list still scrolls
      var list = [].slice.call(row.parentNode.querySelectorAll(".ak-cs-lyr"));
      if (list.length < 2) return;
      var from = list.indexOf(row), to = from, on = false, y0 = e.clientY, st0 = pane.scrollTop;
      var rects = list.map(function (n) { return n.getBoundingClientRect(); }), hgt = rects[from].height;
      var ids = list.map(function (n) { return n.getAttribute("data-dev"); }), base = kit.devices.slice();
      if (e.pointerType !== "mouse") e.preventDefault();
      function apply(t) {
        var order = ids.slice(); order.splice(t, 0, order.splice(from, 1)[0]);
        kit.devices = order.slice().reverse().map(function (id) { return base.filter(function (q) { return q.id === id; })[0]; });
        draw();
      }
      function move(ev) {
        var dy = ev.clientY - y0 + (pane.scrollTop - st0);
        if (!on) {
          if (Math.abs(dy) < 4) return;
          on = true; row.classList.add("drag"); document.documentElement.classList.add("ak-cs-dragging");
          list.forEach(function (n) { n.style.transition = n === row ? "background .2s,box-shadow .2s" : "transform .22s cubic-bezier(.22,1,.36,1)"; });
        }
        ev.preventDefault();
        dy = clamp(dy, rects[0].top - rects[from].top, rects[list.length - 1].bottom - rects[from].bottom);
        row.style.transform = "translateY(" + dy + "px)";
        var mid = rects[from].top + hgt / 2 + dy, t = from;
        rects.forEach(function (r, j) { var m = r.top + r.height / 2; if (j < from && mid < m) t = Math.min(t, j); if (j > from && mid > m) t = Math.max(t, j); });
        list.forEach(function (n, j) {
          if (n === row) return;
          var sh = from < t && j > from && j <= t ? -hgt : t < from && j >= t && j < from ? hgt : 0;
          n.style.transform = sh ? "translateY(" + sh + "px)" : "";
        });
        if (t !== to) { to = t; apply(t); }
      }
      function up() {
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", up, true);
        document.removeEventListener("pointercancel", up, true);
        document.documentElement.classList.remove("ak-cs-dragging");
        if (!on) return;
        lastLyrDrag = Date.now();
        buildPanel(); draw(); if (to !== from) commit();
      }
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", up, true);
      document.addEventListener("pointercancel", up, true);
    }
    function paneLabels() {
      var k = kit, s = sec("Labels", el("small", { text: k.chips.length + " of 5" }), []);
      k.chips.forEach(function (c, i) { s.appendChild(labelRow(c, i)); });
      s.appendChild(el("div", { class: "ak-cs-h", style: "margin:4px 0 0" }, [
        link("+ Add label", function () { k.chips.push(chip("New point")); ed.sel = { type: "chip", i: k.chips.length - 1 }; buildPanel(); draw(); commit(); setHint(); }, k.chips.length >= 5),
        link("Auto-place all", function () { k.chips.forEach(function (c) { c.x = c.y = c.r = null; }); draw(); commit(); })
      ]));
      pane.appendChild(s);
      pane.appendChild(sec("Glass", null, [
        rowW("Tone", segEl([["dark", "Dark"], ["light", "Light"]], function () { return k.glass.tone; }, function (v) { k.glass.tone = v; draw(); commit(); })),
        rng("Tint", 0, 100, function () { return k.glass.tint; }, function (v) { k.glass.tint = v; }, { fmt: pct }),
        rng("Blur", 0, 48, function () { return k.glass.blur; }, function (v) { k.glass.blur = v; }),
        rng("All sizes", 70, 140, function () { return k.glass.size; }, function (v) { k.glass.size = v; }, { fmt: pct, def: 100, tip: "Each label also has its own size \u2014 select it to change" })
      ]));
    }
    function labelRow(c, i) {
      var t = textIn(function () { return c.t; }, function (v) { c.t = v; }, "Label text", 34);
      t.addEventListener("focus", function () { select({ type: "chip", i: i }); });
      var tget = function () { if (c.r != null) return c.r; var h = findHit(hits, { type: "chip", i: i }); return h ? Math.round(h.r) : 0; };
      return el("div", { class: "ak-cs-lbl", "data-chip": i }, [
        el("div", { class: "hd" }, [el("i", { text: String(i + 1) }), t, mini(IC.x, "Remove label", kit.chips.length <= 1, function () { removeChip(i); })]),
        el("div", { class: "bd" }, [
          rng("Size", 50, 250, function () { return c.s || 100; }, function (v) { c.s = v; }, { fmt: pct, def: 100 }),
          rng("Tilt", -45, 45, tget, function (v) { c.r = v; }, { fmt: deg, def: 0 })
        ])
      ]);
    }
    function paneColour() {
      var k = kit, cols = el("div", { class: "ak-cs-sws" });
      k.colors.forEach(function (c, i) {
        var inp = el("input", { type: "color", "aria-label": i === 0 ? "Primary colour" : "Colour " + (i + 1) });
        inp.value = c;
        var sw = el("label", { class: "ak-cs-sw", style: "background:" + c }, [inp]);
        inp.addEventListener("input", function () { k.colors[i] = inp.value; sw.style.background = inp.value; draw(); });
        inp.addEventListener("change", commit);
        cols.appendChild(el("div", { class: "ak-cs-swb" }, [sw, el("small", { text: i === 0 ? "Primary" : i === k.colors.length - 1 ? "Deep" : String(i + 1) }),
          i > 0 && k.colors.length > 2 ? el("button", { type: "button", class: "ak-cs-swx", title: "Remove colour", "aria-label": "Remove colour", onclick: function () { k.colors.splice(i, 1); buildPanel(); draw(); commit(); } }, ["\u00d7"]) : null]));
      });
      if (k.colors.length < 5) cols.appendChild(el("button", { type: "button", class: "ak-cs-add", title: "Add a colour", "aria-label": "Add a colour", onclick: function () {
        var m = k.colors.length; k.colors.splice(m - 1, 0, mix(k.colors[0], k.colors[m - 1], 0.5)); buildPanel(); draw(); commit();
      } }, ["+"]));
      var angle = rng("Angle", 0, 360, function () { return k.angle; }, function (v) { k.angle = v; }, { fmt: deg, def: 135 });
      angle.style.display = k.bg === "linear" ? "" : "none";
      pane.appendChild(sec("Gradient", link("Auto from primary", function () { k.colors = paletteFrom(k.colors[0]); buildPanel(); draw(); commit(); }), [cols,
        rowW("Style", segEl([["mesh", "Mesh"], ["linear", "Linear"]], function () { return k.bg; }, function (v) { k.bg = v; angle.style.display = v === "linear" ? "" : "none"; draw(); commit(); })),
        angle,
        rowW("Mirror", toggleEl(function () { return !!k.flip; }, function (v) { k.flip = v; draw(); commit(); }))
      ]));
      pane.appendChild(sec("Finish", null, [
        rng("Glow", 0, 100, function () { return k.glow; }, function (v) { k.glow = v; }, { fmt: pct, def: 30 }),
        rng("Depth", 0, 100, function () { return k.depth; }, function (v) { k.depth = v; }, { fmt: pct, def: 45 }),
        rng("Grain", 0, 100, function () { return k.grain; }, function (v) { k.grain = v; }, { fmt: pct, def: 20, tip: "Hides banding but adds file size (20% \u2248 250 KB, 0% \u2248 150 KB)" })
      ]));
    }
    function paneTitle() {
      var k = kit;
      var monoIn = textIn(function () { return k.logo.text; }, function (v) { k.logo.text = v.toUpperCase().slice(0, 3); }, "Letters", 3);
      var up = el("input", { type: "file", accept: "image/*", style: "display:none" });
      up.addEventListener("change", function () {
        var f = up.files && up.files[0]; if (!f) return;
        (env.fromFile ? env.fromFile(f) : readURL(f)).then(function (d) { k.logo.src = d; k.logo.mode = "image"; buildPanel(); reload(); commit(); });
      });
      var monoRow = rowW("Letters", monoIn), upRow = rowW("File", btn(k.logo.src ? "Replace logo" : "Upload logo", function () { up.click(); }));
      upRow.appendChild(up);
      monoRow.style.display = k.logo.mode === "mono" ? "" : "none"; upRow.style.display = k.logo.mode === "image" ? "" : "none";
      pane.appendChild(sec("Name", null, [
        rowW("Text", textIn(function () { return k.title; }, function (v) { k.title = v; }, item.title || "Project name", 28)),
        rowW("Font", segEl([["Inter", "Inter"], ["Space Grotesk", "Space Grotesk"]], function () { return k.font; }, function (v) { k.font = v; draw(); commit(); })),
        rng("Size", 60, 140, function () { return k.titleSize; }, function (v) { k.titleSize = v; }, { fmt: pct, def: 100 }),
        rng("Height", -140, 260, function () { return k.titleY; }, function (v) { k.titleY = v; }, { def: 0 })
      ]));
      pane.appendChild(sec("Logo", null, [
        rowW("Type", segEl([["mono", "Monogram"], ["image", "Upload"], ["none", "None"]], function () { return k.logo.mode; }, function (v) {
          k.logo.mode = v; monoRow.style.display = v === "mono" ? "" : "none"; upRow.style.display = v === "image" ? "" : "none"; reload(); commit();
        })),
        monoRow, upRow
      ]));
    }
    function togglePicker(wrap, d) {
      if (picker === wrap) { wrap.innerHTML = ""; picker = null; return; }
      if (picker) picker.innerHTML = "";
      picker = wrap;
      var g = el("div", { class: "ak-cs-pick" }), cur = d.scr || {};
      var done = function () { wrap.innerHTML = ""; picker = null; reload(); commit(); };
      imgBlocks(item).forEach(function (b, n) {
        var u = env.thumb ? env.thumb(b.src) : b.src;
        g.appendChild(el("button", { type: "button", class: cur.ref === b.id ? "on" : "", title: "Image " + (n + 1), "aria-label": "Use image " + (n + 1), style: "background-image:url('" + u + "')", onclick: function () { d.scr = { ref: b.id }; done(); } }));
      });
      var f = el("input", { type: "file", accept: "image/*", style: "display:none" });
      f.addEventListener("change", function () {
        var file = f.files && f.files[0]; if (!file) return;
        (env.fromFile ? env.fromFile(file) : readURL(file)).then(function (dd) { d.scr = { src: dd }; done(); });
      });
      g.appendChild(el("button", { type: "button", class: "up", onclick: function () { f.click(); } }, ["Upload"]));
      wrap.appendChild(g); wrap.appendChild(f);
    }
    function thumbsSoon() { clearTimeout(_tt); _tt = setTimeout(thumbs, 120); }
    function thumbs() {
      if (!kit) return;
      pane.querySelectorAll("canvas[data-thumb]").forEach(function (c) {
        var d = devById(kit, c.getAttribute("data-thumb")), x = c.getContext("2d");
        x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = "#111"; x.fillRect(0, 0, c.width, c.height);
        var q = d && cropNow(d); if (!q) return;
        var sx = q.c.x * q.iw, sy = q.c.y * q.ih, sw = q.c.w * q.iw, sh = Math.min(sw, q.ih - sy);
        if (sh <= 0 || sw <= 0) return;
        x.imageSmoothingQuality = "high"; x.drawImage(res.imgs[d.id], sx, sy, sw, sh, 0, 0, c.width, c.width * sh / sw);
      });
    }
    function readURL(f) { return new Promise(function (r) { var fr = new FileReader(); fr.onload = function () { r(fr.result); }; fr.readAsDataURL(f); }); }
    function doReset() {
      if (!confirm("Reset this cover to the standard layout? Your changes here will be replaced (Undo brings them back).")) return;
      defaults(item).then(function (k) { kit = k; ed.sel = null; buildPanel(); reload(); commit(); setHint(); });
    }
    function doRestore() {
      if (!env.onRestore) return;
      if (!confirm("Put back the cover this project had before Cover Studio? Your studio settings are kept for later.")) return;
      Promise.resolve(env.onRestore()).then(function () { close(true); });
    }
    function doSave() {
      if (!kit || saveBtn.classList.contains("ak-cs-busy")) return;
      saveBtn.classList.add("ak-cs-busy"); saveBtn.textContent = "Saving\u2026";
      var k = clone(kit);
      bakeKit(k, item, env.toWebp).then(function (url) { return env.onSave ? env.onSave(url, k) : null; }).then(function () { close(true); }, function (err) {
        saveBtn.classList.remove("ak-cs-busy"); saveBtn.textContent = "Save cover";
        alert("The cover could not be saved: " + ((err && err.message) || err));
      });
    }
  }

  window.AKCoverStudio = {
    open: open, bake: bake, defaults: defaults,
    render: function (kit, item, cv) { var k = normalize(clone(kit), item); return prepare(k, item).then(function (r) { paint(cv, k, r, null); return cv; }); }
  };
})();
