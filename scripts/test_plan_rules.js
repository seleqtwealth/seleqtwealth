#!/usr/bin/env node
/* Fixture tests for plan-rules.js. They run the rules on fixed portfolios with a fixed,
   hand-made score set (not the weekly data), so a data refresh can never flip them; only a
   rule or config change can. Run: node scripts/test_plan_rules.js */
'use strict';
const assert = require('assert');
const path = require('path');
const R = require(path.join(__dirname, '..', 'plan-rules.js'));
const cfg = require(path.join(__dirname, '..', 'data', 'plan-config.json'));

const P = { bsrc: 'index_fund_proxy', bname: 'Nifty 100', bvia: 'Axis Nifty 100 Index Fund', bisin: 'PX' };
const rec = (o) => Object.assign({ months: 84, nw: 49, ter: 0.6, aum: 5000, amc: 'Alpha Mutual Fund' }, o);
const scores = {
  funds: {
    A: rec(Object.assign({ n: 'Alpha Large Cap Fund', cat: 'large_cap', catLabel: 'Large Cap', score: 80, cons: 0.9, beat: 44, margin: 2.0 }, P)),
    B: rec(Object.assign({ n: 'Beta Large Cap Fund', cat: 'large_cap', catLabel: 'Large Cap', score: 60, cons: 0.6, beat: 29, margin: -1.0, amc: 'Beta Mutual Fund' }, P)),
    C: rec(Object.assign({ n: 'Gamma Flexi Cap Fund', cat: 'flexi_cap', catLabel: 'Flexi Cap', score: 70, cons: 0.7, beat: 34, margin: 1.5, amc: 'Gamma Mutual Fund' }, P, { bname: 'Nifty 500' })),
    D: rec(Object.assign({ n: 'Delta Focused Fund', cat: 'focused', catLabel: 'Focused', score: 50, cons: 0.6, beat: 29, margin: 0.2, amc: 'Delta Mutual Fund' }, P, { bname: 'Nifty 500' })),
    W: rec(Object.assign({ n: 'Weak Mid Cap Fund', cat: 'mid_cap', catLabel: 'Mid Cap', score: 20, cons: 0.30, beat: 15, margin: -2.0, amc: 'Weak Mutual Fund' }, P, { bname: 'Nifty Midcap 150' })),
    N: rec({ n: 'New Mid Cap Fund', cat: 'mid_cap', catLabel: 'Mid Cap', months: 40, tooNew: true, amc: 'New Mutual Fund' }),
    G: rec({ n: 'Steady Corporate Bond Fund', cat: 'corporate_bond', catLabel: 'Corporate Bond', score: 60, cons: 0.7, beat: 34, margin: 0.3, bsrc: 'category_peers', bvia: 'median of 20 direct-plan corporate bond funds', amc: 'Steady Mutual Fund' }),
    I1: rec({ n: 'Uno Nifty 50 Index Fund', cat: 'index', catLabel: 'Index Fund', score: 70, isIndex: true, indexGroup: 'nifty 50', ter: 0.2, td: -0.1, bsrc: 'index_peers', bvia: '6 direct index funds on the same index', amc: 'Uno Mutual Fund' }),
    E: rec(Object.assign({ n: 'Echo Small Cap Fund', cat: 'small_cap', catLabel: 'Small Cap', score: 75, cons: 0.8, beat: 39, margin: 3.0, amc: 'Echo Mutual Fund' }, P, { bname: 'Nifty Smallcap 250' })),
    T: rec(Object.assign({ n: 'Tango ELSS Tax Saver Fund', cat: 'elss', catLabel: 'ELSS', score: 80, cons: 0.85, beat: 42, margin: 2.0, amc: 'Tango Mutual Fund' }, P, { bname: 'Nifty 500' })),
    FOC1: rec(Object.assign({ n: 'Fox Flexi Cap Fund', cat: 'flexi_cap', catLabel: 'Flexi Cap', score: 90, cons: 0.95, beat: 47, margin: 3.0, amc: 'Fox Mutual Fund' }, P)),
    TH: rec(Object.assign({ n: 'Theta Infrastructure Fund', cat: 'thematic', catLabel: 'Sectoral / Thematic', score: 70, cons: 0.7, beat: 34, margin: 1.0, amc: 'Theta Mutual Fund' }, P, { bname: 'Nifty 500' }))
  },
  sib: { A_REG: 'A', G_REG: 'G', T_REG: 'T' },
  cats: { large_cap: { median: 55 }, flexi_cap: { median: 55 }, focused: { median: 55 }, mid_cap: { median: 50 }, corporate_bond: { median: 50 }, index: { median: 50 }, small_cap: { median: 50 }, elss: { median: 50 }, thematic: { median: 50 } },
  picks: { large_cap: ['A', 'B'], flexi_cap: ['FOC1', 'C'], focused: ['FOC1'], mid_cap: ['W'], small_cap: ['E'], corporate_bond: ['G'], short_duration: [], liquid: [], money_market: [], aggressive_hybrid: [], balanced_advantage: [], multi_asset: [] },
  cheapestIndex: {}, gf2018: {}
};
const H = { i: { C: 0, D: 1 }, f: [[null, 98, [[0, 30], [1, 25], [2, 20]]], [null, 97, [[0, 28], [1, 24], [2, 20], [3, 5]]]], s: [] };
const schemes = { A_REG: { plan: 'regular', ter: 1.6 }, G_REG: { plan: 'regular', ter: 0.9 }, T_REG: { plan: 'regular', ter: 2.0 } };
// Ability 14 of 20 -> 17 of 24 (growth); willingness 8 of 20 -> 10 of 24 (moderate); the lower sets the policy.
const moderate = { age: 1, dependants: 1, income: 1, expenses: 0, emergency: 2, emi: 1, insurance: 0, share: 1, surplus: 0,
  goals: [{ type: 7, year: 2036, amount: 2000000, priority: 1 }], returnNeed: 1, incomeNeed: 0,
  fall: 1, drawdown: 1, exp: 2, tradeoff: 1, behaviour: 2, slab: 6, regime: 1, residency: 0, simplicity: 2, exclude: {}, withdrawals: 0, booked: 0 };
