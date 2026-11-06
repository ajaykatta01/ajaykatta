/* Animated GIF tools for the admin photo sheet — loaded on demand (never for visitors).
   AK_ANIM.isAnimated(bytes)  GIF with 2+ frames, or WebP with the ANIM flag
   AK_ANIM.loopGif(bytes)     same GIF, set to loop forever
   AK_ANIM.canConvert()       this browser can decode GIF frames (ImageDecoder) and write WebP
   AK_ANIM.toWebp(blob,{scale,q,onProgress}) → {blob,w,h,frames}  looping animated WebP, built
                              frame by frame on-device (each frame = canvas WebP, muxed into ANMF chunks) */
(function () {
  "use strict";
  function u8(b) { return b instanceof Uint8Array ? b : new Uint8Array(b); }
  function str(b, o, n) { var s = ""; for (var i = 0; i < n; i++) s += String.fromCharCode(b[o + i]); return s; }
  function isGif(b) { return b.length > 13 && str(b, 0, 3) === "GIF"; }
  function gifFrames(b) {             // counts image descriptors by walking the block structure
    if (!isGif(b)) return 0;
    var p = 13, n = 0;
    if (b[10] & 0x80) p += 3 * (1 << ((b[10] & 7) + 1));
    function subs() { while (p < b.length && b[p]) p += b[p] + 1; p++; }
    while (p < b.length) {
      var t = b[p];
      if (t === 0x3B) break;
      if (t === 0x21) { p += 2; subs(); }
      else if (t === 0x2C) { n++; if (n > 1) return n; var pk = b[p + 9]; p += 10; if (pk & 0x80) p += 3 * (1 << ((pk & 7) + 1)); p++; subs(); }
      else break;
    }
    return n;
  }
  function isAnimated(bytes) {
    var b = u8(bytes);
    if (isGif(b)) return gifFrames(b) > 1;
    return b.length > 30 && str(b, 0, 4) === "RIFF" && str(b, 8, 4) === "WEBP" && str(b, 12, 4) === "VP8X" && !!(b[20] & 0x02);
  }
  function loopGif(bytes) {
    var b = u8(bytes); if (!isGif(b)) return b;
    for (var i = 13; i < b.length - 16; i++) {
      if (b[i] === 0x21 && b[i + 1] === 0xFF && b[i + 2] === 0x0B && str(b, i + 3, 11) === "NETSCAPE2.0") {
        if (b[i + 16] === 0 && b[i + 17] === 0) return b;
        var c = b.slice(); c[i + 16] = 0; c[i + 17] = 0; return c;
      }
    }
    var at = 13 + ((b[10] & 0x80) ? 3 * (1 << ((b[10] & 7) + 1)) : 0);
    var ext = [0x21, 0xFF, 0x0B].concat(Array.from("NETSCAPE2.0", function (ch) { return ch.charCodeAt(0); }), [3, 1, 0, 0, 0]);
    var out = new Uint8Array(b.length + ext.length);
    out.set(b.subarray(0, at), 0); out.set(ext, at); out.set(b.subarray(at), at + ext.length);
    return out;
  }
  var webpOK = null;
  function canWebp() {
    if (webpOK == null) { try { var c = document.createElement("canvas"); c.width = c.height = 1; webpOK = c.toDataURL("image/webp").indexOf("image/webp") > 0; } catch (e) { webpOK = false; } }
    return webpOK;
  }
  function canConvert() { return typeof window.ImageDecoder === "function" && canWebp(); }

  function le24(a, o, v) { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; a[o + 2] = (v >> 16) & 255; }
  function le32(a, o, v) { a[o] = v & 255; a[o + 1] = (v >> 8) & 255; a[o + 2] = (v >> 16) & 255; a[o + 3] = (v >>> 24) & 255; }
  function chunk(tag, payload) {
    var pad = payload.length & 1, c = new Uint8Array(8 + payload.length + pad);
    for (var i = 0; i < 4; i++) c[i] = tag.charCodeAt(i);
    le32(c, 4, payload.length); c.set(payload, 8); return c;
  }
  function cat(list) { var n = 0; list.forEach(function (x) { n += x.length; }); var o = new Uint8Array(n), p = 0; list.forEach(function (x) { o.set(x, p); p += x.length; }); return o; }
  /* the image chunks (ALPH + VP8 / VP8L) of a still WebP, as written by canvas */
  function frameChunks(b) {
    var out = [], alpha = false, p = 12;
    while (p + 8 <= b.length) {
      var tag = str(b, p, 4), len = b[p + 4] | (b[p + 5] << 8) | (b[p + 6] << 16) | (b[p + 7] << 24), end = p + 8 + len + (len & 1);
      if (tag === "ALPH" || tag === "VP8 " || tag === "VP8L") out.push(b.subarray(p, Math.min(end, b.length)));
      if (tag === "ALPH") alpha = true;
      if (tag === "VP8L" && (b[p + 8 + 4] & 0x10)) alpha = true;
      p = end;
    }
    return { data: cat(out), alpha: alpha };
  }
  function toBlob(cv, q) { return new Promise(function (r) { cv.toBlob(r, "image/webp", q); }); }

  function toWebp(blob, o) {
    o = o || {};
    var q = o.q == null ? 0.92 : o.q, scale = o.scale || 1, dec, cv, cx, W, H, frames = [], alpha = false;
    return blob.arrayBuffer().then(function (ab) {
      dec = new ImageDecoder({ data: ab, type: blob.type || "image/gif" });
      return dec.tracks.ready;
    }).then(function () {
      var n = dec.tracks.selectedTrack.frameCount, i = 0;
      function next() {
        if (i >= n) return Promise.resolve();
        return dec.decode({ frameIndex: i, completeFramesOnly: true }).then(function (r) {
          var f = r.image, sw = f.displayWidth, sh = f.displayHeight;
          if (!cv) {
            W = Math.max(1, Math.round(sw * scale)); H = Math.max(1, Math.round(sh * scale));
            cv = document.createElement("canvas"); cv.width = W; cv.height = H;
            cx = cv.getContext("2d"); cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
          }
          cx.clearRect(0, 0, W, H); cx.drawImage(f, 0, 0, W, H);
          var ms = Math.round((f.duration || 0) / 1000); if (ms <= 10) ms = 100;   // browsers treat 0–10 ms GIF delays as 100 ms
          f.close();
          return toBlob(cv, q).then(function (b) {
            if (!b || b.type !== "image/webp") throw new Error("This browser cannot write WebP.");
            return b.arrayBuffer();
          }).then(function (fb) {
            var fc = frameChunks(new Uint8Array(fb)); if (fc.alpha) alpha = true;
            frames.push({ d: fc.data, ms: Math.min(ms, 0xFFFFFF) });
            i++; if (o.onProgress) o.onProgress(i, n);
            return next();
          });
        });
      }
      return next();
    }).then(function () {
      try { dec.close(); } catch (e) {}
      var x = new Uint8Array(10); x[0] = 0x02 | (alpha ? 0x10 : 0); le24(x, 4, W - 1); le24(x, 7, H - 1);
      var an = new Uint8Array(6);                            // background 0,0,0,0 · loop 0 = forever
      var parts = [chunk("VP8X", x), chunk("ANIM", an)];
      frames.forEach(function (f) {
        var hd = new Uint8Array(16);
        le24(hd, 0, 0); le24(hd, 3, 0); le24(hd, 6, W - 1); le24(hd, 9, H - 1); le24(hd, 12, f.ms);
        hd[15] = 0x02;                                         // full composited frames: no blend, no dispose
        parts.push(chunk("ANMF", cat([hd, f.d])));
      });
      var body = cat(parts), riff = new Uint8Array(12);
      riff.set([82, 73, 70, 70], 0); le32(riff, 4, body.length + 4); riff.set([87, 69, 66, 80], 8);
      cv.width = cv.height = 1;
      return { blob: new Blob([riff, body], { type: "image/webp" }), w: W, h: H, frames: frames.length };
    }, function (e) { try { dec && dec.close(); } catch (_) {} if (cv) cv.width = cv.height = 1; throw e; });
  }
  window.AK_ANIM = { isAnimated: isAnimated, loopGif: loopGif, canConvert: canConvert, toWebp: toWebp, frameCount: function (b) { return gifFrames(u8(b)); } };
})();
