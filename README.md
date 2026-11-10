# Soaring Symbols for Figma

A Figma and FigJam plugin to search airlines by name, IATA or ICAO code and drop their [Soaring Symbols](https://github.com/soaring-symbols/soaring-symbols) logos, icons and tails into your designs.

> [!NOTE]
> The plugin is [in review on the Figma Community](https://www.figma.com/community/plugin/1701522206126108009). Until it is approved, try it by building it and importing it into the Figma desktop app as described under [Development](#development).

- Search 130+ airlines by name, IATA or ICAO code, callsign or slug.
- Insert a mark by clicking it, or drag it onto the canvas. With a single frame, component or section selected, a clicked mark goes inside it.
- Pick the size of inserted marks (16 to 256 px) and the color of monochrome marks, or use the airline's primary color. Both are remembered.
- Marks come in as editable vector layers, named after the airline (e.g. "Vietnam Airlines icon (mono)").
- Airlines that changed their logo also list their earlier marks, under the year each was introduced (e.g. "Sun PhuQuoc Airways logo (2025)").

## Development

Node 22.18 or newer.

```bash
npm install
npm run build   # or: npm run watch
```

In the Figma desktop app, choose **Plugins → Development → Import plugin from manifest…** and pick `manifest.json`. Run it from **Plugins → Development → Soaring Symbols**.

| Command             | What it does                                                    |
| :------------------ | :-------------------------------------------------------------- |
| `npm run build`     | Build `dist/code.js` and `dist/ui.html` with esbuild.           |
| `npm run watch`     | Rebuild on every change.                                        |
| `npm run typecheck` | Type-check with TypeScript.                                     |
| `npm run lint`      | ESLint and Prettier.                                            |
| `npm test`          | Unit tests for the helpers in `src/data.ts` (Node test runner). |

## License

The plugin's code is [MIT](LICENSE). The airline marks are trademarks of their owners; see the [Soaring Symbols README](https://github.com/soaring-symbols/soaring-symbols#readme).
