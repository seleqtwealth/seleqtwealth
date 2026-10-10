#!/usr/bin/env python3
"""
Weekly fund scoring for the Portfolio Analyser action plan (Phase 1, mutual funds).

Public data only (AMFI is the source of record):
  * scheme master, plan, option, current SEBI category : AMFI NAVAll.txt
  * month-end NAVs for the last seven years            : AMFI NAV history download
  * fund size (quarterly average AUM)                  : AMFI average AUM, scheme-wise
  * expense ratios                                     : data/schemes.json (AMFI TER)
  * daily NAVs of the index-fund proxies (missed gains): MFapi.in mirror of AMFI, checked
                                                         against the AMFI month-ends

Writes data/fund-scores.json, data/proxy-navs.json, data/benchmark-gaps.json, and prints a
report. Every threshold comes from data/plan-config.json. Stdlib only.

    python3 scripts/build_fund_scores.py
"""
import datetime, json, os, re, statistics, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
import amc_sources as src  # cached http_get with retries

CFG = json.load(open(os.path.join(ROOT, "data", "plan-config.json"), encoding="utf-8"))
SC = CFG["scoring"]
NAVALL_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
HIST_URL = "https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt={d}&todt={d}"
AUM_URL = "https://www.amfiindia.com/api/average-aum-schemewise?strType=Categorywise&fyId={fy}&periodId={p}"
ISIN_RX = re.compile(r"^IN[EF][0-9A-Z]{9}$")
REPORT = {"bad_nav": 0, "bad_isin": 0, "unmapped_codes": set(), "notes": []}


# ------------------------------------------------------------- categories ----
CAT_MAP = [  # (regex on the SEBI category tail, canonical key)
    (r"large\s*&\s*mid", "large_mid"), (r"large cap", "large_cap"), (r"mid cap", "mid_cap"), (r"small cap", "small_cap"),
    (r"flexi", "flexi_cap"), (r"multi cap", "multi_cap"), (r"focused", "focused"), (r"elss", "elss"),
    (r"value", "value"), (r"contra", "contra"), (r"dividend yield", "dividend_yield"),
    (r"sectoral|thematic", "thematic"),
    (r"aggressive hybrid", "aggressive_hybrid"), (r"balanced advantage|dynamic asset", "balanced_advantage"),
    (r"multi asset", "multi_asset"), (r"equity savings", "equity_savings"), (r"arbitrage", "arbitrage"),
    (r"conservative hybrid", "conservative_hybrid"),
    (r"overnight", "overnight"), (r"liquid", "liquid"), (r"money market", "money_market"),
    (r"ultra short", "ultra_short"), (r"low duration", "low_duration"), (r"short duration", "short_duration"),
    (r"medium to long", "medium_long"), (r"medium duration", "medium_duration"), (r"long duration", "long_duration"),
    (r"dynamic bond", "dynamic_bond"), (r"corporate bond", "corporate_bond"), (r"credit risk", "credit_risk"),
    (r"banking and psu", "banking_psu"), (r"gilt", "gilt"), (r"floater", "floater"),
    (r"index", "index"), (r"etf", "etf"), (r"fof|fund of funds", "fof"),
]
EQUITY = {"large_cap", "large_mid", "mid_cap", "small_cap", "flexi_cap", "multi_cap", "focused", "elss", "value", "contra", "dividend_yield", "thematic"}
LABEL = {"large_cap": "Large Cap", "large_mid": "Large and Mid Cap", "mid_cap": "Mid Cap", "small_cap": "Small Cap",
         "flexi_cap": "Flexi Cap", "multi_cap": "Multi Cap", "focused": "Focused", "elss": "ELSS", "value": "Value",
         "contra": "Contra", "dividend_yield": "Dividend Yield", "thematic": "Sectoral and Thematic",
         "aggressive_hybrid": "Aggressive Hybrid", "balanced_advantage": "Balanced Advantage", "multi_asset": "Multi Asset",
         "equity_savings": "Equity Savings", "arbitrage": "Arbitrage", "conservative_hybrid": "Conservative Hybrid",
         "overnight": "Overnight", "liquid": "Liquid", "money_market": "Money Market", "ultra_short": "Ultra Short Duration",
         "low_duration": "Low Duration", "short_duration": "Short Duration", "medium_long": "Medium to Long Duration",
         "medium_duration": "Medium Duration", "long_duration": "Long Duration", "dynamic_bond": "Dynamic Bond",
         "corporate_bond": "Corporate Bond", "credit_risk": "Credit Risk", "banking_psu": "Banking and PSU",
         "gilt": "Gilt", "floater": "Floater", "index": "Index Fund", "etf": "ETF"}
