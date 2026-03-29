/**
 * Visual Editing Support for Appifex
 *
 * This script enables visual editing mode in generated React apps.
 * When enabled, clicking any element sends its context to the parent frame
 * for AI-powered code modifications.
 *
 * Communication Protocol:
 * - Parent sends: { type: 'appifex:enable-visual-edit' } to enable
 * - Parent sends: { type: 'appifex:disable-visual-edit' } to disable
 * - App sends: { type: 'appifex:element-selected', ...context } on click
 */

interface ElementContext {
  type: 'appifex:element-selected';
  tagName: string;
  className: string;
  id: string;
  innerText: string;
  html: string;
  // React fiber info (best effort - may not be available in React 19+)
  filePath?: string;
  lineNumber?: number;
  componentName?: string;
  // Computed styles for context
  computedStyles: {
    backgroundColor: string;
    color: string;
    fontSize: string;
    padding: string;
    margin: string;
    width: string;
    height: string;
  };
  // Position info for highlighting
  boundingRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  // Parent context for better AI understanding
  parentTagName: string;
  parentClassName: string;
}

let visualEditMode = false;
let highlightOverlay: HTMLDivElement | null = null;

/**
 * Creates or updates the highlight overlay for hovered elements
 */
function createHighlightOverlay(): HTMLDivElement {
  if (highlightOverlay) return highlightOverlay;

  const overlay = document.createElement('div');
  overlay.id = 'appifex-highlight-overlay';
  overlay.style.cssText = `
    position: fixed;
    pointer-events: none;
    border: 2px solid #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    z-index: 999999;
    transition: all 0.1s ease;
    display: none;
  `;
  document.body.appendChild(overlay);
  highlightOverlay = overlay;
  return overlay;
}

/**
 * Removes the highlight overlay
 */
function removeHighlightOverlay(): void {
  if (highlightOverlay) {
    highlightOverlay.remove();
    highlightOverlay = null;
  }
}

/**
 * Updates highlight overlay position for an element
 */
function updateHighlight(element: HTMLElement): void {
  const overlay = createHighlightOverlay();
  const rect = element.getBoundingClientRect();

  overlay.style.top = `${rect.top}px`;
  overlay.style.left = `${rect.left}px`;
  overlay.style.width = `${rect.width}px`;
  overlay.style.height = `${rect.height}px`;
  overlay.style.display = 'block';
}

/**
 * Hides the highlight overlay
 */
function hideHighlight(): void {
  if (highlightOverlay) {
    highlightOverlay.style.display = 'none';
  }
}

/**
 * Attempts to extract React fiber information from an element.
 * Note: React 19 removed _debugSource, so this may return empty info.
 */
function getReactFiberInfo(element: HTMLElement): {
  filePath?: string;
  lineNumber?: number;
  componentName?: string;
} {
  try {
    // Find React fiber key
    const fiberKey = Object.keys(element).find(key =>
      key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')
    );

    if (!fiberKey) return {};

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fiber = (element as any)[fiberKey];
    if (!fiber) return {};

    const info: { filePath?: string; lineNumber?: number; componentName?: string } = {};

    // Try to get debug source (React 18 and earlier)
    if (fiber._debugSource) {
      info.filePath = fiber._debugSource.fileName;
      info.lineNumber = fiber._debugSource.lineNumber;
    }

    // Try to get component name
    let currentFiber = fiber;
    while (currentFiber) {
      if (currentFiber.type?.name) {
        info.componentName = currentFiber.type.name;
        break;
      }
      if (typeof currentFiber.type === 'string') {
        // Native element, keep looking for parent component
        currentFiber = currentFiber.return;
        continue;
      }
      currentFiber = currentFiber.return;
    }

    return info;
  } catch (e) {
    console.warn('[Appifex] Could not extract React fiber info:', e);
    return {};
  }
}

/**
 * Extracts relevant computed styles from an element
 */
function getComputedStylesInfo(element: HTMLElement): ElementContext['computedStyles'] {
  const computed = window.getComputedStyle(element);
  return {
    backgroundColor: computed.backgroundColor,
    color: computed.color,
    fontSize: computed.fontSize,
    padding: computed.padding,
    margin: computed.margin,
    width: computed.width,
    height: computed.height,
  };
}

/**
 * Builds the full element context for the selected element
 */
function buildElementContext(element: HTMLElement): ElementContext {
  const rect = element.getBoundingClientRect();
  const fiberInfo = getReactFiberInfo(element);
  const parent = element.parentElement;

  return {
    type: 'appifex:element-selected',
    tagName: element.tagName.toLowerCase(),
    className: typeof element.className === 'string' ? element.className : '',
    id: element.id || '',
    innerText: (element.innerText || '').slice(0, 500),
    html: element.outerHTML.slice(0, 2000),
    ...fiberInfo,
    computedStyles: getComputedStylesInfo(element),
    boundingRect: {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    },
    parentTagName: parent?.tagName.toLowerCase() || '',
    parentClassName: typeof parent?.className === 'string' ? parent.className : '',
  };
}

/**
 * Handle element click in visual edit mode
 */
function handleClick(e: MouseEvent): void {
  if (!visualEditMode) return;

  e.preventDefault();
  e.stopPropagation();

  const target = e.target as HTMLElement;

  // Ignore clicks on our overlay
  if (target.id === 'appifex-highlight-overlay') return;

  const context = buildElementContext(target);

  // Send to parent frame
  window.parent.postMessage(context, '*');

  console.log('[Appifex] Element selected:', {
    tagName: context.tagName,
    className: context.className,
    componentName: context.componentName,
  });
}

/**
 * Handle mouseover for highlight effect
 */
function handleMouseOver(e: MouseEvent): void {
  if (!visualEditMode) return;

  const target = e.target as HTMLElement;
  if (target.id === 'appifex-highlight-overlay') return;

  updateHighlight(target);
}

/**
 * Handle mouseout to hide highlight
 */
function handleMouseOut(e: MouseEvent): void {
  if (!visualEditMode) return;

  const relatedTarget = e.relatedTarget as HTMLElement;
  if (relatedTarget?.id === 'appifex-highlight-overlay') return;

  hideHighlight();
}

/**
 * Enable visual edit mode
 */
function enableVisualEditMode(): void {
  visualEditMode = true;
  document.body.style.cursor = 'crosshair';
  createHighlightOverlay();
  console.log('[Appifex] Visual edit mode enabled');
}

/**
 * Disable visual edit mode
 */
function disableVisualEditMode(): void {
  visualEditMode = false;
  document.body.style.cursor = 'default';
  removeHighlightOverlay();
  console.log('[Appifex] Visual edit mode disabled');
}

/**
 * Listen for messages from parent frame
 */
function handleParentMessage(event: MessageEvent): void {
  const { type } = event.data || {};

  switch (type) {
    case 'appifex:enable-visual-edit':
      enableVisualEditMode();
      break;
    case 'appifex:disable-visual-edit':
      disableVisualEditMode();
      break;
  }
}

// Initialize event listeners
window.addEventListener('message', handleParentMessage);
document.addEventListener('click', handleClick, true); // Capture phase
document.addEventListener('mouseover', handleMouseOver, true);
document.addEventListener('mouseout', handleMouseOut, true);

// Notify parent that visual edit support is ready
window.parent.postMessage({ type: 'appifex:visual-edit-ready' }, '*');

console.log('[Appifex] Visual edit script loaded');

export {};
