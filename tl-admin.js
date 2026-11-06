/* ==========================================================================
   tl-admin.js — About page timeline tools for admin Edit mode.
   Loaded by about.html only while admin is unlocked. Uses AK_EDIT (site-edit.js)
   for every change, so edits are ordinary page drafts: Undo works, Publish bakes
   them into about.html, uploaded/picked icons ship as media/home/about-image-<n>.

   Per stop (Edit mode): Edit · Icon · Add after · Move · Remove, plus "Add stop".
   Icons: saved sets (on this site · line icons · company logos · Dubai), web search (Iconify API: Lucide · Tabler · Iconoir),
   or "From an image" — an upload converted on-device into a matching line icon
   (Lines / Outline / Solid, detail + weight). Icons are black line art on
   transparent; the page inverts them on dark.
   ========================================================================== */
(function () {
  "use strict";
  var E = null, tl = null, shown = false;

  /* Lucide (ISC) — inner markup, 24×24 */
  var LIB = {
    "sprout": '<path d="M14 9.536V7a4 4 0 0 1 4-4h1.5a.5.5 0 0 1 .5.5V5a4 4 0 0 1-4 4 4 4 0 0 0-4 4c0 2 1 3 1 5a5 5 0 0 1-1 3"/><path d="M4 9a5 5 0 0 1 8 4 5 5 0 0 1-8-4"/><path d="M5 21h14"/>',
    "baby": '<path d="M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5"/><path d="M15 12h.01"/><path d="M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1"/><path d="M9 12h.01"/>',
    "house": '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    "map-pin": '<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
    "graduation-cap": '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
    "book-open": '<path d="M12 5v16"/><path d="M20.001 19A2 2 0 0022 17V5a2 2 0 00-1.999-2L16 3.002A5 5 0 0012 5a5 5 0 00-4-2H4a2 2 0 00-2 2v12a2 2 0 001.999 2H8a5 5 0 014 2 5 5 0 014-2z"/>',
    "palette": '<path d="M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z"/><circle cx="13.5" cy="6.5" r=".5" fill="#000"/><circle cx="17.5" cy="10.5" r=".5" fill="#000"/><circle cx="6.5" cy="12.5" r=".5" fill="#000"/><circle cx="8.5" cy="7.5" r=".5" fill="#000"/>',
    "pen-tool": '<path d="m18 13-.654-4.736a4 4 0 00-2.756-3.266l-9.163-2.9a2 2 0 00-2.017.493l-.82.819a2 2 0 00-.492 2.017l2.9 9.163a4 4 0 003.266 2.756L13 18"/><path d="M18.648 12.352a1.205 1.205 0 011.704 0l1.296 1.296a1.205 1.205 0 010 1.704l-6.296 6.296a1.205 1.205 0 01-1.704 0l-1.296-1.296a1.205 1.205 0 010-1.704z"/><path d="m3 3 6.586 6.586"/><circle cx="11" cy="11" r="2"/>',
    "clapperboard": '<path d="m12.296 3.464 3.02 3.956"/><path d="M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="m6.18 5.276 3.1 3.899"/>',
    "film": '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
    "camera": '<path d="M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z"/><circle cx="12" cy="13" r="3"/>',
    "box": '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
    "layers": '<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>',
    "sparkles": '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
    "lightbulb": '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
    "code": '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    "monitor": '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
    "smartphone": '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
    "briefcase": '<path d="M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/><rect width="20" height="14" x="2" y="6" rx="2"/>',
    "users": '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
    "award": '<path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"/><circle cx="12" cy="8" r="6"/>',
    "rocket": '<path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09"/><path d="M9 12a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.4 22.4 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 .05 5 .05"/>',
    "compass": '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/>',
    "globe": '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
    "plane": '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    "heart": '<path d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"/>'
  };
  var NAMES = Object.keys(LIB);
  /* icons already used on the site — picked as-is, so Publish makes no new file */
  var SITE = ["sprout", "charminar", "clapperboard", "amazon", "rocket"];
  function siteURL(n) { return "media/home/about-icon-" + n + ".svg"; }
  /* company marks — line: Tabler (MIT) · solid ({f}): Remix (Apache-2.0), Simple Icons (CC0), MingCute (Apache-2.0) */
  var BRAND = {
    "amazon": { site: 1 },
    "google": '<path d="M20.945 11a9 9 0 1 1 -3.284 -5.997l-2.655 2.392a5.5 5.5 0 1 0 2.119 6.605h-4.125v-3h7.945"/>',
    "apple": '<path d="M8.286 7.008c-3.216 0 -4.286 3.23 -4.286 5.92c0 3.229 2.143 8.072 4.286 8.072c1.165 -.05 1.799 -.538 3.214 -.538c1.406 0 1.607 .538 3.214 .538s4.286 -3.229 4.286 -5.381c-.03 -.011 -2.649 -.434 -2.679 -3.23c-.02 -2.335 2.589 -3.179 2.679 -3.228c-1.096 -1.606 -3.162 -2.113 -3.75 -2.153c-1.535 -.12 -3.032 1.077 -3.75 1.077c-.729 0 -2.036 -1.077 -3.214 -1.077"/><path d="M12 4a2 2 0 0 0 2 -2a2 2 0 0 0 -2 2"/>',
    "microsoft": '<path d="M17.8 20l-12 -1.5c-1 -.1 -1.8 -.9 -1.8 -1.9v-9.2c0 -1 .8 -1.8 1.8 -1.9l12 -1.5c1.2 -.1 2.2 .8 2.2 1.9v12.1c0 1.2 -1.1 2.1 -2.2 1.9l0 .1"/><path d="M12 5l0 14"/><path d="M4 12l16 0"/>',
    "meta": '<path d="M12 10.174c1.766 -2.784 3.315 -4.174 4.648 -4.174c2 0 3.263 2.213 4 5.217c.704 2.869 .5 6.783 -2 6.783c-1.114 0 -2.648 -1.565 -4.148 -3.652a27.627 27.627 0 0 1 -2.5 -4.174"/><path d="M12 10.174c-1.766 -2.784 -3.315 -4.174 -4.648 -4.174c-2 0 -3.263 2.213 -4 5.217c-.704 2.869 -.5 6.783 2 6.783c1.114 0 2.648 -1.565 4.148 -3.652c1 -1.391 1.833 -2.783 2.5 -4.174"/>',
    "adobe": '<path d="M12.893 4.514l7.977 14a.993 .993 0 0 1 -.394 1.365a1.04 1.04 0 0 1 -.5 .127h-3.476l-4.5 -8l-2.5 4h1.5l2 4h-8.977c-.565 0 -1.023 -.45 -1.023 -1c0 -.171 .045 -.34 .13 -.49l7.977 -13.993a1.034 1.034 0 0 1 1.786 0l0 -.009"/>',
    "netflix": '<path d="M9 3l10 18h-4l-10 -18l4 0"/><path d="M5 3v18h4v-10.5"/><path d="M19 21v-18h-4v10.5"/>',
    "openai": '<path d="M11.217 19.384a3.501 3.501 0 0 0 6.783 -1.217v-5.167l-6 -3.35"/><path d="M5.214 15.014a3.501 3.501 0 0 0 4.446 5.266l4.34 -2.534v-6.946"/><path d="M6 7.63c-1.391 -.236 -2.787 .395 -3.534 1.689a3.474 3.474 0 0 0 1.271 4.745l4.263 2.514l6 -3.348"/><path d="M12.783 4.616a3.501 3.501 0 0 0 -6.783 1.217v5.067l6 3.45"/><path d="M18.786 8.986a3.501 3.501 0 0 0 -4.446 -5.266l-4.34 2.534v6.946"/><path d="M18 16.302c1.391 .236 2.787 -.395 3.534 -1.689a3.474 3.474 0 0 0 -1.271 -4.745l-4.308 -2.514l-5.955 3.42"/>',
    "tesla": '<path d="M12 21l3 -11c2.359 0 3 0 3 1c0 0 1.18 -1.745 2 -3c-3.077 -1.464 -6 -1 -6 -1l-2 2l-2 -2s-2.923 -.464 -6 1c.82 1.255 2 3 2 3c0 -1 .744 -1 3 -1l3 11"/><path d="M20 5c-5.114 -2 -10.886 -2 -16 0"/>',
    "airbnb": '<path d="M12 10c-2 0 -3 1 -3 3c0 1.5 1.494 3.535 3 5.5c1 1 1.5 1.5 2.5 2s2.5 1 4.5 -.5s1.5 -3.5 .5 -6s-2.333 -5.5 -5 -9.5c-.834 -1 -1.5 -1.5 -2.503 -1.5c-1 0 -1.623 .45 -2.497 1.5c-2.667 4 -4 7 -5 9.5s-1.5 4.5 .5 6s3.5 1 4.5 .5s1.5 -1 2.5 -2c1.506 -1.965 3 -4 3 -5.5c0 -2 -1 -3 -3 -3"/>',
    "uber": '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M9 10a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4"/><path d="M3 12h6"/>',
    "spotify": '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M8 11.973c2.5 -1.473 5.5 -.973 7.5 .527"/><path d="M9 15c1.5 -1 4 -1 5 .5"/><path d="M7 9c2 -1 6 -2 10 .5"/>',
    "linkedin": '<path d="M8 11v5"/><path d="M8 8v.01"/><path d="M12 16v-5"/><path d="M16 16v-3a2 2 0 1 0 -4 0"/><path d="M3 7a4 4 0 0 1 4 -4h10a4 4 0 0 1 4 4v10a4 4 0 0 1 -4 4h-10a4 4 0 0 1 -4 -4l0 -10"/>',
    "figma": '<path d="M12 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0"/><path d="M6 6a3 3 0 0 1 3 -3h6a3 3 0 0 1 3 3a3 3 0 0 1 -3 3h-6a3 3 0 0 1 -3 -3"/><path d="M9 9a3 3 0 0 0 0 6h3m-3 0a3 3 0 1 0 3 3v-15"/>',
    "paypal": '<path d="M10 13l2.5 0c2.5 0 5 -2.5 5 -5c0 -3 -1.9 -5 -5 -5h-5.5c-.5 0 -1 .5 -1 1l-2 14c0 .5 .5 1 1 1h2.8l1.2 -5c.1 -.6 .4 -1 1 -1m7.5 -5.8c1.7 1 2.5 2.8 2.5 4.8c0 2.5 -2.5 4.5 -5 4.5h-2.6l-.6 3.6a1 1 0 0 1 -1 .8l-2.7 0a.5 .5 0 0 1 -.5 -.6l.2 -1.4"/>',
    "stripe": '<path d="M11.453 8.056c0 -.623 .518 -.979 1.442 -.979c1.69 0 3.41 .343 4.605 .923l.5 -4c-.948 -.449 -2.82 -1 -5.5 -1c-1.895 0 -3.373 .087 -4.5 1c-1.172 .956 -2 2.33 -2 4c0 3.03 1.958 4.906 5 6c1.961 .69 3 .743 3 1.5c0 .735 -.851 1.5 -2 1.5c-1.423 0 -3.963 -.609 -5.5 -1.5l-.5 4c1.321 .734 3.474 1.5 6 1.5c2 0 3.957 -.468 5.084 -1.36c1.263 -.979 1.916 -2.268 1.916 -4.14c0 -3.096 -1.915 -4.547 -5 -5.637c-1.646 -.605 -2.544 -1.07 -2.544 -1.807l-.003 0"/>',
    "visa": '<path d="M21 15l-1 -6l-2.5 6"/><path d="M9 15l1 -6"/><path d="M3 9h1v6h.5l2.5 -6"/><path d="M16 9.5a.5 .5 0 0 0 -.5 -.5h-.75c-.721 0 -1.337 .521 -1.455 1.233l-.09 .534a1.059 1.059 0 0 0 1.045 1.233a1.059 1.059 0 0 1 1.045 1.233l-.09 .534a1.476 1.476 0 0 1 -1.455 1.233h-.75a.5 .5 0 0 1 -.5 -.5"/><path d="M18 14h2.7"/>',
    "disney": '<path d="M3.22 5.838c-1.307 -.15 -1.22 -.578 -1.22 -.794c0 -.216 .424 -1.044 4.34 -1.044c4.694 0 14.66 3.645 14.66 10.042s-8.71 4.931 -10.435 4.52c-1.724 -.412 -5.565 -2.256 -5.565 -4.174c0 -1.395 3.08 -2.388 6.715 -2.388c3.634 0 5.285 1.041 5.285 2c0 .5 -.074 1.229 -1 1.5"/><path d="M10.02 8a505.153 505.153 0 0 0 0 13"/>',
    "booking": '<path d="M4 18v-9.5a4.5 4.5 0 0 1 4.5 -4.5h7a4.5 4.5 0 0 1 4.5 4.5v7a4.5 4.5 0 0 1 -4.5 4.5h-9.5a2 2 0 0 1 -2 -2"/><path d="M8 12h3.5a2 2 0 1 1 0 4h-3.5v-7a1 1 0 0 1 1 -1h1.5a2 2 0 1 1 0 4h-1.5"/><path d="M16 16l.01 0"/>',
    "mercedes": '<path d="M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0"/><path d="M12 3v9"/><path d="M12 12l7 5"/><path d="M12 12l-7 5"/>',
    "toyota": '<path d="M2 12a10 7 0 1 0 20 0a10 7 0 1 0 -20 0"/><path d="M9 12c0 3.866 1.343 7 3 7s3 -3.134 3 -7s-1.343 -7 -3 -7s-3 3.134 -3 7"/><path d="M6.415 6.191c-.888 .503 -1.415 1.13 -1.415 1.809c0 1.657 3.134 3 7 3s7 -1.343 7 -3c0 -.678 -.525 -1.304 -1.41 -1.806"/>'
  };
  var DUBAI = {
    "burj-khalifa": { f: "M8 21v-5c.041-.624.409-.922 1-1v-3c.028-.421.176-.617.5-.866V8c.028-.421.176-.617.5-.866V5c.041-.624.409-.922 1-1V2c.013-.198.033-.325.134-.5.436-.755 1.606-.601 1.832.241L13 2v2c.591.078.959.376 1 1v3.134c.324.249.472.445.5.866v3.134c.324.249.472.445.5.866v3c.591.078.959.376 1 1v4c.227.03.296.016.5.134.755.436.601 1.606-.241 1.832L16 23H8c-.755-.05-1.269-.802-.866-1.5.088-.152.214-.278.366-.366.204-.118.273-.104.5-.134m4.5-11.134-.207-.159c-.197-.196-.275-.436-.293-.707V8c-.057.433-.153.6-.5.866V12c-.028.421-.176.617-.5.866V16c-.041.624-.409.922-1 1v4h4v-3c-.591-.078-.959-.376-1-1v-3.134c-.324-.249-.472-.445-.5-.866Z" },
    "burj-al-arab": '<path d="M3 21h18"/><path d="M7 21v-18"/><path d="M7 4c5.675 .908 10 5.613 10 11.28a11 11 0 0 1 -1.605 5.72"/><path d="M5 9h12"/><path d="M7 13h4"/><path d="M7 17h4"/>',
    "emirates": { f: "M6.247 15.56l-1.386 1.385c.945.945 1.26 1.386 1.323 1.827.063-.063 1.323-1.134 1.323-1.512 0-.567-.378-.756-1.26-1.7m-3.15-2.458h-.755s.756.441.756 1.45v3.4c0 2.205 1.826 4.284 4.031 4.284h1.827c1.134 0 1.512-.252 2.142-.882l.692-.693c.378-.44.82-.755.82-1.952v-1.134c0-.945-.568-1.386-.82-1.638l-.63-.63v2.268s.441.504.693.63c.945.756.19 2.078-.692 2.078H7.066c-1.89-.063-3.402-1.637-3.465-3.527v-1.827c0-1.827-.503-1.827-.503-1.827m5.92 2.457l-1.385 1.386c.945.945 1.26 1.386 1.323 1.827.063-.063 1.323-1.134 1.323-1.512 0-.567-.378-.82-1.26-1.7M11.853 0l-.944.945c-.378.378-.252 1.134.504 1.89v1.89c0 .188-.19.377-.19.377s-1.133-1.008-2.14-1.008H7.57c-.945 0-1.7.882-1.827.945-.504.504-.504 1.45-.126 1.89L6.688 8s-.252-1.7 0-2.835c.063-.252.378-.567.693-.567l2.457 1.89-2.835 2.96c-.126.127-.504.379-.882.379-.44 0-.63-.252-.819-.504v1.386c0 .44.63.945 1.197.945h3.78c.252 0 .567-.063.819-.315l1.26-1.26c.188-.19.251-.441.251-.756V7.874c0-1.386-1.07-2.457-1.07-2.457s.251-.189.251-.756V3.213s.441.44.504.63l.82-.82c.377-.377-.253-1.07-.505-1.385C11.853.818 11.853 0 11.853 0M7.13 9.953c.378-.19.441-.315.756-.693l2.394-2.52s1.322 1.386 1.763 2.142c.19.378.441 1.070-.692 1.07H7.13M3.915 7.056h-.692c.44.252.755 1.008.755 1.449v2.772c0 .755.567 3.464 3.024 3.464h7.118v4.536c0 .755-.252 1.196-.44 1.385l-1.072 1.008h.504l1.953-1.763c.378-.441.819-.882.819-2.268V14.74l.819-.819 1.386-1.323c0 1.134.567 1.638 1.07 1.638a1.26 1.26 0 0 0 .756-.315l1.26-1.197c.567-.567.882-2.33-.504-2.33-.882 0-1.89 1.26-1.952 1.386-.315-.19-.567-.63-.567-.63v1.07c-.126.19-.693.63-1.134.63h-1.134v-1.07c0-.504.189-1.071.44-1.323l1.072-1.008h-.504l-2.142 1.953c-.378.44-.63 1.26-.63 1.448H6.058c-1.008 0-1.638-1.007-1.638-1.826v-2.08c0-1.7-.44-1.889-.504-1.889m16.315 6.047c-.189 0-.378-.063-.63-.252-.251-.189-.692-.819-.692-.819.126-.125.504-.251.818-.251.252 0 .504.063.567.189.441.566.378 1.133-.063 1.133M16.893 0L14.75 1.953c-.126.126-.63.882-.63 1.764v5.606c0 .378-.252.945-.44 1.134l-1.072 1.008h.504l2.016-1.827c.252-.252.756-.882.756-1.953V2.331c0-.82.378-1.26.567-1.45L17.397 0h-.504m.315 14.362v2.205l.756.819c.63.63.567 1.827-1.323 3.653a3.78 3.78 0 0 1-2.583 1.197h-3.401L12.672 24h1.386c1.386 0 2.646-.567 3.465-1.449.756-.819 1.197-1.89 1.134-3.023V16.63c0-1.008-.63-1.575-.756-1.7-.126 0-.693-.568-.693-.568Z" }
  };
  function svgFill(d) { return '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="#000"><path d="' + d + '"/></svg>'; }
  function libURL(n, v) { return v && v.site ? siteURL(n) : svgURL(v && v.f ? svgFill(v.f) : svgOf(v)); }
  /* logos the owner converted ("From an image") — kept on this device for reuse */
  var MYKEY = "ak-tl-icons";
  function mine() { try { var a = JSON.parse(localStorage.getItem(MYKEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveMine(a) { try { localStorage.setItem(MYKEY, JSON.stringify(a)); return true; } catch (e) { return false; } }
  function addMine(n, u, c) {
    var a = mine().filter(function (x) { return x.u !== u; });
    a.unshift({ n: n, u: u, c: c || "co" });
    if (!saveMine(a)) E.toast("Couldn\u2019t save \u2014 browser storage is full");
  }
  function dropMine(u) { saveMine(mine().filter(function (x) { return x.u !== u; })); }
  function slug(t) { return String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "logo"; }
  /* picker sections; k = extra words a search matches for the whole group */
  function groups() {
    var seen = {}, site = [], my = mine();
    my.forEach(function (x) { seen[x.u] = 1; });
    function mk(c) { return my.filter(function (x) { return (x.c || "co") === c; }).map(function (x) { return { n: x.n, u: x.u, my: 1 }; }); }
    SITE.forEach(function (n) { var u = siteURL(n); seen[u] = 1; site.push({ n: n, u: u }); });
    if (tl) tl.querySelectorAll("img.tl-ic").forEach(function (im) {
      var u = im.getAttribute("src"); if (!u || seen[u]) return; seen[u] = 1;
      site.push({ n: (u.indexOf("data:") ? u.split("/").pop().replace(/\.[a-z]+$/i, "").replace(/^about-icon-/, "") : "custom"), u: u });
    });
    function of(map) { return Object.keys(map).map(function (n) { return { n: n, u: libURL(n, map[n]) }; }); }
    return [
      { t: "My icons", k: "my mine saved uploaded custom", l: mk("my") },
      { t: "On this site", k: "saved site current", l: site },
      { t: "Line icons", k: "", l: of(LIB) },
      { t: "Companies", k: "company companies logo logos brand brands", l: mk("co").concat(of(BRAND)) },
      { t: "Dubai", k: "dubai uae emirates", l: of(DUBAI) }
    ];
  }
  function svgOf(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="0.65" stroke-linecap="round" stroke-linejoin="round">' + inner + "</svg>";
  }
  function svgURL(svg) { return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg))); }
  /* a web icon → black, thin, 40px — same look as the rest */
  function normSvg(t) {
    t = t.replace(/currentColor/g, "#000");
    var vb = /viewBox="([^"]+)"/.exec(t), H = vb ? +vb[1].trim().split(/[\s,]+/)[3] || 24 : 24;
    var sw = (1.05 * H / 40).toFixed(2);
    t = t.replace(/stroke-width="[\d.]+"/g, 'stroke-width="' + sw + '"');
    t = t.replace(/<svg([^>]*?)\swidth="[^"]*"/, "<svg$1").replace(/<svg([^>]*?)\sheight="[^"]*"/, "<svg$1").replace("<svg", '<svg width="40" height="40"');
    return t;
  }

  /* ------------------------------------------------------------------ dom */
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "html") e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on" && typeof attrs[k] === "function") e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c != null) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function modal(build, wide, onClose) {
    var ov = h("div", { class: "aks-ui aks-mov" }), box = h("div", { class: "aks-m aks-tlm" + (wide ? " wide" : "") });
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    ov.appendChild(box); document.body.appendChild(ov);
    function top() { var a = document.querySelectorAll(".aks-mov"); return a[a.length - 1] === ov; }
    function onKey(e) { if (e.key === "Escape" && top()) { e.stopPropagation(); close(); } }
    function close() { if (!ov.parentNode) return; ov.remove(); document.removeEventListener("keydown", onKey, true); if (onClose) onClose(); }
    document.addEventListener("keydown", onKey, true);
    build(box, close);
    return close;
  }
  function foot(kids) { return h("div", { class: "aks-acts", style: "border:0;padding:14px 0 0" }, kids); }
  function btn(label, fn, cls) { return h("button", { type: "button", class: "aks-b " + (cls || ""), onclick: fn }, [label]); }

  /* ---------------------------------------------------------------- stops */
  function stops() { return Array.prototype.filter.call(tl.children, function (c) { return c.classList.contains("tl-it"); }); }
  function parts(it) {
    var lab = it.querySelector(".tl-lab");
    return { yr: lab && lab.querySelector(".tl-yr"), t: lab && lab.querySelector("h3"), p: lab && lab.querySelector("p"), ic: lab && lab.querySelector("img.tl-ic") };
  }
  function icOn(ic) { return ic && ic.getAttribute("data-off") !== "1" ? ic.getAttribute("src") : null; }
  function applyIcon(ic, r) {
    if (!ic || !r) return;
    if (r.off) E.setAttr(ic, { "data-off": "1" });
    else { E.setImg(ic, r.url); if (ic.getAttribute("data-off") === "1") E.setAttr(ic, { "data-off": "0" }); }
  }

  function clear() { tl.querySelectorAll(".aks-tlc,.aks-tladd").forEach(function (n) { n.remove(); }); }
  function render() {
    clear();
    shown = !!(E && E.on());
    if (!shown) return;
    var its = stops(), y = matchMedia("(max-width:760px)").matches, I = E.icons;
    function b(icon, title, fn, off, cls) {
      var x = h("button", { type: "button", class: "aks-tlb " + (cls || ""), title: title, "aria-label": title, html: icon });
      x.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); fn(); });
      if (off) x.disabled = true;
      return x;
    }
    its.forEach(function (it, i) {
      it.appendChild(h("div", { class: "aks-ui aks-tlc", "data-ak-transient": "" }, [
        b(I.pen, "Edit this stop", function () { editStop(it); }),
        b(I.img, "Change icon", function () { iconFor(it); }),
        b(I.plus, "Add a stop after this one", function () { addAfter(it); }),
        b(y ? I.up : I.left, "Move earlier", function () { E.listOp(tl, it, "prev"); }, i === 0),
        b(y ? I.down : I.right, "Move later", function () { E.listOp(tl, it, "next"); }, i === its.length - 1),
        b(I.trash, "Remove this stop", function () { E.listOp(tl, it, "remove"); }, its.length < 2, "dgr")
      ]));
    });
    var add = h("button", { type: "button", html: I.plus + "<span>Add stop</span>" });
    add.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); var a = stops(); addAfter(a[a.length - 1]); });
    tl.appendChild(h("li", { class: "aks-ui aks-tladd", "data-ak-transient": "", "aria-hidden": "true" }, [add]));
  }
  var rt = 0;
  function soon() { clearTimeout(rt); rt = setTimeout(render, 30); }

  function addAfter(it) {
    if (!it) return;
    var n = E.batch(function () {
      var nn = E.listOp(tl, it, "add"); if (!nn) return null;
      var p = parts(nn);
      if (p.yr) E.setText(p.yr, "Year");
      if (p.t) E.setText(p.t, "New stop");
      if (p.p) E.setText(p.p, "A line or two about this step.");
      return nn;
    });
    if (n) editStop(n, true);
  }
  function iconFor(it) {
    var p = parts(it); if (!p.ic) return;
    pickIcon(icOn(p.ic)).then(function (r) {
      if (!r) return;
      E.batch(function () { applyIcon(p.ic, r); });
      E.toast(r.off ? "Icon removed" : "Icon updated");
    });
  }

  function field(label, val, multi) {
    var el = multi ? h("textarea", { rows: "4" }) : h("input", { type: "text" });
    el.value = val || "";
    return { el: el, row: h("label", { class: "aks-tlf" }, [h("span", {}, [label]), el]) };
  }
  function editStop(it, isNew) {
    var p = parts(it), pend = null;
    modal(function (box, close) {
      box.appendChild(h("h3", {}, [isNew ? "New stop" : "Edit stop"]));
      box.appendChild(h("div", { class: "sub" }, ["Saved on this device \u2014 Publish puts it live."]));
      var pv = h("div", { class: "aks-tlpv" });
      function cur() { return pend ? (pend.off ? null : pend.url) : icOn(p.ic); }
      function paint() { pv.innerHTML = ""; var s = cur(); pv.appendChild(s ? h("img", { src: s, alt: "" }) : h("span", {}, ["No icon"])); }
      paint();
      if (p.ic) box.appendChild(h("div", { class: "aks-tlrow" }, [pv, h("div", { class: "aks-tlcol" }, [
        h("div", { class: "aks-tll" }, ["Icon"]),
        h("div", { class: "aks-tlsm" }, ["Shows what this stop is about."]),
        btn("Change icon", function () { pickIcon(cur()).then(function (r) { if (r) { pend = r; paint(); } }); })
      ])]));
      var fy = field("Year", p.yr && p.yr.textContent), ft = field("Title", p.t && p.t.textContent), fp = field("Description", p.p && p.p.textContent, true);
      [fy, ft, fp].forEach(function (f) { box.appendChild(f.row); });
      function save() {
        E.batch(function () {
          if (p.yr) E.setText(p.yr, fy.el.value);
          if (p.t) E.setText(p.t, ft.el.value);
          if (p.p) E.setText(p.p, fp.el.value);
          if (pend) applyIcon(p.ic, pend);
        });
        close(); E.toast("Stop saved");
      }
      box.appendChild(h("div", { class: "aks-tlhint" }, ["\u2318/Ctrl \u21B5 saves"]));
      box.appendChild(foot([btn("Cancel", close), btn("Save", save, "pri")]));
      box.addEventListener("keydown", function (e) { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } });
      setTimeout(function () { var f = isNew ? fy : ft; f.el.focus(); f.el.select(); }, 60);
    });
  }

  /* --------------------------------------------------------- icon picker */
  function pickIcon(cur) {
    return new Promise(function (done) {
      var out = null;
      modal(function (box, close) {
        box.appendChild(h("h3", {}, ["Choose an icon"]));
        box.appendChild(h("div", { class: "sub" }, ["Pick a line icon, search the web, or turn your own image into one."]));
        var tA = btn("Icons", function () { tab(false); }, "on"), tB = btn("From an image", function () { tab(true); });
        var A = h("div"), B = h("div", { hidden: "" });
        function tab(b) { tA.classList.toggle("on", !b); tB.classList.toggle("on", b); A.hidden = b; B.hidden = !b; }
        box.appendChild(h("div", { class: "aks-tltabs" }, [tA, tB]));
        box.appendChild(A); box.appendChild(B);
        function pick(u) { out = { url: u }; close(); }

        /* library + web search */
        var q = h("input", { type: "text", placeholder: "Search icons \u2014 e.g. school, camera, award" });
        var st = h("div", { class: "aks-tlst" }), grid = h("div", { class: "aks-tlg" });
        A.appendChild(q); A.appendChild(st); A.appendChild(grid);
        function cell(src, name, fn) { return h("button", { type: "button", class: "aks-tlgc", title: name, onclick: fn }, [h("img", { src: src, alt: name, loading: "lazy" })]); }
        function local(v) {
          var c = 0;
          groups().forEach(function (g) {
            var all = v && g.k.indexOf(v) >= 0, l = g.l.filter(function (x) { return !v || all || x.n.indexOf(v) >= 0; });
            if (!l.length) return;
            grid.appendChild(h("div", { class: "aks-tlgh" }, [g.t]));
            l.forEach(function (x) {
              c++; var el = cell(x.u, x.n, function () { pick(x.u); });
              if (x.my) {
                var del = h("button", { type: "button", class: "aks-tlx", title: "Remove " + x.n + " from saved icons", "aria-label": "Remove " + x.n + " from saved icons", html: "&times;" });
                del.addEventListener("click", function (e) { e.stopPropagation(); dropMine(x.u); var v = q.value.trim().toLowerCase(); grid.innerHTML = ""; var n = local(v); if (!v) st.textContent = "Saved \u00b7 " + n + " icons. Type to search thousands more on the web."; E.toast(x.n + " removed from saved icons"); });
                el = h("div", { class: "aks-tlgw" }, [el, del]);
              }
              grid.appendChild(el);
            });
          });
          return c;
        }
        function builtins() { grid.innerHTML = ""; var c = local(""); st.textContent = "Saved \u00b7 " + c + " icons. Type to search thousands more on the web."; }
        var seq = 0, tmr = 0;
        q.addEventListener("input", function () { clearTimeout(tmr); var v = q.value.trim().toLowerCase(); if (!v) { seq++; builtins(); return; } tmr = setTimeout(function () { search(v); }, 320); });
        function search(v) {
          var my = ++seq; st.textContent = "Searching\u2026";
          fetch("https://api.iconify.design/search?query=" + encodeURIComponent(v) + "&prefixes=lucide,tabler,iconoir&limit=64")
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (my !== seq) return;
              var list = (j && j.icons) || [];
              grid.innerHTML = ""; local(v);
              if (list.length) grid.appendChild(h("div", { class: "aks-tlgh" }, ["From the web"]));
              list.forEach(function (id) {
                var s = id.split(":"), src = "https://api.iconify.design/" + s[0] + "/" + s[1] + ".svg";
                grid.appendChild(cell(src, s[1] + " \u00b7 " + s[0], function () {
                  st.textContent = "Adding\u2026";
                  fetch(src).then(function (r) { return r.text(); }).then(function (t) {
                    if (!/<svg[\s>]/i.test(t)) throw 0;
                    pick(svgURL(normSvg(t)));
                  })["catch"](function () { st.textContent = "Could not load that icon \u2014 try another."; });
                }));
              });
              st.textContent = list.length ? list.length + " from the web (Lucide, Tabler, Iconoir \u2014 free to use)." : "No web results for \u201C" + v + "\u201D.";
            })["catch"](function () { if (my !== seq) return; grid.innerHTML = ""; local(v); st.textContent = "Web search needs an internet connection \u2014 built-in icons only."; });
        }
        builtins();

        /* from an image → line icon */
        var o = { mode: "line", detail: 14, weight: 1, flip: false }, img = null, url = null;
        var drop = h("button", { type: "button", class: "aks-tldrop" }, [h("b", {}, ["Upload an image"]), h("span", {}, ["A logo, photo or sketch \u2014 it becomes a line icon in the same style. Drop a file here or click."])]);
        var work = h("div", { hidden: "" });
        var th = h("img", { class: "aks-tlth", alt: "" }), pd = h("div", { class: "aks-tlpv" }), pl = h("div", { class: "aks-tlpv lt" }), msg = h("div", { class: "aks-tlst" });
        work.appendChild(h("div", { class: "aks-tlpvs" }, [th, h("span", { class: "aks-tlar", html: "&rarr;" }), pd, pl]));
        function seg(opts, val, fn) {
          var w = h("div", { class: "aks-tlseg" });
          opts.forEach(function (x) { var b = btn(x[1], function () { w.querySelectorAll(".aks-b").forEach(function (n) { n.classList.toggle("on", n === b); }); fn(x[0]); }, x[0] === val ? "on" : ""); w.appendChild(b); });
          return w;
        }
        function range(label, min, max, val, fn) {
          var r = h("input", { type: "range", min: String(min), max: String(max), step: "1" }); r.value = String(val);
          r.addEventListener("input", function () { fn(+r.value); });
          return { r: r, row: h("label", { class: "aks-tlrg" }, [h("span", {}, [label]), r]) };
        }
        var det = range("Detail", 2, 30, o.detail, function (v) { o.detail = v; redraw(); });
        var wt = range("Line weight", 1, 4, o.weight, function (v) { o.weight = v; redraw(); });
        var fl = h("input", { type: "checkbox" });
        fl.addEventListener("change", function () { o.flip = fl.checked; redraw(); });
        var flRow = h("label", { class: "aks-tlck" }, [fl, h("span", {}, ["Swap subject and background"])]);
        work.appendChild(h("div", { class: "aks-tlrg" }, [h("span", {}, ["Style"]), seg([["line", "Lines"], ["outline", "Outline"], ["fill", "Solid"]], o.mode, function (v) {
          o.mode = v; if (v === "outline" && o.weight < 2) { o.weight = 2; wt.r.value = "2"; } flRow.hidden = v === "line"; redraw();
        })]));
        work.appendChild(det.row); work.appendChild(wt.row); flRow.hidden = true; work.appendChild(flRow); work.appendChild(msg);
        var nm = h("input", { type: "text", placeholder: "Name \u2014 e.g. Careem, my sketch" });
        var to = "my";
        work.appendChild(h("label", { class: "aks-tlrg" }, [h("span", {}, ["Name"]), nm]));
        work.appendChild(h("div", { class: "aks-tlrg" }, [h("span", {}, ["Save to"]), seg([["my", "My icons"], ["co", "Companies"], ["no", "Don\u2019t save"]], to, function (v) { to = v; })]));
        var use = btn("Use this icon", function () {
          if (!url) return;
          if (to !== "no") { addMine(slug(nm.value), url, to); E.toast(to === "co" ? "Saved to Companies" : "Saved to My icons"); }
          pick(url);
        }, "pri aks-wide");
        var again = btn("Choose another image", function () { load(); }, "aks-wide");
        work.appendChild(use); work.appendChild(again);
        B.appendChild(drop); B.appendChild(work);
        function redraw() {
          if (!img) return;
          var c = toIcon(img, o);
          pd.innerHTML = ""; pl.innerHTML = "";
          if (!c) { url = null; use.disabled = true; msg.textContent = "Nothing found \u2014 raise Detail or try another style."; return; }
          url = webp(c); use.disabled = false; msg.textContent = "Saved as a small WebP with transparency.";
          pd.appendChild(h("img", { src: url, alt: "" })); pl.appendChild(h("img", { src: url, alt: "" }));
        }
        function take(f) {
          if (!f || !/^image\//.test(f.type || "image/")) return;
          E.readDataURL(f).then(function (u) {
            var im = new Image();
            im.onload = function () { img = im; th.src = u; drop.hidden = true; work.hidden = false; if (!nm.value && f.name) nm.value = f.name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\b(logo|icon|svg|png)\b/gi, "").trim(); redraw(); };
            im.onerror = function () { E.toast("This browser can\u2019t read that image \u2014 try PNG, JPG or WebP"); };
            im.src = u;
          });
        }
        function load() { E.pickFile("image/*").then(take); }
        drop.addEventListener("click", load);
        drop.addEventListener("dragover", function (e) { e.preventDefault(); drop.classList.add("on"); });
        drop.addEventListener("dragleave", function () { drop.classList.remove("on"); });
        drop.addEventListener("drop", function (e) { e.preventDefault(); drop.classList.remove("on"); take(e.dataTransfer.files && e.dataTransfer.files[0]); });

        var f = [btn("Cancel", close)];
        if (cur) f.unshift(btn("Remove icon", function () { out = { off: true }; close(); }));
        box.appendChild(foot(f));
        setTimeout(function () { q.focus(); }, 60);
      }, true, function () { done(out); });
    });
  }

  /* -------------------------------------------- image → line icon (canvas) */
  function webp(c) { var u = c.toDataURL("image/webp", 0.92); return u.indexOf("data:image/webp") === 0 ? u : c.toDataURL("image/png"); }
  function blur(a, N, r) {
    var t = new Float32Array(N * N), o = new Float32Array(N * N), x, y, k, s, c, n;
    for (var pass = 0; pass < 2; pass++) {
      for (y = 0; y < N; y++) for (x = 0; x < N; x++) { s = 0; c = 0; for (k = -r; k <= r; k++) { n = x + k; if (n >= 0 && n < N) { s += a[y * N + n]; c++; } } t[y * N + x] = s / c; }
      for (y = 0; y < N; y++) for (x = 0; x < N; x++) { s = 0; c = 0; for (k = -r; k <= r; k++) { n = y + k; if (n >= 0 && n < N) { s += t[n * N + x]; c++; } } o[y * N + x] = s / c; }
      a = Float32Array.from(o);
    }
    return a;
  }
  function morph(m, N, grow) {
    var o = new Uint8Array(N * N);
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var any = 0, all = 1;
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var xx = x + dx, yy = y + dy, v = (xx >= 0 && yy >= 0 && xx < N && yy < N) ? m[yy * N + xx] : 0;
        if (v) any = 1; else all = 0;
      }
      o[y * N + x] = grow ? any : all;
    }
    return o;
  }
  function otsu(g) {
    var hist = new Float64Array(256), n = g.length, i, sum = 0, sb = 0, wb = 0, best = 0, t = 128;
    for (i = 0; i < n; i++) hist[Math.max(0, Math.min(255, g[i] | 0))]++;
    for (i = 0; i < 256; i++) sum += i * hist[i];
    for (i = 0; i < 256; i++) {
      wb += hist[i]; if (!wb) continue;
      var wf = n - wb; if (!wf) break;
      sb += i * hist[i];
      var mb = sb / wb, mf = (sum - sb) / wf, v = wb * wf * (mb - mf) * (mb - mf);
      if (v > best) { best = v; t = i; }
    }
    return t;
  }
  function toIcon(src, o) {
    var N = 112, c = document.createElement("canvas"); c.width = c.height = N;
    var x = c.getContext("2d", { willReadFrequently: true });
    x.fillStyle = "#fff"; x.fillRect(0, 0, N, N);
    var iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height, s = Math.min(N / iw, N / ih) * 0.94;
    x.drawImage(src, (N - iw * s) / 2, (N - ih * s) / 2, iw * s, ih * s);
    var px = x.getImageData(0, 0, N, N).data, g = new Float32Array(N * N), i, X, Y;
    for (i = 0; i < N * N; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    g = blur(g, N, o.mode === "line" ? 1 : 2);
    var m = new Uint8Array(N * N);
    if (o.mode === "line") {
      var mag = new Float32Array(N * N), mx = 1e-6;
      for (Y = 1; Y < N - 1; Y++) for (X = 1; X < N - 1; X++) {
        var p = function (dx, dy) { return g[(Y + dy) * N + X + dx]; };
        var gx = -p(-1, -1) - 2 * p(-1, 0) - p(-1, 1) + p(1, -1) + 2 * p(1, 0) + p(1, 1);
        var gy = -p(-1, -1) - 2 * p(0, -1) - p(1, -1) + p(-1, 1) + 2 * p(0, 1) + p(1, 1);
        var v = Math.sqrt(gx * gx + gy * gy); mag[Y * N + X] = v; if (v > mx) mx = v;
      }
      var hist = new Uint32Array(256);
      for (i = 0; i < N * N; i++) hist[Math.min(255, (mag[i] / mx * 255) | 0)]++;
      var keep = N * N * o.detail / 100, acc = 0, t = 255;
      for (; t > 1; t--) { acc += hist[t]; if (acc >= keep) break; }
      var thr = Math.max(t / 255 * mx, mx * 0.06);
      for (i = 0; i < N * N; i++) m[i] = mag[i] > thr ? 1 : 0;
      var cl = new Uint8Array(N * N);                 // drop lone specks
      for (Y = 1; Y < N - 1; Y++) for (X = 1; X < N - 1; X++) {
        i = Y * N + X; if (!m[i]) continue;
        var nb = m[i - 1] + m[i + 1] + m[i - N] + m[i + N] + m[i - N - 1] + m[i - N + 1] + m[i + N - 1] + m[i + N + 1];
        cl[i] = nb >= 1 ? 1 : 0;
      }
      m = cl;
    } else {
      var th = otsu(g) + (o.detail - 14) * 2.2, edge = 0, fgE = 0;
      for (i = 0; i < N * N; i++) m[i] = g[i] < th ? 1 : 0;
      for (i = 0; i < N; i++) [i, (N - 1) * N + i, i * N, i * N + N - 1].forEach(function (k) { edge++; fgE += m[k]; });
      var inv = fgE / edge > 0.5; if (o.flip) inv = !inv;
      if (inv) for (i = 0; i < N * N; i++) m[i] = m[i] ? 0 : 1;
      if (o.mode === "outline") { var er = morph(m, N, false); for (i = 0; i < N * N; i++) m[i] = m[i] && !er[i] ? 1 : 0; }
    }
    for (var w = 1; w < o.weight; w++) m = morph(m, N, true);
    var x0 = N, y0 = N, x1 = -1, y1 = -1, cnt = 0;
    for (Y = 0; Y < N; Y++) for (X = 0; X < N; X++) if (m[Y * N + X]) { cnt++; if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y; }
    if (cnt < 8) return null;
    var tmp = document.createElement("canvas"); tmp.width = tmp.height = N;
    var tx = tmp.getContext("2d"), id = tx.createImageData(N, N);
    for (i = 0; i < N * N; i++) if (m[i]) id.data[i * 4 + 3] = 255;
    tx.putImageData(id, 0, 0);
    var S = 120, out = document.createElement("canvas"); out.width = out.height = S;
    var ox = out.getContext("2d"), bw = x1 - x0 + 1, bh = y1 - y0 + 1, sc = S / (Math.max(bw, bh) * 1.08);
    ox.imageSmoothingEnabled = true; ox.imageSmoothingQuality = "high";
    ox.drawImage(tmp, x0, y0, bw, bh, (S - bw * sc) / 2, (S - bh * sc) / 2, bw * sc, bh * sc);
    return out;
  }

  /* ----------------------------------------------------------------- css */
  function css() {
    if (document.getElementById("aks-tl-css")) return;
    document.head.appendChild(h("style", { id: "aks-tl-css", html: [
      ".aks-tlc{position:absolute;left:-14px;z-index:4;display:flex;gap:2px;padding:3px;border-radius:10px;background:var(--surface,#1D1C1A);border:1px solid var(--line,#373634);box-shadow:0 8px 24px rgba(0,0,0,.35)}",
      ".tl-it.up>.aks-tlc{top:14px}.tl-it.dn>.aks-tlc{bottom:14px}",
      ".aks-tlb{width:28px;height:28px;padding:0;border:0;border-radius:7px;background:transparent;color:var(--muted,#C9C8C6);display:grid;place-items:center;cursor:pointer;transition:.15s}",
      ".aks-tlb svg{width:15px;height:15px}",
      ".aks-tlb:hover{background:color-mix(in srgb,var(--text,#fff) 9%,transparent);color:var(--text,#fff)}",
      ".aks-tlb.dgr:hover{color:#f87171}.aks-tlb[disabled]{opacity:.28;pointer-events:none}",
      "@media (pointer:coarse){.aks-tlb{width:36px;height:36px}}",
      "body.aks-on .tl-it.up .tl-lab{bottom:50px}body.aks-on .tl-it.dn .tl-lab{top:52px}",
      "body.aks-on .tl-it.up::before{height:40px}body.aks-on .tl-it.dn::before{height:42px}",
      "body.aks-on .tl-ic{cursor:pointer}body.aks-on .tl-ic[data-off=\"1\"]{display:block;opacity:.16;outline:1px dashed currentColor;outline-offset:3px}",
      ".aks-tladd{position:absolute;top:var(--ly);left:calc(var(--x0) + (var(--n,6) + .8)*var(--S));transform:translateY(-50%);list-style:none;z-index:4}",
      ".aks-tladd button{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 15px 0 12px;border-radius:99px;border:1px dashed var(--gold,#E3B04B);background:var(--bg,#0A0A0A);color:var(--gold-ink,#E3B04B);font:600 .78rem/1 'Geist',system-ui,sans-serif;cursor:pointer;transition:.18s}",
      ".aks-tladd button:hover{border-style:solid;box-shadow:0 0 18px -6px var(--gold,#E3B04B)}",
      ".aks-tladd svg{width:14px;height:14px}",
      "@media (max-width:760px){.aks-tlc{position:static;width:max-content;margin-top:10px}.aks-tladd{position:static;transform:none}}",
      ".aks-tlm [hidden]{display:none!important}",
      ".aks-tlm .aks-b.on{background:color-mix(in srgb,var(--accent,#E5783A) 18%,transparent);color:var(--accent-ink,var(--accent,#E5783A))}",
      ".aks-tlrow{display:flex;gap:14px;align-items:center;margin:4px 0 16px}",
      ".aks-tlcol{display:grid;gap:4px;justify-items:start}.aks-tlcol .aks-b{border:1px solid var(--line,#373634);height:38px;margin-top:4px}",
      ".aks-tll{font-size:.8rem;font-weight:700;color:var(--text,#fff)}.aks-tlsm,.aks-tlhint{font-size:.72rem;color:var(--muted,#C9C8C6)}",
      ".aks-tlhint{text-align:right;margin-top:-4px}",
      ".aks-tlpv{width:68px;height:68px;flex:none;border-radius:12px;border:1px solid var(--line,#373634);background:#0A0A0A;display:grid;place-items:center;color:#8d8d8d;font-size:.66rem;text-align:center}",
      ".aks-tlpv img{max-width:44px;max-height:44px;filter:invert(1);opacity:.8}.aks-tlpv.lt{background:#fff}.aks-tlpv.lt img{filter:none;opacity:.75}",
      ".aks-tlf{display:grid;gap:6px;margin-bottom:12px;font-size:.74rem;font-weight:600;color:var(--muted,#C9C8C6)}",
      ".aks-tlf input,.aks-tlf textarea{width:100%;padding:11px 13px;border-radius:11px;border:1px solid var(--line,#373634);background:var(--bg,#1C1A14);color:var(--text,#fff);font:400 16px/1.5 system-ui,sans-serif;resize:vertical}",
      ".aks-tlf input{height:46px}.aks-tlf input:focus,.aks-tlf textarea:focus,.aks-tlm input[type=text]:focus{outline:2px solid var(--accent,#E5783A);outline-offset:1px}",
      ".aks-tltabs,.aks-tlseg{display:flex;gap:6px;margin-bottom:12px}.aks-tltabs .aks-b,.aks-tlseg .aks-b{border:1px solid var(--line,#373634);height:38px}",
      ".aks-tlseg{margin:0}",
      ".aks-tlst{font-size:.74rem;color:var(--muted,#C9C8C6);margin:9px 0;min-height:1.1em}",
      ".aks-tlg{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:6px;max-height:340px;overflow:auto;padding:2px}",
      ".aks-tlgw{position:relative;display:grid}.aks-tlgw>.aks-tlgc{width:100%}",
      ".aks-tlx{position:absolute;top:-5px;right:-5px;width:20px;height:20px;padding:0;border-radius:50%;border:1px solid var(--line,#373634);background:var(--surface,#1D1C1A);color:var(--text,#fff);font-size:13px;line-height:1;display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .15s}",
      ".aks-tlgw:hover .aks-tlx,.aks-tlx:focus-visible{opacity:1}.aks-tlx:hover{color:#f87171;border-color:#f87171}@media (hover:none){.aks-tlx{opacity:1}}",
      ".aks-tlgh{grid-column:1/-1;font-size:.66rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#C9C8C6);padding:10px 2px 2px}.aks-tlgh:first-child{padding-top:0}",
      ".aks-tlgc{aspect-ratio:1;border-radius:10px;border:1px solid var(--line,#373634);background:transparent;display:grid;place-items:center;cursor:pointer;padding:0;transition:.15s}",
      ".aks-tlgc:hover{border-color:var(--accent,#E5783A);background:color-mix(in srgb,var(--accent,#E5783A) 8%,transparent)}",
      ".aks-tlgc img{width:26px;height:26px;filter:invert(1);opacity:.85}[data-theme=\"light\"] .aks-tlgc img{filter:none}",
      ".aks-tldrop{width:100%;padding:28px 16px;border-radius:14px;border:1.5px dashed var(--line,#373634);background:transparent;color:var(--text,#fff);display:grid;gap:6px;cursor:pointer;text-align:center;font:inherit}",
      ".aks-tldrop.on,.aks-tldrop:hover{border-color:var(--accent,#E5783A)}.aks-tldrop span{font-size:.78rem;line-height:1.5;color:var(--muted,#C9C8C6)}",
      ".aks-tlpvs{display:flex;gap:10px;align-items:center;margin-bottom:14px}.aks-tlar{color:var(--muted,#C9C8C6)}",
      ".aks-tlth{width:68px;height:68px;object-fit:cover;border-radius:12px;border:1px solid var(--line,#373634)}",
      ".aks-tlrg{display:grid;grid-template-columns:92px minmax(0,1fr);align-items:center;gap:10px;font-size:.76rem;color:var(--muted,#C9C8C6);margin:9px 0}",
      ".aks-tlrg input{width:100%;accent-color:var(--accent,#E5783A)}",
      ".aks-tlrg input[type=text]{height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--line,#373634);background:var(--bg,#1C1A14);color:var(--text,#fff);font:400 16px/1.4 system-ui,sans-serif}",
      ".aks-tlck{display:flex;align-items:center;gap:9px;font-size:.78rem;color:var(--muted,#C9C8C6);margin:8px 0;cursor:pointer}.aks-tlck input{width:18px;height:18px;accent-color:var(--accent,#E5783A)}"
    ].join("\n") }));
  }

  /* ---------------------------------------------------------------- boot */
  function init() {
    E = window.AK_EDIT; tl = document.getElementById("tl");
    if (!tl) return;
    css();
    new MutationObserver(function () { if (!!E.on() !== shown) render(); }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
    tl.addEventListener("ak-list-changed", soon);
    new MutationObserver(function () { if (shown && !tl.querySelector(".aks-tladd")) soon(); }).observe(tl, { childList: true });
    var narrow = matchMedia("(max-width:760px)").matches;
    addEventListener("resize", function () { var n = matchMedia("(max-width:760px)").matches; if (n !== narrow) { narrow = n; if (shown) soon(); } });
    /* in Edit mode a tap on an icon opens the picker (before the generic photo toolbar) */
    addEventListener("click", function (e) {
      if (!E.on()) return;
      var ic = e.target.closest && e.target.closest("#tl img.tl-ic"); if (!ic) return;
      e.preventDefault(); e.stopPropagation();
      var it = ic.closest(".tl-it"); if (it) iconFor(it);
    }, true);
    render();
  }
  var tries = 0;
  (function wait() {
    if (window.AK_EDIT && window.AK_EDIT.setText) { init(); return; }
    if (++tries < 400) setTimeout(wait, 150);
  })();
})();
