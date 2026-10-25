# Food Vision Lab: Study Notes, Explained Simply

These notes teach you how `food-vision-lab.html` works, line by line, so you can rebuild it, debug it and question it without help.

How these notes were checked:
- Every code block marked **"from food-vision-lab.html"** is copied by a script straight from the file, with its real line numbers.
- Every number in the worked examples was produced by running the real functions and was also recomputed with plain formulas. The two agree.
- If you redo the arithmetic with a calculator and round as you go, your last digit may differ by 1. The code keeps about 16 digits.

**What you need to know first:** basic JavaScript (arrays, loops, functions), matrices (multiplying a 3×3 matrix by a vector), and logarithms/powers.

---

## 0. Map of the file

The file is 4,437 lines. It has three `<script>` blocks.

| Lines | What lives there |
|---|---|
| 1–752 | Page layout (HTML) and styling (CSS). No maths. |
| 753–3124 | **The core library `FVL`.** All the maths. It never touches the page, so it runs in the page, in a worker and in Node. |
| 849–970 | Colour science: sRGB → linear → XYZ → L\*a\*b\*, ΔE, browning/whiteness indices |
| 1008–1491 | Image processing: grey, blur, Otsu, distance transform, morphology, labelling, watershed, box counting |
| 1494–1792 | Measuring objects (area, perimeter, Feret…) and statistics (d32, D10/50/90, fits, kinetics) |
| 1795–2216 | The three pipelines (plus colour-chart calibration helpers): `analyzeColor`, `analyzeParticles`, `analyzeTimeLapse` |
| 2220–2595 | Synthetic test images (cookie, emulsion, crumb, powder, apple slice) |
| 2597–3093 | The 54 self-tests |
| 3095–3119 | `dispatch` (which job to run) and `transferables` (fast hand-over of results) |
| 3125–3136 | **The worker script** (12 lines) |
| 3137–4435 | **The user interface:** Engine (talks to the worker), Viewer (canvas), Chart, the four tabs |

**Conventions used everywhere:**
- `x` is the column and `y` is the row. Pixel (0,0) is the top-left.
- An image of width `w` stores pixel (x, y) at position `i = y*w + x` in any one-value-per-pixel array.
- In the RGBA byte array, that pixel's red value is at `j = 4*i`, green at `j+1`, blue at `j+2` and alpha at `j+3`.

---

# PART 1: A tiny photo, calculated by hand

## 1.0 The 3×3 test photo

Nine pixels, as a phone might record them under warm (yellowish) light:

| | x = 0 | x = 1 | x = 2 |
|---|---|---|---|
| **y = 0** | white tile (242, 226, 182) | pale dough (232, 196, 130) | background (14, 12, 10) |
| **y = 1** | golden (214, 160, 88) | crust (150, 92, 44) | background (16, 13, 11) |
| **y = 2** | background (13, 12, 10) | background (15, 13, 10) | background (14, 12, 11) |

The white tile looks yellow because its blue value (182) is much lower than red (242). That is the colour cast we want to remove. The tile's certificate says its true colour is **L\* = 95, a\* = 0, b\* = 0** (a neutral white).

To run the real code on this photo yourself, open `food-vision-lab.html`, press F12 and paste this into the console:

```js
const d = new Uint8ClampedArray([242,226,182,255, 232,196,130,255, 14,12,10,255, 214,160,88,255, 150,92,44,255, 16,13,11,255, 13,12,10,255, 15,13,10,255, 14,12,11,255]);
const R = FVL.analyzeColor({ width: 3, height: 3, data: d }, { whiteRect: {x:0,y:0,w:1,h:1}, whiteLab: {L:95,a:0,b:0}, maskMode: 'all', refMode: 'custom', refLab: {L:64,a:9,b:32} });
console.table([0,1,2,3,4,5,6,7,8].map(i => ({ L: R.maps.L[i], a: R.maps.a[i], b: R.maps.b[i], dE00: R.maps.dE[i], BI: R.maps.BI[i] })));
```

The code does gamma expansion (your item **b**) before white balance (your item **a**), because the white-balance gains are computed on linear values. So we go in that order.

## 1.1 (b) sRGB → linear RGB ("gamma expansion")

**Why:** Cameras store brightness in a squashed scale, so that 8 bits give more steps in the dark tones where eyes are sensitive. Light physically adds up in the *un-squashed* (linear) scale. All colour maths must happen in linear values.

**The rule (IEC 61966-2-1):** First divide by 255 to get c between 0 and 1. Then:
- if c ≤ 0.04045: linear = c / 12.92 (a short straight piece near black)
- otherwise: linear = ((c + 0.055) / 1.055)^2.4

**By hand: the tile's red value, 242**
1. c = 242 / 255 = 0.949020
2. c > 0.04045, so use the power rule: (0.949020 + 0.055) / 1.055 = 0.951677
3. 0.951677^2.4 = **0.887923**

**The tile's green value, 226:**
- c = 0.886275
- (c + 0.055)/1.055 = 0.892203
- ^2.4 = **0.760525**

**The tile's blue value, 182:**
- c = 0.713725
- (c + 0.055)/1.055 = 0.728650
- ^2.4 = **0.467784**

**A dark value, 10 (blue channel of a background pixel):**
- c = 10/255 = 0.039216
- 0.039216 ≤ 0.04045, so use the straight piece: 0.039216 / 12.92 = **0.003035**

Compare 12: c = 0.047059 is just above the limit, so it uses the power rule and gives 0.003677. The two pieces meet smoothly at c = 0.04045.

Notice that 182 is 75% of 242, but in linear light the blue is only 0.4678/0.8879 = 53% of the red. The squashing hides how strong the cast really is.

All 27 linear values, from the code:

| pixel | R lin | G lin | B lin |
|---|---|---|---|
| tile | 0.8879 | 0.7605 | 0.4678 |
| pale dough | 0.8070 | 0.5520 | 0.2232 |
| background (2,0) | 0.0044 | 0.0037 | 0.0030 |
| golden | 0.6724 | 0.3515 | 0.0976 |
| crust | 0.3050 | 0.1070 | 0.0252 |
| background (2,1) | 0.0052 | 0.0040 | 0.0033 |
| background (0,2) | 0.0040 | 0.0037 | 0.0030 |
| background (1,2) | 0.0048 | 0.0040 | 0.0030 |
| background (2,2) | 0.0044 | 0.0037 | 0.0033 |

**The code: lookup table and function,** `food-vision-lab.html` lines 852–861:
```js
// food-vision-lab.html lines 852–861
const S2L = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
FVL.S2L = S2L;
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const linearToSrgb = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
FVL.srgbToLinear = srgbToLinear;
FVL.linearToSrgb = linearToSrgb;
```

Line by line:
- `const S2L = new Float64Array(256);` makes an array of 256 decimal numbers (64-bit precision). An 8-bit value can only be 0–255, so the answer for every possible input is computed **once** and stored. "S2L" means "sRGB to linear".
- `for (let i = 0; i < 256; i++) {` visits every possible 8-bit value.
- `const c = i / 255;` scales the value to 0…1.
- `S2L[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);` is the two-piece rule. `a ? b : c` means "if a then b else c".
- `FVL.S2L = S2L;` makes the table available to the rest of the program (and to you in the console as `FVL.S2L[242]`).
- `srgbToLinear` is the same rule for any decimal c (not just 256 steps). `linearToSrgb` is the reverse, used when showing the corrected image.

Later code just writes `S2L[data[j]]`: one array read instead of a `Math.pow` per pixel. That is about 50 times faster.

## 1.2 (a) White-balance normalisation

**Idea:** We know what the tile *should* be (L\* 95, neutral). We measure what it *is*. For each channel, the ratio target ÷ measured is a "gain". Multiplying every pixel by those gains removes the cast. This is called a **von Kries / diagonal correction**: one number per channel, applied in linear light.

**Step 1: the target linear RGB of the certificate (95, 0, 0).** The inverse Lab formula (`labToXyz`) gives:
- f_y = (L + 16)/116 = 111/116 = 0.956897
- Because a\* = 0 and b\* = 0: f_x = f_y + a/500 = 0.956897 and f_z = f_y − b/200 = 0.956897
- y_r = f_y³ = 0.876183 (f_y³ > 0.008856, so the cube branch is used). Likewise x_r = z_r = 0.876183.
- X = 0.876183 × 0.95047 = 0.832786, Y = 0.876183, Z = 0.876183 × 1.08883 = 0.954015

The matrix from XYZ back to RGB maps the white point (0.95047, 1, 1.08883) to (1, 1, 1). Our XYZ is that white point times 0.876183, so target RGB = **(0.876183, 0.876183, 0.876183)**.

Tiny detail: the code gets 0.8761834 / 0.8761831 / 0.8761833. That is because the published 7-digit matrix rows sum to 1.0000001 instead of exactly 1. The difference is far too small to matter.

**Step 2: gains = target ÷ measured (linear values from 1.1):**
- g_R = 0.876183 / 0.887923 = **0.986778**
- g_G = 0.876183 / 0.760525 = **1.152077**
- g_B = 0.876183 / 0.467784 = **1.873053**

Blue is boosted by 87%: the warm light was very short of blue.

**Step 3: apply them.** Golden pixel: linear (0.672443, 0.351533, 0.097587) × gains = **(0.663552, 0.404993, 0.182786)**. The tile itself becomes exactly (0.876183, 0.876183, 0.876183), which is neutral.

**The code:** the white-balance block of `analyzeColor`, lines 1906–1921:
```js
// food-vision-lab.html lines 1906–1921
  const whiteLab = o.whiteLab || { L: 96, a: -0.3, b: 1.8 };
  const whiteRect = clampRect(o.whiteRect, w, h);
  let gains = [1, 1, 1], white = null;
  if (whiteRect) {
    let sr = 0, sg = 0, sb = 0, n = 0, clip = 0;
    for (let y = whiteRect.y; y < whiteRect.y + whiteRect.h; y++) for (let x = whiteRect.x; x < whiteRect.x + whiteRect.w; x++) {
      const j = 4 * (y * w + x);
      if (data[j] >= 254 || data[j + 1] >= 254 || data[j + 2] >= 254) clip++;
      sr += S2L[data[j]]; sg += S2L[data[j + 1]]; sb += S2L[data[j + 2]]; n++;
    }
    const meas = [sr / n, sg / n, sb / n];
    const target = labToLinear(whiteLab.L, whiteLab.a, whiteLab.b);
    const g = meas.map((m, k) => (m > 1e-6 ? target[k] / m : 1));
    white = { rect: whiteRect, measuredLin: meas, measuredLab: linearToLab(meas[0], meas[1], meas[2]), targetLin: target, gains: g, clippedFraction: clip / n };
    if (o.normalize !== false) gains = g;
  }
```

- `whiteLab = o.whiteLab || {...}` takes the certificate you typed. If there is none, it uses 96 / −0.3 / 1.8.
- `whiteRect = clampRect(o.whiteRect, w, h)` takes the rectangle you drew and trims it to the image. (`clampRect`, lines 1798–1803, also rounds to whole pixels.)
- `let gains = [1, 1, 1], white = null;`: with no rectangle, nothing changes.
- The double `for` loop walks over every pixel inside the rectangle.
- `const j = 4 * (y * w + x);` is the position of that pixel's red byte.
- `if (data[j] >= 254 || ...) clip++;` counts pixels where any channel is at the maximum (overexposed). The UI warns you if more than 1% are clipped.
- `sr += S2L[data[j]]; ...` adds up the *linear* red, green and blue. `n++` counts pixels.
- `const meas = [sr / n, sg / n, sb / n];` is the average linear colour of the tile.
- `const target = labToLinear(whiteLab.L, whiteLab.a, whiteLab.b);` is Step 1 above.
- `const g = meas.map((m, k) => (m > 1e-6 ? target[k] / m : 1));` is Step 2. The `m > 1e-6` guard avoids dividing by zero on a black ROI.
- `white = {...}` stores everything for the information line in the UI.
- `if (o.normalize !== false) gains = g;` means the gains are only used if the "Normalise" checkbox is on.

**`labToXyz` and `labToLinear`** (lines 893–908), used in Step 1:
```js
// food-vision-lab.html lines 893–908
function labToXyz(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const fx3 = fx * fx * fx, fz3 = fz * fz * fz;
  const xr = fx3 > LAB_E ? fx3 : (116 * fx - 16) / LAB_K;
  const yr = L > LAB_K * LAB_E ? fy * fy * fy : L / LAB_K;
  const zr = fz3 > LAB_E ? fz3 : (116 * fz - 16) / LAB_K;
  return [xr * WHITE.X, yr * WHITE.Y, zr * WHITE.Z];
}
function labToLinear(L, a, b) {
  const [X, Y, Z] = labToXyz(L, a, b);
  return [
    M_XYZ2RGB[0] * X + M_XYZ2RGB[1] * Y + M_XYZ2RGB[2] * Z,
    M_XYZ2RGB[3] * X + M_XYZ2RGB[4] * Y + M_XYZ2RGB[5] * Z,
    M_XYZ2RGB[6] * X + M_XYZ2RGB[7] * Y + M_XYZ2RGB[8] * Z
  ];
}
```

- `fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;` undoes the three Lab equations from 1.3.
- `fx3 = fx*fx*fx` is the cube that undoes the cube root.
- `xr = fx3 > LAB_E ? fx3 : (116*fx - 16)/LAB_K;` uses the straight-line branch for very dark colours (the reverse of the toe in 1.3).
- `yr` is the same idea, but the test is written with L directly (L > 8 means the cube branch).
- `return [xr*WHITE.X, yr*WHITE.Y, zr*WHITE.Z];` turns the ratios back into absolute XYZ.
- `labToLinear` multiplies XYZ by `M_XYZ2RGB`, the exact inverse of the RGB → XYZ matrix. That inverse is computed by `inv3` at lines 866–873 using the cofactor formula you learned for 3×3 matrices.

**Colour-chart mode (the "Correction" menu).** A white tile can only fix one multiplier per channel. With a colour chart in the photo, the app can do better. You mark patches with the **Patch** tool and type their certified L\*a\*b\*. The app then:
1. fits the camera's real tone curve per channel from the grey patches (3 or more needed), replacing the sRGB curve;
2. fits a full 3×3 matrix by least squares, mapping camera colours to the certified ones;
3. reports each patch's error from a matrix fitted *without* that patch (leave-one-out), so the check is honest.

