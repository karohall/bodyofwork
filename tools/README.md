# Capture tooling

Record your own mouse + scroll path through the live site, then replay it
deterministically in headless Chromium to a PNG sequence + MP4 for social.

## Install

```bash
npm install
```

Requires `ffmpeg` on PATH for the MP4 encode step (`brew install ffmpeg`).

## Record

```bash
npm run record
```

Opens a Chromium window with a small overlay in the bottom-left corner.

- **R** — start recording
- **S** — stop
- **D** — save to `recordings/recording-<timestamp>.json`

Then close the window. The JSON contains the viewport size, all `mousemove`
samples, and every `scroll` event with timestamps from t=0.

You can also pass a viewport:

```bash
npm run record -- --width=1440 --height=900
```

The recorded viewport is stored in the JSON; capture defaults to matching
it so layout/scroll positions line up.

## Capture

```bash
npm run capture -- --input recordings/recording-<stamp>.json
```

Replays the recording in headless Chromium with `requestAnimationFrame`,
`performance.now()`, and `Date.now()` driven by a virtual clock (so every
frame renders the canvas at the exact intended time), screenshots each
frame, and encodes an MP4.

Outputs to `output/run-<timestamp>/`:
- `frames/00000.png`, `00001.png`, …
- `video.mp4`

### Options

| Flag             | Default                | Notes                                              |
|------------------|------------------------|----------------------------------------------------|
| `--input`        | _(required)_           | Path to recording JSON                             |
| `--fps`          | `60`                   | Output frame rate                                  |
| `--width`        | recording viewport     | Override capture width (must be even)              |
| `--height`       | recording viewport     | Override capture height (must be even)             |
| `--tail`         | `800`                  | Extra ms after last sample (lets motion settle)    |
| `--warmup`       | `600`                  | ms to let the site init before frame 0             |
| `--output`       | `output/run-<stamp>`   | Custom output dir                                  |
| `--no-encode`    | _(false)_              | Skip the ffmpeg step, keep just the PNG sequence   |

### Notes & limits

- Mouse events are dispatched synthetically as `MouseEvent('mousemove')`
  with `bubbles: true`, which the site's `document`/`window` listeners pick
  up just like real input.
- `setTimeout`/`setInterval` are **not** virtualised — they keep wall-clock
  behaviour. Site bootstrap finishes during the `--warmup` window before
  frame 0, so this is fine for the current animations. If you add new code
  that drives motion via `setTimeout`, you'll need to override those too.
- Overriding the viewport with `--width`/`--height` re-runs layout, so a
  recording taken at 1440×900 will look different replayed at 1080×1920.
  Best practice: record at the size you want to publish at.
