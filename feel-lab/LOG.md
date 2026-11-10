# Feel lab log

Newest round at the bottom. Every accepted change: version, what, why, score before → after, metrics moved, side effects.

## Justin's decisions (do not undo without asking him)

- Gameplay feel is the top priority (2026-11-09). Smash Ultimate is the reference for how it should feel.
- Fluid chaining: presses must never be dropped (10-frame buffer), jab is three presses, moves have cancel windows (v13).
- Rapid jab, back air, dash attack, shield/dodges/grab/throws, ledges, tech, parry, DI, SDI, hitlag, KO slow-mo all stay (v14–v17).
- Controls: Shift shield, Q grab (or shield + attack), jump + attack = short-hop aerial.
- The Tuning panel sliders are Justin's; the lab keeps them at 1 and changes the defaults underneath (`FEEL`).

## v17 → v18 (2026-11-09, round 1, by the lab's author)

Baseline v17: **75.5** (37 pass / 6 warn / 10 fail). After: **93.4** (48 / 3 / 2).

| Change | Why (metric) |
|---|---|
| New `FEEL` constants block; engine reads it live | Lets the lab test changes with `--set` |
| KO slow-mo starts after hitlag (new `simDt`) | Clip review: the 16 f hitlag ran at quarter speed, a 1 s freeze before every KO launch |
| `FEEL.shortHop` 262 → 300 | hop_ratio 0.36 → 0.51 (short hop was barely a hop) |
| `FEEL.stunK` 0.0032 → 0.0024 | Hitstun was ~3× Smash's; launched fighters could not act before falling off the bottom: fsmash KO'd at 60% from centre, back throw at 84%, dtilt chained 5× |
| `FEEL.launchRiseG` 1 → 0.4 | Gravity ate vertical launches: up smash needed 250%+ to KO |
| `FEEL.kbGrowth` 1.55 → 1.8 | After the above, real matches KO'd late (Aethon 169%, 1 in 3 mirror matches timed out) |
| Down throw total 40 → 32 (Hermes), 40 → 30 (Aethon) | dthrow_adv20 was 4 / −3 frames; now 12 / 7, a real combo starter |
| Hermes back throw kb 7 → 6.5 | bthrow_ko dropped to 118% with the new growth; now in band |

Metrics now: fsmash KO 121% (Hermes) / 121% (Aethon), up smash 148 / 129, back throw ~138 / 162, average KO in CPU matches ~130 / 150, no timeouts, short hop 33 f.
Still failing: frame data band (moves far safer on shield than Smash; see QUESTIONS.md Q1). Warns: up tilt never true-combos into itself at 0%, Aethon down throw +7.

Open clip finding for round 2: in `ko_smash`, the victim is invisible during the KO hitlag (f24–f38): its white hit flash merges with the white gust burst of forward smash.

## v18 → v19 (2026-11-09, round 2, subagent)

Problem: the open clip finding. In `ko_smash`, the KO victim was invisible during the KO hit's hitlag (Hermes f24–f38, Aethon f28–f42), and in fact all the way to about f64–f68: it showed as a flat white blob.
Hypothesis (confirmed in code): `drawFighter` replaced the whole sprite with `whiteOf(...)`, a solid pure-white silhouette, whenever `F.flash>0.04`. It has no outline or interior, so on the pale stage, under the white KO screen flash and the attacker's pale smear/gust it has no contrast. The puffs are already drawn behind both fighters, so draw order was not the cause. Because `F.flash` counts down in sim time, the KO slow-mo stretches the flash to about 40 game frames.

| Change | Why |
|---|---|
| `drawFighter`: draw the normal sprite, then `whiteOf(sprite)` at 45 % alpha on top (it was a solid white silhouette instead of the sprite) | The victim keeps its outline, colours and pose while it still flashes white |

