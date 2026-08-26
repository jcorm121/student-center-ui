# Cornell Student Center UI

A browser extension that improves the interface of Cornell Student Center while leaving its underlying PeopleSoft behavior intact.

## Run locally

This initial scaffold has no dependencies or build step.

1. Open `chrome://extensions` in Chrome, Edge, Arc, or another Chromium browser.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project directory.
5. Open Cornell Student Center and sign in normally.

Student Center renders its application inside a PeopleSoft target frame. The extension injects into matching subframes so it can enhance the actual page rather than only the surrounding portal shell.

After changing a file, select **Reload** on the extension card and refresh Student Center.

Run the dependency-free parser test with:

```sh
node test/schedule.test.js
```

Open `test/fixture.html` to preview the dashboard with synthetic data. The fixture intentionally contains no real student information.

## Structure

- `manifest.json` — Manifest V3 configuration and narrowly scoped Cornell host access.
- `src/background.js` — extension lifecycle and default settings.
- `src/content/` — page enhancement lifecycle and Student Center styles.
- `src/popup/` — toolbar popup for enabling the extension and choosing a theme.
- `test/` — synthetic Student Center fixture and schedule-parser coverage.

## Development principles

- Never collect credentials or intercept Cornell authentication.
- Prefer additive, reversible enhancements over changing PeopleSoft behavior.
- Keep selectors scoped beneath `.scu-extension-enabled`.
- Preserve keyboard navigation and accessible names.
- Treat Student Center data as private; do not transmit it off-device.

## License

[MIT](LICENSE)
