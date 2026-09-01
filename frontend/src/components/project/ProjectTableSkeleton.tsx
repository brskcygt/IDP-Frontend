import { Skeleton } from "@/components/ui/skeleton";
import { PROJECT_CELL, PROJECT_GRID } from "./tableLayout";
import { cn } from "@/lib/utils";

const ROWS = Array.from({ length: 8 }, (_, index) => index);

export const ProjectTableSkeleton = () => (
  <div aria-busy="true" aria-label="Loading projects">
    {ROWS.map((row) => (
      <div key={row} className={cn(PROJECT_GRID, "h-[46px] border-b border-line")}>
        <div className="h-[46px] bg-line-strong" />
        <div className={PROJECT_CELL}>
          <Skeleton className="h-3.5 w-36 bg-line-strong" />
        </div>
        <div className={PROJECT_CELL}>
          <Skeleton className="h-3 w-20 bg-line" />
        </div>
        <div className={PROJECT_CELL}>
          <Skeleton className="h-3 w-16 bg-line" />
        </div>
        <div className={PROJECT_CELL}>
          <Skeleton className="h-1 w-14 bg-line" />
        </div>
        <div className={PROJECT_CELL}>
          <Skeleton className="h-3 w-16 bg-line" />
        </div>
        <div className={PROJECT_CELL}>
          <Skeleton className="h-3 w-20 bg-line" />
        </div>
        <div className={cn(PROJECT_CELL, "flex justify-end")}>
          <Skeleton className="h-[26px] w-16 bg-line" />
        </div>
      </div>
    ))}
  </div>
);