Code (pixel-hermes.html, `drawFighter`):
```
  drawBody(F, hf.f, jit, hf.flip, false, hf.rot);
  // hit flash: a white wash over the sprite, not a solid silhouette, so the victim keeps its outline against white bursts
  if (F.flash>0.04){ const a0=sg.globalAlpha; sg.globalAlpha=a0*0.45; drawBody(F,whiteOf(hf.f),jit,hf.flip,true,hf.rot); sg.globalAlpha=a0; }
```
Tried and dropped: a 60 % wash (Hermes's victim too faint under the attacker's smear). Also drawing the flashing victim in front of the attacker: the victim read better, but it hid the attacker's weapon at the point of contact, which hurt the hit read.

Score: 93.4 → **93.4** (48 / 3 / 2). Page errors, NaN frames and stuck counts all stay 0. No metric moved, since this is a render-only change.

Clip review, ko_smash (by the agent who made the change, not a fresh reviewer):
```
before
ko_smash-hermes: anticipation 4, impact 2, readability 2, launch 3, flow 4, camera 4
- impact/readability f24-f38: victim is a flat white silhouette inside the white gust/smear; cannot tell pose or facing
- launch f40-f64: victim still a white blob through the KO slow-mo; it only becomes the sprite at f66
ko_smash-aethon: anticipation 4, impact 2, readability 2, launch 3, flow 4, camera 4
- impact/readability f28-f42: same; victim is a white blob, except its spear tip
- launch f44-f68: still a white blob while it rises; sprite from f70
after
ko_smash-hermes: anticipation 4, impact 4, readability 3, launch 4, flow 4, camera 4
- f24-f38: victim visible (gold/blue, wings, staff), washed pale; partly under the attacker's blue smear arc, so it is still the faintest thing in frame
- f48-f64: victim's pose readable as it rises
ko_smash-aethon: anticipation 4, impact 4, readability 4, launch 4, flow 4, camera 4
- f28-f42: victim's red crest, shield and wings visible in every tile; attacker's spear reads on top
Top fix (next round): the flash runs ~40 game frames on a KO because F.flash counts down in slow-mo sim time
(fighterStep line `F.flash=Math.max(0,F.flash-dt)`); count it down in real time or cap it after hitlag, so it reads as a flash, not a wash.
```
Other scenarios (sheet 1 of each, both fighters): jab_chain, shorthop_aerials, dthrow_followup, shield_hits and cpu_exchange are no worse. Victims in hitlag now show a washed version of their sprite instead of a white silhouette (most visible in shorthop_aerials f16–f30).
Backup: `$SCRATCH/pixel-hermes-v19-backup-pre.html`. Not shipped (the caller publishes).

## v19 → v20 (2026-11-09, round 3, Justin chose "Smash-like (punishable)" for Q1)

Score 93.4 → **96.2** (49 / 4 / 0). No fails left.

| Change | Why |
|---|---|
| Grounded moves cancel at `iasa` only after a clean hit (`M.connected`, new `cancelF`); shielded or whiffed they play to `total` | Q1: tilts were −3 to +1 on shield, smashes −6 to −11. Now Hermes ftilt −22, utilt −14, dtilt −8, smashes −16 to −24 (Smash bands). Combos on hit unchanged |
| Cancel check fires on the frame the move would end (`f+dt*60 >= cancelF`) | Buffered presses waited 1–2 dead frames after every move (buffer_delay 2 → 0) |
| Aethon bair and uair landing lag 9/10 → 13 | Both were +2 on shield (aerials must be ≤ 0) |
| Frame readout (`noteAdv`) uses the same rule | The in-game advantage number matches the lab |

New scenario `shield_punish`: blocked ftilt, defender jumps out of shield into nair. v17: attacker shields in time (no damage). v20: attacker is hit (12%).
Still warn: Aethon frame-data band 77% (fsmash startup 21, fair 14, dair 19 are slow heavy moves by design), up tilt never true-combos into itself at 0%, Aethon down throw +7.
Side effect to watch: whiffed tilts are now committal (Hermes ftilt whiff ends at frame 40).

## v20 → v21 (2026-11-09, rounds 4-6, by Claude at Justin's request: "do the routine's work now")

