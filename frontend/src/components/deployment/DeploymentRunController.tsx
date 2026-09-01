import { useEffect, useRef, useState } from "react";
import type { Project } from "@/hooks/useProjects";
import { useDeploymentLogStream, type DeploymentStatus } from "@/hooks/useDeploymentLogStream";
import { useElapsedTime } from "@/hooks/useElapsedTime";
import type { DeploymentRunSnapshot } from "@/hooks/useDeploymentRun";

type DeploymentRunControllerProps = {
  runKey: string;
  project: Project | null;
  initialParams?: Record<string, unknown>;
  attachDeploymentId?: string;
  onSnapshot: (runKey: string, snapshot: DeploymentRunSnapshot) => void;
  onTriggerFailed: (runKey: string, message: string) => void;
};

const TERMINAL = new Set<DeploymentStatus>(["succeeded", "failed", "aborted"]);

/**
 * Owns one deployment's SSE-backed log stream (via useDeploymentLogStream,
 * untouched) and reports its state up to the run manager. Renders nothing —
 * DeploymentRunsHost mounts one of these per tracked run at the app root, so
 * the stream and any pending MFA event survive regardless of which panel is
 * currently open (T-71/T-75).
 */
export const DeploymentRunController = ({
  runKey,
  project,
  initialParams,
  attachDeploymentId,
  onSnapshot,
  onTriggerFailed,
}: DeploymentRunControllerProps) => {
  const { status, logs, mfaEvent, deploymentId, abortDeploy, submitMfa, triggerDeploy, attachToDeployment } =
    useDeploymentLogStream();

  const hasStartedRef = useRef(false);
  const startedAtRef = useRef(Date.now());
  const failureReportedRef = useRef(false);
  const [endedAt, setEndedAt] = useState<number | null>(null);

  const liveElapsedMs = useElapsedTime(endedAt === null ? startedAtRef.current : null);

  useEffect(() => {
    if (hasStartedRef.current) return;
    hasStartedRef.current = true;
    if (initialParams && project) {
      void triggerDeploy(project.id, initialParams);
    } else if (attachDeploymentId) {
      attachToDeployment(attachDeploymentId);
    }
  }, [initialParams, project, attachDeploymentId, triggerDeploy, attachToDeployment]);

  useEffect(() => {
    if (TERMINAL.has(status) && endedAt === null) {
      setEndedAt(Date.now());
    }
  }, [status, endedAt]);

  // A trigger that never reaches a real deployment id (e.g. the backend's
  // per-project 409 concurrency lock) fails fast — surface that distinctly
  // instead of leaving a phantom, empty run in the tab strip.
  useEffect(() => {
    if (failureReportedRef.current || !initialParams || status !== "failed" || deploymentId !== null) return;
    failureReportedRef.current = true;
    const lastLine = logs[logs.length - 1] ?? "";
    const message = lastLine.startsWith("ERROR: ") ? lastLine.slice(7) : "Deployment could not be started.";
    onTriggerFailed(runKey, message);
  }, [status, deploymentId, logs, initialParams, runKey, onTriggerFailed]);

  useEffect(() => {
    const elapsedMs = endedAt ? endedAt - startedAtRef.current : liveElapsedMs;
    onSnapshot(runKey, { deploymentId, status, logs, mfaEvent, elapsedMs, abort: abortDeploy, submitMfa });
  }, [runKey, deploymentId, status, logs, mfaEvent, endedAt, liveElapsedMs, abortDeploy, submitMfa, onSnapshot]);

  return null;
};
