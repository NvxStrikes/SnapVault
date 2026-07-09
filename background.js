// Background service worker for SnapVault
importScripts('db.js');

// Open DB import helper (in MV3 service worker, we can import ES modules directly if declared in manifest)
// We will write db.js in a moment.

// Register context menus on install
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'capture_full_page',
    title: 'Capture Full Page',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'capture_visible_area',
    title: 'Capture Visible Area',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'capture_element',
    title: 'Capture Element (Pro)',
    contexts: ['page']
  });

  // Set default settings if not exist
  chrome.storage.local.get(['scrollDelay', 'maxScrollLimit', 'expandScrollables', 'filenameTemplate', 'isPro'], (res) => {
    const defaults = {};
    if (res.scrollDelay === undefined) defaults.scrollDelay = 300;
    if (res.maxScrollLimit === undefined) defaults.maxScrollLimit = 15;
    if (res.expandScrollables === undefined) defaults.expandScrollables = true;
    if (res.filenameTemplate === undefined) defaults.filenameTemplate = 'SnapVault_{title}_{date}_{time}';
    if (res.isPro === undefined) defaults.isPro = false;
    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults);
    }
  });
});

// Context Menu click handler
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab) return;
  if (info.menuItemId === 'capture_full_page') {
    startCaptureWorkflow(tab.id, 'full');
  } else if (info.menuItemId === 'capture_visible_area') {
    startCaptureWorkflow(tab.id, 'visible');
  } else if (info.menuItemId === 'capture_element') {
    startCaptureWorkflow(tab.id, 'element');
  }
});

// Keyboard shortcut listener
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-full-page') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        startCaptureWorkflow(tabs[0].id, 'full');
      }
    });
  }
});

// Action (extension icon) click handler
chrome.action.onClicked.addListener((tab) => {
  startCaptureWorkflow(tab.id, 'full');
});

// Message listener from content and dashboard scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'verify_license') {
    verifyGumroadLicense(message.licenseKey)
      .then(res => sendResponse(res))
      .catch(err => sendResponse({ success: false, message: err.message }));
    return true;
  }

  if (message.action === 'start_batch_capture') {
    runBatchCapture(message.urls, message.options)
      .then(() => sendResponse({ success: true }))
      .catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === 'trigger_element_capture') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        startCaptureWorkflow(tabs[0].id, 'element');
      }
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'trigger_full_capture') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        startCaptureWorkflow(tabs[0].id, 'full');
      }
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'trigger_visible_capture') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        startCaptureWorkflow(tabs[0].id, 'visible');
      }
    });
    sendResponse({ success: true });
    return true;
  }
});

// Inject content script if not already present
async function ensureContentScriptInjected(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    if (response && response.status === 'pong') {
      return true;
    }
  } catch (err) {
    // Message fails if script is not injected
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ['content.js']
  });
  
  // Wait a small bit for loading
  await new Promise(resolve => setTimeout(resolve, 100));
  return true;
}

// Master capture router
async function startCaptureWorkflow(tabId, mode) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) {
      throw new Error('Cannot capture this page.');
    }

    // Check if it is a Chrome system page
    if (
      tab.url.startsWith('chrome://') || 
      tab.url.startsWith('chrome-extension://') || 
      tab.url.startsWith('https://chromewebstore.google.com') ||
      tab.url.startsWith('about:')
    ) {
      // In MV3, we cannot execute script on these. Show a simple system notification.
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'SnapVault Capture Error',
        message: 'Security policy prevents extensions from capturing Chrome internal pages or the Web Store.'
      });
      return;
    }

    // Check if PRO is required for Element mode
    if (mode === 'element') {
      const settings = await chrome.storage.local.get('isPro');
      if (!settings.isPro) {
        // Open settings / activation page
        chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html?tab=settings&pro_notice=true') });
        return;
      }
    }

    if (mode === 'visible') {
      await captureVisibleArea(tab);
    } else if (mode === 'full') {
      await captureFullPage(tab);
    } else if (mode === 'element') {
      await captureSelectedElement(tab);
    }
  } catch (err) {
    console.error('Capture workflow failed:', err);
  }
}