HYBRID = {"aggressive_hybrid", "balanced_advantage", "multi_asset", "equity_savings", "arbitrage", "conservative_hybrid"}
DEBT = {"overnight", "liquid", "money_market", "ultra_short", "low_duration", "short_duration", "medium_long", "medium_duration",
        "long_duration", "dynamic_bond", "corporate_bond", "credit_risk", "banking_psu", "gilt", "floater"}


def canon(cat):
    c = (cat or "").lower()
    tail = c.split(" - ")[-1] if " - " in c else c
    for rx, key in CAT_MAP:
        if re.search(rx, tail):
            return key
    return "other"


def base_name(name):
    """Scheme name without plan and option words, to group siblings."""
    n = name.lower()
    n = re.sub(r"\b(direct|regular|retail|institutional|plan|option|growth|idcw|dividend|payout|reinvest(ment)?|bonus|"
               r"monthly|quarterly|half yearly|annual|weekly|daily|fortnightly|of|and|the|fund|scheme|transfer)\b", " ", n)
    n = re.sub(r"\(.*?\)", " ", n)
    return re.sub(r"[^a-z0-9]+", "", n)


# ----------------------------------------------------------------- NAVAll ----
def load_navall():
    text = src.get_text(NAVALL_URL, cache_hours=20)
    amc = cat = None
    rows = []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if ";" not in s:
            if s.endswith("Mutual Fund"):
                amc = s
            elif "(" in s:
                m = re.search(r"\((.*)\)", s)
                cat = (m.group(1) if m else s).strip()
                ended = "open ended" in s.lower()
                rows.append({"_hdr": True, "open": ended})
            continue
        p = [x.strip() for x in s.split(";")]
        if p[0] == "Scheme Code" or len(p) < 6:
            continue
        isins = [i for i in (p[1], p[2]) if ISIN_RX.match(i)]
        if not isins and (p[1] not in ("", "-") or p[2] not in ("", "-")):
            REPORT["bad_isin"] += 1
        rows.append({"code": p[0], "isins": isins, "name": p[3], "plan": p[4], "option": p[5], "amc": amc, "cat": cat,
                     "nav": p[6] if len(p) > 6 else "", "date": p[7] if len(p) > 7 else ""})
    out, is_open = [], True
    for r in rows:
        if r.get("_hdr"):
            is_open = r["open"]
            continue
        r["open"] = is_open
        out.append(r)
    return out


def is_direct(r):
    p = (r["plan"] or "").lower()
    return "direct" in p if p else "direct" in r["name"].lower()


def is_growth(r):
    # A few AMCs call the growth option "Cumulative" (not the "cum" inside "Income Distribution cum ...").
    o = (r["option"] or "").lower()
    if o:
        return bool(re.search(r"growth|\bcumulative\b", o)) and "idcw" not in o
    n = r["name"].lower()
    return bool(re.search(r"growth|\bcumulative\b", n)) and not re.search(r"idcw|dividend", n)


# ------------------------------------------------------------ NAV history ----
def month_ends(n):
    today = datetime.date.today()
    last = today.replace(day=1) - datetime.timedelta(days=1)  # last complete month
    out = []
    y, m = last.year, last.month
    for _ in range(n):
        d = (datetime.date(y + (m == 12), (m % 12) + 1, 1) - datetime.timedelta(days=1))
        out.append(d)
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return list(reversed(out))


