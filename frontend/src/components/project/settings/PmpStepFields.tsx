import { Input } from "@/components/ui/input";
import type { PmpStep } from "@/types/project";

interface PmpStepFieldsProps {
  step: PmpStep;
  onChange: (next: PmpStep) => void;
}

const fieldClass = "bg-accent/50 border-border/50 text-xs";
const selectorFieldClass = `${fieldClass} font-mono`;

/** Renders the input fields specific to one PMP step's action. */
export const PmpStepFields = ({ step, onChange }: PmpStepFieldsProps) => {
  switch (step.action) {
    case 'goto':
      return (
        <Input
          value={step.url}
          onChange={(e) => onChange({ ...step, url: e.target.value })}
          placeholder="https://portal.example.com/deploy"
          className={fieldClass}
        />
      );

    case 'fill':
    case 'select':
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={step.selector}
            onChange={(e) => onChange({ ...step, selector: e.target.value })}
            placeholder="CSS selector"
            className={selectorFieldClass}
          />
          <Input
            value={step.value}
            onChange={(e) => onChange({ ...step, value: e.target.value })}
            placeholder="value, or {{username}} / {{password}} / {{environment}}"
            className={fieldClass}
          />
        </div>
      );

    case 'click':
      return (
        <Input
          value={step.selector}
          onChange={(e) => onChange({ ...step, selector: e.target.value })}
          placeholder="CSS selector"
          className={selectorFieldClass}
        />
      );

    case 'waitFor':
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={step.selector}
            onChange={(e) => onChange({ ...step, selector: e.target.value })}
            placeholder="CSS selector"
            className={selectorFieldClass}
          />
          <Input
            type="number"
            value={step.timeoutMs ?? ''}
            onChange={(e) => onChange({
              ...step,
              timeoutMs: e.target.value ? Number(e.target.value) : undefined,
            })}
            placeholder="timeout ms (optional, max 30000)"
            className={fieldClass}
          />
        </div>
      );

    case 'waitForNavigation':
      return (
        <Input
          type="number"
          value={step.timeoutMs ?? ''}
          onChange={(e) => onChange({
            ...step,
            timeoutMs: e.target.value ? Number(e.target.value) : undefined,
          })}
          placeholder="timeout ms (optional, max 30000)"
          className={fieldClass}
        />
      );

    case 'assertText':
      return (
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={step.selector}
            onChange={(e) => onChange({ ...step, selector: e.target.value })}
            placeholder="CSS selector"
            className={selectorFieldClass}
          />
          <Input
            value={step.contains}
            onChange={(e) => onChange({ ...step, contains: e.target.value })}
            placeholder="expected text"
            className={fieldClass}
          />
        </div>
      );

    case 'screenshot':
      return (
        <Input
          value={step.name}
          onChange={(e) => onChange({ ...step, name: e.target.value })}
          placeholder="screenshot name"
          className={fieldClass}
        />
      );

    case 'wait':
      return (
        <Input
          type="number"
          value={step.ms}
          onChange={(e) => onChange({ ...step, ms: Number(e.target.value) || 0 })}
          placeholder="milliseconds (max 30000)"
          className={fieldClass}
        />
      );

    default:
      return null;
  }
};
