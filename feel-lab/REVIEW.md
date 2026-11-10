# Clip review rubric

For a reviewer (ideally a fresh subagent that did not make the change) looking at `out/clips/*-sheet-N.png`.
Each tile shows the game frame number (`f24`), P1's move and frame, the other fighter's state, and `HITLAG` / `KO-FX` flags.
Sheets sample every 2nd frame (every 3rd for `cpu_exchange`), so 30 tiles ≈ 1 second of game time.

Score each scenario 1–5 on every line below and cite tile frame numbers as evidence. Report only what you can see.

| Criterion | 5 means | Typical failures |
|---|---|---|
| **Anticipation** | The windup reads before the hit; you can tell which move is coming | Hit appears with no windup; windup pose identical to idle |
| **Impact** | On contact both fighters freeze for hitlag, the victim is visible and flashes, a spark/shake marks the hit | Victim hidden behind effects; no freeze; freeze far too long |
| **Readability** | At every tile you can tell who is who, where each fighter faces, and what each is doing | Fighters fully overlap; effects cover bodies; HUD covers action |
| **Launch** | The launch direction and strength are obvious; trail/smoke follows the path; weak hits barely move the foe | Victim teleports; launch angle unclear; strong and weak hits look alike |
| **Flow** | Successive actions connect with no dead frames; presses chain; landing is crisp | Long idle gaps between inputs that should chain; sliding poses |
| **Camera** | Both fighters stay in frame; zoom/slow-mo serves the moment and ends cleanly | Victim leaves frame early; zoom jitters; slow-mo drags |

Output format (append to the round's entry in LOG.md, and give the same to the caller):

```
scenario-fighter: anticipation 4, impact 2, readability 2, launch 4, flow 4, camera 4
- impact/readability f24-f38: victim not visible during hitlag; white hit flash blends into the white gust burst
- ...
Top fix: <one concrete, small change and where in the code it would go>
```

Severity: anything scored 1–2 is a finding for the next round. Ignore pure art taste (palette, character design): Justin decides those.