const ans = (o) => Object.assign({}, moderate, o);
const bold = { fall: 3, drawdown: 3, exp: 4, tradeoff: 3, behaviour: 3 };            // willingness 20 of 20
const strong = { age: 0, dependants: 0, income: 0, emergency: 3, emi: 0, insurance: 0, share: 0 }; // ability 20 of 20
const today = '2026-10-10';
const lot = (d, units, amt) => ({ d, units, amt, price: amt / units, kind: units > 0 ? 'buy' : 'redeem' });
const build = (holdings, extra) => R.build(Object.assign({ cfg, scores, H, schemes, today, answers: moderate, latest: null, proxyNavs: {},
  parsed: { source: 'cams', period: { from: '2018-01-01', to: '2026-10-05' }, holdings } }, extra || {}));
const find = (plan, name) => plan.funds.find((f) => f.name === name);

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok  ' + name); }

// One portfolio carrying most cases
const main = build([
  { isin: 'A_REG', name: 'Alpha Large Cap Fund Regular', plan: 'regular', type: 'mf', value: 500000, units: 5000, cost: 250000, nav: 100,
    txns: [lot('2019-04-01', 1000, 50000), lot('2020-04-01', 1000, 50000), lot('2021-04-01', 1000, 50000), lot('2022-04-01', 1000, 50000), lot('2023-04-03', 1000, 50000)] },
  { isin: 'B', name: 'Beta Large Cap Fund', type: 'mf', value: 200000, units: 1900, cost: 190000, txns: [lot('2026-06-01', 1900, 190000)] },
  { isin: 'C', name: 'Gamma Flexi Cap Fund', type: 'mf', value: 300000, units: 2000, cost: 200000, txns: [lot('2021-01-11', 2000, 200000)] },
  { isin: 'D', name: 'Delta Focused Fund', type: 'mf', value: 100000, units: 800, cost: 80000, txns: [lot('2022-02-01', 800, 80000)] },
  { isin: 'W', name: 'Weak Mid Cap Fund', type: 'mf', value: 150000, units: 1000, cost: 100000, txns: [lot('2020-05-05', 1000, 100000)] },
  { isin: 'N', name: 'New Mid Cap Fund', type: 'mf', value: 50000, units: 500, cost: 45000, txns: [lot('2023-06-01', 500, 45000)] },
  { isin: 'G', name: 'Steady Corporate Bond Fund', type: 'mf', value: 200000, units: 2000, cost: 180000, txns: [lot('2024-01-10', 2000, 180000)] },
  { isin: 'G_REG', name: 'Steady Corporate Bond Fund Regular', plan: 'regular', type: 'mf', value: 400000, units: 4000, cost: 350000, txns: [lot('2024-02-01', 4000, 350000)] },
  { isin: 'I1', name: 'Uno Nifty 50 Index Fund', type: 'mf', value: 100000, units: 1000, cost: 90000, txns: [lot('2022-01-03', 1000, 90000)] },
  { isin: 'E', name: 'Echo Small Cap Fund', type: 'mf', value: 60000, units: 600, cost: 50000, txns: [lot('2021-07-01', 600, 50000)] }
]);
console.log('Profile:', main.profile.key, main.profile.points + '/' + main.profile.max);
if (process.env.DBG) console.log(JSON.stringify({ now: main.stages.now, next: main.stages.next, after: main.stages.after, holds: main.holds }, null, 1));

