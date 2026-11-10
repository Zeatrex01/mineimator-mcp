# Mine-imator 2.0.2 keyboard shortcuts used by live control

These are the shortcuts `mineimator-live` relies on and where each comes from.

Source: the Mine-imator repository at commit `eda12dd0db7cb5892fc068491c60259dba0aa154`, read through GitHub raw files.
Base URL for the file names below:
`https://raw.githubusercontent.com/stuffbydavid/Mine-imator/eda12dd0db7cb5892fc068491c60259dba0aa154/GmProject/scripts/`.

How to read the tables: "source" means the behaviour was read in that commit. "Seen" means it was also observed in a
running Mine-imator 2.0.2 on Windows. I could not confirm that the installed 2.0.2 binary was built from exactly that commit.

## Defaults relevant to live control

| Action | Keys | What the source does | Source files |
|---|---|---|---|
| New project | `Ctrl+N` | `action_toolbar_new()` | `app_startup_keybinds` (registration), `app_update_keyboard` (dispatch) |
| Open project | `Ctrl+O` | `action_toolbar_open()` asks to save if `project_changed`, then `project_load()` opens the system file dialog (`file_dialog_open` -> `get_open_filename_ext`) | `action_toolbar_open`, `file_dialog_open` |
| Save | `Ctrl+S` | `action_toolbar_save()` | registration and dispatch files |
| Save as | `Ctrl+Shift+S` | `action_toolbar_save_as()` | same |
| Play / pause (toggle) | `Space` | `action_tl_play()` starts at the current marker, or breaks and rounds the marker if already playing | `action_tl_play` |
| Go to start and play | `Enter` | `action_tl_play_beginning()` moves the marker to 0 (or the region start) and starts playing | `action_tl_play_beginning` |
| Previous frame (hold to scrub) | `Left` | `action_tl_left()` moves the marker by `project_tempo / room_speed` per step, only while not playing | `action_tl_left`, dispatch file |
| Next frame (hold to scrub) | `Right` | same, forward | dispatch file |
| Toggle render mode in the viewport | `F5` | `view_toggle_render()` | registration and dispatch |
| Secondary viewport on/off | `F6` | `action_setting_secondary_view()` | registration and dispatch |

Keys act only when `window_state = ""`, `window_busy = ""` (or the colour picker is open) and no textbox is being edited
(`app_update_keyboard`). A focused text field or an open popup swallows `Space` and `Ctrl+...`.

Modifiers are compared exactly for normal binds, so `Ctrl+Shift+S` does not trigger `Ctrl+S`. Navigation binds
(`W A S D E Q Z C X R`, `Space`, `V` in the viewport) ignore modifiers (`keybind_check`).

## What has no shortcut

| Wanted | Result |
|---|---|
| Go to end | No keybind. Hold `Right`, or click the timeline. |
| Go to start without playing | No keybind. Use `Enter` (goes to start and plays), then `Space` right away to pause, or hold `Left`. The pause lands within a frame or two of 0, not exactly on 0. |
| Export movie | No keybind. Menu *File > Export movie* (`action_toolbar_export_movie`) shows `popup_exportmovie`. It needs mouse clicks. |
| Fullscreen | No keybind and no fullscreen call found in the source. A maximized window is the nearest thing. |

## Window title (used to confirm a project opened)

`app_update_caption` sets the title to `project_name`, then ` *` if there are unsaved changes, then ` - Mine-imator`.
Seen on 2.0.2: `My Scene *  - Mine-imator` (two spaces after the star) with unsaved changes, `My Scene - Mine-imator` after saving.
`project_name` is the name stored inside the file (`project.name` in the JSON), not the file name, so a title check must use
the inner name.

## Seen on the 2.0.2 binary (Windows 11, display scale 125 %)

| Shortcut | Result |
|---|---|
| `Ctrl+O` | A file dialog with a text field appeared 2.7 s later (the app was busy). |
| Typing the path, then `Enter` | The dialog closed in 0.4 s and the project opened (the title confirmed it). |
| `Space` | Started playback (the picture changed); pressed again, it stopped. Checked with two grayscale samples. |
| `Enter`, then `Space`, then `Left` held 600 ms | Playback stopped afterwards. The frame was not read back. |
| `Ctrl+S`, `Ctrl+N`, `F5`, `F6` | Not tried. |

## Unsaved changes

If a project is open with `*` in the title, a stray `Enter` or `Space` can answer Mine-imator's own question dialog, and the project may be
saved without anyone asking for it. That dialog is drawn inside the app, so the helper cannot see it. For this reason `open_project`
refuses to run while the title shows `*`, unless you pass `if_unsaved: "save"`.

## Caveats

- Keybinds can be rebound in the settings tab *Controls*. The table lists the defaults only.
- Dev-mode keys (`F7`, `F9`, `F10`), `F11` (opens the log file) and `F12` (debug info) exist. The live server never sends `F11` or `F12`.
- Opening a project while the current one has unsaved changes shows a three-button question first. The live server notices
  that no file dialog appeared and reports it instead of typing blindly.
