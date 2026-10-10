"""
holdings_build.py  —  turn parsed AMC portfolio blocks into data/holdings.json.

A disclosure is published once per scheme, but one scheme has several ISINs
(direct/regular x growth/IDCW), all holding the same underlying portfolio. So a
block's printed title is matched to a scheme name in data/schemes.json within
the same AMC, and its holdings are attached to every ISIN of that scheme.
Stocks themselves are keyed by their own ISIN, never by name.

Output (compact; the page joins on ISIN at both levels):
    {"v": 1, "built": "YYYY-MM-DD",
     "s": [[stock_isin, display_name], ...],          stock table
     "f": [[asof, equity_pct, [[stock_idx, pct], ...]], ...],   one per scheme
     "i": {fund_isin: scheme_idx, ...},
     "a": {other_share_class_isin: stock_idx, ...}}   same company, second ISIN
"""
import collections
import re

TOP_N = 25  # holdings kept per scheme (by weight); the page says how much of each fund this covers


def amc_key(x):
    x = (x or '').lower()
    x = re.sub(r'\(.*?\)', ' ', x).replace('&', ' and ')
    x = re.sub(r'\bmutual fund\b|\bmf\b', ' ', x)
    return re.sub(r'[^a-z0-9]', '', x)


_SUBS = [
    (r'\bfund\s+of\s+funds?\b|\bfof\b', ' fof '), (r'\bs\s*(and|&)\s*p\b', ' '), (r'\bpru\b', ' prudential '),
    (r'\b(large|mid|small|multi|flexi|micro)\s*-?\s*cap\b', r' \1cap '), (r'\bmid\s*small\b', ' midsmall '),
    (r'\binfra\b', ' infrastructure '), (r'\btech\b', ' technology '), (r'\bgovt\b', ' government '),
    (r'\bidcw\b|\bdividend\s+option\b', ' '),
    # abbreviations seen in AMC workbooks
    (r'\balloc\b', ' allocation '), (r'\badvt?\b', ' advantage '), (r'\bqlty\b', ' quality '),
    (r'\bopp(s|ort)?\b', ' opportunities '), (r'\bfin\b', ' financial '), (r'\bservs?\b|\bsvcs\b', ' services '),
    (r'\bmom\b', ' momentum '), (r'\bdyn\b', ' dynamic '), (r'\bintl\b', ' international '), (r'\bmkt\b', ' market '),
    (r'\bmultiasset\b', ' multi asset '), (r'\bcycl\b', ' cyclical '), (r'\bindx\b', ' index '),
]
_STOP = {'fund', 'scheme', 'the', 'an', 'a', 'of', 'plan', 'and', 'open', 'ended', 'option', 'growth',
         'direct', 'regular', 'mutual'}


def toks(name):
    s = (name or '').lower().replace('&', ' and ')
    s = re.sub(r'\(.*?\)', ' ', s)
    s = re.sub(r'\b(formerly|erstwhile)\b.*$', ' ', s)
    s = re.sub(r'(?<=[a-z])(?=\d)|(?<=\d)(?=[a-z])', ' ', s)  # "250Mom" -> "250 mom", "Nifty50" -> "nifty 50"
    for a, b in _SUBS:
        s = re.sub(a, b, s)
    s = re.sub(r'[^a-z0-9 ]', ' ', s)
    return [t for t in s.split() if t not in _STOP]


def _aliases(name):
    """Old names NAVAll keeps in brackets: '(erstwhile Bluechip Fund)'."""
    return [m.group(2) for m in re.finditer(r'\((formerly known as|formerly|erstwhile)\s+([^)]+)\)', name or '', re.I)]


class Matcher:
    def __init__(self, schemes):
        self.names = collections.defaultdict(lambda: collections.defaultdict(list))  # amc -> name -> [isin]
        amc_label = {}
        for isin, v in schemes.items():
            n = v.get('n') or ''
            # Skip segregated side-pockets, but not main schemes named "(Existing number
            # of Segregated Portfolios - 2)".
            if re.search(r'segregat', n, re.I) and not re.search(r'(number|no\.?)\s+of\s+segregated', n, re.I):
                continue
            ak = amc_key(v.get('amc'))
            amc_label[ak] = v.get('amc')
            self.names[ak][n].append(isin)
        self.brand, self.index, self.words = {}, {}, {}
        for ak, names in self.names.items():
            c = collections.Counter(t for n in names for t in set(toks(n)))
            brand = set(toks(re.sub(r'\bmutual fund\b', '', amc_label.get(ak) or '', flags=re.I)))
            brand |= {t for t, k in c.items() if len(names) >= 3 and k >= 0.8 * len(names)}
            self.brand[ak] = brand
            # Keyed on the tokens joined with no spaces: AMFI and the AMCs space names
            # differently ("NIFTY50" / "Nifty 50", "NiftyIT" / "Nifty IT").
            idx, words = collections.defaultdict(set), {}
            for n in names:
                for label in [n] + _aliases(n):
                    ts = [t for t in toks(label) if t not in brand]
                    key = ''.join(ts)
                    if key:
                        idx[key].add(n)
                        words[key] = set(ts)  # word sets for the fuzzy fallback
            self.index[ak], self.words[ak] = idx, words

    def match(self, amc, title):
        """-> (set of scheme names, score). Exact key match, else a clear fuzzy winner
        on word overlap (Jaccard >= 0.75, at least 0.15 ahead of the runner-up)."""
        ak = amc_key(amc)
        idx, words = self.index.get(ak) or {}, self.words.get(ak) or {}
        qt = [t for t in toks(title) if t not in self.brand.get(ak, set())]
        q = ''.join(qt)
        if not q:
            return set(), 0.0
        if q in idx:
            return idx[q], 1.0
        qa = set(qt)
        scored = sorted(((len(qa & w) / len(qa | w), k) for k, w in words.items()), reverse=True)
        if scored and scored[0][0] >= 0.75 and (len(scored) == 1 or scored[0][0] - scored[1][0] >= 0.15):
            return idx[scored[0][1]], scored[0][0]
        return set(), (scored[0][0] if scored else 0.0)

    def isins(self, amc, names):
        ak = amc_key(amc)
        return sorted(i for n in names for i in self.names[ak].get(n, []))


