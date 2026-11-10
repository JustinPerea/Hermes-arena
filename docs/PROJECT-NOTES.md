# Project notes and decision history

Working notes carried over from the Claude project where Hermes Arena was built (Nov 2026). They record what Justin decided and why, so the work can continue without re-asking. Paths like `/mnt/project-files/hermes-arena/...` or `/home/claude/...` refer to that old workspace; see the README for where each thing lives in this repo.

## hermes-arena-plan

_Status and agreed approach for the Hermes Arena platform-fighter plugin; Justin wants to plan before any building_


Hermes Arena = original Smash-like platform fighter as a Hermes Desktop plugin, in the blue-ink engraving style of Justin's reference (winged hoplite vs hooded mage on a carved marble altar, armillary sphere, Greek architecture).

2026-11-09: Justin asked to plan together before any prototype is built. Plan doc: https://claude.ai/artifact/E7WRuA5kbSXF5rJtiT5jPf (proposes procedural canvas art, roster Aethon/Kairos/Iris, 4 milestones starting with an art test, open questions on art method, roster, scope, online, repo, Hermes version, music).

2026-11-09 decisions from Justin: up to 4 players eventually, MVP is 1v1 (engine built for 4 from day one); characters AND stages fully procedural in code; roster = Hermes (the god: petasos, talaria, caduceus) + Aethon + Kairos + Iris (redesigned as rainbow herald to avoid overlap with Hermes). Still open: GitHub repo, Hermes Desktop version/OS, online play, music.

**Why:** Justin wants to understand and steer the approach first.
**How to apply:** Don't start building until Justin agrees to the plan; check the doc's open questions for his answers. No GitHub repo attached yet. See [[hermes-desktop-plugin-format]].

### Milestone 1 status (2026-11-09)
- Art test done and published: https://claude.ai/artifact/9eE5iNfioYsxWybwweYT9e (built from dist/artifact/hermes-arena.html by build.mjs).
- Builds and source copied to /mnt/project-files/hermes-arena/ (web html, plugin/hermes-arena/plugin.js, source/). The container copy in /home/claude/hermes-arena is ephemeral; no git repo yet.
- Next: milestone 2 (Hermes vs Aethon core fight) waits on Justin's go-ahead.

### Hermes animations (2026-11-09)
- 83 Hermes animations done (11 groups, src/anims/hermes-*.js), reviewed and wired into the game (src/fighter.js state machine; hits, grabs, throws, ledges, KO against a dummy).
- Animation book: https://claude.ai/artifact/Hgu6FwxoDK4Q62wJpjW6Je ; game: https://claude.ai/artifact/9eE5iNfioYsxWybwweYT9e
- Copies in /mnt/project-files/hermes-arena/ (source/ has everything; the container is ephemeral).
- Known polish backlog from reviewers: figure.js lacks cloak direction/length, separate hat-wing, eyelid/expression, head look-back, foot pitch, whole-figure scale, ghost draw mode; ledge_roll and getup_roll graded C.

## hermes-arena-roster

_Where the Hermes Arena roster/move-set design doc lives and the archetypes and stat budget it settled on_


2026-11-09: Roster doc (art-style-agnostic, reused across pixel/cyanotype/other versions): "Hermes Arena: roster and move sets" https://claude.ai/artifact/ArGC6mWVGJoAti2wCLNwsa (a Claude Doc). A blank duplicate outline https://claude.ai/artifact/CYJ9A9tvKctVEmXkcBUVKr was made by mistake; ignore it.

Contents: 18-point budget over 6 axes (ground speed, air mobility, endurance, range, recovery, kill power); engine physics values per fighter in FIGHTER_DEFS field names; 26-slot move template (22 normals/grabs + 4 specials, jab 1-2-3 = one slot); full frame-data tables.
- Hermes: rushdown trickster; numbers taken from code (src/anims/hermes-*.js).
- Aethon: heavy all-rounder, spear+shield+wings, 3 jumps + glide, armor moves (proposal).
- Kairos: zoner, time theme, orrery staff, tether grab, Stilled Instant slow field (proposal).
- Iris: aerial skirmisher, lightest, pitcher of Styx + rainbow, Rainbow Arc air dash, Bridge of Heaven platform (proposal).
Open questions for Justin are in the doc's last section (names, armor, tether, 4P issues, build order; suggested Aethon next).

**Why:** Justin wants one move/archetype spec reusable across art directions. **How to apply:** Build new fighters from this doc; tune numbers from play. See [[hermes-arena-plan]].

### Justin's answers (2026-11-09 12:01, in the doc)
- Names: yes, every move gets a proper name.
- Aethon armor: fine as long as overall balance holds.
- Kairos tether grab: keep; judge after balance testing.
- Iris bridge in 4P: yes, it should vanish when another fighter stands on it.
- Stilled Instant: try as is (slows everyone).
- Balance: wants evals for balance between characters; start with just 2 characters.
- Build next: Aethon.
- He asked for an adversarial review before locking the doc.

### Adversarial review applied (2026-11-09)
Reviewer simulated the real knockback code. Key findings now in the doc: "Shared engine rules" (once-per-airtime side/up specials, smash charge x1.4, half gravity in hitstun, shieldstun 2+0.8*dmg, launched fighters lose ground jump, ledge rules, hit priority, counters skip projectiles + scale 1.2x, trip state). Aethon nerfed (was beating Hermes everywhere; fsmash target ~81% KO on Hermes). Iris weight 0.84, Kairos airSpeed 5.2, ratings re-spent. Doc now has Decisions, Balance evals (8 automated checks) and "Before building Aethon" sections. Engine gaps: armor ignored by resolveHit, smash charge cosmetic, game.js hardcodes two Hermes.

## hermes-arena-engine

