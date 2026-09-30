#!/usr/bin/env python3
"""
Build atlas/schema.json from the ATLAS PDF: every blank the family fills in, with
its section, group, label, and exact position on the page. The fill-in page builds
its form from this file, and writes answers back onto the same PDF (atlas/template.pdf)
at these positions, so the form and the PDF can never drift apart.

    python3 scripts/build_atlas_schema.py [path/to/SELEQT_ATLAS.pdf]

Re-run it whenever the ATLAS PDF is revised, then check the printed outline.
Needs PyMuPDF (fitz); the page itself needs nothing but the JSON it writes.
"""
import json, os, re, sys
import fitz

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "atlas", "template.pdf")
OUT = os.path.join(ROOT, "atlas", "schema.json")

FIELD = (0.78, 0.80, 0.84)      # the grey rule under each answer
GRID = (0.86, 0.87, 0.90)       # table cell borders
CARD_BG = [(0.984, 0.984, 0.976), (0.945, 0.957, 0.976)]  # off-white and pale blue cards
NAVY = (0.04, 0.10, 0.21)       # cover and table header fill
COVER_LINE = (0.20, 0.27, 0.42)
CALLOUT_BG = (0.97, 0.96, 0.95)
GOLD_TXT = (185, 147, 89)
NAVY_TXT = (10, 26, 53)


def near(c, t, tol=0.008):  # colours here differ by as little as 0.02 (grid vs card border, card vs white)
    return bool(c) and len(c) >= 3 and all(abs(a - b) <= tol for a, b in zip(c, t))


def uncap(s):
    """'P R I M A R Y  H O L D E R' -> 'PRIMARY HOLDER'"""
    return " ".join(w.replace(" ", "") for w in re.split(r"\s{2,}", s.strip()) if w.strip())


def spaced_caps(s):
    """Letter-spaced small caps: single characters, words split by a wider gap."""
    toks = s.split()
    return len(toks) >= 2 and all(len(t) == 1 for t in toks)


def nice(s):
    """'PRIMARY HOLDER' -> 'Primary holder', keeping acronyms."""
    keep = {"NRE", "NRO", "FCNR", "SELEQT", "PMS", "AIF", "NPS", "EPF", "PPF", "UAN", "PRAN", "HUF", "LLP",
            "RC", "DP", "ID", "CA", "IFSC", "GIFT", "LRS", "US", "OTP", "PAN", "EMI"}
    words = s.split()
    out = []
    for i, w in enumerate(words):
        bare = re.sub(r"[^A-Z]", "", w)
        if bare in keep:
            out.append(w)
        else:
            lw = w.lower()
            out.append(lw.capitalize() if i == 0 else lw)
    return " ".join(out).replace("Sips", "SIPs").replace(" sips", " SIPs")


def slug(s, n=40):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:n].strip("-")


def rgb(c):
    return (c >> 16 & 255, c >> 8 & 255, c & 255)


def page_parts(page):
    spans, rects = [], []
    for b in page.get_text("dict")["blocks"]:
        for l in b.get("lines", []):
            for s in l["spans"]:
                if s["text"].strip():
                    spans.append({"t": s["text"], "b": fitz.Rect(s["bbox"]), "size": round(s["size"], 1),
                                  "font": s["font"], "rgb": rgb(s["color"])})
    for d in page.get_drawings():
        fill = tuple(d.get("fill") or ())
        for it in d["items"]:
            if it[0] == "re":
                rects.append((fitz.Rect(it[1]), fill))
    return spans, rects


def dedupe_lines(lines):
    out = []
    for r in sorted(lines, key=lambda r: (round(r.y0, 1), r.x0)):
        if not any(abs(r.y0 - o.y0) < 0.6 and abs(r.x0 - o.x0) < 0.6 and abs(r.x1 - o.x1) < 0.6 for o in out):
            out.append(r)
    return out


def inside(r, box, pad=1.0):
    return r.x0 >= box.x0 - pad and r.x1 <= box.x1 + pad and r.y0 >= box.y0 - pad and r.y1 <= box.y1 + pad


