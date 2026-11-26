# Soaring Symbols for Figma

A Figma and FigJam plugin to search airlines by name, IATA or ICAO code and drop their [Soaring Symbols](https://github.com/soaring-symbols/soaring-symbols) logos, icons and tails into your designs, along with the marks of airline alliances.

> [!NOTE]
> The plugin is [in review on the Figma Community](https://www.figma.com/community/plugin/1701522206126108009). Until it is approved, try it by building it and importing it into the Figma desktop app as described under [Development](#development).

- Search 180+ airlines by name, other names they go by (SWISS), IATA or ICAO code, callsign or slug, and alliances (oneworld, SkyTeam, Star Alliance) by name. Cargo airlines are marked "Cargo", and searching "cargo" lists them.
- Insert a mark by clicking it, or drag it onto the canvas. With a single frame, component or section selected, a clicked mark goes inside it.
- Pick the size of inserted marks (16 to 256 px) and the color of monochrome marks, or use the airline's primary color. Both are remembered.
- Each mark type gets a row with its color, mono and dark-background versions in columns; the dark one is shown on a dark preview.
- Airlines with a stacked logo, the name under the mark, list it beside the horizontal one (e.g. Japan Airlines, Vietnam Airlines).
- Marks come in as editable vector layers, named after the airline (e.g. "Vietnam Airlines icon (mono)").
- Airlines that changed their logo also list their earlier marks, under the years each was used; an inserted one's layer name gives the year it came in (e.g. "Sun PhuQuoc Airways logo (2025)").

## Development

Node 22.18 or newer.

```bash
npm install
npm run build   # or: npm run watch
```

In the Figma desktop app, choose **Plugins → Development → Import plugin from manifest…** and pick `manifest.json`. Run it from **Plugins → Development → Soaring Symbols**.

### Try the UI without Figma

```bash
npm run preview
```

This builds the plugin and serves the repository at `http://localhost:4174`. Open `http://localhost:4174/dev/host.html`, a stand-in for Figma that loads `dist/ui.html` in a 360 × 560 frame, sends it the settings the plugin starts with and logs every message the UI sends, such as the mark a click would insert. Add `?theme=dark` for Figma's dark theme. After a change, run `npm run preview` again, or keep `npm run watch` running beside it and reload the page. Inserting needs Figma itself.

| Command             | What it does                                                       |
| :------------------ | :----------------------------------------------------------------- |
| `npm run build`     | Build `dist/code.js` and `dist/ui.html` with esbuild.              |
| `npm run watch`     | Rebuild on every change.                                           |
| `npm run preview`   | Build, then serve the repository to try the UI in `dev/host.html`. |
| `npm run typecheck` | Type-check with TypeScript.                                        |
| `npm run lint`      | ESLint and Prettier.                                               |
| `npm test`          | Unit tests for the helpers in `src/data.ts` (Node test runner).    |

## Publishing

How to publish a new version to the Figma Community, from the checks to the publish dialog, is in [`store/PUBLISHING.md`](store/PUBLISHING.md); the listing text and images are in [`store/LISTING.md`](store/LISTING.md).

## License

The plugin's code is [MIT](LICENSE). The airline marks are trademarks of their owners; read the package's [Disclaimer](https://github.com/soaring-symbols/soaring-symbols/blob/main/DISCLAIMER.md) before using them.
