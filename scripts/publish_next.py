#!/usr/bin/env python3
"""
Weekly release step (run by GitHub Actions each Wednesday).

Reads scripts/schedule.json. Any post whose release date has arrived and is
not yet published gets surfaced: its card is inserted at the top of the blog
listing and its URL is added to the sitemap. The pages themselves already
exist under blogs/ (deployed up front so cross-links never break), so this
step only reveals them on the visible site + sitemap.

Idempotent and catch-up safe: if a run is missed, the next run publishes every
overdue post. Prints the URLs it published so the Action log shows what to
request-index in Search Console.
"""
import json, io, os, datetime, sys

SCHEDULE = "scripts/schedule.json"
LISTING  = "blogs.html"
SITEMAP  = "sitemap.xml"
MARKER   = "<!-- SCHEDULED-INSERT -->"

def main():
    today = os.environ.get("SELEQT_TODAY") or datetime.date.today().isoformat()
    sched = json.load(io.open(SCHEDULE, encoding="utf-8"))
    due = [p for p in sched if not p["published"] and p["date"] <= today]
    due.sort(key=lambda p: p["date"])
    if not due:
        print("Nothing due today (%s)." % today); return

    listing = io.open(LISTING, encoding="utf-8").read()
    sitemap = io.open(SITEMAP, encoding="utf-8").read()

    # oldest-first so the newest ends up directly under the marker (top of page)
    for p in due:
        if p["listing_card"].strip() in listing:
            p["published"] = True; continue
        listing = listing.replace(MARKER, MARKER + "\n" + p["listing_card"], 1)
        if ("/blogs/%s<" % p["slug"]) not in sitemap and p["sitemap_url"].strip() not in sitemap:
            sitemap = sitemap.replace("</urlset>", p["sitemap_url"] + "</urlset>")
        p["published"] = True
        print("PUBLISHED: https://seleqtwealth.in/blogs/%s  (%s)" % (p["slug"], p["date"]))

    # refresh the /blogs lastmod to the newest release date
    newest = max(p["date"] for p in due)
    import re
    sitemap = re.sub(
        r'(<loc>https://seleqtwealth\.in/blogs</loc>\s*<lastmod>)[^<]+(</lastmod>)',
        r'\g<1>%s\g<2>' % newest, sitemap, count=1)

    io.open(LISTING, "w", encoding="utf-8").write(listing)
    io.open(SITEMAP, "w", encoding="utf-8").write(sitemap)
    io.open(SCHEDULE, "w", encoding="utf-8").write(json.dumps(sched, indent=2, ensure_ascii=False))
    print("Released %d post(s)." % len(due))

if __name__ == "__main__":
    main()
