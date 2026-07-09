# SnapVault Privacy Policy

**Effective Date:** July 9, 2026

SnapVault is designed with a privacy-first architecture. Our core philosophy is simple: **your data belongs to you, and we do not want it.**

---

## 1. 100% Local Image Processing
- **No Cloud Services:** SnapVault does not run or maintain any cloud servers to store, process, or transmit your screenshots. 
- **Local Conversions:** All screenshot stitching, canvas renderings, image conversions (PNG/JPEG/WEBP), PDF encoding, and annotations happen entirely on your computer's CPU/GPU inside the Google Chrome browser context.
- **IndexedDB Storage:** Your capture history is saved inside IndexedDB (a sandboxed database in Google Chrome's local folder on your disk). It is never sent to the developer, Google, or any third party.

---

## 2. Chrome Extension Permissions Declared
We request only the minimum necessary permission set required to run the extension:

1. `activeTab`: Used to capture the visible tab you are currently viewing when triggering a screenshot.
2. `scripting`: Used to inject a helper script (`content.js`) to scroll the webpage and hide sticky components (like menus) during full-page grabs.
3. `downloads`: Used to download the finalized PNG, JPEG, WEBP, or PDF to your local Downloads folder.
4. `storage`: Used to remember configuration settings (e.g. filename format, scroll delays) and license activation states.
5. `contextMenus`: Used to add capturing shortcuts in Chrome's right-click menu.
6. `notifications`: Used to alert you if a batch job finishes or if you try to capture a restricted page (like the Web Store).
7. `<all_urls>` (Optional): Requested only if you use **Batch Capture** (Pro). This allows the background script to open and scroll URLs in a batch sequence. You must explicitly grant this, and it can be revoked at any time.

---

## 3. Gumroad License Activation Data Flow
When you purchase SnapVault Pro and activate it:
- The extension sends **only the license key** you input to Gumroad's official API endpoint (`https://api.gumroad.com/v2/licenses/verify`) to confirm it is valid.
- No other information is ever collected or sent during this verification. We do not track your name, IP address, browsing activity, or the contents of your screenshots.

---

## 4. Analytics, Cookies, & Ads
- **No Analytics:** SnapVault contains zero analytics libraries, crash logs reporters, or trackers.
- **No Ads:** The extension is 100% ad-free.
- **No Sharing:** We do not sell, trade, or share any personal information.

---

## 5. Contact
If you have any questions or concerns regarding our privacy practices, please contact us at:
- **Email:** contact@novastrikes.com
