/* GIF → MP4 for the About · Interests clips — admin only, loaded on demand by site-edit.js.
   AK_MP4.canConvert()            → Promise<boolean>  (ImageDecoder + H.264 VideoEncoder: desktop Chrome / Edge)
   AK_MP4.fromGif(blob, {onProgress}) → Promise<{mp4, still, w, h, frames, ms, qp}>
   Same recipe as the converted site clips: every GIF frame + its own delay, H.264 High (avc1.640028),
   own RGB → I420 BT.709 limited range + a colr (nclx) box so colours match the GIF in every player,
   QP 28 (30 when that is still > 20% of the GIF), fast start. still = frame 1 as WebP q .92. */
(function () {
  "use strict";
  var MUX = "mp4-muxer.js?v=1", CODEC = "avc1.640028", _mux = null;
  var CS = { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false };
  function loadMux() {
    if (window.Mp4Muxer) return Promise.resolve(window.Mp4Muxer);
    if (_mux) return _mux;
    return (_mux = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = MUX;
      s.onload = function () { window.Mp4Muxer ? res(window.Mp4Muxer) : rej(new Error("no Mp4Muxer")); };
      s.onerror = function () { _mux = null; s.remove(); rej(new Error("mp4-muxer.js didn't load")); };
      document.head.appendChild(s);
    }));
  }
  function canConvert() {
    if (typeof window.ImageDecoder !== "function" || typeof window.VideoEncoder !== "function" || typeof window.OffscreenCanvas !== "function") return Promise.resolve(false);
    return VideoEncoder.isConfigSupported({ codec: CODEC, width: 480, height: 270, bitrateMode: "quantizer" })
      .then(function (s) { return !!(s && s.supported); }, function () { return false; });
  }
  function toI420(d, W, H, out) {
    var cw = W >> 1, ch = H >> 1, U = W * H, V = U + cw * ch, x, y, k;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) {
      k = (y * W + x) * 4;
      out[y * W + x] = Math.round(16 + 219 * (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255);
    }
    for (y = 0; y < ch; y++) for (x = 0; x < cw; x++) {
      var r = 0, g = 0, b = 0;
      for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) { k = ((2 * y + dy) * W + 2 * x + dx) * 4; r += d[k]; g += d[k + 1]; b += d[k + 2]; }
      r /= 1020; g /= 1020; b /= 1020;
      var yy = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      out[U + y * cw + x] = Math.max(16, Math.min(240, Math.round(128 + 224 * (b - yy) / 1.8556)));
      out[V + y * cw + x] = Math.max(16, Math.min(240, Math.round(128 + 224 * (r - yy) / 1.5748)));
    }
    return out;
  }
  /* colr (nclx · BT.709 · limited) into the avc1 sample entry; moov is first (fast start), so every chunk offset moves by 19 */
  function addColr(b) {
    function rd(a, o) { return ((a[o] << 24) | (a[o + 1] << 16) | (a[o + 2] << 8) | a[o + 3]) >>> 0; }
    function tag(o) { return String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]); }
    var path = [];
    function find(start, end, names) {
      for (var o = start; o + 8 <= end;) {
        var sz = rd(b, o), t = tag(o);
        if (!sz) return -1;
        if (t === names[0]) { path.push(o); if (names.length === 1) return o; return find(o + (t === "stsd" ? 16 : t === "avc1" ? 86 : 8), o + sz, names.slice(1)); }
        o += sz;
      }
      return -1;
    }
    var avc1 = find(0, b.length, ["moov", "trak", "mdia", "minf", "stbl", "stsd", "avc1"]);
    if (avc1 < 0) return b;
    var colr = [0, 0, 0, 19, 99, 111, 108, 114, 110, 99, 108, 120, 0, 1, 0, 1, 0, 1, 0];
    var at = avc1 + rd(b, avc1), out = new Uint8Array(b.length + 19);
    out.set(b.subarray(0, at), 0); out.set(colr, at); out.set(b.subarray(at), at + 19);
    function wr(o, v) { out[o] = v >>> 24; out[o + 1] = (v >> 16) & 255; out[o + 2] = (v >> 8) & 255; out[o + 3] = v & 255; }
    path.forEach(function (o) { wr(o, rd(out, o) + 19); });
    var moov = path[0], mEnd = moov + rd(out, moov);
    for (var o = moov; o + 8 <= mEnd; o++) {
      if (out[o + 4] === 115 && out[o + 5] === 116 && out[o + 6] === 99 && out[o + 7] === 111) {   // stco
        var n = rd(out, o + 12); for (var i = 0; i < n; i++) wr(o + 16 + i * 4, rd(out, o + 16 + i * 4) + 19);
        break;
      }
    }
    return out;
  }
  function encode(M, ab, type, qp, wantStill, onProgress) {
    var dec = new ImageDecoder({ data: ab, type: type }), N = 0, W, H, EW, EH, cv, cx, yuv, enc, mux, target, ts = 0, still = null, err = null;
    return dec.tracks.ready.then(function () {
      N = dec.tracks.selectedTrack.frameCount;
      var i = 0;
      function next() {
        if (err) return Promise.reject(err);
        if (i >= N) return Promise.resolve();
        return dec.decode({ frameIndex: i, completeFramesOnly: true }).then(function (r) {
          var f = r.image;
          if (!cv) {
            W = f.displayWidth; H = f.displayHeight; EW = W + (W & 1); EH = H + (H & 1);
            cv = new OffscreenCanvas(EW, EH); cx = cv.getContext("2d", { willReadFrequently: true });
            yuv = new Uint8Array(EW * EH * 3 / 2);
            target = new M.ArrayBufferTarget();
            mux = new M.Muxer({ target: target, video: { codec: "avc", width: EW, height: EH }, fastStart: "in-memory", firstTimestampBehavior: "offset" });
            enc = new VideoEncoder({
              output: function (c, m) { if (m && m.decoderConfig) m = { decoderConfig: Object.assign({}, m.decoderConfig, { colorSpace: CS }) }; mux.addVideoChunk(c, m); },
              error: function (e) { err = e; }
            });
            enc.configure({ codec: CODEC, width: EW, height: EH, bitrateMode: "quantizer", latencyMode: "quality", avc: { format: "avc" } });
          }
          var ms = Math.round((f.duration || 0) / 1000); if (ms <= 10) ms = 100;   // browsers play 0–10 ms GIF delays as 100 ms
          cx.fillStyle = "#0E0C0A"; cx.fillRect(0, 0, EW, EH);
          if (EW !== W || EH !== H) cx.drawImage(f, 0, 0, EW, EH);
          cx.drawImage(f, 0, 0); f.close();
          var shot = (i === 0 && wantStill) ? cv.convertToBlob({ type: "image/webp", quality: 0.92 }).then(function (b) { still = b; }) : Promise.resolve();
          return shot.then(function () {
            var vf = new VideoFrame(toI420(cx.getImageData(0, 0, EW, EH).data, EW, EH, yuv), { format: "I420", codedWidth: EW, codedHeight: EH, timestamp: ts * 1000, duration: ms * 1000, colorSpace: CS });
            enc.encode(vf, { keyFrame: i === 0, avc: { quantizer: qp } }); vf.close();
            ts += ms; i++;
            if (onProgress) onProgress(i, N);
            return enc.encodeQueueSize > 8 ? new Promise(function (r) { setTimeout(r, 0); }) : null;
          }).then(next);
        });
      }
      return next();
    }).then(function () { return enc.flush(); }).then(function () {
      if (err) throw err;
      enc.close(); dec.close(); mux.finalize();
      cv.width = cv.height = 1;
      return { mp4: new Blob([addColr(new Uint8Array(target.buffer))], { type: "video/mp4" }), still: still, w: EW, h: EH, frames: N, ms: ts, qp: qp };
    }, function (e) { try { enc && enc.close(); } catch (_) {} try { dec.close(); } catch (_) {} throw e; });
  }
  function fromGif(blob, o) {
    o = o || {};
    var type = blob.type || "image/gif";
    return Promise.all([loadMux(), blob.arrayBuffer()]).then(function (r) {
      var M = r[0], ab = r[1];
      return encode(M, ab, type, 28, true, o.onProgress).then(function (a) {
        if (a.mp4.size <= blob.size * 0.2) return a;
        if (o.onProgress) o.onProgress(0, a.frames, "pass2");
        return encode(M, ab, type, 30, false, o.onProgress).then(function (b) { b.still = a.still; return b.mp4.size < a.mp4.size ? b : a; });
      });
    });
  }
  window.AK_MP4 = { canConvert: canConvert, fromGif: fromGif };
})();
