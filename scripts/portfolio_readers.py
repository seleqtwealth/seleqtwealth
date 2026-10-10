"""
portfolio_readers.py  —  standard-library readers for AMC monthly portfolio files.

    read_workbook(data)  ->  [(sheet_name, rows), ...]
        Accepts .xlsx, legacy .xls (BIFF8, inside an OLE compound file), or a .zip
        holding either. Each row is a list of cell values (str, float or None);
        date-formatted numeric cells come back as 'YYYY-MM-DD' strings.

    parse_portfolios(rows)  ->  [portfolio, ...]
        Finds every SEBI-format portfolio block in one sheet (some AMCs stack all
        schemes in a single sheet) and returns, per block:
            {'title': scheme name as printed, 'asof': 'YYYY-MM-DD' or None,
             'equity': [(isin, name, pct_of_nav), ...]  (largest first),
             'equity_pct': float, 'rows': int}

No third-party packages, so the quarterly build runs on any stock Python 3.
"""
import calendar
import datetime
import io
import posixpath
import re
import struct
import zipfile
import xml.etree.ElementTree as ET

# ============================================================== xlsx ========
_M = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
_R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
_PR = '{http://schemas.openxmlformats.org/package/2006/relationships}'

# Built-in number formats that are dates (ECMA-376 / BIFF shared ids).
_BUILTIN_DATE_FMTS = set(range(14, 23)) | set(range(27, 37)) | {45, 46, 47} | set(range(50, 59))


def _is_date_code(code):
    c = re.sub(r'"[^"]*"|\[[^\]]*\]|\\.|_.|\*.', '', code or '').lower()
    if re.search(r'[#%?]|e[+-]', c):
        return False
    return bool(re.search(r'd|y|mmm', c))


def _serial_to_iso(v, date1904=False):
    try:
        base = datetime.date(1904, 1, 1) if date1904 else datetime.date(1899, 12, 30)
        return (base + datetime.timedelta(days=int(float(v)))).isoformat()
    except (ValueError, OverflowError):
        return None


def _col_index(ref):
    n = 0
    for ch in ref:
        if 'A' <= ch <= 'Z':
            n = n * 26 + (ord(ch) - 64)
        elif 'a' <= ch <= 'z':
            n = n * 26 + (ord(ch) - 96)
        else:
            break
    return n - 1


def read_xlsx(data):
    z = zipfile.ZipFile(io.BytesIO(data))
    names = set(z.namelist())

    def rd(p):
        return z.read(p) if p in names else None

    sst = []
    x = rd('xl/sharedStrings.xml')
    if x:
        for si in ET.fromstring(x).findall(_M + 'si'):
            buf = []
            for ch in si:  # plain <t>, or rich-text runs <r><t>; skip phonetic <rPh>
                if ch.tag == _M + 't':
                    buf.append(ch.text or '')
                elif ch.tag == _M + 'r':
                    t = ch.find(_M + 't')
                    buf.append((t.text or '') if t is not None else '')
            sst.append(''.join(buf))

    date_xf = set()
    x = rd('xl/styles.xml')
    if x:
        st = ET.fromstring(x)
        custom = {}
        nf = st.find(_M + 'numFmts')
        if nf is not None:
            for f in nf.findall(_M + 'numFmt'):
                custom[int(f.get('numFmtId'))] = f.get('formatCode')
        xfs = st.find(_M + 'cellXfs')
        if xfs is not None:
            for i, xf in enumerate(xfs.findall(_M + 'xf')):
                fid = int(xf.get('numFmtId', 0))
                if fid in _BUILTIN_DATE_FMTS or (fid in custom and _is_date_code(custom[fid])):
                    date_xf.add(i)

    wb = ET.fromstring(rd('xl/workbook.xml'))
    pr = wb.find(_M + 'workbookPr')
    date1904 = pr is not None and pr.get('date1904') in ('1', 'true')
    rels = {}
    x = rd('xl/_rels/workbook.xml.rels')
    if x:
        for r in ET.fromstring(x).findall(_PR + 'Relationship'):
            rels[r.get('Id')] = r.get('Target')

    out = []
    sheets = wb.find(_M + 'sheets')
    for s in (sheets.findall(_M + 'sheet') if sheets is not None else []):
        tgt = rels.get(s.get(_R + 'id'))
        if not tgt:
            continue
        path = tgt.lstrip('/') if tgt.startswith('/') else posixpath.normpath('xl/' + tgt)
        x = rd(path)
        if x is not None:
            out.append((s.get('name'), _xlsx_rows(x, sst, date_xf, date1904)))
    return out


