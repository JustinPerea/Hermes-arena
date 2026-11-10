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

## Q4. Stilled Instant gives Kairos nothing. Change it? (open)

You said to try the slow field as is (it slows everyone, Kairos included). Measured over 200 CPU Hard matches where only one Kairos uses it: about even on the Altar, and about 0.2 stocks a match worse on Kyllene when he used it freely. Two reasons: he stands inside it for the 0.8 s the cast takes to finish at half speed, and a 40-frame move that deals no damage costs him the exchange. So the CPU now uses it rarely (under once a match).

- **Kairos immune to his own field, and a shorter cast, 40 to 28 frames (recommended):** measured as roughly even to slightly ahead (+0.07 Altar, +0.04 Kyllene), so at least no longer a liability. A real payoff probably needs more on top (a longer field, or shots keeping full speed inside it).
- **Keep as is:** it stays a move the CPU, and a good player, mostly avoids.

Try it without editing: `node lab.cjs --set "slowOf=function(F){ if (F.stocks<=0) return 1; for (const q of fields) if (q.own!==F && Math.hypot(F.x-q.x,F.y-24-q.y)<q.r) return 0.5; return 1; }; CHARS.kairos.anims.dspec.total=28"`.

## Q5. Grounded attacks no longer slide off the edge (done in v30; say if you want it back)

A grounded attack, grab or roll now stops at the edge of what its fighter stands on, as in Smash; specials (Swift Courier, Aspis Rush, Rainbow Arc) still leave it. Before, shield pushback at the lip could shove an attacker off backwards in the middle of a smash, which was most of Aethon's CPU self-destructs and could happen to a player too. It is one block in `physics()`.

- **Keep (recommended).**
- **Revert:** dash attacks and rolls carry off the edge again.

