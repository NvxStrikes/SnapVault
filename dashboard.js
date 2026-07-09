// client-side script for SnapVault editor and dashboard


// Global App State
let db = null;
let currentCapture = null;
let currentTab = 'editor';
let isPro = false;

// Drawing & Canvas State
let canvas = null;
let ctx = null;
let bgImage = null; // Stored HTMLImageElement
let annotations = [];
let undoStack = [];
let redoStack = [];
let currentBrushAnnotation = null;
let cropBox = null;

let isDrawing = false;
let startX = 0;
let startY = 0;

let currentTool = 'select';
let strokeColor = '#ff4757';
let strokeWidth = 5;
let activeEmoji = '😀';

// Pan & Zoom parameters
let zoom = 1.0;
let panOffset = { x: 0, y: 0 };
let isPanning = false;
let startPan = { x: 0, y: 0 };

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Open Database
  try {
    db = await openDB();
  } catch (err) {
    console.error('Failed to open IndexedDB:', err);
  }

  // 2. Load Pro License settings
  chrome.storage.local.get(['isPro', 'scrollDelay', 'maxScrollLimit', 'expandScrollables', 'filenameTemplate'], (res) => {
    isPro = !!res.isPro;
    updateProUIState();
    
    // Load config settings into inputs
    document.getElementById('setting-delay').value = res.scrollDelay || 300;
    document.getElementById('setting-delay-val').textContent = `${res.scrollDelay || 300}ms`;
    document.getElementById('setting-max-scroll').value = res.maxScrollLimit || 15;
    document.getElementById('setting-max-scroll-val').textContent = `${res.maxScrollLimit || 15} screens`;
    document.getElementById('setting-expand-scroll').checked = res.expandScrollables !== false;
    document.getElementById('setting-filename').value = res.filenameTemplate || 'SnapVault_{title}_{date}_{time}';

    // Check query params for active screenshot ID
    const urlParams = new URLSearchParams(window.location.search);
    const captureId = urlParams.get('id');
    const targetTab = urlParams.get('tab');
    const showProNotice = urlParams.get('pro_notice');

    if (captureId) {
      loadCaptureIntoEditor(captureId);
      switchTab('editor');
    } else if (targetTab) {
      switchTab(targetTab);
      if (targetTab === 'settings' && showProNotice) {
        alert('You clicked a Pro Feature (Element Capture). Please activate your Pro License to unlock it!');
      }
    } else {
      switchTab('history'); // default to history tab if no capture is loaded
    }
  });

  // 3. Register UI Listeners
  initNavigation();
  initThemeToggle();
  initSettingsListeners();
  initEditorListeners();
  initBatchListeners();
  initHistoryListeners();
});

// Update UI based on PRO status
function updateProUIState() {
  const proSidebarCard = document.getElementById('pro-sidebar-card');
  const batchLockedState = document.getElementById('batch-locked-state');
  const batchUnlockedWorkspace = document.getElementById('batch-unlocked-workspace');
  const proBadgeStatus = document.getElementById('pro-badge-status');

  if (isPro) {
    // Sidebar
    proSidebarCard.innerHTML = `
      <div class="pro-status-badge" style="background-color: var(--color-success)">PRO ACTIVE</div>
      <p class="pro-tagline" style="font-size: 12px; margin-bottom: 0;">Thank you for supporting SnapVault! All features are unlocked.</p>
    `;
    
    // Batch Tab
    batchLockedState.style.display = 'none';
    batchUnlockedWorkspace.style.display = 'grid';

    // Settings Badge
    proBadgeStatus.className = 'pro-badge-showcase active';
    proBadgeStatus.innerHTML = `
      <div class="status-indicator active"></div>
      <span>PRO TIER ACTIVATED</span>
    `;
  } else {
    // Free State defaults
    batchLockedState.style.display = 'flex';
    batchUnlockedWorkspace.style.display = 'none';
    
    proBadgeStatus.className = 'pro-badge-showcase';
    proBadgeStatus.innerHTML = `
      <div class="status-indicator inactive"></div>
      <span>FREE TIER ACTIVE</span>
    `;
  }
}

// 1. Navigation Controller
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  document.getElementById('upgrade-sidebar-btn')?.addEventListener('click', () => {
    switchTab('settings');
    document.getElementById('license-key-input').focus();
  });

  document.getElementById('btn-goto-settings-batch')?.addEventListener('click', () => {
    switchTab('settings');
    document.getElementById('license-key-input').focus();
  });
}

function switchTab(tabName) {
  currentTab = tabName;
  
  // Update sidebar active state
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.getAttribute('data-tab') === tabName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Toggle Tab Panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    if (pane.id === `pane-${tabName}`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });

  // Custom tab activation triggers
  if (tabName === 'history') {
    renderHistoryGrid();
  }
}

// 2. Dark/Light Theme Handler
function initThemeToggle() {
  const themeToggle = document.getElementById('dark-theme-toggle');
  
  // Load saved theme
  chrome.storage.local.get('theme', (res) => {
    const isDark = res.theme === 'dark';
    themeToggle.checked = isDark;
    if (isDark) {
      document.body.className = 'theme-dark';
    } else {
      document.body.className = 'theme-light';
    }
  });

  themeToggle.addEventListener('change', () => {
    const dark = themeToggle.checked;
    if (dark) {
      document.body.className = 'theme-dark';
      chrome.storage.local.set({ theme: 'dark' });
    } else {
      document.body.className = 'theme-light';
      chrome.storage.local.set({ theme: 'light' });
    }
  });
}