let lastCaptureTime = 0;
const MIN_CAPTURE_INTERVAL = 600; // ms (Chrome quota: max 2 calls per second)

async function rateLimitedCaptureVisibleTab(windowId, options) {
  const now = Date.now();
  const elapsed = now - lastCaptureTime;
  if (elapsed < MIN_CAPTURE_INTERVAL) {
    const waitTime = MIN_CAPTURE_INTERVAL - elapsed;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  const dataUrl = await chrome.tabs.captureVisibleTab(windowId, options);
  lastCaptureTime = Date.now();
  return dataUrl;
}

// 1. Capture Visible Area
async function captureVisibleArea(tab) {
  const dataUrl = await rateLimitedCaptureVisibleTab(tab.windowId, { format: 'png' });
  const response = await fetch(dataUrl);
  const blob = await response.blob();

  // Create simple thumbnail
  const thumbBlob = await createThumbnail(blob, 200, 150);

  const captureId = 'capt_' + Date.now();
  const captureData = {
    id: captureId,
    blob: blob,
    title: tab.title || 'Visible Area',
    url: tab.url,
    timestamp: Date.now(),
    thumbnail: thumbBlob
  };

  await saveCapture(captureData);
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html?id=${captureId}`) });
}

// Helper to load image bitmap
async function loadImageBitmap(dataUrlOrBlob) {
  let blob = dataUrlOrBlob;
  if (typeof dataUrlOrBlob === 'string') {
    const res = await fetch(dataUrlOrBlob);
    blob = await res.blob();
  }
  return await createImageBitmap(blob);
}

// Helper to create a thumbnail
async function createThumbnail(blob, width, height) {
  try {
    const bitmap = await createImageBitmap(blob);
    const aspect = bitmap.width / bitmap.height;
    
    let targetW = width;
    let targetH = height;
    if (aspect > 1) {
      targetH = Math.round(width / aspect);
    } else {
      targetW = Math.round(height * aspect);
    }

    const canvas = new OffscreenCanvas(targetW, targetH);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  } catch (e) {
    console.error('Thumbnail generation failed, using fallback', e);
    return blob; // fallback to full blob
  }
}

// 2. Capture Full Page
async function captureFullPage(tab) {
  await ensureContentScriptInjected(tab.id);

  // Get user settings
  const settings = await chrome.storage.local.get(['scrollDelay', 'maxScrollLimit', 'expandScrollables']);
  const scrollDelay = parseInt(settings.scrollDelay) || 300;
  const maxScrollLimit = parseInt(settings.maxScrollLimit) || 15;
  const expandScrollables = settings.expandScrollables !== false;

  // Initialize content script capture state
  const initRes = await chrome.tabs.sendMessage(tab.id, {
    action: 'init_capture',
    options: { expandScrollables }
  });

  if (initRes.status !== 'success') {
    throw new Error(initRes.error || 'Failed to initialize capture.');
  }

  const { totalWidth, totalHeight, viewportWidth, viewportHeight, devicePixelRatio, title, url, links } = initRes.metrics;
  const dpr = devicePixelRatio || 1;

  // Generate scroll path
  const frames = [];
  const maxScrollY = Math.max(0, totalHeight - viewportHeight);
  
  let currentY = 0;
  while (currentY <= maxScrollY) {
    frames.push(currentY);
    if (currentY === maxScrollY) break;
    currentY += viewportHeight;
    if (currentY > maxScrollY) {
      currentY = maxScrollY;
    }
  }

  // Cap the scrolling to prevent infinite loops
  if (frames.length > maxScrollLimit) {
    frames.splice(maxScrollLimit);
  }

  const capturedFrames = [];

  // Loop through scroll frames
  for (let i = 0; i < frames.length; i++) {
    const targetY = frames[i];
    const hideTopFixed = i > 0;
    const showBottomFixed = i === frames.length - 1;

    // Send scroll command to page progress updates
    const scrollRes = await chrome.tabs.sendMessage(tab.id, {
      action: 'scroll_to',
      x: 0,
      y: targetY,
      hideTopFixed,
      showBottomFixed,
      settleDelay: scrollDelay
    });

    if (scrollRes.status !== 'success') {
      throw new Error(scrollRes.error || 'Failed to scroll page.');
    }

    // Capture current view
    const dataUrl = await rateLimitedCaptureVisibleTab(tab.windowId, { format: 'png' });
    capturedFrames.push({
      y: scrollRes.coords.actualY,
      dataUrl
    });
  }

  // Cleanup DOM changes
  await chrome.tabs.sendMessage(tab.id, { action: 'cleanup_capture' });

  // Stitch images
  const stitchedBlob = await stitchCapturedFrames(capturedFrames, viewportWidth, viewportHeight, dpr);
  const thumbBlob = await createThumbnail(stitchedBlob, 200, 150);

  const captureId = 'capt_' + Date.now();
  const captureData = {
    id: captureId,
    blob: stitchedBlob,
    title: title || 'Full Page',
    url: url || tab.url,
    timestamp: Date.now(),
    thumbnail: thumbBlob,
    links: links || [],
    devicePixelRatio: dpr
  };

  await saveCapture(captureData);
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html?id=${captureId}`) });
}

