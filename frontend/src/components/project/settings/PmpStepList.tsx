import { useRef } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PmpStepRow } from "@/components/project/settings/PmpStepRow";
import { createDefaultPmpStep } from "@/components/project/settings/pmpStepDefaults";
import { MAX_PMP_STEPS } from "@/components/project/settings/pmpStepLimits";
import type { PmpStep } from "@/types/project";

interface PmpStepListProps {
  steps: PmpStep[];
  onChange: (nextSteps: PmpStep[]) => void;
}

/**
 * Add/remove/reorder editor for a PMP project's declarative automation
 * steps (backend/src/adapters/pmp/StepRunner.js runs exactly this list —
 * see stepSchema.js for the same MAX_PMP_STEPS ceiling enforced server-side).
 */
export const PmpStepList = ({ steps, onChange }: PmpStepListProps) => {
  // Steps are plain data with no natural unique id. Cache a stable React key
  // per step object (by reference) instead of using the array index, so
  // reordering/removing doesn't cause inputs to lose focus or swap state.
  const stepKeysRef = useRef(new WeakMap<PmpStep, string>());
  const keyCounterRef = useRef(0);
  const getStepKey = (step: PmpStep): string => {
    const cache = stepKeysRef.current;
    let key = cache.get(step);
    if (!key) {
      key = `pmp-step-${keyCounterRef.current++}`;
      cache.set(step, key);
    }
    return key;
  };

  const updateStep = (index: number, next: PmpStep) => {
    onChange(steps.map((step, i) => (i === index ? next : step)));
  };

  const removeStep = (index: number) => {
    onChange(steps.filter((_, i) => i !== index));
  };

  const moveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const addStep = () => {
    if (steps.length >= MAX_PMP_STEPS) return;
    onChange([...steps, createDefaultPmpStep('goto')]);
  };

  return (
    <div className="space-y-2">
      {steps.length === 0 && (
        <p className="text-xs text-muted-foreground/80 italic">
          Henüz adım eklenmedi. Başlamak için "Adım Ekle" butonunu kullanın.
        </p>
      )}

      {steps.map((step, index) => (
        <PmpStepRow
          key={getStepKey(step)}
          step={step}
          index={index}
          total={steps.length}
          onChange={(next) => updateStep(index, next)}
          onRemove={() => removeStep(index)}
          onMoveUp={() => moveStep(index, -1)}
          onMoveDown={() => moveStep(index, 1)}
        />
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addStep}
        disabled={steps.length >= MAX_PMP_STEPS}
        className="w-full"
      >
        <Plus className="h-3.5 w-3.5" />
        Adım Ekle {steps.length > 0 ? `(${steps.length}/${MAX_PMP_STEPS})` : ''}
      </Button>
    </div>
  );
};
