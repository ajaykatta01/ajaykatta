/* ============================================================================
   Ajay Katta Portfolio — ADMIN LOADER  (site-content.js · every page)
   ----------------------------------------------------------------------------
   Visitors: does nothing but read one sessionStorage flag. Page edits are
   written straight into the HTML when the owner publishes, so there is no
   content file to fetch and nothing to patch at runtime.

   Admin: the single entry point to admin mode on every page.
     AK_SITE.admin.unlocked()  → true while this tab is unlocked
     AK_SITE.admin.login()     → loads site-edit.js and shows the one login
     AK_SITE.admin.logout()    → ends the session and reloads the page
     AK_SITE.admin.open(tab)   → opens the admin panel (Publish, Tools…)
   site-edit.js (the whole admin shell) is fetched only when the session is
   unlocked or the URL ends in #edit.
========================================================================== */
(function () {
  "use strict";
  var SESSION = "ak-admin-unlocked";
  var EDITOR = "site-edit.js?v=29";
  var PAGE = (location.pathname.split("/").pop() || "index").replace(/\.html?$/i, "") || "index";

  /* the old runtime kept a copy of site-content.json here — no longer used */
  try { localStorage.removeItem("ak-site-cache-v1"); } catch (e) {}

  function unlocked() {
    try { return sessionStorage.getItem(SESSION) === "1"; } catch (e) { return false; }
  }
  function loadEditor() {
    if (document.getElementById("ak-site-edit-js")) return;
    var s = document.createElement("script");
    s.id = "ak-site-edit-js"; s.src = EDITOR; s.async = true;
    (document.body || document.head).appendChild(s);
  }
  function boot() {
    if (!unlocked() && location.hash !== "#edit") return;
    if (window.AK_EDIT && !unlocked()) return window.AK_EDIT.login();   // dismissed once, asked again
    loadEditor();
  }

  window.AK_SITE = {
    PAGE: PAGE,
    admin: {
      unlocked: unlocked,
      login: function () {
        if (window.AK_EDIT) return window.AK_EDIT.login();
        window.__akWantLogin = true;
        loadEditor();
      },
      logout: function () {
        try { sessionStorage.removeItem(SESSION); } catch (e) {}
        location.replace(location.pathname + location.search);
      },
      open: function (tab) {
        if (window.AK_EDIT) return window.AK_EDIT.open(tab);
        loadEditor();
      }
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
  window.addEventListener("hashchange", boot);
})();
