# Capture-mode phrase texts

These are the sentences that appear (in order) in the `?capture=1` cycle.
They live as a hard-coded `CAPTURE_PHRASES` array in `index.html` (search
for the constant) — decoupled from the live site copy so you can edit
either side without affecting the other.

Each entry shows for 5 seconds (0.5 s fade-in / 4 s hold / 0.5 s fade-out).
An entry can be either a string (one-line phrase) or an array of strings
(multi-line slate that fades together as one entry). Current cycle:
**12 × 5 s = 60 s + 5 s tail = 65 s**.

To re-render with edits below, after changing the array in `index.html`:

```
npm run capture -- --input=recordings/recording-2026-05-20T09-31-35-231Z.json
```

(Note the `--` separator — npm needs it to pass `--input` through to the
underlying script instead of consuming it itself.)

---

## Entries (in cycle order)

1. *An event about art that turns your body into its material.*
2. *Haptics, sensors, and other technologies give artists new ways of working with touch.*
3. *When touch becomes the site of the artwork, it can't be documented.*
4. *It exists only in your body.*
5. *Touch is intimate and complex to work with.*
6. *There is little terminology, few shared references, and no defined frameworks.*
7. *How do we exhibit it?*
8. *How do we fund it?*
9. *What is our responsibility as artists when we work with the bodies of the audience?*
10. *This event is part workshop, part exhibition, part laboratory, bringing together artists in Sweden who are defining this field.*
11. *And most importantly, to get a feel for what it is.*
12. Multi-line slate:
    - *Helix Art Space*
    - *2 June – 7 June*

---

## How to edit

Open `index.html`, find the `CAPTURE_PHRASES` array, edit any string. The
DOM is rebuilt at page load from this array — no other coupling.

To group lines into one slate (one fade, one 5 s slot), use a nested array:

```js
['Helix Art Space', '2 June – 7 June']  // shown together, faded together
```

**Cycle length rule:** `CAPTURE_PHRASES.length × 5 s` = total cycle.
Auto-stop fires at `cycle + 5 s` (so 12 entries = 65 s recording).
Adjust entry count and re-record:

```
npm run record -- --capture
```