test('profile scores to moderate', () => assert.strictEqual(main.profile.key, 'moderate'));
test('regular plan: keep the fund, and switch it to direct', () => {
  const a = main.funds.find((f) => f.isin === 'A_REG');
  assert.strictEqual(a.verdict, 'keep'); assert.strictEqual(a.direct, true);
});
test('two funds in one category: the lower-scored one is replaced', () => {
  const b = find(main, 'Beta Large Cap Fund');
  assert.strictEqual(b.verdict, 'replace'); assert.ok(/same category/.test(b.reasons[0]));
});
test('heavy overlap with a better fund: replaced', () => {
  const d = find(main, 'Delta Focused Fund');
  assert.strictEqual(d.verdict, 'replace'); assert.ok(/Overlaps 7\d%/.test(d.reasons[0]), d.reasons[0]);
});
test('consistency below 40%: replaced, reason carries the numbers and the comparison fund', () => {
  const w = find(main, 'Weak Mid Cap Fund');
  assert.strictEqual(w.verdict, 'replace'); assert.ok(/15 of 49 three-year periods \(30%\)/.test(w.reasons[0]) && /Axis Nifty 100 Index Fund/.test(w.reasons[0]), w.reasons[0]);
});
test('fund too new to judge: review', () => { const n = find(main, 'New Mid Cap Fund'); assert.strictEqual(n.verdict, 'review'); assert.ok(n.tooNew); });
test('index fund: judged on cost and tracking only, never on beating the market', () => {
  const i = find(main, 'Uno Nifty 50 Index Fund');
  assert.strictEqual(i.verdict, 'keep'); assert.ok(/index fund, judged only on cost/i.test(i.reasons[0])); assert.ok(!/three-year periods/.test(i.reasons.join(' ')));
});
test('debt fund compared with peers says so plainly', () => {
  const g = main.funds.find((f) => f.isin === 'G');
  assert.strictEqual(g.verdict, 'keep'); assert.ok(/peer comparison, not a benchmark/.test(g.compared));
});
test('debt fund bought after April 2023: slab tax makes the direct switch not worth it, so hold', () => {
  const h = main.holds.find((x) => x.name === 'Steady Corporate Bond Fund');
  assert.ok(h, 'expected a hold'); assert.ok(h.cost > h.benefit);
  // gain 50,000 at the 30% slab plus 4% cess
  assert.ok(Math.abs(h.cost - 50000 * 0.30 * 1.04) < 1, 'cost ' + h.cost);
});
test('gains above the Rs 1.25 lakh allowance are spread into the next financial year', () => {
  const now = main.stages.now.find((s) => s.name === 'Alpha Large Cap Fund');
  const next = main.stages.next.find((s) => s.name === 'Alpha Large Cap Fund');
  assert.ok(now && next, 'expected both stages');
  // three replacements go first and use part of the allowance; what is left covers one more lot tax-free
  assert.ok(now.tax === 0 && now.exemptUsed > 0 && next.tax > 0, JSON.stringify([now, next]));
  assert.strictEqual(next.date, '2027-04-01');
});
test('equity lot under 12 months is not sold now: replace after a date', () => {
  const after = main.stages.after.find((s) => s.name === 'Beta Large Cap Fund');
  assert.ok(after, 'expected an after-date step'); assert.strictEqual(after.date, '2027-06-02');
  assert.ok(!main.stages.now.find((s) => s.name === 'Beta Large Cap Fund'));
});
test('additions are direct plans that skip funds already held', () => {
  main.additions.forEach((a) => { if (a.pick) assert.ok(!['A', 'B', 'C', 'D', 'W', 'N', 'G', 'I1', 'E'].includes(a.pick.isin)); });
});

