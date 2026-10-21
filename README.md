# AunuCore Youtube Gift

Desktop GIFs experiment for YouTube desktop comments — workaround research for issue #93.

**Current build: AunuCore youtube gift (phase test #4)**

Since 14 October 2026, YouTube rejects the `tenorId` field on desktop
`comment/create_comment` requests with `400 INVALID_ARGUMENT`.
This project intercepts that request, removes `tenorId` recursively,
and — only when a real `encryptedBlobId` from YouTube's own image-upload
flow is available — fills `imageAttachment` for an animated `.webp`.

> `encryptedBlobId` cannot be generated or guessed on the client.
> Mock values in this repo are for unit tests only; a fake blob id sent
> to the live API will still be rejected by the server.

## Naming rule for experiments

Every attempt gets a new name by bumping only `PHASE_TEST_NUMBER` in
`extension/src/main.js`:

- `AunuCore youtube gift (phase test #1)` ← current
- `AunuCore youtube gift (phase test #2)`
- `AunuCore youtube gift (phase test #3)` — and so on

## Structure

```
extension/
  src/
    main.js       # interceptor + pure payload transformer
    main.test.js  # node --test suite for main.js (10 tests)
    picker.js     # GIF button in the comment box + Tenor picker panel
    picker.test.js # node --test suite for picker.js (9 tests)
    sw.js         # service worker: Tenor key harvest + API + fallback
    sw.test.js    # node --test suite for sw.js (7 tests)
    content-bridge.js # MAIN-world picker <-> service worker bridge
    main.bundle.js  # GENERATED bundle (picker+main) injected via chrome.scripting
tools/
  build-bundle.mjs  # builds main.bundle.js — run after editing picker/main
    loader.js     # injects main.js as a module into the YouTube page
manifest.json     # root manifest (Load unpacked from repo root)
root-loader.js    # loader used by the root manifest
CHANGELOG.md      # every experiment, change and optimization
docs/
  PENJELASAN-KODE.md  # what each file does, what changed per phase
  RELEASES.md         # release scheme: phase tests -> v1.0.0
```

## Releases

Experiments ship as GitHub **pre-releases**:
`v0.3.0-phase-test.3` (current), `v0.4.0-phase-test.4`, ...
The first stable release will be **`v1.0.0`** — its notes will
summarize every phase-test experiment and optimization.
See `docs/RELEASES.md` and `CHANGELOG.md`.

## How to use the GIF picker (phase test #2)

1. Load the extension (steps below), open a YouTube **watch** page.
2. Click the comment input — a **GIF** button appears in the comment box.
3. Click it: the picker panel opens.
   - **Search (Tenor):** no API key needed since phase test #3.
     The service worker reads the keys tenor.com ships to its own
     site scripts, caches them, and calls Tenor's API with a
     G-rating filter. Type a query, press Enter, click a GIF.
     (A personal key in `PICKER_CONFIG.tenorApiKey` still works as
     a developer override.)
   - **Direct URL mode (no key needed):** paste any direct `.gif` /
     `.webp` link and click **Pakai URL**.
4. The chosen GIF is shown in the panel and stored as the *pending
   GIF* (check `window.__AUNUCORE_YT_GIFT__.getPendingGif()`).
   When you post the comment, the interceptor attaches the GIF as
   `tenorId` and, if YouTube answers 400 INVALID_ARGUMENT
   ("blocked"), retries the same request up to 12 times over
   ~30 seconds — a blocked request posts nothing, so retries can
   never double-post. The panel reports the verdict (posted /
   blocked / GIF refused). Direct-URL GIFs have no Tenor id and
   are posted as plain text.

## Load in Chrome (unpacked)

1. Extract the zip.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select the extracted
   `aunucore-youtube-gift` folder (it contains a root `manifest.json`).
   The `extension/` subfolder also works — it has its own manifest.
4. Open a YouTube page and check DevTools Console for:
   `[AunuCore youtube gift (phase test #1)] interceptor aktif`

## Run tests

```bash
node --test extension/src/*.test.js
node tools/build-bundle.mjs   # rebuild bundle after editing picker.js / main.js
```

Phase test #1 verified: the interceptor can rewrite comment
payloads. Phase test #2 adds the GIF button + picker and the
pending-GIF wiring. Phase test #3 makes Tenor search work without
a personal API key (service worker reads the keys tenor.com
serves its own scripts). Phase test #4 attaches the GIF for real:
studying the reference extension (rayytor/desktop_gifs) showed
the working approach is `tenorId` + persistent retries against
the intermittent post-14-October blocks — the WebP upload /
`encryptedBlobId` route from the original plan was dropped
because no working implementation of it exists. Live result from
the maintainer's network is the remaining unknown.

---
By AunuCore — AunuHost