Lines 1922–1943:
```js
// food-vision-lab.html lines 1922–1943
  // Default: sRGB curve + diagonal white-tile gains. Matrix mode: tone curve from grey patches
  // (if ≥ 3 greys incl. the tile) and a least-squares 3×3 matrix fitted to every reference patch.
  let luts = [S2L, S2L, S2L], CM = [gains[0], 0, 0, 0, gains[1], 0, 0, 0, gains[2]], calib = { mode: 'white' };
  const refs = (o.patches || []).map((p) => ({ name: p.name, rect: p.rect, lab: p.lab }));
  if (whiteRect) refs.push({ name: 'White tile', rect: whiteRect, lab: whiteLab, tile: true });
  if (o.calibration === 'matrix') {
    if (refs.length < 4) calib = { mode: 'white', note: 'Matrix calibration needs at least 4 reference patches (the white tile counts); using white-tile gains.' };
    else {
      for (const r of refs) { r.code = patchMeans(data, w, h, r.rect); r.target = labToLinear(r.lab.L, r.lab.a, r.lab.b); }
      const greys = refs.filter((r) => Math.abs(r.lab.a) < 2 && Math.abs(r.lab.b) < 3).map((r) => ({ code: r.code, Y: labToXyz(r.lab.L, 0, 0)[1] }));
      if (greys.length >= 3) luts = toneLut(greys);
      const camOf = (r) => [luts[0][Math.round(r.code[0])], luts[1][Math.round(r.code[1])], luts[2][Math.round(r.code[2])]];
      CM = fitColorMatrix(refs.map(camOf), refs.map((r) => r.target));
      // Honest check: each patch predicted by a matrix fitted without it (leave-one-out).
      const loo = refs.map((r, n) => {
        const others = refs.filter((_, m) => m !== n), M = fitColorMatrix(others.map(camOf), others.map((q) => q.target));
        const lab = linearToLab(...mat3v(M, camOf(r)));
        return deltaE2000(lab[0], lab[1], lab[2], r.lab.L, r.lab.a, r.lab.b);
      });
      calib = { mode: 'matrix', matrix: CM, toneCurve: greys.length >= 3, greys: greys.length, references: refs.length, loo: refs.map((r, n) => ({ name: r.name, dE00: loo[n] })) };
    }
  }
```

- `refs` = your patches plus the white tile. Fewer than 4 means falling back to white-tile gains, with a note.
- `patchMeans` averages the 8-bit codes inside each patch (15% inset to avoid edges). `target` is the certified colour in linear RGB.
- `greys` are patches with a\* and b\* near 0. `toneLut` builds three 256-entry tables by interpolating ln(linear) against ln(code) through them.
- `fitColorMatrix` solves the normal equations (XᵀX)m = Xᵀy for each output channel. This is ordinary least squares, the same maths as fitting a straight line, but with 3 inputs.
- `loo` refits the matrix once per patch with that patch left out, and measures ΔE00 on it.

## 1.3 (c) Linear RGB → CIE XYZ → CIE L\*a\*b\*

**XYZ** is the international standard description of a colour (CIE 1931). Y is luminance (brightness). For sRGB colours under the D65 daylight standard, it is a fixed matrix times linear RGB.

**Golden pixel by hand** (balanced linear values r = 0.663552, g = 0.404993, b = 0.182786):
- X = 0.4124564·r + 0.3575761·g + 0.1804375·b = 0.273686 + 0.144816 + 0.032981 ≈ **0.451484**
- Y = 0.2126729·r + 0.7151522·g + 0.0721750·b = **0.443944**
- Z = 0.0193339·r + 0.1191920·g + 0.9503041·b = **0.234803**

**Divide by the white point** (0.95047, 1, 1.08883). This gives 0.475011, 0.443944, 0.215647.

**f(t), the "cube root with a toe":**
- if t > 216/24389 (= 0.008856): f = ∛t
- otherwise: f = (24389/27 · t + 16)/116 = (903.296·t + 16)/116

The cube root roughly copies how your eye's response to light compresses.

For golden, all three t are large, so f = (∛0.475011, ∛0.443944, ∛0.215647) = **(0.780251, 0.762856, 0.599673)**.

**L\*a\*b\*:**
- L\* = 116·f_y − 16 = 116 × 0.762856 − 16 = **72.491** (lightness: 0 black, 100 white)
- a\* = 500·(f_x − f_y) = 500 × 0.017395 = **8.698** (+ red, − green)
- b\* = 200·(f_y − f_z) = 200 × 0.163183 = **32.637** (+ yellow, − blue)

**A dark background pixel uses the toe.** Pixel (2,0) has t = (0.004553, 0.004361, 0.005503), all below 0.008856. So f_y = (903.296 × 0.004361 + 16)/116 = 0.171891, and L\* = 116 × 0.171891 − 16 = **3.939**.

Without the toe the cube root would rise infinitely steeply near black and amplify noise.

All nine pixels after white balance:

| pixel | L\* | a\* | b\* |
|---|---|---|---|
| tile | 95.000 | 0.000 | 0.000 |
| pale dough | 84.707 | 2.166 | 20.520 |
| background (2,0) | 3.939 | 0.748 | −1.778 |
| golden | 72.491 | 8.698 | 32.637 |
| crust | 46.390 | 16.460 | 29.265 |
| background (2,1) | 4.386 | 1.158 | −1.890 |
| background (0,2) | 3.870 | 0.437 | −1.888 |
| background (1,2) | 4.272 | 0.547 | −1.284 |
| background (2,2) | 3.977 | 1.015 | −2.505 |

**The code: constants and conversion,** lines 864 and 874–888:
```js
// food-vision-lab.html lines 864–864
const M_RGB2XYZ = [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.0721750, 0.0193339, 0.1191920, 0.9503041];
```
```js
// food-vision-lab.html lines 874–888
const WHITE = { X: 0.95047, Y: 1.0, Z: 1.08883 };
const LAB_E = 216 / 24389, LAB_K = 24389 / 27;
FVL.WHITE_D65 = WHITE;
FVL.M_RGB2XYZ = M_RGB2XYZ;

function labF(t) { return t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116; }
function linearToLab(r, g, b, out) {
  const X = M_RGB2XYZ[0] * r + M_RGB2XYZ[1] * g + M_RGB2XYZ[2] * b;
  const Y = M_RGB2XYZ[3] * r + M_RGB2XYZ[4] * g + M_RGB2XYZ[5] * b;
  const Z = M_RGB2XYZ[6] * r + M_RGB2XYZ[7] * g + M_RGB2XYZ[8] * b;
  const fx = labF(X / WHITE.X), fy = labF(Y / WHITE.Y), fz = labF(Z / WHITE.Z);
  out = out || [0, 0, 0];
  out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz);
  return out;
}
```

- `M_RGB2XYZ` holds the 9 matrix numbers row by row: [row X, row Y, row Z]. Each row sums to the white point, so RGB (1,1,1) gives exactly D65 white.
- `WHITE` is the D65 white point for the 2° observer. It is what "L\* = 100, a\* = b\* = 0" means.
- `LAB_E = 216/24389` (0.008856) is where the toe starts. `LAB_K = 24389/27` (903.3) is the slope of the toe.
- `labF(t)` is the cube root with the toe, exactly as above.
- `linearToLab(r, g, b, out)`:
  - The three `const X/Y/Z = ...` lines are the matrix multiplication.
  - `fx, fy, fz` apply `labF` to each ratio.
  - `out = out || [0, 0, 0];` reuses an array you pass in, instead of creating a new one per pixel. With a million pixels this avoids a lot of garbage-collection work.
  - The last line writes L\*, a\*, b\*.

**Where this runs for every pixel:** `analyzeColor` lines 1952–1958:
```js
// food-vision-lab.html lines 1951–1958
  const [l0, l1, l2] = luts;
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const r0 = l0[data[j]], g0 = l1[data[j + 1]], b0 = l2[data[j + 2]];
    const r = CM[0] * r0 + CM[1] * g0 + CM[2] * b0, g = CM[3] * r0 + CM[4] * g0 + CM[5] * b0, b = CM[6] * r0 + CM[7] * g0 + CM[8] * b0;
    linearToLab(r, g, b, lab);
    L[i] = lab[0]; A[i] = lab[1]; B[i] = lab[2];
    cal[j] = enc[r >= 1 ? 4096 : (r * 4096) | 0]; cal[j + 1] = enc[g >= 1 ? 4096 : (g * 4096) | 0]; cal[j + 2] = enc[b >= 1 ? 4096 : (b * 4096) | 0]; cal[j + 3] = 255;
  }
```

- `luts` holds one 256-entry "code → linear" table per channel. Normally all three are `S2L`; in colour-chart mode they are the camera's own tone curve (see the end of 1.2).
- `i` counts pixels and `j` counts bytes (4 per pixel), so `j += 4`.
- `r0, g0, b0` are the linearised values. `CM` is a 3×3 matrix: in white-tile mode it is diagonal (gains on the diagonal, zeros elsewhere), so `r = gain_R × r0` exactly as in the hand calculation.
- `linearToLab(r, g, b, lab)` fills the reused `lab` array, which is copied into three `Float32Array` maps `L`, `A`, `B`.
- The `cal[...] = enc[...]` line builds the white-balanced picture you see on screen. `enc` is a 4097-entry table that turns linear back into 8-bit sRGB. `r >= 1 ? 4096` caps values that the gains pushed above 1 (shown as pure white).

## 1.4 ΔE: how different are two colours?

The reference colour is the app's default "target bake colour" **(64, 9, 32)**.

**ΔE\*ab (CIE 1976):** straight-line distance in Lab space.

ΔE76 = √((L₁−L₂)² + (a₁−a₂)² + (b₁−b₂)²)

Golden: √(8.491² + (−0.302)² + 0.637²) = √(72.10 + 0.09 + 0.41) = **8.521**

**ΔE00 (CIEDE2000)** fixes the fact that Lab is not perceptually even. Eyes are less sensitive to chroma differences in strong colours, and lightness differences are judged relative to mid-grey. It is the app's default. Here is the full calculation for golden (1 = golden 72.491 / 8.698 / 32.637, 2 = reference 64 / 9 / 32). Angles are in degrees here; the code uses radians.

| step | formula | value |
|---|---|---|
| chromas | C₁ = √(a₁²+b₁²), C₂ | 33.775628, 33.241540 |
| mean chroma | C̄ = (C₁+C₂)/2 | 33.508584 |
| G | 0.5·(1 − √(C̄⁷/(C̄⁷+25⁷))) | 0.029363 |
| stretched a | a′ = (1+G)·a | 8.953023, 9.264268 |
| new chromas | C′ = √(a′²+b²) | 33.842294, 33.314061 |
| hue angles | h′ = atan2(b, a′) | 74.659707°, 73.853827° |
| differences | ΔL′ = L₂−L₁, ΔC′ = C₂′−C₁′ | −8.491309, −0.528233 |
| hue difference | Δh′ = h₂′−h₁′ | −0.805881° |
| | ΔH′ = 2√(C₁′C₂′)·sin(Δh′/2) | −0.472268 |
| means | L̄′, C̄′, h̄′ | 68.245654, 33.578178, 74.256767° |
| hue weight T | 1 − 0.17cos(h̄′−30°) + 0.24cos(2h̄′) + 0.32cos(3h̄′+6°) − 0.20cos(4h̄′−63°) | 0.580155 |
| rotation angle | Δθ = 30°·exp(−((h̄′−275)/25)²) | 0 (to 6 decimals) |
| R_C | 2√(C̄′⁷/(C̄′⁷+25⁷)) | 1.884097 |
| S_L | 1 + 0.015(L̄′−50)²/√(20+(L̄′−50)²) | 1.265816 |
| S_C, S_H | 1 + 0.045C̄′, 1 + 0.015C̄′T | 2.511018, 1.292208 |
| R_T | −sin(2Δθ)·R_C | 0 |
| scaled terms | ΔL′/S_L, ΔC′/S_C, ΔH′/S_H | −6.708167, −0.210366, −0.365473 |
| **ΔE00** | √(sum of squares + R_T·(…)) | **6.721** |

Why Δθ is 0: the rotation term only matters for blue hues near 275°. Food browns sit around 60–85°, so it switches off. ΔE00 (6.72) is smaller than ΔE76 (8.52), because ΔE00 discounts lightness differences away from L\* 50 (S_L = 1.27).

All pixels against (64, 9, 32):

| pixel | ΔE76 | ΔE00 |
|---|---|---|
| tile | 45.453 | 28.988 |
| pale dough | 24.643 | 16.765 |
| golden | 8.521 | 6.721 |
| crust | 19.319 | 17.770 |
| backgrounds | 68.9–69.7 | 52.8–53.3 |

**The code,** lines 917–920 and 922–958:
```js
// food-vision-lab.html lines 917–920
function deltaE76(L1, a1, b1, L2, a2, b2) {
  const dL = L1 - L2, da = a1 - a2, db = b1 - b2;
  return Math.sqrt(dL * dL + da * da + db * db);
}
```
```js
// food-vision-lab.html lines 922–958
const P25_7 = 6103515625; // 25^7
function deltaE2000(L1, a1, b1, L2, a2, b2) {
  const C1 = Math.sqrt(a1 * a1 + b1 * b1), C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cb = (C1 + C2) / 2, Cb7 = Math.pow(Cb, 7);
  const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + P25_7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.sqrt(a1p * a1p + b1 * b1), C2p = Math.sqrt(a2p * a2p + b2 * b2);
  let h1p = (a1p === 0 && b1 === 0) ? 0 : Math.atan2(b1, a1p); if (h1p < 0) h1p += TAU;
  let h2p = (a2p === 0 && b2 === 0) ? 0 : Math.atan2(b2, a2p); if (h2p < 0) h2p += TAU;
  const dLp = L2 - L1, dCp = C2p - C1p;
  const CC = C1p * C2p;
  let dhp = 0;
  if (CC !== 0) {
    dhp = h2p - h1p;
    if (dhp > Math.PI) dhp -= TAU; else if (dhp < -Math.PI) dhp += TAU;
  }
  const dHp = 2 * Math.sqrt(CC) * Math.sin(dhp / 2);
  const Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hbp;
  if (CC === 0) hbp = h1p + h2p;
  else if (Math.abs(h1p - h2p) <= Math.PI) hbp = (h1p + h2p) / 2;
  else if (h1p + h2p < TAU) hbp = (h1p + h2p + TAU) / 2;
  else hbp = (h1p + h2p - TAU) / 2;
  const T = 1 - 0.17 * Math.cos(hbp - Math.PI / 6) + 0.24 * Math.cos(2 * hbp)
    + 0.32 * Math.cos(3 * hbp + Math.PI / 30) - 0.20 * Math.cos(4 * hbp - 63 * Math.PI / 180);
  const hd = hbp * DEG;
  const dTheta = (Math.PI / 6) * Math.exp(-Math.pow((hd - 275) / 25, 2));
  const Cbp7 = Math.pow(Cbp, 7);
  const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + P25_7));
  const Lm = (Lbp - 50) * (Lbp - 50);
  const SL = 1 + 0.015 * Lm / Math.sqrt(20 + Lm);
  const SC = 1 + 0.045 * Cbp;
  const SH = 1 + 0.015 * Cbp * T;
  const RT = -Math.sin(2 * dTheta) * RC;
  const tL = dLp / SL, tC = dCp / SC, tH = dHp / SH;
  return Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH);
}
```

