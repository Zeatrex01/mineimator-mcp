# mineimator-live

An [MCP](https://modelcontextprotocol.io) server that drives the running Mine-imator window on Windows while you watch:
launch, focus, open a project, play and pause, take a screenshot, send keys and clicks. It sits next to `mcp/` (which edits
`.miproject` files without the app) and shares none of its code.

Nothing is installed except the two npm packages (`@modelcontextprotocol/sdk`, `zod`). Windows automation is a small
PowerShell helper (`src/ps/worker.ps1` and `win.cs`, compiled in memory by Windows PowerShell 5.1, one process, stopped after
2 minutes idle). There is no continuous capture: a screenshot is taken only when asked, of the Mine-imator window only, at most
960 px tall, and returned as base64. The server never stores it.

This is the package README. The overview is in the [root README](../README.md).

## Install and connect

```
cd live
npm install
npm test            # unit tests and a helper smoke test (no window is touched)
npm run check       # type check
```

Start it with `node src/main.ts` (stdio). It reads one environment variable: `MINEIMATOR_HOME`, the folder that contains
`Mine-imator.exe`. The default is `C:\Program Files\Mine-imator`; set it to wherever you unpacked the app. The application
is never modified.

```json
{
  "mcpServers": {
    "mineimator-live": {
      "command": "node",
      "args": ["C:/path/to/mineimator-mcp/live/src/main.ts"],
      "env": { "MINEIMATOR_HOME": "C:/path/to/Mine-imator" }
    }
  }
}
```

## Tools

Every result has `ok` and `ms` (the call's duration). Errors look like `{ok:false, error:{code,message}, ms}`.

| Tool | What it does |
|---|---|
| `launch` | Starts Mine-imator if it is not running and waits until the window answers. Never closes or restarts a running one. |
| `focus` | Brings the window to the front and checks that it worked. Every input tool calls it first and refuses (`FOCUS_FAILED`) if Windows says no. |
| `open_project(path, if_unsaved)` | `Ctrl+O`, types the path in the file dialog, `Enter`. Refuses (`UNSAVED_CHANGES`) when the title shows `*`; `if_unsaved:"save"` presses `Ctrl+S` first. Confirms by the window title (the project's inner name or the file name) and says `confirmed:false` when it cannot. |
| `play` / `pause` | `Space` is a toggle, so both compare the picture before and after (two 192x108 grayscale samples) and report what they saw. |
| `go_to_start` | `Enter` (go to start and play), `Space` (pause), `Left` held 600 ms (the marker stops at 0). Reports whether playback stopped; the frame is not read back. |
| `screenshot` | Window-only PNG, downscaled to at most 960 px tall, returned as MCP image content. |
| `press(keys, hold_ms)` | Chords such as `ctrl+s` or `left left`. Refuses `alt+f4`, `f11` and `f12`. |
| `click(x, y, space, button)` | `x,y` in window pixels, or in the last screenshot's pixels with `space:"screenshot"`. |

Shortcuts and where each comes from: [docs/live-shortcuts.md](../docs/live-shortcuts.md).

## Known limitations

- The `play`/`pause` motion check is a heuristic (thresholds in `src/motion.ts`): a still scene looks the same playing or paused.
- Windows may refuse to hand over the focus. The tools then stop instead of typing into another window.
- If Mine-imator runs as administrator, Windows drops input from a normal process. This has not been tried.
- The helper is per-monitor DPI aware, so pixels are physical pixels (tested at display scale 125 %, window 1920x1051).
- A question dialog drawn inside the app (not a Windows window) is invisible to the helper. That is why `open_project`
  refuses when the title shows unsaved changes.
- Windows only.

## Live test (opt-in)

```
MINEIMATOR_LIVE=1 npm run test:live
```

It launches or reuses Mine-imator on screen, opens `../mcp/examples/scenes/walk-cycle.miproject` (or the file in
`MINEIMATOR_TEST_PROJECT`), plays, saves one screenshot to `out/check.png`, pauses, goes to the start, writes timings to
`out/live-report.json`, and leaves Mine-imator open. Run it only when you are watching and the open project has no unsaved changes.

## Scripts

`scripts/steps.ts` runs a list of tool calls in one session and saves each screenshot to `out/step-<n>.png`:

```
node scripts/steps.ts '[["open_project",{"path":"C:/path/to/scene.miproject"}],["go_to_start"],["press",{"keys":"space"}],["screenshot",{"focus":false}]]'
```

`scripts/open-scene.ts <path.miproject>` launches, opens a project, plays it and saves one screenshot.

## Layout

`src/main.ts` is the entry, `server.ts` registers the tools and times them, `tools/*` has one file per tool group, `keys.ts`
`coords.ts` `motion.ts` `paths.ts` `project-meta.ts` are the pure parts, and `ps/` is the Windows helper. Node 24 runs the `.ts`
files directly.