// 3. Settings Controller
function initSettingsListeners() {
  const delaySlider = document.getElementById('setting-delay');
  const delayVal = document.getElementById('setting-delay-val');
  delaySlider.addEventListener('input', () => {
    delayVal.textContent = `${delaySlider.value}ms`;
  });

  const maxScrollSlider = document.getElementById('setting-max-scroll');
  const maxScrollVal = document.getElementById('setting-max-scroll-val');
  maxScrollSlider.addEventListener('input', () => {
    maxScrollVal.textContent = `${maxScrollSlider.value} screens`;
  });

  // Save Settings Click
  document.getElementById('btn-save-capture-settings').addEventListener('click', () => {
    const delay = parseInt(delaySlider.value);
    const maxScroll = parseInt(maxScrollSlider.value);
    const expand = document.getElementById('setting-expand-scroll').checked;
    const template = document.getElementById('setting-filename').value;

    chrome.storage.local.set({
      scrollDelay: delay,
      maxScrollLimit: maxScroll,
      expandScrollables: expand,
      filenameTemplate: template
    }, () => {
      alert('Settings saved successfully!');
    });
  });

  // License Key Activation Click
  document.getElementById('btn-activate-license').addEventListener('click', async () => {
    const keyInput = document.getElementById('license-key-input');
    const key = keyInput.value.trim();
    if (!key) {
      alert('Please enter a license key.');
      return;
    }

    const btn = document.getElementById('btn-activate-license');
    btn.disabled = true;
    btn.textContent = 'Verifying...';

    chrome.runtime.sendMessage({ action: 'verify_license', licenseKey: key }, (res) => {
      btn.disabled = false;
      btn.textContent = 'Activate Pro';

      if (res && res.success) {
        isPro = true;
        updateProUIState();
        alert(res.message);
        keyInput.value = '';
      } else {
        alert(res ? res.message : 'Activation failed.');
      }
    });
  });
}

// 4. Editor Controller (Drawing Canvas Engine)
function initEditorListeners() {
  canvas = document.getElementById('screenshot-canvas');
  ctx = canvas.getContext('2d', { willReadFrequently: true });

  const viewport = document.getElementById('workspace-viewport');

  // Trigger test capture from empty state
  document.getElementById('btn-trigger-test-capture').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'trigger_full_capture' }, () => {
      window.close(); // Close extension settings to reveal tab capture
    });
  });

  document.getElementById('btn-goto-history').addEventListener('click', () => {
    switchTab('history');
  });

  // Left Toolbar buttons
  const toolBtns = document.querySelectorAll('.tool-btn');
  toolBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      // Prevent picker click interference
      if (btn.id === 'tool-btn-emoji' && e.target !== btn && !btn.contains(e.target)) return;

      const tool = btn.getAttribute('data-tool');
      if (tool === 'emoji' && !isPro) {
        alert('Emoji stickers are a PRO feature. Activate Pro in the Settings tab to unlock!');
        return;
      }

      setTool(tool);
    });
  });

  // Emoji picker selector
  const emojiPicker = document.getElementById('emoji-picker');
  document.getElementById('tool-btn-emoji').addEventListener('click', (e) => {
    if (!isPro) return;
    emojiPicker.classList.toggle('active');
  });

  emojiPicker.addEventListener('click', (e) => {
    if (e.target.tagName === 'SPAN') {
      activeEmoji = e.target.textContent;
      emojiPicker.classList.remove('active');
      setTool('emoji');
    }
  });

  // Close emoji picker when clicking outside
  document.addEventListener('click', (e) => {
    const emojiBtn = document.getElementById('tool-btn-emoji');
    if (emojiBtn && !emojiBtn.contains(e.target)) {
      emojiPicker.classList.remove('active');
    }
  });

  // Color Palette Swatches
  const swatches = document.querySelectorAll('.color-swatch');
  swatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      strokeColor = swatch.getAttribute('data-color');
      document.getElementById('custom-color-picker').value = strokeColor;
    });
  });

  // Custom Color Picker input
  const customColor = document.getElementById('custom-color-picker');
  customColor.addEventListener('input', () => {
    swatches.forEach(s => s.classList.remove('active'));
    strokeColor = customColor.value;
  });

  // Stroke thickness range slider
  const sizeSlider = document.getElementById('stroke-width-range');
  const sizeVal = document.getElementById('stroke-width-val');
  sizeSlider.addEventListener('input', () => {
    strokeWidth = parseInt(sizeSlider.value);
    sizeVal.textContent = `${strokeWidth}px`;
  });

  // Zoom actions
  document.getElementById('btn-zoom-in').addEventListener('click', () => adjustZoom(0.1));
  document.getElementById('btn-zoom-out').addEventListener('click', () => adjustZoom(-0.1));
  document.getElementById('btn-zoom-reset').addEventListener('click', resetZoomAndFit);

  // Undo / Redo / Clear Actions
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-clear-canvas').addEventListener('click', clearAnnotations);

  // Keyboard events
  document.addEventListener('keydown', (e) => {
    if (currentTab !== 'editor' || !currentCapture) return;

    // Undo/Redo Shortcuts
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      undo();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      redo();
    }

    // Spacebar to pan toggle
    if (e.code === 'Space' && document.activeElement.tagName !== 'TEXTAREA') {
      e.preventDefault();
      if (currentTool !== 'select') {
        viewport.style.cursor = 'grab';
      }
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space' && currentTool !== 'select') {
      viewport.style.cursor = 'default';
    }
  });

  // Canvas Mouse events
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', () => {
    if (isDrawing) {
      isDrawing = false;
      renderCanvas();
    }
    isPanning = false;
  });

  // Workspace Pan events (Select/Pan mode)
  viewport.addEventListener('mousedown', (e) => {
    if (currentTool === 'select' || e.code === 'Space') {
      isPanning = true;
      viewport.style.cursor = 'grabbing';
      startPan = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    }
  });

  viewport.addEventListener('mousemove', (e) => {
    if (isPanning) {
      panOffset = {
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      };
      updateCanvasTransform();
    }
  });

  viewport.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      viewport.style.cursor = currentTool === 'select' ? 'grab' : 'default';
    }
  });

  // Export dropdown toggles
  const expBtn = document.getElementById('btn-export-dropdown');
  const expMenu = document.getElementById('export-menu');
  expBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    expMenu.classList.toggle('active');
  });

  document.addEventListener('click', () => {
    expMenu.classList.remove('active');
  });

  // Export Handlers
  document.getElementById('export-png').addEventListener('click', () => exportImage('png'));
  document.getElementById('export-jpeg').addEventListener('click', () => exportImage('jpeg'));
  document.getElementById('export-webp').addEventListener('click', () => exportImage('webp'));
  document.getElementById('export-pdf').addEventListener('click', exportPDF);
  document.getElementById('export-copy').addEventListener('click', copyToClipboard);

  // Flip Handlers
  document.getElementById('btn-flip-h').addEventListener('click', () => flipImage('horizontal'));
  document.getElementById('btn-flip-v').addEventListener('click', () => flipImage('vertical'));
}