def build():
    doc = fitz.open(SRC)
    parts, used_ids = [], set()

    def uid(base):
        base = base[:90]
        i, cand = 1, base
        while cand in used_ids:
            i += 1
            cand = "%s-%d" % (base, i)
        used_ids.add(cand)
        return cand

    for pi, page in enumerate(doc):
        spans, rects = page_parts(page)
        num = "%02d" % (pi + 1)
        part = {"id": "p" + num, "page": pi, "blocks": []}

        sec = next((s for s in spans if s["t"].replace(" ", "").upper().startswith("SECTION")), None)
        title_spans = [s for s in spans if s["font"].startswith("TeXGyrePagella") and s["size"] > 20]
        if sec:
            label = uncap(sec["t"])
            part["section"] = re.search(r"\d+", label).group(0)
            part["continued"] = "CONTINUED" in label
        title_top = min((s["b"].y0 for s in title_spans), default=0)
        title_bottom = max((s["b"].y1 for s in title_spans), default=0)
        if title_spans:
            part["title"] = "".join(s["t"] for s in title_spans).strip()
            part["titleHtml"] = "".join(("<em>%s</em>" % s["t"]) if "Italic" in s["font"] else s["t"] for s in title_spans).strip()
        # Intro: the light 9.8pt lines under the title, before the first rule
        intro = [s for s in spans if s["font"] == "Poppins-Light" and abs(s["size"] - 9.8) < 0.3 and title_bottom < s["b"].y0 < title_bottom + 70]
        if intro:
            part["intro"] = " ".join(s["t"].strip() for s in sorted(intro, key=lambda s: (s["b"].y0, s["b"].x0)))

        cards = [r for r, f in rects if any(near(f, c, 0.005) for c in CARD_BG) and r.width > 100 and r.height > 20]
        callouts = [r for r, f in rects if near(f, CALLOUT_BG) and r.width > 100]
        field_lines = dedupe_lines([r for r, f in rects if near(f, FIELD) and r.height < 1.2 and r.width > 20])
        navy_boxes = [r for r, f in rects if near(f, NAVY, 0.01) and r.width < 500 and r.height < 45]  # header cells, not panels
        squares = [r for r, f in rects if near(f, (1, 1, 1), 0.004) and abs(r.width - r.height) < 0.8 and 5 < r.width < 12]
        light = [s for s in spans if s["font"] == "Poppins-Light" and s["size"] < 9]

        items = []  # (y, x, block) gathered, then ordered top to bottom

        def heading_above(y, x0=None, within=60):
            cands = [s for s in spans if s["font"] == "Poppins-Medium" and spaced_caps(s["t"]) and s["rgb"] == NAVY_TXT
                     and s["b"].y1 <= y + 1 and y - s["b"].y1 < within and not any(inside(s["b"], c) for c in cards)]
            return max(cands, key=lambda s: s["b"].y1) if cands else None

        # ---- Cover (first page): white labels on navy, own rule colour ----
        if pi == 0:
            cover_lines = dedupe_lines([r for r, f in rects if near(f, COVER_LINE) and r.height < 1.2])
            fields = []
            for ln in cover_lines:
                lab = [s for s in spans if s["b"].x1 <= ln.x0 + 2 and ln.y0 - 14 < s["b"].y1 < ln.y0 + 3]
                if not lab:
                    continue
                lab = max(lab, key=lambda s: s["b"].x1)
                fields.append({"id": uid("cover." + slug(lab["t"])), "label": lab["t"].strip(), "page": pi,
                               "x0": round(ln.x0 + 3, 1), "x1": round(ln.x1 - 2, 1), "y": round(ln.y0 - 3.2, 1), "light": True})
            part.update({"kind": "cover", "title": "Cover"})
            part["blocks"].append({"type": "fields", "group": None, "fields": fields})
            parts.append(part)
            continue

        # ---- Tables: a row of navy header cells over a grid ----
        rows_by_y = {}
        for b in navy_boxes:
            rows_by_y.setdefault(round(b.y0), []).append(b)
        table_lines_used = set()
        for ty, cells in sorted(rows_by_y.items()):
            cells = sorted(cells, key=lambda r: r.x0)
            tx0, tx1, hy1 = cells[0].x0, cells[-1].x1, max(c.y1 for c in cells)
            cols = []
            for c in cells:
                txt = [s for s in spans if inside(s["b"], c, 2)]
                txt = " ".join(uncap(s["t"]) if spaced_caps(s["t"]) else s["t"].strip() for s in sorted(txt, key=lambda s: (s["b"].y0, s["b"].x0)))
                cols.append({"label": nice(txt), "x0": round(c.x0, 1), "x1": round(c.x1, 1)})
            grid = sorted({round(r.y0, 1) for r, f in rects if near(f, GRID) and r.height < 1.2
                           and r.x0 >= tx0 - 2 and r.x1 <= tx1 + 2 and r.y0 > hy1 - 1})
            ys, prev = [round(hy1, 1)], hy1
            for gy in grid:
                if gy - prev < 3:
                    continue
                if gy - prev > 40:
                    break
                ys.append(gy)
                prev = gy
            head = heading_above(ty)
            tname = uncap(head["t"]) if head else None  # e.g. the review log sits straight under its title
            tid = "p%s.%s" % (num, slug(tname or "table"))
            rows = []
            for ri in range(len(ys) - 1):
                y0, y1 = ys[ri], ys[ri + 1]
                rows.append([{"id": uid("%s.r%d.%s" % (tid, ri + 1, slug(col["label"], 24))), "page": pi,
                              "x0": round(col["x0"] + 5, 1), "x1": round(col["x1"] - 4, 1),
                              "y0": y0, "y1": y1} for col in cols])
            if not rows:
                continue
            items.append((ty, tx0, {"type": "table", "id": tid, "title": nice(tname) if tname else None, "cols": [c["label"] for c in cols], "rows": rows}))
            for ri in range(len(ys)):
                table_lines_used.add(ys[ri])

        # ---- Checkboxes: a small white square with a label to its right ----
        checks = []
        for sq in sorted(squares, key=lambda r: (round(r.y0), r.x0)):
            cy = (sq.y0 + sq.y1) / 2
            lab = [s for s in spans if sq.x1 <= s["b"].x0 < sq.x1 + 20 and abs((s["b"].y0 + s["b"].y1) / 2 - cy) < 5]
            if not lab:
                continue
            lab = min(lab, key=lambda s: s["b"].x0)
            head = heading_above(sq.y0, within=400)
            checks.append((sq, lab["t"].strip(), uncap(head["t"]) if head else None))
        groups = {}
        for sq, text, head in checks:
            groups.setdefault(head, []).append((sq, text))
        for head, lst in groups.items():
            base = "p%s.%s" % (num, slug(head or "checklist"))
            # read the two-column grid down the first column, then the second
            lst = sorted(lst, key=lambda t: (round(t[0].x0 / 60), t[0].y0))
            items.append((min(t[0].y0 for t in lst) - 0.5, 0, {"type": "checks", "title": nice(head) if head else None, "items": [
                {"id": uid("%s.%s" % (base, slug(text, 32))), "label": text, "page": pi,
                 "box": [round(v, 1) for v in (sq.x0, sq.y0, sq.x1, sq.y1)]} for sq, text in lst]}))

        # ---- Answer lines: labelled (fields) or unlabelled full-width (free writing) ----
        free, by_card = [], {}
        for ln in field_lines:
            lab = [s for s in light if s["b"].x1 <= ln.x0 + 4 and ln.y0 - 10 < s["b"].y1 < ln.y0 + 3]
            if not lab:
                if ln.width > 400:
                    free.append(ln)
                else:
                    print("  ! page %d: line at y=%.1f x=%.1f has no label" % (pi + 1, ln.y0, ln.x0))
                continue
            lab = max(lab, key=lambda s: s["b"].x1)
            card = next((c for c in cards if inside(ln, c, 2)), None)
            gt = None
            if card:
                gts = [s for s in spans if s["font"] == "Poppins-Medium" and spaced_caps(s["t"]) and inside(s["b"], card, 2)]
                gt = uncap(min(gts, key=lambda s: s["b"].y0)["t"]) if gts else None
            key = (round(card.y0) if card else -1, gt)
            by_card.setdefault(key, {"card": card, "group": gt, "fields": []})["fields"].append((ln, lab))
        for key, g in by_card.items():
            gname = g["group"] or "details"
            fields = []
            for ln, lab in sorted(g["fields"], key=lambda t: (round(t[0].y0), t[0].x0)):
                label = lab["t"].strip()
                fields.append({"id": uid("p%s.%s.%s" % (num, slug(gname, 30), slug(label, 40))), "label": label, "page": pi,
                               "x0": round(ln.x0 + 3, 1), "x1": round(ln.x1 - 2, 1), "y": round(ln.y0 - 3.2, 1),
                               "half": ln.x1 < 300 or ln.x0 > 290})
            top = g["card"].y0 if g["card"] else min(t[0].y0 for t in g["fields"])
            block = {"type": "fields", "group": nice(g["group"]) if g["group"] else None, "fields": fields}
            # a navy sub-heading just above this card introduces it
            if g["card"]:
                head = heading_above(g["card"].y0, within=30)
                if head:
                    items.append((head["b"].y0, 0, {"type": "heading", "text": nice(uncap(head["t"]))}))
            # extra light lines inside the card that are not labels are guidance text
            if g["card"]:
                notes = [s for s in light if inside(s["b"], g["card"], 2) and not any(s is lab for _, lab in g["fields"])
                         and s["b"].y0 > max(t[0].y0 for t in g["fields"])]
                if notes:
                    block["note"] = " ".join(s["t"].strip() for s in sorted(notes, key=lambda s: (s["b"].y0, s["b"].x0)))
            items.append((top, 0, block))
        if free:
            free = sorted(free, key=lambda r: r.y0)
            items.append((free[0].y0, 0, {"type": "lines", "id": uid("p%s.writing" % num), "page": pi,
                                          "lines": [{"x0": round(r.x0 + 2, 1), "x1": round(r.x1 - 2, 1), "y": round(r.y0 - 4, 1)} for r in free]}))
        # Headings over tables and checklists are carried by those blocks; others stand alone
        # ---- Callouts: a bold lead and the advice after it ----
        for c in callouts:
            txt = sorted([s for s in spans if inside(s["b"], c, 2)], key=lambda s: (round(s["b"].y0), s["b"].x0))
            lead = " ".join(s["t"].strip() for s in txt if s["font"] == "Poppins-Medium")
            rest = " ".join(s["t"].strip() for s in txt if s["font"] != "Poppins-Medium")
            items.append((c.y0, 0, {"type": "note", "lead": lead, "text": rest}))

        # de-duplicate headings (a heading can sit over several cards)
        seen_heads, ordered = set(), []
        for y, x, blk in sorted(items, key=lambda t: (round(t[0]), t[1])):
            if blk["type"] == "heading":
                if blk["text"] in seen_heads:
                    continue
                seen_heads.add(blk["text"])
            ordered.append(blk)
        part["blocks"] = ordered
        if pi == 1:
            part.update({"kind": "guide", "title": "How to use this file"})
        parts.append(part)

    schema = {"v": 1, "pageSize": [round(doc[0].rect.width), round(doc[0].rect.height)], "pages": len(doc), "parts": parts}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(schema, fh, ensure_ascii=False, separators=(",", ":"))
    return schema


