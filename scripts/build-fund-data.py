#!/usr/bin/env python3
"""
build-fund-data.py  —  rebuild data/schemes.json and data/holdings.json

Run once each quarter (or whenever you want fresh TER / holdings):

    python3 scripts/build-fund-data.py                  # everything
    python3 scripts/build-fund-data.py --holdings-only  # reuse schemes.json
    python3 scripts/build-fund-data.py --holdings-only --amc 9,22   # test AMCs

All sources are free and official:
  * Scheme master + plan + NAV : AMFI NAVAll.txt
  * Scheme-wise TER (per plan)  : AMFI TER feed (R_TER = regular, D_TER = direct)
  * Fund holdings              : each AMC's SEBI-mandated monthly portfolio disclosure,
                                 found via AMFI's portfolio-disclosure directory
                                 (amc_sources.py), read with the stdlib readers in
                                 portfolio_readers.py, joined in holdings_build.py

Standard library only, no pip installs.

TER is keyed strictly by ISIN via the scheme's plan, so a direct-plan ISIN can
never receive a regular-plan TER or vice versa. Schemes that genuinely have no
published TER are left null; the web app fills those with a category-typical
figure and labels that single line as an estimate.

The holdings step is deliberately forgiving: ~45 AMCs publish differently shaped
spreadsheets, so it skips and reports the ones it cannot parse rather than dying.
"""
import json, re, sys, io, urllib.request, urllib.error, datetime, os

UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) SELEQT-fund-data/1.0"}
NAVALL_URL = "https://portal.amfiindia.com/spages/NAVAll.txt"
TER_DATA_URL = "https://www.amfiindia.com/api/populate-te-rdata-revised"
TER_MONTH_URL = "https://www.amfiindia.com/api/populate-ter-month"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")


def fetch(url, timeout=120):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def norm(s):
    """Normalise a scheme name for joining: lowercase, alphanumerics only,
    with a few equivalences that vary between AMFI feeds."""
    s = (s or "").lower()
    s = s.replace("&", "and")
    s = re.sub(r"\bfof\b", "fundoffunds", s)
    return re.sub(r"[^a-z0-9]", "", s)


# ---------------------------------------------------------------- NAVAll -----
def parse_navall(text):
    """Yield scheme rows with the AMC and category headers they sit under.
    New AMFI format: Code;ISIN1;ISIN2;Name;Plan;Option;NAV;Date"""
    amc = cat = None
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if ";" not in s:
            if s.endswith("Mutual Fund"):
                amc = s
            elif "Scheme" in s and "(" in s:
                m = re.search(r"\((.*)\)", s)
                cat = (m.group(1) if m else s).strip()
            continue
        parts = [p.strip() for p in s.split(";")]
        if parts[0] == "Scheme Code":
            continue  # header
        if len(parts) < 6:
            continue
        code, isin1, isin2, name, plan, option = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
        yield {"code": code, "isins": [i for i in (isin1, isin2) if re.match(r"^IN[EF][0-9A-Z]{9}$", i)],
               "name": name, "plan": plan, "option": option, "amc": amc, "cat": cat}


def plan_of(row):
    p = (row["plan"] or "").lower()
    if "direct" in p:
        return "direct"
    if "regular" in p:
        return "regular"
    n = row["name"].lower()
    return "direct" if "direct" in n else "regular"


# ------------------------------------------------------------------- TER -----
def ter_months(n=6):
    """Newest-first list of TER MonthNumbers, across the current and prior FY.
    (A scheme only appears under the month(s) it reported, and AMCs report in
    different months, so we later union several months.)"""
    today = datetime.date.today()
    fy = today.year if today.month >= 4 else today.year - 1
    out, seen = [], set()
    for y in (fy, fy - 1):
        try:
            arr = json.loads(fetch("%s?year=%d-%d" % (TER_MONTH_URL, y, y + 1)))
            if arr and isinstance(arr[0], dict) and "data" in arr[0]:
                arr = arr[0]["data"]
            for m in arr:
                mn = m.get("MonthNumber")
                if mn and mn not in seen:
                    seen.add(mn); out.append(mn)
        except Exception:
            pass
    return out[:n]


