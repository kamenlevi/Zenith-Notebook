# Zenith Notebook

A canvas notebook that runs entirely in the browser. No account, no server, no install. Built for writing with a stylus on an iPad, and equally usable with a mouse and keyboard.

Open it, write, close the tab. Everything stays on your device.

---

## Features

**Writing**
- Pen, pencil, highlighter and eraser, each with its own size and colour that it remembers
- Real pressure response from an Apple Pencil or any pressure-capable stylus, with velocity-based thinning for mouse and finger
- Variable-width strokes with natural entry and exit tapers
- Two eraser modes: remove a whole stroke on contact, or rub out just the part you touch
- A straightedge ruler you can drag and rotate; strokes drawn along it snap to its edge

**Text**
- Tap anywhere to place a text box; it wraps on the page exactly as it does while you type
- Text boxes can be moved, resized, re-edited and deleted after the fact
- 60+ fonts, plus fonts you draw yourself character by character

**Pages and notebooks**
- Multiple independent notebooks, each with its own paper, theme and page count
- Paper: US Letter, A4, Tablet 4:3, Widescreen 16:9 — real dimensions, not a fixed size with a different label
- Lines: ruled, grid, dotted, custom-ruled (your own spacing in cm), or blank
- Light or dark paper per notebook, with a custom line colour if you want one

**Everything else**
- Lasso selection: move, scale, duplicate, reorder or delete anything on the page
- Photos from your library or straight from the camera, positioned and resized like any other object
- Undo/redo across the whole document, including a two-finger tap to undo
- Export to PDF or PNG, print any page range, save a `.zenith` file, or share a link that carries the notebook in the URL

---

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run deploy     # build and publish to GitHub Pages
```

Requires Node 18+.

---

## Using it on an iPad

Add it to your home screen (Share → Add to Home Screen) and it runs full-screen with no browser chrome.

| Gesture | Action |
|---|---|
| Apple Pencil | Draws, always — regardless of the finger setting |
| One finger | Scrolls and pans by default. Toggle **Finger draws** in the toolbar to write with a finger instead |
| Two fingers | Pan and pinch-zoom together |
| Two-finger tap | Undo |
| Three-finger tap | Redo |
| Tap the active tool | Opens that tool's size and colour |

Your palm is ignored while the Pencil is touching the screen, so you can rest your hand on the page.

The text and selection tools always respond to a single finger, since tapping is the whole point of them — two fingers still pan and zoom.

## Using it on a desktop

| Input | Action |
|---|---|
| Scroll wheel / trackpad | Scroll the page; Shift to scroll sideways |
| Pinch on trackpad, or Ctrl/⌘ + scroll | Zoom at the cursor |
| Middle-drag | Pan |
| ⌘Z / ⌘⇧Z | Undo / redo |
| ⌘A | Select all (with the select tool) |
| ⌘D | Duplicate the selection |
| Delete | Delete the selection |
| ⌘+ / ⌘− / ⌘0 | Zoom in, out, reset |
| ⌘↵ | Commit the text box you're editing |
| Esc | Cancel text editing, or clear the selection |

---

## Where your data lives

Notebooks and images are stored in this browser's **IndexedDB** on this device. Preferences live in localStorage. Nothing is uploaded anywhere — there is no server.

That also means data is per-browser and per-device. To move a notebook somewhere else:

- **Share and export → Save .zenith file** — the whole notebook including images. Open it elsewhere with **Settings → Import**.
- **Share and export → Share a link** — the notebook is encoded into the URL itself. Small notebooks only, and images are not included.

Deleting a notebook leaves its images behind until you run **Settings → Remove unused images**. Settings also shows how much space you're using.

---

## Architecture

```
index.tsx            mount, error boundary, iPadOS gesture suppression
App.tsx              notebook list, persistence, modal routing
engine/
  NotebookEngine.ts  canvas ownership, input, gestures, tools, undo, render loop
lib/
  geometry.ts        page formats, world coordinates, bounds, hit-test maths
  render.ts          paper, strokes, text and images -> canvas
  stroke.ts          input points -> variable-width outline (perfect-freehand)
  text.ts            measurement and wrapping, shared by canvas and editor
  customFont.ts      hand-drawn glyph rasterisation and tinting
  storage.ts         IndexedDB notebooks and image assets
  notebook.ts        document construction, hydration, v1 migration
  exporting.ts       PDF, PNG, print, .zenith files, share links
  imageCache.ts      decoded-image cache
components/          React chrome (toolbar, tabs, modals, canvas host)
```

### Why the engine is not a React component

Pan, zoom and every pointer sample are held in the engine, not in React state, and the engine drives its own `requestAnimationFrame` loop with dirty flags. Routing input through `useState` means a React render sits between the finger moving and anything being drawn, which is what made the earlier version feel sluggish. React re-renders only when the *chrome* needs to change — undo availability, the zoom readout, the page number.

### Rendering

```
base canvas      paper, ruled lines, page shadows        (world transform applied)
  └ content layer  strokes, text, images                 (composited on top)
overlay canvas   live stroke, selection, lasso, ruler
```

Two things matter here.

**The transform is applied to the context, not to a bitmap.** Zooming re-draws the vectors at the new scale, so handwriting stays crisp at 800%. Objects outside the viewport are culled by their cached bounds.

**Content renders to its own layer before being composited onto the paper.** The eraser uses `destination-out`, which removes whatever is beneath it — so it has to run somewhere the paper isn't, or it cuts holes straight through the page.

---

## Upgrading from the older version

Notebooks saved by the previous version are migrated automatically on first launch: subjects become notebooks, paths become pressure-aware strokes, text is re-anchored from its baseline to its top-left corner, and inline base64 images are moved out of the document into the asset store. The old localStorage keys are left untouched, so nothing is lost if you need to go back.

---

## Licence

No licence specified — all rights reserved by the author.
