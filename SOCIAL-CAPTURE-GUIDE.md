# Recording a social clip — step by step

This makes a vertical (9:16) Instagram-Reel-sized video of the *Body of Work*
site, with the sentences fading in/out and ripples following your mouse.

You don't need to know any code. You just open Terminal, copy commands one
at a time, and press Enter after each.

---

## One-time setup (do this once, then never again)

You only need to do this the first time you record on your machine.

**1. Get the project onto your computer.** If someone has shared a folder
with you, skip to step 2. Otherwise:

Open Terminal (press **⌘ + Space**, type `terminal`, press Enter), then paste:

```
cd ~/Documents
git clone https://github.com/karohall/bodyofwork.git
cd bodyofwork
git checkout social-capture
```

**2. Install the tools.** Same Terminal window:

```
brew install ffmpeg
npm install
```

If `brew` says "command not found", install Homebrew first by pasting this
and following the prompts:

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

If `npm` says "command not found", install Node.js from https://nodejs.org
(pick the green "LTS" button), then come back and re-run `npm install`.

You're done with setup. From now on, every time you record, just:

```
cd ~/Documents/bodyofwork
```

…and then jump to "Record" below.

---

## Record

In Terminal, type:

```
npm run record -- --capture
```

After a few seconds a small portrait Chromium window opens with the site
inside it. **The recording starts automatically.** Just move your mouse
around inside that window for ~65 seconds — the sentences will fade in and
out and the wavy ripple follows your cursor.

When the sentences finish, you'll see `saved → recordings/recording-…json`
in the Terminal. Close the Chromium window.

**Tips for nice mouse movement:**
- Slow, smooth strokes look better than scribbles
- Drawing big shapes (circles, figure-eights) reads well
- It's fine to pause sometimes; the field stays alive

---

## Make the video

Look at Terminal to find the filename it just saved. It'll look like
`recordings/recording-2026-05-21T20-29-57-843Z.json`. Copy that filename.

Then in Terminal, type (replace the long name with the one you just copied):

```
npm run capture -- --input=recordings/recording-2026-05-21T20-29-57-843Z.json
```

This takes about 5 minutes. When it finishes, it prints something like:

```
▸ done. open output/run-…/video.mp4
```

Copy that whole `open …` line and paste it into Terminal, then press Enter.
The MP4 will open. That's your finished clip — drag it into Instagram or
wherever.

---

## "Dancing" — record on top of an old recording (optional)

You can run an old recording in the background while you record a new one,
so the two mouse paths interact. To do that, add `--ghost=` and a previous
recording filename:

```
npm run record -- --capture --ghost=recordings/recording-2026-05-21T20-29-57-843Z.json
```

The old recording's mouse plays back as a ghost while you move yours. Both
get saved into the new recording, so the resulting MP4 shows the dance.

---

## A smaller version to share over Slack/email

The full MP4 is ~30 MB which is fine for Instagram but big for messaging.
After the capture finishes, run this to make a ~2 MB preview version
(replace the input filename with the one capture just made):

```
ffmpeg -y -i output/run-…/video.mp4 -vf scale=540:960 -r 30 -c:v libx264 -crf 30 -preset slow -movflags +faststart output/preview-small.mp4
```

Then `open output/preview-small.mp4` to check it.

---

## Editing the text

The sentences live near the top of `index.html`. Search for
`CAPTURE_PHRASES` and you'll find them as a list of quoted strings.
Edit any of them, save, and re-run `npm run capture -- --input=…` — no need
to re-record. (Don't add or remove sentences without telling Jakob — that
changes the timing.)

Full list of current sentences is in `capture-texts.md`.

---

## If something goes wrong

- **The window opens but text never appears.** Make sure you're on the
  `social-capture` branch: `git checkout social-capture`. Make sure
  packages are installed: `npm install`.
- **`npm run record` says "address already in use"**. Another recording
  session is still running. Quit it (or close every Chromium window) and
  try again.
- **The output looks blank/gray.** Re-run `npm install` to make sure
  Puppeteer's Chromium downloaded successfully.
- **The MP4 looks corrupted.** Open Terminal and run `brew reinstall ffmpeg`
  to make sure the encoder is healthy.

If stuck, send Jakob the last 20 lines of Terminal output and which step
you were on.
