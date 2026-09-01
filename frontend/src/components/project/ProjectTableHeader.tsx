import { PROJECT_GRID, PROJECT_HEAD_CELL } from "./tableLayout";
import { cn } from "@/lib/utils";

const COLUMNS = [
  "PROJECT",
  "TENANT",
  "PROVIDER",
  "HOST LOAD",
  "LAST 8 RUNS",
  "LAST RUN",
] as const;

export const ProjectTableHeader = () => (
  <div className={cn(PROJECT_GRID, "h-[34px] border-b border-line-strong bg-bar")} role="row">
    <div aria-hidden="true" />
    {COLUMNS.map((column) => (
      <div key={column} role="columnheader" className={PROJECT_HEAD_CELL}>
        {column}
      </div>
    ))}
    <div role="columnheader" className={cn(PROJECT_HEAD_CELL, "text-right")}>
      ACTION
    </div>
  </div>
);
