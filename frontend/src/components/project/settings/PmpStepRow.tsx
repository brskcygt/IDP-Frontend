import { ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PmpStepFields } from "@/components/project/settings/PmpStepFields";
import { createDefaultPmpStep } from "@/components/project/settings/pmpStepDefaults";
import { PMP_STEP_ACTIONS } from "@/types/project";
import type { PmpStep, PmpStepAction } from "@/types/project";

interface PmpStepRowProps {
  step: PmpStep;
  index: number;
  total: number;
  onChange: (next: PmpStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

/** One row of the PMP step editor: action picker, its fields, and reorder/delete controls. */
export const PmpStepRow = ({ step, index, total, onChange, onRemove, onMoveUp, onMoveDown }: PmpStepRowProps) => {
  return (
    <div className="space-y-2 bg-accent/20 p-2.5 rounded border border-border/50">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0">#{index + 1}</span>

        <Select
          value={step.action}
          onValueChange={(action) => onChange(createDefaultPmpStep(action as PmpStepAction))}
        >
          <SelectTrigger className="h-8 text-xs bg-accent/50 border-border/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PMP_STEP_ACTIONS.map((action) => (
              <SelectItem key={action} value={action} className="text-xs">
                {action}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={index === 0}
            onClick={onMoveUp}
            aria-label={`Adım ${index + 1} yukarı taşı`}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={index === total - 1}
            onClick={onMoveDown}
            aria-label={`Adım ${index + 1} aşağı taşı`}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label={`Adım ${index + 1} sil`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <PmpStepFields step={step} onChange={onChange} />
    </div>
  );
};
