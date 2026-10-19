#!/usr/bin/env python3
"""Refresh the 'Latest launches and integrations' feed for Crypto Payment Rails Tracker.

Python 3 standard library only. No API keys, no paid services.
  python3 scripts/refresh_news.py            # fetch, merge, write data/news.json, print deltas
  python3 scripts/refresh_news.py --dry-run  # fetch and print deltas, write nothing
  python3 scripts/refresh_news.py --json     # print the delta as JSON (for a scheduled job)

Rules it enforces: every item has a source URL from an official publisher and a date read from
the page/feed (structured metadata first). Items whose date can't be read are NOT published; they
go to data/news_review.json for a human to check. Nothing is invented.
Exit code 0 always on success; the delta count is printed so a cron job can report only changes.
"""
import argparse, datetime as dt, email.utils, html, json, pathlib, re, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
UA = "Mozilla/5.0 (compatible; RailsTrackerBot/1.0; +static site news refresher)"
MAX_ITEMS, MAX_AGE_DAYS, MAX_NEW_PAGES_PER_SOURCE = 60, 200, 15

RAILS = {  # tag -> regex (word-boundary, case-sensitive where tickers would collide)
    "USDC": r"\bUSDC\b", "USDT": r"\b(USDT|USDT0|USD₮|Tether)\b", "RLUSD": r"\b(RLUSD|Ripple USD)\b",
    "PYUSD": r"\b(PYUSD|PayPal USD)\b", "XRP": r"\b(XRP|XRPL|XRP Ledger)\b", "Stellar": r"\b(Stellar|XLM)\b",
    "XDC": r"\bXDC\b", "Hedera": r"\b(Hedera|HBAR)\b", "XPR": r"\b(XPR Network|XPR|Metal Pay)\b", "Zebec": r"\b(Zebec|ZBCN)\b",
}
PAYMENT = re.compile(r"(?i)\b(pay|payment|payments|payout|settle|settlement|stablecoin|remit|remittance|merchant|checkout|"
                     r"on-?ramp|off-?ramp|ramps?|payroll|card|cross-border|money movement|digital dollar|USDC|RLUSD|PYUSD|USDT\w*)\b")
# Title must read like a launch / integration / go-live (this is a launches feed, not a blog digest).
LAUNCH_TITLE = re.compile(r"(?i)\b(launch\w*|live|integrat\w*|partner\w*|adds?|expands?|bring\w*|introduc\w*|support\w*|"
                          r"enabl\w*|pilot\w*|settle\w*|payments?|ramps?|payroll|cards?|joins?|rolls? out|debuts?|available|moves?)\b")
# Not investment content: drop trading, yield, fund, price, and corporate/IR/event posts.
EXCLUDE = re.compile(r"(?i)(price|airdrop|giveaway|perpetual|swaps?\b|derivative|delta one|prime brokerage|\byield|\bearn\b|"
                     r"\bfund\b|money market|private credit|trading|invest\w*|defi\b|financial results|earnings|\bcfo\b|\bceo\b|"
                     r"\bholders\b|\bq[1-4] 20\d\d|ripple prime|lending|credit|\bylds\b|universit|xcelerator|accelerator|ai for|appoint|hires?\b|grants?\b|lineup|agenda|webinar|summit|conference|bounty|hackathon|explained|guide\b|^what |^how |^why )")

