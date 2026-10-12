import { useCallback, useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

const KEYBOARD_STEP = 24;

type Options = {
  storageKey: string;
  defaultHeight: number;
  minHeight: number;
  /** Space below the resized area that must stay visible (e.g. a table header and a few rows). */
  reserveBelow: number;
};

/**
 * Drag-to-resize height for a band whose bottom edge carries a handle.
 * The height is remembered in localStorage and kept within the window;
 * double-click (or Home) on the handle restores the default.
 */
export function useResizableHeight({ storageKey, defaultHeight, minHeight, reserveBelow }: Options) {
  const clamp = useCallback(
    (value: number) => {
      const max = Math.max(minHeight, window.innerHeight - reserveBelow);
      return Math.round(Math.min(Math.max(value, minHeight), max));
    },
    [minHeight, reserveBelow],
  );

  const [height, setHeight] = useState<number>(() => {
    try {
      const stored = Number(window.localStorage.getItem(storageKey));
      if (Number.isFinite(stored) && stored > 0) return clamp(stored);
    } catch {
      // Storage disabled: fall back to the default.
    }
    return clamp(defaultHeight);
  });
  const [dragging, setDragging] = useState(false);

  const commit = useCallback(
    (next: number | null) => {
      const value = next === null ? clamp(defaultHeight) : clamp(next);
      setHeight(value);
      try {
        if (next === null) window.localStorage.removeItem(storageKey);
        else window.localStorage.setItem(storageKey, String(value));
      } catch {
        // The height still applies for this session.
      }
    },
    [clamp, defaultHeight, storageKey],
  );

  useEffect(() => {
    const onResize = () => setHeight((current) => clamp(current));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);
      const startY = event.clientY;
      const startHeight = height;
      let latest = startHeight;
      setDragging(true);

      const onMove = (move: PointerEvent) => {
        latest = clamp(startHeight + move.clientY - startY);
        setHeight(latest);
      };
      const onUp = (up: PointerEvent) => {
        handle.releasePointerCapture(up.pointerId);
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        setDragging(false);
        // A click without a drag must not pin the current height.
        if (latest !== startHeight) commit(latest);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    },
    [clamp, commit, height],
  );

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.shiftKey ? KEYBOARD_STEP * 4 : KEYBOARD_STEP;
        commit(height + (event.key === 'ArrowDown' ? step : -step));
      } else if (event.key === 'Home') {
        event.preventDefault();
        commit(null);
      }
    },
    [commit, height],
  );

  const reset = useCallback(() => commit(null), [commit]);

  return { height, dragging, onPointerDown, onKeyDown, reset };
}
