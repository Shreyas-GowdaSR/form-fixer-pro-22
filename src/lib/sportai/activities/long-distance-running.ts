import type {
  AthleteContext,
  DetectedError,
  MetricResult,
  MetricStatus,
  MkiComponent,
  Phase1Output,
  Phase2Output,
  Phase3Output,
} from "../contracts";
import {
  CRITICAL_JOINTS,
  LM,
  angleAt,
  clamp,
  facesRight,
  findLocalMinima,
  mean,
  median,
  midpoint,
  round,
  signedLean,
  smooth,
  torsoScale,
} from "../geometry";
import type { ActivityModule } from "../registry";

/** Ideal-form reference bands for endurance running (mirrors the DB catalogue). */
export const RUNNING_REFERENCE = {
  trunk_lean_deg: { min: 4, max: 10, ideal: 7 },
  knee_drive_deg: { min: 85, max: 115, ideal: 100 },
  elbow_angle_deg: { min: 75, max: 100, ideal: 88 },
  cadence_spm: { min: 168, max: 185, ideal: 176 },
  vertical_oscillation_pct: { min: 0, max: 4.5, ideal: 3 },
  overstride_pct: { min: 0, max: 12, ideal: 5 },
  head_alignment_deg: { min: 0, max: 10, ideal: 4 },
  hip_drop_deg: { min: 0, max: 5, ideal: 2 },
} as const;

type Band = { min: number; max: number; ideal: number };

function statusFor(value: number, band: Band): MetricStatus {
  if (value >= band.min && value <= band.max) return "good";
  const span = Math.max(band.max - band.min, 1);
  const drift = value < band.min ? band.min - value : value - band.max;
  return drift <= span * 0.45 ? "warn" : "bad";
}

/** 0..100 closeness of a measurement to its ideal band. */
function bandScore(value: number, band: Band): number {
  if (value >= band.min && value <= band.max) return 100;
  const span = Math.max(band.max - band.min, 1);
  const drift = value < band.min ? band.min - value : value - band.max;
  return clamp(100 - (drift / span) * 70, 5, 100);
}

function metric(
  key: string,
  label: string,
  value: number,
  unit: string,
  band: Band,
  note: string,
): MetricResult {
  return {
    key,
    label,
    value: round(value),
    unit,
    ideal: band.ideal,
    min: band.min,
    max: band.max,
    status: statusFor(value, band),
    note,
  };
}

function gradeFor(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 82) return "A";
  if (score >= 74) return "B+";
  if (score >= 66) return "B";
  if (score >= 56) return "C";
  if (score >= 45) return "D";
  return "E";
}