_Hermes Arena engine structure after the 2026-11-09 rules pass (match.js, RULES, select screen) and how to run the balance checks_


2026-11-09: Shared engine rules from the roster doc are in the code ([[hermes-arena-roster]]).
- src/match.js = the fight with no screen (STAGES, RULES constants, hit priority grab>counter>armor>shield>hit, stocks, win). Game (src/game.js) extends Match and adds fighter select, READY/GO, results screen (J rematch, K select), hold Enter to quit to select.
- Armor format in anim defs: armor: [[first, last, maxDamage]]. Trip: hit flag trip: true. Counter strike damage set by rule via move.strikeDmg.
- FIGHTER_ROSTER in fighter.js lists Hermes/Aethon/Kairos/Iris; a fighter is selectable once FIGHTER_DEFS + an anim book with idle exist.
- ?debug skips select into endless training (play-test.cjs relies on it); ?debug&select shows the select screen.
- Headless checks (Node, no browser): tools/engine.cjs loads src into a VM; tools/rules-test.cjs (19 rule tests); tools/balance.cjs [outdir] [--fighters a,b] = KO table, doc-vs-code, frame check. Doc snapshot it compares against: data/roster-doc.json (rev 338), must be refreshed from the Claude Doc by hand when the doc changes.
- First run (Hermes vs Hermes): best grounded kill fsmash 91% center (target 85-115 pass); up smash now 112%; only mismatch: doc's Up air row (doc 4+8 / KB 6, code also has late 6/5 and first-hit KB 2). An edit to the doc was blocked by permissions; Justin has to OK doc edits.
- Report copies: /mnt/project-files/hermes-arena/balance/hermes-vs-hermes-report.md
- 2026-11-09 18:30: Merged with the puppet-skin system. Load order: core, art, stage, figure, anim, skins, anims/*, skins/*, fighter, match, game. Fighter.skin and skinFlash; animContext/animJoints take a skin. Play-test: 23/25 scenarios clean; get-hit (KO'd before knockdown) and tech miss because the test tuning predates the rules engine.

## hermes-arena-workflow-prefs

_How Justin wants Hermes Arena characters built: one character at a time, design approved first, then animations_


2026-11-09: Justin said "Let's focus on one character at a time first and create all the animations." I read it as "animate the full move set" and built 83 Hermes animations. He then clarified: "I meant let's work on the design of the character since I don't like this current design."

**Why:** He wants the character's look settled with him before effort goes into motion. He does not like the milestone-1 Hermes design (mannequin-like, light, cartoonish figure).
**How to apply:** One character at a time. For each: explore design directions with Justin (concept sheets he can react to), get his pick, rebuild the figure, and only then polish animations. When an instruction is ambiguous and the work is large, confirm the reading before launching it. The 83-animation set and src/anim.js system still exist and can be retargeted to a new figure. See [[hermes-arena-plan]].

2026-11-09 06:46: Justin: "the main issue is that it's not at the style of the reference mockup I initially sent." The reference look = realistic heroic proportions (~6.5-7 heads), three-quarter view, very fine engraving lines + stipple for smooth tonal gradients, medium contour lines, rich armor/costume detail, layered feathered wings. Match that first; design variations come second. Stylised directions (chibi trickster, marble statue) were dropped for this reason.

2026-11-09 11:36: Justin still disliked both round-2 cyanotype builds (fighter and mascot), and the code-drawn character isn't landing for him. He plans to make a mockup in GPT Image himself first, and I gave him prompts for it. Next step: wait for his image. Then match the procedural Hermes to that image as closely as possible, rather than proposing new directions.

## hermes-arena-combat-feel

_Why Hermes Arena attacks don't chain (no buffer, canned jab, no cancels, short hitstun) and the Smash-mechanics doc + proposed build order_


2026-11-09: Justin said attacks don't feel fluid ("can't click multiple times like Smash") and asked to map Smash's attacks first.
Doc: "Hermes Arena: how Smash attacks flow" https://claude.ai/artifact/GrhmpJaBMrjvDyz84NmrYK (Claude Doc).
- Causes in the pixel prototype: presses during a move are dropped (no buffer); jab = one 34-frame anim with 3 baked hits; no cancel windows; hitstun (0.12 s + kb*0.0011) shorter than endlag.
- Proposed order: 1) feel pass, no new art (10-frame buffer, jab as 3 presses, cancel frames, hitstun from knockback, short hop, free landing frames, DI, stale moves; CPU too); 2) rapid jab, back air, dash attack; 3) shield/dodges, grab + throws.
- Main build (hermes-arena/source) already has: Controller input buffer (core.js), jab1-3 cancel chain, short hop, hitstun=launch*2.6+6, shield/shieldstun, ledges, dash attack, 5 aerials, grab/pummel/4 throws (Hermes). Port from there into the pixel build; DI and stale moves exist in neither.
- Open questions for Justin (in doc): shield/grab buttons (suggested Shift/L shield, shield+attack grab), update roster doc frame data after, combo-ability by weight.

**Why:** fluid chaining is the core Smash feel Justin expects. **How to apply:** wait for his answers/go-ahead, then start with the feel pass. Related: [[pixel-hermes-exploration]], [[hermes-arena-roster]].

2026-11-09 feel pass DONE in the pixel build (v13): per-fighter 10-frame buffer (bufferPresses), jab1-3 via splitJab (cancel frames), iasa per move (tilts 30% of tail, smashes 60%), aerial auto-cancel (A.ac), hitstun 0.15+kb*0.0032 s (max 1.5), DI 15 deg, stale 6%/copy of last 9, short hop (-262 vs -345; jump+attack macro). CPU chains jabs, buffers follow-ups (CPU_LV.combo), DIs toward stage. Next per doc: rapid jab, back air, dash attack; then shield/grab (port from main build).
2026-11-09 v14: rapid jab (hold or mash after jab 2; loops max 10, release -> jab3 finisher; not in roster doc for Hermes/Aethon, added from Smash), back air (Hermes: staff swing behind + heel kick, deviates from doc's pure mule kick; Aethon Wing Buffet), dash attack (Hermes Courier's Slide as low staff sweep slide; Aethon Phalanx Charge with armor <5% on f5-9). CPU uses all. Next: shield/dodges, grab + throws (port from main build).
2026-11-09 v15 "full Smash parity": shield (Shift; HP 50, -9/s held, 1.19x dmg, shieldstun 2+0.8*dmg f, break -> dizzy brk), spot dodge/roll/air dodge (once per airtime), grab (Q or shield+attack) + dash grab, pummel, 4 throws per fighter from roster doc numbers, ledges (LEDGES at altar edges, HANG 38, trump, 0.5 s invuln only if fresh), tumble (launch >150 px/s) -> tech (Shift within 20f, 40f lockout) / techroll / lie -> getup/getupatk/getuproll, fast fall (470; normal fall 300 Hermes/320 Aethon). CPU uses all by level (CPU_LV shield/tech/oos). Poses: defenceMoves(ch) with SK skeletons + ARMS per char. Not done: roster doc frame-data update, combo-ability by weight.
2026-11-09 v16 smaller mechanics: parry (shield release, first 5f of the 11f drop; melee attacker frozen pfrz 0.33 s), shield poke (hitbox on body outside bubble), wall tech/bounce on altar sides (no ceilings on stage), jab reset (weak hit on lying -> forced getup, no intang), footstool, crouch (kb x0.85)/crawl, initial dash + dash dance + pivot + run skid (CHARS dash/crawl), rage (up to +10% kb at 150%), hitstun gravity by weight (stunG 660 Hermes / 760 Aethon). CPU: parries (Normal 10%, Hard 30%), edge-guards (walks to edge, jumps out for aerials, ledge-trap dtilt/dsmash). Remaining from Justin's list: sound, gamepad, select screen/timer, 4 players, Kairos/Iris, stages, roster doc frame data.
2026-11-09 v17 feel pass: Justin wants to focus on gameplay feel above everything else. Done: Smash hitlag (0.65*dmg+5 f, cap 24; shield x0.67), SDI taps (3 px) in hitlag, KO-hit slowmo+zoom (willKO prediction, koFx), air facing locked (away = bair), double jump redirects vx, 3f jumpsquat + 6f short-hop release window, Tuning panel (TUNE multipliers saved in localStorage 'pxh-tune'; hitbox view; frame readout with on-hit/on-shield advantage). Ask Justin for his slider values/feel notes to bake in.
2026-11-09 v18: feel lab built ([[hermes-feel-lab]]); round 1 retuned hitstun/launch/kb/short hop, score 75.5 -> 93.4. See feel-lab/LOG.md.

## hermes-feel-lab

_Autonomous feel-testing lab for the pixel Hermes Arena build (probes, scorecard, sweeps, clips, loop protocol) and where it lives_


2026-11-09: Justin asked for a system so Claude/subagents can test gameplay feel and keep improving it while he is away.
Built the feel lab: /mnt/project-files/hermes-arena/feel-lab/ (working copy /home/claude/feel-lab; copy back if the container is fresh).
- spec.json = Smash-derived target bands (movement, combat KO %, frame data, CPU-vs-CPU pacing, stability). lab.cjs scores the game (pass 1 / warn 0.5 / fail 0) in ~10 s; --quick skips matches; --set "JS" applies a change in-page without editing; sweep.cjs compares candidates; clips.cjs renders GIFs + labelled contact sheets for vision review (REVIEW.md rubric).
- PROTOCOL.md = the loop (measure, one problem, sweep, accept only if score up and no new fail, bake, verify, LOG.md, ship). Design trade-offs go to QUESTIONS.md, never decided by the loop.
- Game now has a FEEL constants block (hop speeds, hitstun, launch gravity, kb base/growth, DI, KO slow-mo) the lab can override.
- v18 round 1: score 75.5 -> 93.4 (short hop 300, stunK 0.0024, launchRiseG 0.4, kbGrowth 1.8, dthrow totals shorter, KO slow-mo after hitlag).
- v19 round 2 run by a fresh subagent from the docs alone: hit flash is now a 45% white wash over the sprite (victim was invisible during KO hitlag). Next finding: KO flash lasts ~40 f because F.flash counts down in slow-mo time.
- v20: Justin chose Smash-like shield safety. Grounded moves cancel at iasa only after a clean hit (cancelF), otherwise run to total; score 96.2, no fails.
- Justin wants a VIDEO of what each test round did: video.cjs makes a side-by-side before/after MP4 (videos/ in the lab folder). Attach one with every round report.
- v21 (Justin: "just do the routine's work now"): new air/recovery probes; air drift 0.68 of run + friction, Hermes up special shorter, stunBase 0.1, utilt/dtilt iasaHit, real-time hit flash. 97.6. Lesson: never put a // comment mid-line in the one-line-heavy game code (it cut off the respawn-invincibility timer).
- v22: Justin chose shorter Aethon glide; glide 1 s + Aethon airSpeed 0.6, dJump 240, wingbeats 180/65 -> recovery 1.04, score 98.4.
- v23: synthesized Web Audio sound effects (M mutes, volume in Tuning) and gamepad support (standard mapping, right stick = smash/aerial, tap jump off). video.cjs now muxes the After build's sound (events logged by clips.cjs, rendered with the game's sfxRender). Chrome's compressor adds make-up gain: measure sound levels in steady state, not at t=0.
- v24 (Justin chose match flow before 2-player; said don't start 2-player yet): title (CPU demo behind), canvas fighter select (mirror recolour, CPU lv/Dummy, stocks, time), 3-2-1-GO, pause, GAME!/TIME!, sudden death, results with stats. flowFrame() drives screens; simIn overrides step() inputs (lab unaffected). selectChar kept for scratch scripts. flowvid.cjs = walkthrough video.
- Open: Justin's Tuning slider values.

**Why:** Justin wants progress on feel without having to play-test each change. **How to apply:** for any feel work, run the lab first and follow PROTOCOL.md; log every accepted change in LOG.md. Related: [[hermes-arena-combat-feel]], [[pixel-hermes-exploration]].

## pixel-hermes-exploration

_Parallel pixel-art Hermes style study (code-drawn, chunky sprite) and where it lives_


2026-11-09: Justin also liked the chunky pixel-art version of the Nous Hermes mascot and asked for a code-drawn pixel take, explored separately from the cyanotype redesign.

- Artifact: https://claude.ai/artifact/GmZRPU455zdtHNYwtFGJaR (playable stage + idle/run/jump/attack sheet)
- Source: /mnt/project-files/hermes-arena/pixel-style/pixel-hermes.html (single file, self-contained)
- Method: shapes rasterised onto indexed buffers (RES=2), outlines, 5-tone ramps + Bayer dither, 2-bone IK legs, keyframed poses.
- v2: pixel Altar of the Agora stage (416x234) with the same layout as game.js STAGES.agora.
- 2026-11-09 11:45: Justin: "I think that works for now. We will need some refinement later but let's continue in this direction." So pixel style (characters AND world) is the chosen direction going forward; refinement later.
- 2026-11-09 12:15 v3: Aethon added to the same artifact (Hermes/Aethon picker; the other fighter is the sparring partner). Design follows the roster doc: Corinthian bronze helmet with crimson horsehair crest, linen corselet with bronze scale band, crimson pteruges/cape, big white wings (fold/spread param), crimson aspis with white wing emblem, dory spear. Anims: idle, run, jump, glide, Spear Thrust (f-tilt). 3 jumps + hold-jump glide on stage. Code: drawAethon/drawWing/drawSpear + AANIMS/CHARS in the page.
- 2026-11-09 v6: Justin approved all 7 visual fixes. Pixel switch removed; RES=2 everywhere. Backdrop rasterised in layers (far/armillary/mid/fg) with parallax and a Smash-style zoom camera (1-1.38x). Fighters get a dark outer outline and back rim light (finishSprite). Hermes idle staff moved ahead of the face; bronze is yellower. Lintels are Doric (triglyphs, gold metopes); a winged Victory statue and a laurel wreath replace the old blobs. Added hit flash, hitlag, launch puffs, KO bursts, squash/stretch, and a 5x7 font HUD (portraits, italic damage % coloured by damage, 3 stocks).
- 2026-11-09 v8: Justin asked for left click + direction = attacks, right click = specials. Built per the roster doc: jab, f/u/d tilt, n/f/u/d air, and 4 specials for both Hermes and Aethon (projectiles, dash with afterimages, rise + helpless, counter stance, wingbeats into glide, stomp shockwaves). Controls: Space jumps; W/S aim up/down (W no longer jumps); J/K are keyboard attack/special. Moves are data in ANIMS/AANIMS (total, hits[], dash/rise/spawn/beats/stomp/counter). Dummy never attacks, so the Hermes counter only shows its stance.
- Related: [[hermes-arena-roster]], [[nous-hermes-design-reference]], [[hermes-arena-workflow-prefs]].

### v9 camera (2026-11-09)
Smash-style camera in pixel-hermes.html: CAMB camera bounds (x -100..VW+100, y -170..VH+2) inside blast zones; target = padded box around fighters + velocity look-ahead, zoom fitted between ZMAX 1.38 and ZMIN (whole bounds), slight pull to stage centre, zooms out faster (rate 5) than in (2.2). Off-screen magnifier bubble when a fighter leaves the view. Backdrop layers widened/heightened (sky, clouds, extra columns). Load ~4 s in headless renderer.
v10 (2026-11-09): smash attacks (fsmash/usmash/dsmash) for Hermes + Aethon from roster doc; a ground directional tilt with attack still held at frame 7 (SMASH_HOLD) becomes the smash, which holds at charge.f while held (max 60 f, x1.4 dmg+kb).
v11 (2026-11-09): Aethon's shield is drawn in front of his spear arm (hoplite: shield on the near arm); legs redrawn as bare knee + tapered greave + slim sandal, skirt shortened so knees show.
v12 (2026-11-09): CPU opponent. H and D are both newFighter() objects run by fighterStep(F, input); playerInput() reads keys, cpuInput(D) is the AI (recover > close in > pick attack by range; CPU_LV Easy/Normal/Hard = think interval, accuracy, aggression, smash charge). Stocks end the match (GAME banner, reset). Opponent picker CPU/Dummy. Hermes counter now works.
Front views: [[pixel-hermes-front-views]].
v26 (2026-11-09): all arms redrawn with drawLimb (one shaped limb, fists, cel shading); Kairos/Iris art in file, not playable yet: [[pixel-kairos-iris]].

## pixel-hermes-front-views

_Front-facing pixel art of Hermes and Aethon for fighter select, winner screen and HUD portraits; what Justin rejected and where the code lives_


Justin noticed there were no front-facing views (HUD portraits, select, winner were all profile). First pass (front view at sprite size, symmetric, scaled 1.3-1.5x) he called "kind of weird". Second pass: drawHermesFront / drawAethonFront in front.js (copy in pixel-style/front-views/), a larger 128x116 figure on the same pixel grid shown unscaled, following the front view in gpt-mockups/masked-sheet.png (wide stance, V helmet wings, eyes in shadow, cowl, caduceus held out; Aethon: smooth Corinthian helmet, aspis on the arm, spear planted). frontFrames(ch) = 8-frame breathing loop; PORTRAIT crops the head at half scale. Wired into the local build (select, results, HUD); waiting on Justin's go to publish as v25. Lesson: never scale pixel art by non-integer factors, and check his mockups before designing a new view.

**Why:** Justin expects front-facing art on portraits, select and winner screens. **How to apply:** judge new character art against his mockups and show it in place before publishing. Related: [[pixel-hermes-exploration]], [[hermes-gpt-mockups]], [[hermes-arena-workflow-prefs]].

## pixel-kairos-iris

_Kairos and Iris pixel designs, the v26 arm-drawing fix (drawLimb), and where their code and design sheets live_


2026-11-09: Justin asked for the other two characters plus more stages. The stages are built in a separate thread, which hands over apply-stages.cjs. This thread owns the game file, does the merging and publishes.

**Designs v1** (sent; Justin's feedback still pending): /mnt/project-files/hermes-arena/pixel-style/kairos-iris/designs-v1.png
- Kairos: violet 'robe' with a 'sand' stole, a deep hood with amber 'glow' eyes and a white beard, and a 'wood' staff with a brass orrery (drawOrrery).
- Iris: 'pearl' chiton with an 'aqua' sash, rainbow wings (rbr..rbv ramps, drawRainbowWing), 'ihair', a bronze hydria (drawPitcher) and a ribbon of light (drawRibbon).
- The functions are in pixel-hermes.html: drawKairos/drawIris (side view) and drawKairosFront/drawIrisFront, registered in FRONT_DRAW. The dev poses kIdle/kRun/iIdle/iRun live only in the scratchpad file ki-poses.js.
- PLAYABLE since v28 (2026-11-09). Special-move mechanics live in one block before tickFx (kiMove/kiSpawn/kiTick, fields, puddles, temp PLATS with .temp, kparts, vfxs, trails; kiDrawBack/kiDrawFront/kiShot). Hold-special input is I.specHeld.
- CPU uses down specials since v30 (see [[v30-cpu-down-specials]]). Lab: `node lab.cjs --quick --ch hermes,aethon,kairos,iris`. Move showcase video: feel-lab/showcase.cjs + seg-ki.js.

**Arm fix, v26.** Justin said everyone's arms, elbows, shoulders and hands "look like puppets, not Street Fighter pixel arms."
- drawLimb(B,sh,{el,hd,d2},o) draws each whole arm as one part:
  - one outline and no ball joints
  - a biceps swell and a forearm taper
  - an elbow point when the arm bends
  - a squared fist with finger creases and a thumb
  - cel shading (toon) in place of dither
- Every draw function and every front view uses it (frontKit has an A() helper for the front views).
- Pauldrons stay plain ellipses drawn behind the arm. Plates drawn over the arm looked like orbs.

**Why:** Justin judges art against fighting-game pixel sprites.
**How to apply:** draw any new limb with drawLimb and cel shading, not with caps plus an ellipse hand.

**Stages:** drop 2 (big map KYLLENE, Altar stays default) merged and published as v27 on 2026-11-09. The working build now includes the stage code, so for later drops re-run apply-stages.cjs, which then only swaps in stages.js. v28 lists all four fighters.

Related: [[pixel-hermes-exploration]], [[hermes-feel-lab]], [[pixel-hermes-front-views]], [[hermes-arena-roster]]

## hermes-arena-stages

_Stage registry for the pixel Hermes Arena game (Altar, Delphi, Olympus, Styx), how it merges into the game file, and who publishes_


2026-11-09: Justin asked for more levels, built in a separate thread and merged into the same game.
- Files: /mnt/project-files/hermes-arena/stages/ (stages.js registry, apply-stages.cjs patch, README.md contract, previews/).
- Merge rule agreed between threads: the fighters thread owns pixel-style/pixel-hermes.html and publishes the artifact (GmZRPU455zdtHNYwtFGJaR). The stages thread never publishes it; it hands over stages.js and the fighters thread runs `node apply-stages.cjs game.html`. The patch is idempotent: on an already-patched file it only refreshes the stage block.
- Drop 1 stages: altar (default, unchanged), delphi (Omphalos of Delphi, flat, no platforms), olympus (Clouds of Olympus, two drifting cloud platforms), styx (Ferry of the Styx, barge with one high platform, water drawn over fallers). STAGE row on the fighter select (row 5), MS.stage saved, ?stage=id.
- Engine contract: stages centred on x=208; ALTAR = main body (wall t+9..b+80); new stages use a small b so the wall stops just under the visible stage. Moving platforms use PLATS[i].move with no vertical bob, because a descending platform could catch a short hop.
- Lab: run with --set "loadStage('id'); resetFighters();". Probe ratios are Altar-relative, so compare pacing, self-destructs, stuck states and errors instead.

- 2026-11-09 22:10 Justin: drop-1 stages "all too simple. We want to be able to go up multiple stories and go far left and right. Let's just make one version of a more complex map first." Drop 1 was never published, and the three stages are parked in stages-archive.js.
- Drop 2 is one big map, kyllene (Sanctuary of Kyllene): a 3-storey temple (floors at 139/82/24/-34/-92), chasms with stepping stones, and west/east cliff wings with a tower, lookouts, slabs and floating ruins. Engine additions: blocks (walls+ceilings), big-map CPU (offStage/homeLedge/dropAhead/cpuClimb), respawn points, zmin. The Altar lab is unchanged (98.4). Known trade-off: KOs need about 200% on the wide map, so CPU matches often time out.
Related: [[hermes-feel-lab]], [[pixel-hermes-exploration]].

## nous-hermes-design-reference

_What "the Nous Research Hermes design style with the cyanotype blue" means for Hermes Arena, and where the source art lives_


2026-11-09: Justin asked for Hermes to have "that Nous Research Hermes design style with the cyanotype blue". The source art comes from the Hermes Desktop app in the NousResearch/hermes-agent repo, under apps/desktop/. The Nous websites are blocked by this sandbox's proxy, but a sparse `git clone` of github.com works. Copies are in /mnt/project-files/hermes-arena/nous-reference/.

**Character design (public/hermes.png, public/hermes-sprite.png):**
- Rounded steel helmet with white feathered wings at the temples; the brim/visor hides the eyes.
- A blue scarf wraps over the lower face, so no face is visible.
- Gold domed pauldrons and gold bracers.
- Blue tunic with gold trim and a gold winged sigil on the chest.
- A brown/gold belt with a square buckle, and a tabard panel in front.
- A layered cloak of feathers, blue outside and cream inside, that reads as wings.
- A gold caduceus staff with gold wings, twin snakes and a blue orb at the top.
- Gold greaves and boots.

**Cyanotype (public/ds-assets/filler-bg0.jpg, the app backdrop):**
- Blue ink on cream: darkest ≈ rgb(48,112,177) #3070b1; paper ≈ rgb(252,251,228) #fcfbe4.
- Classical figures in a grainy engraving with stipple and halftone texture.
- Highlights are the bare paper.

The theme primary colour is #0053fd. Related: [[hermes-arena-workflow-prefs]], [[hermes-arena-plan]].

**Round 2 (2026-11-09):** I drew two builds in concepts/nous.js (with concepts/builds/hero.js at about 6 heads and mascot.js at about 4 heads). They use cyanotype grain printing. The review page is https://claude.ai/artifact/SQNYQj4HyAa972GcXzYreu. Waiting on Justin's pick before the 83 animations are retargeted. Sources are in /mnt/project-files/hermes-arena/source/concepts/.

## hermes-gpt-mockups

_Justin's GPT Image mockups of Hermes (two styles) are the design target; where they live and what each style is_


2026-11-09 11:52: Justin made Hermes mockups in GPT Image in two styles. He asked for both to be drawn in code in an idle pose. Files are in /mnt/project-files/hermes-arena/gpt-mockups/ (also in the repo at concepts/refs/).

**Style A, "masked" (Masked Herald)**
- Slate-navy copperplate engraving (#2e4865) on warm cream (#fbead1).
- About 7.5 heads tall and very muscular.
- Winged kettle-brim helmet with the eyes in shadow, and a scarf mask with a cowl.
- Domed rosette pauldrons, an eagle chest emblem, and a studded belt with a rosette buckle.
- A pointed tabard with a wheat motif and engraved bracers.
- A huge layered feather cloak.
- Greave boots with ankle wings.
- A caduceus with an orb.

**Style B, "classic" (Classical Messenger)**
- Cobalt (#1f4fa4) clean ink with a halftone dot screen on off-white (#f7f1ea).
- Face visible, young and lean, with curly hair.
- Winged petasos.
- A short chiton with a Greek key hem.
- A chlamys cloak pinned with a brooch.
- A satchel on a cross-body strap.
- Winged laced sandals.
- A caduceus.

His in-game scene mockups also show the stage target:
- A carved altar with a frieze of sphinx-like figures and masks.
- A faint colonnade, an armillary sphere and a temple in the background.
- Big italic damage % at the bottom, with laurels, portraits and a timer.

Render tool: tools/idle-render.cjs (idle beside the reference, plus game scale). Concepts go in concepts/masked.js and concepts/classic.js, built by workflow wf_7680427f-ed0.

Related: [[hermes-arena-workflow-prefs]], [[nous-hermes-design-reference]].

**Round 3 result (2026-11-09):**
- Code idles are in concepts/masked.js and concepts/classic.js. Copies are in /mnt/project-files/hermes-arena/source/concepts/.
- Review page: https://claude.ai/artifact/BtsktNYMTUVjf5anZhiGv4
- Classic is closer to its mockup (about 6/10). Its ankle wings look like fans and the cloak is boxy.
- Masked is about 5/10. The helmet reads as a flat hat, and the limbs are blocky.
- Waiting on Justin to pick which style to push.

**Round 4 (2026-11-09 ~16:00):**
- Procedural code drawings plateaued after 3 critic/fix rounds: classic at 6.5/10, masked at 5/10.
- Cutout puppets reached 9/10 for both styles. These slice the mockup into rigged parts and rebuild the hidden areas.
  - Sources: concepts/cutout/<key>/build.py, concepts/cutout-<key>.js.
  - Images are embedded as data URIs, with cached tints for P2 and mip levels.
  - The masked puppet mirrors the mockup so it faces +x.
- The same review page (BtsktNYMTUVjf5anZhiGv4) was updated to round 4.
- I recommended the cutout approach. Waiting on Justin to choose a style, then map the 83 animations onto the puppet rig.

**Round 5 (2026-11-09 ~17:15):** Justin asked "continue building both in parallel" (both puppets as in-game skins, workflow wf_87bba5e9-218). He then floated two alternatives:
- SVG. I'm running a trial that traces the Classical puppet parts to SVG paths (wf_4816713f-815); outputs go to scratchpad/svg-trial.
- Sprite sheets he generates with GPT Image in Codex. I gave him a test prompt (idle 4 frames, run 6, jab 3, 1536x1024 transparent, facing right, same baseline). I'll slice whatever he uploads and compare it in-game. Expect frame-to-frame drift.
- 2026-11-09 17:20: Justin asked me to generate images with his Krea connection. (UPDATE 17:30: the new environment reaches api.krea.ai, so curl POST uploads work now; see [[hermes-sprite-tests]].) It's the Individual Max plan (40k CU) and offers openai/gpt-image-2.6-flare (transparent backgrounds, up to 10 image_urls refs). The sandbox proxy blocks api.krea.ai, so I can't POST uploads; data URIs are capped at 1024 chars. He has to upload refs through the mcp__Krea__upload_asset widget, or add api.krea.ai to a cloud environment's allowed domains.
- **2026-11-09 18:30: skins shipped.** Both cutout puppets are Hermes skins (src/skins.js registry; generated src/skins/{masked,classic}.js from concepts/cutout/<key>/skin.js via tools/build-skins.mjs). Each skin is about 7/10 across the 83 animations after review and fixes. Defaults are P1 masked and P2 classic; keys 1/2 cycle (Shift reverses); the book has a Skin dropdown or ?skin=.
  - Known gaps: masked up-smash rotor needs a skinProp hook in hermes-smash.js; classic idle holds the staff in the front hand; rolls show a big cloak.
  - A workflow copy overwrote the rules-engine src in /mnt/project-files. I 3-way merged it (match.js and the rest are back; build ORDER has match.js before game.js; tools/engine.cjs loads skins.js). 19/19 rule tests pass.
  - The game is republished at a NEW URL, TfNWfBse6xt4e5vyVGaEy4. The book stays at Hgu6FwxoDK4Q62wJpjW6Je.

## hermes-sprite-tests

_GPT Image (Krea) sprite sheet test for both Hermes styles: files, preview artifact, cost, and what worked_


2026-11-09 17:30: First AI sprite-sheet test for Hermes, generated through Justin's Krea connection.
- Setup: openai/gpt-image-2.6-flare, 3:2, 2K, background transparent, quality high. The matching gpt-mockups/*-sheet.png went in as image_urls (uploaded via get_upload_url + curl POST). About 127 CU per sheet, and each took 15-50 s.
- Sheets: classic and masked versions of idle (4 frames in 1 row), run (6 frames, 2x3) and jab (3 frames in 1 row).
- Output: /mnt/project-files/hermes-arena/sprites-test/. That holds sheets/, frames/ (sliced PNGs plus a JSON per animation with anchor x and foot y), slice.py and preview-template.html.
- Slicer: alpha blobs dilated 14px. When a staff joins two neighbouring frames, it splits the blob at its emptiest column.
- Preview: https://claude.ai/artifact/6hvsszcco9jV96ZjWA47fi. It loops the frames anchored on head and torso, with onion skin.
- What came out:
  - Character fidelity is very high.
  - Idle sheets are three-quarter views, not true profiles. The masked idle barely moves.
  - The jabs read well.
  - Run frames are not a clean contact/passing cycle.
- The comparison is against the rigged puppets in the "Redesign Hermes character" thread.

Related: [[hermes-gpt-mockups]].

## hermes-desktop-plugin-format

_How Hermes Desktop (Nous Research) plugins are structured, loaded, and what APIs they get_


Source: https://raw.githubusercontent.com/NousResearch/hermes-agent/main/website/docs/developer-guide/desktop-plugin-sdk.md (read 2026-11-09; doc is evolving).

- No manifest. One ESM file at `$HERMES_HOME/desktop-plugins/<id>/plugin.js` (default `~/.hermes`), folder name == `id`. Hot-reloads on save; ⌘K "Reload desktop plugins" if missing. Enable/disable in Settings (newer doc: "Capabilities") → Plugins.
- Loaded uncompiled: no JSX; imports allowed only from `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`.
- `export default { id, name, defaultEnabled?, register(ctx) }`.
- `ctx.register({ id, area, title?, order?, render: () => jsx(C,{}), data })` returns a disposer; `ctx.registerMany([...])`.
- Areas: `panes` (data {placement: main|left|right|top|bottom, width, height, dock}), ROUTES_AREA (data {path}) + SIDEBAR_NAV_AREA (data {path,label,codicon}, no render), `statusBar.right`, palette, keybinds, themes.
- `ctx.storage` (JSON, keys hermes.plugin.<id>.*), `ctx.onDispose`, scoped `ctx.setTimeout/addEventListener`, `host.notify`, `host.navigate`, `useValue(host.state.*)`. Theme via `var(--ui-*)` CSS vars.
- One-click install link: `hermes://plugin/install?repo=owner/repo&enable=1`.

Used by the Hermes Arena game plan: [[hermes-arena-plan]].

## v30-cpu-down-specials

_Where the Claude Code session of 2026-11-10 left the pixel game (branch `cpu-down-specials`, not pushed)_

- CPUs use all four down specials (v30). How each is used, the numbers and what was dropped: feel-lab/LOG.md, v30. Lab unchanged: quick 98.5, full 98.4.
- Two fixes came out of it: grounded attacks, grabs and rolls stop at an edge (QUESTIONS.md Q5, Justin can veto), and the CPU no longer throws Kairos's ring as a recovery move. CPU self-destructs fell to 0.04 per stock or less for every fighter.
- Open for Justin: QUESTIONS.md Q4 (shorten the Stilled Instant cast from 40 to 28 frames?), Q5 (edge rule, can veto), Q6 (CPU hazard awareness is built but off: it costs the CPU more than tripping does), Q2 (his Tuning values).
- v31 (same day): Justin said Kairos should be immune to his own field. Done; CPU casts it only on a foe who cannot answer in time. KO slow motion now fires only on real KOs (it was wrong 63% of the time). The lab plays 30 matches per fighter and scores KO slow-motion accuracy, so its scores are on a new footing: v29 95.5, v31 98.5 (LOG.md, v31).
- CPU-vs-CPU numbers are dice: one-sided tests need about 400 matches to see 0.1 stocks a match. Measure a CPU change that way (and per use: damage dealt and taken after it) before believing it helps.
- v32 (same day): CPUs cross Kyllene's chasms. They used to stand on either side hopping at their edges (34 of 120 CPU matches hit the 4-minute cap; now 5, all Aethon mirrors, which are just long: QUESTIONS.md Q8). All of it is behind `STAGE.big`, so the Altar plays exactly as in v31. The lab now also plays 10 matches per fighter on Kyllene and scores stalling and self-destructs there: 98.6, or 99.0 with all four. Details and what was tried: feel-lab/LOG.md, v32.
- A CPU rule that avoids self-destructs can still lose matches: the first aerial-safety rule removed Aethon's pit deaths and lost 0.2 to 0.6 stocks a match. Test such rules one-sided before keeping them, on both maps.
- v33 (same day): Justin answered Q4 to Q8 with the recommended option each time. Stilled Instant is 28 frames (was 40); the lab gives heavies their own startup bands, so Aethon's frame-data warning is gone; edge rule kept; CPU hazard awareness stays off; Aethon on Kyllene left alone until Justin has played there. Lab 99.3. No open questions except Q2 (his Tuning values).
- The CPUs' use of Kyllene's floors was measured and is fine (LOG.md, v33): no change.
- v34 (same day): two players on one machine, at Justin's request (he had said "not yet" on 2026-11-09). PLAYER 2 is a fifth OPPONENT choice; the keyboard splits during the match (P1 W A S D + F G Space, P2 arrows + J K N); one controller is P2's, two are P1 and P2. It is local only (online play came in v35). Check: `node feel-lab/pvp.cjs` (28 checks). Not yet tried with real controllers or by two people. Details: feel-lab/LOG.md, v34.
- v35 (same day): online play, which is what Justin had meant by player against player; he asked for whatever is free. ONLINE is a sixth OPPONENT choice: one player hosts and gets a five-character room code, the other types it. The two browsers then connect directly (WebRTC data channel) and run the match in lockstep: fixed 1/60 s steps, only inputs sent, 2 to 10 steps of input delay set from the measured ping, a seeded random-number generator, and a state comparison every 20 steps. Finding each other goes through the free public PeerJS server, spoken to over a plain WebSocket with no library; it is a community service with no uptime promise, and `SIG.url` in the game can point to any other PeerServer. No relay server (they cost money), so some strict networks will not connect, and each player can see the other's IP address. Checks: `node feel-lab/net.cjs --live` (21 checks: two pages on this Mac kept identical step for step under up to 150 ms of lag, plus the real room-code and WebRTC path). **Not yet tried between two machines on two networks**; both sides need the same build. The plugin build passes its checks with online play in it (46), and the v35 build was installed in Hermes Desktop (v0.23.1) the same day at Justin's request: the app hosted a room, a headless Chrome page on this Mac joined it by code, and the match ran over WebRTC without a stall (details in `plugin/README.md`). Details: feel-lab/LOG.md, v35.
- Four players (started 2026-11-10 at Justin's request; in progress, no version yet). Assumed until he says otherwise: free-for-all, last fighter standing, each of four slots is a player, a CPU or empty, and two fighters stay the default. Build order: (1) engine: a fighter list `FS` and `foesOf(F)` instead of the fixed pair, every hit, grab, projectile, puddle and push against all other fighters, the CPU aiming at its nearest opponent, KO and match end for any number, four spawn and respawn points per stage, the camera framing everyone; (2) what you see: four HUD panels, four colours including same-fighter alternates, results with placings, four slots on the fighter screen; (3) input: controllers for players 3 and 4 (the keyboard holds two); (4) online for three and four. Done so far: `FS`, `foesOf`, and melee hits, projectiles, ledge steals and respawn points going through them, with two-fighter behaviour unchanged (lab 99.3). Still on the single `F.foe`: 32 references inside `fighterStep` (grabs, facing, pushing), puddles, the CPU, KO credit and match end, stats, the HUD, the results screen, the lab probes. Open for Justin: teams or free-for-all only, whether the small Altar stage should allow four, and whether online needs more than two.
- Not done: a third map (the three parked in stages/stages-archive.js were judged too simple; wait for Justin's reaction to Kyllene); the copy of the plugin in Hermes Desktop is v31 until Justin asks for an update.
- Pixel game as a Hermes Desktop plugin: built (`plugin/build.mjs`, checks in `plugin/test.cjs`, decisions in `plugin/README.md`). The game file is untouched; the build wraps its script so it runs in a Shadow DOM and can be unmounted. Passes 43 checks against a stand-in for the app shell, including the app's own import scan (hermes-agent checkout at `~/.hermes/hermes-agent`, commit 2bd378ed1b). **Installed and played in Hermes Desktop v0.23.0 on 2026-11-10** at Justin's request (`~/.hermes/desktop-plugins/hermes-arena/plugin.js`, next to his hermes-bots, ninsei and pheme plugins; do not touch those): loads, shows in the Sessions sidebar, mouse and keyboard play work, a match pauses when the app loses focus, and overwriting the file hot-reloads it. What was checked and how to repeat it: `plugin/README.md`. After changing the game, rebuild and copy the file again. Layout choices he may want to change: play layout hides the header, animation sheet and design notes; a match pauses when focus leaves the game.
- Plugin format facts confirmed from the checkout (2026-11-10): the loader refuses any import outside `@hermes/plugin-sdk`, `react`, `react/jsx-runtime`, `react/jsx-dev-runtime`; it finds imports by scanning the source text, so `plugin/test.cjs` runs that scan on the built file; module evaluation has a 10 s deadline; `ctx.storage` is synchronous (`get(key, default)`, `set`, `remove`).
- Machine notes: run the lab with `NODE_PATH=$(npm root -g)` (Playwright is installed globally, not in the repo). The lab drives the installed Google Chrome. ImageMagick here is v7; `convert` and `montage` still work.

