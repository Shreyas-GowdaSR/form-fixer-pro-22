import type {
  AthleteContext,
  Phase1Output,
  Phase2Output,
  Phase3Output,
} from "./contracts";

/**
 * An activity module plugs a sport into the pipeline. Adding sprint, shot put,
 * discus throw, etc. later means writing one module and registering it here —
 * Phase 1 (pose) and Phase 3 (rendering) stay untouched.
 */
export interface ActivityModule {
  slug: string;
  name: string;
  description: string;
  /** guidance shown on the upload screen */
  filmingTips: string[];
  /** Phase 2: motion analysis, ideal-pose comparison, error detection, MKI */
  analyse: (phase1: Phase1Output) => Phase2Output;
  /** Phase 3: point-wise feedback, drills and nutrition */
  feedback: (phase2: Phase2Output, athlete: AthleteContext) => Phase3Output;
}

const modules = new Map<string, ActivityModule>();

export function registerActivity(module: ActivityModule): void {
  modules.set(module.slug, module);
}

export function getActivity(slug: string): ActivityModule | undefined {
  return modules.get(slug);
}

export function listActivities(): ActivityModule[] {
  return [...modules.values()];
}

export function isActivityImplemented(slug: string): boolean {
  return modules.has(slug);
}