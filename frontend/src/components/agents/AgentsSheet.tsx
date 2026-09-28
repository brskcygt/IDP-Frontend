import { Loader2, RefreshCw, Server } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { useAgents } from '@/hooks/useAgents';
import type { IdpAgent } from '@/services/transport/types';

type Props = { isOpen: boolean; onOpenChange: (open: boolean) => void };

const formatDate = (value: string | null | undefined) =>
  value ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

const agentHost = (agent: IdpAgent) => agent.details?.os_info?.trim() || '—';
const agentVersion = (agent: IdpAgent) => agent.details?.agent_version?.trim() || agent.details?.version?.trim() || '—';

const StatusBadge = ({ online }: { online: boolean }) => (
  <span className={cn(
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
    online
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
      : 'border-line-strong bg-surface text-muted-foreground',
  )}>
    <span className={cn('h-1.5 w-1.5 rounded-full', online ? 'bg-emerald-500' : 'bg-zinc-500')} />
    {online ? 'Çevrimiçi' : 'Çevrimdışı'}
  </span>
);

export const AgentsSheet = ({ isOpen, onOpenChange }: Props) => {
  const { data: agents, isLoading, isError, error, isFetching, refetch } = useAgents(isOpen);
  const list = agents ?? [];

  return <Sheet open={isOpen} onOpenChange={onOpenChange}>
    <SheetContent side="right" className="w-[min(860px,calc(100vw-3.5rem))] max-w-none overflow-y-auto border-l-line-strong bg-background p-0 sm:max-w-none">
      <div className="flex items-start justify-between gap-4 border-b border-line-strong bg-bar px-7 py-6">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3 text-xl"><Server className="h-5 w-5 text-primary" />Bağlı agent'lar</SheetTitle>
          <SheetDescription>Gateway'e kayıtlı IDP agent'ları ve anlık bağlantı durumları. Panel açıkken otomatik yenilenir.</SheetDescription>
        </SheetHeader>
        <button
          type="button"
          onClick={() => void refetch()}
          className="mt-1 inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-line-strong px-3 text-xs font-semibold text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />Yenile
        </button>
      </div>

      <div className="p-7">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Agent'lar yükleniyor…</div>
        ) : isError ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            {error instanceof Error ? error.message : 'Agent listesi alınamadı.'}
          </p>
        ) : list.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-surface p-10 text-center">
            <Server className="mx-auto h-8 w-8 text-faint" />
            <p className="mt-3 text-sm font-semibold text-foreground">Henüz bağlı agent yok</p>
            <p className="mt-1 text-xs text-muted-foreground">Bir agent kurulum paketi oluşturup hedef makinede çalıştırdığınızda burada görünür.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-line">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line bg-bar text-[10px] font-semibold uppercase tracking-[0.12em] text-faint">
                  <th className="px-4 py-3 font-semibold">Agent</th>
                  <th className="px-4 py-3 font-semibold">Durum</th>
                  <th className="px-4 py-3 font-semibold">Bağlanma</th>
                  <th className="px-4 py-3 font-semibold">Son ping</th>
                  <th className="px-4 py-3 font-semibold">Host / sürüm</th>
                </tr>
              </thead>
              <tbody>
                {list.map((agent) => (
                  <tr key={agent.id} className="border-b border-line last:border-b-0">
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{agent.id}</td>
                    <td className="px-4 py-3"><StatusBadge online={agent.online} /></td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(agent.connected_at)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(agent.last_ping)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      <span className="block truncate" title={agentHost(agent)}>{agentHost(agent)}</span>
                      <span className="font-mono text-[10px] text-dim">{agentVersion(agent)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SheetContent>
  </Sheet>;
};