// Set active drawing tool
function setTool(toolName) {
  currentTool = toolName;
  document.querySelectorAll('.tool-btn').forEach(btn => {
    if (btn.getAttribute('data-tool') === toolName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  const viewport = document.getElementById('workspace-viewport');
  if (toolName === 'select') {
    viewport.style.cursor = 'grab';
  } else {
    viewport.style.cursor = 'default';
  }
}

// Adjust zoom scale
function adjustZoom(amount) {
  zoom = Math.max(0.1, Math.min(3.0, zoom + amount));
  document.getElementById('zoom-indicator').textContent = `${Math.round(zoom * 100)}%`;
  updateCanvasTransform();
}

// Reset zoom and center
function resetZoomAndFit() {
  if (!bgImage) return;

  const viewport = document.getElementById('workspace-viewport');
  const viewW = viewport.clientWidth - 80;
  const viewH = viewport.clientHeight - 80;

  const scaleW = viewW / bgImage.width;
  const scaleH = viewH / bgImage.height;
  
  zoom = Math.min(1.0, scaleW, scaleH);
  panOffset = { x: 0, y: 0 };
  
  document.getElementById('zoom-indicator').textContent = `${Math.round(zoom * 100)}%`;
  updateCanvasTransform();
}

// Update canvas CSS scaling
function updateCanvasTransform() {
  const wrapper = document.getElementById('canvas-wrapper');
  wrapper.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`;
}

// Load Capture data into editor
async function loadCaptureIntoEditor(id) {
  try {
    const item = await getCapture(id);
    if (!item) {
      console.error('Capture not found in DB:', id);
      return;
    }

    currentCapture = item;
    
    // Hide empty state, show workspace
    document.getElementById('editor-empty-state').style.display = 'none';
    document.getElementById('editor-actual-workspace').style.display = 'flex';

    // Set title and info
    document.getElementById('editor-screenshot-title').textContent = item.title;
    
    // Load Image
    const url = URL.createObjectURL(item.blob);
    bgImage = new Image();
    bgImage.onload = () => {
      canvas.width = bgImage.width;
      canvas.height = bgImage.height;
      
      document.getElementById('editor-screenshot-dim').textContent = `${bgImage.width} × ${bgImage.height}`;
      
      // Reset annotations
      annotations = [];
      undoStack = [];
      redoStack = [];
      updateUndoRedoButtons();
      
      // Reset zoom
      resetZoomAndFit();
      
      // Draw initial state
      renderCanvas();
      URL.revokeObjectURL(url);
    };
    bgImage.src = url;

  } catch (err) {
    console.error('Error loading capture:', err);
  }
}

// Vector Render Canvas Loop
function renderCanvas() {
  if (!bgImage) return;

  // 1. Draw base background image
  ctx.drawImage(bgImage, 0, 0);

  // 2. Draw all vector annotations in order
  annotations.forEach(ann => {
    drawAnnotation(ctx, ann);
  });
}

// Draw single annotation
function drawAnnotation(targetCtx, ann) {
  targetCtx.save();

  if (ann.type === 'arrow') {
    drawArrow(targetCtx, ann.x1, ann.y1, ann.x2, ann.y2, ann.color, ann.width);
  } else if (ann.type === 'rect') {
    targetCtx.strokeStyle = ann.color;
    targetCtx.lineWidth = ann.width;
    targetCtx.lineJoin = 'round';
    targetCtx.strokeRect(ann.x1, ann.y1, ann.x2 - ann.x1, ann.y2 - ann.y1);
  } else if (ann.type === 'ellipse') {
    targetCtx.strokeStyle = ann.color;
    targetCtx.lineWidth = ann.width;
    targetCtx.beginPath();
    const rx = Math.abs(ann.x2 - ann.x1) / 2;
    const ry = Math.abs(ann.y2 - ann.y1) / 2;
    const cx = ann.x1 + (ann.x2 - ann.x1) / 2;
    const cy = ann.y1 + (ann.y2 - ann.y1) / 2;
    targetCtx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    targetCtx.stroke();
  } else if (ann.type === 'highlight') {
    targetCtx.fillStyle = hexToRGBA(ann.color, 0.35);
    const x = Math.min(ann.x1, ann.x2);
    const y = Math.min(ann.y1, ann.y2);
    const w = Math.abs(ann.x2 - ann.x1);
    const h = Math.abs(ann.y2 - ann.y1);
    targetCtx.fillRect(x, y, w, h);
  } else if (ann.type === 'blur') {
    const x = Math.min(ann.x1, ann.x2);
    const y = Math.min(ann.y1, ann.y2);
    const w = Math.abs(ann.x2 - ann.x1);
    const h = Math.abs(ann.y2 - ann.y1);
    if (w > 0 && h > 0) {
      pixelate(targetCtx, x, y, w, h, 14);
    }
  } else if (ann.type === 'text') {
    targetCtx.fillStyle = ann.color;
    targetCtx.font = `bold ${ann.fontSize}px system-ui, -apple-system, sans-serif`;
    targetCtx.textBaseline = 'top';
    targetCtx.fillText(ann.text, ann.x, ann.y);
  } else if (ann.type === 'emoji') {
    targetCtx.font = `${ann.fontSize}px system-ui, -apple-system, sans-serif`;
    targetCtx.textBaseline = 'middle';
    targetCtx.textAlign = 'center';
    targetCtx.fillText(ann.emoji, ann.x, ann.y);
  } else if (ann.type === 'brush') {
    targetCtx.strokeStyle = ann.color;
    targetCtx.lineWidth = ann.width;
    targetCtx.lineCap = 'round';
    targetCtx.lineJoin = 'round';
    targetCtx.beginPath();
    targetCtx.moveTo(ann.points[0].x, ann.points[0].y);
    for (let i = 1; i < ann.points.length; i++) {
      targetCtx.lineTo(ann.points[i].x, ann.points[i].y);
    }
    targetCtx.stroke();
  }

  targetCtx.restore();
}

// Convert Hex color to RGBA for transparent highlighter
function hexToRGBA(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Helper to draw clean arrow
function drawArrow(targetCtx, x1, y1, x2, y2, color, width) {
  const headlen = Math.max(10, width * 2.5); // size of head
  const dx = x2 - x1;
  const dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  
  targetCtx.strokeStyle = color;
  targetCtx.lineWidth = width;
  targetCtx.lineCap = 'round';
  targetCtx.lineJoin = 'round';
  
  // Arrow shaft
  targetCtx.beginPath();
  targetCtx.moveTo(x1, y1);
  targetCtx.lineTo(x2, y2);
  targetCtx.stroke();
  
  // Arrow head
  targetCtx.fillStyle = color;
  targetCtx.beginPath();
  targetCtx.moveTo(x2, y2);
  targetCtx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
  targetCtx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
  targetCtx.closePath();
  targetCtx.fill();
}

// Pixelation algorithms for redaction
function pixelate(targetCtx, x, y, w, h, pixelSize) {
  try {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iw = Math.floor(w);
    const ih = Math.floor(h);
    if (iw <= 0 || ih <= 0) return;

    const imgData = targetCtx.getContextAttributes ? targetCtx.getImageData(ix, iy, iw, ih) : targetCtx.getImageData(ix, iy, iw, ih); // wait, let's keep it simple
    // const imgData = targetCtx.getImageData(ix, iy, iw, ih);
    const data = imgData.data;
    const width = imgData.width;
    const height = imgData.height;
    
    for (let r = 0; r < height; r += pixelSize) {
      for (let c = 0; c < width; c += pixelSize) {
        const pixelIdx = (r * width + c) * 4;
        const red = data[pixelIdx];
        const green = data[pixelIdx + 1];
        const blue = data[pixelIdx + 2];
        const alpha = data[pixelIdx + 3];
        
        for (let dy = 0; dy < pixelSize && r + dy < height; dy++) {
          for (let dx = 0; dx < pixelSize && c + dx < width; dx++) {
            const targetIdx = ((r + dy) * width + (c + dx)) * 4;
            data[targetIdx] = red;
            data[targetIdx + 1] = green;
            data[targetIdx + 2] = blue;
            data[targetIdx + 3] = alpha;
          }
        }
      }
    }
    targetCtx.putImageData(imgData, ix, iy);
  } catch (e) {
    // Canvas context might be tainted in edge cases, fallback to solid redact
    targetCtx.fillStyle = '#1e293b';
    targetCtx.fillRect(x, y, w, h);
  }
}

// Canvas Mouse Interactions
function mapMouseToCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { x, y };
}

function onMouseDown(e) {
  if (currentTool === 'select') return;
  e.preventDefault();
  
  hideCropButton();

  const coords = mapMouseToCanvas(e);
  startX = coords.x;
  startY = coords.y;

  if (currentTool === 'text') {
    createTextOverlay(e.clientX, e.clientY, coords.x, coords.y);
    return;
  }

  if (currentTool === 'emoji') {
    saveState();
    annotations.push({
      type: 'emoji',
      x: coords.x,
      y: coords.y,
      emoji: activeEmoji,
      fontSize: strokeWidth * 5
    });
    redoStack = [];
    updateUndoRedoButtons();
    renderCanvas();
    return;
  }

  if (currentTool === 'brush') {
    isDrawing = true;
    currentBrushAnnotation = {
      type: 'brush',
      points: [{ x: startX, y: startY }],
      color: strokeColor,
      width: strokeWidth
    };
    return;
  }

  if (currentTool === 'crop') {
    isDrawing = true;
    return;
  }

  isDrawing = true;
}

function onMouseMove(e) {
  if (!isDrawing) return;

  const coords = mapMouseToCanvas(e);

  if (currentTool === 'brush') {
    currentBrushAnnotation.points.push({ x: coords.x, y: coords.y });
    renderCanvas();
    
    ctx.save();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(currentBrushAnnotation.points[0].x, currentBrushAnnotation.points[0].y);
    for (let i = 1; i < currentBrushAnnotation.points.length; i++) {
      ctx.lineTo(currentBrushAnnotation.points[i].x, currentBrushAnnotation.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
    return;
  }

  // Redraw previous content to show dynamic shape line
  renderCanvas();

  if (currentTool === 'crop') {
    ctx.save();
    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);
    ctx.strokeRect(startX, startY, coords.x - startX, coords.y - startY);
    ctx.setLineDash([]);
    ctx.restore();
    return;
  }

  // Draw temp shape
  ctx.save();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  
  if (currentTool === 'arrow') {
    drawArrow(ctx, startX, startY, coords.x, coords.y, strokeColor, strokeWidth);
  } else if (currentTool === 'rect') {
    ctx.strokeRect(startX, startY, coords.x - startX, coords.y - startY);
  } else if (currentTool === 'ellipse') {
    ctx.beginPath();
    const rx = Math.abs(coords.x - startX) / 2;
    const ry = Math.abs(coords.y - startY) / 2;
    const cx = startX + (coords.x - startX) / 2;
    const cy = startY + (coords.y - startY) / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
    ctx.stroke();
  } else if (currentTool === 'highlight') {
    ctx.fillStyle = hexToRGBA(strokeColor, 0.35);
    ctx.fillRect(Math.min(startX, coords.x), Math.min(startY, coords.y), Math.abs(coords.x - startX), Math.abs(coords.y - startY));
  } else if (currentTool === 'blur') {
    ctx.fillStyle = 'rgba(30, 41, 59, 0.4)';
    ctx.fillRect(Math.min(startX, coords.x), Math.min(startY, coords.y), Math.abs(coords.x - startX), Math.abs(coords.y - startY));
  }
  
  ctx.restore();
}

function onMouseUp(e) {
  if (!isDrawing) return;
  isDrawing = false;

  const coords = mapMouseToCanvas(e);

  if (currentTool === 'brush') {
    if (currentBrushAnnotation && currentBrushAnnotation.points.length > 1) {
      saveState();
      annotations.push(currentBrushAnnotation);
      redoStack = [];
      updateUndoRedoButtons();
    }
    currentBrushAnnotation = null;
    renderCanvas();
    return;
  }

  if (currentTool === 'crop') {
    const cx = Math.min(startX, coords.x);
    const cy = Math.min(startY, coords.y);
    const cw = Math.abs(coords.x - startX);
    const ch = Math.abs(coords.y - startY);
    if (cw > 10 && ch > 10) {
      cropBox = { x: cx, y: cy, w: cw, h: ch };
      showCropButton(cx, cy, cw, ch);
    }
    return;
  }

  const w = Math.abs(coords.x - startX);
  const h = Math.abs(coords.y - startY);

  // Only add annotations if they have a non-zero size
  if (w > 1 || h > 1) {
    saveState();
    annotations.push({
      type: currentTool,
      x1: startX,
      y1: startY,
      x2: coords.x,
      y2: coords.y,
      color: strokeColor,
      width: strokeWidth
    });
    redoStack = [];
    updateUndoRedoButtons();
  }
  
  renderCanvas();
}

// Text Input Overlay Tool
function createTextOverlay(clientX, clientY, canvasX, canvasY) {
  // Check if text area already exists
  const existing = document.getElementById('temp-text-area');
  if (existing) return;

  const overlayContainer = document.getElementById('text-tool-overlay-container');
  const textarea = document.createElement('textarea');
  textarea.id = 'temp-text-area';
  
  // Font scale logic
  const fs = strokeWidth * 3;

  Object.assign(textarea.style, {
    left: `${clientX - overlayContainer.getBoundingClientRect().left}px`,
    top: `${clientY - overlayContainer.getBoundingClientRect().top}px`,
    fontSize: `${fs}px`,
    color: strokeColor,
    fontWeight: 'bold',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  });
  textarea.className = 'canvas-text-input';

  overlayContainer.appendChild(textarea);
  textarea.focus();

  // Complete and draw text on blur or Enter key
  function finishText() {
    const textVal = textarea.value.trim();
    if (textVal) {
      saveState();
      annotations.push({
        type: 'text',
        x: canvasX,
        y: canvasY,
        text: textVal,
        color: strokeColor,
        fontSize: fs
      });
      redoStack = [];
      updateUndoRedoButtons();
    }
    textarea.remove();
    renderCanvas();
  }

  textarea.addEventListener('blur', finishText);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      finishText();
    }
    if (e.key === 'Escape') {
      textarea.remove();
      renderCanvas();
    }
  });
}

// Undo/Redo Engine
function saveState() {
  // Push deep copy of annotations
  undoStack.push([...annotations.map(a => ({...a}))]);
  if (undoStack.length > 25) {
    undoStack.shift(); // limit history depth
  }
}

function undo() {
  if (undoStack.length === 0) return;
  
  // Push current to redo
  redoStack.push([...annotations.map(a => ({...a}))]);

  annotations = undoStack.pop();
  updateUndoRedoButtons();
  renderCanvas();
}

function redo() {
  if (redoStack.length === 0) return;

  undoStack.push([...annotations.map(a => ({...a}))]);
  annotations = redoStack.pop();
  updateUndoRedoButtons();
  renderCanvas();
}

function clearAnnotations() {
  if (annotations.length === 0) return;
  if (confirm('Are you sure you want to clear all annotations?')) {
    saveState();
    annotations = [];
    redoStack = [];
    updateUndoRedoButtons();
    renderCanvas();
  }
}

function updateUndoRedoButtons() {
  document.getElementById('btn-undo').disabled = undoStack.length === 0;
  document.getElementById('btn-redo').disabled = redoStack.length === 0;
}

// Format Filename
async function generateFileName(format) {
  const settings = await chrome.storage.local.get('filenameTemplate');
  const template = settings.filenameTemplate || 'SnapVault_{title}_{date}_{time}';

  const date = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyymmdd = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const hhmmss = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;

  let title = currentCapture ? currentCapture.title : 'Screenshot';
  // Strip characters unsafe for file names
  title = title.replace(/[\\/:*?"<>|]/g, '_');

  let urlDomain = 'unknown';
  if (currentCapture && currentCapture.url) {
    try {
      const u = new URL(currentCapture.url);
      urlDomain = u.hostname;
    } catch(e) {}
  }

  let filename = template
    .replace('{title}', title)
    .replace('{date}', yyyymmdd)
    .replace('{time}', hhmmss)
    .replace('{url}', urlDomain);

  return `${filename}.${format}`;
}

// Image exports (PNG/JPEG/WEBP)
async function exportImage(format) {
  if (!bgImage) return;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true });

  // Draw background image
  exportCtx.drawImage(bgImage, 0, 0);

  // Draw vector overlay annotations
  annotations.forEach(ann => {
    drawAnnotation(exportCtx, ann);
  });

  const mime = `image/${format}`;
  const dataUrl = exportCanvas.toDataURL(mime, 0.92);
  const filename = await generateFileName(format);

  chrome.downloads.download({
    url: dataUrl,
    filename: filename,
    saveAs: true
  });
}

// Copy pixels to Clipboard
async function copyToClipboard() {
  if (!bgImage) return;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true });

  exportCtx.drawImage(bgImage, 0, 0);
  annotations.forEach(ann => {
    drawAnnotation(exportCtx, ann);
  });

  try {
    exportCanvas.toBlob(async (blob) => {
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      alert('Screenshot copied to clipboard!');
    }, 'image/png');
  } catch (err) {
    alert('Failed to copy to clipboard. Clipboard APIs might be restricted on settings tabs.');
    console.error(err);
  }
}

// PDF Export (PRO) with Clickable Links
async function exportPDF() {
  if (!isPro) {
    alert('Exporting as PDF is a PRO feature. Activate Pro in the Settings tab to unlock!');
    return;
  }

  if (!bgImage) return;

  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const exportCtx = exportCanvas.getContext('2d', { willReadFrequently: true });

  exportCtx.drawImage(bgImage, 0, 0);
  annotations.forEach(ann => {
    drawAnnotation(exportCtx, ann);
  });

  const imgData = exportCanvas.toDataURL('image/jpeg', 0.9);
  const filename = await generateFileName('pdf');

  try {
    const { jsPDF } = window.jspdf;
    
    // Create PDF with exact pixel format
    const doc = new jsPDF({
      orientation: exportCanvas.width > exportCanvas.height ? 'l' : 'p',
      unit: 'px',
      format: [exportCanvas.width, exportCanvas.height]
    });

    doc.addImage(imgData, 'JPEG', 0, 0, exportCanvas.width, exportCanvas.height);

    // Apply interactive links
    const dpr = currentCapture.devicePixelRatio || 1;
    if (currentCapture.links && currentCapture.links.length > 0) {
      currentCapture.links.forEach(link => {
        // scale CSS position coordinates to DPR canvas space
        const left = link.left * dpr;
        const top = link.top * dpr;
        const width = link.width * dpr;
        const height = link.height * dpr;

        doc.link(left, top, width, height, { url: link.href });
      });
    }

    doc.save(filename);
  } catch (err) {
    console.error('PDF Generation failed:', err);
    alert('Failed to generate PDF locally. Make sure jsPDF is bundled.');
  }
}

// 5. History Tab Controller
async function renderHistoryGrid() {
  const container = document.getElementById('history-grid');
  const emptyState = document.getElementById('history-empty-state');
  
  // Clear container
  container.innerHTML = '';

  const captures = await getAllCaptures();
  
  document.getElementById('history-count').textContent = `${captures.length} captures`;

  if (captures.length === 0) {
    emptyState.style.display = 'flex';
    container.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  container.style.display = 'grid';

  captures.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.setAttribute('data-id', item.id);

    const dateFormatted = new Date(item.timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const thumbUrl = URL.createObjectURL(item.thumbnail);

    card.innerHTML = `
      <div class="card-preview-area">
        <img src="${thumbUrl}" alt="Thumbnail">
        <div class="card-overlay-actions">
          <button class="btn btn-primary btn-sm btn-edit-capt" data-id="${item.id}">Edit</button>
          <button class="btn btn-secondary btn-sm btn-delete-capt" data-id="${item.id}" style="color:#ff4757; border-color:#ff4757;">Delete</button>
        </div>
      </div>
      <div class="card-info-area">
        <div class="card-title" title="${item.title}">${item.title}</div>
        <div class="card-meta-row">
          <a class="card-url-link" href="${item.url}" target="_blank" title="${item.url}">${item.url}</a>
          <span class="card-date">${dateFormatted}</span>
        </div>
      </div>
    `;

    container.appendChild(card);
    
    // Revoke URL on load completion to prevent leaks
    card.querySelector('img').onload = () => {
      URL.revokeObjectURL(thumbUrl);
    };
  });

  // Attach button triggers inside history
  container.querySelectorAll('.btn-edit-capt').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      loadCaptureIntoEditor(id);
      switchTab('editor');
    });
  });

  container.querySelectorAll('.btn-delete-capt').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (confirm('Delete this screenshot from local storage?')) {
        await deleteCapture(id);
        renderHistoryGrid();
      }
    });
  });
}

function initHistoryListeners() {
  document.getElementById('btn-clear-history').addEventListener('click', async () => {
    const captures = await getAllCaptures();
    if (captures.length === 0) return;

    if (confirm('Delete ALL screenshots from local storage? This cannot be undone.')) {
      await clearAllCaptures();
      renderHistoryGrid();
      
      // Clear editor workspace if loaded
      currentCapture = null;
      bgImage = null;
      document.getElementById('editor-empty-state').style.display = 'flex';
      document.getElementById('editor-actual-workspace').style.display = 'none';
    }
  });
}

// 6. Batch Capture Controller (PRO)
function initBatchListeners() {
  const delaySlider = document.getElementById('batch-delay');
  const delayVal = document.getElementById('batch-delay-val');
  delaySlider.addEventListener('input', () => {
    delayVal.textContent = `${delaySlider.value}ms`;
  });

  // Start Batch Capture button click
  document.getElementById('btn-start-batch').addEventListener('click', async () => {
    if (!isPro) return;

    const urlsText = document.getElementById('batch-urls').value.trim();
    if (!urlsText) {
      alert('Please enter at least one URL.');
      return;
    }

    const urls = urlsText.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    
    // Validate urls basic
    for (let url of urls) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        alert(`Invalid URL: ${url}. URLs must start with http:// or https://`);
        return;
      }
    }

    // Request optional permissions for batch capture urls
    const permissionGranted = await new Promise((resolve) => {
      chrome.permissions.request({
        origins: ['<all_urls>']
      }, (granted) => resolve(granted));
    });

    if (!permissionGranted) {
      alert('Broad host permission is required to perform batch automated capturing.');
      return;
    }

    // Reset progress UI and show card
    const progCard = document.getElementById('batch-progress-card');
    const fill = document.getElementById('batch-progress-fill');
    const txt = document.getElementById('batch-progress-text');
    const logs = document.getElementById('batch-logs');
    const btn = document.getElementById('btn-start-batch');

    progCard.style.display = 'block';
    fill.style.width = '0%';
    txt.textContent = `0 / ${urls.length} pages captured`;
    logs.innerHTML = '<div class="log-entry info">Starting batch process...</div>';
    btn.disabled = true;

    chrome.runtime.sendMessage({
      action: 'start_batch_capture',
      urls: urls,
      options: {
        scrollDelay: parseInt(delaySlider.value)
      }
    }, (res) => {
      if (res && !res.success) {
        btn.disabled = false;
        alert(`Batch start error: ${res.error}`);
      }
    });
  });

  // Listen to batch progress events from background.js
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'batch_progress') {
      const fill = document.getElementById('batch-progress-fill');
      const txt = document.getElementById('batch-progress-text');
      const logs = document.getElementById('batch-logs');

      const percent = (message.current / message.total) * 100;
      fill.style.width = `${percent}%`;
      txt.textContent = `${message.current} / ${message.total} pages captured`;

      // Log print
      const entry = document.createElement('div');
      entry.className = `log-entry ${message.status.toLowerCase().includes('failed') ? 'failed' : 'info'}`;
      
      const time = new Date().toLocaleTimeString(undefined, { hour12: false });
      entry.innerHTML = `
        <span>[${time}] ${message.url}</span>
        <span>${message.status}</span>
      `;
      logs.appendChild(entry);
      logs.scrollTop = logs.scrollHeight;
    }

    if (message.action === 'batch_complete') {
      const btn = document.getElementById('btn-start-batch');
      btn.disabled = false;
      
      const logs = document.getElementById('batch-logs');
      const entry = document.createElement('div');
      entry.className = 'log-entry success';
      entry.innerHTML = `<strong>Batch Completed Successfully!</strong>`;
      logs.appendChild(entry);
      logs.scrollTop = logs.scrollHeight;

      alert('Batch capture finished! Reloading local history.');
      renderHistoryGrid();
    }
  });
}

