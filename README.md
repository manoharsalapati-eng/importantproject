# Food Vision Lab

A computer-vision lab for food images that runs entirely in the browser. `food-vision-lab.html` is a single self-contained file. Open it in any recent browser and it starts on built-in synthetic test images. Your own photos and micrographs are processed locally: they are drawn to an HTML5 canvas and analysed as pixel arrays in a WebWorker, and nothing is uploaded. Web fonts load from Google Fonts when online; offline, the system fonts are used instead.

Every algorithm is written from scratch in plain JavaScript, with no image or maths libraries.

## Pipelines

### 01 · Calibrated spatial colorimeter
- White-point normalisation from a white-tile ROI against the tile's certified L\*a\*b\*. This is a diagonal (von Kries) correction in linear RGB.
- Per-pixel conversion: sRGB → linear RGB (IEC 61966-2-1) → CIE XYZ (D65, 2°) → CIE L\*a\*b\*.
- Maps and statistics for ΔE00 (CIEDE2000) or ΔE\*ab (CIE76) against a typed colour, the sample median, an ROI or a picked pixel. The same are produced for browning index, whiteness index, chroma C\* and hue angle h°.
- Interactive false-colour heatmaps (viridis, inferno, magma, single-hue, diverging) with a hover readout, a line-profile tool, ΔE perceptibility classes, L\*/a\*/b\* histograms and an a\*b\* density plot.
- Automatic sample mask and a calibration check against reference patches.

### 02 · Microstructure and particle/droplet analyser
- Pipeline: grey (Rec. 709) → separable Gaussian → Otsu → Euclidean-disk opening/closing → hole filling → exact Euclidean distance transform (Felzenszwalb–Huttenlocher) → h-maxima markers (grey-level reconstruction) → marker-controlled watershed (Meyer flooding). Union–find connected-component labelling is used when the watershed is off.
- Each of the nine stages can be viewed, with its timing.
- Per object: area, equivalent circle diameter, Feret max/min, perimeter, circularity, aspect ratio, solidity, moment axes and orientation.
- Distribution (number, area or volume basis): d32 (Sauter), d43, D10/D50/D90, span, porosity / area fraction and number density.
- Log-normal and Rosin–Rammler maximum-likelihood fits, each with KS D and probability-plot R².
- Sortable object table with CSV export. Hover and click link the image and the table.

### 03 · Time-lapse shrinkage and morphology tracker
- Segments every frame and reports A/A0, P/P0, circularity, Feret, ECD and the box-counting fractal dimension of the boundary.
- Fits first-order kinetics with a plateau, A/A0 = A∞/A0 + (1 − A∞/A0)·e^(−kt), giving k, t½ and R².
- Reports an isotropy exponent z (A ∝ Lᶻ).
- Frame player with current, first-frame and all-frame outline overlays.

## Synthetic test images (with exact ground truth)
| Image | What it tests |
|---|---|
| Baked cookie under a warm cast (R×1.12, B×0.78) with a white tile and six reference patches | calibration, Lab maths, mask, indices |
| O/W emulsion, confocal style, log-normal droplets with flocculated contacts | watershed, sizing, d32, D-values, fits |
| Bread crumb, flatbed-scan style, merged gas cells | porosity |
| Milk powder, back-lit, angular Rosin–Rammler particles with aggregates | sizing of irregular, touching particles |
| Apple slice, 13 frames of convective drying with growing surface wrinkling | A/A0, kinetics, fractal dimension |

## Verified accuracy
Results come from the in-page validation suite (51 checks, all passing) and the Node seed sweep.

| Quantity | Result |
|---|---|
| CIEDE2000 vs Sharma et al. (2005), 34 pairs | max error 4.95 × 10⁻⁵ (table precision) |
| Lab round trip | 1.6 × 10⁻¹⁵ |
| Colour bias after white-point correction | ΔE00 0.012 (uncorrected: 3.63) |
| Reference patches after correction | max ΔE00 0.025 |
| EDT, morphology, connected components, reconstruction | identical to brute-force references |
| Perimeter estimator on disks r = 4–60 px | mean bias 0.02 % |
| Emulsion droplet count, 6 seeds | −2 % to −4 % |
| Emulsion d32, 6 seeds | within ±1.1 % |
| Bread-crumb porosity, 6 seeds | within ±0.2 percentage points |
| Powder d32 | within +4 % |
| Drying sequence A/A0 | within 0.002 |
| Kinetic rate k | recovered to 0.4 % |
| Box-counting dimension | Koch snowflake 1.282 (theory 1.262); Sierpiński carpet 1.893 (theory 1.893); filled square 1.981 |

## Known limitations
- **Merged contacts are under-split.** A distance-map watershed cannot separate objects whose contact neck is nearly as wide as the smaller object.
  - Unequal flocculated droplets merge a few percent of the time; no droplets are missed and no spurious objects appear.
  - Angular powder particles touching along flat faces undercount by 5–11 % across seeds, while d32 stays within ±4 %.
- **Feret diameters carry about ±1 px digitisation error.** Circularity of small objects is capped at 1.
- **Perimeter can be off by up to ±4 % for some edge angles.** The isotropic perimeter correction is unbiased on average but depends on edge orientation for long straight edges.
- **Box counting has known biases.** It reads about 0.97 for smooth curves (finite-size bias). On strictly self-similar fractals it needs box sizes matched to the fractal's ratio: the carpet gives 1.83 with √2 steps and 1.893 with 3ᵏ boxes.
- **White-point correction is a diagonal (von Kries) correction.** It removes illuminant casts of that form but not non-uniform lighting or camera non-linearities beyond the sRGB curve.

## Tests
```bash
npm test                 # both suites
node tests/core.test.mjs     # 51-check suite + seed sweep in Node (~30 s)
node tests/browser.test.mjs  # end-to-end in headless Chromium via Playwright (~2 min)
```
The browser test drives every tab through the real UI: pointer tools, stage views, uploads, clipboard CSV, the in-page suite in the worker, the main-thread fallback with `Worker` removed, dark mode, and a 390 px phone layout. Screenshots are written to `tests/screenshots/`.
