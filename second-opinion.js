/* ============================================================
   PORTFOLIO SECOND OPINION (CAS X-ray)
   Everything here runs on the visitor's device. The statement is read with the
   self-hosted pdf.js in /vendor and is NEVER uploaded or transmitted. The only
   network call anywhere is the optional Web3Forms lead submission at the end,
   and it carries the portfolio summary only if the visitor ticks the box.

   Build status: the pdf.js pipeline (load, password, line-grouped text
   extraction), manual fallback, lead capture and print are wired. parseCAS()
   and the analysis/report are built against real statements (see build order).
   ============================================================ */
(function () {
  'use strict';
  // Without the reader (an old browser, a blocked script) statements cannot be read, but
  // manual entry and the sample report still work, so the page carries on without it.
  var READER = typeof pdfjsLib !== 'undefined';
  if (READER) pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';

  var DEV = /[?&]dev\b/.test(location.search); // dev-only helpers, never linked

  // ---- DOM ----
  var el = function (id) { return document.getElementById(id); };
  var stages = { upload: el('soUpload'), manual: el('soManual'), report: el('soReport') };
  var fileInput = el('soFile');
  var drop = el('soDrop');
  var pass = el('soPass'), passInput = el('soPassInput'), passBtn = el('soPassBtn'), passError = el('soPassError');
  var status = el('soStatus'), statusText = el('soStatusText');
  var currentFile = null;
  var lastSummary = null; // {text, ...} used to fill the lead form when consented

  function show(stage, target) {
    Object.keys(stages).forEach(function (k) { if (stages[k]) stages[k].hidden = (k !== stage); });
    var to = target || document.getElementById('so-tool');
    window.scrollTo({ top: to.getBoundingClientRect().top + window.pageYOffset - 80, behavior: 'smooth' });
  }
  function setStatus(msg) { if (msg) { statusText.textContent = msg; status.hidden = false; status.querySelector('.so-spinner').style.display = ''; } else { status.hidden = true; } }

  // ---- File intake ----
  if (drop) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-drag'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-drag'); });
    });
    drop.addEventListener('drop', function (e) {
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }
  if (fileInput) fileInput.addEventListener('change', function () { if (fileInput.files[0]) handleFile(fileInput.files[0]); });
  // A PDF dropped just outside the box would otherwise open in the browser and lose the
  // page, so catch drops anywhere and read them while the upload step is showing.
  ['dragover', 'drop'].forEach(function (ev) {
    window.addEventListener(ev, function (e) {
      var dt = e.dataTransfer;
      if (!dt || [].indexOf.call(dt.types || [], 'Files') < 0) return;
      e.preventDefault();
      if (ev === 'drop' && !(drop && drop.contains(e.target)) && !stages.upload.hidden && dt.files && dt.files[0]) handleFile(dt.files[0]);
    });
  });

  function handleFile(file) {
    if (!file || file.type.indexOf('pdf') === -1 && !/\.pdf$/i.test(file.name)) {
      return fail('That does not look like a PDF. Your statement from NSDL, CDSL, or CAMS arrives as a PDF attachment.');
    }
    if (!READER) {
      return fail('This browser could not load the statement reader. Try a recent Chrome, Safari, Edge, or Firefox, or enter your holdings by hand below.');
    }
    currentFile = file;
    pass.hidden = true; passError.hidden = true; passInput.value = '';
    attempt('');
  }

  // Try to open + extract. On an encryption error, reveal the password prompt.
  function attempt(password) {
    setStatus('Reading your statement on this device...');
    currentFile.arrayBuffer().then(function (buf) {
      return extractText(buf, password);
    }).then(function (text) {
      setStatus(false);
      onText(text);
    }).catch(function (err) {
      setStatus(false);
      if (err && err.name === 'PasswordException') {
        // A PAN typed in lower case is the commonest slip on NSDL and CDSL statements. A CAMS
        // password always carries one of @ # $ * _, so a PAN shaped entry cannot be one.
        if (err.code === 2 && /^[a-z]{5}[0-9]{4}[a-z]$/i.test(password) && password !== password.toUpperCase()) {
          return attempt(password.toUpperCase());
        }
        pass.hidden = false;
        if (err.code === 2) { passError.textContent = 'That password did not work. For NSDL or CDSL, it is the first holder\'s PAN in capitals. For CAMS, it is the password you created on the request form, capitals included.'; passError.hidden = false; }
        passInput.focus();
      } else {
        fail('This file could not be read. If it is a valid CAS, try the manual entry below.');
        if (DEV && err) console.error(err);
      }
    });
  }

  if (passBtn) passBtn.addEventListener('click', function () {
    var p = (passInput.value || '').trim();
    if (!p) { passInput.focus(); return; }
    attempt(p);
  });
  if (passInput) passInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') passBtn.click(); });

  // Extract line-grouped text (top-to-bottom, left-to-right within a line). CAS
  // documents are tabular, so grouping by vertical position preserves rows.
  function extractText(arrayBuffer, password) {
    var opts = { data: arrayBuffer };
    if (password) opts.password = password;
    return pdfjsLib.getDocument(opts).promise.then(function (pdf) {
      var pages = [];
      var seq = Promise.resolve();
      for (var p = 1; p <= pdf.numPages; p++) {
        (function (num) {
          seq = seq.then(function () {
            return pdf.getPage(num).then(function (page) {
              return page.getTextContent().then(function (tc) {
                var rows = {};
                tc.items.forEach(function (it) {
                  if (!it.str || !it.str.trim()) return;
                  var y = Math.round(it.transform[5]);
                  (rows[y] = rows[y] || []).push([it.transform[4], it.str]);
                });
                Object.keys(rows).map(Number).sort(function (a, b) { return b - a; }).forEach(function (y) {
                  var line = rows[y].sort(function (a, b) { return a[0] - b[0]; })
                    .map(function (x) { return x[1]; }).join(' ').replace(/\s+/g, ' ').trim();
                  if (line) pages.push(line);
                });
              });
            });
          });
        })(p);
      }
      return seq.then(function () { return pages.join('\n'); });
    });
  }

  function onText(text) {
    if (DEV) { dumpText(text); return; }
    var parsed = parseCAS(text);
    if (!parsed || !parsed.holdings || !parsed.holdings.length) { openManual(true); return; }
    analyze(parsed);
  }

  function fail(msg) { setStatus(false); if (msg) { statusText.textContent = msg; status.hidden = false; status.querySelector('.so-spinner').style.display = 'none'; } }

  // ---- Parser (built against real CAMS/KFintech and NSDL/CDSL statements) ----
  // Returns { source, holdings: [{isin, name, units, value, cost, ...}], ... }
  // or null when the format is not recognised (triggers the manual fallback).
  function num(s) { if (s == null) return null; var v = parseFloat(String(s).replace(/,/g, '')); return isNaN(v) ? null : v; }

  // Route to the right parser. Detection is on document markers, not filename.
  function parseCAS(text) {
    var t = text || '';
    var isNSDL = /National Securities Depository|NSDL|Depository Limited|PORTFOLIO COMPOSITION|Central Depository Services|HOLDING STATEMENT AS ON/i.test(t) && /\bIN[EF][0-9A-Z]{9}\b/.test(t);
    var isCAMS = /ISIN\s*:?\s*IN[EF]/i.test(t) && /(Folio No|CAMS|KFINTECH|Consolidated Account Statement)/i.test(t);
    var out = null;
    if (isCAMS) out = parseCAMS(t);
    if ((!out || !out.holdings.length) && isNSDL) out = parseNSDL(t);
    if (!out || !out.holdings.length) { // last resort, try both
      var c = parseCAMS(t); if (c.holdings.length) return c;
      var n = parseNSDL(t); if (n.holdings.length) return n;
    }
    return out;
  }

  // CAMS / KFintech mutual fund CAS. pdf.js spaces out glyph runs, so the ISIN
  // renders as "INF 179 KA 1 RQ 7"; reconstruct it. Value labels stay intact.
  function parseCAMS(text) {
    var holdings = [], re = /ISIN\s*:\s*((?:[A-Z0-9]\s*){11}[A-Z0-9])\s*\(/g, m, marks = [];
    while ((m = re.exec(text))) {
      var isin = m[1].replace(/\s+/g, '');
      if (!/^IN[EF][0-9A-Z]{9}$/.test(isin)) continue;
      marks.push({ isin: isin, at: m.index, lineStart: text.lastIndexOf('\n', m.index) + 1 });
    }
    for (var i = 0; i < marks.length; i++) {
      var start = marks[i].lineStart, end = (i + 1 < marks.length ? marks[i + 1].lineStart : text.length);
      var block = text.slice(start, end);
      var nameRaw = text.slice(start, marks[i].at)
        .replace(/\s+/g, ' ')
        .replace(/^\s*[A-Z0-9]+(?:\s[A-Z0-9]+)*\s-\s/, '')       // strip spaced scheme code prefix
        .replace(/\(\s*Non\s*-?\s*Demat\s*\)\s*-?\s*$/i, '')
        .trim();
      var f = function (rx) { var mm = block.match(rx); return mm ? num(mm[1]) : null; };
      // The "Folio No" header sits just above its scheme line, so take the nearest one
      // before this scheme (the block itself runs on into the next scheme's header).
      var before = text.slice(i ? marks[i - 1].at : 0, marks[i].at), fm, folio = null;
      var frx = /Folio No\s*:?\s*([0-9][0-9\/ ]*)/gi;
      while ((fm = frx.exec(before))) folio = fm[1].trim();
      holdings.push({
        isin: marks[i].isin,
        name: nameRaw,
        value: f(/Market Value on[^:]*:\s*INR\s*([\d,]+\.?\d*)/i),
        cost: f(/Total Cost Value\s*:?\s*([\d,]+\.?\d*)/i),
        units: f(/Closing Unit Balance\s*:?\s*([\d,]+\.?\d*)/i),
        nav: f(/NAV on[^:]*:\s*INR\s*([\d,]+\.?\d*)/i),
        folio: folio,
        plan: /direct/i.test(nameRaw) ? 'direct' : 'regular',
        type: 'mf',
        exitLoadClause: /Exit Load\s*:?\s*1(?:\.00)?%|within\s*(?:1 ?year|365 days)/i.test(block)
      });
    }
    return { source: 'cams', holdings: holdings };
  }

  // NSDL / CDSL demat CAS. The statement opens with a portfolio composition by asset class,
  // then one table per class and account. Tables order their columns differently (the
  // Mutual Fund Folios table ends with cost, value, and unrealised gain, the demat tables
  // with price and value), so each row is read under its own heading and a value is only
  // accepted when it checks out as units x price.
  var NSDL_CLASSES = ['Equities', 'Preference Shares', 'Mutual Funds', 'Mutual Fund Folios',
    'Specialized Investment Fund', 'Alternate Investment Fund', 'Corporate Bonds',
    'Government Securities', 'Sovereign Gold Bonds', 'National Pension System'];
  var NSDL_HEAD = /^(Equities|Preference Shares|Mutual Funds|Mutual Fund Folios|Specialized Investment Funds?|Alternate Investment Funds?|Corporate Bonds|Government Securities|Sovereign Gold Bonds|National Pension System)\s*\(/i;
  var NSDL_ROW = /(?:^|\s)(IN[EF0-9][0-9A-Z]{8}[0-9])\s+(.+)$/; // an ISIN always ends in a numeric check digit
  var NUM_TOKEN = /(?:^|\s)(-?(?:[\d,]*\d\.\d+|\.\d+))(?=\s|$)/;

  // What a security is, from its ISIN first (INF = fund units, IN + digit = government,
  // company ISINs carry a security type code in characters 8 and 9) and its table second.
  function nsdlType(isin, name, section) {
    if (/^INF/.test(isin)) return 'mf';
    if (/^IN[0-9]/.test(isin)) return section === 'Sovereign Gold Bonds' || /\bSGB\b|sovereign gold/i.test(name) ? 'sgb' : 'bond';
    if (section === 'Corporate Bonds' || section === 'Government Securities') return 'bond';
    if (section === 'Sovereign Gold Bonds') return 'sgb';
    var code = isin.slice(7, 9);
    if (code === '01') return 'equity';                                            // equity share
    if (code === '07' || code === '08' || code === '14' || code === '16') return 'bond'; // debentures, bonds, CP, CD
    return 'other';                                                  // REIT/InvIT units, preference shares, warrants
  }

  // value = units x price, within rounding (units come first in every table).
  function isProduct(nums, j, k) {
    return nums[0] > 0 && nums[j] > 0 && k < nums.length && Math.abs(nums[0] * nums[j] - nums[k]) <= Math.max(1, nums[k] * 0.005);
  }
  function unitsTimesPrice(nums, maxK) { // rightmost match up to column maxK
    for (var k = Math.min(maxK, nums.length - 1); k >= 2; k--) {
      for (var j = 1; j < k; j++) if (isProduct(nums, j, k)) return { j: j, k: k };
    }
    return null;
  }

  // NSDL CAS: one region of holdings tables (before "Transactions for the period"), each
  // under an asset class heading. CDSL CAS: per account, transactions come first and the
  // holdings follow under "HOLDING STATEMENT AS ON", with fund folios in a closing
  // "MUTUAL FUND UNITS HELD AS ON" table, so rows only count inside those tables.
  function parseNSDL(text) {
    var holdings = [], comp = {}, skipped = 0;
    var cdsl = !/NSDL Consolidated Account Statement|About NSDL/i.test(text) &&
      /Central Depository Services|HOLDING STATEMENT AS ON|MUTUAL FUND UNITS HELD AS ON/i.test(text);
    NSDL_CLASSES.forEach(function (a) {
      var rx = new RegExp(a + 's?\\s*\\([A-Za-z]{1,3}\\)\\s*\\n?\\s*([\\d,]+\\.\\d+)', 'i');
      var mm = text.match(rx); if (mm) comp[a] = num(mm[1]);
    });
    // NSDL: isolate the holdings region so transaction ISINs are not double counted.
    var hStart = text.search(/PORTFOLIO COMPOSITION|Holdings\s*\n?\s*as on/i);
    var hEnd = text.search(/Transactions\s*\n?\s*for the period/i);
    var region = !cdsl && hStart >= 0 ? text.slice(hStart, hEnd > hStart ? hEnd : undefined) : text;
    var lines = region.split('\n'), section = null, active = !cdsl;
    // Figures are standalone tokens (so "FV RS.2/-" in a name is not one); coupon rates and
    // return percentages are dropped first; CDSL prints ".196" for 0.196.
    var numsIn = function (s) {
      var out = [], m, rx = new RegExp(NUM_TOKEN.source, 'g');
      s = ' ' + s.replace(/\d+(?:\.\d+)?\s*%/g, ' ') + ' ';
      while ((m = rx.exec(s))) out.push(num(m[1]));
      return out;
    };
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim(), hm;
      if (cdsl) {
        if (/STATEMENT OF TRANSACTIONS|DP\s*Name\s*:.*\b(?:BO\s*ID|DPID|DP\s*ID)\s*:/i.test(line)) { active = false; continue; }
        if (/HOLDING STATEMENT/i.test(line) && /AS ON/i.test(line)) { active = true; section = null; continue; }
        if (/MUTUAL FUND UNITS HELD AS ON/i.test(line)) { active = true; section = 'Mutual Fund Folios'; continue; }
        if (!active) continue;
      } else {
        hm = line.match(NSDL_HEAD);
        if (hm) { section = NSDL_CLASSES.filter(function (c) { return hm[1].toLowerCase().indexOf(c.toLowerCase()) === 0; }).pop() || null; continue; }
        if (/Demat Account/i.test(line)) { section = null; continue; } // a new account starts its own tables
      }
      var mm = line.match(NSDL_ROW);
      if (!mm) continue;
      var isin = mm[1], rest = mm[2], nums = numsIn(rest);
      // A wrapped row can leave all its figures on the next line or two; borrow them then only,
      // so a zero-value row never picks up a subtotal from below.
      for (var n = 1; n <= 2 && nums.length < 2 && i + n < lines.length; n++) {
        var next = lines[i + n].trim();
        if (NSDL_ROW.test(next) || NSDL_HEAD.test(next) || /HOLDING STATEMENT|UNITS HELD AS ON|STATEMENT OF TRANSACTIONS/i.test(next)) break;
        nums = nums.concat(numsIn(next));
      }
      if (!nums.length) continue;
      var name = (' ' + rest + ' ').replace(/\d+(?:\.\d+)?\s*%/g, ' ').replace(new RegExp(NUM_TOKEN.source, 'g'), ' ');
      if (section === 'Mutual Fund Folios') name = name.replace(/\b\d+(?:\s*\/\s*\d+)?\b/g, ' '); // folio number
      name = name.replace(/#.*$/, '').replace(/\s+/g, ' ').trim();
      var type = nsdlType(isin, name, section), last = nums.length - 1, fit, h;
      if (section === 'Mutual Fund Folios') {
        // NSDL: units, average cost, total cost, NAV, value, gain. CDSL: units, NAV, invested,
        // value, then TER, commission, gain, return. The value sits within the first five
        // figures either way; without a units x NAV match the row is left out, not guessed at.
        fit = unitsTimesPrice(nums, 4);
        if (!fit) { skipped++; continue; }
        var cost = null;
        for (var a = 1; a + 1 < fit.k; a++) if (isProduct(nums, a, a + 1) && a + 1 !== fit.j) { cost = nums[a + 1]; break; } // average cost x units
        if (cost == null && fit.k - fit.j === 2) cost = nums[fit.k - 1];                                                     // invested, between NAV and value
        h = { units: nums[0], price: nums[fit.j], value: nums[fit.k], cost: cost };
      } else if (last >= 2 && isProduct(nums, last - 1, last)) {
        h = { units: nums[0], price: nums[last - 1], value: nums[last] }; // demat tables end with price, value
      } else if ((fit = unitsTimesPrice(nums, 99))) {
        h = { units: nums[0], price: nums[fit.j], value: nums[fit.k] };
      } else {
        // A zero value (nothing held) lands here, as does a row with no balance printed.
        h = { units: nums[0], price: last > 0 ? nums[last - 1] : null, value: nums[last] };
      }
      h.isin = isin; h.name = name; h.type = type; h.plan = null; h.section = section;
      holdings.push(h);
    }
    return { source: cdsl ? 'cdsl' : 'nsdl', holdings: holdings, assetComposition: comp, skipped: skipped };
  }

  // ============ Reference data (lazy-loaded once, after a parse) ============
  var DATA = null;
  function loadData() {
    if (DATA) return Promise.resolve(DATA);
    // 'no-cache' revalidates with the server each time (a cheap 304 when unchanged),
    // so a returning visitor never analyses against last quarter's fund data.
    return Promise.all([
      fetch('data/schemes.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; }),
      fetch('data/holdings.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
    ]).then(function (a) { DATA = { schemes: a[0] || {}, holdings: prepHoldings(a[1]) }; return DATA; });
  }

  // holdings.json: {s: [[stock_isin, name]], f: [[asof, equity_pct, [[stock_idx, pct]]]], i: {fund_isin: f_idx}}
  function prepHoldings(h) {
    var H = (h && h.i && h.f && h.s) ? h : { s: [], f: [], i: {} };
    H.si = {};
    H.s.forEach(function (s, k) { H.si[s[0]] = k; });
    Object.keys(H.a || {}).forEach(function (isin) { H.si[isin] = H.a[isin]; }); // second share class, same company
    return H;
  }

  // ============ Helpers ============
  function fmtINR(n) { if (n == null || isNaN(n)) return '—'; return '₹' + Math.round(n).toLocaleString('en-IN'); }
  function fmtShort(n) { n = +n || 0; if (n >= 1e7) return '₹' + (n / 1e7).toFixed(2) + ' Cr'; if (n >= 1e5) return '₹' + (n / 1e5).toFixed(2) + ' L'; return fmtINR(n); }
  function pct1(x) { return (Math.round((x || 0) * 10) / 10) + '%'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function normStock(s) { return String(s || '').toUpperCase().replace(/#.*$/, '').replace(/\b(LIMITED|LTD|THE|COMPANY|CO|INDIA)\b/g, '').replace(/[^A-Z0-9]/g, ''); }

  function assetClass(cat, type) {
    if (type === 'equity') return 'Equity';
    if (type === 'bond') return 'Debt';
    if (type === 'sgb') return 'Gold';
    if (type === 'other') return 'Other';
    var c = (cat || '').toLowerCase();
    if (/gold|silver|commodit/.test(c)) return 'Gold';
    if (/overnight|liquid|money market/.test(c)) return 'Cash';
    if (/debt|bond|gilt|duration|credit|\bpsu\b|floater|dynamic bond/.test(c)) return 'Debt';
    if (/hybrid|balanced|arbitrage|asset alloc|multi asset|equity savings/.test(c)) return 'Hybrid';
    if (/equity|elss|index|flexi|large|mid ?cap|small ?cap|multi ?cap|focus|value|contra|dividend yield|sector|thematic|momentum|quality|nifty|sensex/.test(c)) return 'Equity';
    return 'Other';
  }
  var TYPICAL_TER = { Equity: [0.9, 1.9], Hybrid: [0.7, 1.8], Debt: [0.4, 1.0], Cash: [0.2, 0.5], Gold: [0.4, 0.8], Other: [0.6, 1.5] };
  function typicalTER(cls, plan, cat) {
    if (/\betfs?\b|exchange traded/i.test(cat || '')) return 0.2; // ETFs have a single, low expense ratio
    if (/index/i.test(cat || '')) return plan === 'direct' ? 0.25 : 0.6;
    var t = TYPICAL_TER[cls] || TYPICAL_TER.Other; return plan === 'direct' ? t[0] : t[1];
  }
  function monthName(iso) {
    var m = /^(\d{4})-(\d{2})/.exec(iso || '');
    return m ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+m[2] - 1] + ' ' + m[1] : '';
  }
  function titleCase(s) { // only for direct shares no fund holds, so no canonical name exists
    return String(s || '').toLowerCase().replace(/\b[a-z]+/g, function (w, i) {
      return (i && /^(of|and|the)$/.test(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1);
    });
  }
  var GROWTH_ASSUMPTION = 0.11; // illustrative only, labelled in the report

  function analyze(parsed) {
    setStatus('Reading the fund data and building your report...');
    return loadData().then(function (D) {
      setStatus(false);
      var model = buildModel(parsed, D);
      renderReport(model);
      // A sample report is nobody's portfolio, so there is nothing to offer to share.
      var sample = model.source === 'sample';
      lastSummary = sample ? null : { text: model.summaryText };
      if (el('soConsentRow')) el('soConsentRow').hidden = sample;
      if (el('soLeadMsg')) el('soLeadMsg').hidden = true;
      show('report');
    }).catch(function () {
      fail('Something went wrong building the report. Please try again, or use manual entry.');
    });
  }

  // ============ Analysis ============
  // Hedged categories hold shares offset by short futures, so looking through
  // them would overstate what the investor really owns.
  var HEDGED = /arbitrage|balanced advantage|dynamic asset|equity savings/i;
  var ALLOC_ORDER = ['Equity', 'Hybrid', 'Debt', 'Gold', 'Cash', 'Other'];
  var ALLOC_VAR = { Equity: '--c-eq', Hybrid: '--c-hy', Debt: '--c-debt', Gold: '--c-gold', Cash: '--c-cash', Other: '--c-other' };
  var AMC_VARS = ['--c-eq', '--c-hy', '--c-debt', '--c-gold', '--c-cash', '--c-other'];

  function shortName(n) {
    return String(n || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+-\s+(direct|regular)\b.*$/i, '')
      .replace(/\s+fund\s*$/i, '').replace(/\s+/g, ' ').trim();
  }
  function pct2(x) { return (Math.round((x || 0) * 100) / 100).toFixed(2) + '%'; }

  function buildModel(parsed, D) {
    var schemes = D.schemes || {}, H = (D.holdings && D.holdings.si) ? D.holdings : prepHoldings(D.holdings);
    var h = parsed.holdings.map(function (x) {
      var s = x.isin && schemes[x.isin];
      var o = {
        isin: x.isin || null,
        name: s ? s.n : (x.name || x.isin || 'Unnamed holding'),
        amc: s ? s.amc : (x.amc || null),
        cat: s ? s.cat : null,
        plan: (s && s.plan) || x.plan || null,
        ter: (x.ter != null ? x.ter : (s ? s.ter : null)),
        terAlt: s ? s.terAlt : null,
        value: +x.value || 0,
        cost: (x.cost != null ? +x.cost : null),
        units: x.units, folio: x.folio || null,
        type: x.type || 'mf', section: x.section || null, exitLoadClause: !!x.exitLoadClause,
        terEstimate: false, inDataset: !!s
      };
      o.cls = assetClass(o.cat, o.type);
      var fi = o.isin != null ? H.i[o.isin] : null;
      if (o.cls === 'Other' && fi != null && (H.f[fi][1] || 0) >= 65) o.cls = 'Equity'; // equity ETFs filed under "Other ETFs"
      if (o.ter == null && o.type === 'mf') { o.ter = typicalTER(o.cls, o.plan || 'regular', o.cat); o.terEstimate = true; } // shares, bonds, SGBs carry no expense ratio
      return o;
    });
    var cur = h.filter(function (x) { return x.value > 0; });
    var redeemed = h.filter(function (x) { return x.value <= 0; });
    var total = cur.reduce(function (a, x) { return a + x.value; }, 0);
    var m = { empty: cur.length === 0, total: total, redeemed: redeemed.length, tidy: [], exitLoads: [], source: parsed.source || 'manual' };
    if (m.empty) { m.summaryText = ''; return m; }
    var isFund = function (x) { return x.type === 'mf'; };

    // ---------- Where the money is ----------
    var amcSet = {}, alloc = {};
    cur.forEach(function (x) {
      if (x.amc) amcSet[x.amc] = (amcSet[x.amc] || 0) + x.value;
      alloc[x.cls] = (alloc[x.cls] || 0) + x.value;
    });
    m.nFunds = cur.filter(isFund).length;
    m.nEquities = cur.filter(function (x) { return x.type === 'equity'; }).length;
    m.nOtherSec = cur.length - m.nFunds - m.nEquities; // bonds, government securities, SGBs, REITs
    m.nHold = cur.length;

    // What the statement holds that this read could not itemise (NPS, AIFs, a table in an
    // unfamiliar layout), measured against the statement's own asset class totals.
    m.unread = [];
    var comp = parsed.assetComposition || {}, readBy = {};
    cur.forEach(function (x) { if (x.section) readBy[x.section] = (readBy[x.section] || 0) + x.value; });
    Object.keys(comp).forEach(function (k) {
      var gap = (comp[k] || 0) - (readBy[k] || 0);
      if (gap > Math.max(1000, 0.01 * (comp[k] || 0))) m.unread.push({ k: k, v: gap });
    });
    m.nAMC = Object.keys(amcSet).length;
    m.nDirect = cur.filter(function (x) { return isFund(x) && x.plan === 'direct'; }).length;
    m.nRegular = cur.filter(function (x) { return isFund(x) && x.plan === 'regular'; }).length;
    m.alloc = ALLOC_ORDER.filter(function (k) { return alloc[k] > 0; }).map(function (k) { return { k: k, v: alloc[k], p: 100 * alloc[k] / total }; });
    m.equityValue = alloc.Equity || 0;

    // ---------- What you actually own (see-through) ----------
    var seeFunds = cur.filter(function (x) {
      return isFund(x) && !/^(Debt|Cash|Gold)$/.test(x.cls) && !HEDGED.test(x.cat || '') &&
        (x.cls === 'Equity' || x.cls === 'Hybrid' || (x.isin != null && H.i[x.isin] != null));
    });
    var equityFunds = seeFunds.filter(function (x) { return x.cls === 'Equity'; });
    var stockExp = {}, covered = [], uncovered = [], asofs = {}, itemised = 0, coveredVal = 0;
    function addStock(key, name, value, vehicle) {
      if (!key) return;
      if (!stockExp[key]) stockExp[key] = { name: name, value: 0, via: {} };
      stockExp[key].value += value; stockExp[key].via[vehicle] = 1;
    }
    seeFunds.forEach(function (f) {
      var fi = f.isin != null ? H.i[f.isin] : null;
      if (fi == null) { if (f.cls === 'Equity') uncovered.push(f.name); return; }
      var F = H.f[fi], w = 0;
      covered.push(f);
      if (F[0]) asofs[F[0]] = (asofs[F[0]] || 0) + f.value;
      F[2].forEach(function (p) { var s = H.s[p[0]]; w += p[1]; addStock(s[0], s[1], f.value * p[1] / 100, f.name); });
      itemised += f.value * w / 100; coveredVal += f.value;
    });
    var directEq = cur.filter(function (x) { return x.type === 'equity'; });
    directEq.forEach(function (e) {
      var k = e.isin != null ? H.si[e.isin] : null;
      addStock(k != null ? H.s[k][0] : (e.isin || normStock(e.name)),
        k != null ? H.s[k][1] : titleCase(String(e.name || '').replace(/\s+(limited|ltd\.?)\s*$/i, '')), e.value, 'Direct');
    });
    var stocks = Object.keys(stockExp).map(function (k) { return stockExp[k]; }).sort(function (a, b) { return b.value - a.value; });
    var viaFundsOnly = stocks.filter(function (s) { return !s.via.Direct; }).length;
    var top5 = stocks.slice(0, 5).reduce(function (a, s) { return a + s.value; }, 0);
    m.asof = Object.keys(asofs).sort(function (a, b) { return asofs[b] - asofs[a]; })[0] || null;
    if (stocks.length && stocks[0].value > 0) {
      var funds = covered.slice().sort(function (a, b) { return b.value - a.value; }).map(function (f) { return f.name; });
      // The headline features the most repeated company among those charted
      // (ties go to the bigger exposure), since repetition is the point.
      var nVia = function (s) { return Object.keys(s.via).filter(function (v) { return v !== 'Direct'; }).length; };
      var top = stocks.slice(0, 8).filter(function (s) { return Object.keys(s.via).length > 1; })
        .sort(function (a, b) { return nVia(b) - nVia(a) || b.value - a.value; })[0] || null;
      m.overlap = {
        stocks: stocks.slice(0, 8).map(function (s) { return { name: s.name, value: s.value, p: 100 * s.value / total, via: s.via }; }),
        funds: funds,
        hasDirect: directEq.length > 0,
        itemisedPct: coveredVal > 0 ? Math.round(100 * itemised / coveredVal) : null,
        uncovered: uncovered, equityFunds: equityFunds.length,
        top: top && covered.length >= 2 ? { name: top.name, viaFunds: Object.keys(top.via).filter(function (v) { return v !== 'Direct'; }).length, direct: !!top.via.Direct } : null,
        topName: stocks[0].name,
        topEqPct: m.equityValue > 0 ? 100 * stocks[0].value / m.equityValue : null,
        nDirectCos: stocks.length - viaFundsOnly, nFundCos: viaFundsOnly,
        top5Pct: stocks.length > 5 ? 100 * top5 / total : null
      };
    } else if (equityFunds.length >= 2) {
      m.overlap = { blind: true, equityFunds: equityFunds.length };
    }

    // ---------- Doubling up ----------
    // Group by the category tail ("Large Cap Fund"): AMFI mixes "Equity Scheme -"
    // and "Equity Schemes -", which would otherwise split one category in two.
    var catLabel = function (c) { c = (c || 'Uncategorised').trim(); var i = c.lastIndexOf('- '); return (i >= 0 ? c.slice(i + 2) : c).trim(); };
    var byCat = {};
    cur.filter(isFund).forEach(function (x) { var c = catLabel(x.cat); (byCat[c] = byCat[c] || []).push(x); });
    var amcs = Object.keys(amcSet).map(function (a) { return { name: a, p: 100 * amcSet[a] / total }; }).sort(function (a, b) { return b.p - a.p; });
    m.dup = {
      cats: Object.keys(byCat).filter(function (c) { return byCat[c].length > 1 && c !== 'Uncategorised'; })
        .map(function (c) { return { label: c.replace(/\s+funds?$/i, ''), funds: byCat[c].map(function (x) { return shortName(x.name); }) }; })
        .sort(function (a, b) { return b.funds.length - a.funds.length; }),
      amcs: amcs,
      topAMC: amcs[0] && amcs[0].p >= 30 ? amcs[0] : null
    };

    // ---------- What it costs ----------
    var feeFunds = cur.filter(isFund);
    if (feeFunds.length) {
      var base = feeFunds.reduce(function (a, x) { return a + x.value; }, 0);
      var wTER = base > 0 ? feeFunds.reduce(function (a, x) { return a + x.value * x.ter; }, 0) / base : 0;
      var regs = feeFunds.filter(function (x) { return x.plan === 'regular'; });
      var regVal = regs.reduce(function (a, x) { return a + x.value; }, 0);
      m.cost = {
        base: base, wTER: wTER, yr: base * wTER / 100,
        tenYr: base * Math.pow(1 + GROWTH_ASSUMPTION, 10) - base * Math.pow(1 + GROWTH_ASSUMPTION - wTER / 100, 10),
        perFund: feeFunds.map(function (x) {
          return { name: shortName(x.name), yr: x.value * x.ter / 100, regular: x.plan === 'regular',
            extra: x.plan === 'regular' && x.terAlt != null ? x.value * Math.max(0, x.ter - x.terAlt) / 100 : 0 };
        }).sort(function (a, b) { return b.yr - a.yr; }),
        regVal: regVal, regShare: 100 * regVal / total,
        regExtra: regs.reduce(function (a, x) { return a + (x.terAlt != null ? x.value * Math.max(0, x.ter - x.terAlt) / 100 : 0); }, 0),
        anyEst: feeFunds.some(function (x) { return x.terEstimate; })
      };
    }

    // ---------- Tax ----------
    var withCost = cur.filter(function (x) { return x.cost != null && x.cost > 0 && isFund(x); });
    if (withCost.length) {
      var tc = withCost.reduce(function (a, x) { return a + x.cost; }, 0);
      var tv = withCost.reduce(function (a, x) { return a + x.value; }, 0);
      m.tax = { cost: tc, value: tv, unreal: tv - tc,
        eqUnreal: withCost.filter(function (x) { return x.cls === 'Equity'; }).reduce(function (a, x) { return a + (x.value - x.cost); }, 0) };
    }
    m.exitLoads = cur.filter(function (x) { return x.exitLoadClause; }).map(function (x) { return shortName(x.name); });

    // ---------- Tidy-ups ----------
    // Only mutual fund folios can be closed; a share sold out of a demat account is simply gone.
    var emptyFolios = redeemed.filter(function (x) { return x.type === 'mf' && (m.source === 'cams' || x.section === 'Mutual Fund Folios'); });
    if (emptyFolios.length) m.tidy.push({ icon: 'folder', title: emptyFolios.length === 1 ? '1 empty folio' : emptyFolios.length + ' empty folios',
      detail: emptyFolios.map(function (x) { return shortName(x.name); }).join(', ') + ' ' + (emptyFolios.length === 1 ? 'has' : 'have') + ' no balance. Closing ' + (emptyFolios.length === 1 ? 'it' : 'them') + ' declutters your statement.' });
    var tiny = cur.filter(function (x) { return x.value < 1000; });
    if (tiny.length) m.tidy.push({ icon: 'coin', title: tiny.length === 1 ? '1 tiny holding' : tiny.length + ' tiny holdings',
      detail: tiny.map(function (x) { return shortName(x.name) + ' (' + fmtINR(x.value) + ')'; }).join(', ') + '. Too small to matter, but still on your statement.' });
    var amcFolios = {};
    cur.forEach(function (x) { if (x.amc && x.folio) (amcFolios[x.amc] = amcFolios[x.amc] || {})[x.folio] = 1; });
    Object.keys(amcFolios).forEach(function (a) {
      var n = Object.keys(amcFolios[a]).length;
      if (n > 1) m.tidy.push({ icon: 'merge', title: n + ' folios at ' + a.replace(/\s+mutual\s+fund$/i, ''),
        detail: 'Merging them into one makes statements, nominee updates and tracking simpler.' });
    });

    // ---------- Summary (sent to SELEQT only if the visitor ticks the box) ----------
    var o = m.overlap, c = m.cost;
    m.summaryText = 'Portfolio second opinion summary\n' +
      'Total value: ' + fmtINR(total) + ' across ' + m.nHold + ' holdings (' + m.nFunds + ' funds, ' + m.nEquities + ' direct shares' +
        (m.nOtherSec ? ', ' + m.nOtherSec + ' bonds and other securities' : '') + '), ' + m.nAMC + ' fund houses\n' +
      (m.unread.length ? 'Not itemised: ' + m.unread.map(function (u) { return u.k + ' ' + fmtINR(u.v); }).join(', ') + '\n' : '') +
      'Allocation: ' + m.alloc.map(function (a) { return a.k + ' ' + pct1(a.p); }).join(', ') + '\n' +
      (o && o.top ? 'Top overlap: ' + o.top.name + ' in ' + o.top.viaFunds + ' of ' + o.funds.length + ' funds (' + pct1(o.stocks[0].p) + ' of portfolio)\n' : '') +
      (c ? 'Fund costs: ' + fmtINR(c.yr) + ' a year (avg ' + pct2(c.wTER) + '); regular plans ' + pct1(c.regShare) + ' of value, ' + fmtINR(c.regExtra) + ' a year extra\n' : '') +
      (m.tax ? 'Unrealised gain: ' + fmtINR(m.tax.unreal) + '\n' : '') +
      (m.tidy.length ? 'Tidy-ups: ' + m.tidy.map(function (t) { return t.title; }).join('; ') + '\n' : '') +
      'Source: ' + m.source + ' CAS';
    return m;
  }

  // ============ Report (visual) ============
  var I = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var ICON = {
    overlap: I('<circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/>'),
    rupee: I('<path d="M7 5h10M7 9h10M9 5c4 0 6 1.6 6 4s-2 4-6 4H7l7 6"/>'),
    tax: I('<path d="M5 19L19 5"/><circle cx="7" cy="7" r="2.2"/><circle cx="17" cy="17" r="2.2"/>'),
    check: I('<path d="M4 12.5l5 5L20 6.5"/>'),
    alert: I('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'),
    info: I('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
    folder: I('<path d="M3 7h6l2 2h10v10H3z"/>'),
    coin: I('<circle cx="12" cy="12" r="8"/><path d="M9.5 12h5"/>'),
    merge: I('<path d="M6 4v5a6 6 0 0 0 6 6h6M6 20v-5M14 11l4 4-4 4"/>')
  };

  function sec(id, label, head, inner) {
    return '<section class="so-sec" id="so-sec-' + id + '"><div class="so-sec-label">' + esc(label) + '</div>' +
      (head ? '<h3 class="so-sec-head">' + head + '</h3>' : '') + inner + '</section>';
  }

  function donut(segs, big, small) {
    var SW = 24, r = (180 - SW) / 2, C = 2 * Math.PI * r, off = 0, gap = segs.length > 1 ? 2.5 : 0, arcs = '';
    segs.forEach(function (s) {
      var full = C * s.p / 100, len = Math.max(0.01, full - gap);
      arcs += '<circle cx="90" cy="90" r="' + r + '" fill="none" style="stroke:var(' + s.v + ')" stroke-width="' + SW +
        '" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 90 90)"/>';
      off += full;
    });
    return '<svg class="so-donut" viewBox="0 0 180 180" role="img" aria-label="Asset allocation">' +
      '<circle cx="90" cy="90" r="' + r + '" fill="none" class="so-donut-track" stroke-width="' + SW + '"/>' + arcs +
      '<text x="90" y="92" text-anchor="middle" class="so-donut-num">' + esc(big) + '</text>' +
      '<text x="90" y="114" text-anchor="middle" class="so-donut-sub">' + esc(small) + '</text></svg>';
  }

  function rTiles(m) {
    var t = [], tile = function (id, icon, num, label) {
      return '<a class="so-tile" href="#so-sec-' + id + '"><span class="so-tile-icon">' + icon + '</span><span class="so-tile-num">' + num + '</span><span class="so-tile-label">' + label + '</span></a>';
    };
    var o = m.overlap;
    if (o && o.top) t.push(tile('overlap', ICON.overlap, o.top.viaFunds + ' of ' + o.funds.length, 'funds own ' + esc(o.top.name)));
    else if (o && o.stocks) t.push(tile('overlap', ICON.overlap, pct1(o.stocks[0].p), 'of your money in ' + esc(o.topName)));
    if (m.cost) t.push(tile('cost', ICON.rupee, fmtINR(m.cost.yr), 'a year in fund costs'));
    var fundsOnly = m.nEquities + m.nOtherSec > 0; // gains and costs cover funds only when shares or bonds sit alongside
    if (m.tax) t.push(tile('tax', ICON.tax, fmtShort(Math.abs(m.tax.unreal)), m.tax.unreal >= 0 ? (fundsOnly ? 'of fund gains not yet taxed' : 'of gains not yet taxed') : (fundsOnly ? 'funds below what you invested' : 'below what you invested')));
    if (m.tidy.length) t.push(tile('tidy', ICON.check, String(m.tidy.length), m.tidy.length === 1 ? 'quick tidy-up' : 'quick tidy-ups'));
    return t.length ? '<div class="so-tiles">' + t.join('') + '</div>' : '';
  }

  function rShape(m) {
    var legend = m.alloc.map(function (a) {
      return '<li><span class="so-key" style="background:var(' + ALLOC_VAR[a.k] + ')"></span><span class="so-key-name">' + a.k +
        '</span><span class="so-key-val">' + pct1(a.p) + '</span><span class="so-key-amt">' + fmtShort(a.v) + '</span></li>';
    }).join('');
    var fact = function (n, l) { return '<div><div class="so-fact-num">' + n + '</div><div class="so-fact-label">' + l + '</div></div>'; };
    var facts = fact(m.nHold, m.nHold === 1 ? 'holding' : 'holdings');
    if (m.nAMC) facts += fact(m.nAMC, m.nAMC === 1 ? 'fund house' : 'fund houses');
    if (m.nEquities) facts += fact(m.nEquities, m.nEquities === 1 ? 'company held directly' : 'companies held directly');
    if (m.nDirect + m.nRegular) facts += fact(m.nDirect + '<span class="so-fact-sep">/</span>' + m.nRegular, 'direct / regular plans');
    return sec('shape', 'Where your money is', null,
      '<div class="so-shape"><div class="so-donut-wrap">' + donut(m.alloc.map(function (a) { return { p: a.p, v: ALLOC_VAR[a.k] }; }), fmtShort(m.total), 'total value') +
      '</div><div class="so-shape-side"><ul class="so-legend">' + legend + '</ul><div class="so-facts">' + facts + '</div></div></div>');
  }

  function rOverlap(m) {
    var o = m.overlap;
    if (!o) return '';
    if (o.blind) return sec('overlap', 'What you actually own', 'Your ' + o.equityFunds + ' equity funds probably overlap',
      '<p class="so-lede">We cannot see inside these particular funds yet. A review would map the companies they share.</p>');
    var max = o.stocks[0].value, withFunds = o.funds.length > 0; // dots only mean something when funds are in the chart
    var rows = o.stocks.map(function (s) {
      var dots = !withFunds ? '' : o.funds.map(function (f) {
        var on = !!s.via[f];
        return '<i class="so-dot' + (on ? ' is-on' : '') + '" title="' + esc(shortName(f)) + (on ? ' owns it' : ' does not') + '"></i>';
      }).join('') + (s.via.Direct ? '<i class="so-dot is-you" title="Your own shares"></i>' : '');
      return '<li class="so-own-row"><div class="so-own-top"><span class="so-own-name">' + esc(s.name) + '</span><span class="so-own-pct">' + pct1(s.p) + '</span></div>' +
        '<div class="so-own-bar"><span style="width:' + (100 * s.value / max).toFixed(1) + '%"></span></div>' +
        '<div class="so-own-meta"><span class="so-own-amt">' + fmtShort(s.value) + '</span><span class="so-dots">' + dots + '</span></div></li>';
    }).join('');
    var head = o.top ? esc(o.top.name) + ' is in <em>' + o.top.viaFunds + ' of your ' + o.funds.length + ' funds</em>' + (o.top.direct ? ', plus your own shares' : '')
      : 'Your largest company exposures';
    var key = '<div class="so-dot-key">' + (withFunds ? '<span><i class="so-dot is-on"></i>fund owns it</span><span><i class="so-dot"></i>fund does not</span>' +
      (o.hasDirect ? '<span><i class="so-dot is-you"></i>your own shares</span>' : '') : '') + '<span class="so-dot-key-hint">% of your whole portfolio</span></div>';
    // How many companies sit underneath it all, and how much the biggest five carry.
    var cos = function (n) { return n + (n === 1 ? ' company' : ' companies'); }, count = '';
    if (o.nDirectCos && o.nFundCos) count = 'You hold ' + cos(o.nDirectCos) + ' directly, and at least ' + o.nFundCos + ' more through your funds.';
    else if (o.nDirectCos) count = 'You hold ' + cos(o.nDirectCos) + ' directly.';
    else if (o.nFundCos) count = 'Through your funds you own at least ' + cos(o.nFundCos) + '.';
    if (o.top5Pct != null) count += ' The five largest make up ' + pct1(o.top5Pct) + ' of everything you own.';
    var lede = count ? '<p class="so-lede">' + count + '</p>' : '';
    var warn = o.topEqPct >= 8 ? '<div class="so-flag">' + ICON.alert + '<span><strong>' + esc(o.topName) + '</strong> is ' + pct1(o.topEqPct) +
      ' of your equity. A stumble there moves the whole portfolio.</span></div>' : '';
    return sec('overlap', 'What you actually own', head, key + '<ol class="so-own">' + rows + '</ol>' + lede + warn);
  }

  function rDup(m) {
    var d = m.dup;
    if (!d || (!d.cats.length && !d.topAMC)) return '';
    var inner = '';
    if (d.cats.length) {
      inner += '<div class="so-dups">' + d.cats.map(function (c) {
        return '<div class="so-dup"><div class="so-dup-head"><span class="so-dup-count">' + c.funds.length + '</span><span class="so-dup-cat">' + esc(c.label) +
          ' funds</span></div><div class="so-pills">' + c.funds.map(function (f) { return '<span class="so-pill">' + esc(f) + '</span>'; }).join('') + '</div></div>';
      }).join('') + '</div><p class="so-lede">Funds in one category buy similar things. A second or third rarely adds more than another fee.</p>';
    }
    if (d.topAMC) {
      var segs = d.amcs.slice(0, 5).map(function (a, i) { return '<span style="width:' + a.p.toFixed(2) + '%;background:var(' + AMC_VARS[i] + ')" title="' + esc(a.name) + ' ' + pct1(a.p) + '"></span>'; }).join('');
      inner += '<div class="so-amc"><div class="so-amc-bar">' + segs + '</div><p class="so-amc-cap"><strong>' + esc(d.topAMC.name) + '</strong> manages ' + pct1(d.topAMC.p) +
        ' of your money. That ties a big part of your outcome to one investment team.</p></div>';
    }
    var head = d.cats.length ? d.cats.map(function (c) { return c.funds.length + ' ' + esc(c.label.toLowerCase()); }).join(' and ') + ' funds' : 'One fund house runs a big share';
    return sec('dup', 'Doubling up', head, inner);
  }

  function rCost(m) {
    var c = m.cost;
    if (!c) return '';
    var max = c.perFund.length ? c.perFund[0].yr : 1, shown = c.perFund.slice(0, 6);
    var rows = shown.map(function (f) {
      return '<li class="so-cost-row"><span class="so-cost-name">' + esc(f.name) + (f.regular ? '<span class="so-tag">Regular</span>' : '') + '</span>' +
        '<span class="so-cost-bar"><span class="so-cost-fill" style="width:' + (100 * (f.yr - f.extra) / max).toFixed(1) + '%"></span>' +
        (f.extra ? '<span class="so-cost-extra" style="width:' + (100 * f.extra / max).toFixed(1) + '%"></span>' : '') + '</span>' +
        '<span class="so-cost-amt">' + fmtINR(f.yr) + '</span></li>';
    }).join('');
    var more = c.perFund.length > shown.length ? '<li class="so-cost-more">+ ' + (c.perFund.length - shown.length) + ' smaller</li>' : '';
    var onFunds = m.nEquities + m.nOtherSec > 0 ? ' on your ' + fmtShort(c.base) + ' in funds' : '';
    var big = '<div class="so-bigstats"><div class="so-bigstat"><span class="so-big-num">' + fmtINR(c.yr) + '</span><span class="so-big-label">a year, at an average expense ratio of ' + pct2(c.wTER) + onFunds + '</span></div>' +
      '<div class="so-bigstat is-soft"><span class="so-big-num">' + fmtShort(c.tenYr) + '</span><span class="so-big-label">over 10 years, counting the growth these costs give up</span></div></div>';
    var reg = c.regVal > 0 ? '<div class="so-note-card">' + ICON.info + '<span>' + (c.regExtra > 0 ? '<strong>' + fmtINR(c.regExtra) + ' a year</strong> of this is the extra cost of your regular plans (hatched). ' : '') +
      'Regular plans pay your distributor; direct plans do not. Both are legitimate. The question is whether you can name what your distributor did for you last year.</span></div>' : '';
    return sec('cost', 'What it costs', null, big + '<ol class="so-cost">' + rows + more + '</ol>' + reg);
  }

  function rTax(m) {
    var t = m.tax;
    if (!t && !m.exitLoads.length) return '';
    var inner = '';
    if (t && t.unreal >= 0) {
      var up = t.value > 0 ? 100 * t.unreal / t.value : 0;
      inner += '<div class="so-gain"><div class="so-gain-bar"><span class="so-gain-cost" style="width:' + (100 - up).toFixed(2) + '%"></span><span class="so-gain-up" style="width:' + up.toFixed(2) + '%"></span></div>' +
        '<div class="so-gain-labels"><span><i class="so-key" style="background:var(--c-eq)"></i>Invested ' + fmtShort(t.cost) + '</span><span><i class="so-key" style="background:var(--c-gain)"></i>Gain ' +
        fmtShort(t.unreal) + '</span><span class="so-gain-total">Worth ' + fmtShort(t.value) + ' today</span></div></div>';
    } else if (t) {
      inner += '<p class="so-lede">These holdings are ' + fmtShort(-t.unreal) + ' below what you invested. Losses can offset gains elsewhere, which is worth planning around.</p>';
    }
    if (t && t.eqUnreal > 0) inner += '<div class="so-note-card is-gold">' + ICON.tax + '<span><strong>' + fmtShort(125000) +
      ' of long-term equity gains are tax-free every year</strong> (12.5% above that). Booking some each year keeps that allowance from going unused.</span></div>';
    if (m.exitLoads.length) inner += '<div class="so-flag">' + ICON.alert + '<span><strong>Exit load may apply</strong> on ' + m.exitLoads.map(esc).join(', ') +
      ' if sold within a year of buying (usually 1%).</span></div>';
    var inFunds = m.nEquities + m.nOtherSec > 0 ? ' in your funds' : '';
    return sec('tax', 'Tax', t ? (t.unreal >= 0 ? fmtShort(t.unreal) + ' of gains' + inFunds + ', not yet taxed' : 'Your funds are below cost') : 'Before you sell', inner);
  }

  function rTidy(m) {
    if (!m.tidy.length) return '';
    return sec('tidy', 'Quick tidy-ups', m.tidy.length + (m.tidy.length === 1 ? ' thing' : ' things') + ' to simplify', '<ul class="so-todos">' + m.tidy.map(function (t) {
      return '<li class="so-todo"><span class="so-todo-icon">' + ICON[t.icon] + '</span><span><strong>' + esc(t.title) + '</strong><span class="so-todo-detail">' + esc(t.detail) + '</span></span></li>';
    }).join('') + '</ul>');
  }

  function rMethod(m) {
    var li = ['Everything here was worked out on your device from the statement you loaded. Nothing was uploaded.'], o = m.overlap;
    if (o && o.stocks) {
      li.push('Company exposure comes from each fund\'s own portfolio disclosure' + (m.asof ? ' for ' + monthName(m.asof) : '') +
        (o.itemisedPct != null ? ', covering about ' + o.itemisedPct + '% of the money in those funds' : '') +
        '. Arbitrage, balanced advantage and equity savings funds are left out, because their shares are hedged.');
      if (o.uncovered.length) li.push(o.uncovered.length + ' of your ' + o.equityFunds + ' equity funds ' + (o.uncovered.length === 1 ? 'is' : 'are') +
        ' not yet in our holdings data, so ' + (o.uncovered.length === 1 ? 'its' : 'their') + ' companies are not in the chart. They are counted everywhere else.');
    }
    if (m.cost) {
      li.push('Expense ratios are the all-in figures funds now publish: the fund house\'s fee plus GST, STT and trading costs.' +
        (m.cost.anyEst ? ' Funds without a published figure use a typical one for their category.' : ''));
      li.push('The 10-year figure assumes an illustrative ' + Math.round(GROWTH_ASSUMPTION * 100) + '% yearly return, only to show how costs compound.');
    }
    if (m.tax) li.push('Gains use the cost values in your statement. Splitting them into long and short term needs each purchase date, which a detailed statement carries.');
    if (m.nEquities + m.nOtherSec > 0) li.push('Shares, bonds, and gold bonds are valued at the price in your statement. They are left out of the gain figures, because the statement does not show what you paid for them, and out of the cost figures, because they carry no yearly fund fee.');
    if (m.source === 'manual') li.push('Holdings entered by hand are read at the values you typed. Names not matched to a fund or company use typical figures for cost.');
    return '<details class="so-method"><summary>How we worked this out</summary><ul><li>' + li.join('</li><li>') + '</li></ul></details>';
  }

  function renderReport(m) {
    var body = document.getElementById('soReportBody');
    var title = document.getElementById('soReportTitle');
    var sub = document.getElementById('soReportSub');
    if (m.empty) {
      title.textContent = 'This statement has no current holdings';
      sub.textContent = 'Everything in it shows a zero balance. Load a recent statement with live holdings, or add them by hand, to get the full read.';
      body.innerHTML = '<p class="so-lede"><button type="button" class="so-help-link" data-so-restart="soStep2">Load a different statement</button></p>';
      return;
    }
    var sample = m.source === 'sample';
    title.textContent = sample ? 'A read on a sample ' + fmtShort(m.total) + ' portfolio' : 'A read on your ' + fmtShort(m.total) + ' portfolio';
    sub.textContent = sample ? 'An example portfolio of real funds and companies with made-up amounts, to show what the report looks like.' : 'Worked out on your device. Nothing was uploaded.';
    var banner = sample ? '<div class="so-sample-banner">' + ICON.info + '<span><strong>This is a sample, not your portfolio.</strong> Load your own statement to see yours, in about two minutes. ' +
      '<button type="button" class="so-help-link" data-so-restart="soGet">Get my statement</button></span></div>' : '';
    body.innerHTML = banner + rUnread(m) + rTiles(m) + rShape(m) + rOverlap(m) + rDup(m) + rCost(m) + rTax(m) + rTidy(m) + rMethod(m);
  }

  // Holdings the statement lists but this read could not itemise, said up front.
  var UNREAD_LABEL = {
    'Equities': 'shares', 'Preference Shares': 'preference shares', 'Mutual Funds': 'demat mutual funds',
    'Mutual Fund Folios': 'mutual fund folios', 'Specialized Investment Fund': 'specialized investment funds',
    'Alternate Investment Fund': 'AIFs', 'Corporate Bonds': 'corporate bonds', 'Government Securities': 'government securities',
    'Sovereign Gold Bonds': 'Sovereign Gold Bonds', 'National Pension System': 'NPS'
  };
  function rUnread(m) {
    if (!m.unread || !m.unread.length) return '';
    var list = m.unread.map(function (u) { return fmtShort(u.v) + ' in ' + esc(UNREAD_LABEL[u.k] || u.k); });
    var said = list.length > 1 ? list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1] : list[0];
    return '<div class="so-note-card is-gold">' + ICON.info + '<span>Your statement also shows <strong>' + said +
      '</strong>, which this page does not read yet, so the figures below leave ' + (list.length > 1 ? 'them' : 'it') + ' out.</span></div>';
  }

  // ---- Manual entry ----
  var manualRows = el('soManualRows'), INDEX = null, rowSeq = 0, manualWarned = false;
  var ISIN_RX = /^IN[A-Z0-9]{9}[0-9]$/i;

  // Fund and company names to pick from, built once from the same data the report uses.
  function searchIndex() {
    if (INDEX) return Promise.resolve(INDEX);
    return loadData().then(function (D) {
      INDEX = [];
      // One entry per scheme and plan: growth and IDCW options share the portfolio and the fee.
      var seen = {};
      Object.keys(D.schemes || {}).forEach(function (isin) {
        var s = D.schemes[isin]; if (!s || !s.n) return;
        var label = s.n + (s.plan === 'direct' ? ' (Direct)' : s.plan === 'regular' ? ' (Regular)' : '');
        if (seen[label]) return;
        seen[label] = 1;
        INDEX.push({ n: label, l: label.toLowerCase(), isin: isin, type: 'mf' });
      });
      (D.holdings.s || []).forEach(function (s) { INDEX.push({ n: s[1], l: s[1].toLowerCase(), isin: s[0], type: 'equity' }); });
      return INDEX;
    });
  }
  // Every word typed must appear in the name; names that start with the query, then shorter ones, first.
  function findMatches(q) {
    var toks = q.toLowerCase().split(/\s+/).filter(Boolean), out = [], lead = toks.join(' ');
    for (var i = 0; INDEX && i < INDEX.length && out.length < 300; i++) {
      var e = INDEX[i], ok = true;
      for (var t = 0; t < toks.length && ok; t++) ok = e.l.indexOf(toks[t]) >= 0;
      if (ok) out.push(e);
    }
    return out.sort(function (a, b) {
      return (a.l.indexOf(lead) === 0 ? 0 : 1) - (b.l.indexOf(lead) === 0 ? 0 : 1) || a.n.length - b.n.length;
    }).slice(0, 8);
  }
  function wireSuggest(input, list) {
    var items = [], active = -1, timer = null;
    function close() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); input.removeAttribute('aria-activedescendant'); active = -1; }
    function pick(e) { input.value = e.n; input.dataset.isin = e.isin; input.dataset.type = e.type; input.classList.remove('is-unmatched'); close(); }
    function render() {
      list.innerHTML = items.map(function (e, i) {
        return '<li role="option" id="' + list.id + '-' + i + '" class="so-sugg-item' + (i === active ? ' is-active' : '') + '" aria-selected="' + (i === active) + '">' +
          '<span>' + esc(e.n) + '</span><em>' + (e.type === 'equity' ? 'Company' : 'Fund') + '</em></li>';
      }).join('');
      list.hidden = !items.length;
      input.setAttribute('aria-expanded', items.length ? 'true' : 'false');
      if (active >= 0) input.setAttribute('aria-activedescendant', list.id + '-' + active); else input.removeAttribute('aria-activedescendant');
    }
    input.addEventListener('input', function () {
      delete input.dataset.isin; delete input.dataset.type;
      clearTimeout(timer);
      var q = input.value.trim();
      if (q.length < 3 || ISIN_RX.test(q)) { items = []; close(); return; }
      timer = setTimeout(function () { searchIndex().then(function () { items = findMatches(q); active = -1; render(); }); }, 120);
    });
    input.addEventListener('keydown', function (e) {
      if (list.hidden || !items.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % items.length; render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % items.length; render(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
      else if (e.key === 'Escape') close();
    });
    list.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li'); if (!li) return;
      e.preventDefault(); // keeps focus in the field, so blur does not close the list first
      pick(items[[].indexOf.call(list.children, li)]);
    });
    input.addEventListener('blur', function () { setTimeout(close, 150); });
  }

  function addManualRow() {
    var row = document.createElement('div'), id = 'soSugg' + (++rowSeq);
    row.className = 'so-manual-row';
    row.innerHTML = '<div class="so-m-namewrap"><input type="text" placeholder="Fund or company name, or ISIN" class="so-m-name" autocomplete="off" spellcheck="false"' +
      ' role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="' + id + '" aria-label="Fund or company" />' +
      '<ul class="so-sugg" id="' + id + '" role="listbox" hidden></ul></div>' +
      '<input type="text" inputmode="decimal" placeholder="Value today (&#8377;)" class="so-m-val" aria-label="Value today in rupees" />' +
      '<button type="button" class="so-manual-del" aria-label="Remove this holding">&times;</button>';
    row.querySelector('.so-manual-del').addEventListener('click', function () { row.remove(); });
    wireSuggest(row.querySelector('.so-m-name'), row.querySelector('.so-sugg'));
    manualRows.appendChild(row);
  }
  // afterFailedParse: a statement loaded but yielded no holdings, so say why and point to the Detailed CAS.
  function openManual(afterFailedParse) {
    setStatus(false);
    if (!manualRows.children.length) { addManualRow(); addManualRow(); addManualRow(); }
    if (el('soManualWhy')) el('soManualWhy').hidden = !afterFailedParse;
    if (el('soManualNote')) el('soManualNote').hidden = true;
    manualWarned = false;
    searchIndex(); // warm the name list while the visitor starts typing
    show('manual');
  }
  if (el('soManualLink')) el('soManualLink').addEventListener('click', function () { openManual(false); });
  [].forEach.call(document.querySelectorAll('[data-so-manual]'), function (b) {
    b.addEventListener('click', function () { openManual(false); });
  });
  if (el('soManualAdd')) el('soManualAdd').addEventListener('click', addManualRow);
  if (el('soManualBack')) el('soManualBack').addEventListener('click', function () { show('upload'); });
  if (el('soManualGet')) el('soManualGet').addEventListener('click', function () { show('upload'); }); // step 1 sits at the top of the tool
  if (el('soManualRun')) el('soManualRun').addEventListener('click', function () {
    var holdings = [], unmatched = 0, note = el('soManualNote');
    searchIndex().then(function () {
      manualRows.querySelectorAll('.so-manual-row').forEach(function (r) {
        var inp = r.querySelector('.so-m-name'), name = inp.value.trim();
        var val = parseFloat((r.querySelector('.so-m-val').value || '').replace(/[^0-9.]/g, ''));
        if (!name || !(val > 0)) return;
        var isin = inp.dataset.isin || (ISIN_RX.test(name) ? name.toUpperCase() : null), type = inp.dataset.type || null;
        if (!isin) { // a name typed in full without picking it from the list
          var exact = INDEX.filter(function (e) { return e.l === name.toLowerCase(); })[0];
          if (exact) { isin = exact.isin; type = exact.type; }
        }
        if (isin && !type) type = nsdlType(isin, name, null);
        inp.classList.toggle('is-unmatched', !isin);
        if (!isin) unmatched++;
        holdings.push({ name: name, value: val, isin: isin, type: type || 'mf' });
      });
      if (!holdings.length) {
        note.textContent = 'Add at least one holding with its value today.'; note.hidden = false; return;
      }
      if (unmatched && !manualWarned) { // say so once; a second click goes ahead
        manualWarned = true;
        note.textContent = (unmatched === 1 ? 'One name is' : unmatched + ' names are') + ' not matched to a fund or company, so ' +
          (unmatched === 1 ? 'it' : 'they') + ' will be read with typical figures. Pick from the list for an exact read, or press Analyse again to go ahead.';
        note.hidden = false; return;
      }
      note.hidden = true; manualWarned = false;
      analyze({ source: 'manual', holdings: holdings });
    });
  });

  // ---- Lead capture (Web3Forms) ----
  var leadForm = el('soLeadForm');
  if (leadForm) leadForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var consent = !el('soConsentRow').hidden && el('soConsent').checked && !!lastSummary; // never for the sample
    el('soLeadSummary').value = consent && lastSummary ? lastSummary.text : '';
    var msg = el('soLeadMsg'), btn = el('soLeadSubmit');
    btn.disabled = true; msg.hidden = true;
    fetch('https://api.web3forms.com/submit', { method: 'POST', body: new FormData(leadForm) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        btn.disabled = false;
        msg.hidden = false;
        if (d.success) {
          msg.className = 'so-lead-msg is-ok';
          msg.textContent = consent ? 'Sent. We will be in touch within one business day, with your summary in hand.' : 'Sent. We will be in touch within one business day.';
          if (window.seleqtTrack) window.seleqtTrack('generate_lead', { location: 'second_opinion', shared: consent });
          leadForm.reset();
        } else {
          msg.className = 'so-lead-msg is-err';
          msg.textContent = 'Something went wrong. Please email contact@seleqtwealth.in and we will help.';
        }
      })
      .catch(function () {
        btn.disabled = false; msg.hidden = false;
        msg.className = 'so-lead-msg is-err';
        msg.textContent = 'Network error. Please email contact@seleqtwealth.in and we will help.';
      });
  });

  if (el('soPrint')) el('soPrint').addEventListener('click', function () { window.print(); });
  // A printed or saved report should carry its assumptions, so open that drawer first.
  window.addEventListener('beforeprint', function () {
    [].forEach.call(document.querySelectorAll('.so-method'), function (d) { d.open = true; });
  });
  // Back to the upload step without a reload, landing where the visitor needs to be.
  function resetToUpload(targetId) {
    currentFile = null;
    if (fileInput) fileInput.value = '';
    pass.hidden = true; passError.hidden = true; passInput.value = '';
    setStatus(false);
    show('upload', el(targetId));
  }
  if (el('soRestart')) el('soRestart').addEventListener('click', function () { resetToUpload('soStep2'); });
  if (el('soReportBody')) el('soReportBody').addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-so-restart]');
    if (b) resetToUpload(b.getAttribute('data-so-restart'));
  });

  // ---- Sample report: an example portfolio (real schemes and companies, made-up amounts) ----
  var SAMPLE = [
    ['INF879O01027', 'Parag Parikh Flexi Cap Fund - Direct Plan - Growth', 625000, 410000, '18724531/0'],
    ['INF179K01UT0', 'HDFC Flexi Cap Fund - Direct Plan - Growth', 340000, 260000, '1045872310/45'],
    ['INF179K01CR2', 'HDFC Mid Cap Fund - Regular Plan - Growth', 280000, 190000, '1051209876/12', true],
    ['INF200K01164', 'SBI Large Cap Fund - Regular Plan - Growth', 310000, 235000, '29187345/76'],
    ['INF769K01AX2', 'Mirae Asset Large Cap Fund - Direct Plan - Growth', 220000, 170000, '79901234567'],
    ['INF109K014L5', 'ICICI Prudential Large Cap Fund - Direct Plan - Growth', 260000, 195000, '5566778/90'],
    ['INF174K01LS2', 'Kotak Flexi Cap Fund - Direct Plan - Growth', 190000, 150000, '4481122/33'],
    ['INF204K01J91', 'Nippon India Small Cap Fund - Direct Plan - Growth', 145000, 88000, '477209871/5'],
    ['INF209K01VA3', 'Aditya Birla Sun Life Liquid Fund - Direct Plan - Growth', 150000, 147000, '1039884455/1'],
    ['INF789F01WY2', 'UTI Nifty 50 Index Fund - Direct Plan - Growth', 650, 500, '691122334']
  ];
  var SAMPLE_OTHER = [
    { isin: 'INE002A01018', name: 'Reliance Industries Limited', value: 150000, type: 'equity' },
    { isin: 'INE040A01034', name: 'HDFC Bank Limited', value: 120000, type: 'equity' },
    { isin: 'INE009A01021', name: 'Infosys Limited', value: 90000, type: 'equity' },
    { isin: 'INE154A01025', name: 'ITC Limited', value: 60000, type: 'equity' },
    { isin: null, name: 'Sovereign Gold Bond', value: 124000, type: 'sgb' }
  ];
  function openSample(btn) {
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Building the sample...';
    var holdings = SAMPLE.map(function (s) {
      return { isin: s[0], name: s[1], value: s[2], cost: s[3], folio: s[4], type: 'mf', exitLoadClause: !!s[5] };
    }).concat(SAMPLE_OTHER.map(function (o) { return { isin: o.isin, name: o.name, value: o.value, type: o.type }; }));
    analyze({ source: 'sample', holdings: holdings }).then(function () { btn.disabled = false; btn.textContent = label; });
  }
  [].forEach.call(document.querySelectorAll('[data-so-sample]'), function (b) {
    b.addEventListener('click', function () { openSample(b); });
  });

  // ---- Dev helper: dump extracted text so the parser can be built against it ----
  function dumpText(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;inset:5%;width:90%;height:90%;z-index:99999;font-family:monospace;font-size:11px;';
    document.body.appendChild(ta);
    console.log('[second-opinion dev] extracted lines:', text.split('\n').length);
  }

  if (DEV) window.__so = {
    extractText: extractText, parseCAS: parseCAS, analyze: analyze,
    buildModel: buildModel, loadData: loadData,
    // Let a dev test inject holdings so overlap can be exercised without
    // shipping test rows in data/holdings.json. Pass {fundISIN: [{n, w, i?}, ...]}
    // (i = the stock's ISIN; without it the stock is keyed by name).
    setHoldings: function (h, asof) {
      return loadData().then(function (D) {
        var H = D.holdings;
        Object.keys(h).forEach(function (fund) {
          var list = h[fund].map(function (x) {
            var key = x.i || ('N:' + normStock(x.n || x.name));
            if (H.si[key] == null) { H.si[key] = H.s.length; H.s.push([key, x.n || x.name]); }
            return [H.si[key], x.w || x.pct || 0];
          });
          H.i[fund] = H.f.length;
          H.f.push([asof || null, null, list]);
        });
      });
    }
  };
})();
