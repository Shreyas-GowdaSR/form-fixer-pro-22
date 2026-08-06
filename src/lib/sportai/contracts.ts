/**
 * SportAI+ pipeline data contracts.
 * Mirrors the PPT architecture handoff contracts:
 *  Phase 1 -> frame_id, timestamp, 33 joints [x,y,z,conf], occlusion flags, sport label, avg_confidence
 *  Phase 2 -> 3D joints, fused_conf, error_type, MKI_score, sport, intensity_level
 *  Phase 3 -> feedback, drills, nutrition, coaching video overlay
 */

export const LANDMARK_COUNT = 33;

export interface Joint {
  /** normalised 0..1 image x */
  x: number;
  /** normalised 0..1 image y */
  y: number;
  /** depth estimate (Phase 1 stub = MediaPipe world z, refined by MotionBERT in Phase 2) */
  z: number;
  /** visibility / confidence 0..1 */
  conf: number;
}

export interface FrameSample {
  frameId: number;
  timestampMs: number;
  joints: Joint[];
  /** indices of critical joints flagged as occluded / low confidence */
  occlusionFlags: number[];
  avgConfidence: number;
  angles: Record<string, number>;
}

export interface Phase1Output {
  sport: string;
  fps: number;
  durationSec: number;
  width: number;
  height: number;
  frames: FrameSample[];
  avgConfidence: number;
  occludedFramePct: number;
}

export type Severity = "high" | "medium" | "low";
export type MetricStatus = "good" | "warn" | "bad";

export interface DetectedError {
  code: string;
  label: string;
  severity: Severity;
  cue: string;
  /** fraction of analysed frames exhibiting the fault, 0..1 */
  framePct: number;
  evidence: string;
}

export interface MetricResult {
  key: string;
  label: string;
  value: number;
  unit: string;
  ideal: number;
  min: number;
  max: number;
  status: MetricStatus;
  note: string;
}

export interface MkiComponent {
  key: string;
  label: string;
  score: number;
  weight: number;
}

export interface MkiResult {
  score: number;
  grade: string;
  components: MkiComponent[];
}

export interface Phase2Output {
  sport: string;
  metrics: MetricResult[];
  errors: DetectedError[];
  mki: MkiResult;
  intensityLevel: "low" | "moderate" | "high";
  fusedConfidence: number;
}

export interface Drill {
  title: string;
  detail: string;
  dosage: string;
}

export interface NutritionPlan {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  hydration_l: number;
  meals: { slot: string; items: string }[];
}

export interface Phase3Output {
  summary: string;
  cues: string[];
  drills: Drill[];
  nutrition: NutritionPlan;
}

export interface AnalysisResult {
  phase1: Phase1Output;
  phase2: Phase2Output;
  phase3: Phase3Output;
}

export interface AthleteContext {
  weightKg?: number | null;
  heightCm?: number | null;
  age?: number | null;
  experienceLevel?: string | null;
}