def parse_hist(text):
    """AMFI history file -> {scheme_code: nav}. Placeholder NAVs (#N/A, N.A., blanks) are skipped."""
    out, cols = {}, None
    for line in text.splitlines():
        if ";" not in line:
            continue
        p = [x.strip() for x in line.split(";")]
        if p[0] == "Scheme Code":
            cols = {k: i for i, k in enumerate(p)}
            continue
        if not cols or not p[0].isdigit():
            continue
        raw = p[cols.get("Net Asset Value", 4)] if len(p) > cols.get("Net Asset Value", 4) else ""
        try:
            nav = float(raw.replace(",", ""))
        except ValueError:
            REPORT["bad_nav"] += 1
            continue
        if nav <= 0 or nav > 1e7:
            REPORT["bad_nav"] += 1
            continue
        out[p[0]] = nav
    return out


def nav_on(date, expect=0):
    """NAVs for the last business day on or before `date` (steps back over holidays). AMFI
    sometimes serves a truncated file; then codes it lacks are filled from the days before."""
    got = None
    for back in range(0, 7):
        d = date - datetime.timedelta(days=back)
        ds = d.strftime("%d-%b-%Y")
        hist = d < datetime.date.today() - datetime.timedelta(days=10)
        text = src.get_text(HIST_URL.format(d=ds), cache_hours=24 * 3650 if hist else 12, timeout=180)
        navs = parse_hist(text)
        if len(navs) > 2000 and got is None:
            got, base = d, dict(navs)
            if len(navs) >= 0.85 * expect:
                return got, base
            REPORT["notes"].append("short AMFI file for %s (%d schemes); filled from earlier days" % (d, len(navs)))
        elif got is not None:
            for code, nav in navs.items():
                base.setdefault(code, nav)
            if len(base) >= 0.85 * expect:
                break
    return (got, base) if got is not None else (date, {})


# -------------------------------------------------------------------- AUM ----
def load_aum():
    """Scheme-wise quarterly average AUM by AMFI code (the feed is in Rs lakh). The latest
    quarter is only served per fund house, so each MF_ID is asked in turn."""
    for fy, per in ((1, 1), (1, 2), (2, 1)):
        rows, labels = [], {}
        for mf in range(1, 101):
            try:
                j = json.loads(src.get_text(AUM_URL.format(fy=fy, p=per) + "&MF_ID=%d" % mf, cache_hours=24 * 6))
            except Exception:
                continue
            got = [x for blk in j.get("data", []) for x in blk.get("schemes", [])]
            rows += got
            if got:  # a few wound-up fund houses still answer with very old periods
                labels[j.get("selectedPeriod")] = labels.get(j.get("selectedPeriod"), 0) + len(got)
        if len(rows) > 3000:
            label = max(labels, key=labels.get)
            break
    else:
        REPORT["notes"].append("AUM: AMFI average AUM could not be loaded; size component missing for all funds")
        return {}, None
    out = {}
    for x in rows:
        a = x.get("AverageAumForTheMonth") or {}
        v = (a.get("ExcludingFundOfFundsDomesticButIncludingFundOfFundsOverseas") or 0) + (a.get("FundOfFundsDomestic") or 0)
        out[str(x.get("AMFI_Code"))] = v / 100.0  # Rs lakh -> Rs crore
    return out, label


# ------------------------------------------------------------------ maths ----
def pct_rank(values, v, higher_better=True):
    """Percentile (0-100) of v among values; ties share the midpoint."""
    if v is None or not values:
        return None
    lo = sum(1 for x in values if x < v)
    eq = sum(1 for x in values if x == v)
    p = (lo + 0.5 * eq) / len(values) * 100
    return p if higher_better else 100 - p


def cagr(a, b, years):
    return (b / a) ** (1 / years) - 1 if a and b and a > 0 else None