New probes (spec group `air`): air_speed_ratio, air_turn_f, air_stop_f, recovery_h, recovery_v. Chain bot fixed: it only pressed when idle, so it never used the buffer; a real player re-presses during the move. With the fix, up tilt chained 6× and down tilt 5× at 0% (the old "1" was a probe bug).
Score on the new spec: v20 **86.5** → v21 **97.6** (61 / 1 / 1).

| Change | Why (metric) |
|---|---|
| New FEEL.airSpeed 0.68, airAccel 480, airFric 150 px/s² (air drift was 100% of run speed with no friction) | air_speed_ratio 1 → 0.68, air_stop_f never → 25 f, Hermes self-destructs 0.15 → 0 |
| Hermes up special rise f6-30 at −430 → f6-22 at −300 | It rose ~330 px (6 body heights); Hermes recovered from the blast line (recovery_h 1.14 → 0.87) |
| Aethon up special beat drift 110 → 85 (`beatDrift`) | Steering during wingbeats was faster than air speed |
| `FEEL.stunBase` 0.15 → 0.1 | Low-% hits had too much hitstun: utilt/dtilt chained 5-6× at 0% |
| Hermes utilt cancel on hit 17 → 19, dtilt 12 → 14 (new `iasaHit` override) | utilt chain 6 → 4 (Smash 2-4) |
| Aethon down throw total 30 → 25 | dthrow_adv20 7 → 9 after the lower hitstun base |
| Hit flash counts down in real time (`simK`) | KO flash lasted ~40 game frames in slow motion |
| Hooks for later tuning: `CHARS.<ch>.dJump`, `glideMax`, `uspec.beatV` | |

Regression caught by the lab mid-round: a code comment cut off the respawn-invincibility countdown, so every CPU match timed out with 2 KOs. Found by bisecting with the lab, fixed before shipping.
Still failing: Aethon recovery_h 1.14 (3 jumps + 2 s glide reach back from the blast line). See QUESTIONS.md Q3. Warn: Aethon frame-data band 77% (slow heavy startups).
Video: videos/v20-vs-v21.mp4.

## v21 → v22 (2026-11-09, round 7, Justin chose "Shorten glide to ~1 s" for Q3)

Score 97.6 → **98.4** (61 / 2 / 0). No fails.

| Change | Why |
|---|---|
| Aethon glide 2 s → 1 s (`glideMax`) | Q3. Alone it barely moved recovery (1.144 → 1.144): his height from 2 air jumps + wingbeats was the real source of airtime |
| Aethon air speed 0.68 → 0.6 of run (`CHARS.aethon.airSpeed`), double jump 300 → 240 (`dJump`), wingbeats 250 → 180 (`beatV`), wingbeat drift 85 → 65 | Heavies drift slower and jump lower (Smash: Bowser/Ganon). recovery_h 1.144 → 1.039: he now falls short from about 235 px out instead of reaching back from the blast line (256) |
| Help text: glide "up to 1 second" | |

Tried: dJump 250 / beatV 190 → Aethon self-destructs rose to 14% in CPU matches (rejected).
Still warn: Aethon recovery 1.04 (band 0.55–0.9; going lower needs cuts to his 3 jumps, which is his identity), Aethon frame-data band 77%.
Video: videos/v21-vs-v22.mp4 (from 245 px out: v21 makes it back, v22 falls short).


## v22 → v23 (2026-11-09, sound and gamepad; no feel changes)

Score 98.4 → **98.4** (61 / 2 / 0). Regression scripts (parity, small, combo, moves3, cpu3) unchanged.

