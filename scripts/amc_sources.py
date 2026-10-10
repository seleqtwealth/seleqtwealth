"""
amc_sources.py  —  where each AMC publishes its monthly portfolio, and how to fetch it.

The list of AMCs, and each one's portfolio-disclosure page, comes from AMFI's own
Portfolio Disclosure directory and is re-read on every run, so new fund houses
and moved pages are picked up automatically. Getting from that page to the
latest month's file(s) differs per AMC; those recipes live in RECIPES, keyed by
AMFI mf_id. An AMC without a working recipe is skipped and reported, never fatal.

Downloads are cached under scripts/.cache/ (gitignored) so re-runs are cheap.
"""
import datetime
import hashlib
import html as htmllib
import http.cookiejar
import json
import os
import re
import ssl
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

AMFI_PD_URL = 'https://www.amfiindia.com/online-center/portfolio-disclosure'
UA = ('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')
BASE_HEADERS = {'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'en-IN,en;q=0.9'}
_HTML = {'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8'}
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '.cache', 'http')
MANUAL_FILE = os.path.join(HERE, 'amc_manual_urls.json')
MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
               'September', 'October', 'November', 'December']
insecure_hosts = set()  # hosts that only worked without TLS verification (reported)
curl_hosts = set()      # hosts fetched through the system curl (TLS 1.3 only)


class Skip(Exception):
    """An AMC we deliberately do not fetch automatically (reported, not an error)."""


def looks_like_workbook(b):
    return b[:2] == b'PK' or b[:8] == b'\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1'


def _curl(url, headers, body, timeout):
    """System curl, for hosts that only speak TLS 1.3 (the Python 3.9 bundled with
    macOS links LibreSSL 2.8, which cannot)."""
    cmd = ['curl', '-sS', '--fail', '--compressed', '-L', '-m', str(timeout), url]
    for k, v in headers.items():
        cmd += ['-H', '%s: %s' % (k, v)]
    if body is not None:
        cmd += ['--data-binary', '@-']
    return subprocess.run(cmd, input=body, capture_output=True, check=True).stdout


def _fetch(url, h, body, timeout, method, tries=4):
    """One request, with retries for the transient drops some AMC gateways make
    (connection resets, EOFs, 5xx), a curl fallback for TLS-1.3-only hosts, and
    an unverified retry (reported) for hosts with broken certificate chains."""
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    for attempt in range(tries):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and attempt < tries - 1:
                time.sleep(3 * (attempt + 1))
                continue
            raise
        except urllib.error.URLError as e:
            msg = str(e)
            if re.search(r'PROTOCOL_VERSION|HANDSHAKE_FAILURE', msg.upper()):  # TLS 1.3-only host
                curl_hosts.add(urllib.parse.urlparse(url).netloc)
                return _curl(url, h, body, timeout)
            if 'CERTIFICATE_VERIFY_FAILED' in msg:
                ctx = ssl.create_default_context()
                ctx.check_hostname, ctx.verify_mode = False, ssl.CERT_NONE
                insecure_hosts.add(urllib.parse.urlparse(url).netloc)
                with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
                    return r.read()
            if attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))
        except (ConnectionError, TimeoutError, OSError) as e:  # resets, EOFs, read timeouts
            if attempt == tries - 1:
                raise
            time.sleep(3 * (attempt + 1))


def http_get(url, headers=None, data=None, timeout=90, cache_hours=24 * 20, method=None, ok=None):
    """GET (or POST when data is given) with a disk cache keyed by url+body.
    `ok(bytes) -> bool` rejects error pages and bot challenges before they are
    cached, so a bad response is never reused as data."""
    body = data.encode() if isinstance(data, str) else data
    key = hashlib.sha1((url + '\n' + (body or b'').decode('latin-1')).encode('utf-8', 'replace')).hexdigest()
    path = os.path.join(CACHE, key)
    if cache_hours and os.path.exists(path) and time.time() - os.path.getmtime(path) < cache_hours * 3600:
        with open(path, 'rb') as f:
            return f.read()
    h = dict(BASE_HEADERS)
    h.update(headers or {})
    out = _fetch(url, h, body, timeout, method)
    if ok is not None and not ok(out):
        raise ValueError('unexpected response from %s (%r...)' % (urllib.parse.urlparse(url).netloc, out[:40]))
    if cache_hours:
        os.makedirs(CACHE, exist_ok=True)
        with open(path, 'wb') as f:
            f.write(out)
    return out


def get_text(url, headers=None, **kw):
    return http_get(url, headers, **kw).decode('utf-8', 'replace')


def get_json(url, headers=None, data=None, **kw):
    h = {'Accept': 'application/json, text/plain, */*'}
    h.update(headers or {})
    return json.loads(http_get(url, h, data=data, **kw).decode('utf-8', 'replace'))


# ------------------------------------------------------------ registry ------
def fetch_registry():
    """AMFI's directory: [{'mf_id', 'name', 'page'}] for every AMC."""
    page = get_text(AMFI_PD_URL, cache_hours=24)
    parts = re.findall(r'self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)', page)
    rsc = ''.join(json.loads('"%s"' % p) for p in parts)
    i = rsc.find('"members":[')
    if i < 0:
        raise RuntimeError('AMFI portfolio-disclosure page changed: no members list')
    start, depth = rsc.find('[', i), 0
    for j in range(start, len(rsc)):
        depth += {'[': 1, ']': -1}.get(rsc[j], 0)
        if depth == 0:
            break
    members = json.loads(rsc[start:j + 1])
    return [{'mf_id': str(m.get('mf_id')), 'name': m.get('mf_name'),
             'page': m.get('amc_monthly_portfolio_disclosure') or ''} for m in members]


# ------------------------------------------------------------- helpers ------
_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']


def month_of(s):
    """Best-effort 'YYYY-MM' from a file URL or link text, else None."""
    s = urllib.parse.unquote(s or '').lower()
    m = re.search(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_\-\.,]*(?:[0-2]?\d|3[01])(?:st|nd|rd|th)?'
                  r'[\s_\-\.,]+(20\d\d)(?!\d)', s)  # "August_31_2026": the day is not a year
    if m:
        return '%s-%02d' % (m.group(2), _MONTHS.index(m.group(1)) + 1)
    m = re.search(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_\-\.,]*\'?(20\d\d|\d\d)(?!\d)', s)
    if m:
        y = int(m.group(2))
        return '%04d-%02d' % (y + 2000 if y < 100 else y, _MONTHS.index(m.group(1)) + 1)
    m = re.search(r'(?<!\d)(20\d\d)[\-_\.]?(0[1-9]|1[0-2])(?:[\-_\.]?(?:[0-2]\d|3[01]))?(?!\d)', s)
    if m:
        return '%s-%s' % (m.group(1), m.group(2))
    m = re.search(r'(?<!\d)(?:[0-2]\d|3[01])[\-_\.]?(0[1-9]|1[0-2])[\-_\.]?(20\d\d)(?!\d)', s)
    if m:
        return '%s-%s' % (m.group(2), m.group(1))
    m = re.search(r'(?<!\d)(0[1-9]|1[0-2])[\-_\.](20\d\d)(?!\d)', s)
    if m:
        return '%s-%s' % (m.group(2), m.group(1))
    return None


def page_links(url, headers=None, pattern=r'\.(xlsx|xls|zip)(\?|#|$)', html=None):
    """[(absolute_url, link_text)] for file links in a page, incl. bare URLs in scripts."""
    html = html if html is not None else get_text(url, headers, cache_hours=12)
    seen, out = set(), []
    for m in re.finditer(r'<a\b[^>]*?href\s*=\s*["\']([^"\']+)["\'][^>]*>(.*?)</a>', html, re.I | re.S):
        u = urllib.parse.urljoin(url, htmllib.unescape(m.group(1)).strip())
        if re.search(pattern, u, re.I) and u not in seen:
            seen.add(u)
            out.append((u, re.sub(r'<[^>]+>|\s+', ' ', m.group(2)).strip()))
    for m in re.finditer(r'["\'(]((?:https?:)?//[^"\'()\s]+?\.(?:xlsx|xls|zip)(?:\?[^"\'()\s]*)?)["\')]', html, re.I):
        u = urllib.parse.urljoin(url, htmllib.unescape(m.group(1)))
        if u not in seen:
            seen.add(u)
            out.append((u, ''))
    return out