def fetch(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode(r.headers.get_content_charset() or "utf-8", "ignore")

class Page(HTMLParser):
    def __init__(self):
        super().__init__(); self.skip = 0; self.text = []; self.meta = {}; self.links = []; self.title = ""; self._t = False; self.times = []
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("script", "style", "noscript"): self.skip += 1
        if tag == "title": self._t = True
        if tag == "meta":
            k = a.get("property") or a.get("name") or a.get("itemprop")
            if k and a.get("content") and k not in self.meta: self.meta[k] = a["content"]
        if tag == "a" and a.get("href"): self.links.append(a["href"])
        if tag == "time" and a.get("datetime"): self.times.append(a["datetime"])
    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript") and self.skip: self.skip -= 1
        if tag == "title": self._t = False
    def handle_data(self, d):
        if self._t: self.title += d
        if not self.skip: self.text.append(d)

MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec"

def norm_date(s):
    s = (s or "").strip()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", s)
    if m: return m.group(1)
    for fmt in ("%B %d, %Y", "%b %d, %Y", "%b. %d, %Y", "%d %B %Y"):
        try: return dt.datetime.strptime(s.replace("Sept ", "Sep "), fmt).date().isoformat()
        except ValueError: pass
    try: return email.utils.parsedate_to_datetime(s).date().isoformat()
    except Exception: return None

def page_date(raw, p, title):
    """Structured metadata first; then a 'Month D, YYYY' that sits right before the page's own title."""
    for k in ("article:published_time", "datePublished", "og:article:published_time", "publish_date", "date"):
        if p.meta.get(k):
            d = norm_date(p.meta[k]);  # noqa
            if d: return d, "meta:" + k
    m = re.search(r'"datePublished"\s*:\s*"([^"]+)"', raw)
    if m and norm_date(m.group(1)): return norm_date(m.group(1)), "jsonld"
    if p.times and norm_date(p.times[0]): return norm_date(p.times[0]), "time-tag"
    m = re.search(r'"(?:publishedAt|publishDate|date)"\s*:\s*"(\d{4}-\d{2}-\d{2}[^"]*)"', raw)
    if m: return m.group(1)[:10], "json-field"
    text = re.sub(r"\s+", " ", " ".join(p.text)); head = re.escape(title[:40].strip())
    if head:
        m = re.search(r"((?:%s)\.? \d{1,2}, 20\d\d)\s+(?:[A-Za-z ]{0,30})?%s" % (MONTHS, head), text)
        if m: return norm_date(m.group(1)), "date-before-title"
    return None, None

def _toks(t):
    return {w for w in re.findall(r"[a-z0-9][a-z0-9-]{3,}", (t or "").lower())}

def is_dup(c, items):
    """Same story from two official pages (e.g. a press release and a blog post): same date +/-1 day, similar title."""
    if not c.get("date"): return False
    d0, a = dt.date.fromisoformat(c["date"]), _toks(c["title"])
    for i in items:
        if not i.get("date"): continue
        if abs((dt.date.fromisoformat(i["date"]) - d0).days) <= 1:
            b = _toks(i["title"])
            if a and b and len(a & b) / min(len(a), len(b)) >= 0.5: return True
    return False

def tag_rails(text, hint):
    tags = [t for t, rx in RAILS.items() if re.search(rx, text)]
    return sorted(set(tags) | set(hint)), bool(tags)

def from_rss(src):
    root = ET.fromstring(fetch(src["url"]).encode("utf-8"))
    ns = {"a": "http://www.w3.org/2005/Atom"}
    out = []
    for it in root.iter("item"):
        out.append(dict(title=(it.findtext("title") or "").strip(), url=(it.findtext("link") or "").strip(),
                        date=norm_date(it.findtext("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date") or ""),
                        summary=re.sub(r"<[^>]+>", " ", html.unescape(it.findtext("description") or ""))[:600], date_src="rss"))
    for e in root.findall("a:entry", ns):
        link = e.find("a:link", ns)
        out.append(dict(title=(e.findtext("a:title", "", ns)).strip(), url=link.get("href") if link is not None else "",
                        date=norm_date(e.findtext("a:published", "", ns) or e.findtext("a:updated", "", ns)),
                        summary=re.sub(r"<[^>]+>", " ", e.findtext("a:summary", "", ns))[:600], date_src="atom"))
    return out

def from_listing(src, seen):
    raw = fetch(src["url"]); p = Page(); p.feed(raw)
    rx = re.compile(src["pattern"]); links = []
    for h in p.links:
        path = urllib.parse.urlparse(h).path if h.startswith("http") else h.split("?")[0].split("#")[0]
        if rx.match(path):
            u = urllib.parse.urljoin(src["url"], h)
            if u not in links: links.append(u)
    out = []
    for u in [l for l in links if l not in seen][:MAX_NEW_PAGES_PER_SOURCE]:
        try:
            r = fetch(u); q = Page(); q.feed(r)
        except Exception as ex:
            out.append(dict(url=u, title="", date=None, summary="", date_src=None, error=str(ex)[:120])); continue
        title = html.unescape(q.meta.get("og:title") or q.title or "").strip()
        title = re.sub(r"\s*[|–-]\s*(Ripple|Stellar|Circle|Zebec.*|BVNK|Metal Dollar.*)$", "", title)
        title = re.sub(r"^(Stellar|Ripple|Circle)\s*\|\s*", "", title)
        d, ds = page_date(r, q, title)
        if not d:  # fall back to the date printed next to this title on the official listing page
            lt = re.sub(r"\s+", " ", " ".join(p.text)); head = re.escape(title[:40].strip())
            m = re.search(r"((?:%s)\.? \d{1,2}, 20\d\d)\s+(?:[A-Za-z ]{0,30})?%s" % (MONTHS, head), lt) if head else None
            if m: d, ds = norm_date(m.group(1)), "listing-date-before-title"
        body = re.sub(r"\s+", " ", " ".join(q.text))[:8000]
        out.append(dict(url=u, title=title, date=d, date_src=ds, summary=(q.meta.get("og:description") or q.meta.get("description") or "")[:600], body=body))
    return out

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    cfg = json.loads((DATA / "feeds.json").read_text())
    state_p = DATA / "refresh_state.json"
    state = json.loads(state_p.read_text()) if state_p.exists() else {"seen": []}
    seen = set(state["seen"])
    news_p = DATA / "news.json"
    existing = json.loads(news_p.read_text())["items"] if news_p.exists() else []
    seed = json.loads((DATA / "news_seed.json").read_text())["items"]
    bp = DATA / "news_block.json"
    blocked = set(json.loads(bp.read_text())["urls"]) if bp.exists() else set()
    by_url = {i["url"]: i for i in existing if i["url"] not in blocked}
    for s in seed:
        by_url.setdefault(s["url"], dict(s, origin="curated"))
    today = dt.date.today(); cutoff = (today - dt.timedelta(days=MAX_AGE_DAYS)).isoformat()
    new, review, errors = [], [], []
    for src in cfg["sources"]:
        try:
            cands = from_rss(src) if src["type"] == "rss" else from_listing(src, seen)
        except Exception as ex:
            errors.append(f"{src['name']}: {str(ex)[:140]}"); continue
        for c in cands:
            u = c.get("url"); 
            if not u: continue
            if c.get("error"): errors.append(f"{src['name']}: {u} {c['error']}"); continue
            seen.add(u)
            if u in by_url or u in blocked: continue
            head = f"{c['title']} {c.get('summary','')}"
            tags, explicit = tag_rails(head, src.get("rail_hint", []))
            if not explicit and c.get("body"):
                body_tags = [t for t, rx in RAILS.items() if len(re.findall(rx, c["body"])) >= 2]
                tags, explicit = sorted(set(tags) | set(body_tags)), bool(body_tags)
            relevant = ((explicit or src.get("rail_hint")) and LAUNCH_TITLE.search(c["title"])
                        and PAYMENT.search(head) and not EXCLUDE.search(c["title"]))
            if relevant and is_dup(c, by_url.values()): continue
            if not relevant or not c["title"]: continue
            item = dict(date=c["date"], title=c["title"], rails=tags, url=u, publisher=src["publisher"],
                        origin="feed:" + src["name"], date_source=c.get("date_src"))
            if not c["date"]:
                review.append(item); continue
            if c["date"] < cutoff: continue
            by_url[u] = item; new.append(item)
    items = sorted(by_url.values(), key=lambda i: i.get("date") or "", reverse=True)
    items = [i for i in items if (i.get("date") or "") >= cutoff][:MAX_ITEMS]
    delta = dict(run_at=dt.datetime.now().astimezone().isoformat(timespec="seconds"), new_count=len(new),
                 new=sorted(new, key=lambda i: i["date"], reverse=True), needs_review=review, errors=errors)
    if not a.dry_run:
        news_p.write_text(json.dumps(dict(updated=today.isoformat(), items=items), indent=2, ensure_ascii=False))
        state_p.write_text(json.dumps({"seen": sorted(seen)}, indent=0))
        (DATA / "news_delta.json").write_text(json.dumps(delta, indent=2, ensure_ascii=False))
        rp = DATA / "news_review.json"
        old = json.loads(rp.read_text()) if rp.exists() else []
        merged = {r["url"]: r for r in old + review if r["url"] not in by_url}
        rp.write_text(json.dumps(list(merged.values()), indent=2, ensure_ascii=False))
    if a.json: print(json.dumps(delta, indent=2, ensure_ascii=False)); return
    print(f"{len(new)} new item(s); {len(items)} total in feed; {len(review)} need date review; {len(errors)} source error(s)")
    for i in delta["new"]: print(f"  + {i['date']}  [{', '.join(i['rails'])}]  {i['title'][:90]}\n      {i['url']}")
    for e in errors: print("  ! " + e)

if __name__ == "__main__":
    main()