| Change | Notes |
|---|---|
| Sound effects, synthesized in code (Web Audio, no files): hit (scales with damage), KO, blast-line burst, shield hit, shield break, parry, swing (lighter for tilts, heavier for smashes), jump, double jump, landing, dodge, grab, throw, tech, knockdown thud, ledge grab, respawn | Per-sound level trims `SLEVEL` and master trim `SBOOST` sit before a compressor. Chrome's compressor adds make-up gain, so measure levels in steady state (a sound at t=1 s, not t=0): hits 0.42–0.68 peak, KO 0.72, movement 0.06–0.15 |
| `M` mutes; volume slider in Tuning; saved in localStorage `pxh-sfx` | Sound starts on the first key or click (browser rule) |
| Gamepad (standard mapping): left stick / d-pad move, A attack, B special, X/Y jump, LB/RB grab, LT/RT shield, right stick = smash on the ground (hold to charge) or aerial in the air | `padPoll()` inside `playerInput()`; the right-stick flick is buffered with its own direction (`F.buf.c`). Tap jump is off (stick up = up tilt / up special) |
| Lab: `clips.cjs` logs sound events per clip (`_frames/<clip>/events.json`); `video.cjs` renders them offline with the game's own `sfxRender` and muxes them in | Only the After build's sound is used (the Before side may predate sound) |

Video: videos/v22-vs-v23-sound.mp4 (same gameplay; left silent, right with sound).

## v23 → v24 (2026-11-09, match flow; no feel changes)

Score 98.4 → **98.4**. Regression scripts unchanged (they call `selectChar`, kept for them).

| Change | Notes |
|---|---|
| Title screen with a CPU Hard vs CPU Hard demo behind it | `flowFrame()` in the game loop runs the screens; `simIn` tells `step()` to drive P1 with the CPU (demo) or lock inputs (countdown). The lab calls `step()` directly with `simIn` null, so probes are unaffected |
| Fighter select in the canvas: both fighters (mirror allowed, second one recoloured by swapping red/blue), CPU Easy/Normal/Hard or Dummy, stocks 1-5, time limit none/2/3/5/8 min; saved in localStorage `pxh-match` | Replaces the HTML pickers above the stage |
| 3-2-1-GO countdown, timer, pause menu (Enter/P/Esc, controller Start; Resume/Restart/Fighter select/Title), GAME! and TIME! banners | Stock tie at time-up goes to sudden death: 1 stock each at 300% |
| Results: winner, KOs, falls, self KOs, damage dealt/taken, best combo, match time; Rematch / Fighters / Title | KO credit goes to the last hitter within 8 s, otherwise a self KO. Combo = hits landed while the foe is still in hitstun |
| Menus work with keyboard, controller, touch buttons (new Pause button) and mouse clicks | |

Video: videos/v24-match-flow.mp4 (walkthrough from the real loop, with sound; `flowvid.cjs`; fights start at 105% to keep it short).

## v24 → v25 (2026-11-09, front-facing art; no feel changes)

Front views of Hermes and Aethon (`drawHermesFront`, `drawAethonFront`, 128x116 on the same pixel grid, drawn unscaled) for fighter select, the winner screen and the HUD portraits. First pass at sprite size scaled 1.3x was rejected as "weird"; second pass follows the front view in gpt-mockups/masked-sheet.png. Quick lab 98, no page errors.

## v26 (2026-11-09) arms redrawn for all fighters
Justin: arms, elbows, shoulders and hands looked like puppets. New drawLimb(): the whole arm is one rasterised part (one outline, no ball joints), with a deltoid/biceps swell, a forearm that tapers to the wrist, an elbow point when bent, and a squared fist with finger creases and a wrapped thumb. Limbs are cel-shaded (lit side, mid, shadow, highlight band) instead of dithered sphere shading; materials meet with a soft seam. Front views use the same limb via frontKit's A(). Kairos and Iris art functions are in the file but not playable yet. Lab --quick 98, unchanged. Stage drop 1 applied cleanly but was backed out at the stages thread's request (revised drop coming). Video: videos/v25-vs-v26-arms.mp4.

## v27 (2026-11-09) Kyllene stage merged
- Applied stage drop 2 (apply-stages.cjs, 38 edits) on top of v26 + the unfinished Kairos/Iris integration.
- Published copy lists only Hermes and Aethon in fighter select (Kairos/Iris specials not built yet).
- Lab quick: 98 on the Altar (same two Aethon warns). Video: videos/v27-kyllene.mp4.

