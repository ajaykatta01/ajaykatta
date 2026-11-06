/* ============================================================
   Shared theme toggle — pendant lamp + water-ripple reveal
   Used on every page. Requires a #themeToggle button containing
   .lamp > .lamp-shade, .lamp-rays, #knob (the bulb), .lamp-chain
   (CSS lives in each page), the shared theme vars, and the
   `ak-theme` localStorage convention.

   Click / Enter / Space, or pull the chain down: the chain tugs,
   the lamp swings, the bulb flickers on (light) or goes dark, and
   the new theme ripples out from the bulb. The ripple is a masked
   view transition driven by one animated radius (--akr); a plain
   circular clip rides underneath for engines without @property.
   ============================================================ */
(function () {
  /* Browser bar colour (Android Chrome, iOS Safari tint) follows the SITE theme — toggle,
     stored ak-theme, forced-light project detail — not the phone's OS light/dark setting. */
  (function syncBar() {
    var root = document.documentElement, head = document.head;
    if (!head || !window.MutationObserver) return;
    var metas = head.querySelectorAll('meta[name="theme-color"]'), m = metas[0];
    for (var i = 1; i < metas.length; i++) metas[i].parentNode.removeChild(metas[i]);
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; head.appendChild(m); }
    m.removeAttribute('media');
    function set() {
      var bg = '';
      try { bg = getComputedStyle(root).getPropertyValue('--bg').trim(); } catch (e) {}
      m.setAttribute('content', bg || (root.dataset.theme === 'light' ? '#FFFFFF' : '#0A0A0A'));
    }
    set();
    new MutationObserver(set).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  })();

  function init() {
    var root = document.documentElement;
    var toggle = document.getElementById('themeToggle');
    var knob = document.getElementById('knob');
    if (!toggle || !knob) return;
    if (toggle.dataset.rippleBound) return;   // guard against double-binding
    toggle.dataset.rippleBound = '1';
    var lamp = toggle.querySelector('.lamp');
    var chain = toggle.querySelector('.lamp-chain');

    /* ---- inject CSS once ---- */
    if (!document.getElementById('ak-ripple-css')) {
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

    function reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

    function apply(next) {
      root.dataset.theme = next;
      knob.textContent = next === 'dark' ? '🌙' : '☀️';
      if (!window.AK_THEME_NO_PERSIST) { try { localStorage.setItem('ak-theme', next); } catch (e) {} }
      // bulb catches with a short flicker when it switches on
      if (next === 'light' && knob.animate && !reduced()) {
        knob.animate([{ opacity: .25 }, { opacity: 1, offset: .18 }, { opacity: .45, offset: .34 }, { opacity: 1, offset: .52 }, { opacity: .8, offset: .7 }, { opacity: 1 }],
          { duration: 420, easing: 'linear' });
      }
    }

    /* ---- lamp motion: chain tug + damped swing ---- */
    var chainAnim = null, swingAnim = null;
    function tug(from) {
      if (!lamp || !chain || !chain.animate || reduced()) return;
      if (chainAnim) chainAnim.cancel();
      if (swingAnim) swingAnim.cancel();
      chainAnim = chain.animate([
        { transform: 'translateY(' + (from || 0) + 'px)' },
        { transform: 'translateY(6px)', offset: .26 },
        { transform: 'translateY(-1.5px)', offset: .6 },
        { transform: 'translateY(1px)', offset: .8 },
        { transform: 'translateY(0)' }
      ], { duration: 620, easing: 'ease-out' });
      var a = from > 4 ? 6 : 5;
      swingAnim = lamp.animate([
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(' + a + 'deg)', offset: .18 },
        { transform: 'rotate(' + (-a * .6) + 'deg)', offset: .42 },
        { transform: 'rotate(' + (a * .3) + 'deg)', offset: .66 },
        { transform: 'rotate(' + (-a * .12) + 'deg)', offset: .84 },
        { transform: 'rotate(0deg)' }
      ], { duration: 1300, easing: 'ease-in-out' });
    }

    var busy = false;
    var DUR = 1100;   // slow + calm

    function swap(origin) {
      var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      // Phones/touch screens choke on the per-frame mask-ripple repaint, which
      // makes the swap stutter. Skip the heavy view-transition there and swap the
      // theme instantly — the lamp still animates via its own cheap transitions.
      var lite = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
      if (!document.startViewTransition || reduced() || busy || lite) { apply(next); return; }

      // ripple origin = the bulb (or the element that asked, e.g. the About desk-lamp cord)
      var r = (origin && origin.getBoundingClientRect ? origin : knob).getBoundingClientRect();
      var x = r.left + r.width / 2;
      var y = r.top + r.height / 2;
      var end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

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
        rAnim = root.animate(
          { '--akr': ['0px', (end + 110) + 'px'] },
          { duration: DUR, easing: ease, fill: 'forwards' }
        );
        root.animate(
          { clipPath: [
              'circle(0px at ' + x + 'px ' + y + 'px)',
              'circle(' + (end + 4) + 'px at ' + x + 'px ' + y + 'px)'
          ] },
          { duration: DUR, easing: ease, pseudoElement: '::view-transition-new(root)' }
        );
      }).catch(function () {});

      setTimeout(cleanup, DUR + 260);
    }

    // pull → light changes as the chain bottoms out (~150ms)
    function pull(from) {
      tug(from);
      if (reduced()) swap(); else setTimeout(swap, 150);
    }

    /* ---- drag the chain down to pull it ---- */
    var drag = null, skipClick = false;
    toggle.addEventListener('pointerdown', function (e) {
      if (e.button || !chain) return;
      drag = { y: e.clientY, d: 0 };
      try { toggle.setPointerCapture(e.pointerId); } catch (_) {}
    });
    toggle.addEventListener('pointermove', function (e) {
      if (!drag) return;
      drag.d = Math.max(0, Math.min(10, (e.clientY - drag.y) * .6));
      if (drag.d > 1) { chain.style.transition = 'none'; chain.style.transform = 'translateY(' + drag.d + 'px)'; }
    });
    function release(cancel) {
      if (!drag) return;
      var d = drag.d; drag = null;
      chain.style.transition = ''; chain.style.transform = '';
      if (!cancel && d >= 5) {
        skipClick = true; setTimeout(function () { skipClick = false; }, 450);
        pull(d);
      }
    }
    toggle.addEventListener('pointerup', function () { release(false); });
    toggle.addEventListener('pointercancel', function () { release(true); });

    window.AK_THEME = { swap: function (el) { swap(el); } };

    toggle.addEventListener('click', function () {
      if (skipClick) { skipClick = false; return; }
      pull(0);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
