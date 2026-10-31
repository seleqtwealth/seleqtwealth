/* ============================================================
   Action plan (Phase 1, mutual funds): INTERNAL TESTING ONLY.
   After the report, an investment-policy intake produces a written policy and keep / review / replace / add verdicts
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

  // ---- icons (stroke, inherit colour) ----
  var svg = function (d) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var ICON = {
    check: svg('<path d="M5 12l5 5L20 7"/>'), eye: svg('<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    swap: svg('<path d="M7 7h11M14 3l4 4-4 4M17 17H6M10 13l-4 4 4 4"/>'), minus: svg('<path d="M5 12h14"/>'), chevron: svg('<path d="M6 9l6 6 6-6"/>'),
    alert: svg('<path d="M12 9v4M12 17h.01M10.3 3.9L2.6 17a2 2 0 001.7 3h15.4a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>'),
    goal: {
      0: svg('<path d="M3 17h18M5 17a7 7 0 0114 0M12 3v3M4.9 7.9l2.1 2.1M19.1 7.9L17 10"/>'), 1: svg('<path d="M4 19V5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19a2 2 0 002 2h13"/>'),
      2: svg('<path d="M12 21s-7-4.5-7-10a4 4 0 017-2.6A4 4 0 0119 11c0 5.5-7 10-7 10z"/>'), 3: svg('<path d="M3 11l9-8 9 8M5 10v10h14V10M10 20v-6h4v6"/>'),
      4: svg('<path d="M3 13l2-5h14l2 5v5H3zM6 18v2M18 18v2"/><circle cx="7" cy="15" r="1"/><circle cx="17" cy="15" r="1"/>'), 5: svg('<path d="M3 8h18v12H3zM8 8V5h8v3M3 13h18"/>'),
      6: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4"/>'), 7: svg('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
      8: svg('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>')
    }
  };

  // ---- entry point after each report ----
  document.addEventListener('so:report', function () {
    var old = $('spWrap'); if (old) old.remove();
    var wrap = document.createElement('section');
    wrap.id = 'spWrap'; wrap.className = 'sp-wrap';
    wrap.innerHTML = '<p class="so-eyebrow">Next step, internal test</p><h2 class="sp-title">Now, what should you do about it?</h2>' +
      '<p class="sp-lede">A few questions about you, your goals and how you handle falls. One at a time, about four minutes, and you can skip anything you would rather not answer. You get a written investment policy and a plan: which funds to keep, review or replace, what to add, and what each move costs in exit load and tax. Nothing leaves this device.</p>' +
      '<div class="sp-start"><button type="button" class="btn-primary" id="spStart">Start</button><small>About four minutes</small>' + (local ? '<button type="button" class="sp-dev" id="spDemo">Fill with sample answers</button>' : '') + '</div><div id="spBody"></div>';
    var lead = $('soLead');
    lead.parentNode.insertBefore(wrap, lead);
    $('spStart').addEventListener('click', function () { $('spStart').parentNode.hidden = true; startWizard(); });
    if ($('spDemo')) $('spDemo').addEventListener('click', function () {
      $('spStart').parentNode.hidden = true;
      answers = { age: 1, dependants: 1, income: 0, expenses: 120000, emergency: 1, emi: 1, insurance: 1, share: 1, surplus: 60000, hasGoal: 0,
        goals: [{ type: 0, year: new Date().getFullYear() + 20, amount: 50000000, priority: 0 }, { type: 1, year: new Date().getFullYear() + 8, amount: 5000000, priority: 0 }, { type: 4, year: new Date().getFullYear() + 2, amount: 1500000, priority: 2 }],
        returnNeed: 2, incomeNeed: 0, fall: 2, drawdown: 2, exp: 3, tradeoff: 2, behaviour: 2, slab: 6, regime: 0, residency: 0, simplicity: 1, exclude: {}, withdrawals: 0, booked: 0 };
      $('spBody').innerHTML = '<p class="sp-lede">Loading the fund data...</p>';
      load().then(render).catch(function () { $('spBody').innerHTML = '<p class="sp-lede">The fund data could not be loaded. Please try again.</p>'; });
    });
  });

  // ---- the intake, one question at a time ----
  var PRESETS = {
    expenses: [30000, 50000, 75000, 100000, 150000, 250000], surplus: [0, 10000, 25000, 50000, 100000, 200000],
    withdrawals: [0, 100000, 500000, 1000000, 2500000], booked: [0, 50000, 100000, 200000, 500000],
    goalAmount: [1000000, 2500000, 5000000, 10000000, 20000000, 50000000], goalYears: [2, 3, 5, 7, 10, 15, 20, 25, 30]
  };
  var ZERO_LABEL = { surplus: 'Nothing right now', withdrawals: 'None planned', booked: 'None yet', expenses: 'None' };
  function short(n) {
    n = +n || 0;
    if (n >= 1e7) return '₹' + (n % 1e7 ? (n / 1e7).toFixed(1) : n / 1e7) + ' Cr';
    if (n >= 1e5) return '₹' + (n % 1e5 ? (n / 1e5).toFixed(1) : n / 1e5) + ' L';
    return '₹' + Math.round(n / 1000) + 'k';
  }
  var step = 0, SECTION = {};
  function visible() { return R.QUESTIONS.filter(function (q) { return !q.showIf || q.showIf(answers); }); }
  function startWizard() {
    $('spBody').innerHTML = '<p class="sp-lede">Loading the fund data...</p>';
    load().then(function () {
      R.SECTIONS.forEach(function (s) { SECTION[s.id] = s; }); answers = {}; step = 0; screen();
      if (local) window.__sp = { go: function (n) { step = n; screen(); }, answers: function () { return answers; } }; // local testing only
    })
      .catch(function () { $('spBody').innerHTML = '<p class="sp-lede">The fund data could not be loaded. Please try again.</p>'; });
  }
  function chip(label, on, attrs) { return '<button type="button" class="sp-chip' + (on ? ' is-on' : '') + '" ' + attrs + '>' + esc(label) + '</button>'; }
  function screen() {
    var V = visible(), N = V.length; if (step >= N) step = N - 1;
    var q = V[step], sec = SECTION[q.sec], body = '', needsNext = q.type != null;
    if (q.type === 'amount') {
      var cur = answers[q.id];
      body = '<div class="sp-chips">' + PRESETS[q.id].map(function (v) { return chip(v === 0 ? (ZERO_LABEL[q.id] || 'None') : short(v), cur === v, 'data-amt="' + v + '"'); }).join('') +
        chip('Another amount', cur != null && PRESETS[q.id].indexOf(cur) < 0, 'data-amt="custom"') + '</div>' +
        '<div class="sp-custom" id="spCustom"' + (cur != null && PRESETS[q.id].indexOf(cur) < 0 ? '' : ' hidden') + '>₹ <input type="text" inputmode="numeric" id="spCustomIn" placeholder="Type an amount" value="' + (cur != null && PRESETS[q.id].indexOf(cur) < 0 ? cur : '') + '" /></div>';
    } else if (q.type === 'multi') {
      var on = answers[q.id] || {};
      body = '<div class="sp-chips">' + q.a.map(function (a, i) { return chip(a, !!on[i], 'data-multi="' + i + '"'); }).join('') + chip('None of these', answers[q.id] && !Object.keys(on).some(function (k) { return on[k]; }), 'data-multi="none"') + '</div>';
    } else if (q.type === 'goals') {
      var G = answers.goals || [], year = new Date().getFullYear();
      body = '<div class="sp-goalgrid">' + R.GOAL_TYPES.map(function (t, i) {
        var g = G.filter(function (x) { return x.type === i; })[0];
        return '<button type="button" class="sp-goal' + (g ? ' is-on' : '') + '" data-goal="' + i + '">' + ICON.goal[i] + '<span>' + esc(t) + '</span>' + (g && g.year && g.amount ? '<small>' + esc(short(g.amount)) + ' by ' + g.year + '</small>' : '') + '</button>';
      }).join('') + '</div><div id="spGoalDetails">' + G.map(function (g) { return goalDetail(g, year); }).join('') + '</div>';
    } else {
      body = '<div class="sp-opts">' + q.a.map(function (a, i) {
        return '<button type="button" class="sp-opt' + (answers[q.id] === i ? ' is-on' : '') + '" data-opt="' + i + '"><span>' + esc(a) + '</span><i>' + ICON.check + '</i></button>';
      }).join('') + '</div>';
    }
    $('spBody').innerHTML = '<div class="sp-wiz"><div class="sp-wiz-top"><strong>' + esc(sec.title) + '</strong><span>' + (step + 1) + ' of ' + N + '</span></div>' +
      '<div class="sp-progress"><span style="width:' + (100 * step / N).toFixed(1) + '%"></span></div>' +
      '<div class="sp-screen"><h3 class="sp-ask">' + esc(q.q) + '</h3>' + (q.hint || (q.type == null && step === 0) ? '<p class="sp-ask-hint">' + esc(q.hint || sec.lede) + '</p>' : '') + body +
      '<p class="sp-err" id="spErr" hidden></p><div class="sp-nav">' + (step > 0 ? '<button type="button" class="sp-back" id="spBack">Back</button>' : '<span></span>') +
      '<span class="sp-navr">' + (!q.dim ? '<button type="button" class="sp-back" id="spSkip">Skip</button>' : '') +
      (needsNext ? '<button type="button" class="sp-next" id="spNext">' + (step === N - 1 ? 'Write my policy' : 'Continue') + '</button>' : '<span class="sp-ask-hint" style="margin:0">Tap an answer to continue</span>') + '</span></div></div></div>';
    requestAnimationFrame(function () { var bar = document.querySelector('.sp-progress span'); if (bar) bar.style.width = (100 * (step + (needsNext ? 0 : 0)) / N).toFixed(1) + '%'; });
    var body_ = $('spBody');
    if ($('spBack')) $('spBack').addEventListener('click', function () { step--; screen(); });
    if ($('spNext')) $('spNext').addEventListener('click', advance);
    if ($('spSkip')) $('spSkip').addEventListener('click', function () { skip(q); });
    body_.querySelectorAll('[data-opt]').forEach(function (b) {
      b.addEventListener('click', function () {
        answers[q.id] = +b.getAttribute('data-opt');
        body_.querySelectorAll('[data-opt]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        setTimeout(advance, 260);
      });
    });
    body_.querySelectorAll('[data-amt]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-amt');
        body_.querySelectorAll('[data-amt]').forEach(function (x) { x.classList.toggle('is-on', x === b); });
        if (v === 'custom') { $('spCustom').hidden = false; $('spCustomIn').focus(); answers[q.id] = parseFloat(String($('spCustomIn').value).replace(/[^0-9.]/g, '')) || null; }
        else { $('spCustom').hidden = true; answers[q.id] = +v; }
      });
    });
    if ($('spCustomIn')) $('spCustomIn').addEventListener('input', function () { answers[q.id] = parseFloat(String(this.value).replace(/[^0-9.]/g, '')) || null; });
    body_.querySelectorAll('[data-multi]').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-multi'); answers[q.id] = answers[q.id] || {};
        if (v === 'none') { answers[q.id] = {}; body_.querySelectorAll('[data-multi]').forEach(function (x) { x.classList.toggle('is-on', x === b); }); return; }
        answers[q.id][+v] = !answers[q.id][+v]; b.classList.toggle('is-on', answers[q.id][+v]);
        var none = body_.querySelector('[data-multi="none"]'); if (none) none.classList.remove('is-on');
      });
    });
    body_.querySelectorAll('[data-goal]').forEach(function (b) {
      b.addEventListener('click', function () {
        var t = +b.getAttribute('data-goal'); answers.goals = answers.goals || [];
        var idx = answers.goals.findIndex(function (g) { return g.type === t; });
        if (idx >= 0) answers.goals.splice(idx, 1);
        else if (answers.goals.length >= 4) { $('spErr').textContent = 'Four goals is plenty for one policy. Remove one to add another.'; $('spErr').hidden = false; return; }
        else answers.goals.push({ type: t, year: null, amount: null, priority: 1 });
        $('spErr').hidden = true;
        screen();
        var d = document.querySelector('.sp-goal-detail[data-for="' + t + '"]'); if (d) d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    });
    body_.querySelectorAll('[data-gy],[data-ga],[data-gp]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = answers.goals.filter(function (x) { return x.type === +b.getAttribute('data-for'); })[0]; if (!g) return;
        if (b.hasAttribute('data-gy')) g.year = +b.getAttribute('data-gy');
        if (b.hasAttribute('data-ga')) g.amount = +b.getAttribute('data-ga');
        if (b.hasAttribute('data-gp')) g.priority = +b.getAttribute('data-gp');
        screen();
      });
    });
    body_.querySelectorAll('[data-gcustom]').forEach(function (inp) {
      inp.addEventListener('input', function () { var g = answers.goals.filter(function (x) { return x.type === +inp.getAttribute('data-for'); })[0]; if (g) g.amount = parseFloat(String(inp.value).replace(/[^0-9.]/g, '')) || null; });
    });
    var first = body_.querySelector('.sp-opt, .sp-chip, .sp-goal'); if (first && step > 0) first.focus({ preventScroll: true });
    document.querySelector('.sp-wiz').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  function goalDetail(g, year) {
    var custom = g.amount != null && PRESETS.goalAmount.indexOf(g.amount) < 0;
    return '<div class="sp-goal-detail" data-for="' + g.type + '"><h5>' + esc(R.GOAL_TYPES[g.type]) + '</h5>' +
      '<p class="sp-sub">When</p><div class="sp-chips">' + PRESETS.goalYears.map(function (y) { return chip('In ' + y + ' yrs', g.year === year + y, 'data-for="' + g.type + '" data-gy="' + (year + y) + '"'); }).join('') + '</div>' +
      '<p class="sp-sub">How much, in today\'s money</p><div class="sp-chips">' + PRESETS.goalAmount.map(function (a) { return chip(short(a), g.amount === a, 'data-for="' + g.type + '" data-ga="' + a + '"'); }).join('') + '</div>' +
      '<div class="sp-custom">₹ <input type="text" inputmode="numeric" placeholder="Or type an amount" data-for="' + g.type + '" data-gcustom="1" value="' + (custom ? g.amount : '') + '" /></div>' +
      '<p class="sp-sub">How firm</p><div class="sp-chips">' + R.PRIORITIES.map(function (p, i) { return chip(p, g.priority === i, 'data-for="' + g.type + '" data-gp="' + i + '"'); }).join('') + '</div></div>';
  }
  // Skipping a question that is not scored fills in a cautious default and notes it as assumed.
  var SKIP_DEFAULT = { expenses: 0, surplus: 0, withdrawals: 0, booked: 0, goals: [], exclude: {}, returnNeed: null, incomeNeed: 0, slab: 6, regime: 0, residency: 0, simplicity: 2 };
  function skip(q) {
    answers[q.id] = SKIP_DEFAULT[q.id] === undefined ? null : SKIP_DEFAULT[q.id];
    answers._skipped = answers._skipped || {}; answers._skipped[q.id] = true;
    if (step < visible().length - 1) { step++; screen(); } else finish();
  }
  function finish() {
    $('spBody').innerHTML = '<div class="sp-wiz"><div class="sp-progress"><span style="width:100%"></span></div><p class="sp-lede">Writing your policy...</p></div>';
    setTimeout(render, 350);
  }
  function advance() {
    var q = visible()[step], err = $('spErr');
    if (q.type === 'amount' && answers[q.id] == null) { err.textContent = 'Pick an amount, or type one.'; err.hidden = false; return; }
    if (q.type === 'multi' && !answers[q.id]) answers[q.id] = {};
    if (q.type === 'goals') {
      var G = (answers.goals || []).filter(function (g) { return g.year && g.amount; });
      if (!G.length) { err.textContent = 'Give at least one goal a year and an amount.'; err.hidden = false; return; }
      answers.goals = G;
    }
    if (q.type == null && answers[q.id] == null) { err.textContent = 'Tap one of the answers.'; err.hidden = false; return; }
    if (step < visible().length - 1) { step++; screen(); return; }
    finish();
  }

  // ---- output: reveal, glance, then sections on demand ----
  var cap = function (s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); };
  var VERDICT = { keep: ['Keep', 'keep'], review: ['Review', 'eye'], replace: ['Replace', 'swap'], reduce: ['Reduce', 'minus'], unscored: ['Not judged', 'eye'] };
  var label = function (key) { return R.label(key, DATA.cfg); };
  function vchip(f) {
    var v = VERDICT[f.verdict] || [f.verdict, 'eye'], out = '<span class="sp-chip-v sp-v-' + f.verdict + '">' + ICON[v[1] === 'keep' ? 'check' : v[1]] + v[0] + '</span>';
    if (f.direct && f.verdict !== 'replace' && f.verdict !== 'reduce') out += '<span class="sp-chip-v sp-v-direct">' + ICON.swap + 'Go direct</span>';
    if (f.hold) out += '<span class="sp-chip-v sp-v-hold">Hold for now</span>';
    if (f.flag === 'credit') out += '<span class="sp-chip-v sp-v-review">Credit risk</span>';
    return out;
  }
  function acc(id, title, summary, body, open) {
    return '<details class="sp-acc" id="sp-acc-' + id + '"' + (open ? ' open' : '') + '><summary><span><span class="sp-acc-title">' + title + '</span><span class="sp-acc-sum">' + summary + '</span></span><span class="sp-acc-chev">' + ICON.chevron + '</span></summary><div class="sp-acc-body">' + body + '</div></details>';
  }
  function table(head, rows) {
    return '<div class="sp-tablewrap"><table class="sp-table"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table></div>';
  }
  function stageTable(rows, withDate) {
    if (!rows.length) return '<p class="sp-none">Nothing at this stage.</p>';
    return table((withDate ? ['Date'] : []).concat(['Fund', 'Step', 'Value', 'Exit load', 'Tax', 'Cost']), rows.map(function (s) {
      return '<tr>' + (withDate ? '<td>' + nice(s.date) + '</td>' : '') + '<td>' + esc(s.name) + '</td><td>' + esc(s.action) + (s.part ? ' (part)' : '') + (s.into ? '<span class="sp-why">into ' + esc(s.into) + '</span>' : '') + (s.why ? '<span class="sp-why">' + esc(s.why) + '</span>' : '') +
        '</td><td>' + inr(s.value) + '</td><td>' + inr(s.load) + '</td><td>' + inr(s.tax) + '</td><td><strong>' + inr(s.cost) + '</strong></td></tr>';
    }));
  }
  var flagHtml = function (text) { return '<div class="sp-flag">' + ICON.alert + '<span>' + text + '</span></div>'; };
  var meter = function (label, d) {
    return '<div class="sp-meter"><span class="sp-meter-label">' + label + '</span><strong>' + esc(R.label(d.key, DATA.cfg)) + '</strong><div class="sp-meter-bar"><span style="width:' + (100 * d.points / d.max).toFixed(0) + '%"></span></div>' +
      '<small>' + (d.drags.length ? 'Held back by ' + esc(d.drags.slice(0, 2).join(' and ').toLowerCase()) + '.' : 'Nothing holding it back.') + '</small></div>';
  };

  function render() {
    var D = DATA, L = window.SO_LAST, today = todayIso();
    var plan = R.build({ cfg: D.cfg, scores: D.scores, H: L.data.holdings, schemes: L.data.schemes, proxyNavs: D.proxy, latest: D.latest, parsed: L.parsed, answers: answers, today: today });
    var cfg = D.cfg, ips = plan.ips, pr = plan.profile, A = cfg.ips.assumptions, out = [];
    var Qx = {}; R.QUESTIONS.forEach(function (q) { Qx[q.id] = q; });
    var line = { conservative: 'Steady first. Growth is welcome, but never at the cost of sleep.', cautious: 'Mostly steady, with a measured share in equity for growth.', balanced: 'A balanced hand: enough equity to grow, enough debt to stay calm.', growth: 'Built to grow. You can afford the swings, and you said you can live with them.', high_growth: 'Firmly tilted to growth, with just enough debt to steady the ride.', aggressive: 'All in on growth. Long horizon, strong finances, steady nerves.' }[pr.key] || '';
    var pl = label(pr.key).toLowerCase();

    // 1. The reveal
    out.push('<div class="sp-reveal"><p class="sp-reveal-eyebrow">Your investment policy</p><h3>You are a ' + esc(pl) + ' investor.</h3><p>' + line + ' Your ' + esc(pr.limiter) + ' to take risk sets the pace' + (pr.capped ? ', capped at ' + esc(label(DATA.cfg.risk_profile.income_cap || 'balanced').toLowerCase()) + ' because this portfolio pays your bills' : '') + '.</p>' +
      '<div class="sp-meters">' + meter('Ability to take risk', pr.ability) + meter('Willingness to take risk', pr.willingness) + '</div></div>');

    if (plan.empty) {
      out.push(flagHtml('This statement shows no mutual funds held today, so there is nothing to keep, switch or add against. Once you hold funds, load a recent statement and the plan will cover them.'));
      $('spBody').innerHTML = out.join('') + method(plan, cfg);
      $('spWrap').scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }

    // 2. At a glance
    var counts = { keep: 0, review: 0, replace: 0, reduce: 0, unscored: 0 }; plan.funds.forEach(function (f) { counts[f.verdict] = (counts[f.verdict] || 0) + 1; });
    var eqT = plan.mix.target.equity || 0, eqC = plan.mix.current.equity || 0, band = ips.band;
    var eqState = eqC > eqT + band ? 'above the policy band' : eqC < eqT - band ? 'below the policy band' : 'inside the policy band';
    var allSteps = plan.stages.now.concat(plan.stages.after, plan.stages.next), totalCost = allSteps.reduce(function (s, x) { return s + x.cost; }, 0);
    out.push('<div class="sp-glance">' +
      '<div class="sp-tile"><span class="sp-tile-label">Equity today</span><span class="sp-tile-num">' + pct(eqC) + '</span><span class="sp-tile-sub">Policy says ' + pct(eqT) + ', so ' + eqState + '.</span></div>' +
      '<div class="sp-tile"><span class="sp-tile-label">Your funds</span><span class="sp-tile-num">' + counts.keep + ' to keep</span><span class="sp-tile-sub">' + [counts.review ? counts.review + ' to review' : '', counts.replace ? counts.replace + ' to replace' : '', counts.reduce ? counts.reduce + ' to reduce' : ''].filter(Boolean).join(', ') + (counts.review + counts.replace + counts.reduce ? '.' : 'Nothing to change.') + (counts.unscored ? ' ' + counts.unscored + ' not judged.' : '') + '</span></div>' +
      (plan.sip && plan.sip.rows.length ? '<div class="sp-tile"><span class="sp-tile-label">Each month</span><span class="sp-tile-num">' + inr(plan.sip.surplus) + '</span><span class="sp-tile-sub">Into ' + plan.sip.rows.length + (plan.sip.rows.length === 1 ? ' sleeve that is' : ' sleeves that are') + ' short of target.</span></div>'
        : '<div class="sp-tile"><span class="sp-tile-label">Cost of the moves</span><span class="sp-tile-num">' + inr(totalCost) + '</span><span class="sp-tile-sub">' + (allSteps.length ? 'Exit load and tax across ' + allSteps.length + (allSteps.length === 1 ? ' step.' : ' steps.') : 'No switches needed.') + '</span></div>') + '</div>');
    if (plan.stale) out.push(flagHtml('<strong>This statement is more than 30 days old.</strong> Funds bought or sold since then are not in this plan.'));
    out.push(ips.flags.slice(0, 2).map(function (f) { return flagHtml(esc(f.text)); }).join(''));
    var moves = nextMoves(plan, ips.flags.slice(2)), firstMoves = moves.slice(0, 5), moreMoves = moves.slice(5);
    out.push(movesHtml(firstMoves, 'Your next moves'));
    out.push('<div class="sp-cta"><a class="sp-next sp-book" href="#soLead">Book a review with SELEQT</a><span class="sp-why">A thirty-minute look at this plan with an adviser' + (plan.unjudged && plan.unjudged.length ? ', including the holdings the rules could not judge' : '') + '.</span></div>');
    if (plan.unjudged && plan.unjudged.length) out.push(unjudgedHtml(plan));
    out.push('<div class="sp-more-all"><button type="button" class="sp-next sp-next-ghost" id="spDetails">Show the full policy and workings</button><span class="sp-why">The written policy, every fund with its reasons, the switch costs and dates, and how it was all worked out.</span></div>');
    out.push('<div id="spDetailsBody" hidden>');
    if (moreMoves.length) out.push(movesHtml(moreMoves, 'More moves'));
    var skipped = Object.keys(answers._skipped || {});
    if (skipped.length) out.push('<p class="sp-why" style="margin:10px 0 0">Skipped and assumed: ' + esc(skipped.map(function (k) { return Qx[k] ? Qx[k].q.toLowerCase() : k; }).join('; ')) + '.</p>');

    // 3. Policy
    var worst = ips.expected.worstYear != null ? Math.round(-ips.expected.worstYear * 100) : null;
    var incomeTxt = ['You draw no income from it, so it can be run for growth.', 'You draw a little income from it, under 4% a year, which the liquid and debt sleeves carry.', 'It is your main income, so the policy keeps a larger debt sleeve and a moderate ceiling.'][+answers.incomeNeed || 0];
    var prefs = []; Object.keys(ips.exclude || {}).forEach(function (k) { if (ips.exclude[k]) prefs.push(Qx.exclude.a[+k].toLowerCase()); }); if (ips.maxFunds) prefs.push('at most ' + ips.maxFunds + ' funds in all');
    var goalsRows = ips.goals.map(function (g) {
      return '<tr><td>' + esc(g.label) + (g.priority === 0 ? '<span class="sp-tag">Must</span>' : g.priority === 2 ? '<span class="sp-tag">Flexible</span>' : '') + '</td><td>' + g.year + '</td><td>' + inr(g.target) + '</td><td>' + pct(g.share) + '</td>' +
        '<td>' + (g.mixKey === 'cash' ? 'Cash and debt only' : label(g.mixKey)) + (g.capped ? '<span class="sp-why">capped by its horizon</span>' : '') + '</td><td>' + (g.sip > 0.5 ? inr(g.sip) : 'On track') + '</td></tr>';
    });
    var policyBody = '<p class="sp-h">Objectives</p><ul class="sp-list">' +
      '<li><strong>Return.</strong> ' + (ips.expected.need != null ? 'You need about ' + Math.round(ips.expected.need * 100) + '% a year above inflation. ' : '') + 'This mix can be expected to earn about ' + (ips.expected.nominal * 100).toFixed(1) + '% a year over a full cycle, ' + (ips.expected.real * 100).toFixed(1) + '% above ' + (A.inflation * 100).toFixed(1) + '% inflation. A planning figure, not a promise.</li>' +
      '<li><strong>Risk.</strong> A ' + esc(pl) + ' mix' + (worst != null ? ' should be expected to fall about ' + worst + '% in a bad year' : '') + '. You said you could sit through ' + esc((Qx.drawdown.a[+answers.drawdown] || 'a fall').toLowerCase()) + '.</li>' +
      '<li><strong>Income.</strong> ' + incomeTxt + '</li></ul>' +
      '<p class="sp-h">Goals</p>' + (ips.assumed ? '<p class="sp-text">' + (ips.assumedKind === 'preserve' ? 'You asked to keep the money safe, so the policy uses the conservative mix whatever your profile, over a five-year view.' : 'You asked for growth without a specific goal, so the policy plans for general wealth over ten years at your profile\'s mix.') + '</p>' : '') +
      table(['Goal', 'By', 'Needs then', 'Share of portfolio', 'Mix', 'Monthly to stay on track'], goalsRows) +
      '<p class="sp-why">"Needs then" adds ' + (A.inflation * 100).toFixed(1) + '% inflation a year. Each goal\'s share of the portfolio is grown at its mix\'s expected return; the monthly figure closes any gap.' + (ips.sip.surplus > 0 ? ' Together the goals need about ' + inr(ips.sip.needed) + ' a month against the ' + inr(ips.sip.surplus) + ' you can invest.' : '') + '</p>' +
      '<p class="sp-h">Constraints</p><ul class="sp-list">' +
      '<li><strong>Liquidity.</strong> ' + (ips.reserve > 0 ? inr(ips.reserve) + ' to complete a ' + ips.reserveMonths + '-month cash reserve' : 'Your cash reserve is in place') + (ips.withdrawals > 0 ? ', plus ' + inr(ips.withdrawals) + ' you plan to take out within a year' : '') + (ips.liquidFloor > 0 ? '. So ' + pct(ips.liquidFloor) + ' of the portfolio stays in liquid funds, outside the risk mix.' : '.') + '</li>' +
      '<li><strong>Tax.</strong> ' + pct(pr.slab) + ' slab, ' + (+answers.regime === 1 ? 'old' : 'new') + ' regime. ' + inr(Math.max(0, cfg.tax.ltcg_exemption - pr.booked)) + ' of this year\'s tax-free equity allowance is still available to the plan.</li>' +
      '<li><strong>Legal.</strong> ' + (+answers.residency === 1 ? 'Non-resident Indian: fund eligibility and TDS on redemptions apply.' : 'Resident Indian.') + '</li>' +
      '<li><strong>Preferences.</strong> ' + (prefs.length ? cap(prefs.join('; ')) + '.' : 'None stated.') + '</li></ul>' +
      '<p class="sp-h">Rules</p><ul class="sp-list">' +
      '<li>Hold each sleeve within ' + pct(band) + ' of its target. Fix drift with new money first, then with sales, the cheapest in tax first.</li>' +
      '<li>Growth option. At most ' + plan.maxEq + ' equity funds, one per category, two per fund house. Index funds wherever no active fund shows a durable edge. A fund in the top ' + Math.round(100 * (1 - (cfg.verdict.keep_from_rank == null ? 0.5 : cfg.verdict.keep_from_rank))) + '% of its category is kept; below that it is replaced.</li>' +
      '<li>Sector and theme funds only as a satellite, within ' + pct(cfg.satellite.thematic_max_share_of_equity) + ' of equity, and only from ' + esc(label(cfg.satellite.allow_for[0])) + ' upward.</li>' +
      '<li>Review ' + esc(ips.review) + ', and on a life event: a new goal, a job change, a windfall, a health event.</li></ul>' +
      ((plan.hygiene || []).length ? '<p class="sp-h">Housekeeping from your statement</p><ul class="sp-list">' + plan.hygiene.map(function (h) { return '<li>' + esc(h.text) + (h.names.length ? ' <span class="sp-why">' + esc(h.names.join(', ')) + '</span>' : '') + '</li>'; }).join('') + '</ul>' : '') +
      (plan.notes.indexOf('history') >= 0 ? '<p class="sp-why">Part of your history is missing: this statement starts part way through, so units held at its start count as bought on or before ' + nice(L.parsed.period && L.parsed.period.from) + '. A statement from your first investment gives exact dates.</p>' : '') +
      (plan.notes.indexOf('no_lots') >= 0 ? '<p class="sp-why">Depository statements carry no purchase dates, so switch costs and tax timing below are estimates. A Detailed CAMS statement gives exact figures.</p>' : '');
    out.push(acc('policy', 'Your written policy', label(pr.key) + ' mix, ' + ips.goals.length + (ips.goals.length === 1 ? ' goal' : ' goals') + (ips.liquidFloor > 0 ? ', ' + pct(ips.liquidFloor) + ' kept liquid' : '') + '. Objectives, constraints and rules.', policyBody, false));

    // 4. Allocation
    var mixRow = function (k, label) {
      var t = plan.mix.target[k] || 0, c = plan.mix.current[k] || 0, lo = Math.max(0, t - band), hi = Math.min(1, t + band);
      var off = t > 0 || c > 0 ? (c < lo ? 'below' : c > hi ? 'above' : 'in band') : '';
      return '<tr><td>' + label + '</td><td>' + pct(t) + '</td><td>' + (t > 0 ? pct(lo) + ' to ' + pct(hi) : '0%') + '</td><td>' + pct(c) + (off ? '<span class="sp-why">' + off + '</span>' : '') + '</td><td class="sp-bar"><span class="sp-b-t" style="width:' + (t * 100).toFixed(1) + '%"></span><span class="sp-b-c" style="width:' + (c * 100).toFixed(1) + '%"></span></td></tr>';
    };
    var splitTxt = ['large', 'flexi', 'mid', 'small'].filter(function (k) { return ips.equitySplit[k] > 0; }).map(function (k) { return pct(ips.equitySplit[k]) + ' ' + ({ large: 'large cap', flexi: 'flexi cap', mid: 'mid cap', small: 'small cap' })[k]; }).join(', ');
    out.push(acc('mix', 'Where the money should sit', 'Equity ' + pct(eqT) + ' target against ' + pct(eqC) + ' today, ' + eqState + '.',
      table(['Sleeve', 'Target', 'Band', 'Yours', ''], [mixRow('equity', 'Equity'), mixRow('hybrid', 'Hybrid'), mixRow('debt', 'Debt')].concat(plan.mix.current.other ? [mixRow('other', 'Other (not in the plan yet)')] : [])) +
      '<p class="sp-text" style="margin-top:12px">Your mutual funds total <strong>' + inr(plan.total) + '</strong> at today\'s NAVs (' + inr(plan.statementTotal) + ' in the statement). Within equity the policy splits ' + splitTxt + '; within debt ' + pct(ips.debtSplit.liquid) + ' liquid and ' + pct(ips.debtSplit.core) + ' short duration or corporate bond. Shares, bonds and gold come in a later version.</p>', false));

    // 5. Funds
    var fundsBody = plan.funds.filter(function (f) { return f.verdict !== 'unscored'; }).map(function (f) {
      var rest = f.reasons.slice(1).concat(['Compared against: ' + f.compared]);
      if (f.direct && f.verdict !== 'replace' && f.verdict !== 'reduce') rest.push('A regular plan. The plan moves it to the direct plan of the same fund, which pays no distributor commission.');
      if (f.exitLoadSource === 'estimate') rest.push('Exit load is an estimate for its category; the statement does not state it.');
      if (f.navMismatch) rest.push('Today\'s NAV did not match the statement\'s units closely, so the statement value is used.');
      return '<article class="sp-fund"><div class="sp-fund-top"><h4>' + esc(f.name) + '</h4>' + vchip(f) + '<span class="sp-fund-val">' + inr(f.value) + (f.catLabel ? ' · ' + esc(f.catLabel) : '') + '</span></div>' +
        (f.verdict === 'replace' && f.replaceWith ? '<p class="sp-fund-why"><strong>Into ' + esc(f.replaceWith.name) + '</strong>' + (f.replaceWith.held ? ', which you already hold.' : ', the policy\'s pick for this sleeve.') + '</p>' : '') +
        '<p class="sp-fund-why">' + esc(f.reasons[0] || '') + '</p>' +
        '<details class="sp-more"><summary>Why, in full</summary><ul>' + rest.map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('') + '</ul></details></article>';
    }).join('');
    out.push(acc('funds', 'Your funds, one by one', counts.keep + ' keep, ' + counts.review + ' review, ' + counts.replace + ' replace, ' + counts.reduce + ' reduce.', fundsBody, true));

    // 6. Additions
    var overTxt = (plan.over || []).map(function (o) { return o.sleeve + ' is ' + pct(o.by) + ' above target'; });
    var addBody = (overTxt.length ? '<p class="sp-text">' + esc(cap(overTxt.join(', '))) + '. The plan does not sell just to rebalance; new money and the proceeds of the sales go to the sleeves that are short.</p>' : '') +
      (plan.additions.length ? plan.additions.map(function (a) {
        var head = '<div class="sp-fund-top"><h4>' + esc(a.label) + '</h4>' + (a.monthly ? '<span class="sp-chip-v sp-v-direct">' + inr(a.monthly) + ' a month</span>' : '') + '<span class="sp-fund-val">short by ' + inr(a.gap) + ' (' + pct(a.gapPct) + ')</span></div>';
        var months = a.monthly ? '<p class="sp-why">At ' + inr(a.monthly) + ' a month this gap closes in about ' + Math.ceil(a.gap / a.monthly) + ' months, sooner with sale proceeds.</p>' : '';
        if (a.topUp) return '<article class="sp-fund">' + head + '<p class="sp-fund-why">' + esc(a.reason) + ' Add to <strong>' + esc(a.topUp) + '</strong>.</p>' + months + '</article>';
        if (a.skipped || !a.pick) return '<article class="sp-fund">' + head + '<p class="sp-fund-why">' + esc(a.skipped || 'No eligible fund passed the screen.') + '</p>' + months + '</article>';
        var opt = function (p, tag) { return '<li><strong>' + esc(p.n) + '</strong><span class="sp-tag">' + tag + '</span><span class="sp-why">' + esc(p.why) + ' Compared against: ' + esc(p.compared) + '.</span></li>'; };
        return '<article class="sp-fund">' + head + '<p class="sp-fund-why">Pick: <strong>' + esc(a.pick.n) + '</strong>.</p><details class="sp-more"><summary>Why this one, and the alternatives</summary><ul>' + opt(a.pick, 'Pick') + a.alts.map(function (p) { return opt(p, p.index ? 'Index alternative' : 'Alternative'); }).join('') +
          (a.skippedWhy && a.skippedWhy.length ? '<li>Passed over: ' + esc(a.skippedWhy.slice(0, 3).join('; ')) + '.</li>' : '') + '</ul></details>' + months + '</article>';
      }).join('') : '<p class="sp-none">No sleeve is short of its target by more than ' + pct(cfg.additions.gap_threshold) + ' of the portfolio.</p>');
    out.push(acc('add', 'What to add', plan.additions.length ? plan.additions.length + (plan.additions.length === 1 ? ' sleeve is' : ' sleeves are') + ' short' + (plan.sip && plan.sip.rows.length ? '; your ' + inr(plan.sip.surplus) + ' a month is split across them.' : '.') : 'Nothing is short of target.', addBody, false));

    // 7. Switch plan
    var switchBody = '<p class="sp-h">Now</p>' + stageTable(plan.stages.now) + '<p class="sp-h">After a date</p>' + stageTable(plan.stages.after, true) + '<p class="sp-h">Next financial year</p>' + stageTable(plan.stages.next, true) +
      (plan.holds.length ? '<p class="sp-h">Hold for now</p><ul class="sp-list">' + plan.holds.map(function (h) { return '<li><strong>' + esc(h.name) + '.</strong> ' + esc(h.why) + '</li>'; }).join('') + '</ul>' : '') +
      '<p class="sp-why" style="margin-top:14px">Tax uses your ' + pct(pr.slab) + ' slab for debt funds, 20% for equity held under a year, 12.5% above the ₹1.25 lakh yearly allowance for longer, plus 4% cess. Surcharge is not included. Units are sold first in, first out, as the tax rules require.</p>';
    out.push(acc('switch', 'What to do, and when', allSteps.length ? allSteps.length + (allSteps.length === 1 ? ' step' : ' steps') + ', ' + inr(totalCost) + ' in exit load and tax' + (plan.holds.length ? ', ' + plan.holds.length + ' on hold.' : '.') : 'No switches needed.', switchBody, false));

    // 8. Missed gains
    var missedBody = plan.missed.length ? '<ul class="sp-list">' + plan.missed.map(function (m) {
      if (m.skip) return '<li><strong>' + esc(m.name) + '.</strong> ' + esc(m.skip) + '</li>';
      return '<li><strong>' + esc(m.name) + '.</strong> Worth ' + inr(m.actual) + ' on ' + nice(m.asOf) + '. The same purchases and redemptions in the ' + esc(m.proxyName) + ' would be worth ' + inr(m.proxy) + ', ' + (m.diff >= 0 ? inr(m.diff) + ' in your favour' : inr(-m.diff) + ' against you') + (m.months ? '. Held about ' + m.months + (m.months === 1 ? ' month' : ' months') + ', too short for a yearly rate to mean much.' : '. XIRR ' + pct(m.xirrFund, 1) + ' against ' + pct(m.xirrProxy, 1) + '.') + '</li>';
    }).join('') + '</ul>' : '<p class="sp-none">No equity funds to compare.</p>';
    var missedN = plan.missed.filter(function (m) { return !m.skip; }), ahead = missedN.filter(function (m) { return m.diff >= 0; }).length;
    out.push(acc('missed', 'Against an index fund', missedN.length ? ahead + ' of ' + missedN.length + ' compared funds ' + (ahead === 1 ? 'is' : 'are') + ' ahead of the index fund on your actual purchases.' : 'No comparison available yet.', missedBody, false));

    out.push(method(plan, cfg) + '</div>');
    $('spBody').innerHTML = out.join('');
    [].forEach.call(document.querySelectorAll('.sp-book'), function (a) { a.addEventListener('click', function (e) { e.preventDefault(); $('soLead').scrollIntoView({ block: 'start', behavior: 'smooth' }); }); });
    $('spDetails').addEventListener('click', function () {
      var b = $('spDetailsBody'); b.hidden = !b.hidden;
      this.textContent = b.hidden ? 'Show the full policy and workings' : 'Hide the workings';
      if (!b.hidden) b.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    $('spWrap').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // The list a person acts on: warnings beyond the two shown as cards, then sales, then
  // additions, rebalancing, housekeeping, holds and reviews. The first five show at once.
  function nextMoves(plan, extraFlags) {
    var m = [];
    (extraFlags || []).forEach(function (f) { var parts = f.text.split('. '); m.push({ icon: 'alert', t: parts[0] + (/[.!?]$/.test(parts[0]) ? '' : '.'), w: parts.slice(1).join('. ') }); });
    plan.funds.forEach(function (f) {
      if (f.hold) return;
      if (f.verdict === 'replace') m.push({ icon: 'swap', t: 'Replace ' + f.name + (f.replaceWith ? ' with ' + f.replaceWith.name + (f.replaceWith.held ? ', which you already hold' : '') : '') + '.', w: f.reasons[0] });
      else if (f.verdict === 'reduce') m.push({ icon: 'minus', t: 'Reduce ' + f.name + '.', w: f.reasons[0] });
    });
    plan.funds.forEach(function (f) { if (f.direct && !f.hold && f.verdict !== 'replace' && f.verdict !== 'reduce') m.push({ icon: 'swap', t: 'Move ' + f.name + ' to its direct plan.', w: 'Same fund, no distributor commission.' }); });
    plan.additions.forEach(function (a) {
      var into = a.topUp || (a.pick && a.pick.n); if (!into) return;
      m.push({ icon: 'check', t: (a.monthly ? inr(a.monthly) + ' a month' : 'New money') + ' into ' + a.label.toLowerCase() + ': ' + into + '.', w: 'Short by ' + inr(a.gap) + ' against the policy.' });
    });
    (plan.rebalance || []).forEach(function (r) {
      m.push({ icon: 'minus', t: cap(r.sleeve) + ' is ' + pct(r.by) + ' over its band: send new money elsewhere' + (r.remaining > 0 && r.trim ? ', and trim ' + r.trim + ' by about ' + inr(r.remaining) : '') + '.', w: r.proceeds > 0 ? 'The sales above already free up ' + inr(r.proceeds) + '.' : 'No forced selling; drift closes with new money first.' });
    });
    (plan.hygiene || []).forEach(function (h) { m.push({ icon: 'alert', t: h.text.split('. ')[0] + '.', w: h.text.split('. ').slice(1).join('. ') + (h.names.length ? ' (' + h.names.slice(0, 3).join(', ') + (h.names.length > 3 ? ', ...' : '') + ')' : '') }); });
    plan.funds.forEach(function (f) { if (f.flag === 'credit' && f.verdict === 'keep') m.push({ icon: 'eye', t: 'Keep an eye on ' + f.name + ': a credit risk fund.', w: 'Scored like any debt fund, but a credit event can hurt in ways past returns do not show.' }); });
    var holds = plan.funds.filter(function (f) { return f.hold; });
    if (holds.length) m.push({ icon: 'eye', t: 'Leave ' + holds.map(function (f) { return f.name; }).join(', ') + ' alone for now.', w: 'Switching would cost more in exit load and tax than it gains over three years.' });
    var reviews = plan.funds.filter(function (f) { return f.verdict === 'review'; });
    if (reviews.length) m.push({ icon: 'eye', t: reviews.length + (reviews.length === 1 ? ' fund needs' : ' funds need') + ' a human look: ' + reviews.map(function (f) { return f.name; }).join(', ') + '.', w: 'Too new, or borderline. Book a review and we go through them with you.' });
    if (!m.length) m.push({ icon: 'check', t: 'Nothing to change. Keep investing to the policy.', w: 'Every fund earns its place and the mix is inside its bands.' });
    return m;
  }
  function movesHtml(list, title) {
    if (!list.length) return '';
    return '<div class="sp-moves"><p class="sp-h" style="margin-top:18px">' + esc(title) + '</p><ol class="sp-movelist">' + list.map(function (x) {
      return '<li><span class="sp-move-icon sp-mi-' + x.icon + '">' + ICON[x.icon] + '</span><span><strong>' + esc(x.t) + '</strong><span class="sp-why">' + esc(x.w || '') + '</span></span></li>';
    }).join('') + '</ol></div>';
  }
  // Holdings the rules cannot judge: unscored funds, shares, bonds, gold bonds. Counted, not advised on.
  function unjudgedHtml(plan) {
    var total = plan.unjudged.reduce(function (s, u) { return s + (u.value || 0); }, 0);
    return '<div class="sp-unjudged"><p class="sp-h">Not judged by the rules</p><p class="sp-text">' + inr(total) + ' across ' + plan.unjudged.length + (plan.unjudged.length === 1 ? ' holding' : ' holdings') +
      ' is counted in your totals but not advised on here: the rules only judge mutual funds they can score.</p><ul class="sp-list">' +
      plan.unjudged.map(function (u) { return '<li><strong>' + esc(u.name) + '</strong> ' + inr(u.value) + ', ' + esc(u.why) + '</li>'; }).join('') +
      '</ul><p class="sp-text" style="margin-top:10px">For a review that includes these, <a class="sp-book" href="#soLead">book a meeting</a>.</p></div>';
  }

  function method(plan, cfg) {
    var A = cfg.ips.assumptions;
    var gaps = Object.keys(plan.gaps || {}).map(function (k) { return '<li>' + esc(k) + ': ' + esc(plan.gaps[k].join(', ')) + '</li>'; }).join('');
    var per = (plan.funds || []).map(function (f) { return '<li>' + esc(f.name) + ': ' + esc(f.bsrc || 'not scored') + '</li>'; }).join('');
    return '<details class="so-method sp-method"><summary>How this policy and plan were worked out</summary><ul>' +
      '<li><strong>The thresholds and weights are starting values awaiting sign-off by the SELEQT investment team.</strong> They live in one configuration file (version ' + esc(cfg.version) + ').</li>' +
      '<li>The policy scores ability to take risk (age, dependants, income, cash reserve, EMIs, insurance, this portfolio\'s share of your wealth) and willingness (your answers on falls, drawdowns, experience, trade-offs and past behaviour) separately, each out of 24, and takes the lower. Each goal is capped by its horizon: under 3 years cash and debt only, under 5 at most conservative, under 7 at most moderate, under 10 at most growth. The target mix is the goal-weighted blend, then lifted to hold your cash reserve and planned withdrawals in liquid funds.</li>' +
      '<li>Planning assumptions, not forecasts: equity ' + (A.equity * 100).toFixed(1) + '%, hybrid ' + (A.hybrid * 100).toFixed(1) + '%, debt ' + (A.debt * 100).toFixed(1) + '% a year over a full cycle, inflation ' + (A.inflation * 100).toFixed(1) + '%.</li>' +
      '<li>Rules, not AI. Each fund is scored 0 to 100 within its SEBI category from three-year periods stepped monthly over seven years: consistency in beating its benchmark (35%), the median margin (20%), downside capture (15%), expense ratio (15%) and fund size (15%). Index funds are judged only on cost and tracking. A fund scoring in the top ' + Math.round(100 * (1 - (cfg.verdict.keep_from_rank == null ? 0.5 : cfg.verdict.keep_from_rank))) + '% of its category is kept; below that line it is replaced. Regular plans are not moved to direct plans.</li>' +
      '<li>Benchmarks: licensed index data is not used yet. Where an index fund on the right index has enough history, it stands in for the index (index_fund_proxy). Otherwise, and for every debt and hybrid fund, the fund is compared with the median of its direct-plan peers (category_peers), which is a peer comparison, not a benchmark comparison.</li>' +
      (per ? '<li>Benchmark source per fund:<ul>' + per + '</ul></li>' : '') +
      (gaps ? '<li>Funds in this plan compared with peers, by the benchmark that would replace the peer comparison:<ul>' + gaps + '</ul></li>' : '') +
      '<li>Data: AMFI NAV history and scheme master, AMFI expense ratios and average AUM, and each fund\'s published portfolio for overlap (top holdings only, so overlap is understated). Built ' + esc(DATA.scores.built) + ', NAVs to ' + esc(DATA.scores.asof) + '.</li>' +
      '<li>Additions are growth-option funds, at least five years old and ' + cfg.additions.min_aum_cr.toLocaleString('en-IN') + ' crore in size, the best score in their category, skipping fund houses you already hold twice and funds overlapping more than ' + pct(cfg.additions.max_overlap_with_holdings) + ' with your equity funds. Your monthly surplus is split across the sleeves that are short, in proportion to the gap.</li>' +
      '<li>A switch is skipped when its cost is more than a conservative three-year estimate of what it gains, counting only half of the historical edge.</li>' +
      '</ul></details>';
  }
  window.addEventListener('beforeprint', function () { [].forEach.call(document.querySelectorAll('.sp-acc, .sp-more'), function (d) { d.open = true; }); });
})();
