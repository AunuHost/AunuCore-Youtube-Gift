# AunuCore Youtube Gift

Desktop GIFs experiment for YouTube desktop comments — workaround research for issue #93.

**Current build: AunuCore youtube gift (phase test #2)**

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
    picker.test.js # node --test suite for picker.js (7 tests)
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
`v0.2.0-phase-test.2` (current), `v0.3.0-phase-test.3`, ...
The first stable release will be **`v1.0.0`** — its notes will
summarize every phase-test experiment and optimization.
See `docs/RELEASES.md` and `CHANGELOG.md`.

## How to use the GIF picker (phase test #2)

1. Load the extension (steps below), open a YouTube **watch** page.
2. Click the comment input — a **GIF** button appears in the comment box.
3. Click it: the picker panel opens.
   - **Search (Tenor):** needs a Tenor API key — paste yours into
     `PICKER_CONFIG.tenorApiKey` in `extension/src/picker.js`, reload
     the extension, then type a query and press Enter. Click a GIF.
   - **Direct URL mode (no key needed):** paste any direct `.gif` /
     `.webp` link and click **Pakai URL**.
4. The chosen GIF is shown in the panel and stored as the *pending
   GIF* (check `window.__AUNUCORE_YT_GIFT__.getPendingGif()`).
   When you post the comment, the interceptor sees the pending GIF
   and consumes it. **The image attachment itself activates in
   phase test #3** (upload resolver) — in phase #2 the comment is
   still posted as text.

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
node --test extension/src/main.test.js extension/src/picker.test.js
```

Phase test #1 verified: `tenorId` is stripped and the request no
longer fails because of it. Phase test #2 adds the GIF button +
picker and the pending-GIF wiring. The upload resolver
(`resolveEncryptedBlobId`) intentionally returns `undefined` until
the real image-upload flow is captured and implemented in phase #3.

---
By AunuCore — AunuHost