def main():
    cfg_lb, win = SC["lookback_months"], SC["window_months"]
    rows = load_navall()
    schemes = json.load(open(os.path.join(ROOT, "data", "schemes.json"), encoding="utf-8"))
    print("NAVAll rows:", len(rows), "| invalid ISINs dropped:", REPORT["bad_isin"])

    # Group plans and options of one scheme; pick its direct growth line.
    groups = {}
    code_to_row = {}
    for r in rows:
        code_to_row[r["code"]] = r
        key = (r["amc"], base_name(r["name"]))
        groups.setdefault(key, []).append(r)
    dg = {}       # direct growth code -> row
    sib = {}      # any ISIN -> direct growth ISIN of the same scheme
    for key, members in groups.items():
        cand = [m for m in members if is_direct(m) and is_growth(m) and m["isins"] and m["open"]]
        if not cand:
            continue
        best = cand[0]
        dg[best["code"]] = best
        for m in members:
            for i in m["isins"]:
                sib[i] = best["isins"][0]

    # Month-end NAVs for every scheme, last seven years (plus the window-start month).
    ends = month_ends(cfg_lb + 1)
    series = {}  # code -> [nav or None per month index]
    actual_dates = []
    prev = 0
    for mi, d in enumerate(ends):
        got, navs = nav_on(d, prev)
        prev = len(navs)
        actual_dates.append(got.isoformat())
        for code, nav in navs.items():
            series.setdefault(code, [None] * len(ends))[mi] = nav
        sys.stdout.write("\rNAV history: %d/%d months (%s, %d schemes)" % (mi + 1, len(ends), got, len(navs)))
        sys.stdout.flush()
    print()
    for code in series:
        if code not in code_to_row:
            REPORT["unmapped_codes"].add(code)
    _, gf_navs = nav_on(datetime.date(2018, 1, 31))
    gf = {}
    for code, nav in gf_navs.items():
        r = code_to_row.get(code)
        if r:
            for i in r["isins"]:
                gf[i] = round(nav, 4)

    aum_code, aum_label = load_aum()
    scheme_aum = {}
    for key, members in groups.items():
        tot = sum(aum_code.get(m["code"], 0) for m in members)
        for m in members:
            if m["code"] in dg:
                scheme_aum[m["code"]] = tot if tot > 0 else None

    # Per fund statistics on the direct growth line.
    funds = {}
    last = len(ends) - 1
    for code, r in dg.items():
        s = series.get(code)
        isin = r["isins"][0]
        cat = canon(r["cat"])
        if cat in ("fof", "other"):
            continue
        ter = (schemes.get(isin) or {}).get("ter")
        months = sum(1 for x in (s or []) if x)
        first = next((i for i, x in enumerate(s or []) if x), None)
        f = {"code": code, "isin": isin, "n": r["name"], "amc": r["amc"], "cat": cat, "catLabel": LABEL.get(cat, (r["cat"] or "").split(" - ")[-1]),
             "ter": ter, "aum": round(scheme_aum[code], 1) if scheme_aum.get(code) else None,
             "months": months, "s": s, "isIndex": cat in ("index", "etf")}
        if s and s[last]:
            for yrs in (1, 3, 5):
                a = s[last - 12 * yrs] if last - 12 * yrs >= 0 else None
                f["r%d" % yrs] = round(cagr(a, s[last], yrs) * 100, 2) if a else None
        funds[isin] = f

    # Window CAGRs: windows end at month indices win..last.
    starts = list(range(0, last - win + 1))  # 49 windows over 84 months
    def windows(s):
        out = {}
        for k in starts:
            a, b = s[k], s[k + win]
            if a and b:
                out[k] = cagr(a, b, win / 12)
        return out
    def monthly(s):
        return {i: s[i] / s[i - 1] - 1 for i in range(1, len(s)) if s[i] and s[i - 1]}
    for f in funds.values():
        f["w"] = windows(f["s"]) if f["s"] else {}
        f["mret"] = monthly(f["s"]) if f["s"] else {}

    # ---- benchmarks: licensed slot, index-fund proxy, category peers ----
    bcfg = {k: v for k, v in CFG["benchmarks"].items() if not k.startswith("_")}
    index_funds = [f for f in funds.values() if f["cat"] == "index"]
    proxies = {}
    for cat, b in bcfg.items():
        if b["index"] in proxies:
            continue
        rx = re.compile(b["match"], re.I)
        cands = [f for f in index_funds if rx.search(f["n"]) and len(f["w"]) >= SC["min_windows"]]
        cands.sort(key=lambda f: ((f["ter"] if f["ter"] is not None else 9), -f["months"]))
        proxies[b["index"]] = cands[0] if cands else None
        allc = [f for f in index_funds if rx.search(f["n"])]
        REPORT["notes"].append("proxy %-22s %s" % (b["index"], ("%s (TER %s, %d windows)" % (cands[0]["n"], cands[0]["ter"], len(cands[0]["w"])))
                                if cands else "none with enough history (%d index funds found, longest %d months)" % (len(allc), max([x["months"] for x in allc] or [0]))))

    by_cat = {}
    for f in funds.values():
        by_cat.setdefault(f["cat"], []).append(f)
    peer_w, peer_m = {}, {}
    for cat, lst in by_cat.items():
        peer_w[cat] = {k: statistics.median([f["w"][k] for f in lst if k in f["w"]]) for k in starts if sum(1 for f in lst if k in f["w"]) >= 3}
        months_idx = set(i for f in lst for i in f["mret"])
        peer_m[cat] = {i: statistics.median([f["mret"][i] for f in lst if i in f["mret"]]) for i in months_idx if sum(1 for f in lst if i in f["mret"]) >= 3}

    for f in funds.values():
        cat = f["cat"]
        b = bcfg.get(cat)
        proxy = proxies.get(b["index"]) if b else None
        if f["isIndex"]:
            f["bsrc"], f["bname"], f["bvia"] = "index_peers", None, None
            continue
        if proxy and proxy["isin"] != f["isin"]:
            f["bsrc"], f["bname"], f["bvia"], f["bisin"] = "index_fund_proxy", b["index"], proxy["n"], proxy["isin"]
            bw, bm = proxy["w"], proxy["mret"]
        else:
            n = len(by_cat.get(cat, []))
            f["bsrc"], f["bname"] = "category_peers", (b["index"] if b else None)
            f["bvia"] = "median of %d direct-plan %s funds" % (n, f["catLabel"].lower().replace(" fund", ""))
            bw, bm = peer_w.get(cat, {}), peer_m.get(cat, {})
        common = [k for k in f["w"] if k in bw]
        f["nw"] = len(common)
        if len(common) < SC["min_windows"]:
            f["tooNew"] = True
            continue
        diffs = [f["w"][k] - bw[k] for k in common]
        f["beat"] = sum(1 for d in diffs if d > 0)
        f["cons"] = f["beat"] / len(common)
        f["margin"] = statistics.median(diffs)
        down = [i for i in f["mret"] if i in bm and bm[i] < 0]
        if len(down) >= 6:
            fb = sum(f["mret"][i] for i in down) / len(down)
            bb = sum(bm[i] for i in down) / len(down)
            f["down"] = fb / bb if bb else None

    # ---- scores within category ----
    W = SC["weights"]
    def size_points(f):
        a = f["aum"]
        if a is None:
            return None
        if f["cat"] == "small_cap" and a > SC["smallcap_capacity_cr"]:
            return SC["smallcap_over_capacity_points"]
        for band in SC["size_bands_cr"]:
            if band["below"] is None or a < band["below"]:
                return band["points"]
    for cat, lst in by_cat.items():
        judged = [f for f in lst if not f.get("tooNew") and not f["isIndex"]]
        vals = {k: [f[k] for f in judged if f.get(k) is not None] for k in ("cons", "margin", "down", "ter")}
        sizes = [size_points(f) for f in judged if size_points(f) is not None]
        for f in judged:
            comp = {
                "consistency": pct_rank(vals["cons"], f.get("cons")),
                "margin": pct_rank(vals["margin"], f.get("margin")),
                "downside": pct_rank(vals["down"], f.get("down"), higher_better=False),
                "cost": pct_rank(vals["ter"], f.get("ter"), higher_better=False),
                "size": pct_rank(sizes, size_points(f)),
            }
            have = {k: v for k, v in comp.items() if v is not None}
            wsum = sum(W[k] for k in have)
            f["score"] = round(sum(W[k] * v for k, v in have.items()) / wsum, 1) if wsum else None
            f["comp"] = {k: (round(v) if v is not None else None) for k, v in comp.items()}
            f["missing"] = [k for k, v in comp.items() if v is None]

    # Index funds: cost and tracking difference against funds on the same index.
    def index_key(n):
        n = n.lower()
        n = re.sub(r"(direct|plan|growth|option|index|fund|etf|-|\(.*?\))", " ", n)
        n = re.sub(r"^\S+\s+", "", n.strip())  # drop the fund house word
        return re.sub(r"\s+", " ", n).strip()
    idx_groups = {}
    for f in index_funds:
        idx_groups.setdefault(index_key(f["n"]), []).append(f)
    for key, lst in idx_groups.items():
        for f in lst:
            peers = [g for g in lst if g is not f and g.get("r3") is not None]
            ref = statistics.median([g["r3"] for g in peers]) if len(peers) >= 1 and f.get("r3") is not None else None
            f["td"] = round(f["r3"] - ref, 2) if ref is not None else None
        tds = [f["td"] for f in lst if f.get("td") is not None]
        ters = [f["ter"] for f in lst if f.get("ter") is not None]
        IW = SC["index_weights"]
        for f in lst:
            comp = {"cost": pct_rank(ters, f.get("ter"), False), "tracking": pct_rank(tds, f.get("td"))}
            have = {k: v for k, v in comp.items() if v is not None}
            wsum = sum(IW[k] for k in have)
            f["score"] = round(sum(IW[k] * v for k, v in have.items()) / wsum, 1) if wsum and len(lst) > 1 else None
            f["comp"] = {k: (round(v) if v is not None else None) for k, v in comp.items()}
            f["indexGroup"] = key
            f["bvia"] = "%d direct index funds on the same index" % len(lst)

    # ---- outputs ----
    out_funds = {}
    for isin, f in funds.items():
        rec = {k: f.get(k) for k in ("n", "amc", "cat", "catLabel", "ter", "aum", "months", "r1", "r3", "r5", "score",
                                    "comp", "missing", "bsrc", "bname", "bvia", "bisin", "td", "indexGroup") if f.get(k) not in (None, [], {})}
        rec["code"] = f["code"]
        if f.get("tooNew"):
            rec["tooNew"] = True
        if "cons" in f:
            rec.update({"nw": f["nw"], "beat": f["beat"], "cons": round(f["cons"], 4), "margin": round(f["margin"] * 100, 2)})
        if f.get("down") is not None:
            rec["down"] = round(f["down"] * 100, 1)
        if f["isIndex"]:
            rec["isIndex"] = True
        out_funds[isin] = rec
    cats = {}
    for cat, lst in by_cat.items():
        sc = [f["score"] for f in lst if f.get("score") is not None]
        cats[cat] = {"median": round(statistics.median(sc), 1) if sc else None, "n": len(lst)}
    A = CFG["additions"]
    picks = {}
    for cat, lst in by_cat.items():
        ok = [f for f in lst if f.get("score") is not None and (f["aum"] or 0) >= A["min_aum_cr"] and f["months"] >= A["min_history_months"]]
        ok.sort(key=lambda f: -f["score"])
        picks[cat] = [f["isin"] for f in ok[:12]]
    cheapest_index = {}
    for b in bcfg.values():
        rx = re.compile(b["match"], re.I)
        c = [f for f in index_funds if rx.search(f["n"]) and f.get("ter") is not None and (f["aum"] or 0) >= 100]
        c.sort(key=lambda f: (f["ter"], -f["months"]))
        if c:
            cheapest_index[b["index"]] = c[0]["isin"]

    built = datetime.date.today().isoformat()
    scores = {"v": 1, "built": built, "asof": actual_dates[-1], "aumPeriod": aum_label, "config": CFG["version"],
              "funds": out_funds, "sib": sib, "cats": cats, "picks": picks, "cheapestIndex": cheapest_index,
              "proxies": {k: (v["isin"] if v else None) for k, v in proxies.items()}, "gf2018": gf}
    with open(os.path.join(ROOT, "data", "fund-scores.json"), "w", encoding="utf-8") as fh:
        json.dump(scores, fh, ensure_ascii=False, separators=(",", ":"))

    # Latest NAV of every scheme line, so the page can revalue holdings to today.
    latest, dates = {}, {}
    for r in rows:
        try:
            nav = float(r["nav"].replace(",", ""))
        except (ValueError, AttributeError):
            continue
        if nav <= 0:
            continue
        for i in r["isins"]:
            latest[i] = nav
        dates[r["date"]] = dates.get(r["date"], 0) + 1
    nav_date = max(dates, key=dates.get) if dates else None
    with open(os.path.join(ROOT, "data", "latest-navs.json"), "w", encoding="utf-8") as fh:
        json.dump({"date": nav_date, "navs": latest}, fh, separators=(",", ":"))
    print("Latest NAVs:", len(latest), "ISINs, most common date", nav_date)

    # Daily NAVs of the proxies, for the missed-gains comparison (MFapi mirror of AMFI).
    pnav = {}
    for idx, p in proxies.items():
        if not p:
            continue
        try:
            j = json.loads(src.get_text("https://api.mfapi.in/mf/%s" % p["code"], cache_hours=24 * 6))
            pts = sorted((datetime.datetime.strptime(x["date"], "%d-%m-%Y").date(), float(x["nav"])) for x in j["data"] if x.get("nav") not in (None, "", "0"))
        except Exception as e:
            REPORT["notes"].append("proxy daily NAVs for %s failed: %s" % (idx, e))
            continue
        d0, dN = pts[0][0], pts[-1][0]
        arr, j2, cur = [], 0, None
        day = d0
        while day <= dN:
            while j2 < len(pts) and pts[j2][0] <= day:
                cur = pts[j2][1]
                j2 += 1
            arr.append(round(cur, 4))
            day += datetime.timedelta(days=1)
        # check against the AMFI month-end (source of record)
        s, me = series.get(p["code"]), ends[-1]
        amfi = s[-1] if s else None
        mf = arr[(me - d0).days] if 0 <= (me - d0).days < len(arr) else None
        REPORT["notes"].append("proxy NAV check %s: AMFI %s vs MFapi %s on %s" % (p["n"][:40], amfi, mf, me))
        pnav[p["isin"]] = {"n": p["n"], "index": idx, "d0": d0.isoformat(), "nav": arr}
    with open(os.path.join(ROOT, "data", "proxy-navs.json"), "w", encoding="utf-8") as fh:
        json.dump(pnav, fh, separators=(",", ":"))

    # Gap list: every fund that fell back to peers, grouped by the benchmark it should use.
    gaps = {}
    for f in funds.values():
        if f.get("bsrc") == "category_peers":
            key = f.get("bname") or (("Sectoral and thematic indices (varies by fund)") if f["cat"] == "thematic" else "Category index for " + f["catLabel"] + " (CRISIL or NSE)")
            gaps.setdefault(key, []).append({"isin": f["isin"], "n": f["n"], "cat": f["catLabel"], "pick": any(f["isin"] in v[:3] for v in picks.values())})
    with open(os.path.join(ROOT, "data", "benchmark-gaps.json"), "w", encoding="utf-8") as fh:
        json.dump({"built": built, "groups": {k: sorted(v, key=lambda x: x["n"]) for k, v in sorted(gaps.items())}}, fh, ensure_ascii=False, indent=1)

    # ---- report ----
    judged = [f for f in funds.values() if f.get("score") is not None]
    print("\nDirect growth funds scored: %d (too new to judge: %d) of %d open-ended lines" %
          (len(judged), sum(1 for f in funds.values() if f.get("tooNew")), len(funds)))
    print("Benchmark sources:", {k: sum(1 for f in funds.values() if f.get("bsrc") == k) for k in ("index_fund_proxy", "category_peers", "index_peers")})
    print("Placeholder or invalid NAVs skipped: %d; history codes no longer in NAVAll (merged or wound up): %d" % (REPORT["bad_nav"], len(REPORT["unmapped_codes"])))
    print("AUM period:", aum_label, "| funds with AUM:", sum(1 for f in funds.values() if f["aum"]))
    for n in REPORT["notes"]:
        print(" -", n)
    print("Gap list groups:", {k: len(v) for k, v in gaps.items()})


if __name__ == "__main__":
    main()