test('empty portfolio is handled gracefully', () => {
  const p = build([]); assert.strictEqual(p.empty, true);
});

test('short-period statement: opening balance becomes a lot at the period start, long term, missed gains skipped', () => {
  const h = { isin: 'W', name: 'Weak Mid Cap Fund', type: 'mf', value: 60000, units: 600, cost: 50000, opening: 500, txns: [lot('2026-08-01', 100, 9000)] };
  const L = R.lots(h, { from: '2025-04-01' });
  assert.strictEqual(L.lots[0].open, true); assert.strictEqual(L.lots[0].d, '2025-04-01');
  assert.ok(Math.abs(L.lots[0].c - 41000) < 0.01, 'apportioned cost ' + L.lots[0].c);
  const p = build([h], { parsed: { source: 'cams', period: { from: '2025-04-01', to: '2026-10-05' }, holdings: [h] } });
  const now = p.stages.now.find((s) => s.name === 'Weak Mid Cap Fund');
  assert.ok(now && now.tax === 0 && now.exemptUsed > 0, 'opening units sold now as long term: ' + JSON.stringify(now));
  assert.ok(p.stages.after.find((s) => s.name === 'Weak Mid Cap Fund'), 'young lot waits');
  assert.ok(/opens with a balance/.test(p.missed.find((m) => m.name === 'Weak Mid Cap Fund').skip));
  assert.ok(p.notes.includes('history'));
});

test('statement older than 30 days is flagged stale', () => {
  const h = { isin: 'C', name: 'Gamma Flexi Cap Fund', type: 'mf', value: 300000, units: 2000, cost: 200000, txns: [] };
  assert.strictEqual(build([h], { parsed: { source: 'cams', period: { from: '2018-01-01', to: '2026-08-01' }, holdings: [h] } }).stale, true);
  assert.strictEqual(build([h]).stale, false);
});

test('ELSS: units inside the three-year lock-in wait until they are free, one step a quarter', () => {
  const h = { isin: 'T_REG', name: 'Tango ELSS', type: 'mf', value: 300000, units: 3000, cost: 200000,
    txns: [lot('2022-01-10', 1000, 50000), lot('2024-05-15', 1000, 70000), lot('2024-08-20', 1000, 80000)] };
  const p = build([h]);
  const now = p.stages.now.find((s) => /Tango/.test(s.name)), after = p.stages.after.filter((s) => /Tango/.test(s.name));
  assert.ok(now && Math.abs(now.units - 1000) < 1e-6, 'only the free lot now: ' + JSON.stringify(now));
  assert.deepStrictEqual(after.map((s) => s.date), ['2027-05-15', '2027-08-20']);
  assert.ok(/locked in for three years/.test(after[0].why));
  assert.ok(!p.stages.next.find((s) => /Tango/.test(s.name)), 'no locked units in the next-year step');
});

test('first in, first out: newer units never go before older units held over to the next year', () => {
  const h = { isin: 'A_REG', name: 'Alpha Reg', plan: 'regular', type: 'mf', value: 900000, units: 9000, cost: 540000, nav: 100,
    txns: [lot('2019-05-01', 3000, 200000), lot('2020-05-01', 3000, 240000), lot('2026-01-15', 3000, 100000)] };
  const p = build([h]);
  const next = p.stages.next.find((s) => /Alpha/.test(s.name)), after = p.stages.after.find((s) => /Alpha/.test(s.name));
  assert.ok(next && after, 'expected next-year and later steps');
  assert.strictEqual(after.date, next.date); assert.ok(/sold first/.test(after.why), after.why);
});

