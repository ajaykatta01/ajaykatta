/* ============================================================
   Shared theme toggle — water-ripple reveal
   Used on every page. Requires a #themeToggle button containing
   a #knob element, the shared CSS theme vars, and the `ak-theme`
   localStorage convention.

   The new theme is revealed through a rippled mask: concentric
   translucent bands trail the expanding wavefront, all driven by
   one animated radius (--akr) so the ripples sweep outward in
   lock-step WITH the transition. A plain circular clip rides
   underneath as a safe fallback for engines without @property.
   ============================================================ */
(function () {
  function init() {
    var root = document.documentElement;
    var toggle = document.getElementById('themeToggle');
    var knob = document.getElementById('knob');
    if (!toggle || !knob) return;
    if (toggle.dataset.rippleBound) return;   // guard against double-binding
    toggle.dataset.rippleBound = '1';

    /* ---- inject CSS once ---- */
    if (!document.getElementById('ak-ripple-css')) {
      // rippled mask: solid (reveal new) in the core, two translucent
      // rings just behind the wavefront, transparent (old shows) beyond it.
      var grad =
        'radial-gradient(circle at var(--akx,50%) var(--aky,50%),' +
          '#000 0,' +
          '#000 max(0px, var(--akr) - 90px),' +
          'rgba(0,0,0,.40) max(0px, var(--akr) - 66px),' +
          '#000 max(0px, var(--akr) - 46px),' +
          'rgba(0,0,0,.52) max(0px, var(--akr) - 20px),' +
          '#000 calc(var(--akr) - 2px),' +
          'transparent var(--akr)) no-repeat';

      var st = document.createElement('style');
      st.id = 'ak-ripple-css';
      st.textContent =
        '@property --akr{syntax:"<length>";inherits:true;initial-value:4000px}' +
        '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}' +
        '::view-transition-old(root){z-index:0}' +
        '::view-transition-new(root){z-index:1}' +
        'html.ak-vt::view-transition-new(root){' +
          '-webkit-mask:' + grad + ';mask:' + grad + ';' +
          'will-change:-webkit-mask,mask}' +
        '@media (prefers-reduced-motion:reduce){' +
          '::view-transition-group(root),::view-transition-old(root),::view-transition-new(root){animation:none!important}}';
      document.head.appendChild(st);
    }

    function apply(next) {
      root.dataset.theme = next;
      knob.textContent = next === 'dark' ? '🌙' : '☀️';
      try { localStorage.setItem('ak-theme', next); } catch (e) {}
    }

    var busy = false;
    var DUR = 1100;   // slow + calm

    toggle.addEventListener('click', function () {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';

      var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      // Phones/touch screens choke on the per-frame mask-ripple repaint, which
      // makes the swap stutter. Skip the heavy view-transition there and swap the
      // theme instantly — the knob still slides via its own cheap CSS transition.
      var lite = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
      if (!document.startViewTransition || reduce || busy || lite) { apply(next); return; }

      // ripple origin = centre of the toggle
      var r = toggle.getBoundingClientRect();
      var x = r.left + r.width / 2;
      var y = r.top + r.height / 2;
      var end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

      // feed the mask its origin + starting radius
      root.style.setProperty('--akx', x + 'px');
      root.style.setProperty('--aky', y + 'px');
      root.style.setProperty('--akr', '0px');
      root.classList.add('ak-vt');

      busy = true;
      var rAnim = null;
      var cleanup = function () {
        if (rAnim) { try { rAnim.cancel(); } catch (e) {} rAnim = null; }
        root.classList.remove('ak-vt');
        root.style.removeProperty('--akr');
        busy = false;
      };

      var vt;
      try { vt = document.startViewTransition(function () { apply(next); }); }
      catch (e) { apply(next); cleanup(); return; }

      vt.ready.then(function () {
        var ease = 'cubic-bezier(.16,1,.3,1)';
        // the ripple bands: animate the shared radius on :root; the snapshot
        // inherits --akr, so its mask recomputes each frame → rings ride the edge
        rAnim = root.animate(
          { '--akr': ['0px', (end + 110) + 'px'] },
          { duration: DUR, easing: ease, fill: 'forwards' }
        );
        // safe base reveal on the snapshot itself (covers engines w/o @property)
        root.animate(
          { clipPath: [
              'circle(0px at ' + x + 'px ' + y + 'px)',
              'circle(' + (end + 4) + 'px at ' + x + 'px ' + y + 'px)'
          ] },
          { duration: DUR, easing: ease, pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(function () {});

      // guaranteed reset even if VT promises never settle in some browsers
      setTimeout(cleanup, DUR + 260);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