function analyse(phase1: Phase1Output): Phase2Output {
  const frames = phase1.frames;
  const right = facesRight(frames);
  const scale = torsoScale(frames);

  const trunkLeans: number[] = [];
  const kneeDrives: number[] = [];
  const elbowAngles: number[] = [];
  const headAngles: number[] = [];
  const hipDrops: number[] = [];
  const hipY: number[] = [];
  const ankleY: number[] = [];
  const strideOffsets: number[] = [];
  const heelStrikeVotes: number[] = [];

  for (const f of frames) {
    const j = f.joints;
    const hip = midpoint(j[LM.leftHip]!, j[LM.rightHip]!);
    const shoulder = midpoint(j[LM.leftShoulder]!, j[LM.rightShoulder]!);
    const ear = midpoint(j[LM.leftEar]!, j[LM.rightEar]!);

    trunkLeans.push(signedLean(hip, shoulder, right));
    headAngles.push(Math.abs(signedLean(shoulder, ear, right)));

    const leftKnee = angleAt(j[LM.leftHip]!, j[LM.leftKnee]!, j[LM.leftAnkle]!);
    const rightKnee = angleAt(j[LM.rightHip]!, j[LM.rightKnee]!, j[LM.rightAnkle]!);
    kneeDrives.push(180 - Math.min(leftKnee, rightKnee));

    elbowAngles.push(
      mean([
        angleAt(j[LM.leftShoulder]!, j[LM.leftElbow]!, j[LM.leftWrist]!),
        angleAt(j[LM.rightShoulder]!, j[LM.rightElbow]!, j[LM.rightWrist]!),
      ]),
    );

    const hipVector = Math.atan2(
      j[LM.rightHip]!.y - j[LM.leftHip]!.y,
      Math.abs(j[LM.rightHip]!.x - j[LM.leftHip]!.x) || 1e-6,
    );
    hipDrops.push(Math.abs((hipVector * 180) / Math.PI));

    hipY.push(hip.y);

    const lowAnkle =
      j[LM.leftAnkle]!.y > j[LM.rightAnkle]!.y ? j[LM.leftAnkle]! : j[LM.rightAnkle]!;
    ankleY.push(Math.min(j[LM.leftAnkle]!.y, j[LM.rightAnkle]!.y));
    const offset = (right ? lowAnkle.x - hip.x : hip.x - lowAnkle.x) / scale;
    strideOffsets.push(offset * 100);

    const heel = right ? j[LM.rightHeel]! : j[LM.leftHeel]!;
    const toe = right ? j[LM.rightToe]! : j[LM.leftToe]!;
    if (heel.conf > 0.3 && toe.conf > 0.3) {
      heelStrikeVotes.push(heel.y - toe.y > 0.008 ? 1 : 0);
    }

    f.angles = {
      trunk_lean: round(trunkLeans[trunkLeans.length - 1]!),
      knee_flex: round(Math.min(leftKnee, rightKnee)),
      elbow: round(elbowAngles[elbowAngles.length - 1]!),
      head: round(headAngles[headAngles.length - 1]!),
    };
  }

  const smoothedAnkle = smooth(ankleY, 3).map((v) => -v);
  const contacts = findLocalMinima(smoothedAnkle, Math.max(2, Math.round(phase1.fps / 8)));
  const durationMin = Math.max(phase1.durationSec, 0.5) / 60;
  const cadence = contacts.length >= 2 ? contacts.length / durationMin : 0;

  const smoothedHip = smooth(hipY, 5);
  const hipRange = Math.max(...smoothedHip) - Math.min(...smoothedHip);
  const bodyHeightProxy = scale * 3.4;
  const oscillation = (hipRange / Math.max(bodyHeightProxy, 1e-6)) * 100;

  const trunkLean = median(trunkLeans);
  const kneeDrive = median(kneeDrives);
  const elbow = median(elbowAngles);
  const head = median(headAngles);
  const hipDrop = median(hipDrops);
  const overstride = median(strideOffsets.map((v) => Math.max(v, 0)));
  const heelStrikeRatio = heelStrikeVotes.length ? mean(heelStrikeVotes) : 0;

  const metrics: MetricResult[] = [
    metric(
      "trunk_lean_deg",
      "Trunk lean",
      trunkLean,
      "deg",
      RUNNING_REFERENCE.trunk_lean_deg,
      "Whole-body forward lean measured hip to shoulder.",
    ),
    metric(
      "cadence_spm",
      "Cadence",
      cadence,
      "spm",
      RUNNING_REFERENCE.cadence_spm,
      "Ground contacts per minute detected from the ankle trajectory.",
    ),
    metric(
      "knee_drive_deg",
      "Knee drive",
      kneeDrive,
      "deg",
      RUNNING_REFERENCE.knee_drive_deg,
      "Peak knee flexion during the swing phase.",
    ),
    metric(
      "vertical_oscillation_pct",
      "Vertical oscillation",
      oscillation,
      "%",
      RUNNING_REFERENCE.vertical_oscillation_pct,
      "Hip rise and fall as a share of standing height.",
    ),
    metric(
      "overstride_pct",
      "Foot landing offset",
      overstride,
      "%",
      RUNNING_REFERENCE.overstride_pct,
      "How far ahead of the hips the foot lands, scaled to torso length.",
    ),
    metric(
      "elbow_angle_deg",
      "Elbow angle",
      elbow,
      "deg",
      RUNNING_REFERENCE.elbow_angle_deg,
      "Average arm carriage angle through the swing.",
    ),
    metric(
      "head_alignment_deg",
      "Head alignment",
      head,
      "deg",
      RUNNING_REFERENCE.head_alignment_deg,
      "Neck deviation from the trunk line.",
    ),
    metric(
      "hip_drop_deg",
      "Pelvic drop",
      hipDrop,
      "deg",
      RUNNING_REFERENCE.hip_drop_deg,
      "Lateral tilt of the pelvis through mid-stance.",
    ),
  ];

  const errors: DetectedError[] = [];
  const pct = (arr: number[], test: (v: number) => boolean) =>
    arr.length ? arr.filter(test).length / arr.length : 0;

  const push = (
    code: string,
    label: string,
    severity: DetectedError["severity"],
    cue: string,
    framePct: number,
    evidence: string,
  ) => {
    if (framePct > 0.2) {
      errors.push({ code, label, severity, cue, framePct: round(framePct, 2), evidence });
    }
  };

  push(
    "OVERSTRIDE",
    heelStrikeRatio > 0.55 ? "Overstriding with heel strike" : "Overstriding",
    "high",
    "Land with the foot closer to your hips, under the centre of mass. Nudge cadence up to shorten the stride.",
    pct(strideOffsets, (v) => v > RUNNING_REFERENCE.overstride_pct.max),
    `Foot lands ${round(overstride)}% of torso length ahead of the hips (target under ${RUNNING_REFERENCE.overstride_pct.max}%); heel-first on ${Math.round(heelStrikeRatio * 100)}% of contacts.`,
  );
  push(
    "TRUNK_COLLAPSE",
    "Excessive forward trunk lean",
    "high",
    "Run tall from the hips. Keep a 5-10 degree whole-body lean from the ankles instead of folding at the waist.",
    pct(trunkLeans, (v) => v > RUNNING_REFERENCE.trunk_lean_deg.max),
    `Median lean ${round(trunkLean)} deg vs ideal ${RUNNING_REFERENCE.trunk_lean_deg.ideal} deg.`,
  );
  push(
    "BACKWARD_LEAN",
    "Backward lean / sitting in the hips",
    "medium",
    "Drive the hips forward and lean slightly from the ankles so the chest leads.",
    pct(trunkLeans, (v) => v < RUNNING_REFERENCE.trunk_lean_deg.min - 2),
    `Median lean ${round(trunkLean)} deg, below the ${RUNNING_REFERENCE.trunk_lean_deg.min} deg floor.`,
  );
  if (cadence > 0 && cadence < RUNNING_REFERENCE.cadence_spm.min) {
    errors.push({
      code: "LOW_CADENCE",
      label: "Cadence below optimal range",
      severity: "medium",
      cue: "Take quicker, lighter steps - target 170-180 steps per minute. Run to a metronome for 2 minutes at a time.",
      framePct: 1,
      evidence: `Detected ${Math.round(cadence)} spm vs target ${RUNNING_REFERENCE.cadence_spm.min}-${RUNNING_REFERENCE.cadence_spm.max} spm.`,
    });
  }
  if (oscillation > RUNNING_REFERENCE.vertical_oscillation_pct.max) {
    errors.push({
      code: "HIGH_BOUNCE",
      label: "Excessive vertical oscillation",
      severity: "medium",
      cue: "Push forward, not upward. Think low, quiet feet and short ground contact.",
      framePct: 1,
      evidence: `Hips travel ${round(oscillation)}% of standing height per stride (target under ${RUNNING_REFERENCE.vertical_oscillation_pct.max}%).`,
    });
  }
  push(
    "ARM_LOCKOUT",
    "Arms too straight through the swing",
    "low",
    "Hold roughly 90 degrees at the elbow and swing front-to-back from the shoulder, not across the midline.",
    pct(elbowAngles, (v) => v > RUNNING_REFERENCE.elbow_angle_deg.max + 15),
    `Median elbow angle ${round(elbow)} deg vs ideal ${RUNNING_REFERENCE.elbow_angle_deg.ideal} deg.`,
  );
  push(
    "HEAD_DROP",
    "Head dropped / gaze down",
    "low",
    "Look 20-30 m ahead. Keep the crown of the head tall so the neck and spine stay neutral.",
    pct(headAngles, (v) => v > RUNNING_REFERENCE.head_alignment_deg.max),
    `Neck deviates ${round(head)} deg from the trunk line.`,
  );
  push(
    "HIP_DROP",
    "Pelvic drop on the stance leg",
    "high",
    "Add single-leg glute medius work (side planks, banded walks) and keep the hips level through mid-stance.",
    pct(hipDrops, (v) => v > RUNNING_REFERENCE.hip_drop_deg.max),
    `Pelvis tilts ${round(hipDrop)} deg laterally (target under ${RUNNING_REFERENCE.hip_drop_deg.max} deg).`,
  );
  push(
    "LOW_KNEE_DRIVE",
    "Shuffling - limited knee drive",
    "medium",
    "Add A-skips and high-knee drills to restore swing-leg range without reaching forward.",
    pct(kneeDrives, (v) => v < RUNNING_REFERENCE.knee_drive_deg.min),
    `Peak swing flexion ${round(kneeDrive)} deg vs ideal ${RUNNING_REFERENCE.knee_drive_deg.ideal} deg.`,
  );

  errors.sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return rank[a.severity] - rank[b.severity] || b.framePct - a.framePct;
  });

  const components: MkiComponent[] = [
    {
      key: "posture",
      label: "Posture & alignment",
      score: round(
        mean([
          bandScore(trunkLean, RUNNING_REFERENCE.trunk_lean_deg),
          bandScore(head, RUNNING_REFERENCE.head_alignment_deg),
        ]),
      ),
      weight: 0.25,
    },
    {
      key: "efficiency",
      label: "Stride efficiency",
      score: round(
        mean([
          bandScore(overstride, RUNNING_REFERENCE.overstride_pct),
          bandScore(cadence, RUNNING_REFERENCE.cadence_spm),
        ]),
      ),
      weight: 0.3,
    },
    {
      key: "economy",
      label: "Vertical economy",
      score: round(bandScore(oscillation, RUNNING_REFERENCE.vertical_oscillation_pct)),
      weight: 0.2,
    },
    {
      key: "stability",
      label: "Pelvic stability",
      score: round(bandScore(hipDrop, RUNNING_REFERENCE.hip_drop_deg)),
      weight: 0.15,
    },
    {
      key: "limbs",
      label: "Limb mechanics",
      score: round(
        mean([
          bandScore(elbow, RUNNING_REFERENCE.elbow_angle_deg),
          bandScore(kneeDrive, RUNNING_REFERENCE.knee_drive_deg),
        ]),
      ),
      weight: 0.1,
    },
  ];

  const rawScore = components.reduce((s, c) => s + c.score * c.weight, 0);
  const confidenceFactor = clamp(0.75 + phase1.avgConfidence * 0.25, 0.75, 1);
  const score = round(clamp(rawScore * confidenceFactor, 0, 100));

  const intensity: Phase2Output["intensityLevel"] =
    cadence >= 182 ? "high" : cadence >= 165 ? "moderate" : "low";

  const criticalVisible = mean(
    frames.map((f) => mean(CRITICAL_JOINTS.map((i) => f.joints[i]?.conf ?? 0))),
  );

  return {
    sport: "long-distance-running",
    metrics,
    errors,
    mki: { score, grade: gradeFor(score), components },
    intensityLevel: intensity,
    fusedConfidence: round(mean([phase1.avgConfidence, criticalVisible]), 3),
  };
}