// Stitch captured frames onto a canvas
async function stitchCapturedFrames(frames, viewportWidth, viewportHeight, dpr) {
  // Height is based on the scroll coordinate of the last frame + viewportHeight
  const lastFrame = frames[frames.length - 1];
  const totalStitchedHeight = lastFrame.y + viewportHeight;

  const canvas = new OffscreenCanvas(viewportWidth * dpr, totalStitchedHeight * dpr);
  const ctx = canvas.getContext('2d');

  for (const frame of frames) {
    const bitmap = await loadImageBitmap(frame.dataUrl);
    ctx.drawImage(bitmap, 0, frame.y * dpr);
  }

  return await canvas.convertToBlob({ type: 'image/png' });
}

// 3. Capture Selected Element (PRO)
async function captureSelectedElement(tab) {
  await ensureContentScriptInjected(tab.id);

  // Trigger hover overlay in content script
  let selectionRes;
  try {
    selectionRes = await chrome.tabs.sendMessage(tab.id, { action: 'start_element_selection' });
  } catch (err) {
    throw new Error('Could not start element selection.');
  }

  if (selectionRes.status !== 'success') {
    throw new Error(selectionRes.error || 'Selection cancelled.');
  }

  const { left, top, width, height, title, url } = selectionRes.rect;

  // Let's get user configurations
  const settings = await chrome.storage.local.get(['scrollDelay']);
  const scrollDelay = parseInt(settings.scrollDelay) || 300;

  // Init page metrics
  const initRes = await chrome.tabs.sendMessage(tab.id, {
    action: 'init_capture',
    options: { expandScrollables: false } // don't disrupt element layouts
  });

  if (initRes.status !== 'success') {
    throw new Error(initRes.error || 'Failed to initialize capture.');
  }

  const { viewportHeight, devicePixelRatio } = initRes.metrics;
  const dpr = devicePixelRatio || 1;

  // Generate scroll path to cover the element vertical span
  const frames = [];
  const startY = top;
  const endY = top + height;
  const maxPageY = initRes.metrics.totalHeight - viewportHeight;

  let currentY = Math.max(0, Math.min(startY, maxPageY));
  const targetEndY = Math.max(0, Math.min(endY - viewportHeight, maxPageY));

  if (height <= viewportHeight) {
    frames.push(currentY);
  } else {
    while (currentY <= targetEndY) {
      frames.push(currentY);
      if (currentY === targetEndY) break;
      currentY += viewportHeight;
      if (currentY > targetEndY) {
        currentY = targetEndY;
      }
    }
  }

  const capturedFrames = [];

  // Loop scroll & capture
  for (let i = 0; i < frames.length; i++) {
    const targetY = frames[i];

    const scrollRes = await chrome.tabs.sendMessage(tab.id, {
      action: 'scroll_to',
      x: 0,
      y: targetY,
      hideTopFixed: true, // Hide top and bottom headers/footers during element captures
      showBottomFixed: false,
      settleDelay: scrollDelay
    });

    if (scrollRes.status !== 'success') {
      throw new Error(scrollRes.error || 'Failed to scroll page.');
    }

    const dataUrl = await rateLimitedCaptureVisibleTab(tab.windowId, { format: 'png' });
    capturedFrames.push({
      y: scrollRes.coords.actualY,
      dataUrl
    });
  }

  // Restore DOM
  await chrome.tabs.sendMessage(tab.id, { action: 'cleanup_capture' });

  // Stitch element frames
  const elementBlob = await stitchElementFrames(capturedFrames, left, top, width, height, viewportHeight, dpr);
  const thumbBlob = await createThumbnail(elementBlob, 200, 150);

  const captureId = 'capt_' + Date.now();
  const captureData = {
    id: captureId,
    blob: elementBlob,
    title: title || 'Element Capture',
    url: url || tab.url,
    timestamp: Date.now(),
    thumbnail: thumbBlob,
    devicePixelRatio: dpr
  };

  await saveCapture(captureData);
  chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html?id=${captureId}`) });
}

// Crop and stitch captured frames for Element capture
async function stitchElementFrames(frames, left, top, width, height, viewportHeight, dpr) {
  const canvas = new OffscreenCanvas(width * dpr, height * dpr);
  const ctx = canvas.getContext('2d');

  for (const frame of frames) {
    const bitmap = await loadImageBitmap(frame.dataUrl);
    const y = frame.y;

    // Crop math
    const sx = left * dpr;
    const sy = Math.max(0, top - y) * dpr;
    const sw = width * dpr;
    const sh = (Math.min(viewportHeight, top + height - y) - Math.max(0, top - y)) * dpr;

    const dx = 0;
    const dy = (Math.max(y, top) - top) * dpr;
    const dw = width * dpr;
    const dh = sh;

    if (sw > 0 && sh > 0) {
      ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
    }
  }

  return await canvas.convertToBlob({ type: 'image/png' });
}

// 4. Batch Capture (PRO)
async function runBatchCapture(urls, options = {}) {
  // Verify PRO license before executing
  const settings = await chrome.storage.local.get('isPro');
  if (!settings.isPro) {
    throw new Error('PRO license required for batch capture.');
  }

  // Check optional host permissions
  const hasPermission = await chrome.permissions.contains({
    origins: ['<all_urls>']
  });

  if (!hasPermission) {
    throw new Error('Missing necessary permissions. Please enable broad permissions in settings.');
  }

  const scrollDelay = parseInt(options.scrollDelay) || 400; // default higher for batch
  const format = options.format || 'png';

  for (let idx = 0; idx < urls.length; idx++) {
    const url = urls[idx];
    try {
      // Send progress to listening dashboard
      chrome.runtime.sendMessage({
        action: 'batch_progress',
        current: idx + 1,
        total: urls.length,
        url: url,
        status: 'Loading'
      });

      // Open new tab
      const tab = await new Promise((resolve) => {
        chrome.tabs.create({ url, active: false }, (t) => resolve(t));
      });

      // Wait for complete page loading
      await new Promise((resolve) => {
        function listener(tabId, info) {
          if (tabId === tab.id && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }
        }
        chrome.tabs.onUpdated.addListener(listener);
        // Timeout protection
        setTimeout(resolve, 15000);
      });

      // Send capturing status update
      chrome.runtime.sendMessage({
        action: 'batch_progress',
        current: idx + 1,
        total: urls.length,
        url: url,
        status: 'Capturing'
      });

      // Let page settle down
      await new Promise(r => setTimeout(r, 1000));

      await ensureContentScriptInjected(tab.id);

      // Perform full page capture steps
      const initRes = await chrome.tabs.sendMessage(tab.id, {
        action: 'init_capture',
        options: { expandScrollables: true }
      });

      if (initRes.status === 'success') {
        const { totalWidth, totalHeight, viewportWidth, viewportHeight, devicePixelRatio, title } = initRes.metrics;
        const dpr = devicePixelRatio || 1;

        const frames = [];
        const maxScrollY = Math.max(0, totalHeight - viewportHeight);
        let currentY = 0;
        while (currentY <= maxScrollY) {
          frames.push(currentY);
          if (currentY === maxScrollY) break;
          currentY += viewportHeight;
          if (currentY > maxScrollY) currentY = maxScrollY;
        }

        // enforce reasonable limit for automated captures
        if (frames.length > 15) frames.splice(15);

        const capturedFrames = [];

        for (let j = 0; j < frames.length; j++) {
          const targetY = frames[j];
          const hideTopFixed = j > 0;
          const showBottomFixed = j === frames.length - 1;

          const scrollRes = await chrome.tabs.sendMessage(tab.id, {
            action: 'scroll_to',
            x: 0,
            y: targetY,
            hideTopFixed,
            showBottomFixed,
            settleDelay: scrollDelay
          });

          if (scrollRes.status === 'success') {
            const dataUrl = await rateLimitedCaptureVisibleTab(tab.windowId, { format: 'png' });
            capturedFrames.push({
              y: scrollRes.coords.actualY,
              dataUrl
            });
          }
        }

        await chrome.tabs.sendMessage(tab.id, { action: 'cleanup_capture' });

        // Stitch
        const stitchedBlob = await stitchCapturedFrames(capturedFrames, viewportWidth, viewportHeight, dpr);
        const thumbBlob = await createThumbnail(stitchedBlob, 200, 150);

        const captureId = 'capt_' + Date.now() + '_' + idx;
        const captureData = {
          id: captureId,
          blob: stitchedBlob,
          title: title || 'Batch Capture',
          url: url,
          timestamp: Date.now(),
          thumbnail: thumbBlob
        };

        await saveCapture(captureData);
      }

      // Close tab
      chrome.tabs.remove(tab.id);
    } catch (e) {
      console.error(`Batch capture failed for ${url}:`, e);
      chrome.runtime.sendMessage({
        action: 'batch_progress',
        current: idx + 1,
        total: urls.length,
        url: url,
        status: `Failed: ${e.message}`
      });
    }
  }

  // Done notification
  chrome.runtime.sendMessage({ action: 'batch_complete' });
}

// 5. Gumroad License Key Check
async function verifyGumroadLicense(licenseKey) {
  if (!licenseKey) {
    return { success: false, message: 'Please enter a license key.' };
  }

  // 1. Check for developer mock bypass keys
  if (licenseKey.startsWith('MOCK-PRO-')) {
    await chrome.storage.local.set({ isPro: true, licenseKey });
    return { success: true, message: 'PRO activated successfully! (Developer Mock Bypass)' };
  }

  // 2. Call Gumroad License Verification API
  try {
    const response = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        product_id: 'ZrS8l9-ZiZOVNweP__OaTg==',
        license_key: licenseKey
      })
    });

    const data = await response.json();

    if (data.success && data.uses < 10) { // arbitrary validation check
      await chrome.storage.local.set({ isPro: true, licenseKey });
      return { success: true, message: 'PRO activated successfully!' };
    } else {
      return { 
        success: false, 
        message: data.message || 'Invalid license key or reached max uses.' 
      };
    }
  } catch (err) {
    console.error('License key verification connection failed:', err);
    return { 
      success: false, 
      message: 'Network verification failed. Please try again or use standard mock key (MOCK-PRO-XXXX).' 
    };
  }
}