def latest_month(links, include=r'.', exclude=r'fortnight|half|hy\b|debt|annual|factsheet'):
    """Keep links whose url/text matches include and not exclude, then return
    every link of the newest month (per-scheme AMCs publish many per month)."""
    tagged = []
    for u, t in links:
        s = u + ' ' + t
        if re.search(include, s, re.I) and not re.search(exclude, s, re.I):
            mo = month_of(t) or month_of(u)
            if mo and mo <= datetime.date.today().strftime('%Y-%m'):
                tagged.append((mo, u))
    if not tagged:
        return None, []
    newest = max(m for m, _ in tagged)
    return newest, sorted({u for m, u in tagged if m == newest})


def months_back(n=6):
    """(year, month) from the current month backwards."""
    d = datetime.date.today().replace(day=1)
    for _ in range(n):
        yield d.year, d.month
        d = (d - datetime.timedelta(days=1)).replace(day=1)


def past(ym):
    """A monthly portfolio exists only for a month that has ended. (One AMC's list
    carries an old upload mislabelled with the current month.)"""
    return bool(ym) and ym < datetime.date.today().strftime('%Y-%m')


def newest(pairs, label_rx=None, base=None, tail=None):
    """[(url, label)] -> every url whose label names the newest completed month.
    `tail` reads the date from the label's last N characters only, so a date in a
    fund's own name ('G-Sec Jun 2027 Index Fund - 31 August 2026') is not used."""
    best, out = None, []
    for u, lab in pairs:
        if label_rx and not re.search(label_rx, lab, re.I):
            continue
        m = month_of(lab[-tail:] if tail else lab)
        if not past(m):
            continue
        if best is None or m > best:
            best, out = m, []
        if m == best:
            out.append(urllib.parse.urljoin(base, htmllib.unescape(u).strip()) if base else htmllib.unescape(u).strip())
    return list(dict.fromkeys(out))