const DRILL_LIBRARY: Record<string, { title: string; detail: string; dosage: string }> = {
  OVERSTRIDE: {
    title: "Metronome cadence runs",
    detail: "Run at 176 spm with a metronome, consciously landing the foot beneath the hip.",
    dosage: "6 x 1 min, 1 min easy jog between",
  },
  TRUNK_COLLAPSE: {
    title: "Wall lean drill",
    detail: "Lean into a wall from the ankles holding a straight ear-hip-ankle line, then march.",
    dosage: "3 x 30 s hold + 20 marches",
  },
  BACKWARD_LEAN: {
    title: "Falling starts",
    detail: "Stand tall, let the body fall forward from the ankles, catch it with a quick step.",
    dosage: "3 x 8 falls",
  },
  LOW_CADENCE: {
    title: "Quick-feet strides",
    detail: "Short 60 m strides focused on turnover rather than stride length.",
    dosage: "8 x 60 m",
  },
  HIGH_BOUNCE: {
    title: "Low-ceiling running",
    detail: "Imagine a low ceiling; keep head height constant and ground contact quiet.",
    dosage: "5 x 45 s",
  },
  ARM_LOCKOUT: {
    title: "Seated arm swing",
    detail: "Sit tall and swing the arms at 90 degrees in 20 s bursts to groove the pattern.",
    dosage: "4 x 20 s",
  },
  HEAD_DROP: {
    title: "Gaze-target running",
    detail: "Pick a target 25 m ahead and hold the gaze there for the whole rep.",
    dosage: "4 x 200 m",
  },
  HIP_DROP: {
    title: "Side plank + banded walks",
    detail: "Glute medius strength so the pelvis stops dropping through mid-stance.",
    dosage: "3 x 40 s per side + 3 x 15 steps",
  },
  LOW_KNEE_DRIVE: {
    title: "A-skips",
    detail: "Drive the knee to hip height and step down actively under the body.",
    dosage: "4 x 20 m",
  },
};

