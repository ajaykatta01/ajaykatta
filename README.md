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
| `admin.js` | Case-study editor (password-protected; visitors never see it) |
| `site-content.json` | **All other page content you've edited** — text, photos, links, colours, SEO |
| `site-content.js` | Applies `site-content.json` on every page (tiny; always loaded) |
| `site-edit.js` | The on-page site editor — downloaded only when an admin unlocks |
| `site-package.js` | Builds the publish ZIP (changes-only or whole website) — loaded on demand by the editor and the admin export |
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

## Editing the whole site yourself (no code, no help)

Everything outside the case studies — headings, paragraphs, buttons, nav labels,
photos, link destinations, section order, colours, SEO — is editable **on the page
itself**, on phone, tablet or desktop.

**Get in:** add `#edit` to the end of any page URL (e.g. `yoursite.com/resume#edit`),
enter your admin password. A small bar appears bottom-right. Once unlocked it appears
on every page for the rest of the browser session.

| Bar button | What it does |
|---|---|
| **Edit** | Turns edit mode on. Tap any text to retype it, tap any photo to swap it. Tap Edit again to preview exactly what visitors see. |
| **Undo** | Steps back through your changes (⌘Z / Ctrl-Z also works). |
| **Settings** | Draft · Projects · Sections · Theme · SEO · Links · Files · Versions · Publish. |
| **Publish** | The badge counts unpublished changes. |

**The Settings panel**

- **Projects** — every case study across your three category pages, with its file
  count and a **New / Edited / Live** badge. Projects you just added (and the files
  dropped into them) show up here before you publish, and they're counted in the
  Draft summary too. Read-only list — projects are still added on the category page.
- **Sections** — hide a section from visitors, or move it up/down. This page only.
- **Theme** — every colour, dark and light. Scoped to the current page unless you turn
  on *Apply to every page*. (The home page deliberately runs a darker palette.)
- **SEO** — page title, description and the social-preview image.
- **Links** — every link on the page with its destination, in one list.
- **Files** — replace a downloadable PDF (e.g. the résumé).
- **Versions** — your last 10 saved states, one tap to restore, plus
  *Discard all my local changes*.
- **Publish** — a summary of exactly what changed, then the ZIP.

**Publishing (same idea as the case studies):**

1. Settings → **Publish** → *Download publish ZIP* → re-enter your password.
2. Unzip. Copy **site-content.json** and the **media** folder into this repo,
   replacing what's there.
3. Push to GitHub. Vercel redeploys in ~1 minute. ✅

Until you do step 3 your edits live only in your own browser — the live site is untouched.

**How it works, in one line:** `site-content.js` (~3 KB, on every page) reads
`site-content.json` and applies your overrides. `site-edit.js` — the whole editor —
is only downloaded once an admin session is unlocked, so visitors never pay for it.

> Two separate exports, on purpose: **Admin → Export site data** publishes case studies
> (`portfolio-data.json`); the **Publish** button above publishes everything else
> (`site-content.json`). They never overwrite each other.

---

## Updating case studies (no coding)

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

## Speed — how the site stays fast

**Images are capped at 2560px on the long edge.** Anything you drop into the editor is
downscaled to that before it is stored, so a 7000px Figma export can't reach the live site.
At those sizes the phone spends longer *decoding* the picture than downloading it, and the
very biggest ones simply fail to paint on iOS. 2560px is still full-bleed sharp on a retina
screen — nothing visible is lost.

**Admin → Optimise images** re-checks what is already published: it downscales any file over
the cap and downloads `optimised-images.zip` with just those files. Copy the `media` folder
from it into the repo and push. Run it any time the site feels slow.

You choose the scope: **Everything**, one category (UI/UX · Gen AI · 3D), or a single
project — so a newly added project can be optimised on its own. Each row shows how many of
its images are oversized before you commit to anything, and the **Publish** tab and the
**Export site data** dialog both show the same check, so nothing oversized ships unnoticed.

Two files still need this pass — they were too large to convert here:

```
media/ui-ux/motocare-image-15.webp   5684×16383  2.4 MB
media/ui-ux/motocare-image-17.webp   5684×11676  4.9 MB
```

Also in place: covers on the category pages are `<link rel="preload">`ed in the HTML so they
start downloading before `admin.js` and `portfolio-data.json` have even arrived; three.js and
GSAP load *after* the homepage paints instead of blocking it; `portfolio-data.json` is
revalidated (a 304) instead of re-downloaded on every visit; `media/` is cached for 30 days.

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