// Helper to create a thumbnail in dashboard.js
async function createDashboardThumbnail(blob, width, height) {
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

    const offscreen = new OffscreenCanvas(targetW, targetH);
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    offCtx.drawImage(bitmap, 0, 0, targetW, targetH);
    return await offscreen.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  } catch (e) {
    console.error('Thumbnail generation failed, using fallback', e);
    return blob;
  }
}

// Show/Hide Floating Crop buttons
function showCropButton(x, y, w, h) {
  const container = document.getElementById('canvas-wrapper');
  let btn = document.getElementById('snapvault-btn-apply-crop');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'snapvault-btn-apply-crop';
    btn.className = 'btn btn-primary';
    btn.textContent = 'Apply Crop';
    btn.style.cssText = `
      position: absolute;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.25);
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 13px;
      font-weight: bold;
    `;
    btn.addEventListener('click', () => {
      if (cropBox) {
        applyCrop(cropBox.x, cropBox.y, cropBox.w, cropBox.h);
      }
    });
    container.appendChild(btn);
  }
  
  // Position at bottom-right of the crop box
  btn.style.left = `${x + w - 100}px`;
  btn.style.top = `${y + h + 10}px`;
  btn.style.display = 'block';
}

function hideCropButton() {
  const btn = document.getElementById('snapvault-btn-apply-crop');
  if (btn) {
    btn.style.display = 'none';
  }
}