Line by line for `deltaE2000`:
- `P25_7 = 6103515625` is 25⁷, typed out so it isn't recomputed.
- Line 909: C₁, C₂. Line 910: C̄ and C̄⁷. Line 911: G.
- Line 912: a′. Line 913: C′.
- Lines 914–915: hue angles h′ in radians, shifted into 0…2π (`TAU` = 2π). If a′ and b are both 0 the hue is undefined, and the standard says use 0.
- Line 916: ΔL′ and ΔC′. Line 917: `CC = C₁′·C₂′`. If one colour is grey (CC = 0), the hue difference is defined as 0.
- Lines 918–922: Δh′, wrapped into −π…π, so 350° vs 10° counts as 20°, not 340°.
- Line 923: ΔH′. Line 924: L̄′ and C̄′.
- Lines 925–929: the mean hue h̄′, with the same wrap-around care (four cases from the standard).
- Lines 930–931: T. Lines 932–933: Δθ (`hd` is h̄′ in degrees). Lines 934–935: R_C.
- Lines 936–939: S_L, S_C, S_H. Line 940: R_T.
- Lines 941–942: divide each difference by its weight, then square, add and take the root.

**How you know it is right:** the Validation tab runs all 34 published test pairs from Sharma, Wu & Dalal (2005). The worst error is 0.00005, which is the rounding of the published table.

## 1.5 Browning index (and C\*, h°, WI)

**BI (Buera 1985 / Palou 1999):**
- x = (a\* + 1.75·L\*) / (5.645·L\* + a\* − 3.012·b\*)
- BI = 100·(x − 0.31)/0.17

**Crust by hand** (46.390, 16.460, 29.265):
- denominator = 5.645×46.390 + 16.460 − 3.012×29.265 = 261.872 + 16.460 − 88.147 = **190.186**
- numerator = 16.460 + 1.75×46.390 = 97.643
- x = 97.643 / 190.186 = **0.513408**
- BI = 100 × (0.513408 − 0.31) / 0.17 = **119.65**

Golden gives BI = 67.14, pale dough 29.04 and the neutral tile 0.005: more browning, bigger number. The backgrounds give *negative* BI (−17 to −31). BI means nothing for dark, bluish pixels, which is why statistics only use the sample mask (see the audit, A7).

Other indices for golden:
- chroma C\* = √(a²+b²) = **33.78** (how vivid)
- hue h° = atan2(b, a) = **75.08°** (0° red, 90° yellow)
- whiteness WI = 100 − √((100−L)² + a² + b²) = **56.44**

**The code,** lines 960–969:
```js
// food-vision-lab.html lines 960–969
function browningIndex(L, a, b) {
  const den = 5.645 * L + a - 3.012 * b;
  if (L <= 0.5 || Math.abs(den) < 1e-6) return NaN;
  const x = (a + 1.75 * L) / den;
  return 100 * (x - 0.31) / 0.17;
}
// Whiteness index (Judd & Wyszecki form used in food science)
const whitenessIndex = (L, a, b) => 100 - Math.sqrt((100 - L) * (100 - L) + a * a + b * b);
const chroma = (a, b) => Math.sqrt(a * a + b * b);
function hueAngle(a, b) { let h = Math.atan2(b, a) * DEG; if (h < 0) h += 360; return h; }
```

- `den` is the denominator.
- `if (L <= 0.5 || Math.abs(den) < 1e-6) return NaN;` returns "not a number" for near-black pixels or a zero denominator, instead of a huge meaningless value. NaN pixels are skipped by the statistics (`describe` checks `Number.isFinite`).
- `hueAngle` converts radians to degrees (`DEG` = 180/π) and adds 360 to negative angles.

## 1.6 (d) Grey, Gaussian blur, Otsu, binary mask

The particle pipeline (`analyzeParticles`, line 2083) starts again from the **raw** photo. It does not white-balance, because only brightness matters for finding objects. Read the same 9 pixels as a micrograph: some bright objects on a dark background.

### Grey (luma)
grey = 0.2126·R + 0.7152·G + 0.0722·B, applied to the raw 0–255 values (not linear).

Tile: 0.2126×242 + 0.7152×226 + 0.0722×182 = 51.449 + 161.635 + 13.140 = **226.2248**

| | x=0 | x=1 | x=2 |
|---|---|---|---|
| y=0 | 226.2248 | 198.8884 | 12.2808 |
| y=1 | 166.2820 | 100.8652 | 13.4934 |
| y=2 | 12.0682 | 13.2086 | 12.3530 |

```js
// food-vision-lab.html lines 1011–1016
function grayscale(img) {
  const { width: w, height: h, data } = img;
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; i < out.length; i++, j += 4) out[i] = 0.2126 * data[j] + 0.7152 * data[j + 1] + 0.0722 * data[j + 2];
  return out;
}
```
- `const { width: w, height: h, data } = img;` unpacks the three fields of the image object.
- `out = new Float32Array(w * h)` holds one decimal number per pixel.
- The loop moves `i` by 1 (pixel) and `j` by 4 (bytes) together, and ignores alpha.

The weights add up to 1 and favour green, because eyes are most sensitive to green.

### Gaussian blur, σ = 0.5 px
Blur removes pixel noise before thresholding. A Gaussian weights neighbours by e^(−i²/(2σ²)), where i is the distance in pixels.

**The kernel by hand.** The code uses radius r = ceil(4σ) = 2, so offsets −2…2:
- raw weights e^(−i²/0.5): 0.000335, 0.135335, 1, 0.135335, 0.000335
- sum = 1.271341
- divided by the sum: **0.000264, 0.106451, 0.786571, 0.106451, 0.000264**

They now add up to exactly 1, so blurring never changes the average brightness. The app's default σ for emulsions is 1.0, which gives 9 weights; the code is identical.

**Separable:** a 2-D Gaussian equals a horizontal 1-D blur followed by a vertical one. That is 5 + 5 multiplications per pixel instead of 25.

**Edges:** a neighbour outside the image is replaced by the edge pixel ("clamp"). Effectively, the outside weights fold onto the edge pixel. At x = 0 the weights become 0.893285 (itself), 0.106451 (x=1), 0.000264 (x=2).

**Centre pixel (1,1) by hand.**

Horizontal pass on row 1 (166.2820, 100.8652, 13.4934):

0.106715×166.2820 + 0.786571×100.8652 + 0.106715×13.4934 = 17.745 + 79.338 + 1.440 ≈ **98.522** (the code, with unrounded weights: 98.5223)

(0.106715 = 0.106451 + 0.000264, because the offset −2 tap clamps onto x = 0, and +2 clamps onto x = 2.)

Vertical pass on the column of horizontal results (181.8918, 98.5223, 12.9956):

0.106715×181.8918 + 0.786571×98.5223 + 0.106715×12.9956 = **98.292**

Results from the code:

| after horizontal pass | x=0 | x=1 | x=2 |
|---|---|---|---|
| y=0 | 223.2584 | 181.8918 | 32.2018 |
| y=1 | 159.2780 | 98.5223 | 22.8345 |
| y=2 | 12.1897 | 12.9956 | 12.4440 |

| **after both passes (blur)** | x=0 | x=1 | x=2 |
|---|---|---|---|
| y=0 | 216.3919 | 172.9725 | 31.1994 |
| y=1 | 150.4092 | 98.2921 | 22.7253 |
| y=2 | 27.9030 | 22.1445 | 13.5553 |

