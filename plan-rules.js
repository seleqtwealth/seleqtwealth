/* ============================================================
   SELEQT action plan rules (Phase 1, mutual funds). Pure functions, no page code:
   the page (second-opinion-plan.js) and the fixture tests (scripts/test_plan_rules.js)
   both call SOPlanRules.build(), so every verdict is reproducible and auditable.
   Every threshold comes from data/plan-config.json. No AI, no network.
   ============================================================ */
(function (root) {
  'use strict';
  var R = {};
  var DAY = 86400000;

  // ---------- dates ----------
  function t(d) { if (!d) return null; var p = String(d).split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function iso(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
  function days(a, b) { return Math.round((t(b) - t(a)) / DAY); }
  function addDays(d, n) { return iso(t(d) + n * DAY); }
  function fyStart(d) { var x = new Date(t(d)), y = x.getUTCFullYear(); return (x.getUTCMonth() >= 3 ? y : y - 1) + '-04-01'; }
  var MONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function nice(d) { return d ? (+d.slice(8, 10)) + ' ' + MONS[+d.slice(5, 7) - 1] + ' ' + d.slice(0, 4) : ''; }
  function addYears(d, n) { return (+d.slice(0, 4) + n) + d.slice(4); }
  function nextFy(d) { return (+fyStart(d).slice(0, 4) + 1) + '-04-01'; }
  R.dates = { t: t, iso: iso, days: days, addDays: addDays, fyStart: fyStart, nextFy: nextFy };
  function pct(x) { return Math.round(x * 100) + '%'; }
  function inr(n) { return '\u20b9' + Math.round(n).toLocaleString('en-IN'); }

  // ---------- 1. investment policy intake ----------
  // Shaped like an Investment Policy Statement: who the investor is (ability to take risk),
  // what the money is for (objectives, each goal with its own horizon), how they behave when
  // markets fall (willingness), and the constraints (liquidity, tax, residency, preferences).
  // Points only place ability and willingness on one four-step scale; the lower sets the profile.
  R.SECTIONS = [
    { id: 'about', title: 'About you', lede: 'What you can afford to risk.' },
    { id: 'goals', title: 'What this money is for', lede: 'Each goal gets its own horizon and mix.' },
    { id: 'attitude', title: 'How you handle risk', lede: 'What you would actually do, not what you hope you would.' },
    { id: 'constraints', title: 'Constraints and preferences', lede: 'Tax, residency, liquidity, and how you like to invest.' }
  ];
  R.QUESTIONS = [
    { id: 'age', short: 'age', sec: 'about', dim: 'ability', q: 'Your age', a: ['Under 30', '30 to 44', '45 to 59', '60 to 69', '70 or over'], p: [4, 3, 2, 1, 0] },
    { id: 'dependants', short: 'dependants', sec: 'about', dim: 'ability', q: 'People who depend on your income', a: ['None', 'One or two', 'Three or more'], p: [2, 1, 0] },
    { id: 'income', short: 'income', sec: 'about', dim: 'ability', q: 'Your income', a: ['Salaried, stable', 'Business or professional, variable', 'Salaried, but uncertain', 'Retired, or no regular income'], p: [3, 2, 1, 0] },
    { id: 'expenses', sec: 'about', type: 'amount', q: 'Your household spends each month, roughly', hint: 'Sets the size of the cash reserve the policy keeps aside.' },
    { id: 'emergency', short: 'cash reserve', sec: 'about', dim: 'ability', q: 'Months of expenses you hold in cash or liquid funds outside this portfolio', a: ['None', 'Under 3 months', '3 to 6 months', 'Over 6 months'], p: [0, 1, 2, 3], months: [0, 1.5, 4.5, 6] },
    { id: 'emi', short: 'EMIs', sec: 'about', dim: 'ability', q: 'Loan EMIs as a share of take-home income', a: ['None', 'Under 20%', '20 to 40%', 'Over 40%'], p: [3, 2, 1, 0] },
    { id: 'insurance', short: 'insurance', sec: 'about', dim: 'ability', q: 'Term life and health insurance', a: ['Both in place', 'Only one of them', 'Neither', 'Not needed: no dependants, or covered otherwise'], p: [2, 1, 0, 2] },
    { id: 'share', short: 'share of your wealth', sec: 'about', dim: 'ability', q: 'This portfolio, as a share of everything you own apart from your home', a: ['Under a quarter', 'About half', 'Most of it', 'Nearly all of it'], p: [3, 2, 1, 0] },
    { id: 'surplus', sec: 'about', type: 'amount', q: 'Money you can invest each month after expenses and EMIs', hint: 'Turns the gaps in your mix into a monthly plan.' },
    { id: 'hasGoal', sec: 'goals', q: 'Do you have a specific goal for this money?', a: ['Yes, one or more specific goals', 'No, I just want it to grow', 'No, I want to keep it safe'] },
    { id: 'goals', sec: 'goals', type: 'goals', q: 'Your goals for this money', hint: 'Up to four. Amounts in today\'s money; the policy adds inflation.', showIf: function (a) { return +a.hasGoal === 0; } },
    { id: 'returnNeed', sec: 'goals', q: 'The return you need from this money, above inflation', a: ['Protect it: keep pace with inflation', 'Beat inflation a little, 1 to 3% a year', 'Grow it meaningfully, 3 to 6% a year', 'Grow it as fast as possible, 6% or more'], real: [0.005, 0.02, 0.045, 0.07] },
    { id: 'incomeNeed', sec: 'goals', q: 'Do you draw income from this portfolio?', a: ['No', 'A little, under 4% of it a year', 'It is my main source of income'] },
    { id: 'fall', short: 'reaction to a fall', sec: 'attitude', dim: 'willingness', q: 'If your investments fell 20% in a few months (10 lakh becomes 8 lakh), you would', a: ['Sell everything', 'Sell some', 'Hold and wait', 'Invest more'], p: [0, 1, 3, 4] },
    { id: 'drawdown', short: 'drawdown tolerance', sec: 'attitude', dim: 'willingness', q: 'The largest fall in value you could sit through without changing plan', a: ['About 5%: 10 lakh to 9.5 lakh', 'About 10%: 10 lakh to 9 lakh', 'About 20%: 10 lakh to 8 lakh', '35% or more: 10 lakh to 6.5 lakh or less'], p: [0, 1, 3, 4] },
    { id: 'exp', short: 'experience', sec: 'attitude', dim: 'willingness', q: 'Your investing experience', a: ['None', 'Fixed deposits and insurance only', 'Mutual funds for under 3 years', 'Mutual funds for 3 years or more', 'Shares, and funds, for many years'], p: [0, 1, 2, 3, 4] },
    { id: 'tradeoff', short: 'return trade-off', sec: 'attitude', dim: 'willingness', q: 'Over ten years, which would you rather hold?', a: ['A steady 7% every year', 'Mostly 9%, with a worst year of minus 10% (10 lakh to 9 lakh)', 'Mostly 11%, with a worst year of minus 25% (10 lakh to 7.5 lakh)', 'Mostly 13%, with a worst year of minus 40% (10 lakh to 6 lakh)'], p: [0, 1, 3, 4] },
    { id: 'behaviour', short: 'past behaviour', sec: 'attitude', dim: 'willingness', q: 'In the 2020 crash, or the 2022 fall, you', a: ['Were not invested then', 'Sold', 'Held on', 'Bought more'], p: [2, 0, 3, 4] },
    { id: 'slab', sec: 'constraints', q: 'Your income tax slab', a: ['Nil', '5%', '10%', '15%', '20%', '25%', '30%'] },
    { id: 'regime', sec: 'constraints', q: 'Your tax regime', a: ['New regime, no 80C deductions', 'Old regime, 80C and 80D claimed'] },
    { id: 'residency', sec: 'constraints', q: 'Tax residency', a: ['Resident Indian', 'Non-resident Indian'] },
    { id: 'simplicity', sec: 'constraints', q: 'How many funds are you happy to hold in all?', a: ['Up to 5', 'Up to 8', 'No preference'], maxFunds: [5, 8, null] },
    { id: 'exclude', sec: 'constraints', type: 'multi', q: 'Preferences, tick any that apply', a: ['Avoid sector and theme funds', 'Avoid small cap funds', 'Prefer index funds where they do the job', 'Avoid international funds'] },
    { id: 'withdrawals', sec: 'constraints', type: 'amount', q: 'Money you plan to take out of this portfolio in the next 12 months', hint: 'Kept in liquid funds, outside the risk mix.' },
    { id: 'booked', sec: 'constraints', type: 'amount', q: 'Equity gains already booked this financial year', hint: 'The ₹1.25 lakh tax-free allowance is shared with gains you have taken elsewhere.' }
  ];
  R.GOAL_TYPES = ['Retirement', 'Child\'s education', 'Child\'s wedding', 'Buying a home', 'Vehicle or travel', 'Starting a business', 'Regular income', 'General wealth', 'Other'];
  R.PRIORITIES = ['Must happen', 'Important', 'Flexible'];
  R.ORDER = ['conservative', 'cautious', 'balanced', 'growth', 'high_growth', 'aggressive'];
  R.LABELS = { conservative: 'Conservative', cautious: 'Cautious', balanced: 'Balanced', growth: 'Growth', high_growth: 'High growth', aggressive: 'Aggressive' };
  R.label = function (key, cfg) { return ((cfg && cfg.risk_profile.labels) || R.LABELS)[key] || key; };
  var Q = {}; R.QUESTIONS.forEach(function (q) { Q[q.id] = q; });
  function ordIdx(key) { return key === 'cash' ? -1 : R.ORDER.indexOf(key); }
  function bandOf(points, cfg) { var b = cfg.risk_profile.bands; for (var i = 0; i < b.length; i++) if (points <= b[i].max_points) return b[i].profile; return b[b.length - 1].profile; }
  // One dimension's points, scaled to 24, with the answers that pulled it down (half marks or less).
  function scoreDim(ans, dim) {
    var pts = 0, max = 0, drags = [];
    R.QUESTIONS.forEach(function (q) {
      if (q.dim !== dim) return;
      var top = Math.max.apply(null, q.p); max += top;
      if (ans[q.id] == null) return;
      var got = q.p[+ans[q.id]] || 0; pts += got;
      if (got <= top / 2) drags.push((q.short || q.id) + ' (' + q.a[+ans[q.id]].toLowerCase() + ')');
    });
    return { points: Math.round(pts * 24 / max), max: 24, drags: drags };
  }
  R.profile = function (ans, cfg) {
    var ab = scoreDim(ans, 'ability'), wi = scoreDim(ans, 'willingness');
    ab.key = bandOf(ab.points, cfg); wi.key = bandOf(wi.points, cfg);
    var key = R.ORDER[Math.min(ordIdx(ab.key), ordIdx(wi.key))], capped = null;
    var capKey = cfg.risk_profile.income_cap || 'balanced';
    if (+ans.incomeNeed === 2 && ordIdx(key) > ordIdx(capKey)) { key = capKey; capped = 'income'; } // the portfolio pays the bills
    return { key: key, ability: ab, willingness: wi, limiter: ordIdx(ab.key) <= ordIdx(wi.key) ? 'ability' : 'willingness',
      points: Math.min(ab.points, wi.points), max: 24, capped: !!capped, cappedWhy: capped,
      slab: cfg.tax.slabs[+ans.slab || 0] || 0, booked: +ans.booked || 0 };
  };
  function horizonCap(years, cfg) { var caps = cfg.ips.horizon_caps; for (var i = 0; i < caps.length; i++) if (years < caps[i].under_years) return caps[i].profile; return null; }
  function mixFor(key, cfg) { return key === 'cash' ? { equity: 0, hybrid: 0, debt: 1 } : cfg.target_mix[key]; }
  // The written policy: goals with horizons and funding, the blended target mix, the liquidity
  // floor, the return objective against expectations, and the flags an adviser would raise first.
  R.ips = function (ans, cfg, total, prof, today) {
    var I = cfg.ips, A = I.assumptions, year = +String(today).slice(0, 4), ex = ans.exclude || {};
    var goals = (+ans.hasGoal === 1 || +ans.hasGoal === 2 ? [] : (ans.goals || [])).filter(function (g) { return g && +g.amount > 0 && +g.year; }).map(function (g) {
      var years = Math.max(0, +g.year - year), cap = horizonCap(years, cfg), key = prof.key;
      if (cap && ordIdx(cap) < ordIdx(key) && (+g.priority !== 2 || years < 3)) key = cap; // flexible goals keep the profile mix unless very near
      return { label: R.GOAL_TYPES[+g.type] || String(g.type || 'Goal'), year: +g.year, years: years, amount: +g.amount, priority: +g.priority || 0, mixKey: key, capped: key !== prof.key };
    });
    var assumed = !goals.length, assumedKind = null;
    if (assumed && +ans.hasGoal === 2) { assumedKind = 'preserve'; goals.push({ label: 'Keeping the money safe', year: year + 5, years: 5, amount: total || 1, priority: 0, mixKey: 'conservative', capped: prof.key !== 'conservative' }); }
    else if (assumed) { assumedKind = 'grow'; goals.push({ label: 'General wealth', year: year + 10, years: 10, amount: total || 1, priority: 1, mixKey: prof.key, capped: false }); }
    var sumAmt = goals.reduce(function (s, g) { return s + g.amount; }, 0), mix = { equity: 0, hybrid: 0, debt: 0 };
    goals.forEach(function (g) {
      g.share = g.amount / sumAmt;
      var m = mixFor(g.mixKey, cfg); g.mix = m;
      ['equity', 'hybrid', 'debt'].forEach(function (k) { mix[k] += g.share * m[k]; });
      var nominal = m.equity * A.equity + m.hybrid * A.hybrid + m.debt * A.debt, r = nominal / 12, n = g.years * 12;
      g.expectedReturn = nominal;
      g.target = g.amount * Math.pow(1 + A.inflation, g.years);          // what the goal costs when it falls due
      g.funded = (total || 0) * g.share;                                   // its share of the portfolio today
      g.fundedAt = g.funded * Math.pow(1 + nominal, g.years);              // what that share grows to
      g.shortfall = Math.max(0, g.target - g.fundedAt);
      g.sip = n > 0 ? (r > 0 ? g.shortfall * r / (Math.pow(1 + r, n) - 1) : g.shortfall / n) : g.shortfall;
    });
    // Liquidity: a reserve of N months of expenses not already held outside, plus planned withdrawals.
    var expenses = +ans.expenses || 0, covered = Q.emergency.months[+ans.emergency || 0] || 0;
    var months = (I.liquidity.reserve_months_by_income || [])[+ans.income]; if (months == null) months = I.liquidity.reserve_months;
    var reserve = Math.max(0, (months - covered) * expenses), withdrawals = +ans.withdrawals || 0;
    var liquidFloor = total > 0 ? Math.min(1, (reserve + withdrawals) / total) : 0, ds = cfg.debt_split;
    if (liquidFloor > mix.debt * ds.liquid) { // the extra liquid money comes out of equity first, then hybrid
      var extra = liquidFloor - mix.debt * ds.liquid, fromEq = Math.min(extra, mix.equity); mix.equity -= fromEq; extra -= fromEq;
      var fromHy = Math.min(extra, mix.hybrid); mix.hybrid -= fromHy;
      mix.debt = 1 - mix.equity - mix.hybrid;
    }
    var debtSplit = { liquid: mix.debt > 0 ? Math.max(ds.liquid, Math.min(1, liquidFloor / mix.debt)) : ds.liquid };
    debtSplit.core = 1 - debtSplit.liquid;
    var es = {}; Object.keys(cfg.equity_split[prof.key]).forEach(function (k) { es[k] = cfg.equity_split[prof.key][k]; });
    if (ex[1]) { es.mid += es.small; es.small = 0; } // asked to avoid small caps
    var nominal = mix.equity * A.equity + mix.hybrid * A.hybrid + mix.debt * A.debt, real = nominal - A.inflation;
    var need = ans.returnNeed == null ? null : Q.returnNeed.real[+ans.returnNeed];
    var sipNeeded = goals.reduce(function (s, g) { return s + g.sip; }, 0), surplus = +ans.surplus || 0;
    var maxFunds = ans.simplicity == null ? null : Q.simplicity.maxFunds[+ans.simplicity];
    var flags = [];
    if (+ans.insurance === 1 || +ans.insurance === 2) flags.push({ k: 'insurance', text: (+ans.insurance === 2 ? 'Neither term life nor health insurance is in place.' : 'One of term life or health insurance is missing.') + ' Insurance is what stops a bad year from forcing a sale; put it in place before adding to this portfolio.' });
    if (reserve > 0) flags.push({ k: 'reserve', text: 'Your cash reserve is short by about ' + inr(reserve) + ' of a ' + months + '-month cushion (' + months + ' months of expenses for your kind of income). The policy holds that much in liquid funds before anything else.' });
    if (+ans.emi === 3) flags.push({ k: 'emi', text: 'EMIs take over 40% of take-home income. Clearing expensive loans is a guaranteed return, so the policy stays cautious until that eases.' });
    if (need != null && need > real + 0.005) flags.push({ k: 'return', text: 'Your goals ask for about ' + Math.round(need * 100) + '% a year above inflation, but a ' + R.label(prof.key, cfg).toLowerCase() + ' mix can be expected to earn about ' + (real * 100).toFixed(1) + '%. Something has to give: invest more each month, push a goal out, or accept more risk than you said you were comfortable with.' });
    if (surplus > 0 && sipNeeded > surplus * 1.1) flags.push({ k: 'sip', text: 'Reaching every goal on time needs about ' + inr(sipNeeded) + ' a month against the ' + inr(surplus) + ' you can invest. Fund the goals marked must first, and push the flexible ones out.' });
    if (+ans.residency === 1) flags.push({ k: 'nri', text: 'As a non-resident, some fund houses will not take fresh money from certain countries, and redemptions attract TDS. Every suggestion below is subject to that check.' });
    return { goals: goals, assumed: assumed, assumedKind: assumedKind, reserveMonths: months, mix: mix, equitySplit: es, debtSplit: debtSplit, liquidFloor: liquidFloor, reserve: reserve, withdrawals: withdrawals,
      expected: { nominal: nominal, real: real, need: need, worstYear: A.worst_year[prof.key] }, sip: { needed: sipNeeded, surplus: surplus },
      maxFunds: maxFunds, exclude: ex, flags: flags, band: I.rebalance_band, review: I.review };
  };
  R.inr = function (n) { return inr(n); };

  // ---------- classification ----------
  var EQ_SUB = { large_cap: 'large', large_mid: 'large_mid', mid_cap: 'mid', small_cap: 'small', flexi_cap: 'flexi', multi_cap: 'flexi',
    focused: 'flexi', elss: 'flexi', value: 'flexi', contra: 'flexi', dividend_yield: 'flexi', thematic: 'thematic' };
  var EQ_TAX = { aggressive_hybrid: 1, balanced_advantage: 1, equity_savings: 1, arbitrage: 1 };
  function classify(rec, name, cfg, eqShare) {
    var c = rec ? rec.cat : null, n = String(name || (rec && rec.n) || '').toLowerCase();
    var eq = function (sub, idx) { return { sleeve: 'equity', sub: sub, tax: 'equity', index: !!idx }; };
    if (c === 'index' || c === 'etf') {
      if (/gold|silver/.test(n)) return { sleeve: 'other', sub: 'outside', tax: 'debt', index: true };
      if (/gilt|bond|sdl|g-?sec|crisil|debt|liquid|money market|psu/.test(n)) return { sleeve: 'debt', sub: 'core', tax: 'debt', index: true };
      if (/small\s*cap/.test(n.replace('smallcap', 'small cap'))) return eq('small', 1);
      if (/large\s*mid|largemid/.test(n)) return eq('large_mid', 1);
      if (/mid\s*cap/.test(n.replace('midcap', 'mid cap'))) return eq('mid', 1);
      if (/(nifty|bse|s&p bse)\s*500|total market|multicap/.test(n)) return eq('flexi', 1);
      if (/nifty\s*50\b|nifty\s*100\b|sensex|bse\s*100|next\s*50|large\s*cap/.test(n) && !/equal|momentum|value|quality|alpha|low vol/.test(n)) return eq('large', 1);
      return eq('thematic', 1);
    }
    if (EQ_SUB[c]) return eq(EQ_SUB[c]);
    if (cfg.hybrid_categories.indexOf(c) >= 0 || c === 'equity_savings') {
      var fits = cfg.hybrid_categories.indexOf(c) >= 0;
      var tax = EQ_TAX[c] ? 'equity' : (eqShare != null ? (eqShare >= cfg.tax.hybrid_equity_taxed_at * 100 ? 'equity' : eqShare >= cfg.tax.hybrid_slab_below * 100 ? 'hybrid_mid' : 'debt') : 'hybrid_mid');
      return { sleeve: 'hybrid', sub: fits ? 'hybrid' : 'outside', tax: tax };
    }
    if (c === 'arbitrage') return { sleeve: 'debt', sub: 'liquid', tax: 'equity' };
    if (c === 'conservative_hybrid') return { sleeve: 'debt', sub: 'core', tax: 'debt' };
    if (c === 'credit_risk') return { sleeve: 'debt', sub: 'core', tax: 'debt' }; // judged like any core debt fund, and flagged
    if (cfg.debt_liquid_categories.indexOf(c) >= 0) return { sleeve: 'debt', sub: 'liquid', tax: 'debt' };
    if (cfg.debt_core_categories.indexOf(c) >= 0) return { sleeve: 'debt', sub: 'core', tax: 'debt' };
    if (c && /duration|gilt|bond|credit|floater|dynamic/.test(c)) return { sleeve: 'debt', sub: 'outside', tax: 'debt' };
    return { sleeve: 'other', sub: 'outside', tax: 'debt' };
  }
  R.classify = classify;

  // ---------- overlap from portfolio disclosures (top holdings) ----------
  function overlap(a, b, H) {
    if (!H || !H.i) return null;
    var fa = H.i[a], fb = H.i[b];
    if (fa == null || fb == null) return null;
    var wa = {}, s = 0;
    H.f[fa][2].forEach(function (p) { wa[p[0]] = p[1]; });
    H.f[fb][2].forEach(function (p) { if (wa[p[0]] != null) s += Math.min(wa[p[0]], p[1]); });
    return s / 100;
  }
  R.overlap = overlap;
  function eqShareOf(isin, H) { var i = H && H.i ? H.i[isin] : null; return i != null ? H.f[i][1] : null; }

  // ---------- 5. lots, first in first out ----------
  // Units in the opening balance are treated as bought on the period start date (or before),
  // with cost apportioned from the statement's total cost value.
  R.lots = function (h, period) {
    var lots = [], approx = [];
    var tx = (h.txns || []).slice().sort(function (x, y) { return t(x.d) - t(y.d); });
    if (h.opening > 0.0005) {
      lots.push({ d: period && period.from ? period.from : null, u: h.opening, c: null, open: true });
      approx.push('opening');
    }
    tx.forEach(function (x) {
      if (x.units > 0) lots.push({ d: x.d, u: x.units, c: Math.abs(x.amt) });
      else {
        var left = -x.units;
        while (left > 1e-6 && lots.length) {
          var l = lots[0], take = Math.min(l.u, left), share = take / l.u;
          if (l.c != null) l.c -= l.c * share;
          l.u -= take; left -= take;
          if (l.u <= 1e-6) lots.shift();
        }
      }
    });
    if (!tx.length && !lots.length && h.units > 0) { lots.push({ d: null, u: h.units, c: h.cost, open: true }); approx.push('no_history'); }
    var known = lots.reduce(function (s, l) { return s + (l.c || 0); }, 0);
    var openLots = lots.filter(function (l) { return l.c == null; });
    if (openLots.length) {
      var rest = Math.max(0, (h.cost || 0) - known), u = openLots.reduce(function (s, l) { return s + l.u; }, 0);
      openLots.forEach(function (l) { l.c = u ? rest * l.u / u : 0; });
      if (!(h.cost > 0)) approx.push('no_cost');
    }
    var total = lots.reduce(function (s, l) { return s + l.u; }, 0);
    if (h.units > 0 && Math.abs(total - h.units) > Math.max(0.01, h.units * 0.005)) {
      approx.push('units_mismatch');
      var k = h.units / (total || 1);
      lots.forEach(function (l) { l.u *= k; l.c *= k; });
    }
    return { lots: lots, approx: approx };
  };

  // Exit load and the gain on each lot if sold on `on`
  function lotSale(l, nav, on, el, gfNav, taxClass, cfg) {
    var held = l.d ? days(l.d, on) : 99999, gross = l.u * nav;
    var load = held < el.days ? gross * el.rate : 0, net = gross - load, cost = l.c;
    if (taxClass === 'equity' && l.d && t(l.d) < t(cfg.tax.grandfather_buy_before) && gfNav) cost = Math.max(cost, Math.min(l.u * gfNav, net));
    return { held: held, gross: gross, load: load, gain: net - cost, d: l.d };
  }

  // Tax on a set of sales inside one financial year, with the equity exemption still available.
  function taxFor(sales, taxClass, buyDates, cfg, slab, exemptLeft) {
    var T = cfg.tax, st = 0, lt = 0, tax = 0, used = 0;
    sales.forEach(function (s) {
      if (taxClass === 'equity') { if (s.held < T.equity_lt_days) st += s.gain; else lt += s.gain; }
      else if (taxClass === 'debt' && (!s.d || t(s.d) >= t(T.debt_slab_from))) st += s.gain;
      else { if (s.held >= T.debt_lt_days) lt += s.gain; else st += s.gain; }
    });
    if (st < 0) { lt += st; st = 0; }
    if (taxClass === 'equity') {
      if (lt > 0) { used = Math.min(lt, exemptLeft); tax += (lt - used) * T.equity_ltcg; }
      tax += st * T.equity_stcg;
    } else {
      tax += Math.max(0, lt) * T.debt_lt_rate + st * slab;
    }
    return { tax: Math.max(0, tax) * (1 + T.cess), st: st, lt: lt, exemptUsed: used };
  }

  // ---------- XIRR ----------
  function xirr(flows) {
    if (flows.length < 2) return null;
    var t0 = t(flows[0].d), f = function (r) { return flows.reduce(function (s, x) { return s + x.v / Math.pow(1 + r, (t(x.d) - t0) / (365 * DAY)); }, 0); };
    var lo = -0.99, hi = 5, flo = f(lo), fhi = f(hi);
    if (flo * fhi > 0) return null;
    for (var i = 0; i < 200; i++) { var mid = (lo + hi) / 2, fm = f(mid); if (Math.abs(fm) < 1e-7) return mid; if (flo * fm < 0) { hi = mid; } else { lo = mid; flo = fm; } }
    return (lo + hi) / 2;
  }
  R.xirr = xirr;


  // ---------- the plan ----------
  R.build = function (I) {
    var cfg = I.cfg, S = I.scores, H = I.H, today = I.today, ans = I.answers || {};
    var V = cfg.verdict, A = cfg.additions, prof = R.profile(ans, cfg);
    var asOn = (I.parsed.period && I.parsed.period.to) || I.parsed.asOn || null;
    var plan = { profile: prof, asOn: asOn, stale: asOn ? days(asOn, today) > 30 : false, notes: [], funds: [], additions: [], gaps: {}, missed: [], holds: [],
      stages: { now: [], after: [], next: [] }, navDate: I.latest ? I.latest.date : null };
    var held = (I.parsed.holdings || []).filter(function (h) { return (h.type || 'mf') === 'mf' && h.value > 0; });
    var stmtTotal = held.reduce(function (s, h) { return s + h.value; }, 0);
    var ips = R.ips(ans, cfg, stmtTotal, prof, today); plan.ips = ips;
    if (!held.length) { plan.empty = true; return plan; }

    // Revalue to the latest NAV where the units are known
    held.forEach(function (h) {
      var nav = I.latest && I.latest.navs ? I.latest.navs[h.isin] : null;
      h._nav = nav || h.nav || (h.units ? h.value / h.units : null);
      h._today = nav && h.units ? h.units * nav : h.value;
      // A recent statement should be close to today's value; a big gap means the units or the plan
      // did not match, so the statement value is kept rather than a wrong revaluation.
      if (nav && h.value > 0 && asOn && days(asOn, today) <= 60 && Math.abs(h._today / h.value - 1) > 0.25) { h._today = h.value; h._navMismatch = true; }
    });
    var total = held.reduce(function (s, h) { return s + h._today; }, 0);
    plan.total = total; plan.statementTotal = stmtTotal;
    ips = R.ips(ans, cfg, total, prof, today); plan.ips = ips; // the policy sizes its liquidity floor on today's value

    // Classify each holding against its scored direct growth sibling
    var F = held.map(function (h) {
      var dg = S.sib[h.isin] || h.isin, rec = S.funds[dg] || null;
      var cls = classify(rec, h.name, cfg, eqShareOf(h.isin, H) != null ? eqShareOf(h.isin, H) : eqShareOf(dg, H));
      var plan_ = h.plan || (I.schemes && I.schemes[h.isin] ? I.schemes[h.isin].plan : null);
      var nm = rec ? rec.n : h.name, twin = held.filter(function (o) { return o.isin === h.isin; }).length > 1;
      if (twin && h.folio) nm += ' (folio ' + String(h.folio).split('/')[0].trim() + ')';
      return { h: h, isin: h.isin, dg: dg, rec: rec, cls: cls, regular: plan_ === 'regular', value: h._today, name: nm, reasons: [] };
    });

    // ---- target and current mix ----
    var tm = ips.mix, es = ips.equitySplit, ds = ips.debtSplit; // from the written policy, not a flat profile table
    var target = { large: tm.equity * es.large, flexi: tm.equity * es.flexi, mid: tm.equity * es.mid, small: tm.equity * es.small,
      hybrid: tm.hybrid, liquid: tm.debt * ds.liquid, core: tm.debt * ds.core };
    function bucketsOf(list) {
      var b = { large: 0, flexi: 0, mid: 0, small: 0, thematic: 0, hybrid: 0, liquid: 0, core: 0, outside: 0 };
      list.forEach(function (f) {
        var s = f.cls.sub, v = f.value;
        if (s === 'large_mid') { b.large += v / 2; b.mid += v / 2; } else if (b[s] != null) b[s] += v; else b.outside += v;
      });
      return b;
    }
    var cur = bucketsOf(F);
    plan.mix = { target: tm, current: { equity: 0, hybrid: 0, debt: 0, other: 0 }, subsTarget: target, subsCurrent: {} };
    F.forEach(function (f) { var k = f.cls.sleeve === 'other' ? 'other' : f.cls.sleeve; plan.mix.current[k] += f.value / total; });
    Object.keys(cur).forEach(function (k) { plan.mix.subsCurrent[k] = cur[k] / total; });

    // Theme funds: a satellite allowance for growth and aggressive policies, if the fund earns its place.
    var SAT = cfg.satellite || {}, eqTotal = F.filter(function (f) { return f.cls.sleeve === 'equity'; }).reduce(function (s, f) { return s + f.value; }, 0) || 1;
    var thematicShare = F.filter(function (f) { return f.cls.sub === 'thematic'; }).reduce(function (s, f) { return s + f.value; }, 0) / eqTotal;
    var allowThematic = !ips.exclude[0] && (SAT.allow_for || []).indexOf(prof.key) >= 0 && thematicShare <= (SAT.thematic_max_share_of_equity || 0);
    if (+ans.regime === 0 && F.some(function (f) { return f.rec && f.rec.cat === 'elss'; })) ips.flags.push({ k: 'elss', text: 'Under the new tax regime an ELSS fund earns no deduction, so it is judged here purely as an equity fund with a three-year lock on each purchase.' });

    // ---- 3. verdicts ----
    // Keep line: the score at the keep_from_rank point of the fund's category (0.40 means the top 60% are kept).
    var keepFrom = V.keep_from_rank == null ? 0.5 : V.keep_from_rank, lineCache = {};
    function keepLine(rec) {
      if (!rec) return null;
      var grp = rec.isIndex ? 'index:' + (rec.indexGroup || rec.cat) : rec.cat;
      if (lineCache[grp] !== undefined) return lineCache[grp];
      var scores = Object.keys(S.funds).map(function (i) { return S.funds[i]; }).filter(function (r) {
        return r && r.score != null && !r.tooNew && (rec.isIndex ? (r.isIndex && (r.indexGroup || r.cat) === (rec.indexGroup || rec.cat)) : (!r.isIndex && r.cat === rec.cat));
      }).map(function (r) { return r.score; }).sort(function (a, b) { return a - b; });
      lineCache[grp] = scores.length ? scores[Math.min(scores.length - 1, Math.floor(keepFrom * scores.length))] : null;
      return lineCache[grp];
    }
    var pl = R.label(prof.key, cfg).toLowerCase();
    function fits(f) {
      if (f.cls.sub === 'outside') return false;
      if (f.cls.sub === 'thematic') return allowThematic && !!(f.rec && f.rec.score != null && keepLine(f.rec) != null && f.rec.score >= keepLine(f.rec));
      if (f.cls.sub === 'large_mid') return target.large > 0 && target.mid > 0;
      return (target[f.cls.sub] || 0) > 0;
    }
    function compared(rec) {
      if (!rec) return 'Not scored';
      if (rec.isIndex) return 'Other direct index funds on the same index (' + (rec.bvia || 'peers') + ')';
      if (rec.bsrc === 'index_fund_proxy') return rec.bvia + ' (an index fund on the ' + rec.bname + ', used in place of the index itself)';
      if (rec.bsrc === 'licensed_index') return rec.bname + ' (licensed index data)';
      return 'Peers: ' + rec.bvia + ' (a peer comparison, not a benchmark)';
    }
    function consText(rec) {
      if (rec.isIndex) return 'An index fund, judged only on cost (expense ratio ' + rec.ter + '%) and on tracking: ' +
        (rec.td != null ? (rec.td >= 0 ? 'returned ' + rec.td.toFixed(2) + '% a year more' : 'returned ' + Math.abs(rec.td).toFixed(2) + '% a year less') + ' than the median fund on the same index over three years.' : 'too few funds on the same index to compare tracking.');
      var who = rec.bsrc === 'index_fund_proxy' ? 'its benchmark' : 'the median of its peers';
      return 'Beat ' + who + ' in ' + rec.beat + ' of ' + rec.nw + ' three-year periods (' + pct(rec.cons) + '), by a median ' +
        (rec.margin >= 0 ? '+' : '') + rec.margin.toFixed(1) + '% a year, compared against ' + (rec.bsrc === 'index_fund_proxy' ? 'the ' + rec.bvia : 'the ' + rec.bvia) + '.' +
        (rec.bsrc === 'category_peers' ? ' This is a peer comparison, not a benchmark comparison.' : '');
    }
    function better(a, b) { return (a.rec && a.rec.score != null ? a.rec.score : -1) > (b.rec && b.rec.score != null ? b.rec.score : -1); }

    F.forEach(function (f) {
      var rec = f.rec, line = keepLine(rec);
      f.compared = compared(rec);
      if (!rec) { f.verdict = 'unscored'; f.reasons.push('Not in the scored universe (it may be closed-ended, a fund of funds, or merged into another scheme), so the rules cannot judge it.'); return; }
      if (rec.cat === 'credit_risk' && V.credit_risk_flag) { f.flag = 'credit'; f.reasons.push('A credit risk fund: it lends to lower-rated borrowers, so a credit event can hurt in ways past returns do not show. Scored like any debt fund, but worth a closer look.'); }
      if (rec.tooNew || rec.months < V.review_history_below_months || (!rec.isIndex && rec.cons == null)) {
        f.verdict = 'review'; f.tooNew = true;
        f.reasons.push('Too new to judge: ' + Math.floor(rec.months / 12) + ' years ' + (rec.months % 12) + ' months of history, and at least ' + cfg.scoring.min_windows + ' three-year periods are needed.');
        return;
      }
      if (!fits(f)) {
        f.verdict = 'reduce';
        f.reasons.push(f.cls.sub === 'thematic' ? (ips.exclude[0] ? 'A sector or theme fund, and your policy says to avoid them.'
            : (SAT.allow_for || []).indexOf(prof.key) < 0 ? 'A sector or theme fund: a concentrated bet with no place in a ' + pl + ' policy.'
            : thematicShare > (SAT.thematic_max_share_of_equity || 0) ? 'Sector and theme funds are ' + pct(thematicShare) + ' of your equity, above the ' + pct(SAT.thematic_max_share_of_equity) + ' satellite your policy allows.'
            : 'A sector or theme fund scoring below its category keep line; the policy keeps only theme funds that earn their place.')
          : f.cls.sub === 'small' && ips.exclude[1] ? 'You asked to avoid small cap funds, so they have no share in your mix.'
          : (f.cls.sub === 'outside' ? 'Its category (' + rec.catLabel + ') is outside the target mix.' : 'Its category (' + rec.catLabel + ') has no share in the target mix for a ' + pl + ' profile.'));
        f.reasons.push(consText(rec));
        return;
      }
      if (!rec.isIndex && rec.cons < V.replace_consistency_below) { f.verdict = 'replace'; f.reasons.push(consText(rec)); return; }
      // a better-scored fund the client already holds in the same category, or overlapping heavily
      // Compare with the best fund held in the same category (the one that stays), then with heavy overlap.
      var rival = null, why = null;
      F.forEach(function (g) {
        if (g === f || !g.rec || g.rec.tooNew) return;
        var same = rec.isIndex ? (g.rec.indexGroup && g.rec.indexGroup === rec.indexGroup) : (g.rec.cat === rec.cat);
        if (same && better(g, f) && (!rival || why !== 'same' || better(g, rival))) { rival = g; why = 'same'; }
      });
      if (!rival) F.forEach(function (g) {
        if (g === f || !g.rec || g.rec.tooNew) return;
        var ov = overlap(f.dg, g.dg, H);
        if (ov != null && ov > V.overlap_replace_above && better(g, f) && (!rival || better(g, rival))) { rival = g; why = 'overlap'; f.ov = ov; }
      });
      if (rival) {
        f.verdict = 'replace'; f.rival = rival.name;
        f.reasons.push(why === 'same' ? 'You also hold ' + rival.name + ' in the same category, and it scores higher (' + rival.rec.score + ' against ' + rec.score + ' out of 100). Keep the better one.'
          : 'Overlaps ' + pct(f.ov) + ' with ' + rival.name + ', which scores higher (' + rival.rec.score + ' against ' + rec.score + '). Two funds holding the same companies add cost, not spread.');
        f.reasons.push(consText(rec));
        return;
      }
      if (!rec.isIndex && rec.cons < V.review_consistency_below) { f.verdict = 'review'; f.reasons.push(consText(rec) + ' Borderline, so it is left for review.'); return; }
      if (rec.score != null && line != null && rec.score >= line) { f.verdict = 'keep'; f.reasons.push(consText(rec)); f.reasons.push('Scores ' + Math.round(rec.score) + ' out of 100 among ' + rec.catLabel.toLowerCase() + ' funds, above the keep line of ' + Math.round(line) + '.'); return; }
      if (rec.score == null || line == null) { f.verdict = 'review'; f.reasons.push(consText(rec)); f.reasons.push('No score could be worked out, so it is left for a person to review.'); return; }
      f.verdict = V.below_keep_line || 'review';
      f.reasons.push('Scores ' + Math.round(rec.score) + ' out of 100 among ' + rec.catLabel.toLowerCase() + ' funds, below the keep line of ' + Math.round(line) + ' (the top ' + Math.round(100 * (1 - keepFrom)) + '% of the category are kept).');
      f.reasons.push(consText(rec));
    });
    if (cfg.switching.suggest_direct !== false) F.forEach(function (f) { if (f.regular) f.direct = true; });
    F.forEach(function (f) { if (f.cls.sub === 'thematic' && f.verdict !== 'reduce') f.reasons.unshift('Held as a satellite: sector and theme funds are ' + pct(thematicShare) + ' of your equity, within the ' + pct(SAT.thematic_max_share_of_equity) + ' your policy allows.'); });

    // ---- 4. additions ----
    var kept = F.filter(function (f) { return f.verdict !== 'replace' && f.verdict !== 'reduce'; });
    var keptB = bucketsOf(kept), amcCount = {};
    kept.forEach(function (f) { if (f.rec) amcCount[f.rec.amc] = (amcCount[f.rec.amc] || 0) + 1; });
    var heldDg = {}; F.forEach(function (f) { heldDg[f.dg] = 1; });
    var SUBCATS = { large: ['large_cap'], flexi: ['flexi_cap', 'multi_cap'], mid: ['mid_cap'], small: ['small_cap'], hybrid: cfg.hybrid_categories,
      liquid: ['liquid', 'money_market'], core: ['short_duration', 'corporate_bond'] };
    var LABELS = { large: 'Large cap', flexi: 'Flexi or multi cap', mid: 'Mid cap', small: 'Small cap', hybrid: 'Hybrid', liquid: 'Liquid or money market', core: 'Short duration or corporate bond' };
    var eqFunds = kept.filter(function (f) { return f.cls.sleeve === 'equity'; }).length;
    var maxEq = ips.maxFunds ? Math.max(2, Math.min(cfg.ceilings.max_equity_funds, ips.maxFunds - 2)) : cfg.ceilings.max_equity_funds; // room for debt and hybrid
    plan.maxEq = maxEq;
    Object.keys(SUBCATS).forEach(function (sub) {
      var gap = target[sub] * total - keptB[sub];
      if (gap <= A.gap_threshold * total) return;
      var existing = kept.filter(function (f) { return f.cls.sub === sub && f.verdict === 'keep'; })[0];
      var add = { sub: sub, label: LABELS[sub], gap: gap, gapPct: gap / total };
      if (existing) { add.topUp = existing.name; add.reason = 'You already hold a good ' + LABELS[sub].toLowerCase() + ' fund, so add to it rather than open another.'; plan.additions.push(add); return; }
      var isEq = ['large', 'flexi', 'mid', 'small'].indexOf(sub) >= 0;
      if (isEq && eqFunds >= maxEq) { add.skipped = 'You are keeping ' + eqFunds + ' equity funds, ' + (eqFunds > maxEq ? 'more than' : 'already') + ' the ' + maxEq + ' your policy allows, so it does not suggest another. Close this gap by adding to the funds you keep.'; plan.additions.push(add); return; }
      var pool = [];
      SUBCATS[sub].forEach(function (c) { (S.picks[c] || []).forEach(function (i) { if (S.funds[i]) pool.push(i); }); });
      pool.sort(function (a, b) { return S.funds[b].score - S.funds[a].score; });
      var picks = [], skippedWhy = [];
      pool.forEach(function (i) {
        if (picks.length >= 1 + A.alternatives || heldDg[i]) return;
        var r = S.funds[i];
        if ((amcCount[r.amc] || 0) >= cfg.ceilings.max_per_amc) { skippedWhy.push(r.n + ' (you already hold two funds from ' + r.amc + ')'); return; }
        var ovMax = null;
        if (isEq) kept.forEach(function (f) { if (f.cls.sleeve === 'equity') { var o = overlap(i, f.dg, H); if (o != null && (ovMax == null || o > ovMax)) ovMax = o; } });
        if (ovMax != null && ovMax > A.max_overlap_with_holdings) { skippedWhy.push(r.n + ' (overlaps ' + pct(ovMax) + ' with what you hold)'); return; }
        picks.push({ isin: i, n: r.n, score: r.score, cons: r.cons, beat: r.beat, nw: r.nw, ter: r.ter, aum: r.aum, catLabel: r.catLabel, compared: compared(r), overlap: ovMax, bsrc: r.bsrc, bname: r.bname,
          why: (picks.length ? 'Next best score' : 'Highest score') + ' among eligible ' + r.catLabel.toLowerCase() + ' funds (' + Math.round(r.score) + ' out of 100), ' + (r.aum ? Math.round(r.aum).toLocaleString('en-IN') + ' crore' : 'size unknown') + ', expense ratio ' + r.ter + '%' + (ovMax == null && isEq ? '. Overlap with your holdings is not known.' : '.') });
      });
      if (sub === 'large') {
        var ci = S.cheapestIndex[cfg.benchmarks.large_cap.index] || S.cheapestIndex['Nifty 50'];
        if (ci && S.funds[ci] && !picks.some(function (p) { return p.isin === ci; })) {
          var r = S.funds[ci], idx = { isin: ci, n: r.n, score: r.score, ter: r.ter, aum: r.aum, catLabel: 'Index fund', compared: compared(r), index: true, why: 'The cheapest index fund on the ' + cfg.benchmarks.large_cap.index + ' (expense ratio ' + r.ter + '%): the market return at the lowest cost.' };
          if (ips.exclude[2]) { picks.unshift(idx); picks = picks.slice(0, 1 + A.alternatives); } // asked to prefer index funds
          else if (picks.length > A.alternatives) picks[picks.length - 1] = idx; else picks.push(idx);
        }
      }
      add.pick = picks[0] || null; add.alts = picks.slice(1); add.skippedWhy = skippedWhy;
      if (isEq && add.pick) eqFunds++;
      if (add.pick) amcCount[S.funds[add.pick.isin] ? S.funds[add.pick.isin].amc : ''] = (amcCount[S.funds[add.pick.isin] ? S.funds[add.pick.isin].amc : ''] || 0) + 1;
      plan.additions.push(add);
    });

    // Monthly plan: the stated surplus goes to the sleeves that are short, in proportion to the gap.
    var gapAdds = plan.additions.filter(function (a) { return a.gap > 0; }), sumGap = gapAdds.reduce(function (s, a) { return s + a.gap; }, 0);
    plan.sip = { surplus: ips.sip.surplus, rows: [] };
    if (ips.sip.surplus > 0 && sumGap > 0) gapAdds.forEach(function (a) {
      a.monthly = ips.sip.surplus * a.gap / sumGap;
      plan.sip.rows.push({ label: a.label, monthly: a.monthly, into: a.topUp || (a.pick && a.pick.n) || null, months: Math.ceil(a.gap / a.monthly) });
    });

    // Every fund being replaced names where the money goes: a better fund already held in the
    // same category, else the sleeve's pick, else the best unheld fund in its category.
    F.forEach(function (f) {
      if (f.verdict !== 'replace') return;
      var dest = null;
      if (f.rival) dest = { name: f.rival, held: true };
      else {
        var cand = plan.additions.filter(function (a) { return a.pick && f.rec && SUBCATS[a.sub] && SUBCATS[a.sub].indexOf(f.rec.cat) >= 0; })[0];
        if (cand) dest = { name: cand.pick.n, isin: cand.pick.isin, held: false };
        else if (f.rec) { var best = (S.picks[f.rec.cat] || []).filter(function (i) { return !heldDg[i] && S.funds[i]; })[0]; if (best) dest = { name: S.funds[best].n, isin: best, held: false }; }
        if (!dest) { var keep = F.filter(function (g) { return g !== f && g.verdict === 'keep' && g.cls.sub === f.cls.sub; }).sort(function (a, b) { return (b.rec ? b.rec.score : 0) - (a.rec ? a.rec.score : 0); })[0]; if (keep) dest = { name: keep.name, held: true }; }
      }
      f.replaceWith = dest;
    });

    // Sleeves above target: no forced selling, but new money and sale proceeds should go elsewhere.
    plan.over = [];
    ['equity', 'hybrid', 'debt'].forEach(function (k) { var d = (plan.mix.current[k] || 0) - (tm[k] || 0); if (d > A.gap_threshold) plan.over.push({ sleeve: k, by: d }); });
    // Rebalancing: how much each sleeve is over by, what the scheduled sales already free up, and
    // which fund to trim if that is not enough (the weakest keep in the sleeve). New money first.
    plan.rebalance = plan.over.filter(function (o) { return o.by > ips.band; }).map(function (o) {
      var inSleeve = F.filter(function (f) { return f.cls.sleeve === o.sleeve; }), amount = o.by * total;
      var proceeds = inSleeve.filter(function (f) { return f.verdict === 'replace' || f.verdict === 'reduce'; }).reduce(function (s, f) { return s + f.value; }, 0);
      var trim = inSleeve.filter(function (f) { return f.verdict === 'keep'; }).sort(function (a, b) { return (a.rec ? a.rec.score : 0) - (b.rec ? b.rec.score : 0); })[0];
      return { sleeve: o.sleeve, by: o.by, amount: amount, proceeds: Math.min(proceeds, amount), remaining: Math.max(0, amount - proceeds), trim: trim && amount > proceeds ? trim.name : null };
    });

    // Hygiene read straight from the statement: nominee, KYC, payout options.
    plan.hygiene = [];
    var noNom = held.filter(function (h) { return h.nominee === false; }), badKyc = held.filter(function (h) { return h.kyc && !/^ok$/i.test(h.kyc); });
    var idcw = held.filter(function (h) { return /\bIDCW\b|dividend/i.test(h.name || '') && !/reinvest/i.test(h.name || ''); });
    var uniq = function (arr) { var seen = {}; return arr.filter(function (h) { var k = (h.folio || '') + '|' + h.isin; if (seen[k]) return false; seen[k] = 1; return true; }); };
    if (noNom.length) plan.hygiene.push({ k: 'nominee', n: uniq(noNom).length, names: uniq(noNom).map(function (h) { return h.name; }), text: 'No nominee on ' + uniq(noNom).length + (uniq(noNom).length === 1 ? ' folio' : ' folios') + '. Without one, your family needs a succession certificate to claim the units.' });
    if (badKyc.length) plan.hygiene.push({ k: 'kyc', n: uniq(badKyc).length, names: uniq(badKyc).map(function (h) { return h.name; }), text: 'KYC is not marked OK on ' + uniq(badKyc).length + (uniq(badKyc).length === 1 ? ' folio' : ' folios') + '. Fresh purchases and switches will be rejected until it is.' });
    if (idcw.length && +ans.incomeNeed !== 2) plan.hygiene.push({ k: 'idcw', n: idcw.length, names: idcw.map(function (h) { return h.name; }), text: idcw.length + (idcw.length === 1 ? ' fund pays' : ' funds pay') + ' out gains as IDCW, taxed at your slab each year. The growth option compounds instead.' });

    // ---- 5. switch costs and timing ----
    var exemptLeft = {}; exemptLeft[fyStart(today)] = Math.max(0, cfg.tax.ltcg_exemption - prof.booked);
    function budget(fy) { if (exemptLeft[fy] == null) exemptLeft[fy] = cfg.tax.ltcg_exemption; return exemptLeft[fy]; }
    var items = F.filter(function (f) { return f.verdict === 'replace' || f.verdict === 'reduce' || f.direct; });
    items.sort(function (a, b) { var p = { replace: 0, reduce: 2 }; return (p[a.verdict] != null ? p[a.verdict] : 1) - (p[b.verdict] != null ? p[b.verdict] : 1); });
    items.forEach(function (f) {
      var h = f.h, L = R.lots(h, I.parsed.period), def = cfg.exit_load_defaults[f.cls.index ? 'index' : f.cls.sub === 'liquid' ? 'liquid' : f.cls.sleeve === 'hybrid' ? 'hybrid' : f.cls.sleeve === 'debt' ? 'debt' : 'equity'];
      var el = h.exitLoad || def;
      f.exitLoadSource = h.exitLoad ? 'statement' : 'estimate';
      if (h.exitLoad && h.exitLoad.rate > 0 && !h.exitLoad.days) { el = { rate: h.exitLoad.rate, days: def.days || 365 }; f.exitLoadSource = 'statement rate, estimated period'; }
      f.lotNotes = L.approx;
      var gf = S.gf2018 ? S.gf2018[h.isin] : null, nav = h._nav;
      var action = f.verdict === 'replace' || f.verdict === 'reduce' ? 'sell' : 'direct';
      var allowYoung = f.rec && f.rec.cons != null && f.rec.cons < cfg.switching.sell_young_lot_if_consistency_below;
      var young = [], mature = [], locked = [];
      // ELSS units are locked in for three years from each purchase (an opening balance counts from the statement start, at the latest).
      var isElss = (f.rec && f.rec.cat === 'elss') || /\bELSS\b|tax saver|long term equity fund/i.test(f.name || '');
      if (isElss && L.lots.some(function (l) { return !l.d; })) f.reasons.push('An ELSS fund: units are locked in for three years from each purchase. This statement does not show when they were bought, so check that they are free before selling.');
      L.lots.forEach(function (l) {
        if (isElss && l.d && t(addYears(l.d, 3)) > t(today)) { locked.push(l); return; }
        var ageNow = l.d ? days(l.d, today) : 99999;
        if (f.cls.tax === 'equity' && ageNow < cfg.tax.equity_lt_days && !allowYoung) young.push(l); else mature.push(l);
      });
      // FIFO: mature lots are the older ones, so they go first; split across financial years by the exemption
      // Units are redeemed first in, first out, so lots cannot be cherry-picked: once a lot would
      // take this year's long-term gains past the tax-free allowance, it and every later lot wait.
      var fy = fyStart(today), now = [], next = [], gainSoFar = 0;
      mature.forEach(function (l) {
        if (next.length) { next.push(l); return; }
        var s = lotSale(l, nav, today, el, gf, f.cls.tax, cfg);
        var lt = f.cls.tax === 'equity' && s.held >= cfg.tax.equity_lt_days ? Math.max(0, s.gain) : 0;
        if (lt > 0 && gainSoFar + lt > budget(fy)) next.push(l); else { now.push(l); gainSoFar += lt; }
      });
      function costOf(lots, on, fyKey, pool) {
        var sales = lots.map(function (l) { return lotSale(l, nav, on, el, gf, f.cls.tax, cfg); });
        if (pool[fyKey] == null) pool[fyKey] = budget(fyKey);
        var tx = taxFor(sales, f.cls.tax, null, cfg, prof.slab, f.cls.tax === 'equity' ? pool[fyKey] : 0);
        if (f.cls.tax === 'equity') pool[fyKey] -= tx.exemptUsed;
        var load = sales.reduce(function (s, x) { return s + x.load; }, 0), gross = sales.reduce(function (s, x) { return s + x.gross; }, 0);
        return { units: lots.reduce(function (s, l) { return s + l.u; }, 0), gross: gross, load: load, tax: tx.tax, gain: tx.st + tx.lt, exemptUsed: tx.exemptUsed, cost: load + tx.tax };
      }
      // benefit over three years, conservatively
      var benefit = 0, benefitWhy = [];
      if (f.regular) {
        var regTer = I.schemes && I.schemes[h.isin] ? I.schemes[h.isin].ter : null, dirTer = f.rec ? f.rec.ter : null;
        if (regTer != null && dirTer != null && regTer > dirTer) { var b1 = f.value * (regTer - dirTer) / 100 * cfg.switching.benefit_years; benefit += b1; benefitWhy.push('lower expense ratio of the direct plan (' + regTer + '% to ' + dirTer + '%): about ' + inr(b1)); }
      }
      if (f.verdict === 'replace' && f.rec && f.rec.margin != null) {
        var cand = plan.additions.filter(function (a) { return a.pick && SUBCATS[a.sub].indexOf(f.rec.cat) >= 0; })[0], cr = cand ? S.funds[cand.pick.isin] : (S.picks[f.rec.cat] && S.funds[S.picks[f.rec.cat][0]]);
        if (cr && cr.margin != null && cr.margin > f.rec.margin) { var b2 = f.value * (cr.margin - f.rec.margin) / 100 * cfg.switching.benefit_years * cfg.switching.benefit_haircut; benefit += b2; benefitWhy.push('half the historical edge of ' + cr.n + ' over three years: about ' + inr(b2)); }
      }
      // Price the staged plan on a scratch copy of the allowances, then commit it only if it is worth doing.
      var pool = {}, steps = [];
      Object.keys(exemptLeft).forEach(function (k) { pool[k] = exemptLeft[k]; });
      var label = action === 'direct' ? 'Switch to the direct plan of the same fund' : (f.verdict === 'reduce' ? 'Sell (reduce)' : 'Sell (replace)');
      if (now.length) steps.push({ stage: 'now', c: costOf(now, today, fy, pool), part: next.length || young.length });
      if (next.length) { var nf = nextFy(today); steps.push({ stage: 'next', date: nf, c: costOf(next, nf, nf, pool), part: true, why: 'Selling these units now would push long-term gains past this year\'s ' + inr(cfg.tax.ltcg_exemption) + ' tax-free allowance.' }); }
      // Units go out first in, first out, so newer units cannot be sold before older ones still waiting for the next financial year.
      var floor = next.length ? nextFy(today) : null;
      var later = function (dd) { return floor && t(dd) < t(floor) ? floor : dd; };
      var fifoNote = function (dd) { return floor && t(dd) < t(floor) ? ' Older units of this fund are sold first, on ' + nice(floor) + ', so these go then too.' : ''; };
      var byDate = {};
      young.forEach(function (l) { var dd = addDays(l.d, cfg.tax.equity_lt_days + 1); (byDate[dd] = byDate[dd] || []).push(l); });
      Object.keys(byDate).sort().forEach(function (dd) {
        var open = byDate[dd].some(function (l) { return l.open; });
        var on = later(dd);
        steps.push({ stage: 'after', date: on, c: costOf(byDate[dd], on, fyStart(on), pool), part: true,
          why: (open ? 'Held since at least ' + nice(byDate[dd][0].d) + ', when the statement starts. Their real purchase date may be earlier; until a full statement shows it, wait until ' + nice(dd) + ' to be sure the gain is long term.'
            : 'Bought less than a year ago: wait until ' + nice(dd) + ' so the gain is long term and any exit load has lapsed.') + fifoNote(dd) });
      });
      // Locked ELSS units: one step a quarter, on the day the last of that quarter's units is free.
      var byQ = {};
      locked.forEach(function (l) { var u = addYears(l.d, 3), q = u.slice(0, 4) + 'Q' + Math.floor((+u.slice(5, 7) - 1) / 3); (byQ[q] = byQ[q] || []).push(l); });
      Object.keys(byQ).sort().forEach(function (q) {
        var g = byQ[q], dd = g.map(function (l) { return addYears(l.d, 3); }).sort().pop();
        var on = later(dd);
        steps.push({ stage: 'after', date: on, c: costOf(g, on, fyStart(on), pool), part: true,
          why: 'ELSS units are locked in for three years from purchase' + (g.some(function (l) { return l.open; }) ? ' (these are counted from the statement start, as their real purchase date is not shown)' : '') + '; these are free from ' + nice(dd) + '.' + fifoNote(dd) });
      });
      var totalCost = steps.reduce(function (sum, st) { return sum + st.c.cost; }, 0);
      f.switchCost = totalCost; f.benefit = benefit; f.benefitWhy = benefitWhy;
      if (f.verdict !== 'reduce' && totalCost > benefit) {
        f.hold = true;
        plan.holds.push({ name: f.name, verdict: f.verdict, direct: f.direct, cost: totalCost, benefit: benefit, why: 'Switching would cost about ' + inr(totalCost) + ' in exit load and tax, more than a conservative three-year estimate of ' + inr(benefit) + ' it would gain' + (benefitWhy.length ? ' (' + benefitWhy.join('; ') + ')' : '') + '. Hold for now and look again next year.' });
        return;
      }
      Object.keys(pool).forEach(function (k) { exemptLeft[k] = pool[k]; });
      steps.forEach(function (st) {
        plan.stages[st.stage].push({ name: f.name, action: label, into: f.verdict === 'replace' && f.replaceWith ? f.replaceWith.name : null, date: st.date, part: !!st.part, units: st.c.units, value: st.c.gross, load: st.c.load, tax: st.c.tax, cost: st.c.cost, exemptUsed: st.c.exemptUsed, why: st.why });
      });
    });
    plan.stages.after.sort(function (a, b) { return t(a.date) - t(b.date); });

    // ---- 6. missed gains against the index-fund proxy ----
    F.forEach(function (f) {
      if (f.cls.sleeve !== 'equity' || f.cls.index) return;
      var rec = f.rec, h = f.h, row = { name: f.name };
      if (!rec || rec.bsrc !== 'index_fund_proxy') { row.skip = 'No index-fund comparison is available for this fund (it is compared with peers), so missed gains are not shown.'; plan.missed.push(row); return; }
      if (h.opening > 0.0005) { row.skip = 'The statement starts part way through this fund\'s history (it opens with a balance), so its early purchases are not known. A statement from your first investment would show this.'; plan.missed.push(row); return; }
      if (!h.txns || !h.txns.length) { row.skip = 'This statement carries no transactions for this fund.'; plan.missed.push(row); return; }
      var P = I.proxyNavs ? I.proxyNavs[rec.bisin] : null;
      if (!P) { row.skip = 'Daily prices for the comparison fund are not available.'; plan.missed.push(row); return; }
      var navOn = function (d) { var k = days(P.d0, d); return k >= 0 && k < P.nav.length ? P.nav[k] : null; };
      var end = asOn || today, units = 0, flows = [], fflows = [], ok = true;
      h.txns.slice().sort(function (a, b) { return t(a.d) - t(b.d); }).forEach(function (x) {
        var p = navOn(x.d); if (!p) { ok = false; return; }
        if (x.units > 0) { units += Math.abs(x.amt) / p; flows.push({ d: x.d, v: -Math.abs(x.amt) }); }
        else { units -= Math.abs(x.amt) / p; flows.push({ d: x.d, v: Math.abs(x.amt) }); }
      });
      var pe = navOn(end);
      if (!ok || !pe) { row.skip = 'Some purchases are older than the comparison fund (' + P.n + '), so the comparison cannot be made.'; plan.missed.push(row); return; }
      var proxyVal = Math.max(0, units) * pe, actual = h.value;
      fflows = flows.concat([{ d: end, v: actual }]);
      row.proxyName = P.n; row.actual = actual; row.proxy = proxyVal; row.diff = actual - proxyVal;
      row.asOf = end;
      // A yearly rate over a few months is misleading (a 2% dip reads as -30% a year), so it is shown only after a year.
      var span = days(flows[0].d, end);
      if (span < 365) row.months = Math.max(1, Math.round(span / 30.4));
      else { row.xirrFund = xirr(fflows); row.xirrProxy = xirr(flows.concat([{ d: end, v: proxyVal }])); }
      plan.missed.push(row);
    });

    // ---- gap list: funds in this plan compared with peers, by the benchmark we would buy ----
    function gapAdd(rec, n) { if (!rec || rec.bsrc !== 'category_peers') return; var k = rec.bname || ('Category index for ' + rec.catLabel); (plan.gaps[k] = plan.gaps[k] || []).push(n); }
    F.forEach(function (f) { gapAdd(f.rec, f.name); });
    plan.additions.forEach(function (a) { [a.pick].concat(a.alts || []).forEach(function (p) { if (p) gapAdd(S.funds[p.isin], p.n); }); });

    plan.funds = F.map(function (f) {
      return { isin: f.isin, name: f.name, statementValue: f.h.value, value: f.value, verdict: f.verdict, direct: !!f.direct, hold: !!f.hold, tooNew: !!f.tooNew,
        reasons: f.reasons, compared: f.compared, bsrc: f.rec ? f.rec.bsrc : null, score: f.rec ? f.rec.score : null, catLabel: f.rec ? f.rec.catLabel : null,
        sleeve: f.cls.sleeve, sub: f.cls.sub, lotNotes: f.lotNotes || [], exitLoadSource: f.exitLoadSource, navMismatch: !!f.h._navMismatch, replaceWith: f.replaceWith || null, flag: f.flag || null };
    });
    var kinds = { equity: 'a share held directly', bond: 'a bond', sgb: 'a gold bond', other: 'another security' };
    plan.unjudged = F.filter(function (f) { return f.verdict === 'unscored'; }).map(function (f) { return { name: f.name, value: f.value, why: 'a fund the rules cannot score' }; })
      .concat((I.parsed.holdings || []).filter(function (h) { return (h.type || 'mf') !== 'mf' && h.value > 0; }).map(function (h) { return { name: h.name, value: h.value, why: kinds[h.type] || kinds.other }; }));
    if (F.some(function (f) { return f.h.opening > 0.0005; })) plan.notes.push('history');
    if (I.parsed.source !== 'cams') plan.notes.push('no_lots');
    return plan;
  };

  if (typeof module === 'object' && module.exports) module.exports = R; else root.SOPlanRules = R;
})(typeof window !== 'undefined' ? window : this);