def _xlsx_rows(xml_bytes, sst, date_xf, date1904):
    rows = []
    for _, el in ET.iterparse(io.BytesIO(xml_bytes), events=('end',)):
        if el.tag != _M + 'row':
            continue
        vals, nxt = {}, 0
        for c in el.findall(_M + 'c'):
            ref, t, v = c.get('r'), c.get('t'), c.find(_M + 'v')
            ci = _col_index(ref) if ref else nxt
            nxt = ci + 1
            val = None
            if t == 's':
                if v is not None and v.text:
                    try:
                        val = sst[int(v.text)]
                    except (ValueError, IndexError):
                        val = None
            elif t == 'inlineStr':
                val = ''.join((tt.text or '') for tt in c.iter(_M + 't'))
            elif t in ('str', 'e'):
                val = v.text if v is not None else None
            elif t == 'b':
                val = None
            elif v is not None and v.text not in (None, ''):
                try:
                    f = float(v.text)
                    s = c.get('s')
                    val = _serial_to_iso(f, date1904) if (s is not None and int(s) in date_xf) else f
                except ValueError:
                    val = v.text
            if val is not None and val != '':
                vals[ci] = val
        if vals:
            row = [None] * (max(vals) + 1)
            for k, val in vals.items():
                row[k] = val
            rows.append(row)
        el.clear()
    return rows


# =============================================================== xls ========
_CFB_SIG = b'\xD0\xCF\x11\xE0\xA1\xB1\x1A\xE1'
_MAXREG = 0xFFFFFFFA  # sector ids at or above this are chain markers


def _cfb_stream(data, want=('Workbook', 'Book')):
    """Pull one named stream out of an OLE2 compound file."""
    if data[:8] != _CFB_SIG:
        raise ValueError('not an OLE2 compound file')
    ssz = 1 << struct.unpack_from('<H', data, 0x1E)[0]
    mssz = 1 << struct.unpack_from('<H', data, 0x20)[0]
    n_fat, dir_start = struct.unpack_from('<II', data, 0x2C)
    mini_cutoff, minifat_start, _n_minifat, difat_start, n_difat = struct.unpack_from('<IIIII', data, 0x38)
    per = ssz // 4

    def sector(n):
        off = (n + 1) * ssz
        return data[off:off + ssz]

    fat_secs = [s for s in struct.unpack_from('<109I', data, 0x4C) if s < _MAXREG]
    s, guard = difat_start, 0
    while s < _MAXREG and guard <= n_difat:
        vals = struct.unpack('<%dI' % per, sector(s))
        fat_secs.extend(v for v in vals[:-1] if v < _MAXREG)
        s, guard = vals[-1], guard + 1
    fat = []
    for fs in fat_secs[:n_fat or len(fat_secs)]:
        fat.extend(struct.unpack('<%dI' % per, sector(fs)))

    def chain(start):
        out, s, seen = [], start, set()
        while s < _MAXREG and s < len(fat) and s not in seen:
            seen.add(s)
            out.append(s)
            s = fat[s]
        return out

    def read_chain(start, size=None):
        b = b''.join(sector(s) for s in chain(start))
        return b[:size] if size is not None else b

    d = read_chain(dir_start)
    entries = []
    for i in range(0, len(d) - 127, 128):
        e = d[i:i + 128]
        nlen = struct.unpack_from('<H', e, 0x40)[0]
        entries.append((e[:max(nlen - 2, 0)].decode('utf-16-le', 'ignore'), e[0x42],
                        struct.unpack_from('<I', e, 0x74)[0], struct.unpack_from('<I', e, 0x78)[0]))
    target = next((e for nm in want for e in entries if e[1] == 2 and e[0] == nm), None)
    if target is None:
        raise ValueError('no Workbook stream in compound file')
    _, _, start, size = target
    if size >= mini_cutoff:
        return read_chain(start, size)
    root = entries[0]
    ministream = read_chain(root[2], root[3])
    minifat = []
    for ms in chain(minifat_start):
        minifat.extend(struct.unpack('<%dI' % per, sector(ms)))
    out, s, seen = [], start, set()
    while s < _MAXREG and s not in seen and len(out) * mssz < size:
        seen.add(s)
        out.append(ministream[s * mssz:(s + 1) * mssz])
        s = minifat[s] if s < len(minifat) else _MAXREG
    return b''.join(out)[:size]


