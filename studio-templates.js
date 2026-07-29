/* ============================================================================
   Ajay Katta Portfolio — Layout Studio · PROJECT TEMPLATES
   ----------------------------------------------------------------------------
   ONE registry, ONE clearly-labeled section per project category. This is the
   file to edit when you want to change how a category looks or lays out inside
   Layout Studio. To explain an edit to Claude (or any AI) later, just say e.g.
   "edit the UI/UX section in studio-templates.js".

   Categories are keyed by the page's window.AK_ADMIN.page value:
       "ui-ux"   -> UI / UX case studies      (project-ui-ux.html)
       "gen-ai"  -> AI / generative work       (project-gen-ai.html)
       "3d"      -> 3D product & render work    (project-3d.html)

   DESIGN NOTE (per product decision): every category shares the SAME layout
   structure — a centered vertical column of media "cards" on a freeform 1200-
   unit canvas. Only the ACCENT color, BACKGROUND and LABEL differ per category
   (see the CATEGORIES table below). Change a category's accent there and it
   recolors that category's Studio chrome + new-project placeholders.

   Exposed API — window.AKStudioTemplates:
     forPage(page)            -> { key, label, accent, accent2, bg, titleColor, muted }
     buildFromItem(item,page) -> Promise<{h,bg,els,groups}>   project media -> canvas
     blankTemplate(page)      -> {h,bg,els,groups}            placeholders for a NEW project

   Canvas element shape (matches layout-studio.js):
     { id, kind:'rect'|'ellipse', x, y, w, h, r, fill, stroke, strokeW,
       opacity, content:{ type:'image'|'media'|'prototype'|'model'|'pdf'|'text', ... } }
============================================================================ */
(function () {
  "use strict";
  if (window.AKStudioTemplates) return;

  var DW = 1200; // design width in units — must match layout-studio.js

  /* ==========================================================================
     CATEGORY TABLE  —  edit accent / bg / label here, one row per category.
     ========================================================================== */
  var CATEGORIES = {
    /* ---- UI / UX ------------------------------------------------------- */
    "ui-ux": {
      key: "ui-ux", label: "UI / UX",
      accent: "#FF6B5C", accent2: "#E85949",
      bg: "#0B0D12", titleColor: "#F4F6FA", muted: "#B2BAC7"
    },
    /* ---- AI / generative ---------------------------------------------- */
    "gen-ai": {
      key: "gen-ai", label: "AI",
      accent: "#C792EA", accent2: "#B388FF",
      bg: "#0B0D12", titleColor: "#F4F6FA", muted: "#B2BAC7"
    },
    /* ---- 3D product & render ------------------------------------------ */
    "3d": {
      key: "3d", label: "3D",
      accent: "#5CCFE6", accent2: "#8FE0F0",
      bg: "#0B0D12", titleColor: "#F4F6FA", muted: "#B2BAC7"
    },
    /* fallback for any unknown page — site orange */
    "_default": {
      key: "_default", label: "Studio",
      accent: "#E5783A", accent2: "#C2410C",
      bg: "#1C1A14", titleColor: "#FFFFFF", muted: "#C9C8C6"
    }
  };

  /* ==========================================================================
     SHARED LAYOUT ENGINE  —  identical for every category.
     ========================================================================== */
  function uid() { return "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /* Measure a media block's aspect ratio (w/h). Resolves null on failure or
     after a short timeout so opening the Studio never hangs on a slow asset. */
  function mediaAspect(block) {
    return new Promise(function (res) {
      var src = block && block.src;
      if (!src) return res(null);
      var done = false;
      var to = setTimeout(function () { if (!done) { done = true; res(null); } }, 3000);
      function finish(v) { if (done) return; done = true; clearTimeout(to); res(v); }
      if (block.type === "media" && (block.mime || "").indexOf("audio") !== 0) {
        var v = document.createElement("video");
        v.preload = "metadata"; v.muted = true;
        v.onloadedmetadata = function () { finish(v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : null); };
        v.onerror = function () { finish(null); };
        try { v.src = src; } catch (e) { finish(null); }
      } else if (block.type === "image") {
        var im = new Image();
        im.onload = function () { finish(im.naturalWidth && im.naturalHeight ? im.naturalWidth / im.naturalHeight : null); };
        im.onerror = function () { finish(null); };
        try { im.src = src; } catch (e) { finish(null); }
      } else { finish(null); }
    });
  }

  /* One project block -> one canvas card (size + content). Aspect-aware for
     media so a portrait phone screen becomes a slim centered card and a wide
     dashboard spans the column. x/y are assigned by the caller. */
  /* Readable text color for a given canvas background (section templates use a
     white card background, category defaults use near-black). */
  function inkFor(bg, cat) {
    var m = /^#([0-9a-f]{6})$/i.exec(String(bg || "").trim());
    if (!m) return cat.titleColor;
    var n = parseInt(m[1], 16), R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
    return (0.299 * R + 0.587 * G + 0.114 * B) > 150 ? "#11141A" : cat.titleColor;
  }

  function cardFor(b, aspect, cat, ink) {
    var t = b.type, w = 1040, hh = 640, r = 14, fill = "none", content = null;
    if (t === "image" || t === "media") {
      var isAudio = t === "media" && (b.mime || "").indexOf("audio") === 0;
      if (isAudio) {
        w = 1040; hh = 90;
        content = { type: "media", src: b.src, mime: b.mime };
      } else {
        var a = aspect || (t === "media" ? 16 / 9 : 1.4);
        w = 1040;                         // full column width — mirrors the classic stacked project
        hh = Math.min(3600, Math.max(120, Math.round(w / a)));
        content = (t === "media")
          ? { type: "media", src: b.src, mime: b.mime || "video/mp4", fit: "cover" }
          : { type: "image", src: b.src, fit: "cover" };
      }
    } else if (t === "prototype") {
      w = 1040; hh = 760; content = { type: "prototype", src: b.src };
    } else if (t === "model") {
      w = 760; hh = 620; r = 16; content = { type: "model", src: b.src, format: b.format };
    } else if (t === "pdf") {
      w = 1040; hh = 760; content = { type: "pdf", src: b.src };
    } else if (t === "text") {
      var tstr = (b.section ? (b.heading || b.body) : (b.text || b.body || b.heading || b.caption)) || "Text";
      w = 1040; hh = b.section ? 96 : 160;
      content = {
        type: "text", text: tstr,
        font: b.section ? "'Space Grotesk','Inter',sans-serif" : "'Inter',sans-serif", size: b.section ? 40 : 26, weight: b.section ? 700 : 500,
        color: ink || cat.titleColor, ls: 0, lh: 1.3, align: "left", valign: "middle",
        pt: 8, pr: 8, pb: 8, pl: 8
      };
    } else {
      w = 800; hh = 300; fill = "rgba(255,255,255,0.03)";
    }
    return { id: uid(), kind: "rect", x: 0, y: 0, w: w, h: hh, r: r, fill: fill, stroke: "", strokeW: 0, opacity: 1, content: content };
  }

  /* ==========================================================================
     PUBLIC API
     ========================================================================== */
  window.AKStudioTemplates = {
    forPage: function (page) { return CATEGORIES[page] || CATEGORIES._default; },

    /* Convert a project's blocks into a freeform canvas design (vertical column).
       Returns a Promise because media dimensions are measured first for fidelity. */
    buildFromItem: function (item, page, sections) {
      var cat = this.forPage(page);
      var blocks = ((item && item.blocks) || []).filter(function (b) { return b && b.type; });
      if (!blocks.length) return Promise.resolve(this.blankTemplate(page, sections));
      return Promise.all(blocks.map(function (b) {
        return (b.type === "image" || b.type === "media") ? mediaAspect(b) : Promise.resolve(null);
      })).then(function (aspects) {
        var els = [], y = 72, GAP = 56;
        blocks.forEach(function (b, i) {
          var card = cardFor(b, aspects[i], cat);
          card.y = y;
          card.x = Math.round((DW - card.w) / 2);
          card.sb = b.id;                 // provenance: which project block this card came from
          els.push(card);
          y += card.h + GAP;
        });
        return { h: Math.max(700, y - GAP + 72), bg: (item && item.bg) || cat.bg, els: els, groups: {} };
      });
    },

    /* Placeholder frames for a brand-new project. When `sections` (the site's
       section skeleton, e.g. Overview/Problem/Research/…) is passed, the template
       imports it: each section becomes a heading (+ prompt) with a media frame
       beneath, so the Studio template matches the site's "Template" button. */
    blankTemplate: function (page, sections) {
      /* AI category defaults to a bento grid (product decision) — every other
         category keeps the classic section/placeholder column below. */
      if (page === "gen-ai") return this.bentoTemplate(page);
      var cat = this.forPage(page);
      var head = "'Space Grotesk','Inter',sans-serif";
      function ph(x, y, w, hh, label) {
        return {
          id: uid(), kind: "rect", x: x, y: y, w: w, h: hh, r: 14,
          fill: "rgba(255,255,255,0.03)", stroke: cat.accent, strokeW: 2, opacity: 1,
          content: { type: "text", text: label, font: "'Inter',sans-serif", size: 18, weight: 600, color: cat.accent, ls: 0.5, lh: 1.4, align: "center", valign: "middle", pt: 12, pr: 16, pb: 12, pl: 16 }
        };
      }
      function txt(x, y, w, hh, text, size, weight, color, font) {
        return {
          id: uid(), kind: "rect", x: x, y: y, w: w, h: hh, r: 0,
          fill: "none", stroke: "", strokeW: 0, opacity: 1,
          content: { type: "text", text: text, font: font || "'Inter',sans-serif", size: size, weight: weight, color: color, ls: 0, lh: 1.2, align: "left", valign: "middle", pt: 0, pr: 0, pb: 0, pl: 0 }
        };
      }
      if (sections && sections.length) {
        var CARD = "#FFFFFF", CARD_LN = "#E6E3DD", TITLE_DARK = "#11141A", BODY_MUT = "#5A5F6B";
        function box(x, yy, w, hh) { return { id: uid(), kind: "rect", x: x, y: yy, w: w, h: hh, r: 18, fill: CARD, stroke: CARD_LN, strokeW: 1, opacity: 1, content: null }; }
        function phz(x, yy, w, hh, label) { return { id: uid(), kind: "rect", x: x, y: yy, w: w, h: hh, r: 14, fill: "rgba(0,0,0,0.02)", stroke: cat.accent, strokeW: 2, opacity: 1, content: { type: "placeholder", accept: "image/*,video/*", label: label } }; }
        function pad2(n) { return (n < 10 ? "0" : "") + n; }
        var sEls = [], groups = {}, y = 72, PADX = 36;
        sEls.push(txt(80, y, 1040, 84, "New " + cat.label + " project", 54, 700, TITLE_DARK, head)); y += 116;
        sections.forEach(function (s, i) {
          var grp = "seg" + (i + 1);                                    // one group per section -> shows in Layers
          groups[grp] = { name: pad2(i + 1) + "  " + s.heading };
          var inX = 80 + PADX, inW = 1040 - PADX * 2, mediaY = 118 + (s.body ? 62 : 0), cardH = mediaY + 320 + 36;
          var cardEls = [
            box(80, y, 1040, cardH),                                    // content box (white card)
            txt(inX, y + 28, 200, 22, pad2(i + 1), 15, 700, cat.accent, head), // number
            txt(inX, y + 52, inW, 46, s.heading, 30, 700, TITLE_DARK, head)    // heading
          ];
          if (s.body) cardEls.push(txt(inX, y + 104, inW, 56, s.body, 16, 400, BODY_MUT)); // prompt
          cardEls.push(phz(inX, y + mediaY, inW, 320, "Double-click to import image or video")); // import drop-zone
          cardEls.forEach(function (e) { e.grp = grp; sEls.push(e); });
          y += cardH + 40;
        });
        return { h: y + 24, bg: CARD, els: sEls, groups: groups };
      }
      var els = [
        txt(80, 64, 1040, 90, "New " + cat.label + " project", 60, 700, cat.titleColor, "'Space Grotesk','Inter',sans-serif"),
        txt(80, 168, 1040, 48, "Replace these frames with your media, then arrange freely.", 22, 500, cat.muted),
        ph(80, 258, 1040, 470, "Cover image — select this frame, then use the Image tool to replace"),
        ph(80, 760, 500, 380, "Image"),
        ph(620, 760, 500, 380, "Image"),
        ph(80, 1180, 1040, 700, "Prototype / video embed")
      ];
      return { h: 1930, bg: cat.bg, els: els, groups: {} };
    },

    /* Append project blocks to an EXISTING canvas design, below everything already
       placed. Keeps a freeform (Studio) project in sync with content added later
       through "Add content" or the section "Template" button — without this, new
       blocks are saved but never appear, because the canvas replaces the stack.
       Each appended card carries .sb = block id, so it is only ever added once. */
    appendBlocks: function (design, blocks, page) {
      var cat = this.forPage(page);
      blocks = (blocks || []).filter(function (b) { return b && b.type; });
      if (!design || !blocks.length) return Promise.resolve(design);
      return Promise.all(blocks.map(function (b) {
        return (b.type === "image" || b.type === "media") ? mediaAspect(b) : Promise.resolve(null);
      })).then(function (aspects) {
        var els = design.els || (design.els = []);
        var ink = inkFor(design.bg, cat), GAP = 56, bottom = 24;
        els.forEach(function (e) { if (e && !e.hidden) bottom = Math.max(bottom, (e.y || 0) + (e.h || 0)); });
        var y = bottom + GAP;
        blocks.forEach(function (b, i) {
          var card = cardFor(b, aspects[i], cat, ink);
          card.y = y;
          card.x = Math.round((DW - card.w) / 2);
          card.sb = b.id;
          els.push(card);
          y += card.h + GAP;
        });
        design.h = Math.max(design.h || 700, y - GAP + 72);
        return design;
      });
    },

    /* Bento-grid starter — six sized tiles (every tile a clickable "bento"
       detail card, matching the Bento tool). Used as the DEFAULT layout for a
       new AI project. Themed to the category accent / background. */
    bentoTemplate: function (page) {
      var cat = this.forPage(page);
      var head = "'Space Grotesk','Inter',sans-serif";
      var surface = "#15161C", line = "#262A36";
      function txt(x, y, w, hh, text, size, weight, color, font) {
        return { id: uid(), kind: "rect", x: x, y: y, w: w, h: hh, r: 0, fill: "none", stroke: "", strokeW: 0, opacity: 1,
          content: { type: "text", text: text, font: font || "'Inter',sans-serif", size: size, weight: weight, color: color, ls: 0, lh: 1.25, align: "left", valign: "middle", pt: 0, pr: 0, pb: 0, pl: 0 } };
      }
      function tile(name, x, y, w, hh, hero) {
        return { id: uid(), kind: "rect", x: x, y: y, w: w, h: hh, r: 20,
          fill: surface, stroke: hero ? cat.accent : line, strokeW: hero ? 1.5 : 1, opacity: 1,
          content: null, bento: true, detail: { eyebrow: name, title: "", body: "", tags: [], refs: [] } };
      }
      var TOP = 196;
      var boxes = [
        ["HERO",   40,  TOP,       550,  380, true],
        ["MEDIUM", 610, TOP,       550,  180, false],
        ["SMALL",  610, TOP + 200, 265,  180, false],
        ["TALL",   895, TOP + 200, 265,  380, false],
        ["WIDE",   40,  TOP + 400, 835,  180, false],
        ["FULL",   40,  TOP + 620, 1120, 620, false]
      ];
      var els = [
        txt(40, 58, 1040, 66, "New " + cat.label + " project", 46, 700, cat.titleColor, head),
        txt(40, 130, 1040, 40, "Bento layout \u2014 click any tile to add its image and prompt details.", 18, 500, cat.muted)
      ];
      boxes.forEach(function (b) { els.push(tile(b[0], b[1], b[2], b[3], b[4], b[5])); });
      return { h: TOP + 620 + 620 + 48, bg: cat.bg, els: els, groups: {} };
    }
  };
})();