```js
// food-vision-lab.html lines 1018–1047
function gaussianKernel(sigma) {
  const r = Math.max(1, Math.ceil(4 * sigma)); // ±4σ keeps truncation error < 0.01% of the variance
  const k = new Float64Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return k;
}
// Separable Gaussian with replicate (clamp-to-edge) borders.
function gaussianBlur(src, w, h, sigma) {
  if (!(sigma > 0)) return Float32Array.from(src);
  const k = gaussianKernel(sigma), r = (k.length - 1) >> 1;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) { let xx = x + i; xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx; s += k[i + r] * src[row + xx]; }
      tmp[row + x] = s;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let i = -r; i <= r; i++) { let yy = y + i; yy = yy < 0 ? 0 : yy >= h ? h - 1 : yy; s += k[i + r] * tmp[yy * w + x]; }
      out[y * w + x] = s;
    }
  }
  return out;
}
```
- `gaussianKernel`:
  - `r = Math.max(1, Math.ceil(4 * sigma))`. ±4σ keeps 99.99% of the bell curve. (The first version used 3σ, and the self-test caught that the blur's variance was 1.2% too small.)
  - The loop fills `k[i + r]`, because array positions can't be negative, so offset −2 is stored at position 0.
  - The second loop divides by the sum `s`.
- `gaussianBlur`:
  - `if (!(sigma > 0)) return Float32Array.from(src);` means σ = 0 is "no blur, just a copy". `!(x > 0)` is also true when sigma is NaN.
  - `r = (k.length - 1) >> 1` is the radius. `>> 1` is integer division by 2.
  - `tmp` holds the horizontal results and `out` the final ones.
  - In the first double loop, `xx = xx < 0 ? 0 : xx >= w ? w - 1 : xx;` is the clamp, and `s += k[i + r] * src[row + xx]` is the weighted sum.
  - The second double loop is the same thing, vertically, reading `tmp`.

### Otsu's threshold
We want one grey level t that splits pixels into "background" (≤ t) and "object" (> t). Otsu's rule is to choose the t that makes the two groups' averages as far apart as possible, weighted by group size:

σ_B²(t) = ω₀·ω₁·(μ₀ − μ₁)²

where ω₀ and ω₁ are the fractions of pixels in each group and μ₀ and μ₁ are their average grey levels.

The code first rounds blurred values to whole numbers (a 256-bin histogram). Ours become 14, 22, 23, 28, 31, 98, 150, 173, 216.

The total mean is 83.889 and the total variance σ_T² is 5367.43. Every split:

| t from…to | background pixels | ω₀ | ω₁ | μ₀ | μ₁ | σ_B² |
|---|---|---|---|---|---|---|
| 14–21 | 14 | 1/9 | 8/9 | 14.00 | 92.63 | 610.56 |
| 22 | +22 | 2/9 | 7/9 | 18.00 | 102.71 | 1240.38 |
| 23–27 | +23 | 3/9 | 6/9 | 19.67 | 116.00 | 2062.25 |
| 28–30 | +28 | 4/9 | 5/9 | 21.75 | 133.60 | 3088.99 |
| 31–97 | +31 (all 5 backgrounds) | 5/9 | 4/9 | 23.60 | 159.25 | 4543.44 |
| **98–149** | **+98 (crust too)** | 6/9 | 3/9 | 36.00 | 179.67 | **4586.69 ← best** |
| 150–172 | +150 | 7/9 | 2/9 | 52.29 | 194.50 | 3495.66 |
| 173–215 | +173 | 8/9 | 1/9 | 67.38 | 216.00 | 2181.67 |

Check the best row: (6/9)(3/9)(179.667 − 36)² = 0.2222 × 20640.1 = 4586.7.

Two lessons:
1. **Otsu is not "common sense".** It put the crust (98) with the background, because that split scores slightly higher (4586.7 vs 4543.4). With 9 pixels one value swings the result; with real images of 500,000 pixels it is far more stable.
2. **Flat optimum.** Every t from 98 to 149 gives the same split, so the code returns the middle: (98 + 149)/2 = **123.5**.

The quality score is η = σ_B² ÷ σ_T² = 4586.69 / 5367.43 = **0.8545**, shown in the app as "separability η". Near 1 means two clean groups; below about 0.7 the threshold is unreliable.

```js
// food-vision-lab.html lines 1050–1081
function histogram256(v, mask) {
  const hist = new Float64Array(256);
  for (let i = 0; i < v.length; i++) {
    if (mask && !mask[i]) continue;
    const b = v[i] < 0 ? 0 : v[i] > 255 ? 255 : Math.round(v[i]);
    hist[b]++;
  }
  return hist;
}
// Otsu (1979): maximise between-class variance. Class 0 = bins <= t.
function otsuFromHist(hist) {
  const n = hist.length;
  let total = 0, sumAll = 0;
  for (let i = 0; i < n; i++) { total += hist[i]; sumAll += i * hist[i]; }
  if (total === 0) return { t: 0, eta: 0, sigmaB: 0 };
  const mean = sumAll / total;
  let varT = 0;
  for (let i = 0; i < n; i++) varT += hist[i] * (i - mean) * (i - mean);
  varT /= total;
  let w0 = 0, sum0 = 0, best = -1, tBest = 0, tEnd = 0;
  for (let t = 0; t < n - 1; t++) {
    w0 += hist[t]; sum0 += t * hist[t];
    const w1 = total - w0;
    if (w0 === 0 || w1 === 0) continue;
    const m0 = sum0 / w0, m1 = (sumAll - sum0) / w1;
    const sb = (w0 / total) * (w1 / total) * (m0 - m1) * (m0 - m1);
    if (sb > best + 1e-12) { best = sb; tBest = t; tEnd = t; }
    else if (Math.abs(sb - best) <= 1e-12) tEnd = t; // flat optimum: take its centre
  }
  const t = (tBest + tEnd) / 2;
  return { t, eta: varT > 0 ? best / varT : 0, sigmaB: best };
}
```
- `histogram256`:
  - `const b = v[i] < 0 ? 0 : v[i] > 255 ? 255 : Math.round(v[i]);` clips to 0…255 and rounds to the nearest bin.
  - `if (mask && !mask[i]) continue;` lets you ignore pixels outside a mask.
- `otsuFromHist`:
  - The first loop gives `total` (pixel count) and `sumAll` (Σ grey × count).
  - The second loop gives the total variance `varT`, used only for η.
  - The main loop tries t = 0…254. `w0` and `sum0` grow as bins move into the background group, so each t costs one step instead of re-summing everything.
  - `if (w0 === 0 || w1 === 0) continue;` skips splits that leave a group empty.
  - `sb` is σ_B² written with fractions `w0/total`.
  - `if (sb > best + 1e-12)` is a new record: remember t as both start (`tBest`) and end (`tEnd`) of the best range.
  - `else if (Math.abs(sb - best) <= 1e-12) tEnd = t;` handles a tie (same split): extend the range. The 1e-12 tolerance absorbs rounding noise.
  - `const t = (tBest + tEnd) / 2;` takes the middle of the flat best range.

**Making the mask** (`analyzeParticles`, lines 1977–1982):
```js
// food-vision-lab.html lines 2089–2095
  const ot = otsu(blur);
  const thr = o.thresholdMode === 'manual' && Number.isFinite(+o.threshold) ? +o.threshold : ot.t;
  // Compare rounded values: Otsu put grey g in class 0 when Math.round(g) <= t.
  let above = 0; for (let i = 0; i < N; i++) if (Math.round(blur[i]) > thr) above++;
  const bright = o.polarity === 'bright' ? true : o.polarity === 'dark' ? false : above / N <= 0.5;
  const binary = new Uint8Array(N);
  for (let i = 0; i < N; i++) binary[i] = (Math.round(blur[i]) > thr) === bright ? 1 : 0;
```

- `thr` is the Otsu value, unless you chose "Manual".
- `Math.round(blur[i]) > thr`: Otsu sorted pixels by their *rounded* value, so the mask compares rounded values too. (Comparing the raw value used to put a value such as 104.3 on the wrong side of t = 104.)
- `above` counts pixels brighter than the threshold: 3 of 9 here.
- `bright` handles "Objects are: Minority phase". Objects are whichever side is smaller: 3/9 = 33% ≤ 50%, so objects are bright.
- `binary[i] = (... > thr) === bright ? 1 : 0` marks object pixels: bright pixels when objects are bright, dark ones otherwise. Our mask: tile, pale dough, golden = 1; everything else 0.

```
1 1 0
1 0 0
0 0 0
```

### Euclidean distance transform (EDT)
For every object pixel: the straight-line distance to the nearest background pixel.

By hand:
- (1,0) touches background at (2,0), so d = 1
- (0,1) touches (1,1), so d = 1
- (0,0): no background at distance 1, but (1,1) is diagonal, so **d = √2 = 1.414**

The squared result is d² = [2,1,0; 1,0,0; 0,0,0].

**Important detail:** pixels outside the image are *not* background. The corner pixel (0,0) is not given distance 1 just because it sits on the edge. Objects cut by the edge therefore keep large distances there.

**How the code does it fast (Felzenszwalb & Huttenlocher):** squared distance splits into "column part + row part", d² = dx² + dy². So:
1. **Columns:** for each pixel, f = 0 if background, otherwise "infinity" (1e20). Then find the nearest background pixel in the same column.
2. **Rows:** run the same 1-D routine on each row of those column results.

The 1-D routine computes d[q] = min over p of ((q − p)² + f[p]). Each p contributes a parabola sitting at height f[p]; the answer is the *lower envelope* of all the parabolas. It keeps a list `v` of parabolas that are visible and `z` of where each one takes over.

**Trace for row y = 0, f = [2nd pass input] = [4, 1, 0]:**
1. Start: `v=[0]`, `z=[−∞, +∞]`.
2. q = 1: `s = ((1+1) − (4+0)) / (2·1 − 0) = −1`. Is −1 ≤ z[0] = −∞? No, so add it: `v=[0,1]`, `z=[−∞,−1,+∞]`.
3. q = 2: `s = ((0+4) − (1+1)) / (4 − 2) = 1`. Is 1 ≤ z[1] = −1? No, so add it: `v=[0,1,2]`, `z=[−∞,−1,1,+∞]`.
4. Read out:
   - q = 0: −1 < 0, so parabola 1 rules: d = (0−1)² + 1 = **2**
   - q = 1: still parabola 1 (1 < 1 is false): d = 0 + 1 = **1**
   - q = 2: 1 < 2, so parabola 2: d = 0 + 0 = **0**

**Column x = 0, f = [1e20, 1e20, 0] (the "infinity" trick):**
- At q = 1: `s = ((1e20+1) − (1e20+0))/2`. In floating point 1e20 + 1 = 1e20, so s = 0.
- At q = 2: `s = (4 − (1e20+1))/2 ≈ −5e19 ≤ z[1] = 0`, so parabola 1 is hidden and removed (k−−).
- Retry against parabola 0: s ≈ −2.5e19 > −∞, so add it.
- Result: d = [4, 1, 0]: the top pixel is 2 rows from the background (2² = 4).

```js
// food-vision-lab.html lines 1084–1124
/* Exact squared Euclidean distance transform (Felzenszwalb & Huttenlocher 2012).
   For every pixel with mask=1 returns squared distance to the nearest mask=0 pixel
   (0 for background). Pixels outside the image are ignored. */
const EDT_INF = 1e20;
function edt1d(f, n, d, v, z) {
  let k = 0;
  v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}
function sqEDT(mask, w, h) {
  const n = Math.max(w, h);
  const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
  const out = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = mask[y * w + x] ? EDT_INF : 0;
    edt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) out[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) f[x] = out[row + x];
    edt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) out[row + x] = d[x];
  }
  return out;
}
function distanceTransform(mask, w, h) {
  const d2 = sqEDT(mask, w, h), out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d2[i] >= EDT_INF * 0.5 ? Math.sqrt(w * w + h * h) : Math.sqrt(d2[i]);
  return out;
}
```
- `edt1d(f, n, d, v, z)`: `f` is input, `d` output, and `v`, `z` are scratch arrays passed in so they are reused for every row and column.
  - The first loop builds the envelope. The `while (s <= z[k]) { k--; ... }` loop pops parabolas that the new one completely hides.
  - The second loop walks along q and moves to the next parabola once q passes its takeover point.
- `sqEDT`:
  - `n = Math.max(w, h)` sizes the scratch arrays for the longer side.
  - Column pass: `f[y] = mask ? EDT_INF : 0`.
  - Row pass: `f[x] = out[row + x]`, the column results.
- `distanceTransform` takes square roots. A value ≥ 0.5e20 means "no background anywhere", which is replaced by the image diagonal.

**Bonus: erosion uses the same distances.** "Erode by a disk of radius r" keeps a pixel only if d² > r². With r = 1 only (0,0) survives (d² = 2 > 1). `erode` is lines 1128–1133, `dilate` does the opposite on the inverted mask, and opening = erode then dilate. The self-tests compare these against slow brute-force versions pixel for pixel.

## 1.7 (d) Watershed: separating two touching droplets

Two droplets cannot fit in 9 pixels, so we use an 11×5 mask with two 3×3 blobs joined by a 3-pixel neck (`#` = object):

```
x: 0 1 2 3 4 5 6 7 8 9 10
   . . . . . . . . . . .      y=0
   . # # # . . . # # # .      y=1
   . # # # # # # # # # .      y=2
   . # # # . . . # # # .      y=3
   . . . . . . . . . . .      y=4
```

Plain connected-component labelling says this is **1** object. Watershed should say **2**.

**Step 1: distances (code output).**

```
D:  .  1     1     1     .  .  .  1     1     1  .
    .  1     2     1.414 1  1  1  1.414 2     1  .
    .  1     1     1     .  .  .  1     1     1  .
```

- Centres (2,2) and (8,2): the nearest background is 2 away, e.g. (0,2), so D = 2.
- (3,2): no background at distance 1, but (4,1) is diagonal, so D = √2.
- Neck: D = 1.

So D looks like two hills (height 2) joined by a low pass (height 1). The **dip** between them is 2 − 1 = 1.

**Step 2: markers, one seed per droplet (h-maxima, h = 0.5 by default).** The idea is to keep only hilltops that stand at least h above the pass to any higher hill.

1. Lower every value by h: marker = D − 0.5.
2. "Reconstruct": let marker values flow outward to neighbours, but never above D. The result R:

```
R:  1 1 1     . . .     1 1 1
    1 1.5 1.414 1 1 1 1.414 1.5 1
    1 1 1     . . .     1 1 1
```

At the centres R = 1.5 (their own value minus h). Nothing higher can flow in, because any flow from the other hill must cross the neck, where R is capped at 1.

3. A pixel is a marker if D − R ≥ h. That is true only at the two centres (2 − 1.5 = 0.5). So there are **2 markers**: (2,2) gets label 1 and (8,2) gets label 2.

**Step 3: flooding.** Picture water rising from the markers. The highest D (deepest, if you flip D upside down) is flooded first. The code uses a priority queue ("heap") ordered by −D, and by arrival order ("age") when two values are equal. When a pixel comes out of the queue, every unlabelled object neighbour gets its label and joins the queue. The real order from the code:

| # | taken out | label | what happens |
|---|---|---|---|
| 0–1 | seeds (2,2), (8,2) | 1, 2 | pushed with priority −2 |
| 2 | (2,2) | 1 | labels its 8 neighbours 1; (3,2) gets priority −1.414, the rest −1 |
| 3 | (8,2) | 2 | same for droplet 2 |
| 4 | (3,2) | 1 | −1.414 beats −1, so it comes out next and labels neck pixel (4,2) as 1 |
| 5 | (7,2) | 2 | labels neck pixel (6,2) as 2 |
| 6–19 | the remaining D = 1 pixels | | in age order; nothing new |
| 20 | (4,2) | 1 | labels (5,2) as **1** |
| 21–22 | (6,2), (5,2) | | nothing new |

Final labels:

```
. 1 1 1 . . . 2 2 2 .
. 1 1 1 1 1 2 2 2 2 .
. 1 1 1 . . . 2 2 2 .
```

The middle neck pixel (5,2) went to droplet 1 only because droplet 1's neck pixel was queued first (age 18 vs 19). So ties favour markers found earlier in reading order. The effect is at most a pixel or so per contact.

**What if h = 1.5?** Then h is bigger than the dip (1). Lowering by 1.5 and reconstructing gives R = 0.5 on *every* pixel of both blobs: one flat plateau. So there is **one** marker and one object. h is "how deep a dip must be before two hills count as two objects". (The first version of the app used a shortcut that always split equal-height hills; see audit B4, now fixed.)

**Code: `hMaximaMarkers` and `watershed`,** lines 1352–1385:
```js
// food-vision-lab.html lines 1367–1424
/* Regional maxima of `img` inside `dom`: 8-connected plateaus of equal value
   (within eps) with no higher neighbour. Returns { markers: Int32Array labels, count }. */
function regionalMaxima(img, dom, w, h, eps = 1e-5) {
  const N = w * h, lab = new Int32Array(N), q = new Int32Array(N);
  let count = 0;
  for (let s = 0; s < N; s++) {
    if (!dom[s] || lab[s] !== 0) continue;
    const v = img[s];
    let head = 0, tail = 0, isMax = true;
    q[tail++] = s; lab[s] = -1;                    // -1: in the plateau being flooded
    while (head < tail) {
      const i = q[head++], x = i % w, y = (i / w) | 0;
      for (let k = 0; k < 8; k++) {
        const xx = x + N8[k][0], yy = y + N8[k][1];
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!dom[j]) continue;
        if (img[j] > v + eps) isMax = false;
        else if (Math.abs(img[j] - v) <= eps && lab[j] === 0) { lab[j] = -1; q[tail++] = j; }
      }
    }
    const id = isMax ? ++count : -2;                // -2: visited, not a maximum
    for (let t = 0; t < tail; t++) lab[q[t]] = id;
  }
  for (let i = 0; i < N; i++) if (lab[i] < 0) lab[i] = 0;
  return { markers: lab, count };
}
/* h-maxima markers of the distance map (textbook definition): the regional maxima of
   R = reconstruction of (D − h) under D. A hill whose dip to an equal or higher hill is
   less than h joins that hill's plateau of R and so shares its marker. */
function hMaximaMarkers(dist, fg, w, h, hval) {
  const marker = new Float32Array(dist.length);
  for (let i = 0; i < marker.length; i++) marker[i] = dist[i] - hval;
  const R = reconstructByDilation(marker, dist, fg, w, h);
  return regionalMaxima(R, fg, w, h, 1e-5 * Math.max(1, hval));
}
/* Marker-controlled watershed (Meyer's priority flooding) of `relief`
   (lower floods first) restricted to `domain`. No watershed lines. */
function watershed(relief, markers, domain, w, h) {
  const labels = Int32Array.from(markers);
  const heap = new Heap(1 << 16);
  let age = 0;
  for (let i = 0; i < labels.length; i++) if (labels[i] && domain[i]) heap.push(relief[i], age++, i, labels[i]);
  while (heap.n > 0) {
    heap.pop();
    const i = heap.outIdx, lab = heap.outLab;
    const x = i % w, y = (i / w) | 0;
    for (let k = 0; k < 8; k++) {
      const xx = x + N8[k][0], yy = y + N8[k][1];
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (!domain[j] || labels[j]) continue;
      labels[j] = lab;
      heap.push(relief[j], age++, j, lab);
    }
  }
  return labels;
}
```

- `regionalMaxima`: finds plateaus that no neighbour rises above.
  - For each unvisited pixel `s`, it floods (with the queue `q`) every connected pixel with the same value (within `eps`), marking them −1.
  - While flooding, any neighbour with a *higher* value sets `isMax = false`.
  - If the plateau stays a maximum it gets the next number, otherwise −2 ("seen, not a maximum"). At the end, negative marks become 0.
- `hMaximaMarkers`:
  - `marker[i] = dist[i] - hval` lowers everything by h.
  - `reconstructByDilation(marker, dist, fg, w, h)` is the flowing step (lines 1317–1366). It does a forward raster pass, a backward pass, then a queue for the leftovers (Vincent's 1993 algorithm). The self-test checks it against the slow method "repeat until nothing changes", with exact equality.
  - `regionalMaxima(R, ...)` turns every plateau of R that is a maximum into one numbered marker. The tolerance `1e-5 × max(1, h)` is needed because `R` is a `Float32Array` (about 7 digits).
- `watershed`:
  - `labels = Int32Array.from(markers)` starts with the seeds.
  - `new Heap(1 << 16)` creates a priority queue with room for 65,536 entries; it doubles if needed.
  - The first loop pushes every seed pixel with priority `relief[i]` (= −D) and an increasing `age`.
  - `while (heap.n > 0)` runs until the queue is empty.
  - `heap.pop()` puts the smallest (priority, age) in `outIdx` / `outLab`.
  - The `for (let k = 0; k < 8; k++)` loop visits the 8 neighbours (`N8` is a list of 8 [dx, dy] pairs, line 1314).
  - `if (!domain[j] || labels[j]) continue;` skips background and already-labelled pixels.
  - `labels[j] = lab; heap.push(relief[j], age++, j, lab);` labels the pixel immediately and queues it. Because the label is given at push time, each pixel enters the queue exactly once.
- `Heap` (lines 1258–1298): a binary min-heap stored in 4 typed arrays: priority `p`, age `a`, pixel index `i`, label `l`. `less` compares priority first and age second. `push` bubbles up and `pop` sinks down. This is the standard textbook heap, using arrays instead of objects for speed.

## 1.8 Measuring the two droplets

| | droplet 1 | droplet 2 |
|---|---|---|
| area A (pixels) | 11 | 10 |
| ECD = 2√(A/π) | 2√(11/π) = **3.7424** | 2√(10/π) = **3.5682** |
| perimeter P | 12.9475 | 11.0514 |
| circularity 4πA/P² | 0.8246 | 1.0000 (capped) |

**Perimeter (droplet 1).** Slide a 2×2 window over the pixel centres and count how many of the 4 corners are inside the object:
- 1 or 3 inside: add √2/2
- 2 side by side: add 1
- 2 diagonal: add √2

Droplet 1 has 6 + 2 windows of the first kind and 8 of the second: 8 × 0.7071 + 8 × 1 = 13.6569.

This "marching squares" length is always about 5.5% too long on average, because it follows a staircase. The factor π/(8(√2−1)) = 0.948059 removes that: 13.6569 × 0.948059 = **12.9475**.

Droplet 2's circularity came out above 1 and was capped. Objects this small are below the size where shape numbers mean much (audit B9).

**Sauter mean diameter** d32 = Σd³ / Σd²:
- (3.7424³ + 3.5682³) / (3.7424² + 3.5682²) = (52.414 + 45.431) / (14.006 + 12.732) = **3.6595**

d32 is the diameter of a sphere with the same volume-to-surface ratio as the whole population, which is what matters for emulsion stability and frying oil uptake.

```js
// food-vision-lab.html lines 1574–1584
  for (let l = 1; l <= count; l++) {
    const A = area[l]; if (!A) continue;
    const x0 = minx[l], x1 = maxx[l], y0 = miny[l], y1 = maxy[l];
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === l;
    let pms = 0;
    for (let y = y0 - 1; y <= y1; y++) for (let x = x0 - 1; x <= x1; x++) {
      const a = inside(x, y), b = inside(x + 1, y), c = inside(x, y + 1), d = inside(x + 1, y + 1);
      const n = a + b + c + d;
      if (n === 1 || n === 3) pms += Math.SQRT1_2;
      else if (n === 2) pms += a === d ? Math.SQRT2 : 1;
    }
```
```js
// food-vision-lab.html lines 1607–1612
    const P = pms * PERIM_K;
    out.push({
      id: l, area: A, perimeter: P,
      ecd: 2 * Math.sqrt(A / Math.PI),
      feretMax: fer.max, feretMin: fer.min, feretAngle: fer.angleMax,
      circularity: Math.min(1, 4 * Math.PI * A / (P * P)),
```
- `inside(x, y)` is true when (x, y) is in the image and belongs to object `l`.
- The window loop starts at `x0 - 1` / `y0 - 1` so windows that just touch the object's edge are counted.
- `const n = a + b + c + d;` adds true/false values, which JavaScript treats as 1/0.
- `a === d` with n = 2 means the two inside corners are diagonal (a,d) or the other diagonal (b,c).
- `PERIM_K` (line 1498) is the 0.948059 correction. `Math.min(1, ...)` caps circularity at 1.

In `sizeStats` (line 1748): `d32: S3 / S2` where `S3 = Σd³`, `S2 = Σd²`. When edge-cut objects are excluded, each sum is weighted by the object's edge weight (audit B6).

**Careful with names:** lowercase `d10` in that object is the *mean diameter* (D[1,0]). Uppercase `D10` is the *10th percentile*. They are different things.

---

# PART 2: How the app moves pixels around

## 2.1 ImageData and `Uint8ClampedArray`

A canvas gives you pixels with `ctx.getImageData(x, y, w, h)`. That returns an **ImageData** with three fields:
- `width`
- `height`
- `data`: one long `Uint8ClampedArray` of length w × h × 4: R, G, B, A, R, G, B, A, …, row after row

For a 3×2 image, pixel (2,1) is pixel number 1×3 + 2 = 5, so its bytes are `data[20]`, `data[21]`, `data[22]`, `data[23]`.

**"Clamped"** means that writing a value outside 0–255 stores the nearest limit, and decimals are rounded to the nearest whole number, with exact halves going to the even neighbour:

```js
new Uint8ClampedArray([300, -5, 1.5, 2.5, 0.5, 254.5])   // → [255, 0, 2, 2, 0, 254]
```

That is why the app can write colour-map results straight into it without checking ranges.

**Memory:** 4 bytes per pixel, so a 1600×1200 photo is 7.7 MB. The analysis adds float arrays:
- Colorimeter: 8 maps × 4 bytes = 32 bytes per pixel (61 MB at 1600×1200)
- Particle pipeline: about 20 bytes per pixel

**The typed arrays the code uses:**

| type | bytes | used for |
|---|---|---|
| `Uint8ClampedArray` | 1 | RGBA pixels |
| `Uint8Array` | 1 | masks (0/1) |
| `Int32Array` | 4 | labels (object numbers) |
| `Float32Array` | 4 | maps (L\*, ΔE, distance, blur) |
| `Float64Array` | 8 | where precision matters (histograms, squared distances) |

Typed arrays are fixed-length blocks of raw memory. They are much faster than normal JS arrays and can be **transferred** between threads (2.4).

## 2.2 Threads: why there is a worker

JavaScript in a page runs on one **main thread**, which also draws the page and handles clicks. If a 1-second watershed ran there, the page would freeze for a second.

A **WebWorker** is a second thread with no access to the page. It can only compute and exchange messages. The app does all the maths in a worker, so sliders and hovering stay smooth.

**How the worker is created without a separate file** (Engine, lines 3177–3191):
```js
// food-vision-lab.html lines 3177–3191
  init() {
    try {
      const src = $('#fvl-core').textContent + '\n;\n' + $('#fvl-worker').textContent;
      const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
      const w = new Worker(url);
      w.onmessage = (e) => this.onMessage(e.data);
      w.onerror = (e) => { if (e && e.preventDefault) e.preventDefault(); this.fallback((e && e.message) || 'the worker script failed to load'); };
      this.worker = w;
      const id = ++this.seq;
      this.pending.set(id, { op: 'ping', resolve: () => { if (this.mode === 'starting') { this.mode = 'worker'; this.paint(); } }, reject: () => {} });
      w.postMessage({ id, op: 'ping', args: {} });
      setTimeout(() => { if (this.mode === 'starting') this.fallback('the worker did not respond'); }, 6000);
    } catch (err) { this.fallback((err && err.message) || 'workers are unavailable'); }
    this.paint();
  },
```

- `$('#fvl-core').textContent + ... + $('#fvl-worker').textContent` takes the *text* of the core-library script and the worker script and glues them together. The worker script has `type="text/plain"`, so the browser does not run it in the page.
- `new Blob([src], { type: 'text/javascript' })` wraps the text as a file in memory.
- `URL.createObjectURL(...)` gives that file a temporary `blob:` address.
- `new Worker(url)` starts a thread running that code. The core library then defines `self.FVL` inside the worker.
- `w.onmessage` and `w.onerror` decide what happens when the worker replies or crashes. On a crash, `fallback` switches to main-thread mode.
- **ping:** a first message `{op: 'ping'}`. When the answer arrives, `mode` becomes `'worker'` and the green dot appears. If there is no answer within 6 s, the app falls back.

**The whole worker** (lines 3125–3136):
```js
// food-vision-lab.html lines 3125–3136
<script id="fvl-worker" type="text/plain">
/* WebWorker entry: the core library above is prepended to this script in a Blob URL. */
self.onmessage = function (e) {
  const { id, op, args } = e.data;
  try {
    const result = self.FVL.dispatch(op, args, function (i, n, r) { self.postMessage({ id, progress: { i, n, r } }); });
    self.postMessage({ id, ok: true, result }, self.FVL.transferables(result));
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.stack) || err) });
  }
};
</script>
```

- `e.data` is the message: `{ id, op, args }`.
- `self.FVL.dispatch(op, args, progressCallback)` runs the job (see below).
- `self.postMessage({ id, ok: true, result }, self.FVL.transferables(result))` sends the answer back. The second argument lists the memory blocks to *move* rather than copy.
- On an exception it sends `{ id, ok: false, error }`, so the page can show "Analysis failed: …".

**The dispatcher** (lines 3095–3106), a simple `switch` on the job name:
```js
// food-vision-lab.html lines 3095–3106
/* Operation dispatcher shared by the WebWorker and the main-thread fallback. */
FVL.dispatch = function (op, a, progress) {
  switch (op) {
    case 'ping': return { version: FVL.version };
    case 'generate': return generate(a.kind, a.seed, a.opts || {});
    case 'color': return analyzeColor(a.image, a.opts || {});
    case 'particles': return analyzeParticles(a.image, a.opts || {});
    case 'timelapse': return analyzeTimeLapse(a.frames, a.times, a.opts || {});
    case 'selftest': return runSelfTests(progress);
    default: throw new Error('Unknown operation: ' + op);
  }
};
```

## 2.3 The RPC: calling the worker like a function

RPC means "remote procedure call". The page wants to write `const r = await Engine.call('color', {...})` as if the worker were a normal function. Lines 3043–3060:
```js
// food-vision-lab.html lines 3201–3218
  onMessage(d) {
    const p = this.pending.get(d.id); if (!p) return;
    if (d.progress) { if (p.onProgress) p.onProgress(d.progress.i, d.progress.n, d.progress.r); return; }
    this.pending.delete(d.id);
    if (p.op !== 'ping') { this.busy--; this.paint(); }
    if (d.ok) p.resolve(d.result); else p.reject(new Error(d.error));
  },
  call(op, args, onProgress, label) {
    this.label = label || op;
    if (this.mode === 'main') return this.local(op, args, onProgress);
    return new Promise((resolve, reject) => {
      const id = ++this.seq;
      this.pending.set(id, { resolve, reject, op, args, onProgress });
      this.busy++; this.paint();
      try { this.worker.postMessage({ id, op, args }); }
      catch (err) { this.pending.delete(id); this.busy--; this.paint(); reject(err); }
    });
  },
```

- `call`:
  - Gives the job a number `id = ++this.seq`.
  - Stores `{resolve, reject}` (the two halves of a Promise) in the `pending` Map under that id.
  - Posts `{ id, op, args }` and returns the Promise. The caller waits with `await`.
- `onMessage`:
  - Finds the pending job by `d.id`.
  - If it is a `progress` message (the validation suite sends one per test), it updates the progress bar and keeps waiting.
  - Otherwise it deletes the entry and calls `resolve(result)` or `reject(error)`. The `await` in the caller then continues.
- `busy` counts running jobs, for the "WebWorker · segmentation" text in the header.

**Main-thread fallback** (`local`, lines 3219–3224): if workers are impossible, the same `F.dispatch` runs on the main thread after a 30 ms `setTimeout`, so the "Analysing…" badge can draw first. Results are identical, but the page freezes during heavy jobs.

## 2.4 Copy vs move (transfer)

`postMessage` normally **copies** data (the "structured clone"). The input photo the page sends is copied: 7.7 MB for a 1600×1200 photo, which takes a few milliseconds.

For results, the worker **transfers** the buffers instead. Ownership moves to the page in no time, and the worker's copy becomes empty ("detached"). `FVL.transferables` (lines 3108–3119) walks the result object and collects every typed array's `.buffer`:
- `ArrayBuffer.isView(o)` is true for any typed array.
- It skips arrays of plain numbers and stops at depth 8 for safety.
- A `Set` makes sure each buffer is listed once. Listing one twice is an error.

You can see transfer in the console (works in any modern browser):

```js
const a = new Float32Array(1000);
const b = structuredClone(a, { transfer: [a.buffer] });
console.log(a.length, b.length);   // 0 1000  ← a was emptied, b now owns the memory
```

## 2.5 The whole journey: from your photo to the chart

```mermaid
sequenceDiagram
    participant U as You
    participant M as Main thread (UI)
    participant W as WebWorker (FVL core)
    U->>M: choose photo (file input / drop)
    M->>M: readImageFile: createImageBitmap → canvas.drawImage → getImageData
    M->>M: Color.loadFile stores {width, height, data}; makeRunner starts analyze()
    M->>W: postMessage {id, op:'color', args:{image, opts}} (image COPIED)
    W->>W: dispatch → analyzeColor: gains → Lab maps → mask → ΔE/BI maps → stats, histograms
    W-->>M: postMessage {id, ok, result} (map buffers TRANSFERRED)
    M->>M: Engine.onMessage resolves the Promise → Color.res = result
    M->>M: paint(): map + colour table → RGBA → viewer.show → putImageData
    M->>M: results(): tiles, ΔE classes, Chart.set → canvas drawing
    M-->>U: heatmap, numbers and charts on screen
```

The same steps in words, with the code locations:
1. **You pick a file.** `wireDrop` (line 3544) calls `Color.loadFile(file)` (line 3660).
2. **Decode and read pixels.** `readImageFile` (lines 3529–3543):
   - `createImageBitmap(file)` decodes the JPEG/PNG.
   - Images larger than 1600 px are shrunk.
   - The image is drawn on a hidden canvas, and `getImageData` returns the RGBA bytes.
3. **Store and start.** `this.img = r.image` stores the photo. The White ROI tool is selected, and `this.run()` starts the analysis. `makeRunner` (line 3236) guarantees only one analysis runs at a time: if you change a setting mid-run, it runs once more afterwards instead of queueing ten runs. Settings changes also wait 220 ms (`debounce`) so typing doesn't trigger a run per keystroke.
4. **Send the job.** `analyze()` (line 3696) calls `await Engine.call('color', { image: this.img, opts: this.opts })`, which leads to `postMessage`. The photo is copied into the worker.
5. **Compute.** The worker runs `analyzeColor` (lines 1903–2073): white balance → per-pixel Lab (1.2–1.3) → automatic sample mask → reference colour → ΔE, BI, WI, C\*, h° maps → statistics, histograms, a\*b\* density, ΔE classes, patch check.
6. **Reply.** The result's typed arrays are transferred back.
7. **Draw the map.** `paint()` (lines 3710–3741):
   - For each pixel inside the mask, the map value is scaled to 0–255 between the 1st and 99th percentile.
   - That number picks a colour from the 256-entry colour table (`FVL.colormap`).
   - It is blended with the corrected photo by the opacity slider. Pixels outside the mask are dimmed.
   - The resulting `ImageData` goes to the canvas with `putImageData`.
8. **Draw the numbers.** `results()` fills the tiles and calls `Chart.set(spec)` for each chart. `Chart.render` draws axes, bars and lines on a canvas sized for your screen's pixel density.

---

# PART 3: Where I cut corners (honest audit)

Each item has four parts:
- **What I assumed**
- **Why it can be wrong**
- **How you notice it**
- **The fix.** Code marked "tested" was run against a simulation before going into these notes. Fixes marked "procedure" are lab practice, not code.

## A. Colour

### A1. A phone camera is not a colorimeter *(the biggest one) · now fixable in the app*
**Assumed:** the photo's pixel values are true sRGB, so linearising with the sRGB curve gives physically proportional light.

**Reality:** phone cameras apply their own tone curves, contrast boosts, local brightening, saturation and sharpening. Their sensor colours also leak into each other ("crosstalk"). A white tile corrects only an overall multiplication.

**Measured:** I simulated a camera with a non-sRGB curve, mild contrast boost and channel crosstalk, then photographed a 22-patch chart with it.
- With white-tile gains only, the patch errors averaged **ΔE00 3.49 (worst 5.87)**.
- The grey patches came out with L\* errors of **+3.2, +2.8, +0.2, −2.1, −1.9** from light to dark.

**How you notice:** photograph a colour chart with known values next to the sample. In the Calibration-check table:
- If grey patches of different lightness drift up and down like this, the tone curve isn't sRGB.
- If coloured patches are off by more than 2, the colours need a matrix.

**Fix (now in the app):** set **Correction → Colour chart**, mark the chart's patches with the **Patch** tool and type their certified values. The app fits a tone curve from the grey patches and a 3×3 matrix from all patches (code in 1.2). The self-test "Colour-matrix calibration fixes a non-sRGB phone camera" runs the same simulated camera: **mean ΔE00 3.49 → 0.47 (worst 1.30)**, scored leave-one-out.

One honest limit: the leave-one-out check refits the matrix without each patch, but the grey tone curve is still fitted using all grey patches, so grey-patch errors are slightly optimistic. Also lock exposure and white balance, and shoot RAW/DNG if your phone allows (procedure).

The standalone version below is useful if you want the same fit outside the app:
```js
// (1) Linearise each channel from grey patches of known L* instead of trusting the sRGB curve.
//     Interpolates ln(linear) against ln(code), so a camera power-law curve is followed exactly.
function fitLinearization(greyCodes, greyL) {   // greyCodes: [[R,G,B] mean 8-bit values], greyL: certified L*
  const Y = greyL.map((L) => FVL.labToXyz(L, 0, 0)[1]);          // neutral: linear R = G = B = Y
  const curves = [0, 1, 2].map((k) => greyCodes.map((c, i) => [Math.log(c[k]), Math.log(Y[i])]).sort((p, q) => p[0] - q[0]));
  return function toLinear(code, k) {
    const p = curves[k], x = Math.log(Math.max(code, 0.5));
    let i = 1;
    while (i < p.length - 1 && x > p[i][0]) i++;
    const [x0, y0] = p[i - 1], [x1, y1] = p[i];
    return Math.exp(y0 + (y1 - y0) * (x - x0) / (x1 - x0));
  };
}
// (2) Least-squares 3×3 colour-correction matrix: ref ≈ M · cam (both linear RGB, one row per patch).
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
function fitCCM(cam, ref) {
  const XtX = new Array(9).fill(0), XtY = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let n = 0; n < cam.length; n++) for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) XtX[i * 3 + j] += cam[n][i] * cam[n][j];
    for (let c = 0; c < 3; c++) XtY[c][i] += cam[n][i] * ref[n][c];
  }
  const inv = inv3(XtX), M = [];
  for (let c = 0; c < 3; c++) for (let j = 0; j < 3; j++) M.push(inv[j * 3] * XtY[c][0] + inv[j * 3 + 1] * XtY[c][1] + inv[j * 3 + 2] * XtY[c][2]);
  return M;
}
const applyCCM = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
```

### A2. D65 light and the 2° observer
**Assumed:** L\*a\*b\* are relative to D65 daylight and the 2° standard observer (`WHITE` = 0.95047, 1, 1.08883).

**Why it matters:** many food papers and instruments report D65/10° (white point 0.94811, 1, 1.07304) or D50 values. These numbers are not interchangeable: comparing your values with a paper that used a different setting gives a few ΔE of disagreement with nothing wrong in either.

**Fix:** for another observer, fit the CCM (A1) against reference values measured with that observer and change `WHITE`. For D50 values, adapt XYZ with the Bradford transform (tested: matches Lindbloom's published D65→D50 matrix to within 5×10⁻⁶):
```js
// Bradford chromatic adaptation between white points (e.g. D65 → D50 to compare with
// instruments or printing standards that report D50 L*a*b*).
const BRADFORD = [0.8951, 0.2664, -0.1614, -0.7502, 1.7135, 0.0367, 0.0389, -0.0685, 1.0296];
const mul3 = (A, B) => { const C = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) C.push(A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]); return C; };
const mulv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
function bradfordMatrix(srcWhite, dstWhite) {      // whites as [X, Y, Z] with Y = 1
  const s = mulv(BRADFORD, srcWhite), d = mulv(BRADFORD, dstWhite);
  const D = [d[0] / s[0], 0, 0, 0, d[1] / s[1], 0, 0, 0, d[2] / s[2]];
  return mul3(inv3(BRADFORD), mul3(D, BRADFORD));
}
```

`bradfordMatrix([0.95047,1,1.08883], [0.96422,1,0.82521])` gives the 3×3 matrix to apply to XYZ before computing Lab with the D50 white.

### A3. Clipped (overexposed) pixels
**Assumed:** every analysed pixel holds real colour. The app only warns about clipping inside the white ROI.

**Measured:** the cookie photographed 1.7× too bright had **19.2%** of its sample pixels clipped. Clipped pixels have lost information, so their L\* and ΔE are wrong.

**Fix (tested):** check the share of clipped pixels in the mask, and re-shoot if it is above about 0.5%. Don't just drop the pixels: that removes the lightest part of the sample and biases the mean.
```js
// Saturation check: share of analysed pixels with a channel at the sensor ceiling or floor.
// Clipped pixels carry no colour information, so re-shoot when this exceeds about 0.5 %.
function clippedFraction(img, mask, hi = 254, lo = 1) {
  let n = 0, bad = 0;
  for (let i = 0, j = 0; i < img.width * img.height; i++, j += 4) {
    if (mask && !mask[i]) continue;
    n++;
    const d = img.data;
    if (d[j] >= hi || d[j + 1] >= hi || d[j + 2] >= hi || (d[j] <= lo && d[j + 1] <= lo && d[j + 2] <= lo)) bad++;
  }
  return n ? bad / n : 0;
}
```

### A4. Uneven lighting (vignetting, shading)
**Assumed:** the light is the same everywhere. One gain per channel corrects the whole picture.

**Measured:** 30% corner vignetting on the cookie scene:
- mean per-pixel error rose from ΔE00 0.62 to **3.60**
- the worst patch rose from 0.03 to **2.56**

**How you notice:** put the white tile in two different corners. If the two give different gains, the lighting is uneven.

**Fix (tested):** take a photo of a plain white card with identical light and settings, and divide by it (flat-field). The error dropped back to **0.70** and the worst patch to **0.15**.
```js
// Flat-field (shading) correction: photograph a uniform white card under the same light and
// camera settings, then divide every pixel by the card's relative brightness at that position.
function flatField(img, card) {                     // both {width, height, data} with equal size
  const N = img.width * img.height, mean = [0, 0, 0];
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) mean[k] += FVL.S2L[card.data[4 * i + k]] / N;
  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < N; i++) {
    for (let k = 0; k < 3; k++) {
      const gain = mean[k] / Math.max(1e-6, FVL.S2L[card.data[4 * i + k]]);
      out[4 * i + k] = Math.round(FVL.linearToSrgb(Math.min(1, FVL.S2L[img.data[4 * i + k]] * gain)) * 255);
    }
    out[4 * i + 3] = 255;
  }
  return { width: img.width, height: img.height, data: out };
}
```

### A5. Shrinking photos averages in the wrong space
`readImageFile` shrinks photos larger than 1600 px with `drawImage`. Browsers average the *encoded* values, not linear light, so fine light-dark texture comes out slightly too dark after shrinking.

**Fix (procedure):** for colorimetry, use photos ≤ 1600 px so no shrinking happens, or crop instead of shrinking.

### A6. Averages that hide noise
- **ΔE averages include noise.** "Mean ΔE00" averages per-pixel differences, and noise always makes a difference positive. The self-test shows this: the mean colour of the sample was off by only 0.012, yet the per-pixel mean was 0.62, all of it noise.
  - **Fix:** to compare a sample with a target, report ΔE between the *mean* L\*a\*b\* and the target, not the mean of per-pixel ΔE.
- **BI is fragile.** BI is undefined or negative for dark and bluish pixels (backgrounds were −17 to −31 in Part 1). The app reports both "mean of pixel BI" and "BI of the mean colour". Prefer the latter, and always use the sample mask.

## B. Microstructure

### B1. One global threshold
**Assumed:** one Otsu threshold works for the whole image, which needs even lighting and a two-peaked histogram.

**How you notice:** η (separability) below about 0.7 in the Otsu stage legend, or objects missing on one side of the image.

**Fix (procedure):** even illumination and Köhler alignment on the microscope, or a flat-field image (A4) before analysis.

### B2. Otsu compared half a grey level off *(fixed)*
Otsu counts a blurred value of 104.3 as bin 104, so with t = 104 it belongs to the background class. The old mask used `blur > thr`, which made 104.3 an object.

The mask now compares `Math.round(blur[i]) > thr`, matching Otsu's own counting, in both `analyzeParticles` and `segmentObject`. The effect was tiny: only pixels within half a grey level of the threshold changed.

### B3. Blur makes small objects measure smaller
Blurring then thresholding pulls the edge of a small round object inward. In my emulsion tests it was about 0.25 px of radius, about 3% of an 18 px droplet's diameter.

**How you notice:** compare σ = 0.5 and σ = 1.5 results; real sizes shouldn't change.

**Fix:** use the smallest σ that removes noise, and keep objects at least about 10 px across (higher magnification).

### B4. The marker step was not textbook h-maxima *(found while writing these notes · fixed)*
**What the old code did:** it marked pixels where D − R ≥ h. That rule never merges hills of exactly equal height, whatever h is. Equal distance values are common in digital images (√2, 2, √5 keep repeating).

**What it does now:** it takes the regional maxima of R (code in 1.7). Hills joined by a dip smaller than h become one plateau of R, so they share one marker.

**Measured before → after:**

| test | old rule | new rule |
|---|---|---|
| Part 1 mask, h = 1.5 (dip only 1) | 2 objects | **1 object** |
| one rod-shaped particle, any h from 0.5 to 2 | split into 2 | **kept as 1** |
| emulsions (4 images) | identical | identical |
| powder, spurious fragments | 8–10 per image | **1 per image** |
| powder, count error | −5 to −11% | −8 to −15% |

The old powder count only *looked* better because false splits were cancelling real merges. The new numbers are the honest ones (B5). A self-test now covers the equal-hill and rod cases.

### B5. Touching objects stay merged *(a real limit of the method, not fixed)*
Distance-map watershed cannot split objects whose contact neck is almost as wide as the smaller object. In the tests:
- emulsions undercount by 2–4% (about 15–20 merged pairs per image)
- angular powders undercount by **8–15%** across random images (B4 numbers); powder d32 stays within about 4%

The powder test tolerances were set to match: ±12% on the default image and ±16% in the seed sweep.

**How you notice:**
- Turn watershed off and on and compare the count.
- Sort the table by solidity: merged pairs have solidity below about 0.85 and aspect ratio above about 1.6.

**Partial fix (tested, modest gain, not in the app):** find markers on a 2× upsampled image, where necks are resolved twice as finely. Measured merges fell from 17→14, 20→15, 15→13 and 18→18 on four emulsion images, and by 0–3 on powders, at about 4× the computing time. `hMaximaMarkersStd` in this code is the same as the app's new `hMaximaMarkers`.
```js
// Find watershed markers on a 2× bilinearly upsampled copy of the smoothed image, where the
// neck between touching objects is resolved twice as finely, then map them back to the original grid.
function upsampleBilinear(src, w, h, f) {
  const W = w * f, H = h * f, out = new Float32Array(W * H);
  for (let Y = 0; Y < H; Y++) {
    const sy = (Y + 0.5) / f - 0.5, y0 = Math.min(h - 1, Math.max(0, Math.floor(sy))), y1 = Math.min(h - 1, y0 + 1), fy = Math.min(1, Math.max(0, sy - y0));
    for (let X = 0; X < W; X++) {
      const sx = (X + 0.5) / f - 0.5, x0 = Math.min(w - 1, Math.max(0, Math.floor(sx))), x1 = Math.min(w - 1, x0 + 1), fx = Math.min(1, Math.max(0, sx - x0));
      const top = src[y0 * w + x0] * (1 - fx) + src[y0 * w + x1] * fx, bot = src[y1 * w + x0] * (1 - fx) + src[y1 * w + x1] * fx;
      out[Y * W + X] = top * (1 - fy) + bot * fy;
    }
  }
  return out;
}
function markersUpsampled(blur, thr, bright, morph, w, h, o, f = 2) {
  const W = w * f, H = h * f, up = upsampleBilinear(blur, w, h, f);
  let m = new Uint8Array(W * H);
  for (let i = 0; i < m.length; i++) m[i] = bright ? (up[i] > thr ? 1 : 0) : (up[i] <= thr ? 1 : 0);
  m = FVL.opening(m, W, H, (o.openR || 0) * f); m = FVL.closing(m, W, H, (o.closeR || 0) * f);
  if (o.fillHoles) m = FVL.fillHoles(m, W, H);
  const D2 = FVL.distanceTransform(m, W, H);
  for (let i = 0; i < D2.length; i++) D2[i] /= f;                      // back to original-pixel units
  const mk = hMaximaMarkersStd(D2, m, W, H, o.h);                       // textbook h-maxima (see upgrade above)
  const out = new Int32Array(w * h), remap = new Map();
  for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
    const id = mk.markers[Y * W + X]; if (!id) continue;
    const i = ((Y / f) | 0) * w + ((X / f) | 0);
    if (!morph[i] || out[i]) continue;                                  // outside the real foreground, or taken
    if (!remap.has(id)) remap.set(id, remap.size + 1);
    out[i] = remap.get(id);
  }
  return { markers: out, count: remap.size };
}
```

The real fix for powders is physical: disperse the sample so particles don't touch.

### B6. Excluding edge-cut objects biased the sizes *(fixed)*
**The problem:** big objects touch the image edge more often, so they are dropped more often, and the size distribution shifts toward small objects. My original validation hid this, because the ground truth was filtered the same way.

**Now:** when "Exclude objects cut by the edge" is on, each counted object gets an **edge weight**:

W·H / ((W − b_w − 1)(H − b_h − 1))

where b_w × b_h is its bounding box in pixels. That is how many objects it stands for (the Miles–Lantuéjoul correction). `sizeStats` uses these weights in every mean, moment and percentile. The weight is a column in the object table and the CSV, and the summary says "edge-corrected".

**Measured** (self-test "Edge-exclusion bias removed…", large particles in a small frame): Dv50 bias **−19.8% → −3.6%**. The remaining gap is particles too big ever to fit fully inside the frame; no method can recover those.

On the app's own test images the bias was tiny (0.1–0.3% for emulsions), because the objects are small next to the frame. The ground-truth comparison now uses *every* object centred in the frame, which is what the corrected statistics estimate.

### B7. A flat image of a 3-D sample
A confocal slice or a cut bread surface cuts spheres at random heights, so the circles you see are usually **smaller** than the spheres. d32 and volume-weighted D-values from 2-D circles therefore underestimate the real 3-D sizes. This is the "Wicksell problem". Area fraction equals volume fraction only for thin random cuts (the Delesse principle); thick optical sections overestimate it (the Holmes effect).

**Fix (method, not implemented here):** Saltykov/Wicksell unfolding of the diameter histogram, or measure in 3-D with a confocal z-stack.

### B8. Calibration and lens distortion
The µm/px scale is whatever you type. Lenses also bend straight lines near the corners, so sizes there can be off by several percent.

**Fix (procedure):**
- Photograph a stage micrometer or ruler at the same zoom and compute scale = known length ÷ measured pixels.
- Keep objects of interest near the centre, or calibrate distortion with a grid target.

### B9. Small objects
- Objects under the minimum area are dropped, so the distribution is cut off at the small end. Report that cut-off.
- Below about 10 px across, perimeter and circularity are unreliable. Circularity is capped at 1 (droplet 2 in Part 1 hit the cap).
- Feret diameters carry about ±1 px digitisation error.

### B10. Statistics labels
- "Best fit" picks the lower KS distance, but with weighted data that is a ranking, not a statistical test.
- Percentiles use Hazen plotting positions, which differ slightly from laser-diffraction software.

## C. Shrinkage

- **C1. Area is not volume.** A top-view photo can't see the sample getting thinner.
- **C2. Box counting reads about 0.97 for a perfect circle,** because of finite size. It also depends on magnification and the box-size range. Compare FD *changes* within one experiment, check R², and don't compare FD numbers across different set-ups.
- **C3. The kinetic fit gives no confidence interval,** and forces A∞/A0 ≥ 0. If drying hasn't reached the plateau, k is unreliable. Collect frames until A/A0 flattens.
- **C4. The largest object is assumed to be the sample, and the lighting is assumed stable.** Watch the "Otsu" column in the frame table: a threshold that drifts strongly means the lighting changed.

## D. Testing and engineering honesty

- **D1. My tests check the code against my own simulations.** For example, the colour cast I tested is exactly the one kind of cast the method can undo perfectly. Passing them proves the code is internally consistent, not that it gives true values for real food. Real validation needs physical standards:
  - colour tiles measured with a spectrophotometer
  - certified size-standard microspheres
  - a stage micrometer
- **D2. One test name overstated (fixed).** "ΔE map is zero at the reference colour" actually read 1.13, because the reference is a 5×5 average. It is now called "ΔE map equals a direct ΔE00 calculation at the picked pixel", which is what it checks.
- **D3. I changed some tolerances after seeing results.**
  - The powder count tolerance went from 8% to 12% (16% in the seed sweep). After the B4 fix this reflects the honest 8–15% undercount instead of hiding it.
  - Feret went from % to ±1 px.
  - The Sierpiński carpet test switched to powers-of-3 boxes.
  - The colour test switched from per-pixel error to mean-colour bias.
  Each change had a reason, but you should know they happened.
- **D4. The fallback freezes the page.** Main-thread mode freezes the UI during heavy jobs. There is also no way to cancel a running job.

---

# PART 4: Rebuild it yourself in 7 days

Each day you get:
- **Goal:** what to build
- **Write:** the logic to work out yourself
- **Test:** paste it into the browser console (F12) after your functions are defined
- **Solution:** a tested version, hidden until you open it. The Day 2–7 solutions and tests were run as one chain, so later days use earlier days' functions.

Work in one HTML page: add each day's functions in a `<script>` and reload. Use the Part 1 numbers to check yourself.

## Day 1: Pixel reader (about 25 lines)
**Goal:** open an image, click on it, show the RGBA values of that pixel.

**Write:**
- file input → `createImageBitmap` → draw on a canvas the same size as the image
- `getImageData` → `getPixel(im, x, y)` using `j = 4*(y*w + x)`
- convert the click position from screen pixels to image pixels

**Test** (paste after loading the page):
```js
const t = new ImageData(new Uint8ClampedArray([10,20,30,255, 40,50,60,255, 70,80,90,255, 100,110,120,255, 130,140,150,255, 160,170,180,255]), 3, 2);
console.assert(getPixel(t, 2, 1).join() === '160,170,180,255', 'index formula');
console.assert(t.data.length === 3 * 2 * 4, '4 bytes per pixel');
console.log('Day 1 done');
```

<details><summary>Solution (Day 1)</summary>

```html
<!doctype html>
<meta charset="utf-8">
<title>Day 1 · Pixel reader</title>
<input type="file" id="file" accept="image/*">
<p id="out">Pick an image, then click on it.</p>
<canvas id="cv"></canvas>
<script>
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d', { willReadFrequently: true });
let img = null;                                   // ImageData of the whole picture
document.getElementById('file').onchange = async (e) => {
  const bmp = await createImageBitmap(e.target.files[0]);
  cv.width = bmp.width; cv.height = bmp.height;   // canvas = image size, 1 pixel per pixel
  ctx.drawImage(bmp, 0, 0);
  img = ctx.getImageData(0, 0, cv.width, cv.height);
};
function getPixel(im, x, y) {
  const j = 4 * (y * im.width + x);               // 4 numbers per pixel, rows one after another
  return [im.data[j], im.data[j + 1], im.data[j + 2], im.data[j + 3]];
}
cv.onclick = (e) => {
  if (!img) return;
  const r = cv.getBoundingClientRect();           // the canvas may be drawn smaller on screen
  const x = Math.floor((e.clientX - r.left) * cv.width / r.width);
  const y = Math.floor((e.clientY - r.top) * cv.height / r.height);
  document.getElementById('out').textContent = `(${x}, ${y}) → RGBA ${getPixel(img, x, y).join(', ')}`;
};
</script>
```
</details>

## Day 2: Colour science
**Goal:** `rgbToLab(r, g, b)`, `deltaE76`, `deltaE2000`, `browningIndex`.

**Write:** the formulas from 1.1, 1.3, 1.4 and 1.5. Start with ΔE76; ΔE00 is just the table in 1.4, turned into lines of code.

**Test:**
```js
{
  const near = (a, b, t) => Math.abs(a - b) <= t;
  const w = rgbToLab(255, 255, 255), red = rgbToLab(255, 0, 0), grey = rgbToLab(128, 128, 128);
  console.assert(near(w[0], 100, 0.01) && near(w[1], 0, 0.01) && near(w[2], 0, 0.01), 'white should be 100 0 0', w);
  console.assert(near(red[0], 53.24, 0.02) && near(red[1], 80.09, 0.02) && near(red[2], 67.20, 0.02), 'red', red);
  console.assert(near(grey[0], 53.585, 0.005), 'mid grey L*', grey);
  console.assert(near(srgbToLinear(10), 0.003035, 1e-6), 'linear branch below 10/255');
  console.assert(near(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]), 2.0425, 1e-4), 'Sharma pair 1');
  console.assert(near(deltaE2000([50, 2.5, 0], [73, 25, -18]), 27.1492, 1e-4), 'Sharma pair 17');
  console.assert(near(deltaE2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387]), 1.2644, 1e-4), 'Sharma pair 25');
  console.assert(near(deltaE2000([72.491, 8.698, 32.637], [64, 9, 32]), 6.721, 1e-3), 'toy golden pixel vs target colour');
  console.assert(near(browningIndex(50, 0, 0), 0, 0.01), 'neutral grey has BI about 0');
  console.log('Day 2 tests finished (no red assertion messages above = pass)');
}
```

<details><summary>Solution (Day 2)</summary>

```js
const srgbToLinear = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const M = [0.4124564, 0.3575761, 0.1804375, 0.2126729, 0.7151522, 0.0721750, 0.0193339, 0.1191920, 0.9503041];
const WHITE = [0.95047, 1.0, 1.08883];
function linearToXyz(r, g, b) {
  return [M[0] * r + M[1] * g + M[2] * b, M[3] * r + M[4] * g + M[5] * b, M[6] * r + M[7] * g + M[8] * b];
}
function xyzToLab(X, Y, Z) {
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(X / WHITE[0]), fy = f(Y / WHITE[1]), fz = f(Z / WHITE[2]);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
const rgbToLab = (r, g, b) => xyzToLab(...linearToXyz(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)));
const deltaE76 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
function deltaE2000([L1, a1, b1], [L2, a2, b2]) {
  const rad = Math.PI / 180, C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cb7 / (Cb7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (b, a) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1 = hue(b1, a1p), h2 = hue(b2, a2p);
  let dh = 0;
  if (C1p * C2p !== 0) { dh = h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dL = L2 - L1, dC = C2p - C1p, dH = 2 * Math.sqrt(C1p * C2p) * Math.sin(dh / 2 * rad);
  const Lb = (L1 + L2) / 2, Cb = (C1p + C2p) / 2;
  let hb = h1 + h2;
  if (C1p * C2p !== 0) hb = Math.abs(h1 - h2) <= 180 ? (h1 + h2) / 2 : (h1 + h2 < 360 ? (h1 + h2 + 360) / 2 : (h1 + h2 - 360) / 2);
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.20 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), RC = 2 * Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7));
  const SL = 1 + 0.015 * (Lb - 50) ** 2 / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cb, SH = 1 + 0.015 * Cb * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
function browningIndex(L, a, b) { const x = (a + 1.75 * L) / (5.645 * L + a - 3.012 * b); return 100 * (x - 0.31) / 0.17; }
```
</details>

## Day 3: White balance and a false-colour map
**Goal:** gains from a white ROI, per-pixel L\*a\*b\* maps, and a heatmap image.

**Write:**
- `labToLinear` (the inverse, 1.2)
- `whiteGains(im, rect, tileLab)`
- `labMaps(im, gains)`
- `heatmap(values, w, h, lo, hi)`: value → position on a colour ramp

**Test:** uses the Part 1 photo:
```js
{
  const toy = [242, 226, 182, 232, 196, 130, 14, 12, 10, 214, 160, 88, 150, 92, 44, 16, 13, 11, 13, 12, 10, 15, 13, 10, 14, 12, 11];
  const data = new Uint8ClampedArray(36);
  for (let i = 0; i < 9; i++) data.set([toy[3 * i], toy[3 * i + 1], toy[3 * i + 2], 255], 4 * i);
  const im = { width: 3, height: 3, data };
  const g = whiteGains(im, { x: 0, y: 0, w: 1, h: 1 }, [95, 0, 0]);
  console.assert(Math.abs(g[0] - 0.9868) < 1e-4 && Math.abs(g[1] - 1.1521) < 1e-4 && Math.abs(g[2] - 1.8731) < 1e-4, 'gains', g);
  const m = labMaps(im, g);
  console.assert(Math.abs(m.L[0] - 95) < 1e-3 && Math.abs(m.A[0]) < 1e-3, 'tile becomes L*95 a*0 b*0', m.L[0], m.A[0], m.B[0]);
  console.assert(Math.abs(m.L[3] - 72.491) < 1e-3 && Math.abs(m.A[3] - 8.698) < 1e-3 && Math.abs(m.B[3] - 32.637) < 1e-3, 'golden pixel Lab');
  const hm = heatmap(m.L, 3, 3, 0, 95);
  console.assert(hm.data[0] === 252 && hm.data[1] === 255 && hm.data[2] === 164, 'highest value gets the last colour stop');
  console.log('Day 3 tests finished');
}
```

<details><summary>Solution (Day 3)</summary>

```js
function labToLinear(L, a, b) {                     // inverse path, needed for the tile's target colour
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200, e = 216 / 24389, k = 24389 / 27;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k, yr = L > k * e ? fy ** 3 : L / k, zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const X = xr * 0.95047, Y = yr, Z = zr * 1.08883;
  return [3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z, -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z, 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z];
}
function whiteGains(im, rect, tileLab) {          // mean linear RGB of the tile ROI → per-channel gain
  const s = [0, 0, 0]; let n = 0;
  for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) {
    const j = 4 * (y * im.width + x);
    for (let k = 0; k < 3; k++) s[k] += srgbToLinear(im.data[j + k]);
    n++;
  }
  const target = labToLinear(tileLab[0], tileLab[1], tileLab[2]);
  return s.map((v, k) => target[k] / (v / n));
}
function labMaps(im, gains) {                     // one Float32Array per channel, one value per pixel
  const N = im.width * im.height, L = new Float32Array(N), A = new Float32Array(N), B = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const j = 4 * i;
    const lab = xyzToLab(...linearToXyz(srgbToLinear(im.data[j]) * gains[0], srgbToLinear(im.data[j + 1]) * gains[1], srgbToLinear(im.data[j + 2]) * gains[2]));
    L[i] = lab[0]; A[i] = lab[1]; B[i] = lab[2];
  }
  return { L, A, B };
}
const STOPS = [[0, 0, 4], [120, 28, 109], [237, 105, 37], [252, 255, 164]];   // dark → purple → orange → pale yellow
function heatmap(values, w, h, lo, hi) {          // false colour: value → position on the colour ramp
  const out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const t = Math.min(1, Math.max(0, (values[i] - lo) / (hi - lo))) * (STOPS.length - 1);
    const s = Math.min(STOPS.length - 2, Math.floor(t)), f = t - s;
    for (let k = 0; k < 3; k++) out[4 * i + k] = STOPS[s][k] + (STOPS[s + 1][k] - STOPS[s][k]) * f;
    out[4 * i + 3] = 255;
  }
  return { width: w, height: h, data: out };       // in the browser: ctx.putImageData(new ImageData(out, w, h), 0, 0)
}
```
</details>

## Day 4: Grey, blur, Otsu
**Goal:** `grayscale`, `gaussianKernel`, `gaussianBlur` (separable, clamped edges), `otsu`.

**Write:** section 1.6. Remember the flat-optimum middle.

**Test:**
```js
{
  const k = gaussianKernel(0.5);
  console.assert(k.length === 5 && Math.abs(k[2] - 0.786571) < 1e-6 && Math.abs(k[1] - 0.106451) < 1e-6, 'kernel for sigma 0.5', k);
  console.assert(Math.abs(k.reduce((a, b) => a + b, 0) - 1) < 1e-12, 'kernel sums to 1');
  const flat = gaussianBlur(new Float32Array(12).fill(80), 4, 3, 1.3);
  console.assert(flat.every((v) => Math.abs(v - 80) < 1e-4), 'blurring a flat image changes nothing');
  const gray = new Float32Array([226.2248, 198.8884, 12.2808, 166.2820, 100.8652, 13.4934, 12.0682, 13.2086, 12.3530]);
  const blur = gaussianBlur(gray, 3, 3, 0.5);
  console.assert(Math.abs(blur[4] - 98.2921) < 1e-3 && Math.abs(blur[0] - 216.3919) < 1e-3, 'toy blur values', blur);
  console.assert(otsu(blur) === 123.5, 'toy Otsu threshold is 123.5', otsu(blur));
  console.log('Day 4 tests finished');
}
```

<details><summary>Solution (Day 4)</summary>

```js
function grayscale(im) {
  const g = new Float32Array(im.width * im.height);
  for (let i = 0; i < g.length; i++) g[i] = 0.2126 * im.data[4 * i] + 0.7152 * im.data[4 * i + 1] + 0.0722 * im.data[4 * i + 2];
  return g;
}
function gaussianKernel(sigma) {
  const r = Math.max(1, Math.ceil(4 * sigma)), k = [];
  for (let i = -r; i <= r; i++) k.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
  const s = k.reduce((a, b) => a + b, 0);
  return k.map((v) => v / s);                      // weights add up to exactly 1
}
function gaussianBlur(src, w, h, sigma) {          // horizontal pass, then vertical pass
  const k = gaussianKernel(sigma), r = (k.length - 1) / 2, tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const cl = (v, n) => (v < 0 ? 0 : v >= n ? n - 1 : v);   // outside the image → copy the edge pixel
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * src[y * w + cl(x + i, w)]; tmp[y * w + x] = s; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let i = -r; i <= r; i++) s += k[i + r] * tmp[cl(y + i, h) * w + x]; out[y * w + x] = s; }
  return out;
}
function otsu(values) {                            // returns the grey level that best splits the values in two
  const hist = new Array(256).fill(0);
  for (const v of values) hist[Math.min(255, Math.max(0, Math.round(v)))]++;
  const total = values.length; let sumAll = 0; for (let i = 0; i < 256; i++) sumAll += i * hist[i];
  let w0 = 0, sum0 = 0, best = -1, tBest = 0, tEnd = 0;
  for (let t = 0; t < 255; t++) {
    w0 += hist[t]; sum0 += t * hist[t];
    const w1 = total - w0; if (w0 === 0 || w1 === 0) continue;
    const sb = (w0 / total) * (w1 / total) * (sum0 / w0 - (sumAll - sum0) / w1) ** 2;
    if (sb > best + 1e-12) { best = sb; tBest = tEnd = t; } else if (Math.abs(sb - best) <= 1e-12) tEnd = t;
  }
  return (tBest + tEnd) / 2;
}
```
</details>

## Day 5: Distance transform, morphology, labelling
**Goal:**
- exact squared EDT (lower envelope of parabolas)
- erosion/dilation from the EDT
- 8-connected labelling with a flood fill

**Write:** the 1-D envelope from 1.6, then columns-then-rows.

**Test** (includes a comparison with brute force):
```js
{
  const d2 = sqEDT(Uint8Array.from([1, 1, 0, 1, 0, 0, 0, 0, 0]), 3, 3);
  console.assert(Array.from(d2).join() === '2,1,0,1,0,0,0,0,0', 'toy distance map', d2);
  const rows = ['...........', '.###...###.', '.#########.', '.###...###.', '...........'];
  const m = Uint8Array.from(rows.join(''), (c) => (c === '#' ? 1 : 0));
  console.assert(sqEDT(m, 11, 5)[2 * 11 + 2] === 4 && sqEDT(m, 11, 5)[2 * 11 + 3] === 2, 'two-droplet mask centre d² = 4');
  let ok = true;                                   // compare with brute force on a random mask
  const w = 17, h = 13, r = Uint8Array.from({ length: w * h }, () => (Math.random() < 0.7 ? 1 : 0)), e = sqEDT(r, w, h);
  for (let i = 0; i < w * h; i++) {
    let best = r[i] ? Infinity : 0;
    if (r[i]) for (let j = 0; j < w * h; j++) if (!r[j]) best = Math.min(best, (i % w - j % w) ** 2 + (((i / w) | 0) - ((j / w) | 0)) ** 2);
    if (best !== Infinity && best !== e[i]) ok = false;
  }
  console.assert(ok, 'EDT equals brute force');
  console.assert(labelBFS(m, 11, 5).count === 1, 'without watershed the two droplets are one object');
  console.assert(erode(m, 11, 5, 1).reduce((a, b) => a + b, 0) === 4, 'erosion r=1 keeps the 4 pixels with d² > 1');
  console.log('Day 5 tests finished');
}
```

<details><summary>Solution (Day 5)</summary>

```js
function edt1d(f) {                                // exact 1-D squared distance: d[q] = min over p of (q−p)² + f[p]
  const n = f.length, d = new Array(n), v = [0], z = [-Infinity, Infinity];
  let k = 0;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) {
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      if (s > z[k]) break;
      k--;                                         // the parabola at v[k] is hidden: drop it
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) ** 2 + f[v[k]]; }
  return d;
}
function sqEDT(mask, w, h) {                       // columns first, then rows
  const INF = 1e20, out = new Float64Array(w * h);
  for (let x = 0; x < w; x++) {
    const col = edt1d(Array.from({ length: h }, (_, y) => (mask[y * w + x] ? INF : 0)));
    for (let y = 0; y < h; y++) out[y * w + x] = col[y];
  }
  for (let y = 0; y < h; y++) {
    const row = edt1d(Array.from(out.subarray(y * w, y * w + w)));
    for (let x = 0; x < w; x++) out[y * w + x] = row[x];
  }
  return out;
}
function erode(mask, w, h, r) { const d2 = sqEDT(mask, w, h); return mask.map((m, i) => (m && d2[i] > r * r ? 1 : 0)); }
function dilate(mask, w, h, r) { const d2 = sqEDT(mask.map((m) => 1 - m), w, h); return mask.map((m, i) => (m || d2[i] <= r * r ? 1 : 0)); }
function labelBFS(mask, w, h) {                    // 8-connected components, labels 1, 2, 3 …
  const lab = new Int32Array(w * h); let count = 0;
  for (let s = 0; s < w * h; s++) {
    if (!mask[s] || lab[s]) continue;
    lab[s] = ++count; const q = [s];
    while (q.length) {
      const i = q.pop(), x = i % w, y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy, j = yy * w + xx;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[j] && !lab[j]) { lab[j] = count; q.push(j); }
      }
    }
  }
  return { labels: lab, count };
}
```
</details>

## Day 6: Markers and watershed
**Goal:**
- reconstruction (the simple "repeat until nothing changes" version)
- textbook h-maxima (regional maxima, see audit B4)
- priority-queue flooding that reproduces Part 1's labels exactly

**Write:** a min-heap ordered by (priority, age), then 1.7.

**Test:**
```js
{
  const rows = ['...........', '.###...###.', '.#########.', '.###...###.', '...........'];
  const fg = Uint8Array.from(rows.join(''), (c) => (c === '#' ? 1 : 0));
  const D = Float32Array.from(sqEDT(fg, 11, 5), Math.sqrt);
  const mk = hMaxima(D, fg, 11, 5, 0.5);
  console.assert(mk.count === 2, 'h = 0.5 → two markers', mk.count);
  console.assert(hMaxima(D, fg, 11, 5, 1.5).count === 1, 'h = 1.5 (more than the 1 px dip) → one marker');
  const lab = watershed(D, mk.markers, fg, 11, 5);
  console.assert(Array.from(lab.subarray(22, 33)).join('') === '01111122220', 'neck split matches the app', Array.from(lab.subarray(22, 33)).join(''));
  console.log('Day 6 tests finished');
}
```

<details><summary>Solution (Day 6)</summary>

```js
const N8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
function reconstruct(marker, mask, dom, w, h) {    // grow marker upwards, never above mask (slow but simple)
  const J = Float32Array.from(marker, (v, i) => (dom[i] ? Math.min(v, mask[i]) : -Infinity));
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < w * h; i++) {
      if (!dom[i]) continue;
      const x = i % w, y = (i - x) / w; let m = J[i];
      for (const [dx, dy] of N8) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < w && yy < h && J[yy * w + xx] > m) m = J[yy * w + xx]; }
      const v = Math.min(m, mask[i]);
      if (v > J[i]) { J[i] = v; changed = true; }
    }
  }
  return J;
}
function hMaxima(D, fg, w, h, hval) {              // textbook: regional maxima of reconstruct(D − h under D)
  const R = reconstruct(D.map((v) => v - hval), D, fg, w, h), lab = new Int32Array(w * h), seen = new Uint8Array(w * h);
  let count = 0;
  for (let s = 0; s < w * h; s++) {
    if (!fg[s] || seen[s]) continue;
    const plateau = [s], q = [s]; seen[s] = 1; let isMax = true;
    while (q.length) {
      const i = q.pop(), x = i % w, y = (i - x) / w;
      for (const [dx, dy] of N8) {
        const xx = x + dx, yy = y + dy, j = yy * w + xx;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !fg[j]) continue;
        if (R[j] > R[s] + 1e-6) isMax = false;
        else if (Math.abs(R[j] - R[s]) <= 1e-6 && !seen[j]) { seen[j] = 1; plateau.push(j); q.push(j); }
      }
    }
    if (isMax) { count++; for (const i of plateau) lab[i] = count; }
  }
  return { markers: lab, count };
}
class MinHeap {                                    // smallest (priority, age) comes out first
  constructor() { this.a = []; }
  push(e) { const a = this.a; a.push(e); let k = a.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (this.less(a[k], a[p])) { [a[k], a[p]] = [a[p], a[k]]; k = p; } else break; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < a.length && this.less(a[l], a[m])) m = l; if (r < a.length && this.less(a[r], a[m])) m = r; if (m === k) break; [a[k], a[m]] = [a[m], a[k]]; k = m; } }
    return top;
  }
  less(x, y) { return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]); }
}
function watershed(D, markers, fg, w, h) {         // flood from markers, highest distance first
  const lab = Int32Array.from(markers), heap = new MinHeap(); let age = 0;
  for (let i = 0; i < w * h; i++) if (lab[i] && fg[i]) heap.push([-D[i], age++, i]);
  while (heap.a.length) {
    const [, , i] = heap.pop(), x = i % w, y = (i - x) / w;
    for (const [dx, dy] of N8) {
      const xx = x + dx, yy = y + dy, j = yy * w + xx;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || !fg[j] || lab[j]) continue;
      lab[j] = lab[i]; heap.push([-D[j], age++, j]);
    }
  }
  return lab;
}
```
</details>

## Day 7: Measure, statistics, the full sizer
**Goal:**
- area, ECD, marching-squares perimeter × 0.948059, circularity
- d32, d43, Dv10/50/90, log-normal fit
- `sizeParticles(imageData)`, which chains Days 4–7

**Test:** reproduces Part 1.8, then sizes a drawn test image with two touching discs and one lone disc:
```js
{
  const rows = ['...........', '.###...###.', '.#########.', '.###...###.', '...........'];
  const lab = Int32Array.from('00000000000011100022200111112222001110002220' + '00000000000', Number);
  const o = measure(lab, 2, 11, 5);
  console.assert(o[0].area === 11 && o[1].area === 10, 'areas 11 and 10');
  console.assert(Math.abs(o[0].ecd - 3.7424) < 1e-4 && Math.abs(o[0].perimeter - 12.9475) < 1e-4, 'object 1 ECD and perimeter', o[0]);
  console.assert(Math.abs(sizeStats([o[0].ecd, o[1].ecd]).d32 - 3.6595) < 1e-4, 'd32 of the two droplets');
  console.assert(Math.abs(sizeStats([10, 20, 30]).d32 - 36000 / 1400) < 1e-9, 'd32 = Σd³/Σd²');
  // synthetic test photo: two touching bright discs + one lone disc on a dark background
  const w = 80, h = 50, data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const on = Math.hypot(x - 18, y - 25) <= 10 || Math.hypot(x - 36, y - 25) <= 10 || Math.hypot(x - 62, y - 25) <= 8;
    data.set(on ? [230, 180, 90, 255] : [20, 20, 20, 255], 4 * (y * w + x));
  }
  const r = sizeParticles({ width: w, height: h, data });
  console.assert(r.objects.length === 3, 'three particles found', r.objects.length);
  console.assert(r.objects.every((p) => p.circularity > 0.8), 'all roughly round');
  console.log('Day 7 tests finished');
}
```

<details><summary>Solution (Day 7)</summary>

```js
const PERIM_K = Math.PI / (8 * (Math.SQRT2 - 1));   // 0.94806: removes the staircase bias of marching squares
function measure(labels, count, w, h) {
  const objs = [];
  for (let l = 1; l <= count; l++) {
    const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x] === l;
    let area = 0, raw = 0;
    for (let i = 0; i < w * h; i++) if (labels[i] === l) area++;
    for (let y = -1; y < h; y++) for (let x = -1; x < w; x++) {   // every 2×2 window of pixel centres
      const a = inside(x, y), b = inside(x + 1, y), c = inside(x, y + 1), d = inside(x + 1, y + 1), n = a + b + c + d;
      if (n === 1 || n === 3) raw += Math.SQRT1_2; else if (n === 2) raw += a === d ? Math.SQRT2 : 1;
    }
    const perimeter = raw * PERIM_K;
    objs.push({ id: l, area, ecd: 2 * Math.sqrt(area / Math.PI), perimeter, circularity: Math.min(1, 4 * Math.PI * area / perimeter ** 2) });
  }
  return objs;
}
function sizeStats(d) {                            // d = equivalent diameters
  const s = [...d].sort((a, b) => a - b), w = s.map((v) => v ** 3), W = w.reduce((a, b) => a + b, 0);
  const sum = (p) => s.reduce((acc, v) => acc + v ** p, 0);
  let c = 0; const F = s.map((v, i) => { const f = (c + w[i] / 2) / W; c += w[i]; return f; });   // Hazen positions
  const pct = (p) => { if (p <= F[0]) return s[0]; if (p >= F[F.length - 1]) return s[s.length - 1]; let i = 0; while (F[i + 1] < p) i++; return s[i] + (s[i + 1] - s[i]) * (p - F[i]) / (F[i + 1] - F[i]); };
  const mu = s.reduce((a, v, i) => a + w[i] * Math.log(v), 0) / W;
  const sig = Math.sqrt(s.reduce((a, v, i) => a + w[i] * (Math.log(v) - mu) ** 2, 0) / W);
  return { d32: sum(3) / sum(2), d43: sum(4) / sum(3), Dv10: pct(0.1), Dv50: pct(0.5), Dv90: pct(0.9), lnMedian: Math.exp(mu), lnSigma: sig };
}
function sizeParticles(im, o = { sigma: 1, h: 0.5, minArea: 12 }) {   // the whole sizer: Days 4–7 chained
  const { width: w, height: h } = im, blur = gaussianBlur(grayscale(im), w, h, o.sigma), t = otsu(blur);
  let above = 0; for (const v of blur) if (v > t) above++;
  const bright = above / blur.length <= 0.5;                         // objects = the minority phase
  const fg = blur.map((v) => (bright ? v > t : v <= t) ? 1 : 0);
  const D = Float32Array.from(sqEDT(fg, w, h), Math.sqrt);
  const mk = hMaxima(D, fg, w, h, o.h), lab = watershed(D, mk.markers, fg, w, h);
  const objs = measure(lab, mk.count, w, h).filter((p) => p.area >= o.minArea);
  return { threshold: t, objects: objs, stats: objs.length > 1 ? sizeStats(objs.map((p) => p.ecd)) : null };
}
```
</details>

**To finish:** move `sizeParticles` into a worker, exactly like Part 2.2:
1. Put the Day 4–7 functions in a `<script type="text/plain" id="core">`.
2. Add `self.onmessage = (e) => postMessage(sizeParticles(e.data));`.
3. Build a Blob URL and `new Worker(url)`.
4. `worker.postMessage(imageData)` and read the reply in `worker.onmessage`.

You now have the core of the app's microstructure tab.

---

## Formula sheet

| what | formula |
|---|---|
| sRGB → linear | c/12.92 if c ≤ 0.04045, else ((c+0.055)/1.055)^2.4 |
| white gains | g = target linear ÷ measured linear (per channel) |
| linear → XYZ | X = 0.4124564R + 0.3575761G + 0.1804375B, Y = 0.2126729R + 0.7151522G + 0.0721750B, Z = 0.0193339R + 0.1191920G + 0.9503041B |
| Lab | L\* = 116f(Y) − 16, a\* = 500(f(X/0.95047) − f(Y)), b\* = 200(f(Y) − f(Z/1.08883)); f = ∛t or (903.3t + 16)/116 below t = 0.008856 |
| ΔE76 | √(ΔL² + Δa² + Δb²) |
| BI | x = (a + 1.75L)/(5.645L + a − 3.012b), BI = 100(x − 0.31)/0.17 |
| WI, C\*, h° | 100 − √((100−L)² + a² + b²), √(a² + b²), atan2(b, a) |
| grey | 0.2126R + 0.7152G + 0.0722B |
| Gaussian | wᵢ ∝ e^(−i²/2σ²), radius ceil(4σ), normalised to sum 1 |
| Otsu | maximise ω₀ω₁(μ₀ − μ₁)² |
| ECD, circularity | 2√(A/π), 4πA/P² |
| d32, d43 | Σd³/Σd², Σd⁴/Σd³ |
| span | (D90 − D10)/D50 |
| shrinkage | A/A0 = Y∞ + (1 − Y∞)e^(−kt), t½ = ln 2/k |