def rsc_text(html):
    """Next.js App Router pages carry their data as flight-data strings."""
    return ''.join(json.loads(s) for s in re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', html))


def balanced_json(s, start):
    """json.loads of the object or array that begins at s[start] (string-aware)."""
    depth, instr, esc = 0, False, False
    for i in range(start, len(s)):
        ch = s[i]
        if instr:
            if esc:
                esc = False
            elif ch == '\\':
                esc = True
            elif ch == '"':
                instr = False
        elif ch == '"':
            instr = True
        elif ch in '{[':
            depth += 1
        elif ch in '}]':
            depth -= 1
            if depth == 0:
                return json.loads(s[start:i + 1])
    raise ValueError('unbalanced JSON')


def select_options(html, name):
    m = re.search(r'<select[^>]*name="%s"[^>]*>(.*?)</select>' % re.escape(name), html, re.S)
    return {lab.strip(): val for val, lab in re.findall(r'value="(\d+)"[^>]*>([^<]+)</option>', m.group(1))} if m else {}


def manual_urls():
    """scripts/amc_manual_urls.json: {mf_id: {"month": "YYYY-MM", "urls": [...]}} for AMCs
    we do not fetch automatically. Entries for a month that is not recent are ignored."""
    try:
        with open(MANUAL_FILE, encoding='utf-8') as f:
            raw = json.load(f)
    except (OSError, ValueError):
        return {}
    cutoff = (datetime.date.today() - datetime.timedelta(days=100)).strftime('%Y-%m')
    return {k: v for k, v in raw.items() if not k.startswith('_') and v.get('urls') and (v.get('month') or '') >= cutoff}


# ------------------------------------------------------------- recipes ------
# mf_id -> function(registry_entry) -> [url or (url, headers), ...]
# Each docstring records how that AMC's site works, for when it changes.
RECIPES = {}


def recipe(*mf_ids):
    def deco(fn):
        for i in mf_ids:
            RECIPES[str(i)] = fn
        return fn
    return deco


@recipe(16, 69, 70)
def encrypted_listing(r):
    """JM Financial (16), Mahindra Manulife (69) and ITI (70) encrypt their download
    listings in the browser (AES, key shipped in their JavaScript). We do not
    decrypt that. To include them, paste the month's file URL(s) into
    amc_manual_urls.json."""
    raise Skip('listing is encrypted in the browser; add URLs to amc_manual_urls.json')


@recipe(47)
def edelweiss(r):
    """Edelweiss: site, API and static files all sit behind Akamai rules that admit only
    real browsers, and the API payload is encrypted. Not automatable: download the
    month's file by hand into scripts/manual/ and list it in amc_manual_urls.json."""
    raise Skip('site admits only real browsers; list a hand-downloaded file in amc_manual_urls.json')


@recipe(87)
def ask(r):
    """ASK: a single liquid fund so far; nothing to look through."""
    raise Skip('only a liquid fund; no equity holdings')


@recipe(22)
def sbi(r):
    """SBI: /portfolios POSTs to a CMS endpoint that returns <tr> rows of files
    (FundId 0 = all schemes). Walk back from this month until the Monthly list is
    non-empty; prefer the consolidated 'All Schemes Monthly Portfolio' workbook."""
    h = {'Referer': 'https://www.sbimf.com/portfolios', 'Origin': 'https://www.sbimf.com',
         'X-Requested-With': 'XMLHttpRequest', 'Content-Type': 'application/json;charset=utf-8',
         'Accept': 'text/html, */*; q=0.01'}
    for y, m in months_back(6):
        body = json.dumps({'FundId': 0, 'PSYear': str(y), 'PSMonth': MONTH_NAMES[m - 1], 'PSFrequency': 'Monthly'})
        t = get_text('https://www.sbimf.com/ajaxcall/CMS/GetSchemePortfolioSheets', h, data=body, cache_hours=6)
        links = [(htmllib.unescape(u), htmllib.unescape(n)) for u, n in re.findall(r'<td><a href="([^"]+)"[^>]*>([^<]+)</a>', t)]
        whole = [u for u, n in links if re.search(r'all schemes monthly portfolio', n, re.I)]
        if whole or links:
            return whole or [u for u, _ in links]
    return []


@recipe(17)
def kotak(r):
    """Kotak: Angular app; its forms API lists 'Consolidated SEBI Portfolio as on <date>'
    (header 417, option 51) with files on a public S3 front. The API host runs a bot
    manager: we send an ordinary browser header set, and if it answers with a
    challenge instead of JSON, Kotak is skipped (never solved or worked around)."""
    h = {'Accept': 'application/json, text/plain, */*', 'Referer': 'https://www.kotakmf.com/Information/forms-and-downloads',
         'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors', 'Sec-Fetch-Site': 'same-origin'}
    try:
        raw = http_get('https://www.kotakmf.com/api/kotakapi/forms/user/getsubheaderList/417'
                       '?option=51&pagination=1&pageSize=30&pageNumber=1', h, cache_hours=6,
                       ok=lambda b: b.lstrip()[:1] == b'{')
    except ValueError:
        raise Skip('listing answered with a bot check instead of data')
    pairs = [(it['content'], it.get('subHeaderTitle') or '') for it in json.loads(raw.decode('utf-8'))['subHeaderList']]
    got = newest(pairs, label_rx=r'consolidated sebi portfolio')[:1]
    return ['https://vatseelabs-s3.kotakmf.com/' + urllib.parse.quote(u, safe='/,') for u in got]


@recipe(25)
def tata(r):
    """Tata: the Next.js page's server payload embeds the CMS card list
    (field_document_title / field_media_document). Newest 'Portfolio as on' wins.
    (Not /schemes-related: that 308-redirects, which Python 3.9 urllib won't follow.)"""
    t = get_text('https://www.tatamutualfund.com/schemes-related/portfolio', _HTML, cache_hours=6).replace('\\"', '"')
    pairs = [(u, lab) for lab, u in re.findall(r'"field_document_title":"([^"]*)","field_media_document":"([^"]*)"', t)
             if re.search(r'\.(xlsx?|zip)$', u, re.I)]
    return newest(pairs, label_rx=r'portfolio as on')[:1]


@recipe(26)
def taurus(r):
    """Taurus: Drupal view filtered by year/month taxonomy ids (read from the page's
    two <select>s); walk back until a month returns files (one per scheme)."""
    base = 'https://taurusmutualfund.com/monthly-portfolio'
    t = get_text(base, _HTML, cache_hours=6)
    years = select_options(t, 'field_monthly_portfolio_target_id')
    months = select_options(t, 'field_month_target_id')
    for y, m in months_back(6):
        yid, mid = years.get(str(y)), months.get(MONTH_NAMES[m - 1])
        if not (yid and mid):
            continue
        q = urllib.parse.urlencode({'field_monthly_portfolio_target_id': yid, 'field_month_target_id': mid})
        page = re.sub(r'<!--.*?-->', '', get_text(base + '?' + q, _HTML, cache_hours=6), flags=re.S)
        i = page.find('view-content')
        links = re.findall(r'href=["\']\s*([^"\']+\.(?:xlsx|xls|zip))["\']', page[i:], re.I) if i > 0 else []
        if links:
            return sorted({urllib.parse.urljoin(base, l.strip()) for l in links})
    return []


@recipe(18)
def lic(r):
    """LIC: the page's Consolidated tab is a chain of form POSTs (no token): tab ->
    'Monthly Portfolio' id -> years -> months -> files (Equity + Debt workbooks)."""
    base = 'https://www.licmf.com'
    h = {'Referer': base + '/downloads/monthly-portfolio', 'Origin': base, 'X-Requested-With': 'XMLHttpRequest',
         'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'}

    def post(path, fields):
        return get_text(base + path, h, data=urllib.parse.urlencode(fields), cache_hours=6)

    pid = re.search(r"value=['\"](\d+)['\"]>\s*Monthly Portfolio", post('/downloads/consolidated-portfolio', {})).group(1)
    years = sorted(int(y) for y in re.findall(r"value='(\d{4})'", post('/downloads/consolidated-portfolio-filters',
                                                                         {'id': pid, 'filter': 'year'})))
    for y in reversed(years[-2:]):
        months = sorted(int(m) for m in re.findall(r"value='(\d{1,2})'", post(
            '/downloads/consolidated-portfolio-filters', {'year': y, 'id': pid, 'filter': 'month'})))
        for m in reversed(months):
            links = re.findall(r'href="([^"]+\.(?:xlsx|xls|zip))"',
                               post('/downloads/consolidated-portfolio-files', {'id': pid, 'month': m, 'year': y}), re.I)
            if links:
                return [urllib.parse.urljoin(base, urllib.parse.quote(l, safe='/:')) for l in links]
    return []


@recipe(6)
def dsp(r):
    """DSP: static page; its 'Month End Portfolio Disclosures' section lists zips
    labelled 'Portfolio Details as on <date>' (equity+FoF and debt workbooks)."""
    t = get_text('https://www.dspim.com/mandatory-disclosures/portfolio-disclosures', _HTML, cache_hours=6)
    i = t.find('Month End Portfolio Disclosures')
    sec = t[i:t.find('</details>', i)] if i >= 0 else t
    return newest(re.findall(r'<a href="([^"]+)">\s*([^<]+)</a>', sec), label_rx=r'as on')[:1]


@recipe(13)
def quant(r):
    """quant: ASP.NET PageMethod behind the consolidated 'MONTHLY PORTFOLIO' accordion
    (not 'MONTHLY PORTFOLIO - FUND - WISE'); link texts are 'Month YYYY'."""
    h = {'Referer': 'https://quantmutual.com/statutory-disclosures', 'Origin': 'https://quantmutual.com',
         'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json, text/javascript, */*; q=0.01',
         'Content-Type': 'application/json; charset=utf-8'}
    for year in (datetime.date.today().year, datetime.date.today().year - 1):
        d = get_json('https://quantmutual.com/statutorydisclosures.aspx/displaydisclouser', h,
                     data="{id:'%d',cat:'MONTHLY PORTFOLIO'}" % year, cache_hours=6)
        got = newest(re.findall(r"<a href='([^']+)'[^>]*>([^<]+)</a>", d.get('d') or ''), base='https://quantmutual.com/')
        if got:
            return got[:1]
    return []


@recipe(41)
def quantum(r):
    """Quantum: server-rendered list at /portfolio/combined/-1/1/0/0 (all schemes,
    monthly), labels '<Month YYYY> - All Funds'. The newest label has been an old
    upload mislabelled as the current month, so only completed months count, and
    the build also checks the date printed inside the file."""
    t = get_text('https://www.quantumamc.com/portfolio/combined/-1/1/0/0', _HTML, cache_hours=6)
    pairs = re.findall(r'<a href="(https://www\.quantumamc\.com/FileCDN/[^"]+\.xlsx?)"[^>]*>.*?</span>\s*([^<]+?)\s*</a>', t, re.S)
    return newest(pairs, label_rx=r'all funds')[:1]


@recipe(37)
def hsbc(r):
    """HSBC: one large Sitecore page; the 'Fund portfolios' accordion lists one file
    per scheme labelled '<Scheme> DD Month YYYY'. Every file of the newest date."""
    base = 'https://www.assetmanagement.hsbc.co.in/'
    page = get_text(base + 'en/mutual-funds/investor-resources/information-library', _HTML, cache_hours=6, timeout=150)
    heads = [(m.start(), re.sub(r'<[^>]+>', '', m.group(1)).strip())
             for m in re.finditer(r'<h2 class="accordion__heading[^"]*">(.*?)</h2>', page, re.S)]
    start = next((p for p, t in heads if t == 'Fund portfolios'), None)
    if start is None:
        raise ValueError("'Fund portfolios' section not found")
    end = next((p for p, t in heads if p > start), len(page))
    pairs = [(u, re.sub(r'<[^>]+>', '', lab).strip())
             for u, lab in re.findall(r'<a href="([^"]+\.xlsx?)"[^>]*>(.*?)</a>', page[start:end], re.S)]
    return newest([(u, lab) for u, lab in pairs if re.search(r'\d{1,2}\s+[A-Za-z]+\s+\d{4}$', lab)], base=base)


@recipe(54)
def navi(r):
    """Navi: WordPress page with a REST route behind its year/month picker; the page
    prints the route and its nonce. Walk back from this month until files appear."""
    page_url = 'https://navi.com/mutual-fund/downloads/portfolio'
    page = get_text(page_url, _HTML, cache_hours=0)
    prop = json.loads(re.search(r'navi_property\s*=\s*(\{.*?\});', page, re.S).group(1))
    m = re.search(r'data-item="portfolio_portfolio-monthly"\s+data-category="(\d+)"', page)
    h = {'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest',
         'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'WP-NONCE': prop['nonce'],
         'Origin': 'https://navi.com', 'Referer': page_url}
    for y, mo in months_back(4):
        fy = '%d-%d' % ((y, y + 1) if mo >= 4 else (y - 1, y))
        body = urllib.parse.urlencode({'financial_year': fy, 'value': MONTH_NAMES[mo - 1],
                                       'category': m.group(1) if m else '884', 'type': 'Monthly', 'order': 'DESC'})
        res = get_json(prop['rest_url'] + 'nv/v1/documents', h, data=body, cache_hours=6)
        urls = []
        for doc in (res.get('data') or []) if res.get('success') else []:
            u = doc.get('url')
            urls += [x['link'] for x in u] if isinstance(u, list) else [u]
        if urls:
            return [htmllib.unescape(u) for u in urls if u]
    return []


@recipe(75)
def bajaj(r):
    """Bajaj Finserv: WordPress admin-ajax filters (years -> months -> downloads) using
    the nonce the page prints. The site speaks TLS 1.3 only (http_get uses curl).
    The workbook is named .xls but is really xlsx; the reader goes by content."""
    page_url = 'https://www.bajajamc.com/downloads?portfolio='
    page = get_text(page_url, _HTML, cache_hours=0)
    cfg = json.loads(re.search(r'var bajajDownloads\s*=\s*(\{.*?\});', page).group(1))
    i = page.find('bd-accordion-title">Monthly Portfolio<')
    ids = re.findall(r'data-section-id="(\d+)"', page[:i]) if i > 0 else []
    section = ids[-1] if ids else '757'
    h = {'Accept': 'application/json, */*', 'Content-Type': 'application/x-www-form-urlencoded',
         'Origin': 'https://www.bajajamc.com', 'Referer': page_url}

    def ajax(**f):
        f['nonce'] = cfg['nonce']
        return get_json(cfg['ajaxUrl'], h, data=urllib.parse.urlencode(f), cache_hours=0)['data']

    fy_order = MONTH_NAMES[3:] + MONTH_NAMES[:3]
    years = sorted((o['value'] for o in ajax(action='bajaj_get_filter_options', filter_for='years',
                                             section_id=section)['options']), reverse=True)
    for fy in years[:2]:
        mons = [o['value'] for o in ajax(action='bajaj_get_filter_options', filter_for='months',
                                         section_id=section, year=fy)['options']]
        for mon in sorted((x for x in mons if x in fy_order), key=fy_order.index, reverse=True)[:2]:
            html = ajax(action='bajaj_get_downloads', section_id=section, year=fy, month=mon).get('html') or ''
            urls = re.findall(r'href="([^"]+\.(?:xlsx?|zip))"', html, re.I)
            if urls:
                return list(dict.fromkeys(urls))
    return []


@recipe(80)
def angel_one(r):
    """Angel One: server-rendered accordion: FY > 'Monthly' > 'Month YYYY' headings,
    each followed by its files. The newest monthly group (all passive schemes)."""
    page = get_text('https://www.angelonemf.com/downloads', _HTML, cache_hours=6)
    a = page.find('>Portfolio Disclosures<')
    b = page.find('id="accordion-collapse-heading-', a)
    sec = page[a:b if b > a else None]
    groups, kind, cur = {}, None, None
    for m in re.finditer(r'id="sub-accordion-collapse-heading-\d+"[^>]*>(.*?)</h\d>|href="(https?://[^"]+\.xlsx?)"', sec, re.S):
        if m.group(1) is not None:
            t = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', m.group(1))).strip()
            if t in ('Monthly', 'Half Yearly', 'Fortnightly'):
                kind, cur = t, None
                continue
            ym = month_of(t) if re.fullmatch(r'[A-Za-z]+\s+\d{4}', t) else None
            cur = ym if (kind == 'Monthly' and past(ym)) else None
            if cur:
                groups.setdefault(cur, [])
        elif cur:
            groups[cur].append(m.group(2))
    return list(dict.fromkeys(groups[max(groups)])) if groups else []


@recipe(81)
def capitalmind(r):
    """Capitalmind: static page; its 'Monthly Portfolio' tab has one accordion per
    scheme of '<Month YYYY>' + link pairs. Every file of the newest month."""
    base = 'https://capitalmindmf.com'
    page = get_text(base + '/statutory-disclosures.html', _HTML, cache_hours=6)
    a = page.find('>Monthly Portfolio</h2>')
    b = page.find('class="tab-pane', a)
    sec = page[a:b if b > a else None]
    pairs = [(href, '%s %s' % (mon, yr)) for mon, yr, href in
             re.findall(r'<span class="fs-16">\s*([A-Za-z]+)\s+(\d{4})\s*</span>\s*<a href="([^"]+)"', sec)]
    return newest(pairs, base=base + '/')


@recipe(83)
def wealth_company(r):
    """The Wealth Company: Next.js page; the document list is in the RSC flight data
    ({uploadDate, name: 'Monthly - <scheme> - <date>', attachment.url})."""
    base = 'https://www.wealthcompanyamc.in'
    page = get_text(base + '/literature-forms/portfolio-documents/monthly/', _HTML, cache_hours=6)
    rsc = ''.join(json.loads(s) for s in re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', page))
    docs = re.findall(r'\{"uploadDate":"(\d{4}-\d{2}-\d{2})".*?"name":"([^"]*)".*?"attachment":\{[^{}]*?"url":"([^"]+)"', rsc)
    return newest([(u, n) for _, n, u in docs if n.lower().startswith('monthly')], base=base)


@recipe(20)
def icici(r):
    """ICICI Prudential: the downloads API (the 'env: api' header is required) lists the
    'monthly-portfolio-disclosures' subcategory; the newest file is a zip holding one
    workbook per scheme, served from the site's blob front."""
    api = 'https://apimf.icicipruamc.com/nms/v1/downloads/'
    h = {'env': 'api', 'Accept': 'application/json, text/plain, */*', 'Origin': 'https://www.icicipruamc.com',
         'Referer': 'https://www.icicipruamc.com/', 'Content-Type': 'application/json'}
    parent = sub = None
    for c in get_json(api + 'categories?userType=Investor', h, cache_hours=6)['success']['data']:
        for s in c.get('subCategory') or []:
            if s.get('internalName') == 'monthly-portfolio-disclosures':
                parent, sub = c, s
    if not sub:
        raise ValueError('monthly-portfolio-disclosures category not found')
    body = json.dumps({'categoryId': sub['id'], 'schemeCategory': '', 'userType': 'Investor', 'fileType': 'All',
                       'page': '1', 'size': '20', 'filter': [], 'categoryName': parent['title']['code']})
    files = [f for f in get_json(api + 'files', h, data=body, cache_hours=6)['success']['data']['files']
             if f.get('isEnabled', True) and f.get('url')]
    if not files:
        return []
    newest_file = max(files, key=lambda f: f.get('applicableMonth') or f.get('fileDate') or 0)
    return ['https://www.icicipruamc.com/blob' + urllib.parse.quote(newest_file['url'])]


@recipe(3)
def aditya_birla(r):
    """Aditya Birla Sun Life: the portfolio page's 'Monthly Portfolio' accordion loads from
    a public Sitecore endpoint (its '&month= &year=0' suffix is required). The listed
    CDN host is retired, so the same path is fetched from the main site. The file is
    a zip holding one legacy .xls with every scheme."""
    site = 'https://mutualfund.adityabirlacapital.com'
    h = {'Accept': 'application/json, text/javascript, */*; q=0.01', 'X-Requested-With': 'XMLHttpRequest',
         'Referer': site + '/forms-and-downloads/portfolio'}
    acc = '3ccab227-9de5-4494-b78d-2b4f7c0c054a'
    try:
        page = get_text(site + '/forms-and-downloads/portfolio', _HTML, cache_hours=24)
        m = re.search(r'FactsheetAccordionById\?id=([0-9a-f-]{36})[^"]*"\s*>\s*<button[^>]*>\s*<span>\s*Monthly Portfolio\s*<', page)
        acc = m.group(1) if m else acc
    except Exception:  # noqa: BLE001  (the known id still works)
        pass
    api = (site + '/postlogin/CustomApi/Resources/FactsheetAccordionById?id=' + acc +
           '&ctype=%2Fsitecore%2Fcontent%2FRoot%2FBSL%2FLibrary%2FLists%2FFAQ%2FCustomer%20Types%2FIndividual&month=%20&year=0')
    items = get_json(api, h, cache_hours=6)['AccordionList']
    got = newest([(it['pdfUrl'], it.get('ResourceLink') or '') for it in items if it.get('pdfUrl')], label_rx=r'as on')[:1]
    return [site + urllib.parse.urlsplit(u).path for u in got]


@recipe(48)
def bandhan(r):
    """Bandhan: the React app goes through an encrypted proxy, but the WordPress REST
    route behind it (finance-api/v1 on cmsnew.bandhanmutual.com) is public. Its
    'financial_year' is really the calendar year of the portfolio date."""
    api = ('https://cmsnew.bandhanmutual.com/wp-json/finance-api/v1/posts/scheme-portfolios'
           '?subcategory=monthly-and-half-yearly&acf_key=financial_year&acf_value=%d&bypass_pagination=true')
    h = {'Accept': 'application/json, text/plain, */*', 'Origin': 'https://bandhanmutual.com', 'Referer': 'https://bandhanmutual.com/'}
    for year in (datetime.date.today().year, datetime.date.today().year - 1):
        pairs = []
        for p in get_json(api % year, h, cache_hours=6, timeout=180).get('data') or []:
            for f in (p.get('acf_fields') or {}).get('disclosure_files') or []:
                link = f.get('document_link') or {}
                u = link.get('url') if isinstance(link, dict) else link
                if u:
                    pairs.append((u, f.get('document_name') or p.get('title') or ''))
        got = newest(pairs, tail=20)
        if got:
            return got
    return []


@recipe(46)
def bank_of_india(r):
    """Bank of India: the Sitefinity web service behind the Investor Corner 'Monthly
    Portfolio' tab; its reply's 'd' field is itself a JSON string."""
    h = {'Accept': 'application/json, text/javascript, */*; q=0.01', 'Content-Type': 'application/json;charset=utf-8',
         'Origin': 'https://www.boimf.in', 'Referer': 'https://www.boimf.in/investor-corner', 'X-Requested-With': 'XMLHttpRequest'}
    body = json.dumps({'pagno': 0, 'category': None, 'fromDate': None, 'toDate': None, 'LibraryName': 'InvestorCorner',
                       'folderName': 'MONTHLY PORTFOLIO', 'CategoryValue': 'no'})
    docs = json.loads(get_json('https://www.boimf.in/AjaxService.asmx/GetDocuments', h, data=body, cache_hours=6)['d'])['Documents']
    pairs = [(d['FolderUrl'], (d.get('DocName') or '').replace('-', ' ')) for d in docs
             if re.search(r'\.(xlsx?|zip)(\?|$)', d.get('FolderUrl') or '', re.I)]
    return newest(pairs)[:1]


@recipe(4)
def baroda_bnp(r):
    """Baroda BNP Paribas: server-rendered list, newest first, 6 per page. The
    consolidated file is titled 'Monthly Portfolio - all funds as on <date>' (the rest
    are per-scheme copies). If it has slipped off page one, the page's own 'load
    more' call (session cookie + the page's CSRF token) walks further back."""
    page_url = 'https://www.barodabnpparibasmf.in/downloads/monthly-portfolio-scheme'
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    html = op.open(urllib.request.Request(page_url, headers=dict(BASE_HEADERS, **_HTML)), timeout=90).read().decode('utf-8', 'replace')

    def all_funds(h):
        out = []
        for li in re.findall(r'<li>\s*<div class="downloadLeft">(.*?)</li>', h, re.S):
            t = re.search(r'class="file-name">(.*?)</p>', li, re.S)
            u = re.search(r'href="(https?://[^"]+/download_documents/[^"]+)"', li)
            if t and u and re.search(r'all\s+funds\s+as\s+on', t.group(1), re.I):
                out.append((u.group(1), re.sub(r'\s+', ' ', t.group(1))))
        return newest(out)[:1]

    got = all_funds(html)
    if got:
        return got
    csrf = re.search(r'name="csrf_test_name" value="([^"]+)"', html).group(1)
    total = re.search(r'id="total_cnt" value="(\d+)"', html).group(1)
    cat = re.search(r'id="category" value="(\d+)"', html).group(1)
    page, remaining = 1, ''
    for _ in range(8):
        data = urllib.parse.urlencode({'csrf_test_name': csrf, 'cnt': total, 'pagination': page, 'send_category': cat,
                                       'send_year': '', 'remaining_cnt': remaining}).encode()
        req = urllib.request.Request('https://www.barodabnpparibasmf.in/ajax-load-more-documents', data=data,
                                     headers=dict(BASE_HEADERS, **{'X-Requested-With': 'XMLHttpRequest', 'Referer': page_url,
                                                                   'Accept': 'application/json, text/javascript, */*; q=0.01'}))
        j = json.loads(op.open(req, timeout=60).read())
        got = all_funds(j.get('data') or '')
        if got or j.get('status') == 'N':
            return got
        page, remaining = j.get('pagination', page + 1), j.get('remaining_cnt', '')
    return []


@recipe(21)
def nippon(r):
    """Nippon India: static SharePoint page whose labels ('Monthly portfolio for the
    month of Aug 2026') are full of zero-width spaces. The .xls name hides an xlsx."""
    base = 'https://mf.nipponindiaim.com'
    html = get_text(base + '/investor-service/downloads/factsheet-portfolio-and-other-disclosures', _HTML,
                    cache_hours=6).replace('​', '')
    pairs = [(href, re.sub(r'<[^>]+>|\s+', ' ', lab)) for lab, href in
             re.findall(r'class="lhsLbl">(.*?)</label>.*?href="([^"]+)"', html, re.S) if re.search(r'\.(xlsx?|zip)$', href, re.I)]
    return newest(pairs, label_rx=r'monthly\s+portfolio', base=base + '/')[:1]


@recipe(61)
def union(r):
    """Union: Sitefinity page listing files through inline
    downloadMonthPortfolio.push({Title, Url}) scripts. One workbook per scheme."""
    html = get_text('https://www.unionmf.com/about-us/downloads/monthly-portfolio', _HTML, cache_hours=6, timeout=120)
    pairs = re.findall(r'downloadMonthPortfolio\.push\(\{\s*Title:\s*"(.*?)",\s*Url:\s*"(.*?)"', html, re.S)
    return newest([(u, t + ' ' + u) for t, u in pairs])


@recipe(62)
def one360(r):
    """360 ONE: Next.js page whose flight data holds {"title":"Monthly Portfolio",
    "yearlyData":[...]}; the year is on yearlyData, the month on each fileName."""
    rsc = rsc_text(get_text('https://www.360.one/asset/mutual-funds/downloads/', _HTML, cache_hours=6, timeout=120))
    i = rsc.find('{"title":"Monthly Portfolio","yearlyData"')
    if i < 0:
        raise ValueError('Monthly Portfolio block not found')
    pairs = []
    for y in balanced_json(rsc, i).get('yearlyData') or []:
        yr = re.search(r'20\d\d', y.get('year') or '')
        for md in y.get('monthlyData') or []:
            for g in md.get('documentGroups') or []:
                for d in g.get('documents') or []:
                    if yr and re.search(r'\.(xlsx?|zip)$', d.get('fileUrl') or '', re.I):
                        pairs.append((d['fileUrl'], '%s %s' % (d.get('fileName') or '', yr.group(0))))
    return newest(pairs)[:1]


@recipe(9)
def hdfc(r):
    """HDFC: www.hdfcfund.com blocks scripts (Akamai), so this calls the CMS API the
    site's own pages use (it expects the site's Origin). year=0&month=0 means the
    latest month. One workbook per scheme, titled 'Monthly <scheme> - <date>'."""
    h = {'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/x-www-form-urlencoded',
         'Origin': 'https://www.hdfcfund.com', 'Referer': 'https://www.hdfcfund.com/'}
    files = get_json('https://cms.hdfcfund.com/en/hdfc/api/v2/disclosures/monthfortportfolio', h,
                     data='year=0&type=monthly&month=0', cache_hours=6)['data']['files']
    pairs = [((f.get('file') or {}).get('url'), f.get('title') or '') for f in files
             if re.match(r'\s*monthly\b', f.get('title') or '', re.I) and (f.get('file') or {}).get('url')]
    return newest(pairs, tail=28)


@recipe(53)
def axis(r):
    """Axis: the CMS API wants the public bearer token from /cms/token (no login). Its
    'Consolidated' bucket of monthly scheme portfolios holds the all-scheme workbook
    ('Monthly Portfolio <date>'); listing months are posting months, so a few are read."""
    base = 'https://www.axismf.com'
    h = {'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'Origin': base,
         'Referer': base + '/statutory-disclosures'}
    h['Authorization'] = get_json(base + '/cms/token', h, data='{}', cache_hours=0)['data']['token']
    pairs = []
    for y, m in months_back(3):
        body = json.dumps({'sdType': 'yearMonthSchemeDocs', 'sdID': 'sdMonthSchemePortfolio', 'year': str(y),
                           'month': MONTH_NAMES[m - 1], 'schemeCode': 'Consolidated'})
        docs = (get_json(base + '/cms/get-scheme-documents', h, data=body, cache_hours=6).get('data') or {}).get('documentList') or []
        pairs += [(x['docuementURL'], x.get('documentName') or '') for x in docs if x.get('docuementURL')  # (sic) API spelling
                  and re.match(r'\s*monthly\s*portfolio', x.get('documentName') or '', re.I)
                  and 'axis' not in (x.get('documentName') or '').lower()]
    return newest(pairs)[:1]


@recipe(55)
def motilal(r):
    """Motilal Oswal: the downloads block reads a public search-documents.json; its
    month/year are the publish month, so the portfolio month comes from the title
    ('scheme portfolio details august 2026'). Fortnightly files share the category."""
    base = 'https://www.motilaloswalmf.com'
    res = get_json(base + '/content/aem-cloud-dept-backend-motilal-oswal/api/search-documents.json'
                   '?year=&category=month%20end%20portfolio&month=&type=mf',
                   {'Referer': base + '/downloads/scheme-portfolio-details'}, cache_hours=6)['results']
    pairs = [(base + urllib.parse.quote(x['path']), (x.get('title') or '') + ' ' + x['path']) for x in res
             if x.get('path') and re.search(r'\.xlsx?$', x['path'], re.I)
             and not re.search(r'fortnight', (x.get('title') or '') + x['path'], re.I)]
    return newest(pairs, label_rx=r'scheme portfolio details|monthly portfolio')[:1]


@recipe(71)
def whiteoak(r):
    """WhiteOak Capital: public Strapi REST behind the Next.js site; monthly rows carry
    doc_name '... Monthly Portfolio Disclosure - 31st August2026' and the file."""
    q = urllib.parse.urlencode({'filters[period][$eq]': 'Monthly', 'sort[0]': 'published_date:desc', 'sort[1]': 'id:desc',
                                'pagination[page]': 1, 'pagination[pageSize]': 100, 'populate': 'doc_file'})
    rows = get_json('https://cms.whiteoakamc.com/api/scheme-portfolios?' + q,
                    {'Origin': 'https://mf.whiteoakamc.com', 'Referer': 'https://mf.whiteoakamc.com/'}, cache_hours=6)['data']
    pairs = []
    for row in rows:
        a = row.get('attributes') or {}
        f = (a.get('doc_file') or {}).get('data') or {}
        f = f[0] if isinstance(f, list) and f else f
        u = ((f or {}).get('attributes') or {}).get('url') or a.get('doc_link')
        if u:
            pairs.append((u, (a.get('doc_name') or '').strip()))
    return newest(pairs, base='https://cms.whiteoakamc.com/', tail=24)


@recipe(58)
def pgim(r):
    """PGIM India: Angular app over a JSON API: find the 'Monthly Portfolio' section,
    then list its published documents (month/year fields). TLS 1.3 only (curl)."""
    base = 'https://www.pgimindia.com'
    h = {'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json', 'Origin': base,
         'Referer': base + '/mutual-funds/disclosures/Portfolios/Monthly-Portfolio'}
    head_id, sec_id = 2, 'SECTION_747960037'
    for hd in get_json(base + '/api/v1/brochure/disclosure/section', h, cache_hours=6)['data']:
        for s in hd.get('Sections') or []:
            if (s.get('SectionName') or '').strip().lower() == 'monthly portfolio':
                head_id, sec_id = hd['HeaderId'], s['SectionId']
    body = json.dumps({'headerId': head_id, 'sectionId': sec_id, 'source': 'W', 'branchCode': None})
    tabs = get_json(base + '/api/v1/brochure/published/disclosure', h, data=body, cache_hours=6)['data']
    return newest([(urllib.parse.quote(d['pdfPath'], safe=':/'), '%s %s' % (d.get('month'), d.get('year')))
                   for t in tabs for d in t.get('content') or [] if d.get('pdfPath') and d.get('month') and d.get('year')])


@recipe(33)
def sundaram(r):
    """Sundaram: legacy Ajax.NET page. The handler's assembly name changes on redeploy,
    so it is read from the page; GetCategory('Monthly') returns the list as a JS string
    of HTML. Two all-scheme workbooks a month (equity & FoF, fixed income)."""
    base = 'https://www.sundarammutual.com'
    page_url = base + '/Monthly-Fortnightly-Adhoc-Portfolios'
    html = get_text(page_url, _HTML, cache_hours=6)
    m = re.search(r'src="(/ajax/Modules_Disclosure_Monthly_Fortnightly_Adhoc_Portfolios,[^"]+\.ashx)"', html)
    ajax = base + (m.group(1) if m else '/ajax/Modules_Disclosure_Monthly_Fortnightly_Adhoc_Portfolios,App_Web_dxgnl0bp.ashx')
    resp = get_text(ajax + '?_method=GetCategory&_session=no',
                    {'Origin': base, 'Referer': page_url, 'Content-Type': 'text/plain;charset=UTF-8'},
                    data='Catid=Monthly', cache_hours=6).replace("\\'", "'")
    pairs = [(href, htmllib.unescape(lab).strip()) for href, lab in
             re.findall(r"<a href='([^']+\.xlsx?)'[^>]*>(?:<i[^>]*></i>)?([^<]+)</a>", resp, re.I)]
    return newest(pairs, base=base + '/', tail=12)


@recipe(63)
def groww(r):
    """Groww: server-rendered page; monthly files sit under .../Portfolio/<FY>/ and are
    named like 'Monthly Portfolio- Aug 31 2026.xlsx' (spelling and format vary)."""
    html = get_text('https://growwmf.in/statutory-disclosure/portfolio', _HTML, cache_hours=6)
    pairs = []
    for u in set(re.findall(r'href="(https://assets-netstorage\.growwmf\.in/[^"]+/Portfolio/[^"]+\.xlsx?)"', html, re.I)):
        name = urllib.parse.unquote(u.rsplit('/', 1)[1])
        if re.match(r'\s*mon\w*ly[\s_]*portfolio', name, re.I):
            pairs.append((u, name))
    return newest(pairs)


@recipe(64)
def ppfas(r):
    """PPFAS: static page; PPFAS_Monthly_Portfolio_Report_<Month>_<DD>_<YYYY>.xls is the
    consolidated workbook (really xlsx); per-scheme copies are the fallback."""
    page_url = 'https://amc.ppfas.com/downloads/portfolio-disclosure/'
    html = get_text(page_url, _HTML, cache_hours=6)
    hrefs = set(re.findall(r'href="([^"]*portfolio-disclosure/[^"]*Monthly_Portfolio_Report_[^"]+?\.xlsx?(?:\?[^"]*)?)"', html, re.I))
    got = newest([(h, h.rsplit('/', 1)[-1].split('?')[0]) for h in hrefs], base=page_url)
    return [u for u in got if re.search(r'/PPFAS_Monthly_Portfolio_Report_', u)] or got


@recipe(67)
def shriram(r):
    """Shriram: large static page; monthly workbooks (legacy .xls) sit under
    /Monthly-Portfolio-for-the-Financial-Year/ on the CDN, named ...-<Month>-<YYYY>.xls."""
    html = get_text('https://www.shriramamc.in/investor-statutory-disclosures', _HTML, cache_hours=6, timeout=120)
    urls = set(re.findall(r'https://cdn\.shriramamc\.in/[^"\'\s<>\\]*/Monthly-Portfolio-for-the-Financial-Year/[^"\'\s<>\\]+?\.xlsx?', html, re.I))
    return newest([(u, u.rsplit('/', 1)[-1]) for u in urls])


@recipe(28)
def uti(r):
    """UTI: the Angular app's CMS config points at get-consolidate-portfolio-disclosure
    (month as an English name). The zip's holdings are in its 'Sebi Exposure as on'
    member: one sheet with every scheme stacked. Other members are not portfolios."""
    h = {'Accept': 'application/json, text/plain, */*', 'Referer': 'https://www.utimf.com/downloads/consolidate-all-portfolio-disclosure'}
    for y, m in months_back(6):
        rows = get_json('https://www.utimf.com/api/get-consolidate-portfolio-disclosure?year=%d&month=%s'
                        % (y, MONTH_NAMES[m - 1]), h, cache_hours=6).get('rows') or []
        urls = [x.get('url') or x.get('doc') for x in rows if x.get('url') or x.get('doc')]
        if urls:
            return [(urls[0], None, {'member': r'^sebi\s+exposure'})]
    return []


@recipe(45)
def mirae(r):
    """Mirae Asset: AjaxService/GetDownloadsData ('portfolio_tab1' = monthly), newest first,
    titled 'Portfolio Details as on 31st August 2026 for <scheme>'. The service drops
    rapid back-to-back calls (http_get retries; pages are paced)."""
    base = 'https://www.miraeassetmf.co.in/'
    h = {'Content-Type': 'application/json;charset=utf-8', 'Accept': 'application/json, text/javascript, */*; q=0.01',
         'X-Requested-With': 'XMLHttpRequest', 'Origin': base.rstrip('/'), 'Referer': base + 'downloads/portfolio'}
    pairs = []
    for pg in range(1, 4):
        body = json.dumps({'request': {'modulename': 'portfolio_tab1', 'pgno': pg, 'pgsize': 200}})
        data = get_json(base + 'AjaxService/GetDownloadsData', h, data=body, cache_hours=6).get('Data') or []
        pairs += [(x['URL'], x.get('Title') or '') for x in data if x.get('URL')]
        if not data or len({month_of(t) for _, t in pairs} - {None}) > 1:  # already reached an older month
            break
        time.sleep(2)
    return newest(pairs, label_rx=r'as on', base=base)


@recipe(72)
def trust(r):
    """Trust MF: the React app's API (base from its config.json) returns the disclosure
    list; titles are 'TRUSTMF Monthly Portfolio Report as on 31.08.2026'."""
    h = {'Accept': 'application/json, text/plain, */*', 'Content-Type': 'application/json; charset=UTF-8',
         'Origin': 'https://www.trustmf.com', 'Referer': 'https://www.trustmf.com/disclosures?activeTab=portfolio-disclosures'}
    body = json.dumps({'systemQueryFileName': 'disclosuresweb.xml', 'tagName': 'GetDisclosureByType', 'searchField': '',
                       'searchValue': '', 'sortField': 'uploaddate', 'sortDirection': 'DESC', 'replaceField': '_slug_',
                       'replaceValue': 'portfolio-monthly-disclosure'})
    rows = get_json('https://www.trustmf.com/api/api/Trust/GetData', h, data=body, cache_hours=6).get('resultSetArray') or []
    return newest([(urllib.parse.quote((x.get('fileurl') or '').strip(), safe=':/'), x.get('title') or '')
                   for x in rows if x.get('fileurl')], label_rx=r'as on')[:1]


@recipe(82)
def jio_blackrock(r):
    """Jio BlackRock: Next.js page whose list comes from a Server Action
    (getDisclosureL3Data). Its id changes with each deploy, so it is read from the
    page's chunk, then called the way the page calls it. Prefer the consolidated file."""
    site = 'https://www.jioblackrockamc.com'
    page = site + '/statutory-disclosure/disclosures/monthly-portfolio-disclosure'
    html = get_text(page, _HTML, cache_hours=0)
    chunk = re.search(r'(/_next/static/chunks/app/[^"\']*statutory-disclosure/[^"\']*page-[0-9a-f]+\.js)', html).group(1)
    action = re.search(r'createServerReference\)\("([0-9a-f]{40,})"[^)]*?"getDisclosureL3Data"\)',
                       get_text(site + chunk, cache_hours=0)).group(1)
    h = {'Accept': 'text/x-component', 'Next-Action': action, 'Content-Type': 'text/plain;charset=UTF-8',
         'Origin': site, 'Referer': page}
    for y, m in months_back(6):
        fy = y if m >= 4 else y - 1
        args = json.dumps(['monthly-portfolio-disclosure', {'year': 'FI%d-%d' % (fy, fy + 1), 'month': MONTH_NAMES[m - 1],
                                                            'date': '$undefined'}, 'MF'])
        rows = []
        for line in get_text(page, h, data=args, cache_hours=6).splitlines():
            if line.startswith('1:'):
                rows = [x for x in (json.loads(line[2:]).get('data') or []) if x.get('file')]
        if rows:
            whole = [x['file']['url'] for x in rows if (x.get('title') or '').startswith('JioBlackRock Mutual Fund-')]
            return whole[:1] or [x['file']['url'] for x in rows]
    return []


@recipe(84)
def choice(r):
    """Choice: POST portfolio-website-list returns every scheme's reports with a
    report_date and a file_path on doc.choicemf.com."""
    data = get_json('https://choicemf.com/api/monthly-portfolio-report/portfolio-website-list',
                    {'Content-Type': 'application/json', 'Origin': 'https://choicemf.com',
                     'Referer': 'https://choicemf.com/disclosures/monthly-portfolio'}, data='{}', cache_hours=6)['body']['data']
    reps = [(rp['report_date'], rp['file_path']) for s in data for rp in s.get('reports') or []
            if rp.get('file_path') and past((rp.get('report_date') or '')[:7])]
    if not reps:
        return []
    latest = max(d for d, _ in reps)
    return ['https://doc.choicemf.com/' + urllib.parse.quote(p.lstrip('/'), safe='/') for d, p in reps if d == latest]


@recipe(73)
def nj(r):
    """NJ: static page of monthly files (viewfile.php?file=...), one per scheme, named
    NJ-MF-Monthly-Portfolio-<CODE>-<Month>-<YYYY>-<upload timestamp>.xlsx."""
    page = 'https://downloads.njmutualfund.com/njmf_download.php?nme=127'
    html = get_text(page, _HTML, cache_hours=6)
    hrefs = [h for h in re.findall(r'href=["\'](viewfile\.php\?file=[^"\']+\.xlsx?)["\']', html, re.I) if 'portfolio' in h.lower()]
    return newest([(h, re.sub(r'-\d{14}\.', '.', h.split('=', 1)[1])) for h in hrefs], base=page)


@recipe(74)
def samco(r):
    """Samco: one very large static page; the Portfolio Disclosure tab's 'Monthly'
    accordion lists one file per scheme (media1.samco.in serves the same files)."""
    html = get_text('https://www.samcomf.com/StatutoryDisclosure', _HTML, cache_hours=6, timeout=150)
    a = html.find('id ="option2"')
    sec = html[a:html.find('id ="option3"', a)] if a >= 0 else ''
    monthly = next((p for p in re.split(r'<a class="toggle bgm" href=#>\s*', sec)[1:]
                    if p[:p.find('<')].strip().lower() == 'monthly'), '')
    pairs = []
    for title, fname in re.findall(r'<td data-th="Document Title">\s*(.*?)\s*</td>\s*<td data-th="Action">\s*'
                                   r'<a href="/amc-document-download/([^"]+)"', monthly, re.S):
        label = re.sub(r'_\d{9,}\.', '.', title + ' ' + fname)  # drop the upload timestamp
        pairs.append(('https://media1.samco.in/scomamc/amc_documents/' + fname.strip(), label))
    return newest(pairs)


@recipe(76)
def helios(r):
    """Helios: WordPress page; monthly files are '<scheme>-...-as-on-31st-august-2026.xlsx'
    (naming drifts), so any helios .xls/.xlsx with a month-end date counts, minus
    fortnightly and half-yearly ones."""
    page = 'https://www.heliosmf.in/portfolio-disclosure/'
    pairs = []
    for h in re.findall(r'href=["\']([^"\']+\.xlsx?)["\']', get_text(page, _HTML, cache_hours=6), re.I):
        name = h.rsplit('/', 1)[-1].lower()
        m = re.search(r'(\d{1,2})(?:st|nd|rd|th)?-([a-z]+)-(20\d\d)', name)
        if 'helios' in name and not re.search(r'fortnight|half', name) and m and int(m.group(1)) >= 28:
            pairs.append((h, name))
    return newest(pairs, base=page)


@recipe(42)
def invesco(r):
    """Invesco: JSON endpoints behind the monthly-holdings pages: classifications, then
    per classification and year one row per scheme with JanUrl..DecUrl."""
    base = 'https://www.invescomutualfund.com/api/'
    h = {'Accept': 'application/json', 'Referer': 'https://www.invescomutualfund.com/literature-forms/monthly-holdings/equity'}
    classes = [c['FunClassificationValue'] for c in get_json(base + 'ClassificationCompleteMonthlyHoldings', h, cache_hours=24)
               if (c.get('FunClassificationValue') or '').lower() not in ('', 'select')]
    years = sorted({y['Year'] for y in get_json(base + 'CompleteMonthlyHoldings?year=0', h, cache_hours=24)}, reverse=True)[:2]
    pairs = []
    for yr in years:
        for cls in classes:
            for row in get_json(base + 'CompleteMonthlyHoldings?year=%d&classification=%s' % (yr, urllib.parse.quote(cls)),
                                h, cache_hours=6) or []:
                for i, mon in enumerate(MONTH_NAMES):
                    u = (row.get(mon[:3] + 'Url') or '').strip()
                    if u:
                        pairs.append((u, '%s %d' % (mon, yr)))
    return newest(pairs)


@recipe(32)
def canara_robeco(r):
    """Canara Robeco: WordPress page; inline monthsByYear names the newest month, then
    the page's own filter (?filteryear=&filtermonth=&pagination=N) lists 10 files a page."""
    base = 'https://www.canararobeco.com/documents/statutory-disclosures/scheme-dashboard/scheme-monthly-portfolio/'
    mby = json.loads(re.search(r'const monthsByYear\s*=\s*(\{.*?\});', get_text(base, _HTML, cache_hours=6), re.S).group(1))
    year = max(mby, key=int)
    month = max(mby[year], key=int)
    urls = []
    for n in range(1, 21):
        p = get_text(base + '?' + urllib.parse.urlencode({'filteryear': year, 'filtermonth': month, 'pagination': n}),
                     _HTML, cache_hours=6)
        found = re.findall(r'<a href="([^"]+\.xlsx?)"\s+class="pdf-title', p, re.I)
        for u in found:
            sp = urllib.parse.urlsplit(htmllib.unescape(u))
            u = urllib.parse.urlunsplit(sp._replace(path=urllib.parse.quote(urllib.parse.unquote(sp.path))))
            if u not in urls:
                urls.append(u)
        if not found or 'class="next"' not in p:
            break
    return urls


@recipe(27)
def franklin(r):
    """Franklin Templeton: the reports app's literature JSON (about 3 MB); the newest
    frkReferenceDate in MONTHLY-PORTFOLIO-DSCLR is the consolidated workbook."""
    data = get_json('https://www.franklintempletonindia.com/api/literature/v1/responseLitJson?type=report',
                    {'Referer': 'https://www.franklintempletonindia.com/investor/reports'}, cache_hours=6, timeout=150)
    recs = []
    for cat in data.get('FirstDropDown') or []:
        if cat.get('id') == 'MONTHLY-PORTFOLIO-DSCLR':
            recs = (cat.get('dataRecords') or {}).get('linkdata') or []
    recs = [x for x in recs if re.search(r'\.(xlsx?|zip)$', x.get('literatureHref') or '', re.I)]
    if not recs:
        return []
    latest = max(recs, key=lambda x: x.get('frkReferenceDate') or '')
    return ['https://www.franklintempletonindia.com/download' + urllib.parse.quote(latest['literatureHref'], safe='/-_.')]


@recipe(86)
def alphagrep(r):
    """AlphaGrep: the Angular app reads a static files.json; files are
    <folder>/monthly/<FY>/<Month>_<YYYY>.xls or .xlsx. A missing file comes back as
    the app's HTML with status 200, so each candidate is checked by its bytes."""
    base = 'https://www.alphagrepmf.ai/assets/documents/'
    idx = get_json(base + 'files.json', {'Referer': 'https://www.alphagrepmf.ai/disclosures'}, cache_hours=6)
    cands = [('%s%s/monthly/%s/%s' % (base, s['folderName'], fy['yearFolder'], d.get('fileName') or ''),
              (d.get('fileName') or '').replace('_', ' '))
             for s in idx.get('monthly') or [] for fy in s.get('financialYears') or [] for d in fy.get('documents') or []]
    out = []
    for stem in newest(cands):
        for ext in ('.xls', '.xlsx'):
            try:
                http_get(stem + ext, timeout=120, ok=looks_like_workbook)
                out.append(stem + ext)
                break
            except (ValueError, urllib.error.HTTPError):
                continue
    return out


@recipe(85)
def abakkus(r):
    """Abakkus: static page embedding its CMS data as JSON (<script id="verticals-data">);
    'Monthly Portfolio Disclosures' items are titled with the portfolio date. TLS 1.3
    only (curl). The .xls-named workbook is really xlsx."""
    page = 'https://www.abakkusmf.com/statutory-disclosures.html'
    html = get_text(page, _HTML, cache_hours=6)
    verticals = json.loads(re.search(r'<script id="verticals-data" type="application/json">(.*?)</script>', html, re.S).group(1))
    items = []

    def walk(n):
        if isinstance(n, dict):
            if 'downloadMedia' in n or 'downloadUrl' in n:
                items.append(n)
            for v in n.values():
                walk(v)
        elif isinstance(n, list):
            for v in n:
                walk(v)

    for v in verticals:
        if (v.get('title') or '').strip().lower() == 'monthly portfolio disclosures':
            walk(v.get('sections'))
    pairs = []
    for it in items:
        u = (it.get('downloadMedia') or {}).get('url') or it.get('downloadUrl')
        try:
            d = datetime.datetime.strptime((it.get('title') or '').strip(), '%B %d, %Y').date()
        except ValueError:
            continue
        if u and (d + datetime.timedelta(days=1)).day == 1:  # month-end files only
            pairs.append((u, it['title']))
    return newest(pairs, base=page)


@recipe(77)
def zerodha(r):
    """Zerodha Fund House: Next.js page; __NEXT_DATA__ lists the monthly files
    ('<CODE> - Monthly Portfolio <Month> <YYYY>'); URLs contain spaces."""
    html = get_text('https://www.zerodhafundhouse.com/resources/disclosures', _HTML, cache_hours=6)
    nd = json.loads(re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S).group(1))
    files = []
    for sec in nd['props']['pageProps'].get('initialReports') or []:
        if sec.get('id') == 'portfolio-disclosures':
            for sub in sec.get('data') or []:
                if sub.get('id') == 'monthly-portfolio-disclosures':
                    files = sub.get('files') or []
    return newest([(urllib.parse.quote(f['url'], safe=':/'), f.get('name') or '') for f in files if f.get('url')])


@recipe(78)
def old_bridge(r):
    """Old Bridge: static page; the Monthly Portfolio tab (#v-pills-tabContent2) has
    grey-head groups ('2026 - 27', 'Portfolio Overlap') and '<Scheme> - <Month YYYY>'
    items. The overlap group is not a portfolio."""
    base = 'https://oldbridgemf.com/statutory-disclosures.html'
    html = get_text(base, _HTML, cache_hours=6)
    i = html.find('id="v-pills-tabContent2"')
    seg = html[i:html.find('id="v-pills-tabContent3"', i)] if i >= 0 else ''
    pairs, group = [], ''
    for m in re.finditer(r'<div class="grey-head[^"]*">([^<]*)</div>|<h2[^>]*>\s*([^<]*?)\s*</h2>\s*<a[^>]+href="([^"]+)"', seg):
        if m.group(1) is not None:
            group = m.group(1).strip().lower()
        elif 'overlap' not in group and 'overlap' not in m.group(3).lower() and re.search(r'\.(xlsx?|zip)$', m.group(3), re.I):
            pairs.append((m.group(3), m.group(2)))
    return newest(pairs, base=base)


@recipe(79)
def unifi(r):
    """Unifi: WordPress page; between the 'Monthly Portfolio Disclosure' and 'Half Yearly'
    headings each scheme tab links its files under a 'Month YYYY' label."""
    base = 'https://unifimf.com/statutorydocuments/'
    html = get_text(base, _HTML, cache_hours=6)
    i = html.find('Monthly Portfolio Disclosure')
    seg = html[i:html.find('Half Yearly Portfolio Disclosure', i)] if i >= 0 else ''
    pairs = [(h, re.sub(r'<[^>]+>|\s+', ' ', inner)) for h, inner in re.findall(r'<a href="([^"]+)"[^>]*>(.*?)</a>', seg, re.S)
             if re.search(r'\.(xlsx?|zip)$', h, re.I)]
    return newest(pairs, base=base)
