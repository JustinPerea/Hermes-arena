# Hermes Desktop plugin (pixel game)

Turns `game/pixel-hermes.html` into a Hermes Desktop plugin without changing the game file.

```
node plugin/build.mjs                              # writes plugin/dist/ (ignored by git)
NODE_PATH=$(npm root -g) node plugin/test.cjs      # 43 checks in Chrome; add --shot out.png for screenshots
```

| Output | What it is |
|---|---|
| `dist/hermes-arena/plugin.js` | The plugin. Copy the `hermes-arena` folder to `~/.hermes/desktop-plugins/` and reload desktop plugins (⌘K). It adds a "Hermes Arena" entry to the sidebar and a page at `/hermes-arena`. |
| `dist/mount-test.html` + `dist/engine.js` | A stand-in for the app shell (sidebar, a text box, a pane) to try the mount by hand: open the HTML file in a browser. |

The cyanotype build (`cyanotype/dist/hermes-arena/plugin.js`) uses the same plugin id, `hermes-arena`. Install one or the other, not both.

## How it works

Hermes Desktop loads a plugin as one ES module that may import only `react`, `react/jsx-runtime` and `@hermes/plugin-sdk`. A page is mounted and unmounted every time the user opens and leaves it, and a module cannot be unloaded, so everything the game starts has to be stoppable.

The game is written as a page script: it finds its elements with `document.getElementById`, listens on `window`, saves to `localStorage` and runs one `requestAnimationFrame` loop forever. The build wraps that script in a function, `pxhGame(document, addEventListener, requestAnimationFrame, localStorage, location)`, whose five parameters stand in for the globals of the same name:

- `document` looks elements up in a Shadow DOM that holds the game's markup and CSS. The app's styles cannot reach in and the game's cannot leak out. `:host{all:initial}` also stops inherited text styles.
- `addEventListener` records every listener so `destroy()` can remove it. Key listeners go on the game's own root, so the game hears keys only while focus is inside it. A key the game uses does not travel on to the app; anything with Cmd, Ctrl or Alt is left to the app.
- `requestAnimationFrame` stops calling the game once it is destroyed.
- `localStorage` is the plugin's `ctx.storage` (same keys: `pxh-sfx`, `pxh-match`, `pxh-tune`).
- `location` is `{search: ''}`.

`createPixelArena(host, {storage})` mounts a game and returns `{destroy(), pause(), state()}`. `destroy()` removes the listeners, stops the loop, closes the audio context and removes the DOM. The React page component calls it in an effect and destroys it in the cleanup; `ctx.onDispose` destroys any game still alive when the plugin is reloaded.

## Decisions made here (Justin can change any of them)

- **Play layout.** The plugin shows the stage, the controls list, Tuning and the touch buttons. The page header, the animation sheet and the design notes are hidden, and the sheet's tiles stop redrawing. `node plugin/build.mjs --full` keeps everything.
- **The stage fits the pane.** Its width is the smaller of the pane's width and what the pane's height allows, up to 1,200 px (the standalone page stops at 900 px). A frame costs about 0.2 ms at that size in Chrome.
- **Focus.** The game takes keyboard focus when the page opens. When focus leaves it (a click elsewhere in the app, the command palette, another window) a running match pauses and the stage shows "Click to play" in its top right corner (the one corner no screen draws in). The standalone page does not pause; it has the window to itself.
- **Fonts** still come from Google Fonts, through one `<link>` added to the app's document while a game is mounted. Without a connection the page falls back to system fonts; text drawn on the canvas uses the game's own pixel font and is not affected.

## What the build refuses

The build stops with an error if the game starts using something the wrapper does not provide or clean up: a new `document.` or `window.` member, a timer, a new window-level event, `fetch`, a page-level CSS selector other than the three it maps, or if the names the wrapper reaches for (`SFX`, `flow`, `go`) are gone. Extend the wrapper in `build.mjs` first, then add the name to the allowed list.

## What the checks cover, and what they do not

`test.cjs` part A drives the mount test page: mounting, stage fit at three window sizes, style isolation, keyboard play, keys not reaching the host, Cmd shortcuts passing through, pause on focus loss, storage, and that an unmount leaves no render loop, window listener, audio context or DOM behind, also after four mounts.

Part B runs `plugin.js` through the app's own loading steps. The import scan and rewrite are copied at run time from the hermes-agent checkout (`~/.hermes/hermes-agent/apps/desktop/src/contrib/runtime-loader.ts`, or `--hermes <path>`); without a checkout the test falls back to the documented pattern and says so. The module is then imported from a blob URL with shim modules, registered against a stand-in `ctx`, and mounted through a 20-line stand-in for React, including the effect, cleanup, effect order of StrictMode.

The checks do not run the real app: its pane layout, its focus handling and its real React are only stood in for.

## Checked by hand in Hermes Desktop (v0.23.0, 2026-11-10)

Installed next to three other plugins and driven with the `agent-desktop` CLI:

- The plugin loads without an error; "Hermes Arena" appears in the Sessions sidebar with the game icon, and the page opens in the main zone.
- The stage fits the pane (1,000 x 797 px), the web fonts load, and the canvas has keyboard focus as soon as the page opens.
- A click on the canvas moves the title screen on; keys start and play a match.
- Switching to another app pauses the match and shows "Click to play".
- Overwriting `plugin.js` hot-reloads it: the old game is taken down and one fresh game is mounted (a match in progress is lost, as with any reload).

Not tried there: a controller, touch, and the Tuning panel.

To repeat it: keys reach the app only while it is the front app, so key presses need `agent-desktop press --headed --app Hermes <key>`; check first that the canvas (accessible name "Playable Altar of the Agora stage...") has the `focused` state, and do not send Enter.
