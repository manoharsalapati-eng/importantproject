// End-to-end test of food-vision-lab.html in headless Chromium (Playwright).
// Exercises every pipeline through the real UI: synthetic images, pointer tools,
// stage views, uploads, CSV export, the in-browser validation suite, the
// main-thread fallback, dark mode and a phone-width layout.
//
//   node tests/browser.test.mjs            (screenshots go to tests/screenshots/)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// CommonJS resolution so a globally installed Playwright (NODE_PATH) is found as well as a local one.
const { chromium } = createRequire(import.meta.url)('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const pageUrl = 'file://' + path.resolve(here, '..', 'food-vision-lab.html');
const shots = process.env.FVL_SHOTS || path.join(here, 'screenshots');
fs.mkdirSync(shots, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fvl-'));

let failures = 0;
const check = (cond, msg, detail = '') => { console.log(`${cond ? 'ok  ' : 'FAIL'}  ${msg}${detail ? '  — ' + detail : ''}`); if (!cond) failures++; };
const rel = (m, t) => Math.abs(m - t) / Math.abs(t);

async function open(browser, o = {}) {
  const ctx = await browser.newContext({ viewport: o.viewport || { width: 1500, height: 1000 }, colorScheme: o.colorScheme || 'light', deviceScaleFactor: 1 });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  // Keep the run offline and deterministic: web fonts fall back to the system stack.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  if (o.noWorker) await ctx.addInitScript(() => { delete window.Worker; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/ERR_FAILED|fonts\.g/.test(m.text() + (m.location().url || ''))) errors.push(m.text()); });
  await page.goto(pageUrl + (o.hash || ''));
  return { ctx, page, errors };
}
// Image pixel (x, y) -> page coordinates of a viewer canvas.
async function at(page, sel, x, y) {
  const b = await page.locator(sel + ' canvas.base').boundingBox();
  const size = await page.evaluate((s) => { const c = document.querySelector(s + ' canvas.base'); return [c.width, c.height]; }, sel);
  return [b.x + (x + 0.5) * b.width / size[0], b.y + (y + 0.5) * b.height / size[1]];
}
async function drag(page, sel, x0, y0, x1, y1) {
  const a = await at(page, sel, x0, y0), b = await at(page, sel, x1, y1);
  await page.mouse.move(a[0], a[1]); await page.mouse.down();
  await page.mouse.move((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, { steps: 4 });
  await page.mouse.move(b[0], b[1], { steps: 4 }); await page.mouse.up();
}
const BUSY = { Color: '#c-busy', Micro: '#m-busy', Shrink: '#s-busy' };
const settle = (page, mod) => page.waitForFunction(([m, sel]) => { const L = window.FoodVisionLab; return L && L[m].res && document.querySelector(sel).hidden && L.Engine.busy === 0; }, [mod, BUSY[mod]], { timeout: 60000 });
const changed = async (page, mod, prev) => page.waitForFunction(([m, p]) => window.FoodVisionLab[m].res && window.FoodVisionLab[m].res !== window[p] && window.FoodVisionLab.Engine.busy === 0, [mod, prev], { timeout: 60000 });
const mark = (page, mod, key) => page.evaluate(([m, k]) => { window[k] = window.FoodVisionLab[m].res; }, [mod, key]);

const browser = await chromium.launch();
try {
  /* ------------------------------------------------ 1 · Colorimeter */
  {
    const { ctx, page, errors } = await open(browser, { hash: '#color' });
    await page.waitForFunction(() => document.querySelector('#engine-chip').dataset.state === 'worker', null, { timeout: 15000 });
    check(true, 'WebWorker engine started');
    await settle(page, 'Color');
    let r = await page.evaluate(() => { const r = window.FoodVisionLab.Color.res; return { patches: r.patches.map((p) => p.dE00), raw: r.patches.map((p) => p.dE00raw), mask: r.maskArea, gains: r.gains, L: r.stats.L.mean, BI: r.stats.BI.mean, tiles: document.querySelectorAll('#c-tiles .tile').length }; });
    check(Math.max(...r.patches) < 1, 'calibrated patches within ΔE00 < 1', Math.max(...r.patches).toFixed(3));
    check(Math.max(...r.raw) > 3, 'uncorrected patches show the colour cast', Math.max(...r.raw).toFixed(2));
    check(r.tiles === 9 && r.mask > 100000, 'sample tiles and mask rendered', `${r.tiles} tiles, ${r.mask} px`);
    check(Math.abs(r.gains[0] - 1 / (1.12 * 0.86)) < 0.02 && Math.abs(r.gains[2] - 1 / (0.78 * 0.86)) < 0.03, 'white-tile gains invert the synthetic cast', r.gains.map((g) => g.toFixed(3)).join(' '));
    await page.screenshot({ path: path.join(shots, '01-colorimeter-dE.png'), fullPage: true });
    const [hx, hy] = await at(page, '#c-viewer', 285, 280);
    await page.mouse.move(hx, hy);
    check(/L\*a\*b\*/.test(await page.textContent('#c-readout')), 'hover readout shows L*a*b*');
    for (const v of ['original', 'calibrated', 'BI', 'L', 'a', 'b', 'C', 'h', 'WI', 'dE']) await page.selectOption('#c-view', v);
    for (const c of ['viridis', 'magma', 'blues', 'diverging', 'inferno']) await page.selectOption('#c-cmap', c);
    check(errors.length === 0, 'all map views and colour maps render', errors.join(' | '));
    // White ROI tool redraws the calibration patch
    await mark(page, 'Color', '__c1');
    await page.click('#c-tools button[data-tool="white"]');
    await drag(page, '#c-viewer', 615, 50, 745, 172);
    await changed(page, 'Color', '__c1');
    r = await page.evaluate(() => { const L = window.FoodVisionLab.Color; return { rect: L.opts.whiteRect, max: Math.max(...L.res.patches.map((p) => p.dE00)) }; });
    check(Math.abs(r.rect.x - 615) < 3 && Math.abs(r.rect.w - 130) < 4 && r.max < 1, 'White ROI drawn with the pointer recalibrates', `rect ${Math.round(r.rect.x)},${Math.round(r.rect.y)} ${Math.round(r.rect.w)}×${Math.round(r.rect.h)}, max ΔE00 ${r.max.toFixed(3)}`);
    // Reference ROI in the pale centre of the cookie
    await mark(page, 'Color', '__c2');
    await page.click('#c-tools button[data-tool="ref"]');
    await drag(page, '#c-viewer', 265, 260, 305, 300);
    await changed(page, 'Color', '__c2');
    r = await page.evaluate(() => window.FoodVisionLab.Color.res.ref);
    check(r.mode === 'roi' && r.L > 70 && r.L < 86, 'Reference ROI sets the ΔE reference', `L*a*b* ${r.L.toFixed(1)} ${r.a.toFixed(1)} ${r.b.toFixed(1)}`);
    await mark(page, 'Color', '__c3');
    await page.click('#c-tools button[data-tool="pick"]');
    const [px, py] = await at(page, '#c-viewer', 498, 282); await page.mouse.click(px, py);
    await changed(page, 'Color', '__c3');
    r = await page.evaluate(() => window.FoodVisionLab.Color.res.ref);
    check(r.mode === 'pixel' && r.L < 60, 'Pick tool takes the reference from a browned pixel', `L* ${r.L.toFixed(1)}`);
    await page.click('#c-tools button[data-tool="line"]');
    await drag(page, '#c-viewer', 80, 280, 500, 280);
    r = await page.evaluate(() => { const s = window.FoodVisionLab.Color.charts.profile.spec; return s && s.series[0].pts.length; });
    check(r > 300, 'Profile tool samples the line', `${r} samples`);
    await mark(page, 'Color', '__c4');
    await page.selectOption('#c-formula', '76'); await changed(page, 'Color', '__c4');
    await mark(page, 'Color', '__c5');
    await page.selectOption('#c-mask', 'all'); await changed(page, 'Color', '__c5');
    r = await page.evaluate(() => ({ f: window.FoodVisionLab.Color.res.formula, m: window.FoodVisionLab.Color.res.maskArea }));
    check(r.f === '76' && r.m > 400000, 'CIE76 formula and whole-image mask apply', `${r.f}, ${r.m} px`);
    await page.screenshot({ path: path.join(shots, '02-colorimeter-tools.png'), fullPage: false });
    // Upload a photo: export the synthetic scene as PNG and load it through the file input
    const png = await page.evaluate(() => { const L = window.FoodVisionLab.Color; const c = document.createElement('canvas'); c.width = L.img.width; c.height = L.img.height; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(L.img.data), c.width, c.height), 0, 0); return c.toDataURL('image/png').split(',')[1]; });
    const pngPath = path.join(tmp, 'cookie-photo.png'); fs.writeFileSync(pngPath, Buffer.from(png, 'base64'));
    await mark(page, 'Color', '__c6');
    await page.setInputFiles('#c-file', pngPath); await changed(page, 'Color', '__c6');
    r = await page.evaluate(() => ({ white: window.FoodVisionLab.Color.res.white, tool: window.FoodVisionLab.Color.tool, note: document.querySelector('#c-src-note').textContent }));
    check(r.white === null && r.tool === 'white' && /cookie-photo\.png/.test(r.note), 'uploaded photo analysed; White ROI tool armed');
    check(errors.length === 0, 'no console errors on the colorimeter', errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------ 2 · Microstructure */
  {
    const { ctx, page, errors } = await open(browser, { hash: '#micro' });
    await settle(page, 'Micro');
    let r = await page.evaluate(() => { const M = window.FoodVisionLab.Micro; return { ok: M.res.counts.ok, gt: M.src.truth.count, d32: M.res.stats.d32, gd32: M.src.truth.stats.d32, af: M.res.areaFraction, gaf: M.src.truth.areaFraction }; });
    check(rel(r.ok, r.gt) <= 0.05, 'emulsion droplet count within 5% of ground truth', `${r.ok} vs ${r.gt}`);
    check(rel(r.d32, r.gd32) <= 0.04, 'emulsion Sauter d32 within 4%', `${r.d32.toFixed(2)} vs ${r.gd32.toFixed(2)} µm`);
    check(Math.abs(r.af - r.gaf) <= 0.015, 'dispersed-phase area fraction within 1.5 pp', `${(100 * r.af).toFixed(2)}% vs ${(100 * r.gaf).toFixed(2)}%`);
    for (const st of ['original', 'gray', 'blur', 'binary', 'morph', 'dist', 'markers', 'labels', 'overlay']) {
      await page.click(`#m-stages button[data-stage="${st}"]`);
      if (st === 'dist' || st === 'labels') await page.screenshot({ path: path.join(shots, `03-micro-${st}.png`), clip: await page.locator('#m-stage').boundingBox() });
    }
    check(errors.length === 0, 'all nine pipeline stages render', errors.join(' | '));
    const big = await page.evaluate(() => { const M = window.FoodVisionLab.Micro; return M.res.particles.filter((p) => p.status === 'ok').sort((a, b) => b.ecd - a.ecd)[0]; });
    const [bx, by] = await at(page, '#m-viewer', big.cx, big.cy);
    await page.mouse.move(bx, by);
    check(await page.isVisible('.stage-tip') && /ECD/.test(await page.textContent('.stage-tip')), 'hovering a droplet shows its measurements');
    await page.mouse.click(bx, by);
    check(await page.evaluate((id) => !!document.querySelector(`#m-table tr.sel[data-id="${id}"]`), big.id), 'clicking a droplet selects its table row');
    await page.screenshot({ path: path.join(shots, '04-micro-overlay.png'), fullPage: true });
    await page.click('#m-table th[data-sort="circularity"]');
    r = await page.evaluate(() => Array.from(document.querySelectorAll('#m-table tbody tr')).slice(0, 5).map((tr) => +tr.children[8].textContent));
    check(r.every((v, i) => i === 0 || v <= r[i - 1]), 'table sorts by circularity', r.join(', '));
    await page.click('#m-weighting button[data-w="number"]');
    check((await page.textContent('#m-tiles')).includes('Dn50'), 'number weighting relabels percentiles as Dn');
    await page.click('#m-copy');
    await page.waitForSelector('#fvl-toast:not([hidden])', { timeout: 5000 });
    const clip = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
    check(/^ID,Status,Area \(µm²\),ECD \(µm\)/.test(clip) && clip.split('\n').length > 400, 'Copy CSV puts the object table on the clipboard', `${clip.split('\n').length - 1} rows`);
    // watershed off -> merged droplets
    await mark(page, 'Micro', '__m1');
    await page.click('#m-ws'); await changed(page, 'Micro', '__m1');
    const off = await page.evaluate(() => window.FoodVisionLab.Micro.res.counts.ok);
    const truthCount = await page.evaluate(() => window.FoodVisionLab.Micro.src.truth.count);
    check(off < truthCount * 0.8, 'without watershed touching droplets merge', `${off} objects vs ${truthCount} droplets`);
    // manual threshold
    await mark(page, 'Micro', '__m2');
    await page.selectOption('#m-thmode', 'manual');
    check(await page.isVisible('#m-th'), 'manual threshold slider appears');
    await changed(page, 'Micro', '__m2');
    // crumb and powder presets
    await mark(page, 'Micro', '__m3');
    await page.selectOption('#m-preset', 'crumb'); await changed(page, 'Micro', '__m3');
    r = await page.evaluate(() => { const M = window.FoodVisionLab.Micro; return { af: M.res.areaFraction, gt: M.src.truth.porosity, title: document.querySelector('#m-tiles').textContent }; });
    check(Math.abs(r.af - r.gt) <= 0.025 && /Porosity/.test(r.title), 'bread crumb porosity within 2.5 pp', `${(100 * r.af).toFixed(2)}% vs ${(100 * r.gt).toFixed(2)}%`);
    await page.screenshot({ path: path.join(shots, '05-micro-crumb.png'), fullPage: false });
    await mark(page, 'Micro', '__m4');
    await page.selectOption('#m-preset', 'powder'); await changed(page, 'Micro', '__m4');
    r = await page.evaluate(() => { const M = window.FoodVisionLab.Micro; return { ok: M.res.counts.ok, gt: M.src.truth.count, d32: M.res.stats.d32, gd32: M.src.truth.stats.d32 }; });
    check(rel(r.ok, r.gt) <= 0.12 && rel(r.d32, r.gd32) <= 0.06, 'powder count within 12% and d32 within 6%', `${r.ok} vs ${r.gt}; ${r.d32.toFixed(1)} vs ${r.gd32.toFixed(1)} µm`);
    // upload a micrograph
    await page.click('#m-stages button[data-stage="original"]');
    const data = await page.evaluate(() => document.querySelector('#m-viewer canvas.base').toDataURL('image/png').split(',')[1]);
    const p2 = path.join(tmp, 'powder.png'); fs.writeFileSync(p2, Buffer.from(data, 'base64'));
    await mark(page, 'Micro', '__m5');
    await page.setInputFiles('#m-file', p2); await changed(page, 'Micro', '__m5');
    r = await page.evaluate(() => ({ ok: window.FoodVisionLab.Micro.res.counts.ok, bright: window.FoodVisionLab.Micro.res.bright }));
    check(r.ok > 150 && r.bright === false, 'uploaded micrograph segmented with automatic polarity', `${r.ok} objects, dark phase`);
    check(errors.length === 0, 'no console errors on the microstructure tab', errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------ 3 · Shrinkage */
  {
    const { ctx, page, errors } = await open(browser, { hash: '#shrink' });
    await settle(page, 'Shrink');
    let r = await page.evaluate(() => { const S = window.FoodVisionLab.Shrink; return { n: S.res.rows.length, k: S.res.fit.k, yeq: S.res.fit.yeq, tk: S.src.truth.k, ty: S.src.truth.yeq, err: Math.max(...S.res.rows.map((q, i) => Math.abs(q.areaRatio - S.src.truth.areaRatio[i]))) }; });
    check(r.n === 13 && r.err < 0.01, '13 frames tracked; A/A0 within 0.01 of ground truth', `max error ${r.err.toFixed(4)}`);
    check(rel(r.k, r.tk) < 0.1 && Math.abs(r.yeq - r.ty) < 0.03, 'kinetic fit recovers k and A∞/A0', `k ${r.k.toFixed(4)}, A∞/A0 ${r.yeq.toFixed(3)}`);
    await page.fill('#s-frame', '12'); await page.dispatchEvent('#s-frame', 'input');
    check(/t = 120 min/.test(await page.textContent('#s-frame-label')), 'frame slider moves to the last frame');
    await page.click('#s-overlay button[data-ov="all"]');
    await page.screenshot({ path: path.join(shots, '06-shrinkage.png'), fullPage: true });
    await page.click('#s-play'); await page.waitForTimeout(1300); await page.click('#s-play');
    r = await page.evaluate(() => window.FoodVisionLab.Shrink.idx);
    check(r >= 0 && r <= 12 && (await page.textContent('#s-play')).includes('Play'), 'play and pause step through frames', `stopped at frame ${r + 1}`);
    // upload three frames
    const files = [];
    for (const k of [0, 6, 12]) {
      const b64 = await page.evaluate((i) => { const f = window.FoodVisionLab.Shrink.frames[i]; const c = document.createElement('canvas'); c.width = f.width; c.height = f.height; c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(f.data), f.width, f.height), 0, 0); return c.toDataURL('image/png').split(',')[1]; }, k);
      const p = path.join(tmp, `frame-${String(k).padStart(2, '0')}.png`); fs.writeFileSync(p, Buffer.from(b64, 'base64')); files.push(p);
    }
    await page.fill('#s-dt', '60');
    await mark(page, 'Shrink', '__s1');
    await page.setInputFiles('#s-file', files); await changed(page, 'Shrink', '__s1');
    r = await page.evaluate(() => window.FoodVisionLab.Shrink.res.rows.map((q) => [q.t, +q.areaRatio.toFixed(3)]));
    check(r.length === 3 && r[2][0] === 120 && r[2][1] < 0.5, 'uploaded frame sequence ordered by name and timed', JSON.stringify(r));
    check(errors.length === 0, 'no console errors on the shrinkage tab', errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------ 4 · Validation suite in the browser */
  {
    const { ctx, page, errors } = await open(browser, { hash: '#tests' });
    await page.waitForFunction(() => document.documentElement.dataset.testsTotal, null, { timeout: 180000 });
    const r = await page.evaluate(() => ({ p: +document.documentElement.dataset.testsPassed, t: +document.documentElement.dataset.testsTotal, fails: Array.from(document.querySelectorAll('#t-table tr')).filter((tr) => /Fail/.test(tr.textContent)).map((tr) => tr.textContent) }));
    check(r.p === r.t && r.t >= 50, `validation suite passes in the browser worker`, `${r.p}/${r.t}${r.fails.length ? ' · ' + r.fails.join(' | ') : ''}`);
    await page.screenshot({ path: path.join(shots, '07-validation.png'), fullPage: true });
    check(errors.length === 0, 'no console errors during validation', errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------ 5 · Main-thread fallback (no Worker) */
  {
    const { ctx, page, errors } = await open(browser, { hash: '#micro', noWorker: true });
    await settle(page, 'Micro');
    const st = await page.evaluate(() => [document.querySelector('#engine-chip').dataset.state, window.FoodVisionLab.Micro.res.counts.ok]);
    check(st[0] === 'main' && st[1] > 400, 'without WebWorker support the pipelines run on the main thread', `${st[0]}, ${st[1]} droplets`);
    check(errors.length === 0, 'no console errors in fallback mode', errors.join(' | '));
    await ctx.close();
  }

  /* ------------------------------------------------ 6 · Dark mode and phone width */
  {
    const { ctx, page, errors } = await open(browser, { hash: '#color', colorScheme: 'dark' });
    await settle(page, 'Color');
    await page.screenshot({ path: path.join(shots, '08-dark-colorimeter.png'), fullPage: false });
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    check(bg === 'rgb(13, 16, 15)', 'dark colour scheme applies dark tokens', bg);
    await page.click('#theme-btn');
    check(await page.evaluate(() => document.documentElement.dataset.theme === 'light' && getComputedStyle(document.body).backgroundColor === 'rgb(237, 240, 236)'), 'theme button overrides the system preference');
    check(errors.length === 0, 'no console errors in dark mode', errors.join(' | '));
    await ctx.close();
  }
  for (const tab of ['color', 'micro', 'shrink', 'tests']) {
    const { ctx, page, errors } = await open(browser, { hash: '#' + tab, viewport: { width: 390, height: 844 } });
    if (tab !== 'tests') await settle(page, { color: 'Color', micro: 'Micro', shrink: 'Shrink' }[tab]);
    else await page.waitForTimeout(500);
    const ov = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
    check(ov[0] <= ov[1], `phone width (390 px): no horizontal scroll on ${tab}`, `${ov[0]} ≤ ${ov[1]}`);
    if (tab === 'micro' || tab === 'color') await page.screenshot({ path: path.join(shots, `09-phone-${tab}.png`), fullPage: false });
    check(errors.length === 0, `no console errors at phone width on ${tab}`, errors.join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed` : '\nAll browser checks passed');
process.exit(failures ? 1 : 0);
