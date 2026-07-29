# Ajay Katta — Portfolio

Static portfolio site. Pure HTML/CSS/JS — **no build step, no framework, no dependencies.**
Fully responsive (phone / tablet / desktop). This single folder is the **whole site** — push it
to GitHub and Vercel serves it as-is.

---

## What's in this folder

| File / folder | What it is |
|---|---|
| `index.html` | Home / landing page |
| `project-ui-ux.html` | UI/UX case studies (FinTrack, CoinWave, MotoCare…) |
| `project-gen-ai.html` | Generative-AI projects |
| `project-3d.html` | 3D projects |
| `resume.html` | Résumé page (+ downloadable PDF) |
| `portfolio-data.json` | **All case-study content** — visitors load this automatically |
| `media/` | Every image / PDF / video / 3D model the content points to |
| `admin.js` | Built-in content editor (password-protected; visitors never see it) |
| `layout-studio.js`, `studio-templates.js` | Loaded on demand by the editor's Layout Studio |
| `theme-ripple.js` | Shared light/dark toggle transition |
| `scroll-progress.js` | Reading-progress bar inside an opened project |
| `vercel.json` | Clean URLs (`/resume` instead of `/resume.html`) |
| `robots.txt` | Allows all crawlers |

Every page carries its own `<meta>` description, Open Graph / Twitter card tags and an inline
SVG favicon — nothing extra to add.

> **After you point a domain at this site**, make the two social-preview URLs absolute so
> LinkedIn / WhatsApp / X can fetch the image. In each HTML file change
> `content="media/home/profile-photo.webp"` to
> `content="https://YOURDOMAIN.com/media/home/profile-photo.webp"` (two lines per page:
> `og:image` and `twitter:image`).

---

## How content is saved (read this once — it's the whole system)

There are two layers:

1. **While you edit** — open a project page, click **Admin**, add/change things.
   Those edits are saved **in your browser** as you go. Nobody else can see them yet.
2. **To publish** — click **Admin → Export site data**. You get a
   **`portfolio-site-data.zip`** containing `portfolio-data.json` + a `media/` folder.
   That ZIP is what makes your changes real on the live site.

So: **editing ≠ publishing.** Your edits aren't live until you Export and push.

---

## Updating your site (no coding)

1. Open any project page → **Admin** → make your changes.
2. **Admin → Export site data** → downloads `portfolio-site-data.zip`.
3. **Unzip it.** Inside: `portfolio-data.json` and a `media/` folder.
4. Put both into this folder, **replacing** the old `portfolio-data.json` and `media/`.
5. Push to GitHub (drag-and-drop on github.com is fine).
6. Vercel redeploys automatically. Live in ~1 minute. ✅

> **Check the ZIP before you replace `media/`.** Large files (videos, `.glb` models) are the
> ones that go missing from an interrupted export. If a file listed in `portfolio-data.json`
> isn't in `media/`, the site now shows a tidy "unavailable" placeholder instead of a broken
> box — but the content is still gone until you drop the real file in.

---

## Missing media (as of this snapshot)

`portfolio-data.json` references these 9 files that are **not** in `media/`. Each renders as a
graceful placeholder. Drop the real files in at these exact paths (or re-export) to restore them:

```
media/gen-ai/nike-vaporfly-4-cover.jpg
media/gen-ai/nike-vaporfly-4-media-1.mp4
media/gen-ai/nike-vaporfly-4-image-2.webp
media/3d/hashtag-cycle-media-1.bin      ← rename to .mp4 in the editor; .bin won't play
media/3d/hashtag-cycle-model-9.glb
media/3d/clx-cabinet-model-9.glb
media/3d/baggalini-bag-model-8.glb
media/3d/loreal-shampoo-model-6.glb
media/3d/office-chair-model-6.glb
```

The whole `media/gen-ai/` folder is empty, so the **Nike Vaporfly 4** project currently has no
imagery at all. The two "Coming soon" cards on that page are intentional placeholders.

---

## First-time deploy to Vercel

1. Push this folder to a new GitHub repo.
2. In Vercel: **Add New → Project**, import the repo.
3. Framework Preset: **Other** (no build command, no output directory — it's static).
4. Deploy. Vercel serves `index.html` at the root.

## Run locally

`portfolio-data.json` is loaded with `fetch`, so opening `index.html` straight off disk will
show empty project pages. Serve the folder instead:

```
npx serve .
```

---

## Notes

- The Export is **self-contained** — no external libraries. It splits your content into a tiny
  text file plus real media files, so nothing hits GitHub's 100 MB file limit and pages load fast.
- Keep editing in the **same browser** between exports — that's where your working copy lives.
- Set your Admin password the first time you click **Admin**. It's stored only in your browser.
- Light/dark mode is shared across every page via the `ak-theme` key in `localStorage`.
- Canvas is the default view everywhere; the Canvas/Grid switch is session-only, never sticky.
