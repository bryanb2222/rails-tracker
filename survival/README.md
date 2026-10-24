# Offline Survival Library — field edition v3

A static, offline-capable field manual site for an iPhone 15 + USB-C stick. It is
the v2 PDF plan (`Offline-Survival-Library-iPhone.pdf`, Oct 22 2026) rebuilt as a
real site, with the pictures, how-to cards and recipes the PDF did not have.

Plain HTML, CSS, JSON and vanilla JS. No build step, no framework, no fonts to
download, no trackers, no accounts, no cookies.

## What is in here

| Path | What it is |
| --- | --- |
| `index.html` | The whole site shell. One page, seven sections, hash routing. |
| `assets/styles.css` | The field-manual design system, including a red-light night mode and print rules. |
| `assets/app.js` | Renders `data/*.json`, search, calculators, dialogs, routing, service worker registration. |
| `assets/img/*.jpg` | Ten illustrations (1100×738, screen-print palette). |
| `data/setup.json` | The ten setup steps, with path, steps, failure modes and a "done when". |
| `data/skills.json` | Ten how-to cards + the first-ten-minutes triage. |
| `data/shelf.json` | Eleven downloadable documents, licences, caveats, held-out items, licence key. |
| `data/recipes.json` | Ten pantry recipes with fuel, water, calories and sources. |
| `data/drill.json` | Blackout drill, known unknowns, rotation schedule, log template. |
| `data/print.json` | Nine printable pocket cards + a household contact card. |
| `sw.js` | Cache-first service worker. Pre-caches every asset for true offline use. |
| `manifest.webmanifest` | Installable "add to home screen" metadata. |

## Preview locally

    cd survival
    python3 -m http.server 8765 --bind 127.0.0.1
    # open http://127.0.0.1:8765/

It must be served over HTTP, not opened as a `file://` path, because the page
fetches its JSON data. Any static host works.

## Deploy

GitHub Pages is the simplest: push the repo, then Settings → Pages → deploy from
`main`, folder `/`. The site lands at `https://<user>.github.io/<repo>/survival/`.
Cloudflare Pages or Netlify work by dragging this folder in.

## Editing the content

Everything lives in `data/*.json`. Nothing is generated, so adding content is:

1. Add an object to the relevant array (`steps`, `skills`, `docs`, `recipes`, `cards`).
2. Give it a unique `id`. Deep links are `#skill/<id>`, `#recipe/<id>`, `#shelf/<id>`, `#plan/<id>`.
3. Save. Reload. Bump `updated` and the `VERSION` constant in `sw.js` so returning
   visitors get the new cache instead of the old one.

Editorial rules this repo holds itself to:

- **Every number has a named source.** Water dosing is CDC/EPA, canning times are
  NCHFP/USDA, field procedures are US Army field manuals. No number without a link.
- **Free to download is not free to reuse.** Each shelf item carries a licence
  class: `pd`, `free-check`, `personal`, `verify`.
- **Say what is unproven.** `data/drill.json → unknowns` is the honesty list.
- **No affiliate links, no sponsors, no tracking.** The site is the reference, not
  the funnel.

## What is deliberately missing

- No build tooling. If it needs npm to read a manual in a blackout, it is the wrong tool.
- No search service. Search is a local index built in the browser from the JSON.
- No cloud sync. The USB-C stick and a second stick *are* the sync.
- No medical claim. First-aid cards point at courses and current guidance.

## Version notes

- **v3 (this site, Oct 24 2026):** rebuilt from the v2 PDF. Adds illustrations,
  ten illustrated how-to cards, ten recipes, four calculators, pocket print cards,
  red-light mode, offline service worker.
- **v2 (PDF, Oct 22 2026):** the plan — iPhone 15, USB-C stick, ExFAT, Safari
  downloads, Kiwix, Army manuals, licence review, AI-on-device notes.

Not medical, legal or financial advice. Check the source before you rely on it.
