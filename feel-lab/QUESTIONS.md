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

## Q4. Stilled Instant gives Kairos nothing. Change it? (answered: Kairos is immune to his own field, done in v31; cast length still open)

Before v31 the field slowed Kairos too, and the CPU got hit out of the cast most of the time. Justin: he should be immune. Done, and the CPU now casts it only on a foe who cannot answer in time (LOG.md, v31): safe, about 8% net damage per cast, but under one cast a match, so it does not move match results.

Still open: the cast is 40 frames, 16 before the field opens. That is why it can only be used on a foe who is already stuck.
- **Shorten it to 28 frames (recommended to try):** with immunity this measured +0.07 stocks a match on the Altar and +0.04 on Kyllene under the older, looser CPU rule. It would let the field be used in neutral, which is what a zoner wants it for.
- **Keep 40:** it stays a follow-up tool only.

Try it: `node lab.cjs --set "CHARS.kairos.anims.dspec.total=28"`.

## Q5. Grounded attacks no longer slide off the edge (done in v30; say if you want it back)

A grounded attack, grab or roll now stops at the edge of what its fighter stands on, as in Smash; specials (Swift Courier, Aspis Rush, Rainbow Arc) still leave it. Before, shield pushback at the lip could shove an attacker off backwards in the middle of a smash, which was most of Aethon's CPU self-destructs and could happen to a player too. It is one block in `physics()`.

- **Keep (recommended).**
- **Revert:** dash attacks and rolls carry off the edge again.