_KEEP_UPPER = {'ICICI', 'HDFC', 'SBI', 'ITC', 'TCS', 'NTPC', 'ONGC', 'BPCL', 'HPCL', 'GAIL', 'LIC', 'IDFC', 'IRCTC',
               'BHEL', 'NHPC', 'NMDC', 'SAIL', 'REC', 'PFC', 'IOC', 'ABB', 'MRF', 'DLF', 'UPL', 'ACC', 'HCL', 'L&T',
               'AU', 'IDBI', 'LTIMINDTREE', 'PB', 'BSE', 'CDSL', 'MCX', 'KPIT', 'CESC', 'JSW', 'RBL', 'KEI', 'APL',
               'IIFL', 'PNB', 'ZF', 'SKF', 'PVR', 'INOX', 'HUDCO', 'IREDA', 'IRFC', 'RVNL', 'BEML', 'CRISIL', 'ICRA',
               'GE', 'TVS', 'VIP', 'CCL', 'NCC', 'PI', 'SRF', 'EID', 'AIA', 'CG', 'KPR', 'UTI', 'HEG', 'GMR', 'ESAB',
               'ASK', 'NBCC', 'MMTC', 'ITI', 'IRB', 'KNR', 'PNC', 'BLS', 'CMS', 'RHI', 'DCM', 'DCB', 'JK', 'JB'}


def clean_stock(n):
    n = re.sub(r'^\s*(eq|equity)\s*-\s*', '', n or '', flags=re.I)  # UTI prefixes "EQ - "
    n = re.sub(r'[#*^@$~!]+', ' ', n)  # footnote markers ("HDFC Bank Ltd ! ~~")
    n = re.sub(r'\s+', ' ', n).strip(' .,-')
    n = re.sub(r'\b(limited|ltd\.?)\s*$', '', n, flags=re.I).strip(' .,-')
    n = re.sub(r'\b(limited|ltd\.?)\b(?=\s*\()', '', n, flags=re.I)  # "Reliance Industries Ltd (Partly Paid)"
    return re.sub(r'\s+', ' ', n).strip(' .,-')


def display_name(variants):
    """Most common mixed-case spelling across all AMCs; title-case ALL CAPS
    only when nobody wrote it any other way (keeping known acronyms)."""
    cleaned = [clean_stock(v) for v in variants if v]
    mixed = [v for v in cleaned if v and not v.isupper()]
    if mixed:
        return collections.Counter(mixed).most_common(1)[0][0]
    if not cleaned:
        return ''
    v = collections.Counter(cleaned).most_common(1)[0][0]

    def word(w):
        core = re.sub(r'[^A-Za-z&]', '', w).upper()
        if core in _KEEP_UPPER or len(core) <= 2:
            return w
        return re.sub(r'[A-Za-z]', lambda m: m.group(0).upper(), w.lower(), count=1)
    return ' '.join(word(w) for w in v.split())


def assemble(blocks, schemes, built):
    """blocks: [{'amc': NAVAll/registry AMC name, 'title', 'asof', 'equity', 'equity_pct', 'src'}].
    Returns (holdings_json, report)."""
    M = Matcher(schemes)
    names = collections.defaultdict(list)
    per_scheme = {}  # (amc_key, frozenset(names)) -> chosen block (latest asof wins)
    report = collections.defaultdict(lambda: {'blocks': 0, 'equity_blocks': 0, 'matched': 0, 'unmatched': []})
    for b in blocks:
        rep = report[b['amc']]
        rep['blocks'] += 1
        if not b['equity']:
            continue
        rep['equity_blocks'] += 1
        matched, score = M.match(b['amc'], b['title'])
        if not matched:
            rep['unmatched'].append('%s (best %.2f)' % (b['title'], score))
            continue
        rep['matched'] += 1
        for isin, nm, _ in b['equity']:
            names[isin].append(nm)
        key = (amc_key(b['amc']), frozenset(matched))
        old = per_scheme.get(key)
        if old is None or (b['asof'] or '') > (old[1]['asof'] or ''):
            per_scheme[key] = (b['amc'], b)

    stock_ids, stocks, by_name, aliases = {}, [], {}, {}
    funds, isin_map = [], {}
    for (ak, snames), (amc, b) in sorted(per_scheme.items(), key=lambda kv: (kv[0][0], sorted(kv[0][1]))):
        top = {}
        for isin, _, pct in b['equity'][:TOP_N]:
            if isin not in stock_ids:
                disp = display_name(names[isin])
                # one company, two listed share classes (Alphabet A and C) -> one row
                if disp.lower() in by_name:
                    stock_ids[isin] = aliases[isin] = by_name[disp.lower()]
                else:
                    stock_ids[isin] = by_name[disp.lower()] = len(stocks)
                    stocks.append([isin, disp])
            si = stock_ids[isin]
            top[si] = top.get(si, 0.0) + pct
        top = [[si, round(w, 2)] for si, w in sorted(top.items(), key=lambda kv: -kv[1])]
        fi = len(funds)
        funds.append([b['asof'], round(b['equity_pct'], 2), top])
        for fund_isin in M.isins(amc, snames):
            isin_map[fund_isin] = fi
    return {'v': 1, 'built': built, 's': stocks, 'f': funds, 'i': isin_map, 'a': aliases}, report
