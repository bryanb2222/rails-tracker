# Crypto Payment Rails Tracker (v1)

Static site: plain HTML/CSS/JS plus JSON data files. No build step, no backend, no cookies, no forms.

## Files
- `index.html`, `assets/styles.css`, `assets/app.js`: the site
- `data/processors.json`: 23 tool rows. Each has a source URL and a check date (2026-10-18). Unknown fees are "Not published". `affiliate_url` is null for every row (placeholder).
- `data/news.json`: the published news feed, built by the refresh script
- `data/news_seed.json`: hand-curated news items from primary sources, merged into the feed
- `data/news_block.json`: URLs an editor rejected
- `data/rails.json`: plain-English explainers, one source each
- `data/feeds.json`: the free, keyless official sources the script reads
- `data/refresh_state.json`, `data/news_delta.json`, `data/news_review.json`: script state, the last run's delta, and items with no readable date (never published)
- `scripts/refresh_news.py`: news refresher (Python 3 stdlib only)
- `scripts/build_processors.py`: rebuilds processors.json from the reviewed list

## Refresh the news
    python3 scripts/refresh_news.py           # update data/news.json, print new items only
    python3 scripts/refresh_news.py --json    # same, delta as JSON (for a scheduled job)
    python3 scripts/refresh_news.py --dry-run # look without writing

A scheduled job only needs `new_count` and `new[]` from `--json`. A second run with no fresh news prints `0 new item(s)`.
Example cron (daily 7am): `0 7 * * * cd /workspace/rails-tracker && python3 scripts/refresh_news.py --json > /tmp/rails-delta.json`

## Preview locally
    python3 -m http.server 8765 --bind 127.0.0.1   # then open http://127.0.0.1:8765/

## Deploy (not done; needs Bryan's approval)
The easiest free host is GitHub Pages, because the site is plain files (the `.nojekyll` file is already there):
1. Log in to the GitHub CLI on the box (`gh auth login`) with Bryan's account.
2. Create a public repo, e.g. `rails-tracker`, and push this folder.
3. Turn on Pages: Settings → Pages → Deploy from branch `main`, folder `/`. The site goes live at `https://<user>.github.io/rails-tracker/`.
Alternatives: Cloudflare Pages or Netlify, both by drag-and-drop of this folder. Each needs a free account.
A custom domain is optional and costs money. It is not needed.

## Offline Survival Library (separate microsite)

`survival/` is a standalone offline field-manual mini-site: setup plan, ten how-to
cards, ten pantry recipes, printable pocket cards, four calculators and a sourced
shelf of public-domain manuals. It is plain HTML/CSS/JS + JSON with a service
worker, and it does not share data or code with the rails tracker.

    cd survival && python3 -m http.server 8765 --bind 127.0.0.1

See `survival/README.md` for the data model, editorial rules and deploy notes.
