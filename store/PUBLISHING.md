# Publishing to the Figma Community

How a new version of the plugin reaches its [Figma Community page](https://www.figma.com/community/plugin/1701522206126108009). Figma publishes from its desktop app, from the plugin built in `dist/`. The text and images the publish dialog asks for are in [`LISTING.md`](LISTING.md).

New airlines and fixed marks need no new version: the plugin loads them from the soaring-symbols package on jsDelivr. Publish when the plugin's own code or listing changes, or when it moves to a new release line of the package (see "Where the data comes from" in `AGENTS.md`).

## Before publishing

1. Start from an up-to-date `main` with nothing uncommitted, and run the checks:

    ```bash
    npm run typecheck && npm run lint && npm test
    ```

2. Try the UI with `npm run preview` and `dev/host.html` (see "Try the UI without Figma" in `README.md`), in both themes, then in the Figma desktop app (**Plugins → Development → Soaring Symbols**, imported from `manifest.json`): insert a mark by clicking, with a frame selected and without, drag one onto the canvas, and try it in FigJam.
3. If the UI changed, render the thumbnail again in [soaring-symbols/brand](https://github.com/soaring-symbols/brand) (`npm run render` there) and copy `exports/figma/thumbnail.png` (and `icon.png`, if the mark changed) into `store/`.
4. If a feature changed, update the description and tagline in `LISTING.md`.

## Build

```bash
npm run build
```

Figma uploads `dist/code.js` and `dist/ui.html`, the files `manifest.json` names, so build right before publishing. Never change `id` in `manifest.json`: Figma would take it as a new plugin.

## Publish

1. In the Figma desktop app, open **Plugins → Development → Manage plugins in development** and choose **Publish** (for a published plugin, its new version) on Soaring Symbols. The menu's labels may change.
2. Write what changed in the version notes, for people who use the plugin.
3. If the listing changed, paste the fields from `LISTING.md` and upload `store/icon.png` (128 × 128) and `store/thumbnail.png` (1920 × 1080).
4. Publish. Figma reviewed the plugin's first publication; if it asks for a review again, the version goes live once it is approved. Check the [Community page](https://www.figma.com/community/plugin/1701522206126108009) and run the published plugin from the Community, not the development one.

## After publishing

- Push the commits the version was built from.
- If the update brings a change users notice, add a line for it under `### Ecosystem` in the release notes of the soaring-symbols release that shipped the feature (`docs/RELEASING.md` in the library repo says how). A plugin counts once its update is live on the Community, not while in review.
- Keep `LISTING.md` in step with what is live, and drop the "in review" note from `README.md` once the first publication is approved.
