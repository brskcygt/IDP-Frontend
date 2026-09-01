import type { PmpStep, PmpStepAction } from "@/types/project";

/**
 * Blank starting values for a PMP step, used both when a new step is added
 * and when an existing step's action is switched via the action select.
 */
export const createDefaultPmpStep = (action: PmpStepAction): PmpStep => {
  switch (action) {
    case 'goto':
      return { action, url: '' };
    case 'fill':
      return { action, selector: '', value: '' };
    case 'click':
      return { action, selector: '' };
    case 'waitFor':
      return { action, selector: '' };
    case 'waitForNavigation':
      return { action };
    case 'select':
      return { action, selector: '', value: '' };
    case 'assertText':
      return { action, selector: '', contains: '' };
    case 'screenshot':
      return { action, name: '' };
    case 'wait':
      return { action, ms: 1000 };
    default:
      return { action: 'wait', ms: 1000 };
  }
};