## v28 (2026-11-09) Kairos and Iris playable
- Both in fighter select. Specials built: Hour Bolt (hold to charge, shield to store), Orrery Ring (boomerang), Stepped Moment (8-way warp, slides along walls, steps up onto the stage lip), Stilled Instant (half-speed field, 4 s cooldown); Prism Shards (air stall once per jump), Rainbow Arc (bendable, aerial cancel from f20), Bridge of Heaven (3 s rainbow platform, vanishes when the foe stands on it), Styx Pour (trip puddle on the ground, spiking stream in the air).
- Effects: meridian/zenith/equinox/fountain/raindrop/sandfall/recoil vfx, dial, orbit rings, sand, splash, rainbow trails.
- Engine: specHeld input (K/L/C or right mouse), slow-field dt scaling for fighters and shots, temp platforms, piercing shots. Fixed: rise up-specials did nothing from the ground (Hermes too). Kairos tether grab now reaches close foes. Design notes hidden per fighter.
- Tuning: Kairos run .97 air .72 grav .84 fall 278 weight .92; Iris air .78 fall 280 dJump 296; smash KO power trimmed; Kairos dair hovers.
- Lab (lab.cjs now takes --ch): quick 98.5 for all four; full with matches 98.4. Video: videos/v28-kairos-iris.mp4.

## v29 (2026-11-10) Stage drop 3: clearer floors
- apply-stages.cjs refreshed the stage block (Kyllene: pale wash behind scenery, cream/gold standable edges, solid vs dashed undersides).
- Iris's Bridge of Heaven now draws the same edge marker (ink outline, #fff8e2 top, gold band, dashed ink underside) over its rainbow.
- Lab quick 98.5 (all four). Video: videos/v29-floors.mp4.

## v30 (2026-11-10) CPUs use down specials; two rule and CPU fixes found on the way

Lab: quick 98.5 (all four), full 98.4 (Hermes, Aethon), full 98.8 (all four): the same as v29 on each run. The lab now launches the installed Google Chrome (`launch()` in page.cjs); numbers are identical to Playwright's Chromium.

| Change | Notes |
|---|---|
| `CPU_LV[level].dspec` (0.1 / 0.45 / 0.8): how often a level takes a down-special chance. `cpuDown`, `cpuCounter`, `cpuTrap` sit just above `cpuInput` | The CPU reads what the move does (counter, stomp, field, pour), not the fighter's name |
| Hermes, Psychopomp Guard: answers a melee hit that will land inside the stance window and whose hitbox will reach him. Smashes (can be charged past the stance) and tilts that may still become a smash are countered less often. Ground only | 1.7 uses a match per fighter, 86% land |
| Aethon, Phalanx Stomp: shockwave when the foe stands 30-96 px away on the same solid floor; plunge when the foe is below and there is floor under him with 14 px to spare each side. Neither once the foe is past 110% (it chips, it does not kill) | 5.4 uses a match |
| Kairos, Stilled Instant: on a foe who cannot move (knocked down, dazed, long hitstun), or from the ground when the foe will run into the far half of the field. Afterwards he steps out of his own field and shoots or pokes in instead of walking back in | 0.5-1 use a match. See QUESTIONS.md Q4: the move gives its user no edge |
| Iris, Styx Pour: a puddle on solid floor when the foe is 44-170 px away and has to come back along it (then she waits behind it, shooting); the stream when the foe is below her and the fall time lines up | 7.4 uses a match, about half land |
| Rule: a grounded attack, grab or roll no longer carries its fighter off an edge (specials still can). In `physics()` | Found from Aethon's self-destructs: a smash hitting a shield at the stage lip pushed him off backwards mid-move, and he fell for the rest of it. Smash does not let this happen. See QUESTIONS.md Q5 |
| CPU recovery: the side special is used on the way back only if it carries the fighter (dash or arc) | Kairos's is the thrown Orrery Ring; he was throwing rings while falling |

