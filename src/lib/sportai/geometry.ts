import type { FrameSample, Joint } from "./contracts";

/** MediaPipe Pose landmark indices (33-point BlazePose topology). */
export const LM = {
  nose: 0,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
  leftHeel: 29,
  rightHeel: 30,
  leftToe: 31,
  rightToe: 32,
} as const;

/** Joints that must be visible for a running-form verdict to be trustworthy. */
export const CRITICAL_JOINTS: number[] = [
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
];

export const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
  [27, 29],
  [29, 31],
  [27, 31],
  [28, 30],
  [30, 32],
  [28, 32],
  [0, 11],
  [0, 12],
];

export function midpoint(a: Joint, b: Joint): Joint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    conf: Math.min(a.conf, b.conf),
  };
}

/** Interior angle ABC in degrees. */
export function angleAt(a: Joint, b: Joint, c: Joint): number {
  const v1x = a.x - b.x;
  const v1y = a.y - b.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const m1 = Math.hypot(v1x, v1y);
  const m2 = Math.hypot(v2x, v2y);
  if (m1 === 0 || m2 === 0) return 0;
  const cos = Math.min(1, Math.max(-1, dot / (m1 * m2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Angle of segment a->b measured from the vertical axis, in degrees (always >= 0). */
export function angleFromVertical(a: Joint, b: Joint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return 0;
  return Math.abs((Math.atan2(dx, dy) * 180) / Math.PI);
}

/** Signed lean: positive = leaning forward in the direction of travel. */
export function signedLean(hip: Joint, shoulder: Joint, facingRight: boolean): number {
  const dx = shoulder.x - hip.x;
  const dy = hip.y - shoulder.y; // positive because y grows downward
  const deg = (Math.atan2(dx, Math.max(dy, 1e-6)) * 180) / Math.PI;
  return facingRight ? deg : -deg;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Simple moving-average smoother for a 1D series. */
export function smooth(series: number[], window = 5): number[] {
  if (series.length === 0) return [];
  const half = Math.floor(window / 2);
  return series.map((_, i) => {
    const from = Math.max(0, i - half);
    const to = Math.min(series.length, i + half + 1);
    return mean(series.slice(from, to));
  });
}

/**
 * Counts local minima in a smoothed series (used for ground-contact / step
 * detection). Returns the indices of the detected peaks.
 */
export function findLocalMinima(series: number[], minSeparation = 3): number[] {
  const out: number[] = [];
  for (let i = 1; i < series.length - 1; i++) {
    if (series[i]! <= series[i - 1]! && series[i]! < series[i + 1]!) {
      const last = out[out.length - 1];
      if (last === undefined || i - last >= minSeparation) out.push(i);
    }
  }
  return out;
}

/** Median torso length in normalised units — used to scale distances. */
export function torsoScale(frames: FrameSample[]): number {
  const lengths: number[] = [];
  for (const f of frames) {
    const sh = midpoint(f.joints[LM.leftShoulder]!, f.joints[LM.rightShoulder]!);
    const hip = midpoint(f.joints[LM.leftHip]!, f.joints[LM.rightHip]!);
    const len = Math.hypot(sh.x - hip.x, sh.y - hip.y);
    if (len > 0.01) lengths.push(len);
  }
  return median(lengths) || 0.2;
}

/** Determines the athlete's travel direction from toe-vs-heel geometry. */
export function facesRight(frames: FrameSample[]): boolean {
  let score = 0;
  for (const f of frames) {
    const toe = f.joints[LM.rightToe]!;
    const heel = f.joints[LM.rightHeel]!;
    const toeL = f.joints[LM.leftToe]!;
    const heelL = f.joints[LM.leftHeel]!;
    if (toe.conf > 0.4 && heel.conf > 0.4) score += toe.x - heel.x;
    if (toeL.conf > 0.4 && heelL.conf > 0.4) score += toeL.x - heelL.x;
  }
  return score >= 0;
}