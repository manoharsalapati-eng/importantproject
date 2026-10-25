// Runs the computer-vision core of food-vision-lab.html under Node, without a browser:
// the same validation suite the page runs, plus a robustness sweep over
// random seeds that the in-page suite does not cover.
//
//   node tests/core.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.resolve(here, '..', 'food-vision-lab.html'), 'utf8');
const m = html.match(/<script id="fvl-core">([\s\S]*?)<\/script>/);
if (!m) { console.error('Core script block not found in food-vision-lab.html'); process.exit(1); }
// Evaluate in this realm (a vm context slows every global lookup ~8x); the core attaches to `self`.
const root = {};
new Function('self', m[1])(root);
const F = root.FVL;

let failures = 0;
const suite = F.runSelfTests((i, n, r) => {
  console.log(`${r.pass ? 'ok  ' : 'FAIL'}  [${r.group}] ${r.name}  — ${r.measured}${r.pass ? '' : `  (expected ${r.expected}, ${r.tol})`}`);
});
failures += suite.total - suite.passed;
console.log(`\nValidation suite: ${suite.passed}/${suite.total} in ${(suite.ms / 1000).toFixed(1)} s\n`);

// Seed sweep: accuracy must hold on images the defaults were not chosen on.
const pct = (a, b) => (100 * (a - b)) / b;
const sweep = [
  ['emulsion', (g, r) => [Math.abs(pct(r.counts.ok, g.truth.count)) <= 5 && Math.abs(pct(r.stats.d32, g.truth.statsAll.d32)) <= 4,
    `count ${pct(r.counts.ok, g.truth.count).toFixed(1)}%, d32 ${pct(r.stats.d32, g.truth.statsAll.d32).toFixed(1)}%`]],
  ['crumb', (g, r) => [Math.abs(100 * (r.areaFraction - g.truth.porosity)) <= 2.5, `porosity ${(100 * (r.areaFraction - g.truth.porosity)).toFixed(2)} pp`]],
  // Touching angular particles: the count runs 8–15 % low (merged contacts); d32 must hold.
  ['powder', (g, r) => [Math.abs(pct(r.counts.ok, g.truth.count)) <= 16 && Math.abs(pct(r.stats.d32, g.truth.statsAll.d32)) <= 6, `count ${pct(r.counts.ok, g.truth.count).toFixed(1)}%, d32 ${pct(r.stats.d32, g.truth.statsAll.d32).toFixed(1)}%`]]
];
for (const [kind, judge] of sweep) {
  for (const seed of [101, 202, 303, 404, 505]) {
    const g = F.generate(kind, seed);
    const r = F.analyzeParticles(g.image, g.defaults);
    const [ok, msg] = judge(g, r);
    console.log(`${ok ? 'ok  ' : 'FAIL'}  [seed sweep] ${kind} seed ${seed}  — ${msg}`);
    if (!ok) failures++;
  }
}
for (const seed of [17, 29]) {
  const g = F.genShrinkage(seed);
  const r = F.analyzeTimeLapse(g.frames, g.times, g.defaults);
  const err = Math.max(...r.rows.map((q, i) => Math.abs(q.areaRatio - g.truth.areaRatio[i])));
  const ok = err < 0.01 && Math.abs(pct(r.fit.k, g.truth.k)) <= 10;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  [seed sweep] shrinkage seed ${seed}  — max |ΔA/A0| ${err.toFixed(4)}, k ${r.fit.k.toFixed(4)}`);
  if (!ok) failures++;
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll core checks passed');
process.exit(failures ? 1 : 0);
