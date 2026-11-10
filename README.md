# Hermes Arena

An original Smash-style platform fighter set in the world of the Nous Research Hermes mascot, built to run as a plugin for **Hermes Desktop**. All characters and stages are drawn procedurally in code: no image files ship with the game.

The current direction is **pixel art** (`game/pixel-hermes.html`): four playable fighters (Hermes, Aethon, Kairos, Iris), two stages (Altar of the Agora and the big multi-storey Sanctuary of Kyllene), a CPU opponent, a second player on the same machine or a friend online (room code, direct browser-to-browser connection), full match flow (title, fighter select, 3-2-1-GO, pause, results), synthesized sound and gamepad support. `plugin/` builds it into a Hermes Desktop plugin. An earlier **cyanotype** (blue-ink engraving) engine lives in `cyanotype/`.

## Quick start

Play the current game: open `game/pixel-hermes.html` in a browser. It is one self-contained file (it only pulls fonts from Google Fonts).

```
# or serve it, so gamepads and audio behave like on a real page
npx serve game        # then open http://localhost:3000/pixel-hermes.html
```

Useful URL flags: `?stage=kyllene` picks a stage; `?n=4` (or `n=3`) adds CPUs as players 3 and 4 for a free-for-all (in progress: there is no menu for it yet). Controls are listed on the page under the canvas (keyboard, mouse, controller and touch).

## Repository layout

| Path | What it is |
|---|---|
| `game/pixel-hermes.html` | **The current game.** Single file: rasteriser, all four fighters, moves, CPU, camera, stages, match flow, sound, tuning panel, animation sheet. |
| `stages/` | Stage registry (`stages.js`), the patch that merges it into the game (`apply-stages.cjs`), previews, and parked drop-1 stages (`stages-archive.js`). See `stages/README.md`. |
| `plugin/` | Builds the pixel game into a **Hermes Desktop plugin** (`build.mjs`) and checks it in Chrome (`test.cjs`). The game file is not changed; see `plugin/README.md`. |
| `feel-lab/` | Automated feel testing: drives the real game headless, scores it against Smash-derived targets (`spec.json`), renders GIF/video comparisons. `PROTOCOL.md` is the improvement loop, `LOG.md` the change history, `QUESTIONS.md` open design questions. |
| `art/` | Pixel design studies: front-facing portraits (`front-views/`), Kairos and Iris design code and sheets (`kairos-iris/`), the v26 arm comparison. |
| `cyanotype/` | The earlier modular engine (`src/`), with build script, headless rules/balance tests (`tools/`), cutout puppet skins (`concepts/`), roster doc snapshot (`data/`) and balance reports. Builds the web page, animation book and its own Hermes Desktop plugin (same plugin id as the pixel one). |
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
node lab.cjs                # full score incl. CPU-vs-CPU pacing (30 matches per fighter; --seeds N)
node lab.cjs --quick --ch hermes,aethon,kairos,iris
node lab.cjs --set "FEEL.kbGrowth=1.9"   # try a change in-page without editing
node clips.cjs              # GIFs + contact sheets into feel-lab/out/
node find-seeds.cjs --only cpu_puddle --ch iris   # a seed where a dice-rolling clip scenario shows its move
node clips.cjs --only cpu_cross --ch aethon       # a scenario can name its stage (this one is on Kyllene)
node pvp.cjs                # two-player check: real key events and two stand-in controllers in Chrome
node ffa.cjs                # four-CPU free-for-all check (--n 3, --seeds N)
node net.cjs                # online check: two copies of the page kept in step under lag (--live adds the real room code and WebRTC path)
node video.cjs --before old.html         # side-by-side before/after MP4
```

The scripts default to `../game/pixel-hermes.html`; pass `--html <file>` to test another build, and use the installed Google Chrome when there is one. Last recorded score: 99.3 (v35, also with all four fighters). The lab's yardstick grew twice, so earlier scores in LOG.md are not comparable: since v31 it plays 30 CPU matches per fighter, and since v32 another 10 on the big map, Kyllene (`--big <stage>`), to check that the CPUs find each other there (v31 re-measured: 97.9 with all four).

## Hermes Desktop plugin (pixel game)

```
node plugin/build.mjs                              # writes plugin/dist/hermes-arena/plugin.js
NODE_PATH=$(npm root -g) node plugin/test.cjs      # mount, play, unmount and loader checks in Chrome
```

Copy `plugin/dist/hermes-arena/` to `~/.hermes/desktop-plugins/` and reload desktop plugins (⌘K): the game appears as "Hermes Arena" in the sidebar. Rebuild after every change to the game. The checks use a stand-in for the app shell; the plugin was also installed and played in Hermes Desktop v0.23.0 (2026-11-10). How the wrapper works and the layout decisions: `plugin/README.md`. The plugin format notes are in `docs/PROJECT-NOTES.md` (section `hermes-desktop-plugin-format`).

## Working on the cyanotype engine

```
cd cyanotype
node build.mjs                    # writes dist/ (web page, artifact pages, animation book, plugin)
node tools/rules-test.cjs         # 19 engine rule checks
node tools/balance.cjs out --fighters hermes,hermes   # KO table and frame checks
```

`dist/hermes-arena/plugin.js` is the cyanotype game as a Hermes Desktop plugin. It has the same plugin id as the pixel one (`hermes-arena`), so install only one of them.

## Design documents (Claude artifacts)

- Plan: https://claude.ai/artifact/E7WRuA5kbSXF5rJtiT5jPf
- Roster and move sets (style-agnostic frame data): https://claude.ai/artifact/ArGC6mWVGJoAti2wCLNwsa (snapshot in `cyanotype/data/roster-doc.json`)
- Pixel game, published: https://claude.ai/artifact/GmZRPU455zdtHNYwtFGJaR
- Cyanotype game: https://claude.ai/artifact/TfNWfBse6xt4e5vyVGaEy4 · Animation book: https://claude.ai/artifact/Hgu6FwxoDK4Q62wJpjW6Je
- Krea sprite-sheet test: https://claude.ai/artifact/6hvsszcco9jV96ZjWA47fi

These links are private to the owner's claude.ai account.

## Not in the repo

Generated output is ignored: `cyanotype/dist/`, `plugin/dist/`, `feel-lab/out/`, `feel-lab/videos/` (feel-lab comparison videos, ~200 MB) and the Krea per-frame sprite PNGs. They can all be regenerated from the scripts here.

## Credits

Hermes and the Hermes Desktop app are by Nous Research; the images in `reference/nous-reference/` are their art, kept only as a style reference and not covered by this repo's license. Everything in the game itself is original and drawn in code. Code is under the Apache 2.0 license (`LICENSE`).
