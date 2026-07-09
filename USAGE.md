# SnapVault Usage Guide

Learn how to capture, redact, edit, and export screenshots with SnapVault.

---

## 1. Screenshot Capture Modes

### Mode A: Full Page Screenshot (Default Icon Action)
- Click the **SnapVault icon** in your extensions toolbar.
- The page will automatically scroll to the bottom to capture the layout, stitch the sections, and open the editor.

### Mode B: Context Menu Right-Click Actions
Right-click anywhere on a webpage to choose from three options:
1. **Capture Full Page**: Captures the entire scrollable height of the current page.
2. **Capture Visible Area**: Instantly grabs exactly what is currently shown inside your viewport.
3. **Capture Element (Pro)**: Launches an overlay. Move your mouse to highlight page elements (divs, blocks, figures), and click to capture only that section.

### Mode C: Keyboard Shortcuts
You can trigger captures instantly via keyboard commands:
- **Default Capture Command:** `Ctrl+Shift+Y` (on Windows) or `Cmd+Shift+Y` (on Mac).
- Shortcuts can be customized by visiting `chrome://extensions/shortcuts` in your browser.

---

## 2. Editor Markup & Redaction Tools

Once captured, you will be redirected to the interactive Editor dashboard:

- **Pan Tool (`Pan`)**: Click and drag to pan around large screenshots. Scroll your mouse wheel or click zoom buttons in the topbar to scale.
- **Draw Shapes (`Arrow`, `Rect`, `Ellipse`)**: Choose a color and width, then click and drag to highlight layout components.
- **Highlighter (`Highlight`)**: Draw semi-transparent color bands over text.
- **Redact / Blur (`Redact`)**: Click and drag to blur and pixelate passwords, credentials, email addresses, and private data.
- **Text Overlay (`Text`)**: Click on the canvas to open a text box, type your notes, and press Enter to save.
- **Freehand Brush (`Brush`)**: Draw notes, circles, or doodles freehand.
- **Crop Canvas (`Crop`)**: Draw a crop box, resize it, and click the floating **Apply Crop** button to trim the canvas.
- **Flip Canvas (`Flip H / Flip V`)**: Click the top-bar flip buttons to mirror the image horizontally or vertically.

---

## 3. Activating SnapVault Pro
1. Go to the **Settings** tab in the dashboard.
2. Enter your Gumroad product license key inside the input box.
3. Click **Activate Pro**.
4. The extension will verify the key against Gumroad's API, and unlock Pro status.

---

## 4. Batch Capturing (Pro)
- Go to the **Batch Capture** tab in the dashboard.
- Paste a list of URLs (one per line) starting with `http://` or `https://`.
- Choose the scroll delay (default: 1000ms, to let images load).
- Click **Start Batch Capture**.
- **Permissions Hint:** Chrome will ask you to approve `<all_urls>` permission so the service worker can load and capture screenshots automatically in background tabs. You can view the live progress logs and status counts inside this tab.