function feedback(phase2: Phase2Output, athlete: AthleteContext): Phase3Output {
  const weight = athlete.weightKg && athlete.weightKg > 25 ? athlete.weightKg : 62;
  const level = athlete.experienceLevel ?? "beginner";
  const factor = level === "advanced" ? 42 : level === "intermediate" ? 38 : 34;
  const calories = Math.round(weight * factor);
  const protein = Math.round(weight * 1.6);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);

  const top = phase2.errors.slice(0, 3);
  const summary =
    top.length === 0
      ? `Clean endurance mechanics. MKI ${phase2.mki.score}/100 (${phase2.mki.grade}) with every tracked metric inside the ideal band - hold this form and progress volume.`
      : `MKI ${phase2.mki.score}/100 (${phase2.mki.grade}). Priority fix: ${top[0]!.label.toLowerCase()}.${
          top.length > 1
            ? ` Then address ${top
                .slice(1)
                .map((e) => e.label.toLowerCase())
                .join(" and ")}.`
            : ""
        }`;

  const drills = top.map(
    (e) => DRILL_LIBRARY[e.code] ?? { title: "Form focus block", detail: e.cue, dosage: "3 x 1 min" },
  );
  if (drills.length === 0) {
    drills.push({
      title: "Tempo maintenance",
      detail: "Hold current mechanics under mild fatigue to lock the pattern in.",
      dosage: "20 min at conversational-plus pace",
    });
  }

  return {
    summary,
    cues: top.length
      ? top.map((e) => e.cue)
      : ["Keep the current posture and cadence - re-film in two weeks to confirm consistency."],
    drills,
    nutrition: {
      calories,
      protein_g: protein,
      carbs_g: carbs,
      fat_g: fat,
      hydration_l: round(Math.max(2.5, weight * 0.045), 1),
      meals: [
        { slot: "Pre-run (60-90 min before)", items: "Banana + 2 idli or toast with honey, black coffee" },
        { slot: "Post-run (within 30 min)", items: "250 ml milk + whey or chocolate milk, handful of dates" },
        { slot: "Lunch", items: "2 roti + brown rice, dal, 120 g paneer or chicken, mixed sabzi, curd" },
        { slot: "Evening", items: "Sprouts chaat or roasted chana with fruit" },
        { slot: "Dinner", items: "Khichdi or roti with rajma/fish, salad, 1 tsp ghee" },
      ],
    },
  };
}

export const longDistanceRunning: ActivityModule = {
  slug: "long-distance-running",
  name: "Long Distance Running",
  description:
    "Endurance running form correction: posture, cadence, foot strike, knee drive, arm carriage, pelvic stability and vertical oscillation.",
  filmingTips: [
    "Film from the side (sagittal view) so the whole body stays in frame.",
    "Capture at least 8-10 seconds of steady running, not the start or stop.",
    "Keep the camera still - a tripod or a phone propped on a bag works well.",
    "Even lighting. Avoid filming into the sun.",
    "Fitted clothing improves joint detection accuracy.",
  ],
  analyse,
  feedback,
};