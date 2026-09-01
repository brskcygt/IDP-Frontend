import type { DeploymentRunView } from "@/hooks/useDeploymentRun";
import { MfaOverlay } from "./MfaOverlay";

type MfaGlobalModalProps = {
  runs: DeploymentRunView[];
  activeRunKey: string | null;
  onCancel: (runKey: string) => void;
};

/**
 * MFA is deployment-blocking regardless of which panel is open, so it now
 * renders at the app root instead of inside the terminal Sheet (T-75) —
 * closing the Sheet used to unmount the prompt entirely and let the
 * deployment time out after 60s. Whichever tracked run needs approval is
 * shown centered over the whole app, with the project name called out so a
 * closed terminal Sheet doesn't leave the user guessing which deployment is
 * waiting. MfaOverlay/MfaPanel/MfaTotpForm/MfaPushWait/MfaNumberMatch are
 * untouched — only where this renders moved.
 */
export const MfaGlobalModal = ({ runs, activeRunKey, onCancel }: MfaGlobalModalProps) => {
  // A finished run must never keep this dialog up, even if a stale mfaEvent
  // survives somewhere: this modal has no dismiss control, so a false positive
  // here locks the operator out of the whole app.
  const TERMINAL = ['succeeded', 'failed', 'aborted'];
  const pending = runs.filter((run) => run.mfaEvent !== null && !TERMINAL.includes(run.status));
  if (pending.length === 0) return null;

  const focused = pending.find((run) => run.runKey === activeRunKey) ?? pending[0];
  if (!focused.mfaEvent) return null;

  const otherCount = pending.length - 1;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-x-0 top-0 z-[101] flex justify-center pt-6">
        <div className="rounded-full border border-line-strong bg-popover px-4 py-1.5 text-center font-mono text-[11px] tracking-[0.1em] text-primary shadow-lg">
          {focused.project?.name ?? focused.projectId} awaiting MFA approval
          {otherCount > 0 && ` · +${otherCount} more waiting`}
        </div>
      </div>
      <MfaOverlay event={focused.mfaEvent} onSubmit={focused.submitMfa} onCancel={() => onCancel(focused.runKey)} />
    </div>
  );
};