test('missed gains: no yearly rate for purchases under a year old', () => {
  const h = { isin: 'A', name: 'Alpha', type: 'mf', value: 10500, units: 1000, cost: 10000, txns: [lot('2026-06-01', 1000, 10000)] };
  const px = { PX: { n: 'Axis Nifty 100 Index Fund', index: 'Nifty 100', d0: '2026-01-01', nav: new Array(400).fill(10) } };
  const m = build([h], { proxyNavs: px }).missed.find((r) => r.name === 'Alpha Large Cap Fund');
  assert.ok(m && !m.skip && m.months === 4 && m.xirrFund == null, JSON.stringify(m));
});


// ---- investment policy intake ----
const core = [{ isin: 'C', name: 'Gamma Flexi Cap Fund', type: 'mf', value: 1000000, units: 5000, cost: 600000, txns: [lot('2020-01-10', 5000, 600000)] },
  { isin: 'G', name: 'Steady Corporate Bond Fund', type: 'mf', value: 500000, units: 5000, cost: 450000, txns: [lot('2022-01-10', 5000, 450000)] }];

test('policy: the lower of ability and willingness sets the profile', () => {
  const a = build(core, { answers: ans(Object.assign({}, strong, { fall: 0, drawdown: 0, exp: 0, tradeoff: 0, behaviour: 1 })) });
  assert.strictEqual(a.profile.ability.key, 'aggressive'); assert.strictEqual(a.profile.willingness.key, 'conservative');
  assert.strictEqual(a.profile.key, 'conservative'); assert.strictEqual(a.profile.limiter, 'willingness');
  const b = build(core, { answers: ans(Object.assign({}, bold, { age: 4, dependants: 2, income: 3, emergency: 0, emi: 3, insurance: 2, share: 3 })) });
  assert.strictEqual(b.profile.key, 'conservative'); assert.strictEqual(b.profile.limiter, 'ability');
  assert.ok(b.profile.ability.drags.length >= 5, 'drags listed: ' + b.profile.ability.drags.join(', '));
});

test('policy: a portfolio that is the main income is capped at moderate', () => {
  const p = build(core, { answers: ans(Object.assign({}, strong, bold, { incomeNeed: 2 })) });
  assert.strictEqual(p.profile.key, 'moderate'); assert.strictEqual(p.profile.capped, true);
});

test('policy: a near goal is held in cash and debt, and the mix is the goal-weighted blend', () => {
  const p = build(core, { answers: ans(Object.assign({}, strong, bold, { goals: [{ type: 3, year: 2028, amount: 1000000, priority: 0 }, { type: 0, year: 2045, amount: 1000000, priority: 0 }] })) });
  assert.strictEqual(p.profile.key, 'aggressive');
  assert.strictEqual(p.ips.goals[0].mixKey, 'cash'); assert.strictEqual(p.ips.goals[1].mixKey, 'aggressive');
  assert.ok(Math.abs(p.ips.mix.equity - 0.425) < 1e-9 && Math.abs(p.ips.mix.debt - 0.55) < 1e-9, JSON.stringify(p.ips.mix));
  assert.ok(p.ips.goals[1].target > 1000000 && p.ips.goals[1].sip >= 0, 'goal funding worked out');
});

test('policy: a flexible far goal keeps the profile mix; a must goal inside seven years is capped', () => {
  const p = build(core, { answers: ans(Object.assign({}, strong, bold, { goals: [{ type: 1, year: 2032, amount: 1000000, priority: 0 }, { type: 7, year: 2032, amount: 1000000, priority: 2 }] })) });
  assert.strictEqual(p.ips.goals[0].mixKey, 'moderate'); assert.strictEqual(p.ips.goals[1].mixKey, 'aggressive');
});

test('policy: the cash reserve and planned withdrawals become a liquid floor', () => {
  const p = build(core, { answers: ans({ expenses: 100000, emergency: 0, withdrawals: 150000 }) });
  assert.ok(Math.abs(p.ips.reserve - 600000) < 1, 'reserve ' + p.ips.reserve);
  assert.ok(Math.abs(p.ips.liquidFloor - 0.5) < 1e-9, 'floor ' + p.ips.liquidFloor);
  assert.ok(p.ips.mix.debt >= 0.5 && p.ips.mix.equity < 0.5, JSON.stringify(p.ips.mix));
  assert.ok(p.ips.flags.some((f) => f.k === 'reserve'));
  assert.ok(Math.abs(p.ips.mix.debt * p.ips.debtSplit.liquid - 0.5) < 1e-9, 'liquid share of the mix equals the floor');
});

