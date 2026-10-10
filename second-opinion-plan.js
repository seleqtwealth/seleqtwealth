/* ============================================================
   Action plan (Phase 1, mutual funds): INTERNAL TESTING ONLY.
   After the report, a short risk profile produces keep / review / replace / add verdicts
   with reasons, switch costs and timing. Rules live in plan-rules.js; every threshold in
   data/plan-config.json. Everything runs on this device; the data files are fetched from
   this site only when the plan is started, and nothing personal is sent anywhere.

   THE SWITCH. PLAN.enabled stays false until compliance review. It shows on localhost, and
   on the live site only with ?plan=<key>. That key is not security (this file is public),
   only a way to keep the plan out of public view while it is tested. Do not set enabled
   to true without sign-off from SELEQT compliance.
   ============================================================ */
(function () {
  'use strict';
  var PLAN = { enabled: false, key: 'knnxnm6t5p1w' };
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  var viaKey = new URLSearchParams(location.search).get('plan') === PLAN.key;
  if (!(PLAN.enabled || local || viaKey)) return;

  var $ = function (id) { return document.getElementById(id); };
  var DATA = null, R = null, answers = {};
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function inr(n) { return n == null || isNaN(n) ? 'not known' : '₹' + Math.round(n).toLocaleString('en-IN'); }
  function nice(d) { if (!d) return ''; var p = d.split('-'); return +p[2] + ' ' + MON[+p[1] - 1] + ' ' + p[0]; }
  function pct(x, dp) { return x == null ? 'not known' : (x * 100).toFixed(dp == null ? 0 : dp) + '%'; }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ---- banner while the switch is on ----
  var banner = document.createElement('div');
  banner.className = 'sp-banner';
  banner.setAttribute('role', 'note');
  banner.textContent = 'Internal test of the action plan. Not investment advice. Not for clients.';
  document.body.insertBefore(banner, document.body.firstChild);

  function loadScript(src) { return new Promise(function (ok, bad) { var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = bad; document.head.appendChild(s); }); }
  function json(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(u); return r.json(); }); }
  function load() {
    if (DATA) return Promise.resolve(DATA);
    return Promise.all([loadScript('plan-rules.js'), json('data/plan-config.json'), json('data/fund-scores.json'), json('data/proxy-navs.json'), json('data/latest-navs.json').catch(function () { return null; })])
      .then(function (a) { R = window.SOPlanRules; DATA = { cfg: a[1], scores: a[2], proxy: a[3], latest: a[4] }; return DATA; });
  }

  // ---- entry point after each report ----
  document.addEventListener('so:report', function () {
    var old = $('spWrap'); if (old) old.remove();
    var wrap = document.createElement('section');
    wrap.id = 'spWrap'; wrap.className = 'sp-wrap';
    wrap.innerHTML = '<p class="so-eyebrow">Next step, internal test</p><h2 class="sp-title">Get my action plan</h2>' +
      '<p class="sp-lede">Seven short questions, then which of your mutual funds to keep, review, replace or add to, with what each switch would cost in exit load and tax, and when to do it. Worked out on this device.</p>' +
      '<button type="button" class="btn-primary" id="spStart">Get my action plan</button><div id="spBody"></div>';
    var lead = $('soLead');
    lead.parentNode.insertBefore(wrap, lead);
    $('spStart').addEventListener('click', function () { this.hidden = true; askProfile(); });
  });

  function askProfile() {
    $('spBody').innerHTML = '<p class="sp-lede">Loading the fund data...</p>';
    load().then(function () {
      var qs = R.QUESTIONS.map(function (q) {
        return '<fieldset class="sp-q"><legend>' + esc(q.q) + '</legend>' + q.a.map(function (a, i) {
          return '<label><input type="radio" name="sp_' + q.id + '" value="' + i + '"' + (i === 0 && q.id === 'slab' ? '' : '') + ' /> ' + esc(a) + '</label>';
        }).join('') + '</fieldset>';
      }).join('');
      $('spBody').innerHTML = '<form class="sp-form" id="spForm">' + qs +
        '<fieldset class="sp-q"><legend>Equity gains already booked this financial year (optional)</legend><label class="sp-num">₹ <input type="text" inputmode="numeric" name="sp_booked" placeholder="0" /></label>' +
        '<p class="sp-hint">The ₹1.25 lakh tax-free allowance is shared with gains you have already taken elsewhere, so the plan only uses what is left.</p></fieldset>' +
        '<p class="sp-err" id="spErr" hidden>Please answer every question.</p><button type="submit" class="btn-primary">Build my plan</button></form>';
      $('spForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var fd = new FormData(this), miss = false;
        R.QUESTIONS.forEach(function (q) { var v = fd.get('sp_' + q.id); if (v == null) miss = true; else answers[q.id] = +v; });
        answers.booked = parseFloat(String(fd.get('sp_booked') || '0').replace(/[^0-9.]/g, '')) || 0;
        if (miss) { $('spErr').hidden = false; return; }
        render();
      });
    }).catch(function () { $('spBody').innerHTML = '<p class="sp-lede">The fund data could not be loaded. Please try again.</p>'; });
  }

  function verdictTag(f) {
    var v = { keep: 'Keep', review: 'Review', replace: 'Replace', reduce: 'Reduce' }[f.verdict] || f.verdict;
    var tags = '<span class="sp-tag sp-' + f.verdict + '">' + v + '</span>';
    if (f.direct && f.verdict !== 'replace' && f.verdict !== 'reduce') tags += '<span class="sp-tag sp-direct">Switch to direct</span>';
    if (f.hold) tags += '<span class="sp-tag sp-hold">Hold for now</span>';
    return tags;
  }
  function stageTable(rows, withDate) {
    if (!rows.length) return '<p class="sp-none">Nothing at this stage.</p>';
    return '<table class="sp-table"><thead><tr>' + (withDate ? '<th>Date</th>' : '') + '<th>Fund</th><th>Step</th><th>Value</th><th>Exit load</th><th>Tax</th><th>Cost</th></tr></thead><tbody>' +
      rows.map(function (s) {
        return '<tr>' + (withDate ? '<td>' + nice(s.date) + '</td>' : '') + '<td>' + esc(s.name) + '</td><td>' + esc(s.action) + (s.part ? ' (part)' : '') + (s.why ? '<span class="sp-why">' + esc(s.why) + '</span>' : '') +
          '</td><td>' + inr(s.value) + '</td><td>' + inr(s.load) + '</td><td>' + inr(s.tax) + '</td><td><strong>' + inr(s.cost) + '</strong></td></tr>';
      }).join('') + '</tbody></table>';
  }

  function render() {
    var D = DATA, L = window.SO_LAST, today = todayIso();
    var plan = R.build({ cfg: D.cfg, scores: D.scores, H: L.data.holdings, schemes: L.data.schemes, proxyNavs: D.proxy, latest: D.latest, parsed: L.parsed, answers: answers, today: today });
    var cfg = D.cfg, out = [];
    var profName = plan.profile.key.charAt(0).toUpperCase() + plan.profile.key.slice(1);
    out.push('<div class="sp-head"><p class="sp-meta">Profile: <strong>' + profName + '</strong> (' + plan.profile.points + ' of ' + plan.profile.max + ' points' +
      (plan.profile.capped ? '; capped because this money is needed within five years' : '') + '). ' +
      (plan.asOn ? 'Statement as on ' + nice(plan.asOn) + '. ' : '') + (plan.navDate ? 'Values updated to NAVs of ' + esc(plan.navDate) + '.' : '') + '</p>' +
      (plan.stale ? '<div class="so-flag"><span><strong>This statement is more than 30 days old.</strong> Funds bought or sold since then are not in this plan. Request a fresh statement for an up to date plan.</span></div>' : '') +
      (plan.notes.indexOf('history') >= 0 ? '<div class="so-note-card"><span><strong>Part of your history is missing.</strong> This statement starts part way through, so units held at its start are treated as bought on or before ' + nice(L.parsed.period && L.parsed.period.from) + ', with their cost shared out from the statement\'s total cost. Request a statement for a Specific Period starting from your first investment for exact lot dates, tax and missed gains.</span></div>' : '') +
      (plan.notes.indexOf('no_lots') >= 0 ? '<div class="so-note-card"><span><strong>Costs are approximate.</strong> Depository statements carry a total cost for each fund but not the purchase dates, so switch costs and tax timing are estimates. A Detailed CAMS statement gives exact figures.</span></div>' : '') + '</div>');

    if (plan.empty) {
      out.push('<div class="so-note-card"><span>This statement shows no mutual funds held today, so there is nothing to keep, switch or add against. Once you hold funds, load a recent statement and the plan will cover them.</span></div>');
      $('spBody').innerHTML = out.join('') + method(plan, cfg);
      return;
    }

    // Mix: target against current
    var mixRow = function (k, label) { var t = plan.mix.target[k] || 0, c = plan.mix.current[k] || 0; return '<tr><td>' + label + '</td><td>' + pct(t) + '</td><td>' + pct(c) + '</td><td class="sp-bar"><span class="sp-b-t" style="width:' + (t * 100).toFixed(1) + '%"></span><span class="sp-b-c" style="width:' + (c * 100).toFixed(1) + '%"></span></td></tr>'; };
    out.push('<section class="so-sec"><div class="so-sec-label">Target mix</div><h3 class="so-sec-head">What a ' + plan.profile.key + ' portfolio holds, against yours</h3>' +
      '<table class="sp-table sp-mix"><thead><tr><th>Sleeve</th><th>Target</th><th>Yours</th><th></th></tr></thead><tbody>' + mixRow('equity', 'Equity') + mixRow('hybrid', 'Hybrid') + mixRow('debt', 'Debt') +
      (plan.mix.current.other ? mixRow('other', 'Other (not in the plan yet)') : '') + '</tbody></table>' +
      '<p class="sp-hint">Your mutual funds total ' + inr(plan.total) + ' at today\'s NAVs (' + inr(plan.statementTotal) + ' in the statement). Shares, bonds and gold come in a later version.</p></section>');

    // Fund cards
    out.push('<section class="so-sec"><div class="so-sec-label">Your funds</div><h3 class="so-sec-head">Keep, review, replace</h3>' + plan.funds.map(function (f) {
      return '<article class="sp-card"><div class="sp-card-top"><h4>' + esc(f.name) + '</h4><div>' + verdictTag(f) + '</div></div>' +
        '<p class="sp-vals">' + inr(f.value) + ' today' + (Math.abs(f.value - f.statementValue) > 1 ? ' (' + inr(f.statementValue) + ' in the statement)' : '') + (f.catLabel ? ', ' + esc(f.catLabel) : '') + '</p>' +
        '<ul class="sp-reasons">' + f.reasons.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul>' +
        '<p class="sp-cmp"><strong>Compared against:</strong> ' + esc(f.compared) + '</p>' +
        (f.direct && f.verdict !== 'replace' && f.verdict !== 'reduce' ? '<p class="sp-cmp">A regular plan. The plan moves it to the direct plan of the same fund, which pays no distributor commission.</p>' : '') +
        (f.exitLoadSource === 'estimate' ? '<p class="sp-cmp">Exit load is an estimate for its category; the statement does not state it.</p>' : '') +
        (f.navMismatch ? '<p class="sp-cmp">Today\'s NAV did not match the statement\'s units closely, so the statement value is used.</p>' : '') + '</article>';
    }).join('') + '</section>');

    // Additions
    var overTxt = (plan.over || []).map(function (o) { return o.sleeve + ' is ' + pct(o.by) + ' above target'; });
    out.push('<section class="so-sec"><div class="so-sec-label">Additions</div><h3 class="so-sec-head">Where the mix falls short</h3>' +
      (overTxt.length ? '<p class="sp-hint">' + esc(overTxt.join(', ').replace(/^./, function (c) { return c.toUpperCase(); })) + '. The plan does not sell just to rebalance; direct new money and the proceeds of the sales below to the sleeves that are short.</p>' : '') + (plan.additions.length ? plan.additions.map(function (a) {
      var head = '<h4>' + esc(a.label) + ': short by ' + inr(a.gap) + ' (' + pct(a.gapPct) + ' of the portfolio)</h4>';
      if (a.topUp) return '<article class="sp-card">' + head + '<p>' + esc(a.reason) + ' Add to <strong>' + esc(a.topUp) + '</strong>.</p></article>';
      if (a.skipped || !a.pick) return '<article class="sp-card">' + head + '<p>' + esc(a.skipped || 'No eligible fund passed the screen.') + '</p></article>';
      var opt = function (p, tag) { return '<li><strong>' + esc(p.n) + '</strong> (direct, growth)' + (tag ? ' <span class="sp-tag">' + tag + '</span>' : '') + '<span class="sp-why">' + esc(p.why) + ' Compared against: ' + esc(p.compared) + '.</span></li>'; };
      return '<article class="sp-card">' + head + '<ul class="sp-picks">' + opt(a.pick, 'Pick') + a.alts.map(function (p) { return opt(p, p.index ? 'Index alternative' : 'Alternative'); }).join('') + '</ul>' +
        (a.skippedWhy && a.skippedWhy.length ? '<p class="sp-hint">Passed over: ' + esc(a.skippedWhy.slice(0, 3).join('; ')) + '.</p>' : '') + '</article>';
    }).join('') : '<p class="sp-none">No sleeve is short of its target by more than ' + pct(cfg.additions.gap_threshold) + ' of the portfolio.</p>') + '</section>');

    // Switch plan in three stages
    out.push('<section class="so-sec"><div class="so-sec-label">Switch plan</div><h3 class="so-sec-head">What to do, when, and what it costs</h3>' +
      '<h4 class="sp-stage">Now</h4>' + stageTable(plan.stages.now) +
      '<h4 class="sp-stage">After a date</h4>' + stageTable(plan.stages.after, true) +
      '<h4 class="sp-stage">Next financial year</h4>' + stageTable(plan.stages.next, true) +
      (plan.holds.length ? '<h4 class="sp-stage">Hold for now</h4><ul class="sp-reasons">' + plan.holds.map(function (h) { return '<li><strong>' + esc(h.name) + ':</strong> ' + esc(h.why) + '</li>'; }).join('') + '</ul>' : '') +
      '<p class="sp-hint">Tax uses your ' + pct(plan.profile.slab) + ' slab for debt funds, 20% for equity held under a year, 12.5% above the ₹1.25 lakh yearly allowance for longer, plus 4% cess. Surcharge is not included. Units are sold first in, first out, as the tax rules require.</p></section>');

    // Missed gains
    out.push('<section class="so-sec"><div class="so-sec-label">Missed gains</div><h3 class="so-sec-head">Your actual purchases, run through an index fund on paper</h3>' + (plan.missed.length ? '<ul class="sp-reasons">' + plan.missed.map(function (m) {
      if (m.skip) return '<li><strong>' + esc(m.name) + ':</strong> ' + esc(m.skip) + '</li>';
      return '<li><strong>' + esc(m.name) + ':</strong> worth ' + inr(m.actual) + ' on ' + nice(m.asOf) + '. The same purchases and redemptions in the ' + esc(m.proxyName) + ' would be worth ' + inr(m.proxy) +
        ', a difference of ' + (m.diff >= 0 ? inr(m.diff) + ' in your favour' : inr(-m.diff) + ' against you') + '. XIRR ' + pct(m.xirrFund, 1) + ' against ' + pct(m.xirrProxy, 1) + '.</li>';
    }).join('') + '</ul>' : '<p class="sp-none">No equity funds to compare.</p>') + '</section>');

    $('spBody').innerHTML = out.join('') + method(plan, cfg);
  }

  function method(plan, cfg) {
    var gaps = Object.keys(plan.gaps || {}).map(function (k) { return '<li>' + esc(k) + ': ' + esc(plan.gaps[k].join(', ')) + '</li>'; }).join('');
    var per = (plan.funds || []).map(function (f) { return '<li>' + esc(f.name) + ': ' + esc(f.bsrc || 'not scored') + '</li>'; }).join('');
    return '<details class="so-method" open><summary>How this plan was worked out</summary><ul>' +
      '<li><strong>The thresholds and weights are starting values awaiting sign-off by the SELEQT investment team.</strong> They live in one configuration file (version ' + esc(cfg.version) + ').</li>' +
      '<li>Rules, not AI. Each fund is scored 0 to 100 within its SEBI category from three-year periods stepped monthly over seven years: consistency in beating its benchmark (35%), the median margin (20%), downside capture (15%), expense ratio (15%) and fund size (15%). Index funds are judged only on cost and tracking.</li>' +
      '<li>Benchmarks: licensed index data is not used yet. Where an index fund on the right index has enough history, it stands in for the index (index_fund_proxy). Otherwise, and for every debt and hybrid fund, the fund is compared with the median of its direct-plan peers (category_peers), which is a peer comparison, not a benchmark comparison.</li>' +
      (per ? '<li>Benchmark source per fund:<ul>' + per + '</ul></li>' : '') +
      (gaps ? '<li>Funds in this plan compared with peers, by the benchmark that would replace the peer comparison:<ul>' + gaps + '</ul></li>' : '') +
      '<li>Data: AMFI NAV history and scheme master, AMFI expense ratios and average AUM, and each fund\'s published portfolio for overlap (top holdings only, so overlap is understated). Built ' + esc(DATA.scores.built) + ', NAVs to ' + esc(DATA.scores.asof) + '.</li>' +
      '<li>Additions are direct plans, growth option, at least five years old and ' + cfg.additions.min_aum_cr.toLocaleString('en-IN') + ' crore in size, the best score in their category, skipping fund houses you already hold twice and funds overlapping more than ' + pct(cfg.additions.max_overlap_with_holdings) + ' with your equity funds.</li>' +
      '<li>A switch is skipped when its cost is more than a conservative three-year estimate of what it gains, counting only half of the historical edge.</li>' +
      '</ul></details>';
  }
})();
