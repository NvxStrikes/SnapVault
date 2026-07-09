# SnapVault — Privacy-First Full Page Screenshot

SnapVault is a modern, privacy-focused Chrome extension that captures full-page screenshots and exports them to PNG, JPEG, WEBP, or PDF. 

Unlike other screenshot tools that upload your images to third-party servers or lock your historical files behind premium subscriptions, SnapVault performs all captures, rendering, database storage, and file downloads **100% locally** in your browser.

---

## ✨ Features

- **Full-Page Screenshot**: Smooth scroll-and-stitch captures of very long pages.
- **Visible Area Capture**: Immediate frame grab of your current view.
- **Element-Only Crop**: Interactively select any specific HTML element or box on the screen and crop it cleanly.
- **Rich Vector Editing Toolbar**:
  - Draw arrows, rectangles, and ellipses.
  - Transparent highlighter pen.
  - **Redact / Blur tool** to obscure passwords, usernames, and personal data.
  - Custom font text insertion.
  - Freehand drawing brush with stroke size and color controls.
  - Horizontal and Vertical image flipping.
  - Image cropping inside the workspace.
- **Sticker Overlays** (Pro): Emoji icons to place on top of screenshots.
- **Local History Manager**: Keeps a history log of all past captures inside browser database storage (IndexedDB) with scrollable previews and editing links.
- **Batch captures** (Pro): Feed in a list of URLs to capture them automatically in sequence.
- **Interactive PDF exports** (Pro): Export captures to high-quality PDF files where original webpage links (`<a>` elements) are preserved as interactive clickable hotspots.

---

## 🔒 Free vs Pro Breakdown

| Feature | Free Tier | Pro Tier |
| :--- | :---: | :---: |
| Full-Page & Visible Capture | ✅ | ✅ |
| Core Markup (Draw, Text, Highlight) | ✅ | ✅ |
| Freehand Brush Drawing | ✅ | ✅ |
| Flip H / Flip V & Image Crop | ✅ | ✅ |
| Blur / Redact Masking | ✅ | ✅ |
| Offline PNG/JPEG/WEBP Export | ✅ | ✅ |
| IndexedDB History Log | ✅ | ✅ |
| **Interactive PDF Export (Clickable Links)** | ❌ | ✅ |
| **Batch Automated Capturing** | ❌ | ✅ |
| **Element Selection Capture** | ❌ | ✅ |
| **Stickers & Emoji Drawer** | ❌ | ✅ |

---

## 🚀 Installation & Setup

### For Developers (Load Unpacked)
1. Download or clone this repository: `git clone https://github.com/NvxStrikes/SnapVault.git`
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Toggle **Developer mode** in the top-right corner.
4. Click **Load unpacked** in the top-left and select the `SnapVault` folder.
5. Pin SnapVault to your Chrome toolbar.

### From Chrome Web Store
*(Web store listing link will be added here once published)*

---

## 📄 Documentation

- [Privacy Policy](PRIVACY.md) — Read about our 100% local processing commitment.
- [Terms of Service](TERMS.md) — Billing details, one-time payment structure, and user agreements.
- [Usage Guide](USAGE.md) — Comprehensive guide on using capture shortcuts and markup editors.
- [Contact & Support](CONTACT.md) — Refund instructions and contact emails.
