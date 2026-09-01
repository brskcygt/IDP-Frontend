import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Download, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { IdpUpdateState } from "@/types/desktop";

const idle: IdpUpdateState = { status: "idle" };

export function UpdateModal() {
  const [state, setState] = useState<IdpUpdateState>(idle);

  useEffect(() => {
    const bridge = window.idp?.update;
    if (!bridge) return;
    const unsubscribe = bridge.onState(setState);
    bridge.getState().then(setState).catch(() => undefined);
    return unsubscribe;
  }, []);

  if (state.status === "idle") return null;

  const busy = state.status === "downloading" || state.status === "installing";
  const progress = busy ? Math.max(0, Math.min(100, Math.round(state.progress * 100))) : 0;
  const version = state.version;

  const dismiss = () => {
    if (busy) return;
    window.idp?.update.dismiss().catch(() => undefined);
    setState(idle);
  };

  return (
    <div className="fixed inset-0 z-[160] grid place-items-center bg-black/75 px-5 backdrop-blur-md" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-title"
        className="relative w-full max-w-[520px] overflow-hidden rounded-xl border border-line-strong bg-popover shadow-[0_28px_90px_rgba(0,0,0,0.72)]"
      >
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        <div className="border-b border-line bg-[radial-gradient(circle_at_88%_0%,hsl(var(--primary)/0.14),transparent_42%)] px-7 pb-6 pt-7">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Release channel · stable
            </div>
            {!busy && (
              <button onClick={dismiss} className="rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Güncelleme penceresini kapat">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-primary/35 bg-primary/10 text-primary">
              {state.status === "error" ? <X className="h-5 w-5" /> : busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <ArrowUpRight className="h-5 w-5" />}
            </div>
            <div>
              <p className="mb-1 font-mono text-[11px] text-muted-foreground">IDP / {version}</p>
              <h2 id="update-title" className="text-xl font-semibold tracking-tight text-foreground">
                {state.status === "error" ? "Güncelleme tamamlanamadı" : state.status === "installing" ? "Yeni sürüm kuruluyor" : state.status === "downloading" ? "Güncelleme indiriliyor" : "Yeni sürüm kullanıma hazır"}
              </h2>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-7 py-6">
          {state.status === "error" ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive">{state.message}</p>
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">{state.notes || "Performans ve güvenilirlik iyileştirmeleri içeren yeni IDP sürümü."}</p>
          )}

          {busy && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                <span>{state.status === "installing" ? "Paket doğrulandı · kurulum hazırlanıyor" : "Şifreli indirme · bütünlük kontrolü"}</span>
                <span className="text-primary">{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-background/45 p-3 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-status-ok" /><span>Ed25519 imza doğrulaması</span></div>
            <div className="flex items-center gap-2"><Check className="h-4 w-4 text-status-ok" /><span>Otomatik geri alma koruması</span></div>
          </div>
        </div>

        {!busy && (
          <div className="flex items-center justify-end gap-3 border-t border-line bg-background/35 px-7 py-4">
            <Button variant="ghost" onClick={dismiss}>Daha sonra</Button>
            {state.status === "available" && (
              <Button onClick={() => window.idp?.update.install().catch(() => undefined)} className="min-w-36 shadow-[0_0_24px_hsl(var(--primary)/0.16)]">
                <Download className="h-4 w-4" /> Güncelle
              </Button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
