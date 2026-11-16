# 🦊 VoxFox

Listen to any webpage with a single click. VoxFox reads articles aloud with natural-sounding
[Kokoro](https://huggingface.co/hexgrad/Kokoro-82M) voices that run **entirely on your device**:
no account, no API key, and no text sent to a server.

This is a fork of [k7d/voxfox](https://github.com/k7d/voxfox) by Kaspars Dancis. It adds Brazilian
Portuguese voices and a few other changes, listed [below](#whats-different-in-this-fork).

The [Chrome Web Store listing](https://chromewebstore.google.com/detail/voxfox/cjmbmpedecfjiklcafgdccdcclnmgkoi)
is the original version and does not include them. To use this fork, [build it from source](#development).

## Features

- **One click** on the toolbar icon (or `⌃⌘V` on Mac, `Alt+Shift+V` on Windows/Linux) starts reading; click again to pause or resume.
- **Smart extraction** with [Defuddle](https://github.com/kepano/defuddle), falling back to Mozilla Readability, so it reads the article and skips the nav, ads, and footer.
- **Read a selection**: highlight text first, or right-click → *Listen to selection*.
- **Floating player** with skip back/forward, speed (0.75×–2×), and a voice picker.
- **Follows along** by highlighting and scrolling to the paragraph being read.
- **22 English voices** (American and British) and **2 Brazilian Portuguese voices** (Dora and Alex).
- **Fast**: uses WebGPU when available (≈6× faster than real time) and falls back to CPU (WASM).

## What's different in this fork

Version 0.2.0, compared with the original 0.1.0:

- **Brazilian Portuguese voices.** Kokoro ships pt-BR voices, but `kokoro-js` only accepts English
  ones and only phonemizes English. VoxFox phonemizes Portuguese itself, following Kokoro's reference
  pipeline ([misaki](https://github.com/hexgrad/misaki)'s eSpeak G2P with `pt-br`), and passes the
  result to the model. Tests check the output matches misaki symbol for symbol. The eSpeak NG data is
  cut down at build time to the pt-BR files, about 0.7 MB instead of 24 MB.
- **Choose which voices the player lists.** A *Voices in the player* checklist in the settings
  filters the floating player's voice menu. The narrator is always included.
- **New extraction chain.** Selection first, then Defuddle, then Readability if Defuddle fails or
  finds under 200 characters, then a plain scan of `<main>`/`<article>`/`<body>`. Extraction never
  touches the network or changes the page, and both are covered by tests.
- **No log noise on the extension's Errors page.** ONNX Runtime warnings and a transformers.js
  download warning no longer show up there; real errors still do.
- **Brazil-colored fox** for the toolbar icon and the player.
- **Unit tests** with `node:test` (`npm test`) and a browser check that fails on any console warning.

## Development

```bash
npm install
npm run build        # → dist/
npm run watch        # rebuild on change
npm run zip          # → voxfox.zip for the Chrome Web Store
```

Load it in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** → pick `dist/`.

The first time you use it, the Kokoro model downloads from Hugging Face and is cached (~330 MB fp32 for
WebGPU, ~90 MB q8 for CPU).

### Tests

```bash
npm test                      # unit tests: pt-BR phonemes, text extraction, player voice list

VOXFOX_TEST=1 npm run build   # adds localhost host permission for automation
node test/e2e.mjs             # loads the extension, reads an article end to end
node test/console-check.mjs   # speaks in English and Portuguese; fails on any console warning or error
node test/audio-check.mjs     # generation speed on WebGPU vs WASM
```

The browser tests use Chrome for Testing from `~/.cache/puppeteer` (or `CHROME_PATH`).

## Architecture

| File | Role |
|---|---|
| `src/background.js` | Service worker: toolbar click, context menu, badge, routing messages |
| `src/content.js` + `src/extract.js` | Injected on click: extracts and chunks text, renders the floating player |
| `src/offscreen.js` | Offscreen document: playback queue, prefetches 3 chunks ahead, Web Audio |
| `src/tts-worker.js` | Web Worker running `kokoro-js` (Transformers.js + ONNX Runtime Web) |
| `src/phonemize-pt.js` | Brazilian Portuguese text → Kokoro phonemes, using eSpeak NG compiled to WASM |
| `src/options.js` | Settings: voice, speed, engine, voices in the player, model pre-download |
| `scripts/espeak-pt.mjs` | Build step: cuts eSpeak NG's data down to the pt-BR files |

ONNX Runtime's WASM files are bundled in `dist/ort/`, and eSpeak NG is bundled in the worker, so no
executable code is loaded from a CDN (required by Manifest V3).

## License

[MIT](LICENSE) © Kaspars Dancis, original author. The Kokoro model, `kokoro-js` and Mozilla Readability
are Apache-2.0; Defuddle is MIT. Portuguese phonemes come from [eSpeak NG](https://github.com/espeak-ng/espeak-ng)
(via `@echogarden/espeak-ng-emscripten`), which is GPL-3.0.
