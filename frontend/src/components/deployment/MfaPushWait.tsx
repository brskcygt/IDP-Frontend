import { Loader2, Smartphone } from "lucide-react";
import { MfaPanel } from "./MfaPanel";

export const MfaPushWait = ({ onCancel }: { onCancel: () => void }) => (
  <MfaPanel
    title="Check your device"
    description="A push notification was sent to your authenticator app. Approve it to continue the deployment."
    footer={
      <button
        type="button"
        onClick={onCancel}
        className="h-[34px] w-full rounded-md border border-status-fail/40 bg-status-fail/[0.07] text-xs font-semibold text-status-fail transition-colors hover:bg-status-fail/15"
      >
        Cancel deployment
      </button>
    }
  >
    <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
      <Smartphone className="h-6 w-6" aria-hidden="true" />
    </div>
    <p className="flex items-center justify-center gap-2 font-mono text-[10.5px] text-dim">
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      waiting for approval
    </p>
  </MfaPanel>
);
