import { useCallback, useState } from 'react';

/**
 * Which of a fixed list of components an action covers.
 *
 * `null` means "all of them" and is kept distinct from "every box ticked" so a
 * request only carries a component filter when the operator actually narrowed
 * it -- the backend treats an absent filter as "the whole set", which is also
 * what older IDP versions did.
 */
export const useComponentSelection = (all: ReadonlyArray<string>) => {
  const [selected, setSelected] = useState<ReadonlySet<string> | null>(null);
  const isSelected = (name: string) => selected === null || selected.has(name);
  const chosen = all.filter(isSelected);
  const partial = chosen.length !== all.length;

  const toggle = (name: string) => setSelected((current) => {
    const next = new Set(current ?? all);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });

  const reset = useCallback((only?: ReadonlyArray<string>) => setSelected(only && only.length > 0 ? new Set(only) : null), []);

  return {
    chosen,
    partial,
    isSelected,
    toggle,
    reset,
    /** What to send: undefined unless the run was narrowed. */
    filter: partial ? chosen : undefined,
  };
};

export type ComponentSelection = ReturnType<typeof useComponentSelection>;
