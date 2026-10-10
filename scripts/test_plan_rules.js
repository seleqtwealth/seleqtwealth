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
    FOC1: rec(Object.assign({ n: 'Fox Flexi Cap Fund', cat: 'flexi_cap', catLabel: 'Flexi Cap', score: 90, cons: 0.95, beat: 47, margin: 3.0, amc: 'Fox Mutual Fund' }, P))
  },
  sib: { A_REG: 'A', G_REG: 'G', T_REG: 'T' },
  cats: { large_cap: { median: 55 }, flexi_cap: { median: 55 }, focused: { median: 55 }, mid_cap: { median: 50 }, corporate_bond: { median: 50 }, index: { median: 50 }, small_cap: { median: 50 }, elss: { median: 50 } },
  picks: { large_cap: ['A', 'B'], flexi_cap: ['FOC1', 'C'], focused: ['FOC1'], mid_cap: ['W'], small_cap: ['E'], corporate_bond: ['G'], short_duration: [], liquid: [], money_market: [], aggressive_hybrid: [], balanced_advantage: [], multi_asset: [] },
  cheapestIndex: {}, gf2018: {}
};
const H = { i: { C: 0, D: 1 }, f: [[null, 98, [[0, 30], [1, 25], [2, 20]]], [null, 97, [[0, 28], [1, 24], [2, 20], [3, 5]]]], s: [] };
const schemes = { A_REG: { plan: 'regular', ter: 1.6 }, G_REG: { plan: 'regular', ter: 0.9 }, T_REG: { plan: 'regular', ter: 2.0 } };
const moderate = { age: 1, horizon: 2, goal: 2, income: 1, fall: 1, exp: 2, slab: 6, booked: 0 };
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

console.log('\n' + passed + ' fixture tests passed');
