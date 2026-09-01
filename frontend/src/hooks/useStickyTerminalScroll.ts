import { useCallback, useEffect, useRef, useState } from 'react';

/** Within this many pixels of the bottom counts as "at the bottom". */
const NEAR_BOTTOM_PX = 50;

type UseStickyTerminalScrollReturn = {
  terminalRef: React.RefObject<HTMLDivElement | null>;
  isPinnedToBottom: boolean;
  pendingCount: number;
  handleScroll: () => void;
  jumpToBottom: () => void;
};

/**
 * Keeps a log panel glued to the bottom while the user hasn't scrolled away,
 * and otherwise tracks how many new lines arrived so the caller can surface a
 * "jump to bottom" affordance instead of yanking the viewport around.
 *
 * `rawCount` should be the count of lines actually streamed in (unaffected by
 * search/level filtering) so the pending badge only reflects genuinely new
 * output. `renderCount` should be the count of lines currently on screen
 * (post-filter), which is what drives the "stay pinned" scroll effect.
 * `resetKey` (e.g. a deployment id) resets tracking when a new stream starts.
 */
export const useStickyTerminalScroll = (
  rawCount: number,
  renderCount: number,
  resetKey: unknown,
): UseStickyTerminalScrollReturn => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const previousRawCountRef = useRef(0);
  const [isPinnedToBottom, setIsPinnedToBottom] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    previousRawCountRef.current = 0;
    setPendingCount(0);
    setIsPinnedToBottom(true);
  }, [resetKey]);

  useEffect(() => {
    if (!isPinnedToBottom) return;
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [renderCount, isPinnedToBottom]);

  useEffect(() => {
    const added = rawCount - previousRawCountRef.current;
    previousRawCountRef.current = rawCount;
    if (!isPinnedToBottom && added > 0) {
      setPendingCount((count) => count + added);
    }
  }, [rawCount, isPinnedToBottom]);

  const handleScroll = useCallback(() => {
    const el = terminalRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom <= NEAR_BOTTOM_PX;
    setIsPinnedToBottom(nearBottom);
    if (nearBottom) setPendingCount(0);
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = terminalRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    setIsPinnedToBottom(true);
    setPendingCount(0);
  }, []);

  return { terminalRef, isPinnedToBottom, pendingCount, handleScroll, jumpToBottom };
};
