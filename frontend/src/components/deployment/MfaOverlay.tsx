import type { MfaEvent } from "@/hooks/useDeploymentLogStream";
import { MfaNumberMatch } from "./MfaNumberMatch";
import { MfaPushWait } from "./MfaPushWait";
import { MfaTotpForm } from "./MfaTotpForm";

type MfaOverlayProps = {
  event: MfaEvent;
  onSubmit: (code?: string) => Promise<void>;
  onCancel: () => void;
};

/** Dims the stream and routes to the challenge the adapter actually asked for. */
export const MfaOverlay = ({ event, onSubmit, onCancel }: MfaOverlayProps) => (
  <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface-sunken/80 p-4 backdrop-blur-sm">
    {event.type === "MFA_NUMBER_MATCHING" ? (
      <MfaNumberMatch number={event.payload.number} onCancel={onCancel} />
    ) : event.payload.authType === "totp" ? (
      <MfaTotpForm
        interceptedCode={(event.payload as { interceptedCode?: string }).interceptedCode}
        onSubmit={(code) => onSubmit(code)}
        onCancel={onCancel}
      />
    ) : (
      <MfaPushWait onCancel={onCancel} />
    )}
  </div>
);
