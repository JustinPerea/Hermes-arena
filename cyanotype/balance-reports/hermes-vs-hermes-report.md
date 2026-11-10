# Balance report: Hermes vs Hermes

Generated 2026-11-09 13:12 UTC from the game code, against the roster doc snapshot of 2026-11-09 (rev 338). **1 checks fail.**

## Failing

- Doc vs code: 2 move mismatches and 0 physics mismatches

## Engine rules

19 of 19 shared engine rules verified in the running engine (tools/rules-test.cjs).

- Pass: Side special is once per airtime (first: special_s, second: nothing, still airborne: true)
- Pass: Side special comes back on landing
- Pass: Up special is once per airtime
- Pass: Being hit gives specials back
- Pass: Full smash charge = 1.4x damage (16.0% -> 22.4%)
- Pass: Full smash charge launches harder (launch 10.2 -> 15.8)
- Pass: Gravity is halved in hitstun (dvy 0.360 vs gravity 0.72)
- Pass: Shieldstun scales with damage (ftilt 9%: 9 frames, rule says 9)
- Pass: A launched fighter has only air jumps (jumpsUsed 1)
- Pass: Fresh ledge grab is safe, then hittable after 30 frames (invuln 30)
- Pass: Ledge regrab gives no invulnerability or jump
- Pass: Armor absorbs a weak hit (damage taken, no flinch) ({"state":"move","move":"ftilt","dmg":2})
- Pass: Armor does not hold against a hit over its threshold
- Pass: Counter strike = 1.2x absorbed, 8% to 18% (absorbed 2/9/16 -> 8/11/18)
- Pass: Counters do not catch projectiles
- Pass: Trip knocks down with no launch
- Pass: Losing a stock respawns the fighter
- Pass: Last stock gone ends the match with a winner (stocks 0, KOs by P1 2)
- Pass: Training (infinite stocks) never ends

## 1. KO table

Damage the victim has **before** the move at which it KOs. A KO means crossing the side or top blast line before hitstun ends, with no DI and no input from the victim. "Center" stands the victim at x 640, "Ledge" at x 960 (the ledge is at 980). Back-angled moves are used facing away from the ledge. Charged columns are a full 60-frame smash charge. Moves whose strongest hit has knockback under 6 or a downward angle are left out.

- Target (best grounded kill move vs Hermes from center, 85 to 115%): Hermes's fsmash at 91%: **pass**

| Attacker | Move | Kind | Victim | Hit (dmg / kb / angle) | Center | Ledge | Center charged | Ledge charged |
|---|---|---|---|---|---|---|---|---|
| Hermes | Herald's Strike (fsmash) | smash | Hermes | 16 / 9 / 35 | 91% | 57% | 43% | 18% |
| Hermes | Split Talaria (dsmash) | smash | Hermes | 13 / 8 / 160 | 98% | 62% | 50% | 24% |
| Hermes | Whirlwind Rotor (usmash) | smash | Hermes | 8 / 8 / 90 | 112% | 110% | 59% | 58% |
| Hermes | Courier's Slide (dash_attack) | ground | Hermes | 8 / 6 / 70 | 188% | 185% |  |  |
| Hermes | Talaria Rise (special_u) | special | Hermes | 6 / 6 / 85 | 170% | 168% |  |  |
| Hermes | Winged Mule Kick (bair) | aerial | Hermes | 13 / 7 / 145 | 136% | 92% |  |  |
| Hermes | Sky Somersault (uair) | aerial | Hermes | 8 / 6 / 90 | 169% | 167% |  |  |
| Hermes | Messenger's Chop (fair) | aerial | Hermes | 12 / 6 / 40 | 179% | 124% |  |  |
| Hermes | Whirlwind Fling (throw_b) | throw | Hermes | 10 / 7 / 150 | 132% | 90% |  |  |
| Hermes | Skyward Toss (throw_u) | throw | Hermes | 7 / 7 / 90 | 143% | 141% |  |  |
| Hermes | Gust Palm (throw_f) | throw | Hermes | 8 / 6 / 35 | 173% | 121% |  |  |

## 2. Doc vs code