test('policy: return objective above what the mix can earn raises a flag', () => {
  const p = build(core, { answers: ans({ returnNeed: 3 }) });
  assert.ok(p.ips.flags.some((f) => f.k === 'return'), p.ips.flags.map((f) => f.k).join(','));
  assert.ok(!build(core, { answers: ans({ returnNeed: 0 }) }).ips.flags.some((f) => f.k === 'return'));
});

test('policy: missing insurance and heavy EMIs are flagged first', () => {
  const p = build(core, { answers: ans({ insurance: 2, emi: 3 }) });
  assert.deepStrictEqual(p.ips.flags.map((f) => f.k).filter((k) => k === 'insurance' || k === 'emi'), ['insurance', 'emi']);
});

test('satellite: a good theme fund is kept within the allowance for a growth policy, reduced for a moderate one', () => {
  const withTheme = core.concat([{ isin: 'TH', name: 'Theta Infrastructure Fund', type: 'mf', value: 80000, units: 800, cost: 60000, txns: [lot('2021-03-01', 800, 60000)] }]);
  const growth = build(withTheme, { answers: ans(Object.assign({}, strong, { fall: 3, drawdown: 3, exp: 3, tradeoff: 1, behaviour: 2 })) });
  assert.strictEqual(growth.profile.key, 'growth');
  const t = find(growth, 'Theta Infrastructure Fund');
  assert.strictEqual(t.verdict, 'keep'); assert.ok(/satellite/.test(t.reasons[0]), t.reasons[0]);
  const mod = find(build(withTheme), 'Theta Infrastructure Fund');
  assert.strictEqual(mod.verdict, 'reduce'); assert.ok(/no place in a moderate policy/.test(mod.reasons[0]), mod.reasons[0]);
  const big = find(build(core.concat([{ isin: 'TH', name: 'Theta Infrastructure Fund', type: 'mf', value: 400000, units: 4000, cost: 300000, txns: [lot('2021-03-01', 4000, 300000)] }]),
    { answers: ans(Object.assign({}, strong, { fall: 3, drawdown: 3, exp: 3, tradeoff: 1, behaviour: 2 })) }), 'Theta Infrastructure Fund');
  assert.strictEqual(big.verdict, 'reduce'); assert.ok(/above the 10% satellite/.test(big.reasons[0]), big.reasons[0]);
});

test('preferences: avoiding small caps reduces them, preferring index puts the index fund first', () => {
  const small = find(build(core.concat([{ isin: 'E', name: 'Echo Small Cap Fund', type: 'mf', value: 60000, units: 600, cost: 50000, txns: [lot('2021-07-01', 600, 50000)] }]),
    { answers: ans({ exclude: { 1: true } }) }), 'Echo Small Cap Fund');
  assert.strictEqual(small.verdict, 'reduce'); assert.ok(/avoid small cap/.test(small.reasons[0]), small.reasons[0]);
  const p = build(core, { answers: ans({ exclude: { 2: true } }), scores: Object.assign({}, scores, { cheapestIndex: { 'Nifty 100': 'I1' } }) });
  const large = p.additions.find((a) => a.sub === 'large');
  assert.ok(large && large.pick && large.pick.isin === 'I1', JSON.stringify(large && large.pick));
});

test('policy: the monthly surplus is split across the sleeves that are short, and the fund cap follows the preference', () => {
  const p = build(core, { answers: ans({ surplus: 50000, simplicity: 0 }) });
  assert.strictEqual(p.maxEq, 3);
  const total = p.sip.rows.reduce((s, r) => s + r.monthly, 0);
  assert.ok(p.sip.rows.length >= 2 && Math.abs(total - 50000) < 1, JSON.stringify(p.sip));
});

test('policy: no goal given falls back to ten-year general wealth, and an empty statement still gets a policy', () => {
  const p = build(core, { answers: ans({ goals: [] }) });
  assert.strictEqual(p.ips.assumed, true); assert.strictEqual(p.ips.goals[0].years, 10);
  const e = build([]); assert.strictEqual(e.empty, true); assert.ok(e.ips && e.ips.mix);
});

console.log('\n' + passed + ' fixture tests passed');
