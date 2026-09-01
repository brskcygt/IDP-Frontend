import { AlertTriangle } from "lucide-react";

export const DashboardError = () => (
  <div className="flex h-screen items-center justify-center bg-background px-6">
    <div className="max-w-sm space-y-3 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-status-fail/30 bg-status-fail/10">
        <AlertTriangle className="h-5 w-5 text-status-fail" aria-hidden="true" />
      </div>
      <p className="text-base font-semibold text-status-fail">Failed to load projects</p>
      <p className="text-sm text-muted-foreground">
        The platform API did not respond. Check that the backend is running on port 3001.
      </p>
    </div>
  </div>
);
