# Ajay Katta — Portfolio

Static portfolio site. Pure HTML/CSS/JS — **no build step, no framework, no dependencies.**
Fully responsive (phone / tablet / desktop). This folder is the **whole site** — push it to
GitHub and Vercel serves it as-is.

---

## What's in this folder

| File / folder | What it is |
|---|---|
| `index.html` | Home / landing page |
| `project-ui-ux.html` · `project-gen-ai.html` · `project-3d.html` | Category pages (case studies) |
| `resume.html` | Résumé page (+ downloadable PDF) |
| `portfolio-data.json` | All case-study + home-page data — visitors load this |
| `media/` | Every image / PDF / video / 3D model the site uses |
| `admin.js` | Renders the case studies; also their editor (admin only) |
| `site-content.js` | Tiny admin loader on every page (~1 KB). Visitors: does nothing |
| `site-edit.js` | **The admin mode** — login, admin bar, publish panel. Admin only |
| `site-package.js` | The publish pipeline + image optimiser. Admin only, loaded on demand |
| `layout-studio.js`, `studio-templates.js` | Layout Studio, loaded on demand by the editor |
| `theme-ripple.js` | Shared light/dark toggle transition |
| `scroll-progress.js` | Reading-progress bar inside an opened project |
| `vercel.json` | Clean URLs (`/resume`), cache headers |
| `robots.txt` | Allows all crawlers |

> **After you point a domain at this site**, make the social-preview URLs absolute so
> LinkedIn / WhatsApp / X can fetch the image: in each HTML file change
> `content="media/home/profile-photo.webp"` to `content="https://YOURDOMAIN.com/media/home/profile-photo.webp"`
> (`og:image` and `twitter:image`).

---

## Admin mode — one login, one bar, one publish

**Log in / log out:** the admin (cog) button in the header. Locked (grey) → click to log in;
unlocked (orange, green dot) → click to log out. Or add `#edit` to any page URL.
Enter your password. The page reloads in admin mode and stays unlocked for this browser tab
on every page.

The **admin bar** (bottom-right) is the only admin control:

| Button | What it does |
|---|---|
| **Edit** | Tap any text to retype it, tap any photo to swap it. Tap again to preview. |
| **Add** | On a category page's project grid: add a new project. Inside a project use **Add content** (header) and **Layout Studio** (header, left). |
| **Undo** | Steps back through page edits (⌘Z / Ctrl-Z). |
| **Publish** | Opens the panel: Publish · Projects · Sections · Theme · SEO · Links · Files · Versions · Tools. The badge counts everything not yet published. |

**Tools** holds Optimise images, Restore case studies from a file, and Change password.

Everything you change is saved **in this browser** as a draft. Nobody sees it until you publish.

### Publishing

1. Admin bar → **Publish** → **Publish N changes** → re-enter your password.
2. You get **one ZIP with only the files that differ from the live site**. Unzip it and copy
   everything inside `Ajaykatta_Website/GitRepo` into this repo (same folders, replacing files).
3. Push to GitHub. Vercel redeploys in about a minute. ✅

`WHAT-CHANGED.txt` in the ZIP lists every file, and any files the site **no longer uses** —
delete those from the repo after pushing so nothing is stored twice.

How it works:

- **Page edits are written straight into the HTML** (text, photos, links, hidden/reordered
  sections, colours, title/description/social tags). Visitors get plain static pages — no
  content file to fetch, nothing patched in after load, and crawlers see your real SEO tags.
- **Case studies and home-page data** go into `portfolio-data.json` (minified).
- **Uploads become files named by their content** (`fintrack-cover-1a2b3c4d5e.webp`). The same
  picture always gets the same name, so it is shipped once — never re-shipped by a later
  publish, never duplicated under two names. An upload identical to a file already live
  reuses that file.
- Once a publish is live, the editor notices (the page matches what it wrote) and retires
  those drafts, so the next ZIP only carries what's new.

---

## Speed

- **WebP only, and it asks first.** Drop a PNG/JPEG/HEIC and a dialog offers **Convert to
  WebP** or **Keep original**, with both sizes. GIF and SVG are left alone — an SVG's fonts
  are embedded inside the file on upload (`svg-embed.js`) so its text never falls back.
- **2560px cap** on the long edge for everything you upload. Canvas photos are shipped at the
  size they're drawn.
- **Tools → Optimise images** finds anything already published that's over the cap (by
  category or single project), shrinks it in the browser, and the fixed files **ship with your
  next Publish** — no separate download.
- Visitors never download any admin code: `admin.js` carries only what renders the case
  studies plus their editor, and the whole admin mode (`site-edit.js`, `site-package.js`,
  Layout Studio) loads only after login.
- Category covers are `<link rel="preload">`ed; three.js and GSAP load after the home page
  paints; `media/` is cached for 30 days; everything else revalidates (a 304) each visit.

---

## Missing media (as of this snapshot)

`portfolio-data.json` references these files that are **not** in `media/`. Each renders as a
graceful placeholder. Drop the real files in at these exact paths to restore them:

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

---

## First-time deploy to Vercel

1. Push this folder to a new GitHub repo.
2. Vercel: **Add New → Project**, import the repo, Framework Preset **Other** (no build).
3. Deploy.

## Run locally

`portfolio-data.json` is loaded with `fetch`, so serve the folder instead of opening the file:

```
npx serve .
```

## Notes

- Keep editing in the **same browser** between publishes — that's where your drafts live.
- Light/dark mode is shared across pages via `localStorage['ak-theme']`.
- Canvas is the default view on tablet/desktop, Grid on phones; the switch is session-only.
- Changing a script? Bump its `?v=` in the pages that load it.
