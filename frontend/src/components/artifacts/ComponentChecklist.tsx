import type { ReactNode } from 'react';
import type { ComponentSelection } from '@/hooks/useComponentSelection';
import { cn } from '@/lib/utils';

type Props = {
  components: ReadonlyArray<string>;
  selection: ComponentSelection;
  /** Accessible name of the group, e.g. "Derlenecek bileşenler". */
  label: string;
  /** Tiles show a second line per component (e.g. "şu an 1.2 → 1.3"); chips are name only. */
  detail?: (name: string) => ReactNode;
  disabled?: boolean;
};

/**
 * The one component picker of the build, install and rebuild dialogs. The last
 * ticked box cannot be cleared: a run over nothing has nothing to do, and
 * "do nothing" is the Cancel button.
 */
export const ComponentChecklist = ({ components, selection, label, detail, disabled = false }: Props) => (
  <div role="group" aria-label={label} className={cn(detail ? 'grid gap-2 sm:grid-cols-2' : 'flex flex-wrap gap-2')}>
    {components.map((name) => {
      const active = selection.isSelected(name);
      const onlyOne = active && selection.chosen.length === 1;
      const locked = disabled || onlyOne;
      return <label
        key={name}
        className={cn(
          'rounded-md border text-xs transition-colors',
          detail ? 'flex items-start gap-2.5 px-3 py-2' : 'inline-flex items-center gap-2 px-2.5 py-1.5',
          active ? 'border-primary/40 bg-primary/10 text-foreground' : 'border-border/60 text-muted-foreground',
          locked ? 'cursor-not-allowed' : 'cursor-pointer',
        )}
      >
        <input
          type="checkbox"
          checked={active}
          disabled={locked}
          onChange={() => selection.toggle(name)}
          className={cn('h-3.5 w-3.5 accent-primary', detail && 'mt-0.5')}
        />
        {detail ? <span className="min-w-0">
          <span className="block font-mono text-[11px] font-semibold">{name}</span>
          <span className="mt-0.5 block text-[11px] text-muted-foreground">{detail(name)}</span>
        </span> : <span className="font-mono">{name}</span>}
      </label>;
    })}
  </div>
);