class _Segs:
    """Reads a BIFF record plus its CONTINUE records as one byte source. When
    string characters cross into a CONTINUE, Excel re-emits a flags byte there."""

    def __init__(self, segs):
        self.segs, self.i, self.p = segs, 0, 0

    def eof(self):
        while self.i < len(self.segs) and self.p >= len(self.segs[self.i]):
            self.i, self.p = self.i + 1, 0
        return self.i >= len(self.segs)

    def read(self, n):
        out = bytearray()
        while n > 0 and not self.eof():
            seg = self.segs[self.i]
            take = min(n, len(seg) - self.p)
            out += seg[self.p:self.p + take]
            self.p += take
            n -= take
        return bytes(out)

    def u8(self):
        b = self.read(1)
        return b[0] if b else 0

    def u16(self):
        b = self.read(2)
        return struct.unpack('<H', b)[0] if len(b) == 2 else 0

    def u32(self):
        b = self.read(4)
        return struct.unpack('<I', b)[0] if len(b) == 4 else 0

    def chars(self, cch, high):
        out = []
        while cch > 0 and self.i < len(self.segs):
            seg = self.segs[self.i]
            w = 2 if high else 1
            n = min(cch, (len(seg) - self.p) // w)
            if n <= 0:  # boundary inside a string: next segment starts with a flags byte
                self.i, self.p = self.i + 1, 0
                if self.i >= len(self.segs):
                    break
                high = self.segs[self.i][0] & 1
                self.p = 1
                continue
            b = seg[self.p:self.p + n * w]
            self.p += n * w
            out.append(b.decode('utf-16-le' if high else 'cp1252', 'replace'))
            cch -= n
        return ''.join(out)


def _parse_sst(segs):
    r = _Segs(segs)
    r.u32()
    unique = r.u32()
    out = []
    for _ in range(unique):
        if r.eof():
            break
        cch, flags = r.u16(), r.u8()
        runs = r.u16() if flags & 8 else 0
        ext = r.u32() if flags & 4 else 0
        out.append(r.chars(cch, flags & 1))
        if runs:
            r.read(4 * runs)
        if ext:
            r.read(ext)
    return out


def _xl_string(b, off, biff8=True, short=False):
    """XLUnicodeString (u16 len) or ShortXLUnicodeString (u8 len); BIFF5 is 8-bit."""
    if short:
        cch, off = b[off], off + 1
    else:
        cch, off = struct.unpack_from('<H', b, off)[0], off + 2
    if not biff8:
        return b[off:off + cch].decode('cp1252', 'replace')
    high = b[off] & 1
    off += 1
    return b[off:off + cch * (2 if high else 1)].decode('utf-16-le' if high else 'cp1252', 'replace')


def _rk(v):
    if v & 2:
        n = v >> 2
        if n & 0x20000000:
            n -= 0x40000000
        n = float(n)
    else:
        n = struct.unpack('<d', b'\0\0\0\0' + struct.pack('<I', v & 0xFFFFFFFC))[0]
    return n / 100.0 if v & 1 else n


def read_xls(data):
    wb = _cfb_stream(data)
    recs, pos = [], 0
    while pos + 4 <= len(wb):
        rid, ln = struct.unpack_from('<HH', wb, pos)
        recs.append((pos, rid, wb[pos + 4:pos + 4 + ln]))
        pos += 4 + ln
    by_pos = {p: k for k, (p, _, _) in enumerate(recs)}

    biff8, sst, sheets, fmts, xf_fmt, date1904 = True, [], [], {}, [], False
    k = 0
    while k < len(recs):
        _, rid, d = recs[k]
        if rid == 0x0809 and k == 0:
            biff8 = struct.unpack_from('<H', d, 0)[0] >= 0x0600
        elif rid == 0x0085:  # BOUNDSHEET
            off, typ = struct.unpack_from('<I', d, 0)[0], d[5]
            if typ == 0:
                sheets.append((_xl_string(d, 6, biff8, short=True), off))
        elif rid == 0x00FC:  # SST (+ CONTINUE records)
            segs = [d]
            while k + 1 < len(recs) and recs[k + 1][1] == 0x003C:
                k += 1
                segs.append(recs[k][2])
            sst = _parse_sst(segs)
        elif rid == 0x041E:  # FORMAT
            try:
                fmts[struct.unpack_from('<H', d, 0)[0]] = _xl_string(d, 2, biff8, short=not biff8)
            except (struct.error, IndexError):
                pass
        elif rid == 0x00E0:  # XF, in order
            xf_fmt.append(struct.unpack_from('<H', d, 2)[0])
        elif rid == 0x0022:  # DATEMODE
            date1904 = struct.unpack_from('<H', d, 0)[0] == 1
        elif rid == 0x000A:  # EOF of the globals substream
            break
        k += 1
    date_xf = {i for i, f in enumerate(xf_fmt) if f in _BUILTIN_DATE_FMTS or (f in fmts and _is_date_code(fmts[f]))}

    def num(xf, v):
        return _serial_to_iso(v, date1904) if xf in date_xf else v

    out = []
    for name, off in sheets:
        k = by_pos.get(off)
        if k is None:
            continue
        cells, pending = {}, None
        k += 1
        while k < len(recs):
            _, rid, d = recs[k]
            k += 1
            try:
                if rid == 0x000A:
                    break
                if rid == 0x00FD:  # LABELSST
                    r, c, _, i = struct.unpack_from('<HHHI', d, 0)
                    cells[(r, c)] = sst[i] if i < len(sst) else None
                elif rid in (0x0204, 0x00D6):  # LABEL / RSTRING
                    r, c = struct.unpack_from('<HH', d, 0)
                    cells[(r, c)] = _xl_string(d, 6, biff8)
                elif rid == 0x0203:  # NUMBER
                    r, c, xf, v = struct.unpack_from('<HHHd', d, 0)
                    cells[(r, c)] = num(xf, v)
                elif rid == 0x027E:  # RK
                    r, c, xf, v = struct.unpack_from('<HHHI', d, 0)
                    cells[(r, c)] = num(xf, _rk(v))
                elif rid == 0x00BD:  # MULRK
                    r, c0 = struct.unpack_from('<HH', d, 0)
                    for j in range((len(d) - 6) // 6):
                        xf, v = struct.unpack_from('<HI', d, 4 + 6 * j)
                        cells[(r, c0 + j)] = num(xf, _rk(v))
                elif rid == 0x0006:  # FORMULA: cached result
                    r, c, xf = struct.unpack_from('<HHH', d, 0)
                    res = d[6:14]
                    if res[6:8] == b'\xff\xff':
                        pending = (r, c) if res[0] == 0 else None
                    else:
                        cells[(r, c)] = num(xf, struct.unpack('<d', res)[0])
                elif rid == 0x0207 and pending:  # STRING (result of the formula above)
                    cells[pending] = _xl_string(d, 0, biff8)
                    pending = None
            except (struct.error, IndexError):
                continue
        rows = {}
        for (r, c), v in cells.items():
            if v is not None and v != '':
                rows.setdefault(r, {})[c] = v
        grid = []
        for r in sorted(rows):
            row = [None] * (max(rows[r]) + 1)
            for c, v in rows[r].items():
                row[c] = v
            grid.append(row)
        out.append((name, grid))
    return out


# ========================================================== dispatch ========
def read_workbook(data, name='', member=None):
    """[(sheet_name, rows)] for an xlsx, xls, or a zip of those (members are
    prefixed 'member.xlsx::sheet'; `member` is a regex to read only some)."""
    if data[:8] == _CFB_SIG:
        return read_xls(data)
    if data[:2] == b'PK':
        z = zipfile.ZipFile(io.BytesIO(data))
        if 'xl/workbook.xml' in z.namelist():
            return read_xlsx(data)
        out = []
        for m in z.namelist():
            if member and not re.search(member, m.rsplit('/', 1)[-1], re.I):
                continue
            if re.search(r'\.(xlsx|xlsm|xls)$', m, re.I) and not m.startswith('__MACOSX'):
                try:
                    for sname, rows in read_workbook(z.read(m), m):
                        out.append((m.rsplit('/', 1)[-1] + '::' + sname, rows))
                except Exception:  # one bad member should not sink the archive
                    continue
        return out
    raise ValueError('unsupported file type (%r)' % data[:8])


# ================================================ SEBI portfolio parser =====
ISIN_RE = re.compile(r'^[A-Z]{2}[A-Z0-9]{9}[0-9]$')
_MON = {m: i + 1 for i, m in enumerate(['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'])}


def _t(v):
    if v is None:
        return ''
    if isinstance(v, float):
        return ('%d' % v) if v.is_integer() else ('%g' % v)
    return str(v)


def _num(v):
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v or '').strip().replace(',', '').replace('%', '')
    neg = s.startswith('(') and s.endswith(')')
    s = s.strip('()').strip()
    try:
        f = float(s)
        return -f if neg else f
    except ValueError:
        return None


def is_equity_isin(isin):
    """Indian equity: IN + E|9 (9 = partly paid) + issuer + security type 01."""
    return bool(re.match(r'^IN[E9][A-Z0-9]{4}01[A-Z0-9]{2}[0-9]$', isin))


_FUND_UNIT = re.compile(
    r'\b(etfs?|funds?|trust|index|reit|ucits|sicav|gif|isf|treasury|bonds?|notes?|portfolio|acc|dist)\b|'
    r'\binvestments?\s+inc\b|\b(usd|eur|gbp|jpy)\s+class\b|\bclass\s+[a-z]?\d+\b|\bequity\s+(usd|eur|gbp)\b', re.I)


def _foreign_share(name, section):
    """A non-Indian ISIN counts as a company's shares only inside an equity/foreign
    section, and not when it is a fund unit (Schroder ISF ... Class X1 Acc, HSBC GIF
    ..., '... USD Class C Shares', a US 'Portfolio') or a bond."""
    return bool(re.search(r'equit|share|foreign|overseas|international', section)
                and not re.search(r'mutual\s+fund|units\s+of|fund\s+units|investment\s+funds?', section)
                and not _FUND_UNIT.search(name))


def _hdr_cols(texts):
    """texts: {col: lowercased header text}. Returns column map if this looks
    like a SEBI portfolio header row (has ISIN and a % of net assets column)."""
    isin = next((c for c, t in texts.items() if re.fullmatch(r'\s*isin(\s*(code|no\.?|number))?\s*', t)), None)
    if isin is None:
        return None
    pct = None
    for c, t in texts.items():
        if re.search(r'yield|ytm|coupon|rating|yield to', t):
            continue
        if (re.search(r'(%|percent|perc\b|pct|% ?age)', t) and re.search(r'nav|net\s*asset|aum|total', t)) \
                or t.strip() in ('%', '% age', '%age', 'percentage', '% to'):
            pct = c
            break
    if pct is None:
        return None
    name = next((c for c, t in sorted(texts.items())
                 if c not in (isin, pct) and re.search(r'name|instrument|issuer|security|company|particular|description|scrip', t)), None)
    mv = next((c for c, t in texts.items() if c not in (isin, pct) and re.search(r'market|fair\s*value|value', t)), None)
    return {'isin': isin, 'pct': pct, 'name': name, 'mv': mv}


def _header_at(rows, i):
    """Header detection on row i, also trying row i merged with row i+1
    (some AMCs split '% to' / 'NAV' across two rows)."""
    def texts(r):
        return {c: _t(v).strip().lower() for c, v in enumerate(r) if isinstance(v, str) and v.strip()}
    a = texts(rows[i])
    if not any(re.fullmatch(r'\s*isin(\s*(code|no\.?|number))?\s*', t) for t in a.values()):
        return None  # the ISIN label must be on this row; only the % column may spill below
    cols = _hdr_cols(a)
    if cols is None and i + 1 < len(rows):
        b = texts(rows[i + 1])
        merged = {c: (a.get(c, '') + ' ' + b.get(c, '')).strip() for c in set(a) | set(b)}
        cols = _hdr_cols(merged)
    return cols


def _date_in(text):
    t = text.lower()
    m = re.search(r'(\d{1,2})(?:st|nd|rd|th)?[\s\-/\.,]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s\-/\.,]*(\d{4}|\d{2})\b', t)
    if m:
        d, mo, y = int(m.group(1)), _MON[m.group(2)], int(m.group(3))
    else:
        m = re.search(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s*(\d{4})', t)  # "August 31,2026"
        if m:
            mo, d, y = _MON[m.group(1)], int(m.group(2)), int(m.group(3))
        else:
            m = re.search(r'\b(\d{4})-(\d{2})-(\d{2})\b', t)
            if m:
                y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            else:
                m = re.search(r'\b(\d{1,2})[\-/\.](\d{1,2})[\-/\.](\d{4}|\d{2})\b', t)  # 31-08-2026 or 31-08-26
                if m:
                    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
                else:  # month only ("... FOR AUGUST 2026"): the portfolio is as of month end
                    m = re.search(r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*(\d{4})\b', t)
                    if not m:
                        return None
                    y, mo = int(m.group(2)), _MON[m.group(1)]
                    d = calendar.monthrange(y, mo)[1]
    if y < 100:
        y += 2000
    try:
        return datetime.date(y, mo, d).isoformat()
    except ValueError:
        return None


_STRONG = re.compile(r'as\s+(on|of|at)\b|period\s+ended|month\s+ended|statement|portfolio', re.I)
_NOT_ASOF = re.compile(r'inception|allot|launch|\bnfo\b|maturity|since', re.I)


def _asof(top_rows):
    """Portfolio date from the rows above a header. Each row is read as one line
    so a label and a date in neighbouring cells pair up ('AS ON :' | 2026-08-31);
    inception/allotment rows are ignored; a 'statement as on' row beats a bare
    date; among equals the latest date wins."""
    today = datetime.date.today().isoformat()
    best = None
    for r in top_rows:
        line = ' | '.join(_t(v).strip() for v in r if v is not None and _t(v).strip())
        for seg in line.split('\n'):
            if _NOT_ASOF.search(seg):
                continue
            d = _date_in(seg)
            if d and d <= today:
                cand = (bool(_STRONG.search(seg)), d)
                if best is None or cand > best:
                    best = cand
    return best[1] if best else None


_TITLE_JUNK = [
    r'monthly\s+portfolio\s+(statement|disclosure)?\s*(of|for)?', r'portfolio\s+statement\s+(of|for)?',
    r'statement\s+of\s+portfolio\s*(of|for)?', r'half[\s\-]*yearly.*', r'portfolio\s+(of|for)\b',
    r'name\s+of\s+(the\s+)?scheme\s*[:\-]?', r'scheme\s+name\s*[:\-]?', r'\bscheme\s*[:\-]\s*',
    r'\bas\s+(on|of|at)\b.*$', r'\b(for\s+the\s+)?(month|period|year|quarter)\s+ended\b.*$',
    r'\bfor\s+(the\s+month\s+of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*\d{4}.*$',
    r'\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*\d{4}\s*$',  # "... ETF AUGUST 2026"
]


def _clean_title(s):
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'^[A-Z0-9]{3,8}\s*[-–:]\s*(?=\S+\s+\S+)', '', s)  # "WCFL-THE WEALTH COMPANY FLEXI CAP FUND"
    # the SEBI description, even with nested "(ESG)" or after a dash: "Fund - An Open-Ended ..."
    s = re.sub(r'\s*[-–:,]?\s*\(?\s*\ban?\s+open[\s\-]*ended\b.*$', '', s, flags=re.I)
    for j in _TITLE_JUNK:
        s = re.sub(j, ' ', s, flags=re.I)
    s = re.sub(r'\s+', ' ', s).strip(' :-–,.')
    return s


_NOT_TITLE = re.compile(r'^(sub\s*-?\s*)?total\b|grand\s+total|mutual\s+fund\s+units|units\s+of\s+mutual|'
                        r'investments?\s+in\s+(mutual|units)|net\s+(current\s+)?assets|^scheme\s+code|'
                        r'^\(?\s*an?\s+open[\s\-]*ended|^(direct|regular)\s+plan\b|^idcw\b|\b(growth|dividend)\s+option\b', re.I)
_LETTERHEAD = re.compile(r'investment\s+manager|asset\s+management|trustee|sponsor|registration\s+no|'
                         r'regd\.?\s+office|registered\s+office|\bcin\b|toll\s+free|helpline|e-?mail|website|www\.', re.I)
_TITLE_WORD = r'\b(fund|scheme|etf|fof|plan|portfolio|index|yojna|yojana)\b'


def _lines(cell):
    """Split a cell into logical lines. A long name that wraps inside its cell
    ('Nippon India Nifty 500 Momentum' / '50 Index Fund') is re-joined; separate
    lines packed into one cell (AMC / scheme / description / date) are kept apart."""
    out = []
    for ln in (x.strip() for x in cell.split('\n')):
        if not ln:
            continue
        if out and not re.search(_TITLE_WORD + r'\s*$', out[-1], re.I) and not ln.startswith('(') \
                and not _STRONG.search(ln) and not re.search(r'mutual\s+fund\s*$', out[-1], re.I):
            out[-1] = out[-1] + ' ' + ln
        else:
            out.append(ln)
    return out


def _title_from(texts, loose=False):
    """Scheme name from the text above a header. Prefers a line naming a fund/ETF/FoF/
    plan; `loose` (first block of a sheet) also accepts the first plausible line."""
    best = first = None
    for raw in texts:
        low = raw.lower().strip().strip(' ()[].,:-')
        if re.fullmatch(r'(back\s+to\s+)?index|go\s+to\s+index', low) or _NOT_TITLE.search(low) or _LETTERHEAD.search(low):
            continue  # navigation, totals, labels and letterhead are never the scheme's name
        if re.search(r'mutual\s+fund$|\blimited\b.*\bamc\b|^\s*(sr|isin|name of)', low) and 'scheme' not in low:
            continue
        c = _clean_title(raw)
        if len(c.split()) < 2 or not re.search(r'[a-z]', c, re.I):
            continue
        if re.search(_TITLE_WORD, low):
            if re.search(r'\b(fund|etf|fof|plan|yojna|yojana)\b', c, re.I):
                return c
            best = best or c
        elif loose and first is None and not re.search(r'\d{4}', c):
            first = c
    return best or first


def parse_portfolios(rows, sheet_name=''):
    headers = []
    for i in range(len(rows)):
        cols = _header_at(rows, i)
        if cols and (not headers or i > headers[-1][0] + 1):
            headers.append((i, cols))
    out, prev_end = [], 0
    for h, (hi, cols) in enumerate(headers):
        end = headers[h + 1][0] if h + 1 < len(headers) else len(rows)
        top = rows[prev_end:hi]
        # one AMC packs name, description and date into a single multi-line cell
        texts = [ln for r in top for v in r if isinstance(v, str) for ln in _lines(v)]
        asof = _asof(top)
        found = _title_from(texts, loose=not out)
        # A header repeated with no new scheme name above it (some AMCs restate the
        # column header per section) continues the previous block.
        cont = out[-1] if (out and not found) else None
        title = cont['title'] if cont else (found or _clean_title(sheet_name))
        asof = asof or (cont['asof'] if cont else None)

        agg, order, major, sub, last_isin_row, any_isin_pcts, scale_hint = {}, [], '', '', hi, [], None
        main_end = max(c for c in cols.values() if c is not None) + 1  # ignore side tables to the right
        for ri in range(hi + 1, end):
            r = rows[ri]
            cell = lambda c: (r[c] if c is not None and c < len(r) else None)  # noqa: E731
            isin = _t(cell(cols['isin'])).strip().upper()
            if not ISIN_RE.match(isin):
                rm = r[:main_end]
                label = next((_t(v) for v in rm if isinstance(v, str) and v.strip()), '')
                if label and not any(isinstance(v, float) for v in rm):
                    # "(a) Listed / awaiting listing" is a sub-label under a heading such as
                    # "Equity & Equity related Foreign Investments"; keep the heading.
                    if re.match(r'\s*\(?([a-h]|[ivx]{1,4})\)|\s*([a-h]|[ivx]{1,4})\.\s|\s*sub\s*-?\s*total|\s*total\b', label, re.I):
                        sub = label.lower()
                    else:
                        major, sub = label.lower(), ''
                elif scale_hint is None and re.search(r'grand\s*total|^\s*(total\s+)?net\s+assets', label, re.I):
                    tv = _num(cell(cols['pct']))  # the 100% line says which units the column uses
                    if tv is not None:
                        scale_hint = 100.0 if abs(tv - 1) < 0.05 else (1.0 if abs(tv - 100) < 5 else None)
                continue
            pct = _num(cell(cols['pct']))
            if pct is None:
                continue
            last_isin_row = ri
            any_isin_pcts.append(pct)
            section = major + ' / ' + sub
            if re.search(r'deriv|future|option|short', section) or pct <= 0:
                continue
            nm = _t(cell(cols['name'])).strip() if cols['name'] is not None else ''
            if not nm:  # fall back to the longest text cell left of the ISIN column
                nm = max((_t(v) for v in r[:cols['isin']] if isinstance(v, str)), key=len, default='')
            equity = is_equity_isin(isin) or (not isin.startswith('IN') and _foreign_share(nm, section))
            if not equity:
                continue
            if isin not in agg:
                agg[isin] = [nm, 0.0]
                order.append(isin)
            agg[isin][1] += pct
        prev_end = last_isin_row + 1
        if not any_isin_pcts:
            continue
        # Units: some AMCs write 0.0923 for 9.23%. A continuation keeps its scheme's
        # units (a short debt section can total under 1.6% and look fractional).
        if cont is not None:
            scale = cont['_scale']
        elif scale_hint:
            scale = scale_hint
        else:
            pos = [p for p in any_isin_pcts if p > 0]
            scale = 100.0 if (max(pos, default=0) <= 1.0 and sum(pos) <= 1.6) else 1.0
        eq = [(i, agg[i][0], round(agg[i][1] * scale, 4)) for i in order]
        if cont is not None:
            merged = {i: [n, p] for i, n, p in cont['equity']}
            for i, n, p in eq:
                merged.setdefault(i, [n, 0.0])[1] += p
            cont['equity'] = sorted(((i, v[0], round(v[1], 4)) for i, v in merged.items()), key=lambda x: -x[2])
            cont['equity_pct'] = round(sum(x[2] for x in cont['equity']), 2)
            cont['rows'] += len(any_isin_pcts)
            continue
        eq.sort(key=lambda x: -x[2])
        out.append({'title': title, 'asof': asof, 'equity': eq, '_scale': scale,
                    'equity_pct': round(sum(x[2] for x in eq), 2), 'rows': len(any_isin_pcts)})
    return out
