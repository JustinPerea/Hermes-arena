# Hermes Arena

An original Smash-style platform fighter set in the world of the Nous Research Hermes mascot, built to run as a plugin for **Hermes Desktop**. All characters and stages are drawn procedurally in code: no image files ship with the game.

The current direction is **pixel art** (`game/pixel-hermes.html`): four playable fighters (Hermes, Aethon, Kairos, Iris), two stages (Altar of the Agora and the big multi-storey Sanctuary of Kyllene), a CPU opponent, full match flow (title, fighter select, 3-2-1-GO, pause, results), synthesized sound and gamepad support. An earlier **cyanotype** (blue-ink engraving) engine lives in `cyanotype/` and is the one that currently builds the Hermes Desktop plugin.

## Quick start

Play the current game: open `game/pixel-hermes.html` in a browser. It is one self-contained file (it only pulls fonts from Google Fonts).

```
# or serve it, so gamepads and audio behave like on a real page
npx serve game        # then open http://localhost:3000/pixel-hermes.html
```

Useful URL flags: `?stage=kyllene` picks a stage. Controls are listed on the page under the canvas (keyboard, mouse, controller and touch).

## Repository layout

| Path | What it is |
|---|---|
| `game/pixel-hermes.html` | **The current game.** Single file: rasteriser, all four fighters, moves, CPU, camera, stages, match flow, sound, tuning panel, animation sheet. |
| `stages/` | Stage registry (`stages.js`), the patch that merges it into the game (`apply-stages.cjs`), previews, and parked drop-1 stages (`stages-archive.js`). See `stages/README.md`. |
| `feel-lab/` | Automated feel testing: drives the real game headless, scores it against Smash-derived targets (`spec.json`), renders GIF/video comparisons. `PROTOCOL.md` is the improvement loop, `LOG.md` the change history, `QUESTIONS.md` open design questions. |
| `art/` | Pixel design studies: front-facing portraits (`front-views/`), Kairos and Iris design code and sheets (`kairos-iris/`), the v26 arm comparison. |
| `cyanotype/` | The earlier modular engine (`src/`), with build script, headless rules/balance tests (`tools/`), cutout puppet skins (`concepts/`), roster doc snapshot (`data/`) and balance reports. Builds the web page, animation book and the **Hermes Desktop plugin**. |
| `reference/` | Visual references: GPT Image mockups Justin made, Nous Hermes reference art (`nous-reference/`), and the Krea sprite-sheet test page. |
| `docs/PROJECT-NOTES.md` | Decision history and working notes: what was decided, why, and how to apply it. Read this before changing direction. |

## Working on the pixel game

Stages: edit `stages/stages.js`, then merge it into the game:

```
node stages/apply-stages.cjs game/pixel-hermes.html
```

The patch is idempotent: on a game that already has stages it only swaps in the current registry.

Feel lab (needs Node, Playwright with Chromium, ffmpeg, and ImageMagick 6 for clips):

```
cd feel-lab
npm i playwright            # if not installed globally
node lab.cjs --quick        # ~10 s score, no CPU matches
node lab.cjs                # full score incl. CPU-vs-CPU pacing
node lab.cjs --quick --ch hermes,aethon,kairos,iris
node lab.cjs --set "FEEL.kbGrowth=1.9"   # try a change in-page without editing
node clips.cjs              # GIFs + contact sheets into feel-lab/out/
node video.cjs --before old.html         # side-by-side before/after MP4
```

The scripts default to `../game/pixel-hermes.html`; pass `--html <file>` to test another build. Last recorded score: 98.4 (v28).

## Working on the cyanotype engine / plugin

```
cd cyanotype
node build.mjs                    # writes dist/ (web page, artifact pages, animation book, plugin)
node tools/rules-test.cjs         # 19 engine rule checks
node tools/balance.cjs out --fighters hermes,hermes   # KO table and frame checks
```

`dist/hermes-arena/plugin.js` is the Hermes Desktop plugin: copy the `hermes-arena` folder to `~/.hermes/desktop-plugins/` and reload desktop plugins (⌘K). The plugin format notes are in `docs/PROJECT-NOTES.md` (section `hermes-desktop-plugin-format`).

Porting the pixel game into the plugin shell is not done yet; it is the natural next step for shipping.

## Design documents (Claude artifacts)

- Plan: https://claude.ai/artifact/E7WRuA5kbSXF5rJtiT5jPf
- Roster and move sets (style-agnostic frame data): https://claude.ai/artifact/ArGC6mWVGJoAti2wCLNwsa (snapshot in `cyanotype/data/roster-doc.json`)
- Pixel game, published: https://claude.ai/artifact/GmZRPU455zdtHNYwtFGJaR
- Cyanotype game: https://claude.ai/artifact/TfNWfBse6xt4e5vyVGaEy4 · Animation book: https://claude.ai/artifact/Hgu6FwxoDK4Q62wJpjW6Je
- Krea sprite-sheet test: https://claude.ai/artifact/6hvsszcco9jV96ZjWA47fi

These links are private to the owner's claude.ai account.

## Not in the repo

Generated output is ignored: `cyanotype/dist/`, `feel-lab/out/`, `feel-lab/videos/` (feel-lab comparison videos, ~200 MB) and the Krea per-frame sprite PNGs. They can all be regenerated from the scripts here.

## Credits

Hermes and the Hermes Desktop app are by Nous Research; the images in `reference/nous-reference/` are their art, kept only as a style reference and not covered by this repo's license. Everything in the game itself is original and drawn in code. Code is under the Apache 2.0 license (`LICENSE`).
