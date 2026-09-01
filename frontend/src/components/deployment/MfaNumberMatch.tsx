import { MfaPanel } from "./MfaPanel";

type MfaNumberMatchProps = {
  number: string;
  onCancel: () => void;
};

const RING = "absolute inset-0 rounded-full border-2 border-primary animate-ring-pulse motion-reduce:animate-none";

/**
 * Microsoft Authenticator number matching. The number is the whole message, so
 * everything else on the panel stays quiet.
 */
export const MfaNumberMatch = ({ number, onCancel }: MfaNumberMatchProps) => (
  <MfaPanel
    title="Approve in Microsoft Authenticator"
    description="Open the app on your phone and enter the number below to open the VPN tunnel."
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
    <div className="relative mx-auto mb-2 h-[132px] w-[132px]">
      <span aria-hidden="true" className={RING} />
      <span aria-hidden="true" className={RING} style={{ animationDelay: "0.8s" }} />
      <span aria-hidden="true" className={RING} style={{ animationDelay: "1.6s" }} />
      <div className="absolute inset-0 flex items-center justify-center rounded-full border-2 border-primary bg-background">
        <span className="tabular font-mono text-[54px] font-semibold tracking-tighter text-primary">
          {number}
        </span>
      </div>
    </div>
    <p className="font-mono text-[10.5px] text-dim">waiting for approval</p>
  </MfaPanel>
);
