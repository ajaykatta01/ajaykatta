/* ============================================================================
   scroll-progress.js — reading-progress indicator for the project pages.

   Self-contained: injects its own <style> + DOM, needs no markup changes.
   Loaded on every project page (project-ui-ux / project-gen-ai / project-3d)
   so ALL current and future case studies/projects track scroll progress —
   both the index grid and the admin-rendered detail views.

   • A thin gradient bar pinned to the very top of the viewport (the % fill).
   • A circular badge (bottom-LEFT, clear of the admin FAB at bottom-right)
     showing the live percentage; click it to jump back to the top.

   Adapts to light/dark automatically via the shared theme CSS variables.
============================================================================ */
(function () {
  if (window.__akScrollProgress) return;        // guard against double-load
  window.__akScrollProgress = true;

  var REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- styles ---------- */
  var css = ''
    + '.ak-progress-bar{position:fixed;top:0;left:0;height:3px;width:0;z-index:60;'
    +   'background:linear-gradient(90deg,var(--accent),var(--accent-2));'
    +   'box-shadow:0 0 10px color-mix(in srgb,var(--accent) 55%,transparent);'
    +   'border-radius:0 2px 2px 0;transition:width .12s linear;will-change:width;pointer-events:none}'
    + '.ak-progress-ring{position:fixed;bottom:24px;left:24px;z-index:60;'
    +   'width:56px;height:56px;padding:0;border-radius:50%;cursor:grab;touch-action:none;'
    +   'display:flex;align-items:center;justify-content:center;'
    +   'background:color-mix(in srgb,var(--surface) 82%,transparent);backdrop-filter:blur(10px);'
    +   'border:1px solid var(--line);box-shadow:0 12px 30px -14px rgba(0,0,0,.55);'
    +   'opacity:0;transform:translateY(14px) scale(.9);pointer-events:none;'
    +   'transition:opacity .35s ease,transform .35s cubic-bezier(.2,.7,.3,1),border-color .25s}'
    + '.ak-progress-ring.on{opacity:1;transform:none;pointer-events:auto}'
    + '.ak-progress-ring:hover{border-color:var(--accent)}'
    + '.ak-progress-ring:focus-visible{outline:2px solid var(--accent);outline-offset:3px}'
    + '.ak-progress-ring.dragging{cursor:grabbing;transition:none;box-shadow:0 18px 42px -12px rgba(0,0,0,.6)}'
    + '.ak-progress-ring.dragging .pct{opacity:1}'
    + '.ak-progress-ring.dragging .up{opacity:0}'
    + '.ak-progress-ring svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}'
    + '.ak-progress-ring .trk{fill:none;stroke:var(--line);stroke-width:3}'
    + '.ak-progress-ring .val{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;transition:stroke-dashoffset .12s linear}'
    + '.ak-progress-ring .pct{font-family:\'Space Mono\',monospace;font-weight:700;font-size:.72rem;color:var(--text);position:relative;z-index:1;transition:opacity .22s}'
    + '.ak-progress-ring .up{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .22s;color:var(--accent);font-size:1.05rem;line-height:1}'
    + '.ak-progress-ring:hover .pct{opacity:0}'
    + '.ak-progress-ring:hover .up{opacity:1}'
    + '@media (max-width:760px){.ak-progress-ring{width:48px;height:48px;bottom:16px;left:16px}.ak-progress-ring .pct{font-size:.66rem}}'
    + '@media print{.ak-progress-bar,.ak-progress-ring{display:none!important}}';

  var st = document.createElement('style');
  st.id = 'ak-progress-css';
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- DOM ---------- */
  var bar = document.createElement('div');
  bar.className = 'ak-progress-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Page scroll progress');
  bar.setAttribute('aria-valuemin', '0');
  bar.setAttribute('aria-valuemax', '100');
  bar.setAttribute('aria-valuenow', '0');

  var R = 25.5, C = 2 * Math.PI * R;
  var ring = document.createElement('button');
  ring.className = 'ak-progress-ring';
  ring.type = 'button';
  ring.title = 'Scroll progress — click to return to top';
  ring.setAttribute('aria-label', 'Scroll progress. Click to return to top.');
  ring.innerHTML =
    '<svg viewBox="0 0 56 56" aria-hidden="true">'
    + '<circle class="trk" cx="28" cy="28" r="' + R + '"></circle>'
    + '<circle class="val" cx="28" cy="28" r="' + R + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + C.toFixed(2) + '"></circle>'
    + '</svg>'
    + '<span class="pct">0%</span>'
    + '<span class="up" aria-hidden="true">&uarr;</span>';

  document.body.appendChild(bar);
  document.body.appendChild(ring);

  var valCircle = ring.querySelector('.val');
  var pctLabel = ring.querySelector('.pct');

  /* ---------- drag to reposition (click without drag = jump to top) ---------- */
  var POS_KEY = 'ak-progress-pos';
  var custom = null;               // {x,y} when the user has parked it somewhere
  var drag = null, moved = false, suppressClick = false;
  var MARGIN = 8;

  function clampX(x) { return Math.min(Math.max(MARGIN, x), innerWidth - ring.offsetWidth - MARGIN); }
  function clampY(y) { return Math.min(Math.max(MARGIN, y), innerHeight - ring.offsetHeight - MARGIN); }
  function place(x, y) {
    ring.style.left = clampX(x) + 'px';
    ring.style.top = clampY(y) + 'px';
    ring.style.right = 'auto';
    ring.style.bottom = 'auto';
  }
  // restore a saved position from a previous drag (shared across project pages)
  try {
    var saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') custom = saved;
  } catch (e) {}
  if (custom) place(custom.x, custom.y);

  ring.addEventListener('pointerdown', function (e) {
    if (e.button != null && e.button !== 0) return;
    var r = ring.getBoundingClientRect();
    drag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top };
    moved = false;
    try { ring.setPointerCapture(e.pointerId); } catch (_) {}
  });
  ring.addEventListener('pointermove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!moved) {
      if (Math.hypot(dx, dy) < 4) return;   // ignore tiny jitters so a click still counts
      moved = true;
      ring.classList.add('dragging');
    }
    place(drag.ox + dx, drag.oy + dy);
  });
  function endDrag(e) {
    if (!drag) return;
    try { ring.releasePointerCapture(e.pointerId); } catch (_) {}
    if (moved) {
      ring.classList.remove('dragging');
      suppressClick = true;               // the click that follows a drag isn't a real tap
      var r = ring.getBoundingClientRect();
      custom = { x: r.left, y: r.top };
      try { localStorage.setItem(POS_KEY, JSON.stringify(custom)); } catch (_) {}
    }
    drag = null;
  }
  ring.addEventListener('pointerup', endDrag);
  ring.addEventListener('pointercancel', endDrag);

  ring.addEventListener('click', function () {
    if (suppressClick) { suppressClick = false; return; }
    window.scrollTo({ top: 0, behavior: REDUCE ? 'auto' : 'smooth' });
  });

  // keep a parked badge inside the viewport when it resizes
  addEventListener('resize', function () {
    if (custom) { place(custom.x, custom.y); var r = ring.getBoundingClientRect(); custom = { x: r.left, y: r.top }; }
  }, { passive: true });

  /* ---------- update ---------- */
  var ticking = false;
  function measure() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - doc.clientHeight;
    var y = window.scrollY || doc.scrollTop || 0;
    var pct = max > 4 ? Math.min(1, Math.max(0, y / max)) : 0;
    var whole = Math.round(pct * 100);

    bar.style.width = (pct * 100) + '%';
    bar.setAttribute('aria-valuenow', String(whole));

    valCircle.style.strokeDashoffset = (C * (1 - pct)).toFixed(2);
    pctLabel.textContent = whole + '%';

    // reveal the badge once there's a meaningful amount to scroll and we've moved
    if (max > 240 && y > 60) ring.classList.add('on');
    else ring.classList.remove('on');

    ticking = false;
  }
  function onScroll() { if (!ticking) { requestAnimationFrame(measure); ticking = true; } }

  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
  addEventListener('load', measure);
  // content height changes when admin injects tiles or a detail view / tab opens
  if (window.ResizeObserver) {
    try { new ResizeObserver(onScroll).observe(document.body); } catch (e) {}
  }
  measure();
})();
