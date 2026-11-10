# Contributing

Thanks for looking. Small, focused changes are easiest to review.

## Setup

```
(cd mcp  && npm install)
(cd live && npm install)
```

Node.js 24 or newer. Before sending a change, `npm test` and `npm run check` should pass in the package you touched.

## Layout rules

Read `mcp/docs/ARCHITECTURE.md` first; it takes five minutes. The short version:

- Layers: `core/` is the format, `ops/` are pure operations, `mcp/` only wires. No MCP import below `mcp/`, no file access in `ops/`.
- One file per operation, one concern per file.
- English only: code, comments, docs, tool descriptions and every message. Messages live in `src/core/messages.ts`.
- Errors are a `MineimatorError` with a stable code. Please do not make clients parse sentences.
- No machine-specific paths in `src/`. Add an environment variable to `src/config.ts` instead.
- A format fact needs a source: the Mine-imator source at a pinned commit, or a measurement in real projects. If you could not
  check something, say so in the docs rather than stating it as fact.
- Do not commit someone else's project files. Tests and examples use the generated scene in `mcp/scripts/example-scene.ts`.
  Tests on real projects are opt-in through `MINEIMATOR_ARCHIVE`.
- A validator rule must still pass every real project you can test it on. Calibrate before you enforce.

## Tests

- `npm test` runs without Mine-imator installed. Tests that need an install or real projects are skipped unless
  `MINEIMATOR_HOME` or `MINEIMATOR_ARCHIVE` is set.
- `live/` has an opt-in test that drives the real window (`MINEIMATOR_LIVE=1 npm run test:live`). Run it only when nothing
  important is open in Mine-imator.

## Pull requests

- If you changed the example scene or the pose schema, run `npm run build:data` in `mcp/` and commit the result.
- Update `CHANGELOG.md` and the tool table in the README when a tool changes.
- Say what you ran. If you tried the change in Mine-imator, say which version.

By contributing you agree that your work is released under the MIT license.
