# Hermes Arena feel lab

Automated feel testing for the pixel Hermes Arena prototype, so Claude (or subagents) can keep improving how the game plays without Justin testing every change.

- `spec.json`: the targets (Smash Ultimate numbers scaled to this game), with pass and warn bands.
- `lab.cjs` + `probes.js`: drives the real game headless with scripted inputs and scores it. `sweep.cjs` compares candidate changes.
- `clips.cjs` + `scenarios.js`: GIFs and contact sheets for a visual check (`REVIEW.md`).
- `PROTOCOL.md`: how one improvement round works. `LOG.md`: what changed and why. `QUESTIONS.md`: decisions left for Justin.

Requires Node with Playwright + Chromium, ffmpeg and ImageMagick 6 (`convert`, `montage`; there is no `magick`). Run from this folder: `node lab.cjs`.
