# Questions for Justin

The loop writes design questions here instead of deciding them. Each has a recommendation; the loop keeps working on the recommended option only where LOG.md says so.

## Q1. Should attacks be as punishable on shield as in Smash? (answered: Smash-like, done in v20)

Right now almost every move is much safer when it hits a shield than in Smash Ultimate: tilts are about −3 to +1 frames (Smash: −6 to −20), smashes −6 to −11 (Smash: −15 to −40).
That is because the cancel windows added for fluid chaining (v13) cut each move's tail short.

- **Smash-like (recommended):** keep the cancel windows for combos on hit, but lengthen the recovery so a blocked attack can be punished with a grab or a fast move out of shield. Shielding becomes a real answer and spacing matters more.
- **Keep as is:** aggressive, pressure-heavy play; shield is weak against anything.

## Q2. Your Tuning panel values (open)

If you have changed sliders in the Tuning panel and liked the result, send the numbers and they will become the defaults.

## Q3. Should Aethon be able to recover from the blast line? (answered: shorten glide, done in v22)

The roster doc rates Aethon's recovery 3/5, the same as Hermes, but also gives him 3 jumps and a 120-frame glide. Together they bring him back from anywhere at stage height, so he can't be edge-guarded.
- **Shorten the glide to about 1 s (recommended):** recovery drops to a normal range and he stays the hard-to-kill heavy.
- **Keep it:** Aethon is a recovery specialist; the doc's recovery rating should go up to 4-5.

## Q4. Stilled Instant gives Kairos nothing. Change it? (answered: immune to his own field, v31; cast shortened to 28 frames, v33)

2026-11-10, Justin: yes, shorten it. Done in v33 (LOG.md). The rest of this entry is the history.

Before v31 the field slowed Kairos too, and the CPU got hit out of the cast most of the time. Justin: he should be immune. Done, and the CPU now casts it only on a foe who cannot answer in time (LOG.md, v31): safe, about 8% net damage per cast, but under one cast a match, so it does not move match results.

Still open: the cast is 40 frames, 16 before the field opens. That is why it can only be used on a foe who is already stuck.
- **Shorten it to 28 frames (recommended to try):** with immunity this measured +0.07 stocks a match on the Altar and +0.04 on Kyllene under the older, looser CPU rule. It would let the field be used in neutral, which is what a zoner wants it for.
- **Keep 40:** it stays a follow-up tool only.

Try it: `node lab.cjs --set "CHARS.kairos.anims.dspec.total=28"`.

## Q5. Grounded attacks no longer slide off the edge (answered 2026-11-10: keep)

A grounded attack, grab or roll now stops at the edge of what its fighter stands on, as in Smash; specials (Swift Courier, Aspis Rush, Rainbow Arc) still leave it. Before, shield pushback at the lip could shove an attacker off backwards in the middle of a smash, which was most of Aethon's CPU self-destructs and could happen to a player too. It is one block in `physics()`.

- **Keep (recommended).**
- **Revert:** dash attacks and rolls carry off the edge again.

## Q6. Should CPUs respect Iris's puddle and Kairos's field? (answered 2026-11-10: leave it off; built, switched off)

A CPU that hops puddles and backs out of slow fields is in the game (`cpuHazards`), set to never notice them. Turned on, it trips about 40% less often, and loses about 0.1 stocks a match more against Iris on the Altar, because running through a puddle usually works and tripping is cheap (LOG.md, v31).

- **Leave it off (recommended) and make the puddle worth respecting first:** for example trip a fighter who is in a move too (a dash attack currently slides through untouched), or a longer knockdown. Then turn this on and re-measure.
- **Turn it on for looks:** the CPU reads as smarter and plays slightly worse against Iris. Hard: `CPU_LV[2].haz=0.9`, Normal: `CPU_LV[1].haz=0.5`.

Try it: `node lab.cjs --ch iris --set "CPU_LV[2].haz=0.9"`.

## Q7. Aethon's frame-data warning is the band, not the game (answered 2026-11-10: heavies get their own bands, done in v33)

The lab scores each move's startup against one band per move class, taken from Smash's cast as a whole: smashes 10-20 frames, aerials 4-13. Aethon has three moves outside them: forward smash 21, forward air 14, down air 19. That is 10 of 13 moves in band (77%, the bar is 80%), and it has been a warning since v18. Smash's own heavies sit outside these bands too (Bowser forward smash 22, Ganondorf 31, Donkey Kong 22), and the roster doc makes Aethon slow on purpose.

- **Give heavies their own startup bands (recommended):** for a fighter with weight over 1, smashes 10-24 and aerials 4-20. The warning goes away and the game does not change. It is a change to the yardstick, so it needs your OK.
- **Speed Aethon up by a frame:** forward smash 21 to 20 alone gets him to 85%. It passes the lab and makes him slightly less of a heavy.
- **Leave it:** a standing warning that means nothing.

His other standing warning, recovery 1.04 against a 0.9 ceiling, is what is left after Q3 (you chose the shorter glide; going lower means cutting one of his three jumps).

## Q8. Aethon mirror matches on Kyllene run long (answered 2026-11-10: leave it until Justin has played there)

With the chasm stand-offs fixed (v32), CPU Aethon against CPU Aethon on Kyllene still takes about 44 s a stock against 33 on the Altar, and 5 of 30 matches pass four minutes. They are fighting the whole time. He is the heaviest fighter with three jumps and a glide, and Kyllene's blast lines are far out, so he goes at about 170% (152% on the Altar; the other three go at 115 to 137% on both maps).

- **Leave it (recommended for now):** a big map is meant to play longer, and a human Aethon player will not survive the way a CPU that always holds toward the stage does. Worth another look once you have played a few matches there.
- **Pull Kyllene's side blast lines in:** every fighter dies earlier there; the map loses some of its room.
- **Weaken Aethon's recovery further:** changes him on the Altar too, where he is in band.

