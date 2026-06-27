# Chinese Folk Melody Texture

An interactive study of **melodic interval texture** in Chinese folk music. It parses a theme written
in **Jianpu 简谱 (numbered notation)**, measures the **semitone distance between every consecutive pair
of notes**, and visualizes the **melodic contour** and the **interval distribution** — so a region's
musical "accent" becomes something you can see.

Most Chinese folk music is built on the same pentatonic scale (宫商角徵羽), yet tunes from the north and
the south sound strikingly different. This project uses **Northern Shaanxi (陕北)** folk songs as a case
study, set against **Jiangnan (江南)** folk songs, to pin down what creates that difference.

## Headline finding

The two regions use intervals of **similar average size** (both are mostly stepwise — a Mann–Whitney test
on leap sizes is *not* significant). What separates them is:

1. **Which intervals fill the gaps.** 陕北 fills the **4th/5th band** and largely skips 3rds; 江南 is the
   mirror image — lots of **3rds**, few 4ths/5ths. A chi-square on the interval-class mix is highly
   significant (χ² ≈ 45, p ≈ 2×10⁻¹⁰).
2. **Oscillation.** 陕北 chains its wide leaps into **direction-reversing** motion — a leap up answered by
   a leap down (the orange/red **saw-tooth** on the contour). Across the comparison set: **21** such
   oscillations in 陕北 vs **2** in 江南.

So the 陕北 signature is **oscillating wide leaps**, not merely *bigger* leaps. (Stat functions are
verified against SciPy.) 山东 (《沂蒙山小调》) is included as a "third-texture" extension.

## Pages

- **`index.html`** — landing: the headline finding, a signature comparison (《山丹丹开花红艳艳》 vs
  《茉莉花》), and a region-grouped samples directory.
- **`melody.html?id=<slug>`** — per-piece analyzer: numbered score (Jianpu 简谱) + Western staff notation
  (beamed) + summary stats + contour + interval histogram + interval table + audio playback.
- **`statistics.html`** — the 4-vs-4 regional comparison (陕北 vs 江南): per-tune table, significance
  tests (chi-square + Mann–Whitney), and four summary plots.
- **`scale-wheels.html`** — explainer: two 12-tone-clock scale wheels, major vs the Chinese pentatonic
  宫商角徵羽.
- **`interval-analyzer.html`** — free-form playground: paste any Jianpu 简谱 and analyze it.
- **`examples/`** — one self-contained page per melody (the melody is embedded), for **double-click**
  preview with no server.

## How it works

- **`engine.js`** — the verified core: Jianpu parser → semitone intervals → stats → contour / staff /
  score / histogram renderers + sine-synth playback. Renderers take a container element + options, so the
  same engine drives every page.
- **`stats.js`** — the `statistics.html` logic on top of `engine.js`: pools intervals per region, runs the
  chi-square and Mann–Whitney tests, and builds the four SVG plots.
- **`styles.css`** — shared palette and layout.
- **`melody.txt`** — the samples database and **single source of truth**. One `field: value` block per
  melody, blocks separated by a line of `---`, `#` = full-line comment. Common fields: `id, title, en,
  region, source, key, meter, bpm, jianpu, notes` (plus optional `jianpu2…` for multi-theme tunes, and
  `image` / `about` / `video` for the per-piece page).
- **`melodies.js`** — an auto-generated mirror of `melody.txt` (`window.MELODIES`); the `file://` fallback
  used when `fetch()` is blocked. Regenerate it (and the `examples/` pages) with `node examples/build.js`
  after editing `melody.txt`.

### Jianpu 简谱 notation
`1`–`7` scale degrees · `0` rest · `'` octave up, `,` down (stackable) · `_` halve duration
(`_` = eighth, `__` = sixteenth) · `.` dotted · `-` extend +1 beat · `#`/`b` accidental · `|` bar line.
Distance metric = **semitones (chromatic)**, each interval also named (Perfect 5th / P5 …). Interval stats
are pitch-only; rhythm affects only notation and playback.

## Samples

Chinese folk songs, and melodies inspired by or adapted from them:

- **陕北 (Northern Shaanxi):** 三十里铺 · 山丹丹开花红艳艳 · 兰花花 · 脚夫调
- **江南 (Jiangnan):** 茉莉花 · 紫竹调 · 无锡景 · 牧童短笛 (贺绿汀's piano piece, folk-idiom)
- **陕西 (modern, folk-inspired pop):** 主角 · 西安人的歌
- **山东 (extension):** 沂蒙山小调

The core comparison is the **4 陕北 vs 4 江南** set (multi-theme tunes have their themes combined); 陕西 and
山东 are context/extensions.

## Run locally

Every page works by **double-click** (it falls back to `melodies.js`). To serve the live `melody.txt`
instead, run a local server:

```bash
cd chinese-folk-music
python3 -m http.server 8000
# then open http://localhost:8000/
```

## Deploy to GitHub Pages

1. Push to a public repo (e.g. `chinese-folk-music`).
2. Settings → Pages → Build and deployment → Source: **Deploy from a branch**, branch `main`, folder
   `/ (root)`.
3. Live at `https://<user>.github.io/<repo>/`.

All internal links are **relative** (so the `/<repo>/` subpath works), and an empty **`.nojekyll`** file
tells Pages to serve the files verbatim.

## Notes

- **Audio on iPhone:** the player unlocks iOS Web Audio inside the tap, but iOS only plays synthesized
  audio when the phone is **off silent mode** (a platform limitation).
- A scientific write-up (north–south interval analysis → piano pedagogy) is planned as a later phase.

## Credits
- Reference Jianpu player prototype: <https://yueyvettehao.github.io/2026/06/jianpu-player/>
- © 2026 [Yue Hao](https://github.com/YueYvetteHao). All Rights Reserved.
