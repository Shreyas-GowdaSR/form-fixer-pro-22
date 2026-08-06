import type { AnalysisResult, MetricResult } from "./contracts";

/** Human phrasing for each metric, with direction-aware corrections. */
const METRIC_COACHING: Record<
  string,
  { plain: string; tooHigh: (d: number) => string; tooLow: (d: number) => string }
> = {
  knee_drive_deg: {
    plain: "how high you lift your knee",
    tooHigh: (d) => `you are lifting your knee about ${d} degrees too high, so relax the lift a little`,
    tooLow: (d) => `lift your knee about ${d} degrees higher — think of driving the thigh up, not reaching forward`,
  },
  cadence_spm: {
    plain: "your step rate",
    tooHigh: (d) => `your steps are about ${d} per minute too quick, so lengthen them slightly`,
    tooLow: (d) => `take about ${d} more steps every minute — quicker, lighter feet`,
  },
  trunk_lean_deg: {
    plain: "how much you lean forward",
    tooHigh: (d) => `you are leaning about ${d} degrees too far forward, so stand taller from the hips`,
    tooLow: (d) => `lean forward about ${d} degrees more from the ankles so your chest leads`,
  },
  vertical_oscillation_pct: {
    plain: "how much you bounce up and down",
    tooHigh: (d) => `you are bouncing about ${d} percent more than needed — push forward, not upward`,
    tooLow: () => `your bounce is already low, keep it there`,
  },
  overstride_pct: {
    plain: "where your foot lands",
    tooHigh: (d) => `your foot is landing about ${d} percent too far in front of your hips, so land it closer underneath you`,
    tooLow: () => `your foot is landing nicely under your body`,
  },
  elbow_angle_deg: {
    plain: "your arm bend",
    tooHigh: (d) => `bend your elbows about ${d} degrees more, close to a right angle`,
    tooLow: (d) => `open your elbows about ${d} degrees, they are a bit too tight`,
  },
  head_alignment_deg: {
    plain: "your head position",
    tooHigh: (d) => `your head is dropping about ${d} degrees — look about twenty metres ahead`,
    tooLow: () => `your head is in a good, tall position`,
  },
  hip_drop_deg: {
    plain: "how level your hips stay",
    tooHigh: (d) => `one hip is dropping about ${d} degrees too much, so keep your hips level as you land`,
    tooLow: () => `your hips are staying level`,
  },
};

function correction(m: MetricResult): string | null {
  const c = METRIC_COACHING[m.key];
  if (!c || m.status === "good") return null;
  const delta = Math.round(Math.abs(m.value - m.ideal));
  if (delta <= 0) return null;
  const text = m.value > m.ideal ? c.tooHigh(delta) : c.tooLow(delta);
  return `${capitalise(c.plain)}: you are at ${Math.round(m.value)} ${spoken(m.unit)} and the target is about ${Math.round(m.ideal)}. So ${text}.`;
}

function spoken(unit: string) {
  if (unit === "deg") return "degrees";
  if (unit === "spm") return "steps per minute";
  if (unit === "%") return "percent";
  return unit;
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Deterministic, plain-language coaching script. Used directly, and as the brief for the AI rewrite. */
export function buildVoiceScript(result: AnalysisResult, activityName: string): string[] {
  const { phase2 } = result;
  const lines: string[] = [];

  lines.push(
    `Here is your ${activityName.toLowerCase()} form check. Your overall movement score is ${Math.round(
      phase2.mki.score,
    )} out of 100, grade ${phase2.mki.grade}.`,
  );

  const faults = phase2.errors.slice(0, 4);
  if (faults.length === 0) {
    lines.push("Good news — I did not spot any big technique mistakes in this clip. Keep the same rhythm.");
  } else {
    lines.push(`I spotted ${faults.length} thing${faults.length > 1 ? "s" : ""} to fix. Let's go one by one.`);
    faults.forEach((f, i) => {
      const related = phase2.metrics.find((m) => correction(m) && f.evidence.includes(String(Math.round(m.value))));
      const fix = related ? correction(related) : null;
      lines.push(
        `${i + 1}. ${f.label}. ${fix ?? f.evidence} What to do: ${f.cue}`,
      );
    });
  }

  const extras = phase2.metrics
    .map(correction)
    .filter((x): x is string => Boolean(x))
    .slice(0, 4);
  if (extras.length) {
    lines.push("Numbers to aim for next run:");
    lines.push(...extras);
  }

  const drills = result.phase3.drills.slice(0, 2);
  if (drills.length) {
    lines.push(
      `Practise ${drills.map((d) => `${d.title}, ${d.dosage}`).join(" and ")}. Film yourself again after a week and we will compare.`,
    );
  }

  return lines;
}