def fetch_ter():
    """Current TER per scheme. The no-MF_ID feed only lists schemes REVISED in a
    month, so we iterate each AMC (MF_ID) and use its newest month that returns
    data (SEBI-mandated daily disclosure, so the newest month has every active
    scheme). Returns normalised name -> {'D':direct,'R':regular,'cat'}."""
    months = ter_months(5)
    index = {}
    if not months:
        print("  WARN: no TER months available; TER will be empty"); return index
    print("  TER months available:", ", ".join(months))
    amcs = 0
    for mfid in range(1, 101):
        used = None
        for month in months:
            page, got_any = 1, False
            while page <= 80:
                url = "%s?MF_ID=%d&Month=%s&strCat=&strType=&page=%d&pageSize=100" % (TER_DATA_URL, mfid, month, page)
                try:
                    d = json.loads(fetch(url))
                except Exception:
                    break
                rows = (d.get("data") if isinstance(d, dict) else d) or []
                if not rows:
                    break
                got_any = True
                added = 0
                for r in rows:
                    key = norm(r.get("Scheme_Name", ""))
                    if key and key not in index:
                        index[key] = {"D": to_num(r.get("D_TER")), "R": to_num(r.get("R_TER")), "cat": r.get("SchemeCat_Desc")}
                        added += 1
                if added == 0 or len(rows) < 100:
                    break
                page += 1
            if got_any:
                used = month
                break  # newest month with data for this AMC
        if used:
            amcs += 1
    print("  TER: %d AMCs, %d schemes" % (amcs, len(index)))
    return index


def to_num(v):
    try:
        f = float(v)
        return round(f, 4) if f > 0 else None
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------- schemes.json --
def build_schemes():
    print("Fetching AMFI NAVAll ...", flush=True)
    nav = fetch(NAVALL_URL).decode("utf-8", "replace")
    print("Fetching AMFI TER feed (paginated) ...", flush=True)
    ter = fetch_ter()
    print("  TER schemes: %d" % len(ter))

    schemes, matched, unmatched = {}, 0, {}
    seen = 0
    for row in parse_navall(nav):
        if not row["isins"]:
            continue
        seen += 1
        plan = plan_of(row)
        key = norm(row["name"])
        t = ter.get(key)
        ter_val = ter_alt = None
        if t:
            ter_val = t["D"] if plan == "direct" else t["R"]
            ter_alt = t["R"] if plan == "direct" else t["D"]  # the other plan's TER, for the regular-vs-direct gap
        entry = {
            "n": row["name"],
            "amc": row["amc"],
            "cat": (t["cat"] if t and t.get("cat") else row["cat"]),
            "plan": plan,
            "ter": ter_val,
            "terAlt": ter_alt,
        }
        if ter_val is not None:
            matched += 1
        elif t is None:
            unmatched[key] = row["name"]
        for isin in row["isins"]:
            schemes[isin] = entry

    print("  scheme rows with ISIN: %d  ISINs: %d" % (seen, len(schemes)))
    print("  ISINs with EXACT TER : %d (%.1f%%)" % (matched, 100.0 * matched / max(seen, 1)))
    print("  schemes with no TER match: %d (e.g. %s)" % (
        len(unmatched), "; ".join(list(unmatched.values())[:3])))
    return schemes


