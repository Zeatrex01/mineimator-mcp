# Changelog

## 0.1.0

First public release.

`mineimator-mcp`

- Edits `.miproject` files (format 34, Mine-imator 2.0.2) in memory and saves new files; never overwrites.
- Built-in library from an installed Mine-imator (`MINEIMATOR_HOME`, read only): `list_library`, library characters and mobs,
  blocks, items and particle presets.
- Tools to build and animate a scene: `place_blocks`, `place_character`, `place_prop`, `give_item`, `place_particles`,
  `place_set`, `set_parent`, `set_skin`, `set_pose`, `add_keyframe`, `animate_path`.
- Cameras and output: `set_camera`, `set_shots` (cuts inside one export), `set_work_camera`, `set_output`.
- Cues for sound, text and narration (`add_cue`, `export_cues`), written next to the saved project.
- `validate_project` checks sections, ids, references, rigs, keyframes, cameras and the export region. `render` hands off the
  manual export steps.
- A hand-authored pose library for the Steve rig, including walk, run and jump keys.
- Three example scenes and the script that generates them.
- Stable error codes; every message is in one English file.

`mineimator-live`

- Windows only. Launch, focus, open a project, play, pause, go to start, window-only screenshots, keys and clicks.
- Refuses to open a project while the window title shows unsaved changes.