Measured with CPU Hard mirror matches (scratch scripts, not in the repo: 100 seeds each; the lab's own 6 seeds are too few to tell 0.07 from 0.14 self-destructs):

| | v29 | v30 |
|---|---|---|
| Self-destructs per stock: Hermes / Aethon / Kairos / Iris | 0.02 / 0.10 / 0.10 / 0.02 | 0.002 / 0.04 / 0.01 / 0.002 |
| KO % (Aethon) | 145 | 152 (fewer low-percent self-destructs, plus stomp damage) |
| Seconds per stock | 29-33 | 31-33 |

Down specials on for one side only, 200 matches per fighter on the Altar: Hermes 105-95, Aethon 125-75, Kairos 101-99, Iris 118-82. Same on Kyllene, Normal and Easy: no stuck states, no page errors.

Tried and dropped: an air counter for Hermes (whiffed half the time), a counter "read" on a foe dropping in (13% landed), Kairos casting whenever the foe was in range (cost him about 0.2 stocks a match on Kyllene).

Also seen, not fixed: the KO slow motion can fire on a hit that does not KO (Iris down smash on a tripped foe at 45%: `willKO` ignores the side platforms).

Clips: `cpu_counter`, `cpu_stomp`, `cpu_plunge`, `cpu_field`, `cpu_puddle`, `cpu_stream` in scenarios.js (the header there lists which fighter to pass). `find-seeds.cjs` finds a seed where a dice-rolling scenario shows its move. Played in the real page too (Chrome, real loop and key events, 90 s against each CPU fighter): steady 60 fps, no errors.

## v31 (2026-11-10) Kairos immune to his own field; KO slow motion only on real KOs; lab measures both

The lab changed in this version, so scores are not comparable with earlier entries: it now plays 30 CPU matches per fighter instead of 6 and scores two new metrics. Re-measured with the new lab: **v29 95.5 (2 fails) to v31 98.5** (Hermes, Aethon); with all four fighters 95.9 (4 fails) to 98.9. With the old lab v31 reads the same as v30 (quick 98.5, full 98.4 and 98.8).

| Change | Notes |
|---|---|
| Kairos is not slowed by his own Stilled Instant (Justin, Q4). `slowOf()`; help text and move description updated | Projectiles, his own included, still slow down inside it |
| CPU Kairos casts it only on a foe who cannot answer within the 16 frames it takes to open: knocked down, dazed, launched out of arm's reach, or stuck in the tail of a whiffed move, and who will still be inside when it opens. The "step out of your own field" stance is gone | Per cast, over the next 3 s: 10.4% dealt, 2.1% taken, hit out of the cast 4% of the time. Before this rule (casting on a free foe in range): 6.3 dealt, 9.7 taken, hit out of it 62% of the time |
| CPU shield timer runs on the attacker's clock | A hit thrown from inside a slow field arrives late; the CPU used to drop shield before it landed |
| `willKO()` follows the launch for the victim's hitstun plus `FEEL.koLook` (10) frames and stops at any platform, instead of 150 frames of free flight | The slow motion and zoom fired on 63% of strong hits on the Altar where the victim then recovered (45% on Kyllene). Now 6% and 1%; KOs that get no slow motion stay at 1%. Sweep: koLook 0 gives 0% false and 7% missed; 20 gives 12% and 1% |
| Lab: `kofx_false` and `kofx_missed` in spec.json (pacing), measured in the CPU matches | v29 fails `kofx_false` for every fighter (0.57 to 0.71) |
| Lab: 30 seeds by default (`--seeds`) | With 6, self-destructs and KO % flipped between pass and warn on dice alone. Still about 7 s |

Still even in one-sided tests (Kairos with the field against Kairos without, 400 matches): 205-195 on the Altar. At about 0.6 casts a match the move is safe now, not strong. The cast length (40 frames) is unchanged; Q4 has the numbers for 28.

Clip: `cpu_field` now shows the field dropped on a whiffed smash.
