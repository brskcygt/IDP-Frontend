import type { DeploymentRunRecord, DeploymentRunSnapshot } from "@/hooks/useDeploymentRun";
import { DeploymentRunController } from "./DeploymentRunController";

type DeploymentRunsHostProps = {
  records: DeploymentRunRecord[];
  onSnapshot: (runKey: string, snapshot: DeploymentRunSnapshot) => void;
  onTriggerFailed: (runKey: string, message: string) => void;
};

/**
 * Mounts one DeploymentRunController per tracked deployment, always — at
 * Dashboard's top level, independent of the terminal Sheet or any modal —
 * so every run's SSE connection and MFA state keep working no matter what
 * the user currently has open (T-71/T-75).
 */
export const DeploymentRunsHost = ({ records, onSnapshot, onTriggerFailed }: DeploymentRunsHostProps) => (
  <>
    {records.map((record) => (
      <DeploymentRunController
        key={record.runKey}
        runKey={record.runKey}
        project={record.project}
        initialParams={record.initialParams}
        attachDeploymentId={record.attachDeploymentId}
        onSnapshot={onSnapshot}
        onTriggerFailed={onTriggerFailed}
      />
    ))}
  </>
);