// Apply Crop operation
async function applyCrop(x, y, w, h) {
  if (!bgImage) return;

  const cropCanvas = new OffscreenCanvas(w, h);
  const cropCtx = cropCanvas.getContext('2d', { willReadFrequently: true });
  
  cropCtx.drawImage(bgImage, x, y, w, h, 0, 0, w, h);
  
  const croppedBlob = await cropCanvas.convertToBlob({ type: 'image/png' });
  const url = URL.createObjectURL(croppedBlob);
  
  const newImg = new Image();
  newImg.onload = async () => {
    bgImage = newImg;
    canvas.width = w;
    canvas.height = h;
    
    // Shift annotations
    annotations.forEach(ann => {
      if (ann.type === 'brush') {
        ann.points.forEach(pt => {
          pt.x -= x;
          pt.y -= y;
        });
      } else if (ann.type === 'text' || ann.type === 'emoji') {
        ann.x -= x;
        ann.y -= y;
      } else {
        ann.x1 -= x;
        ann.y1 -= y;
        ann.x2 -= x;
        ann.y2 -= y;
      }
    });

    // Remove annotations that are completely out of cropped region
    annotations = annotations.filter(ann => {
      if (ann.type === 'brush') {
        return ann.points.some(pt => pt.x >= 0 && pt.x <= w && pt.y >= 0 && pt.y <= h);
      }
      if (ann.type === 'text' || ann.type === 'emoji') {
        return ann.x >= -50 && ann.x <= w + 50 && ann.y >= -50 && ann.y <= h + 50;
      }
      const minX = Math.min(ann.x1, ann.x2);
      const maxX = Math.max(ann.x1, ann.x2);
      const minY = Math.min(ann.y1, ann.y2);
      const maxY = Math.max(ann.y1, ann.y2);
      return !(maxX < 0 || minX > w || maxY < 0 || minY > h);
    });
    
    if (currentCapture) {
      currentCapture.blob = croppedBlob;
      currentCapture.thumbnail = await createDashboardThumbnail(croppedBlob, 200, 150);
      
      if (currentCapture.links) {
        const dpr = currentCapture.devicePixelRatio || 1;
        const offsetCSSX = x / dpr;
        const offsetCSSY = y / dpr;
        currentCapture.links.forEach(link => {
          link.left -= offsetCSSX;
          link.top -= offsetCSSY;
        });
      }
      
      await saveCapture(currentCapture);
    }
    
    setTool('select');
    saveState();
    renderCanvas();
    resetZoomAndFit();
    URL.revokeObjectURL(url);
  };
  newImg.src = url;
  hideCropButton();
}

