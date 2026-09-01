type NewLogsBadgeProps = {
  count: number;
  onClick: () => void;
};

/** Floating pill shown when new lines arrived while the user had scrolled up. */
export const NewLogsBadge = ({ count, onClick }: NewLogsBadgeProps) => (
  <button
    type="button"
    onClick={onClick}
    className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-primary/40 bg-primary px-3.5 py-1.5 font-mono text-[10.5px] font-semibold text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    ↓ New logs{count > 0 ? ` (${count})` : ""}
  </button>
);
