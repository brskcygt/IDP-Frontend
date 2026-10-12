import { AlertTriangle, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The address the API is reached at, when the renderer can tell. In a browser
 * tab that is the page's own origin; the desktop shell serves the UI from
 * app://idp and forwards to a server the renderer is not told about.
 */
const serverAddress = (): string | null => {
  if (typeof window === "undefined") return null;
  const { protocol, origin } = window.location;
  return protocol === "http:" || protocol === "https:" ? origin : null;
};

export const DashboardError = ({ onRetry, isRetrying = false }: { onRetry?: () => void; isRetrying?: boolean }) => {
  const address = serverAddress();

  return (
    <div className="flex h-screen items-center justify-center bg-background px-6">
      <div className="max-w-sm space-y-3 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-status-fail/30 bg-status-fail/10">
          <AlertTriangle className="h-5 w-5 text-status-fail" aria-hidden="true" />
        </div>
        <p className="text-base font-semibold text-status-fail">Projeler yüklenemedi</p>
        <p className="text-sm text-muted-foreground">
          IDP sunucusu yanıt vermedi.
          {address && <> Sunucu adresi: <span className="font-mono text-foreground">{address}</span>.</>}
          {" "}Sunucunun çalıştığını ve ağ bağlantınızı kontrol edin.
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} disabled={isRetrying}>
            <RotateCw className={isRetrying ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} aria-hidden="true" />
            Tekrar dene
          </Button>
        )}
      </div>
    </div>
  );
};