# ------------------------------------------------------------ holdings.json --
def build_holdings(schemes, only=None):
    """Stock-level holdings from each AMC's SEBI monthly portfolio disclosure.
    AMC list comes from AMFI's directory; each AMC needs a recipe in
    amc_sources.RECIPES. Anything that fails is skipped and reported."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import amc_sources as src
    import holdings_build as hb
    import portfolio_readers as pr

    print("Fetching AMFI portfolio-disclosure directory ...", flush=True)
    reg = src.fetch_registry()
    manual = src.manual_urls()
    nav_amcs = {hb.amc_key(v.get("amc")): v.get("amc") for v in schemes.values()}
    stale_before = (datetime.date.today() - datetime.timedelta(days=100)).isoformat()
    blocks, rows = [], []
    for r in sorted(reg, key=lambda r: int(r["mf_id"] or 0)):
        if only and r["mf_id"] not in only:
            continue
        k = hb.amc_key(r["name"])
        amc = nav_amcs.get(k) or next((a for kk, a in nav_amcs.items() if kk.startswith(k) or k.startswith(kk)), None)
        fn = src.RECIPES.get(r["mf_id"])
        status, specs, files, got, stale = "", [], 0, 0, 0
        if not amc:
            status = "no schemes in NAVAll"
        else:
            if fn:
                try:
                    specs = fn(r)
                    status = "ok" if specs else "no files found"
                except src.Skip as e:
                    status = "skipped: %s" % e
                except Exception as e:  # noqa: BLE001  (skip-and-report by design)
                    status = "discovery failed: %s" % str(e)[:80]
            else:
                status = "no recipe yet"
            if not specs and r["mf_id"] in manual:
                specs = manual[r["mf_id"]]["urls"]
                status = "manual URLs (%s)" % manual[r["mf_id"]]["month"]
        for spec in specs:
            # spec: url | (url, headers) | (url, headers, {"member": zip-member regex})
            url, headers, opts = (spec, None, {}) if isinstance(spec, str) else (tuple(spec) + ({},))[:3]
            try:
                if not re.match(r"https?://", url):  # a file downloaded by hand (manual override)
                    with open(url if os.path.isabs(url) else os.path.join(ROOT, url), "rb") as f:
                        data = f.read()
                else:
                    data = src.http_get(url, headers, timeout=150, ok=src.looks_like_workbook)
                sheets = pr.read_workbook(data, url, member=(opts or {}).get("member"))
            except Exception as e:  # noqa: BLE001
                status = "file failed: %s" % str(e)[:80]
                continue
            files += 1
            for sname, srows in sheets:
                for p in pr.parse_portfolios(srows, sname):
                    if p["asof"] and p["asof"] < stale_before:
                        stale += 1  # e.g. an old upload mislabelled as this month
                        continue
                    p["amc"], p["src"] = amc, url
                    blocks.append(p)
                    got += 1
        rows.append((r, amc, status, files, got, stale))

    holdings, report = hb.assemble(blocks, schemes, datetime.date.today().isoformat())

    print("\nHoldings by AMC  (files / portfolio blocks / equity blocks matched to a scheme):")
    for r, amc, status, files, got, stale in rows:
        rep = report.get(amc) or {"equity_blocks": 0, "matched": 0, "unmatched": []}
        print("  %3s %-34s %-26s files=%-3d blocks=%-4d matched=%d/%d%s" % (
            r["mf_id"], (r["name"] or "")[:34], status[:26], files, got, rep["matched"], rep["equity_blocks"],
            ("  STALE dropped=%d" % stale) if stale else ""))
        if len(status) > 26:
            print("        %s" % status)
        for u in rep["unmatched"][:4]:
            print("        unmatched: %s" % u[:100])
    eqish = [i for i, v in schemes.items() if re.search(
        r"equity|elss|index|flexi|cap|hybrid|balanced|arbitrage|etf|focus|value|contra|thematic|sector",
        (v.get("cat") or "").lower())]
    have = sum(1 for i in eqish if i in holdings["i"])
    print("\n  schemes with holdings: %d   stocks: %d   equity/hybrid ISINs covered: %d/%d (%.1f%%)" % (
        len(holdings["f"]), len(holdings["s"]), have, len(eqish), 100.0 * have / max(len(eqish), 1)))
    if src.insecure_hosts:
        print("  NOTE: TLS verification failed and was bypassed for:", ", ".join(sorted(src.insecure_hosts)))
    if src.curl_hosts:
        print("  NOTE: fetched with system curl (TLS 1.3 only):", ", ".join(sorted(src.curl_hosts)))
    return holdings


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Rebuild data/schemes.json and data/holdings.json")
    ap.add_argument("--holdings-only", action="store_true", help="reuse data/schemes.json, rebuild holdings only")
    ap.add_argument("--schemes-only", action="store_true", help="rebuild schemes.json (NAV + TER) only")
    ap.add_argument("--amc", default="", help="comma-separated AMFI mf_ids to limit the holdings run to (testing)")
    a = ap.parse_args()
    os.makedirs(DATA, exist_ok=True)
    if a.holdings_only:
        with io.open(os.path.join(DATA, "schemes.json"), encoding="utf-8") as f:
            schemes = json.load(f)
    else:
        schemes = build_schemes()
        write(os.path.join(DATA, "schemes.json"), schemes)
    if not a.schemes_only:
        only = set(x.strip() for x in a.amc.split(",") if x.strip()) or None
        holdings = build_holdings(schemes, only)
        if only:
            print("  (limited run: holdings.json NOT written)")
        else:
            write(os.path.join(DATA, "holdings.json"), holdings)
    print("Done at", datetime.datetime.now().isoformat(timespec="seconds"))


def write(path, obj):
    with io.open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
    print("  wrote %s (%.0f KB)" % (path, os.path.getsize(path) / 1024.0))


if __name__ == "__main__":
    main()
