import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronRight, LifeBuoy, Search } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CodeBlock } from './CodeBlock';
import {
  TROUBLESHOOTING_CATEGORIES,
  TROUBLESHOOTING_ENTRIES,
  type TroubleshootingCategory,
  type TroubleshootingEntry,
} from './troubleshootingEntries';

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void };

/** Case- and Turkish-dotted-i-insensitive haystack for one entry. */
const searchText = (entry: TroubleshootingEntry) =>
  [entry.title, entry.cause, ...entry.symptoms, ...entry.steps].join('\n').toLocaleLowerCase('tr');

const matches = (entry: TroubleshootingEntry, query: string) => {
  const terms = query.toLocaleLowerCase('tr').split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchText(entry);
  return terms.every((term) => haystack.includes(term));
};

const EntryCard = ({ entry, open, onToggle }: { entry: TroubleshootingEntry; open: boolean; onToggle: () => void }) => (
  <li className="rounded-xl border border-line bg-surface">
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={`troubleshooting-${entry.id}`}
      className="flex w-full items-start gap-3 p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <ChevronRight className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">{entry.title}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {entry.symptoms.map((symptom) => (
            <code key={symptom} className="rounded border border-red-500/20 bg-red-500/[0.06] px-1.5 py-0.5 font-mono text-[10px] leading-4 text-red-300">{symptom}</code>
          ))}
        </div>
      </div>
    </button>
    {open && (
      <div id={`troubleshooting-${entry.id}`} className="space-y-4 border-t border-line px-4 pb-5 pt-4 sm:pl-11">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Neden</p>
          <p className="mt-1 text-xs leading-5 text-foreground/90">{entry.cause}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">Ne yapmalı</p>
          <ol className="mt-2 space-y-1.5 text-xs leading-5 text-foreground/90">
            {entry.steps.map((step, index) => (
              <li key={step} className="flex gap-2"><span className="w-4 shrink-0 font-mono text-[11px] text-muted-foreground">{index + 1}.</span><span>{step}</span></li>
            ))}
          </ol>
        </div>
        {entry.snippets && <div className="grid gap-3 lg:grid-cols-2">{entry.snippets.map((snippet) => <CodeBlock key={snippet.label} snippet={snippet} />)}</div>}
        {entry.note && <div className="flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/[0.055] p-3 text-[11px] leading-5 text-amber-100"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" /><span>{entry.note}</span></div>}
      </div>
    )}
  </li>
);

export const TroubleshootingSheet = ({ isOpen, onOpenChange }: Props) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<TroubleshootingCategory | 'all'>('all');
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());

  const visible = useMemo(
    () => TROUBLESHOOTING_ENTRIES.filter((entry) => (category === 'all' || entry.category === category) && matches(entry, query)),
    [category, query],
  );

  const toggle = (id: string) => setOpenIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const chipClass = (active: boolean) => active
    ? 'rounded-md border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary'
    : 'rounded-md border border-line px-3 py-1.5 text-xs text-muted-foreground hover:border-line-strong hover:text-foreground';

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-[min(1120px,calc(100vw-3.5rem))] max-w-none overflow-y-auto border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="sticky top-0 z-10 border-b border-line-strong bg-bar/95 px-7 py-6 backdrop-blur">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-xl"><LifeBuoy className="h-5 w-5 text-primary" />Sorun giderme</SheetTitle>
          <SheetDescription>Ekrandaki hata metnini arayın; nedeni ve çalıştırılacak komutları görün. Komutlar aksi belirtilmedikçe IDP sunucusunda yönetici PowerShell içindir.</SheetDescription>
        </SheetHeader>
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Hata metni ara: 401, 7003, IDP_PUBLIC_URL, Failed to update…"
            aria-label="Sorun ara"
            className="pl-9"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Kategori">
          <button type="button" aria-pressed={category === 'all'} onClick={() => setCategory('all')} className={chipClass(category === 'all')}>Tümü</button>
          {TROUBLESHOOTING_CATEGORIES.map((item) => (
            <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(item.id)} className={chipClass(category === item.id)}>{item.label}</button>
          ))}
        </div>
      </div>

      <div className="p-7">
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed border-line p-6 text-center text-xs text-muted-foreground">Eşleşen kayıt yok. Hata metninden daha kısa bir parça deneyin (örn. “401” veya “7003”).</p>
        ) : (
          <ul className="space-y-3">
            {visible.map((entry) => <EntryCard key={entry.id} entry={entry} open={openIds.has(entry.id)} onToggle={() => toggle(entry.id)} />)}
          </ul>
        )}
      </div>
    </SheetContent>
  </Sheet>;
};
