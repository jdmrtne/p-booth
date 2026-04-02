# 📸 Photobooth MVP

A browser-based photobooth app with layout selection, WebRTC camera capture, and photo strip generation — all client-side, no backend required.

## Getting Started

1. **Serve the files** (required for camera access — browsers block `getUserMedia` on `file://`)

   ```bash
   # Python 3
   python3 -m http.server 8080

   # Node (npx)
   npx serve .

   # VS Code Live Server extension
   # Right-click index.html → "Open with Live Server"
   ```

2. Open `http://localhost:8080` in your browser.

3. Allow camera access when prompted.

## Folder Structure

```
photobooth-mvp/
│
├── index.html        ← Layout selection page
├── camera.html       ← Photo capture page
├── result.html       ← Strip result + download
│
├── css/
│   └── style.css     ← All styles (retro film aesthetic)
│
├── js/
│   ├── layout.js     ← Layout config, card rendering, selection
│   ├── camera.js     ← WebRTC, countdown timer, capture sequence
│   └── canvas.js     ← Photo strip generation (HTML5 Canvas)
│
└── README.md
```

## Layouts

| Layout | Format     | Shots |
|--------|------------|-------|
| A      | 6×2 Strip  | 3     |
| B      | 6×2 Strip  | 4     |
| C      | 6×2 Strip  | 2     |
| D      | 6×4 Grid   | 6     |

## Features

- **Layout Selection** — 4 layout options with live SVG previews
- **Camera Access** — WebRTC `getUserMedia`, mirrored selfie view
- **Countdown Timer** — 3-second animated countdown before each shot
- **Sequential Capture** — Photos taken one at a time per layout
- **Live Thumbnails** — Sidebar preview updates after each capture
- **Strip Generation** — HTML5 Canvas composites all photos
  - White borders around each photo
  - Film strip perforations (strip layouts)
  - Gold branding bar + date stamp
- **Download** — One-click PNG export
- **Fully Local** — No server upload, all data stays in browser (sessionStorage)
- **Mobile Responsive** — Touch-friendly large buttons

## Browser Support

Requires a browser with:
- `getUserMedia` (WebRTC) — Chrome 47+, Firefox 36+, Safari 11+, Edge 12+
- HTML5 Canvas API
- sessionStorage

## Privacy

All photos are processed locally in your browser. Nothing is ever uploaded to any server.
