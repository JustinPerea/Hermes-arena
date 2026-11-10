# Feel lab: the autonomous loop

This is the procedure for any Claude (main thread or subagent) improving how Hermes Arena *feels* while Justin is away.
The game is one file: `game/pixel-hermes.html` in this repo (published at https://claude.ai/artifact/GmZRPU455zdtHNYwtFGJaR).

## Tools

| Command | What it does | Time |
|---|---|---|
| `node lab.cjs --quick` | Movement, combat and frame-data probes for both fighters, scored against `spec.json` | ~7 s |
| `node lab.cjs` | Same plus 30 seeded CPU Hard mirror matches per fighter (pacing, KO slow-motion accuracy, stability) | ~10 s |
| `node lab.cjs --set "FEEL.stunK=0.002"` | Run with a change applied in the page, without editing the game | |
| `node sweep.cjs [--full] --try "A" --try "B"` | Compare candidates to the current game, metric by metric | ~10 s each |
| `node clips.cjs [--only name] [--ch both] [--set ...]` | GIFs + labelled contact sheets of scenarios in `scenarios.js` | ~8 s each |
| `node video.cjs --before old.html --lb 'Before (vNN)' --la 'After (vMM)'` | Side-by-side MP4 of scenarios, old vs new, with title cards and the After build's sound (for Justin) | ~2 min |

Reports: `out/report.md` (scorecard, per-move frame data table, match logs), `out/report.json`, `history.jsonl` (every run).
Clips: `out/clips/<scenario>-<fighter>.gif` and `-sheet-N.png` (read the PNGs to look at them).

Knobs that `--set` can reach without code edits:
- `FEEL.*` (jump speeds, hitstun, launch gravity, knockback base/growth, DI, KO slow motion)
- `TUNE.*` (the player's Tuning sliders; leave at 1, they are for Justin)
- `CHARS.<ch>.{weight,fall,dash,crawl,stunG,jumps}`
- `CHARS.<ch>.anims.<move>.{total,iasa,landLag,ac,hits[i].{f,dmg,kb,ang,dx,dy,r},throw.{f,dmg,kb,ang}}`
- `CPU_LV[level].*`

## One round

1. **Measure.** `node lab.cjs --label "round N start"`. Read `out/report.md`.
2. **Pick one problem.** Take the worst FAIL (or a clip-review finding, see REVIEW.md). Write a one-line hypothesis of its cause before touching anything.
3. **Try candidates with sweep, not edits.** (Render-only changes, e.g. drawing code, cannot be measured by the lab: edit a backed-up copy, then compare clips. `--set` can also replace a whole function, e.g. `--set "drawFighter=function(...){...}"`, for logic changes.) `node sweep.cjs --full --try "..." --try "..."`. Prefer the smallest change that fixes it: one constant, one move's frame data. Check what else it moved.
4. **Accept rule.** A change is accepted only if:
   - the full-lab score goes up (or stays equal while fixing a clip finding),
   - no metric drops from pass to fail, page_errors / nan_frames / stuck stay 0,
   - it does not undo something Justin asked for (see LOG.md "Justin's decisions").
   Otherwise try another candidate or log it as a dead end.
5. **Bake it in.** Edit the default in the game file (`FEEL` block near the top of the engine, the move's data in `ANIMS`/`AANIMS`, or the `G` throw table). Back up first: `cp pixel-hermes.html $SCRATCH/pixel-hermes-vNN-backup-pre.html` (NN = the version you are about to make).
6. **Verify.** `node lab.cjs --label "vNN: what changed"` must reproduce the sweep result. If visuals or timing changed, render clips before and after into separate folders (`node clips.cjs --out out/clips-before` on the backup via `--html`, then `--out out/clips-after`) and review them (REVIEW.md). The review should come from a fresh subagent given only the two folders and REVIEW.md, not the hypothesis; if you score your own change, say so in LOG.md.
7. **Log.** Append to `LOG.md`: version, change, why, score before/after, metrics moved, anything that got worse.
8. **Ship.** Commit the game and the lab changes (and republish the artifact if you use one). Ship at most once per round.

## Limits (do not do these without Justin)

- No new moves, no control or button changes, no art redesign, no new characters or stages.
- Do not change a spec band to make a metric pass. If a band looks wrong, write why in QUESTIONS.md and leave it.
- Do not change something listed under "Justin's decisions" in LOG.md.
- A trade-off that changes how the game plays at a high level (e.g. how safe attacks are on shield) goes to QUESTIONS.md with a recommendation, unless Justin already answered it.
- Keep each round small: one problem, one to three constants. Stop after 3 rounds with no score gain and write what you tried.

## Adding a probe or scenario

- A measurable feel claim → add a function in `probes.js`, return its metric from `LAB.movement/combat`, add the band to `spec.json` with `why` and `source`. Run the lab to check the probe on the current game before trusting it (a wrong probe is worse than none).
- A visual moment → add an entry to `scenarios.js` (`setup`, `input(i)`, `frames`, optional `dummy(i)` input for the other fighter, `cpu:true` for CPU vs CPU).
