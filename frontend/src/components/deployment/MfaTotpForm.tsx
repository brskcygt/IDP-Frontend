import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useTotpInputs } from "@/hooks/useTotpInputs";
import { MfaPanel } from "./MfaPanel";
import { cn } from "@/lib/utils";

type MfaTotpFormProps = {
  interceptedCode?: string;
  onSubmit: (code: string) => Promise<void>;
  /** Without this the code prompt is a dead end: the deployment holds the
   *  project's concurrency lock until the MFA wait times out, so the operator
   *  can neither finish nor retry. */
  onCancel: () => void;
};

export const MfaTotpForm = ({ interceptedCode, onSubmit, onCancel }: MfaTotpFormProps) => {
  const { digits, code, isComplete, isIntercepted, setDigit, handleKeyDown, registerInput } =
    useTotpInputs(interceptedCode);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submit = async () => {
    if (!isComplete || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onSubmit(code);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <MfaPanel
      title="Authenticator code required"
      description="Enter the six-digit code from your authenticator app to continue."
      footer={
        <div className="flex w-full flex-col gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={!isComplete || isSubmitting}
          className="inline-flex h-[38px] w-full items-center justify-center gap-2 rounded-md bg-primary text-[13px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:pointer-events-none disabled:opacity-50"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          )}
          {isIntercepted ? "Auto-intercepted — submit" : isSubmitting ? "Submitting…" : "Submit code"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isSubmitting}
          className="h-[34px] w-full rounded-md border border-status-fail/40 bg-status-fail/[0.07] text-xs font-semibold text-status-fail transition-colors hover:bg-status-fail/15 disabled:opacity-50"
        >
          Cancel deployment
        </button>
        </div>
      }
    >
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-primary/40 bg-primary/10 text-primary">
        <KeyRound className="h-6 w-6" aria-hidden="true" />
      </div>

      <div className="flex justify-center gap-2" role="group" aria-label="Authenticator code">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={registerInput(index)}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={1}
            autoComplete="one-time-code"
            aria-label={`Digit ${index + 1}`}
            value={digit}
            disabled={isIntercepted || isSubmitting}
            onChange={(event) => setDigit(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            className={cn(
              "h-12 w-10 rounded-md border text-center font-mono text-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isIntercepted
                ? "border-primary bg-primary/15 font-bold text-primary"
                : "border-line-strong bg-background",
            )}
          />
        ))}
      </div>

      {isIntercepted && (
        <p className="mt-3 font-mono text-[10.5px] text-primary">
          code captured by the OTP webhook
        </p>
      )}
    </MfaPanel>
  );
};
