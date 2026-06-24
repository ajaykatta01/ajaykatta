# Ajay Katta — Portfolio

Static portfolio site. Pure HTML/CSS/JS — **no build step, no framework, no dependencies.**
Fully responsive (mobile + desktop). This single folder is the **whole site** — push it to
GitHub and Vercel serves it as-is.

---

## What's in this folder

| File / folder | What it is |
|---|---|
| `index.html` | Home / landing page |
| `project-ui-ux.html` | UI/UX case studies (FinTrack, CoinWave, MotoCare…) |
| `project-gen-ai.html` | Generative-AI projects |
| `project-3d.html` | 3D projects |
| `resume.html` | Résumé page (+ downloadable PDF) |
| `admin.js` | The built-in content editor (password-protected; visitors never see it) |
| `portfolio-data.json` | **All your case-study content** — visitors load this automatically |
| `media/` | Every image / PDF / video your content points to (real files) |
| `*.jpg / *.png / *.jpeg` | Built-in site imagery (profile photo, FinTrack screens…) |
| `uae_dubai_…_2026_03*.pdf` | Résumé PDFs |
| `vercel.json` | Clean URLs (`/resume` instead of `/resume.html`) |

> `portfolio-data.json` and `media/` come out of the **Export** step below. Drop them in here,
> and your projects show up the moment you deploy.

---

## How content is saved (read this once — it's the whole system)

There are two layers:

1. **While you edit** — you open a project page, click **Admin**, and add/change things.
   Those edits are saved **in your browser** as you go. Nobody else can see them yet.
2. **To publish** — click **Admin → Export site data**. You get a
   **`portfolio-site-data.zip`** containing a small `portfolio-data.json` + a `media/` folder.
   That ZIP is what makes your changes real on the live site.

So: **editing ≠ publishing.** Your edits aren't live until you Export and push.

---

## Updating your site (no coding)

1. Open any project page → **Admin** → make your changes.
2. **Admin → Export site data** → downloads `portfolio-site-data.zip`.
3. **Unzip it.** Inside: `portfolio-data.json` and a `media/` folder.
4. Put both into this folder, **replacing** the old `portfolio-data.json` and `media/`.
5. Push to GitHub (drag-and-drop on github.com is fine — every file is small).
6. Vercel redeploys automatically. Live in ~1 minute. ✅

That's the entire loop. Repeat it any time you add a case study or change content.

---

## First-time deploy to Vercel

1. Push this folder to a new GitHub repo.
2. In Vercel: **Add New → Project**, import the repo.
3. Framework Preset: **Other** (no build command, no output directory — it's static).
4. Deploy. Vercel serves `index.html` at the root.

## Run locally

Open `index.html` in a browser, or:

```
npx serve .
```

---

## Notes

- The Export is **self-contained** — no external libraries. It splits your content into a tiny
  text file plus real media files, so nothing ever hits GitHub's 100 MB file limit and visitors
  load pages fast.
- Keep editing in the **same browser** between exports — that's where your working copy lives.
- Set your Admin password the first time you click **Admin**. It's stored only in your browser.
