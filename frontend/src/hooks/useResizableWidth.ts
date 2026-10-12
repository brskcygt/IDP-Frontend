import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const STORAGE_PREFIX = 'idp-sheet-width:';
/** Narrower than this and the sheets' two-column layouts collapse into each other. */
export const MIN_SHEET_WIDTH = 360;
/** Keeps a sliver of the dashboard visible so the overlay can still be clicked to close. */
const VIEWPORT_MARGIN = 48;
const KEYBOARD_STEP = 32;

function maxWidth(): number {
  return Math.max(MIN_SHEET_WIDTH, window.innerWidth - VIEWPORT_MARGIN);
}

function clamp(width: number): number {
  return Math.round(Math.min(Math.max(width, MIN_SHEET_WIDTH), maxWidth()));
}

function readStored(key: string | undefined): number | null {
  if (!key) return null;
  try {
    const value = Number(window.localStorage.getItem(STORAGE_PREFIX + key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function store(key: string | undefined, width: number | null) {
  if (!key) return;
  try {
    if (width === null) window.localStorage.removeItem(STORAGE_PREFIX + key);
    else window.localStorage.setItem(STORAGE_PREFIX + key, String(width));
  } catch {
    // Storage full or disabled: the width still applies until the sheet closes.
  }
}

/**
 * Drag-to-resize width for a sheet docked to the left or right edge.
 *
 * `width` stays null until the user resizes, so the sheet keeps the width its
 * own classes give it; a resized width is remembered per `storageKey`.
 * Double-click (or Home) on the handle forgets it and returns to the default.
 */
export function useResizableWidth({ side, storageKey }: { side: 'left' | 'right'; storageKey?: string }) {
  const [width, setWidth] = useState<number | null>(() => {
    const stored = readStored(storageKey);
    return stored === null ? null : clamp(stored);
  });
  const contentRef = useRef<HTMLElement | null>(null);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const attach = useCallback((element: HTMLElement | null) => {
    contentRef.current = element;
    setNode(element);
  }, []);

  // The handle is `fixed` so it neither scrolls away with a long sheet's
  // content nor gets clipped by its overflow, so it is placed from the
  // sheet's width: measured once when the sheet mounts (before the user has
  // resized it), then known from `width`. offsetWidth ignores the slide-in
  // transform, so the measurement is right even mid-animation.
  useLayoutEffect(() => {
    setMeasuredWidth(node ? node.offsetWidth : null);
  }, [node]);

  // A width saved on a wide monitor must not overflow a smaller window, and
  // a sheet sized by its classes (vw-relative widths) changes with the window.
  useEffect(() => {
    const onResize = () => {
      setWidth((current) => (current === null ? null : clamp(current)));
      if (contentRef.current) setMeasuredWidth(contentRef.current.offsetWidth);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const renderedWidth = width ?? measuredWidth;

  const currentWidth = useCallback(
    () => width ?? contentRef.current?.getBoundingClientRect().width ?? MIN_SHEET_WIDTH,
    [width],
  );

  const commit = useCallback((next: number | null) => {
    setWidth(next);
    store(storageKey, next);
    // Back to the class-given width: measure it once it has been applied.
    if (next === null) {
      requestAnimationFrame(() => {
        if (contentRef.current) setMeasuredWidth(contentRef.current.offsetWidth);
      });
    }
  }, [storageKey]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = currentWidth();
    let latest = startWidth;
    setDragging(true);

    const onMove = (move: PointerEvent) => {
      const delta = side === 'right' ? startX - move.clientX : move.clientX - startX;
      latest = clamp(startWidth + delta);
      setWidth(latest);
    };
    const onUp = (up: PointerEvent) => {
      handle.releasePointerCapture(up.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      setDragging(false);
      // A click without a drag must not pin the sheet to its current width.
      if (latest !== startWidth) store(storageKey, latest);
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }, [currentWidth, side, storageKey]);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    const grow = side === 'right' ? 'ArrowLeft' : 'ArrowRight';
    const shrink = side === 'right' ? 'ArrowRight' : 'ArrowLeft';
    if (event.key === grow || event.key === shrink) {
      event.preventDefault();
      const step = event.shiftKey ? KEYBOARD_STEP * 4 : KEYBOARD_STEP;
      commit(clamp(currentWidth() + (event.key === grow ? step : -step)));
    } else if (event.key === 'Home') {
      event.preventDefault();
      commit(null);
    }
  }, [commit, currentWidth, side]);

  const reset = useCallback(() => commit(null), [commit]);

  return { width, renderedWidth, dragging, attach, onPointerDown, onKeyDown, reset };
}
