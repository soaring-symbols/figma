# AGENTS.md

Instructions for AI coding agents working on the Soaring Symbols Figma plugin. Human-facing docs live in `README.md`.

## Project

A Figma and FigJam plugin that searches the [Soaring Symbols](https://github.com/soaring-symbols/soaring-symbols) airlines and alliances and inserts their logos, icons and tails as vector layers.

- `manifest.json` — the plugin manifest. `id` (`1701522206126108009`) was assigned by Figma when the plugin was first published, as [this Community page](https://www.figma.com/community/plugin/1701522206126108009); never change it, or Figma treats the plugin as a new one.
- `src/code.ts` — the main thread, which owns the document: inserts a mark (into the single selected frame, component or section, else at the viewport center), handles marks dropped from the UI (`figma.on('drop')`) and keeps the settings in `figma.clientStorage`.
- `src/ui.ts` + `src/ui.html` — the UI iframe: the list and search (alliances with marks first, then airlines), the grid of marks for an airline or alliance, size and mono color controls. It fetches everything; the main thread never touches the network.
- `src/data.ts` — pure helpers shared by the UI and the tests: data URLs (`DATA_LINE`), search ranking (`searchAirlines`, `searchAlliances`), asset tiles for an airline or an alliance (`MarkOwner`; `isAirline` tells them apart, alliances have icons and logos under `alliances/<slug>/` and no tail) (current ones, and with a `history` entry an older set under `history/<since>/`; `earlierMarks` lists them newest first), tinting mono SVGs.
- `src/messages.ts` — the message types between the UI and the main thread, and the default settings.
- `scripts/build.js` — esbuild: `src/code.ts` → `dist/code.js` (ES2017, for Figma's main-thread engine), and `src/ui.ts` bundled and inlined into `dist/ui.html`, since Figma loads the UI as one HTML string.
- `test/` — unit tests for `src/data.ts`, run by Node's test runner with type stripping.
- `store/` — what the Figma Community page shows: `LISTING.md` (the text for the publish dialog), and `icon.png` and `thumbnail.png`, copied from `exports/figma/` in [soaring-symbols/brand](https://github.com/soaring-symbols/brand), where they are rendered; change them there first. Update `LISTING.md` when a feature changes, and the thumbnail when the UI does.

### Where the data comes from

The UI loads `airlines.json`, `alliances.json` and the SVGs from the published `soaring-symbols` npm package through jsDelivr, pinned to one release line: `https://cdn.jsdelivr.net/npm/soaring-symbols@<DATA_LINE>/dist/…`, with `DATA_LINE` (e.g. `"0.4"`) in `src/data.ts`. Every patch release reaches the plugin without an update; a breaking minor release never does until the plugin moves to it. If the list can't be loaded or isn't usable (`isAirlineList`), the UI falls back to `listAirlines()` from the bundled `soaring-symbols` dependency and says so; `alliances.json` comes from the same release, falling back quietly to `listAlliances()` (`isAllianceList`).

Before loading, the UI asks jsDelivr which release the line points at (`RESOLVE_URL` on `data.jsdelivr.com`, e.g. `0.4.0`) and loads `airlines.json` and every SVG from that exact release (`setDataVersion`). A line URL keeps its address when a release replaces the file behind it, and the browser cache in Figma, which jsDelivr lets keep a file for 7 days, would keep showing the old logo. When the release can't be resolved, everything loads from the line as before.

`manifest.json` allows only `https://cdn.jsdelivr.net` and `https://data.jsdelivr.com` in `networkAccess`; loading from anywhere else means adding the domain there.

When the library releases a new minor line, update the plugin in one change: set `DATA_LINE`, move the `soaring-symbols` dependency to the line (`npm install soaring-symbols@^0.5.0`, plus `bun install`), adapt the code, and publish a new version from the Figma app.

## Commands

| Command             | What it does                                            |
| :------------------ | :------------------------------------------------------ |
| `npm run build`     | Build `dist/` (git-ignored); Figma loads it from there. |
| `npm run watch`     | Rebuild on change.                                      |
| `npm run typecheck` | `tsc --noEmit`.                                         |
| `npm run lint`      | ESLint, then Prettier in check mode.                    |
| `npm run format`    | Prettier.                                               |
| `npm test`          | `node --test` on `test/**/*.test.ts` (Node 22.18+).     |

Dependencies are tracked in both `package-lock.json` and `bun.lock`; update both together.

## Gotchas

- Mono SVGs are drawn in `currentColor`, which `figma.createNodeFromSvg` turns into black, so the UI replaces it with the chosen color (`tintSvg`) before sending a mark.
- Marks are square (a `64` viewBox for logos, `24` for icons and tails); the main thread scales them with `rescale`, which keeps the vectors in proportion, never `resize`.
- Drag and drop uses Figma's `pluginDrop` message from the UI's `dragend`; its `dropMetadata` must stay plain JSON.
- In the UI, a key handler that moves focus to a button must `preventDefault()`, or the same key press clicks that button.
- The main thread can only be tried inside Figma. The UI can be checked in a browser by loading `dist/ui.html` in an iframe and posting it an `init` message, as `code.ts` does.

## Conventions

- Prettier (4 spaces, single quotes, no semicolons, trailing commas, width 80) and ESLint with `typescript-eslint`, including a blank line before `return`, as in the library repo.
- Commits follow Conventional Commits, e.g. `feat: add a tail filter`, `fix: keep mono color on reopen`.