// Apply Flip operation
async function flipImage(orientation) {
  if (!bgImage) return;
  
  const w = canvas.width;
  const h = canvas.height;
  
  const flipCanvas = new OffscreenCanvas(w, h);
  const flipCtx = flipCanvas.getContext('2d', { willReadFrequently: true });
  
  if (orientation === 'horizontal') {
    flipCtx.translate(w, 0);
    flipCtx.scale(-1, 1);
  } else {
    flipCtx.translate(0, h);
    flipCtx.scale(1, -1);
  }
  
  flipCtx.drawImage(bgImage, 0, 0);
  
  const flippedBlob = await flipCanvas.convertToBlob({ type: 'image/png' });
  const url = URL.createObjectURL(flippedBlob);
  
  const newImg = new Image();
  newImg.onload = async () => {
    bgImage = newImg;
    
    // Adjust all annotations
    annotations.forEach(ann => {
      if (orientation === 'horizontal') {
        if (ann.type === 'brush') {
          ann.points.forEach(pt => {
            pt.x = w - pt.x;
          });
        } else if (ann.type === 'text' || ann.type === 'emoji') {
          ann.x = w - ann.x;
        } else {
          const x1 = w - ann.x1;
          const x2 = w - ann.x2;
          ann.x1 = x1;
          ann.x2 = x2;
        }
      } else {
        if (ann.type === 'brush') {
          ann.points.forEach(pt => {
            pt.y = h - pt.y;
          });
        } else if (ann.type === 'text' || ann.type === 'emoji') {
          ann.y = h - ann.y;
        } else {
          const y1 = h - ann.y1;
          const y2 = h - ann.y2;
          ann.y1 = y1;
          ann.y2 = y2;
        }
      }
    });
    
    if (currentCapture) {
      currentCapture.blob = flippedBlob;
      currentCapture.thumbnail = await createDashboardThumbnail(flippedBlob, 200, 150);
      
      if (currentCapture.links) {
        const dpr = currentCapture.devicePixelRatio || 1;
        const cssW = w / dpr;
        const cssH = h / dpr;
        currentCapture.links.forEach(link => {
          if (orientation === 'horizontal') {
            link.left = cssW - (link.left + link.width);
          } else {
            link.top = cssH - (link.top + link.height);
          }
        });
      }
      
      await saveCapture(currentCapture);
    }
    
    saveState();
    renderCanvas();
    URL.revokeObjectURL(url);
  };
  newImg.src = url;
}
