// Content script for SnapVault

let originalStyles = new Map();
let expandedContainers = [];
let topFixedElements = [];
let bottomFixedElements = [];
let otherFixedElements = [];
let originalScrollBehaviorHtml = '';
let originalScrollBehaviorBody = '';
let originalScrollPos = { x: 0, y: 0 };

// Selection mode variables
let selectionOverlay = null;
let selectedElementCallback = null;
let currentHoveredElement = null;

// Ping to check script presence
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'ping') {
    sendResponse({ status: 'pong' });
    return true;
  }

  if (message.action === 'init_capture') {
    initCapture(message.options)
      .then(metrics => sendResponse({ status: 'success', metrics }))
      .catch(err => sendResponse({ status: 'error', error: err.message }));
    return true;
  }

  if (message.action === 'scroll_to') {
    scrollToCoords(message.x, message.y, message.hideTopFixed, message.showBottomFixed, message.settleDelay)
      .then(actualCoords => sendResponse({ status: 'success', coords: actualCoords }))
      .catch(err => sendResponse({ status: 'error', error: err.message }));
    return true;
  }

  if (message.action === 'cleanup_capture') {
    cleanupCapture()
      .then(() => sendResponse({ status: 'success' }))
      .catch(err => sendResponse({ status: 'error', error: err.message }));
    return true;
  }

  if (message.action === 'start_element_selection') {
    startElementSelection()
      .then(rect => sendResponse({ status: 'success', rect }))
      .catch(err => sendResponse({ status: 'error', error: err.message }));
    return true;
  }

  if (message.action === 'cancel_element_selection') {
    cancelElementSelection();
    sendResponse({ status: 'success' });
    return true;
  }
});

// Disable smooth scroll behavior
function disableSmoothScroll() {
  originalScrollBehaviorHtml = document.documentElement.style.scrollBehavior;
  originalScrollBehaviorBody = document.body.style.scrollBehavior;
  document.documentElement.style.setProperty('scroll-behavior', 'auto', 'important');
  document.body.style.setProperty('scroll-behavior', 'auto', 'important');
}

// Restore smooth scroll behavior
function restoreSmoothScroll() {
  document.documentElement.style.scrollBehavior = originalScrollBehaviorHtml;
  document.body.style.scrollBehavior = originalScrollBehaviorBody;
}

