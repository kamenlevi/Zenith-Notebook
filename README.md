# Zenith Notebook

A fast, canvas-based digital notebook that runs entirely in the browser — no account, no server, no install. Works on desktop, iPad, and mobile.

---

## Features

- **Five drawing tools** — Pen, Pencil, Highlighter, Eraser, and Text
- **Custom fonts** — Draw your own handwriting and use it as a font
- **Multiple subjects** — Each subject is an independent notebook with its own pages, theme, and page style
- **Page styles** — Ruled, Grid, Custom-ruled (configurable line spacing), and Blank; custom line colours
- **Page formats** — US Letter, A4, Tablet (4:3), Widescreen (16:9)
- **Light / Dark theme** per subject
- **Images** — Insert photos from your gallery, camera, or file system; drag to reposition
- **Undo / Redo** — Full history with hold-to-repeat
- **Print** — Select any page range and print via your device's print dialog
- **Share** — Generates a URL that encodes the notebook as a hash; anyone with the link can import a snapshot
- **Export PDF** — Renders all pages to a high-quality PDF via jsPDF
- **Auto-save** — All data is persisted in browser localStorage; no account needed
- **Import** — Drop in a folder of images or text files to create a notebook from existing content

---

## Getting Started (Development)

```bash
npm install
npm run dev       # starts Vite dev server on http://localhost:5173
npm run build     # type-check + production build → dist/
npm run preview   # preview the production build locally
npm run deploy    # build and push to GitHub Pages (requires gh-pages)
```

**Requirements:** Node 18+, npm 9+

---

## Using on Desktop / Laptop

### Drawing
- Select a tool from the toolbar: **Pen**, **Pencil** (semi-transparent), **Highlighter**, **Eraser**, or **Text**
- Draw on the page with your mouse or stylus
- Use the **vertical size slider** on the left to change stroke / font size

### Colour
- Pick from the five preset colours in the toolbar
- Click the rainbow circle to open the system colour picker for any custom colour

### Text
1. Select the **Text** tool
2. Click anywhere on the page — the cursor snaps to the nearest ruled line automatically
3. Type; press **Enter** to confirm, **Escape** to cancel
4. Choose a font from the font dropdown (80+ Google Fonts included)

### Keyboard shortcuts (text editing)
| Key | Action |
|-----|--------|
| `Enter` | Submit text |
| `Shift+Enter` | New line |
| `Escape` | Cancel without saving |

### Undo / Redo
- **Click** the undo / redo buttons to step one action
- **Hold** the button to fast-repeat through history; hold longer to speed up further

### Pages & Subjects
- Click **Add Page** in the toolbar to append a page to the current subject
- Click the **⋮** (ellipsis) on any subject tab to rename, change page count, change page style, share/export, or delete it
- Click **+** in the subject bar to create a new subject
- Click the **☰** (bars) button in the toolbar to open Page Style settings

### Images
1. Click **Add File** in the toolbar
2. Choose **From Gallery** (file picker), **Take Photo** (camera), or **From Files**
3. On touch devices, drag the image with one finger to reposition it

### Print & Export
- **Print icon** → enter a page range (e.g. `1-3, 5`) → opens the browser print dialog
- **⋮ → Share & Export** → copy the share URL or click **Export as PDF**

### Settings
- Click the **gear icon** (bottom-right of the subject bar) to open Settings
- Toggle **Auto-save** (enabled by default — saves to localStorage)
- **Import Notebook** — select a folder of images or text files to create a subject from existing content
- **Clear All Saved Data** — permanently removes all subjects and settings

---

## Using on iPad

### Drawing & Writing
- Use an Apple Pencil (or any stylus) directly on the canvas — produces smooth, pressure-agnostic strokes
- Finger touch is reserved for **navigation** (pan, zoom) so you can rest your palm without drawing

### Navigation
| Gesture | Action |
|---------|--------|
| 1-finger drag | Pan the canvas |
| 2-finger pinch | Zoom in / out |
| 2-finger tap | **Undo** last stroke |
| 3-finger tap | **Redo** |
| Release zoom below 60% | Auto-snaps back to 100% |

### Adding Photos
- Tap **Add File → From Gallery** to pick from Photos
- Tap **Add File → Take Photo** to use the camera inline
- After inserting, drag the image with **one finger** to reposition it

### Tips for iPad
- Rotate to landscape for Widescreen-format subjects; portrait for Letter/A4
- Use **Custom Ruled** page style and set line spacing to match your natural handwriting size
- The size slider on the left is touch-friendly — drag it vertically

---

## Using on Mobile (iPhone / Android)

The interface is the same as iPad. Practical notes for smaller screens:

- The toolbar wraps on narrow screens — scroll horizontally if controls are hidden
- Tap the subject tab bar to switch subjects; **+** is at the right end
- **2-finger tap = Undo**, **3-finger tap = Redo**
- For photos: **Add File → Take Photo** opens the camera; **From Gallery** opens the media picker
- Share links can be long (the full notebook is encoded in the URL hash) — use the **Copy** button and send via messaging or email

---

## Data & Privacy

- All notebook data is stored exclusively in your browser's **localStorage**
- Nothing is sent to any server
- To back up or move notebooks between devices, use **Share & Export → copy link** (or export PDF)
- To clear everything: **Settings → Clear All Saved Data**

---

## Architecture

| File | Role |
|------|------|
| `App.tsx` | Root state (subjects, settings, fonts), modal routing |
| `components/Notebook.tsx` | Canvas rendering pipeline, pointer handling, undo/redo, text editing |
| `components/canvasUtils.ts` | Pure canvas drawing — backgrounds, smooth paths, custom-font text |
| `components/Toolbar.tsx` | Tool / colour / action bar |
| `components/Sidebar.tsx` | Subject tabs |
| `types.ts` | Shared TypeScript types |
| `index.html` | Loads Tailwind (CDN), Google Fonts, jsPDF (CDN UMD), importmap |

### Rendering pipeline

```
drawingObjects + images
        │
        ▼
  offscreenCanvas  ← full scene at document resolution (816 × totalHeight px)
        │  drawImage with transform
        ▼
  contentCanvas   ← viewport-sized, applies pan/zoom transform
        │
  uiCanvas        ← overlaid; draws current stroke preview + image selection boxes
```

The offscreen canvas is only redrawn when committed objects change (stroke complete, image drag settled). During active drawing, only the UI canvas updates, keeping the main canvas untouched until the stroke is finalised.
