# Hermes Arena stages

Stage drop for the pixel game (`pixel-style/pixel-hermes.html`). The fighters thread owns the game file and publishes; this folder holds the stage code and the patch that wires it in.

- `stages.js`: the stage registry. Each stage has geometry (`solids`, `plats`, `altar`, `camb`, `spawns`) and a `build()` that draws its art layers with the game's own rasteriser. The original Altar is wrapped as `STAGES.altar` and stays the default.
- `apply-stages.cjs`: `node apply-stages.cjs <game.html> [out.html]`. It patches a game build that has no stages yet (38 anchored edits). On a build that already has them, it only swaps in the current `stages.js`. If any anchor is missing, it writes nothing and exits 1.

## Stages (drop 2)

| id | Select name | Shape |
|---|---|---|
| altar | ALTAR | Altar of the Agora (unchanged, default) |
| kyllene | KYLLENE | Sanctuary of Kyllene, a big map: a 3-storey temple in the middle (ground, two gallery floors, roof cornice, golden finial on top), with chasms on both sides crossed by floating stepping stones. The west cliff has a watchtower, a lookout, a column slab and Maia's cave; the east cliff has a herm shrine, a lookout and a column slab; floating ruins sit high above each wing. |

The drop-1 stages (Delphi, Olympus, Styx) were judged too simple and are parked in `stages-archive.js`, which is not loaded.

## Big maps (`big:true`)

- `blocks` are solid rectangles. Each has walls, a ceiling (heads stop on its underside) and a top you stand on; ledges sit at its top corners. They replace `solids`/`altar`, and `main` picks the block that acts as ALTAR (for the lab and willKO).
- `plats` are pass-through floors.
- `respawn`, `zmin` (how far the camera may zoom out), and the camera no longer pulls toward x=208.
- CPU: "off stage" means nothing underneath and home is the nearest ledge. On the ground it doesn't walk off a block with nothing below. It jumps gaps and walls and double-jumps up to a foe on a higher floor (`cpuClimb`). Small stages keep the old CPU rules exactly; the Altar lab score is unchanged (98.4).

## Engine contract

- Every stage is centred on x = 208, because the engine uses 208 as the stage centre (respawn, wall side, CPU).
- `ALTAR` is the main body: walls run from `t+9` down to `b+80`, and the ledges sit at the outer ends of `SOLIDS[0]` and `SOLIDS[last]`. On the new stages, `b` is set so the wall stops just under the visible stage, which lets fighters recover from below.
- `PLATS` is a plain array that `loadStage()` replaces. A platform with `move:{T,ax,ay,ph}` sways, and fighters standing on it ride along (`stageStep`, called in `step()` after hitlag). Temporary platforms pushed at runtime (Iris) are left alone.
- Layers: `STAGE.L.back` is drawn before the fighters and `STAGE.L.front` after them (water, cloud sea). Each layer is `{par, cv,x,y,w,h}` or `{par, draw(g,tSeconds)}`, with an optional `alpha`.
- Stage art adds palette ramps with `addMat()`, which appends them, so fighter colours never shift.
- Select screen: a STAGE row (row 5) with FIGHT! on row 6. `MS.stage` is saved with the match settings, and `?stage=id` overrides it. The countdown shows the stage's full name.

## Feel lab

Run a stage with `node lab.cjs --html <game.html> --set "loadStage('delphi'); resetFighters();"`. Many movement probes are measured against the Altar (platform heights are read when the probes load, and cross/recovery are relative to the stage width), so compare match pacing, self-destructs, stuck states and page errors across stages, not those ratios.
