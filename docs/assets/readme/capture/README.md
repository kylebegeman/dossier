# README image capture

The images one folder up are captures of the built showcase. After a page
changes, refresh them; the script works from any directory:

```sh
node docs/assets/readme/capture/capture.mjs
```

It runs `make site` in `core`, captures each page in headless Chrome in light
and dark, frames the captures, and writes lossless WebP and the deciding GIF
back into `docs/assets/readme`, replacing nothing there until every capture
has succeeded. Name sets to refresh only some of them: `hero`, `kinds`,
`loop`, `decide`, `phones`, and `studio`. `--site DIR` uses a site already
built, `--bin PATH` a binary already built for the studio set, and `--keep`
leaves the raw captures in the printed work directory.

To check a change without touching the committed images, write them
elsewhere. The run ends with each image's size beside the committed one and
the share of pixels that differ:

```sh
node docs/assets/readme/capture/capture.mjs --out /tmp/readme-images
```

It needs Node 22 or newer, Go, `cwebp`, `ffmpeg`, and Chrome, taken from
`CHROME_PATH` or the macOS default. Pages render in the fonts installed on
the machine. Every Chrome and studio process it starts is stopped when it
finishes or is interrupted.

| File | What it does |
| --- | --- |
| `capture.mjs` | The entry: every image set, and the comparison |
| `cdp.mjs` | A small DevTools protocol client for headless Chrome |
| `frame.mjs` | The quiet browser window around each capture |
