# Ajay Katta Portfolio — Update Notes (2026-06-29)

This folder is your COMPLETE, ready-to-deploy repo. It contains every fix below plus
your media reorganised into per-project subfolders.

============================================================
WHAT CHANGED
============================================================

1) EXPORT NO LONGER DROPS PROJECTS  (admin.js)
   - "Export site data" now merges ALL projects: pages you edited on this device win,
     everything else is preserved from the currently-published portfolio-data.json.
   - Previously it only exported the page you edited, wiping the others.

2) CERTIFICATES + HOME PROJECT COVERS NOW DEPLOY  (admin.js + index.html)
   - These were saved only in your browser (localStorage) and never reached the site.
   - Export now writes them into portfolio-data.json under a "home" section, and the
     home page reads them from there, so visitors see them.

3) PER-PROJECT MEDIA SUBFOLDERS  (admin.js + this repo)
   - Images are now filed under media/<project>/:
        media/ui-ux/   media/3d/   media/home/   (gen-ai uses prototype embeds, no files)
   - Future exports keep this structure automatically and migrate any old flat files.

============================================================
HOW TO DEPLOY (replace everything)
============================================================
1. In your GitHub repo, delete the OLD flat media/ folder and the old admin.js,
   index.html, portfolio-data.json.
2. Upload the contents of this folder (admin.js, index.html, portfolio-data.json,
   the cert-*.webp files, and the whole media/ folder with its subfolders).
3. Commit. Vercel redeploys automatically.

Tip: GitHub web UI -> "Add file" -> "Upload files" -> drag the whole folder in.

============================================================
EXAMPLE MEDIA STRUCTURE
============================================================
media/
  ui-ux/
    motocare-cover.webp
    coinwave-cover.webp
    fintrack-cover.webp
    ...32 files
  3d/
    action-bolt-sniper-rifle-cover.webp
    baggalini-bag-cover.webp
    clx-cabinet-cover.webp
    ...76 files
  home/            <- certificate scans + profile photos
    cert-google-ux.webp
    cert-prompt-eng.webp
    cert-gen-ai.webp
    profile-photo.webp      (hero avatar)
    profile-cutout.webp     (3D tilt-card portrait)
    (your next export also adds home project covers here, e.g. ui-ux-cover.webp)

  NOTE: there is no media/gen-ai/ folder — the Gen-AI projects are interactive
  prototype embeds (links), so they have no image files to store.

============================================================
ACTION NEEDED — 35 IMAGES ARE MISSING FROM THE REPO
============================================================
These files are referenced by your portfolio data but DO NOT exist in the repo
(left over from the old broken export). Their refs are left as-is (flat) and will
show as broken until recovered:

  - media/motocare-image-1.png
  - media/motocare-image-2.png
  - media/motocare-image-3.png
  - media/motocare-image-4.png
  - media/motocare-image-5.png
  - media/motocare-image-6.png
  - media/motocare-image-7.png
  - media/motocare-image-8.png
  - media/motocare-image-9.png
  - media/coinwave-image-1.png
  - media/coinwave-image-2.png
  - media/coinwave-image-3.png
  - media/coinwave-image-4.png
  - media/coinwave-image-5.png
  - media/coinwave-image-6.png
  - media/coinwave-image-7.png
  - media/coinwave-image-8.png
  - media/coinwave-image-9.png
  - media/coinwave-image-10.png
  - media/coinwave-image-11.png
  - media/fintrack-image-1.jpg
  - media/fintrack-image-2.png
  - media/fintrack-image-3.jpg
  - media/fintrack-image-4.jpg
  - media/fintrack-image-5.jpg
  - media/fintrack-image-6.jpg
  - media/fintrack-image-7.jpg
  - media/fintrack-image-8.jpg
  - media/fintrack-image-9.jpg
  - media/hashtag-cycle-media-1.bin
  - media/hashtag-cycle-model-9.glb
  - media/clx-cabinet-model-9.glb
  - media/baggalini-bag-model-8.glb
  - media/loreal-shampoo-model-6.glb
  - media/office-chair-model-6.glb

TO RECOVER THEM: open the browser where these projects still display correctly
(the originals live in that browser's storage), unlock Admin, and run
"Export site data". The new export will bundle them into media/ui-ux/ and media/3d/
and produce a complete portfolio-data.json. Replace the repo files with that export.