Compares the move and physics tables in the roster doc with the code. Numbers are compared as sets (the doc's "8 (late 5)" is {8, 5}); Psychopomp Guard's strike damage is set by the shared counter rule and is not compared.

- Aethon: in the doc, not in the code yet
- Kairos: in the doc, not in the code yet
- Iris: in the doc, not in the code yet

### Numbers (2 mismatches)

| Fighter | Slot | Field | Doc | Code |
|---|---|---|---|---|
| Hermes | Up air | Damage | 4 + 8 | 4 / 6 / 8 |
| Hermes | Up air | KB | 6 | 2 / 5 / 6 |

### Move names (0 differ)

The doc's move names against the animation labels in the code. Not counted as a failure.


## 3. Frame check

Startup is the first frame that can hit (from 0). Shield is frame advantage when the move's last hit is blocked: shieldstun (round(2 + 0.8 x damage)) minus the attacker's remaining frames; for aerials, minus landing lag. Negative means the defender acts first.

- No move is both faster and stronger than the same slot on another fighter (only one fighter is in the code, so there is nothing to compare yet).

| Fighter | Move | Kind | Startup | Active | Total | Land lag | Max dmg | Max kb | On shield |
|---|---|---|---|---|---|---|---|---|---|
| Hermes | Split Talaria (dsmash) | smash | 11 | 11-13, 17-19 | 46 |  | 13 | 8 | -17 |
| Hermes | Whirlwind Rotor (usmash) | smash | 12 | 12-14, 16-18, 20-23 | 50 |  | 8 | 8 | -22 |
| Hermes | Herald's Strike (fsmash) | smash | 15 | 15-17 | 52 |  | 16 | 9 | -22 |
| Hermes | Messenger's Flurry 1 (jab1) | ground | 3 | 3-4 | 16 (cancel 10) |  | 2 | 1 | -3 |
| Hermes | Knob Jab (pummel) | ground | 4 | 4 | 16 |  | 1.5 | 0 |  |
| Hermes | Messenger's Flurry 2 (jab2) | ground | 4 | 4-5 | 18 (cancel 11) |  | 2 | 1 | -3 |
| Hermes | Scything Sweep (dtilt) | ground | 5 | 5-7 | 20 |  | 6 | 3 | -8 |
| Hermes | Messenger's Flurry 3 (jab3) | ground | 6 | 6-9 | 30 |  | 4 | 5 | -19 |
| Hermes | Courier's Slide (dash_attack) | ground | 6 | 6-16 | 34 |  | 8 | 6 | -20 |
| Hermes | Caduceus Arc (utilt) | ground | 6 | 6-12 | 28 |  | 7 | 5 | -14 |
| Hermes | Swift Snatch (grab) | ground | 7 | 7-9 | 30 |  | 0 | 0 |  |
| Hermes | Twin Serpent Thrust (ftilt) | ground | 7 | 7-9 | 26 |  | 9 | 5 | -10 |
| Hermes | Running Snatch (dash_grab) | ground | 9 | 9-11 | 36 |  | 0 | 0 |  |
| Hermes | Rising Sweep (getup_attack) | ground | 14 | 14-16, 20-22 | 34 |  | 6 | 4 | -7 |
| Hermes | Lip Vault (ledge_attack) | ground | 18 | 18-21 | 32 |  | 8 | 5 | -6 |
| Hermes | Talaria Rise (special_u) | special | 6 | 6-8, 12-14, 18-20, 24-26 | 42 | 14 | 6 | 6 | -7 |
| Hermes | Psychopomp Guard strike (special_d_hit) | special | 6 | 6-9 | 34 |  | 12 | 8 | -16 |
| Hermes | Swift Courier (special_s) | special | 8 | 8-18 | 38 | 12 | 7 | 5 | -4 |
| Hermes | Cyclone Wheel (nair) | aerial | 5 | 5-18 | 36 | 7 | 8 | 5 | +1 |
| Hermes | Sky Somersault (uair) | aerial | 5 | 5-6, 10-12 | 34 | 8 | 8 | 6 | 0 |
| Hermes | Winged Mule Kick (bair) | aerial | 7 | 7-10 | 30 | 9 | 13 | 7 | +3 |
| Hermes | Messenger's Chop (fair) | aerial | 10 | 10-13 | 38 | 12 | 13 | 6 | 0 |
| Hermes | Talaria Stomp (dair) | aerial | 14 | 14-17 | 40 | 18 | 12 | 6 | -6 |
| Hermes | Gust Palm (throw_f) | throw | 12 | 12 | 34 |  | 8 | 6 |  |
| Hermes | Skyward Toss (throw_u) | throw | 16 | 16 | 40 |  | 7 | 7 |  |
| Hermes | Whirlwind Fling (throw_b) | throw | 20 | 20 | 40 |  | 10 | 7 |  |
| Hermes | Sandal Stamp (throw_d) | throw | 22 | 22 | 40 |  | 7 | 5 |  |

_0.3 s. Run again with `node tools/balance.cjs <outdir>` from the source folder._