def outline(schema):
    total = {"fields": 0, "cells": 0, "checks": 0, "lines": 0}
    for p in schema["parts"]:
        print("\n== page %d  [%s] %s%s" % (p["page"] + 1, p.get("section", "-"), p.get("title", ""), "  (continued)" if p.get("continued") else ""))
        for b in p["blocks"]:
            t = b["type"]
            if t == "fields":
                total["fields"] += len(b["fields"])
                print("   group %-44s %2d fields: %s" % ((b["group"] or "(none)")[:44], len(b["fields"]), ", ".join(f["label"][:22] for f in b["fields"])[:150]))
            elif t == "table":
                total["cells"] += sum(len(r) for r in b["rows"])
                print("   table %-44s %d rows x %d: %s" % ((b["title"] or "(untitled)")[:44], len(b["rows"]), len(b["cols"]), " | ".join(b["cols"])))
            elif t == "checks":
                total["checks"] += len(b["items"])
                print("   checks %-43s %d items" % ((b["title"] or "(none)")[:43], len(b["items"])))
            elif t == "lines":
                total["lines"] += len(b["lines"])
                print("   writing lines: %d" % len(b["lines"]))
            elif t == "heading":
                print("   -- %s" % b["text"])
            elif t == "note":
                print("   note: %s %s" % (b["lead"][:40], b["text"][:60]))
    print("\nTOTAL", total)


if __name__ == "__main__":
    outline(build())
    print("wrote", OUT)