// Detect and classify sticky/fixed elements
function classifyFixedElements() {
  originalStyles.clear();
  topFixedElements = [];
  bottomFixedElements = [];
  otherFixedElements = [];

  const elements = document.querySelectorAll('*');
  const viewportHeight = window.innerHeight;

  elements.forEach(el => {
    if (['SCRIPT', 'STYLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName)) return;

    // Check computed style
    let style;
    try {
      style = window.getComputedStyle(el);
    } catch (e) {
      return;
    }

    const isFixed = style.position === 'fixed' || style.position === 'sticky';
    if (!isFixed) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Save original styles
    originalStyles.set(el, {
      visibility: el.style.visibility,
      visibilityProto: el.style.getPropertyValue('visibility'),
      visibilityPriority: el.style.getPropertyPriority('visibility')
    });

    // Heuristics for header vs footer vs floating widgets
    if (rect.top < 120 && rect.bottom <= viewportHeight / 2) {
      topFixedElements.push(el);
    } else if (rect.bottom > viewportHeight - 120 && rect.top >= viewportHeight / 2) {
      bottomFixedElements.push(el);
    } else {
      otherFixedElements.push(el);
    }
  });
}

// Show/hide fixed elements
function setVisibilityForGroup(elements, visible) {
  elements.forEach(el => {
    if (visible) {
      const orig = originalStyles.get(el);
      if (orig) {
        el.style.setProperty('visibility', orig.visibilityProto, orig.visibilityPriority);
      } else {
        el.style.removeProperty('visibility');
      }
    } else {
      el.style.setProperty('visibility', 'hidden', 'important');
    }
  });
}

// Expand scrollable container divs to capture full content
function expandScrollableContainers() {
  expandedContainers = [];
  const elements = document.querySelectorAll('*');

  elements.forEach(el => {
    if (['SCRIPT', 'STYLE', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'HTML', 'BODY'].includes(el.tagName)) return;

    try {
      const scrollH = el.scrollHeight;
      const clientH = el.clientHeight;
      if (scrollH > clientH + 40 && clientH > 150 && el.clientWidth > 150) {
        const style = window.getComputedStyle(el);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          expandedContainers.push({
            element: el,
            originalHeight: el.style.getPropertyValue('height'),
            originalHeightPriority: el.style.getPropertyPriority('height'),
            originalOverflow: el.style.getPropertyValue('overflow'),
            originalOverflowPriority: el.style.getPropertyPriority('overflow')
          });

          el.style.setProperty('height', scrollH + 'px', 'important');
          el.style.setProperty('overflow', 'visible', 'important');
        }
      }
    } catch (e) {
      // Ignore errors on cross-origin properties
    }
  });
}

// Restore scrollable containers
function restoreScrollableContainers() {
  expandedContainers.forEach(item => {
    try {
      if (item.originalHeight) {
        item.element.style.setProperty('height', item.originalHeight, item.originalHeightPriority);
      } else {
        item.element.style.removeProperty('height');
      }
      if (item.originalOverflow) {
        item.element.style.setProperty('overflow', item.originalOverflow, item.originalOverflowPriority);
      } else {
        item.element.style.removeProperty('overflow');
      }
    } catch (e) {
      // Ignore
    }
  });
  expandedContainers = [];
}

// Initialize capture phase
async function initCapture(options = {}) {
  // Store original scroll position
  originalScrollPos = {
    x: window.scrollX || window.pageXOffset,
    y: window.scrollY || window.pageYOffset
  };

  disableSmoothScroll();

  if (options.expandScrollables) {
    expandScrollableContainers();
  }

  classifyFixedElements();

  // Scroll to top to begin capturing
  window.scrollTo(0, 0);
  await new Promise(resolve => setTimeout(resolve, 150));

  // Determine full dimensions
  const body = document.body;
  const html = document.documentElement;

  const totalHeight = Math.max(
    body.scrollHeight,
    body.offsetHeight,
    html.clientHeight,
    html.scrollHeight,
    html.offsetHeight
  );

  const totalWidth = Math.max(
    body.scrollWidth,
    body.offsetWidth,
    html.clientWidth,
    html.scrollWidth,
    html.offsetWidth
  );

  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const dpr = window.devicePixelRatio || 1;

  // Initially hide other fixed elements (chat widgets, etc)
  setVisibilityForGroup(otherFixedElements, false);

  // Collect link elements for PDF interactive feature
  const links = [];
  const anchors = document.querySelectorAll('a');
  const scrollX = window.scrollX || window.pageXOffset;
  const scrollY = window.scrollY || window.pageYOffset;

  anchors.forEach(a => {
    try {
      if (!a.href || a.href.startsWith('javascript:') || a.href.startsWith('#')) return;
      const rect = a.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      links.push({
        href: a.href,
        left: rect.left + scrollX,
        top: rect.top + scrollY,
        width: rect.width,
        height: rect.height
      });
    } catch (e) {
      // Ignore
    }
  });

  return {
    totalWidth,
    totalHeight,
    viewportWidth,
    viewportHeight,
    devicePixelRatio: dpr,
    title: document.title || 'Screenshot',
    url: window.location.href,
    links: links
  };
}

// Scroll and settle
async function scrollToCoords(x, y, hideTopFixed, showBottomFixed, settleDelay) {
  window.scrollTo(x, y);

  // Set the visibility of elements depending on scroll frame requirements
  setVisibilityForGroup(topFixedElements, !hideTopFixed);
  setVisibilityForGroup(bottomFixedElements, showBottomFixed);
  setVisibilityForGroup(otherFixedElements, false); // Keep chat/widgets hidden during stitch

  // Wait for content to settle/render
  await new Promise(resolve => setTimeout(resolve, settleDelay || 250));

  return {
    actualX: window.scrollX || window.pageXOffset,
    actualY: window.scrollY || window.pageYOffset
  };
}

// Restore page states
async function cleanupCapture() {
  // Restore all elements visibility
  originalStyles.forEach((val, el) => {
    try {
      if (val.visibilityProto) {
        el.style.setProperty('visibility', val.visibilityProto, val.visibilityPriority);
      } else {
        el.style.removeProperty('visibility');
      }
    } catch (e) {}
  });

  restoreScrollableContainers();
  restoreSmoothScroll();

  // Scroll back
  window.scrollTo(originalScrollPos.x, originalScrollPos.y);
  originalStyles.clear();
}

// Element selection tools (PRO)
function startElementSelection() {
  return new Promise((resolve, reject) => {
    // Clean up any existing selection UI
    cancelElementSelection();

    // Create selection overlay
    selectionOverlay = document.createElement('div');
    selectionOverlay.id = 'snapvault-selection-overlay';
    Object.assign(selectionOverlay.style, {
      position: 'fixed',
      pointerEvents: 'none',
      border: '3px solid #ff4757',
      backgroundColor: 'rgba(255, 71, 87, 0.15)',
      boxShadow: '0 0 8px rgba(255, 71, 87, 0.5)',
      zIndex: '10000000',
      transition: 'all 0.05s ease-out',
      boxSizing: 'border-box'
    });
    document.body.appendChild(selectionOverlay);

    // Overlay info tag
    const infoTag = document.createElement('div');
    infoTag.id = 'snapvault-info-tag';
    Object.assign(infoTag.style, {
      position: 'absolute',
      bottom: '-30px',
      right: '0',
      backgroundColor: '#ff4757',
      color: '#fff',
      fontSize: '12px',
      fontFamily: 'sans-serif',
      padding: '4px 8px',
      borderRadius: '4px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      whiteSpace: 'nowrap'
    });
    infoTag.textContent = 'Click to select. Esc to cancel.';
    selectionOverlay.appendChild(infoTag);

    function onMouseMove(e) {
      const x = e.clientX;
      const y = e.clientY;
      
      const hovered = document.elementFromPoint(x, y);
      if (!hovered || hovered === selectionOverlay || selectionOverlay.contains(hovered)) return;

      currentHoveredElement = hovered;
      const rect = hovered.getBoundingClientRect();

      Object.assign(selectionOverlay.style, {
        display: 'block',
        left: rect.left + 'px',
        top: rect.top + 'px',
        width: rect.width + 'px',
        height: rect.height + 'px'
      });

      infoTag.textContent = `${hovered.tagName.toLowerCase()} | ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    }

    function onClick(e) {
      if (!currentHoveredElement) return;
      e.preventDefault();
      e.stopPropagation();

      const rect = currentHoveredElement.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;

      const pageRect = {
        left: rect.left + scrollX,
        top: rect.top + scrollY,
        width: rect.width,
        height: rect.height,
        title: document.title || 'Element Capture',
        url: window.location.href
      };

      removeSelectionUI();
      resolve(pageRect);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        removeSelectionUI();
        reject(new Error('Selection cancelled by user'));
      }
    }

    function removeSelectionUI() {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);

      if (selectionOverlay && selectionOverlay.parentNode) {
        selectionOverlay.parentNode.removeChild(selectionOverlay);
      }
      selectionOverlay = null;
      currentHoveredElement = null;
    }

    selectedElementCallback = removeSelectionUI;

    // Attach listeners capturing phase
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  });
}

function cancelElementSelection() {
  if (selectedElementCallback) {
    selectedElementCallback();
    selectedElementCallback = null;
  }
}
