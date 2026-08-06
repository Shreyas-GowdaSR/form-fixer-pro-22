import type { DetectedError, FrameSample, MkiResult } from "./contracts";
import { LM, POSE_CONNECTIONS } from "./geometry";

const COLORS = {
  good: "#a6f04b",
  warn: "#f5b942",
  bad: "#ff5a4d",
  bone: "#a6f04b",
  boneLow: "#6b7a86",
  panel: "rgba(14, 19, 26, 0.78)",
  text: "#f2f6f4",
  muted: "#9fb0ba",
};

export interface OverlayOptions {
  frame: FrameSample;
  errors: DetectedError[];
  mki: MkiResult;
  activityName: string;
  showSkeleton: boolean;
  showAngles: boolean;
  showCues: boolean;
}

/** Draws the annotated coaching frame: skeleton, joint angles, error labels, MKI badge. */
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  options: OverlayOptions,
): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(video, 0, 0, width, height);

  const { frame, errors, mki, showSkeleton, showAngles, showCues, activityName } = options;
  const px = (i: number) => {
    const j = frame.joints[i];
    return j ? { x: j.x * width, y: j.y * height, conf: j.conf } : null;
  };

  if (showSkeleton) {
    ctx.lineWidth = Math.max(2, width / 320);
    for (const [a, b] of POSE_CONNECTIONS) {
      const p1 = px(a);
      const p2 = px(b);
      if (!p1 || !p2) continue;
      const low = p1.conf < 0.5 || p2.conf < 0.5;
      ctx.strokeStyle = low ? COLORS.boneLow : COLORS.bone;
      ctx.globalAlpha = low ? 0.45 : 0.95;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < frame.joints.length; i++) {
      const p = px(i);
      if (!p) continue;
      const occluded = frame.occlusionFlags.includes(i);
      ctx.fillStyle = occluded ? COLORS.bad : "#ffffff";
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(2, width / 420), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const fontBase = Math.max(11, Math.round(width / 46));

  if (showAngles) {
    ctx.font = `600 ${fontBase}px "Barlow Condensed", sans-serif`;
    const labels: { at: number; text: string }[] = [
      { at: LM.rightShoulder, text: `trunk ${frame.angles["trunk_lean"] ?? 0}\u00B0` },
      { at: LM.rightKnee, text: `knee ${frame.angles["knee_flex"] ?? 0}\u00B0` },
      { at: LM.rightElbow, text: `elbow ${frame.angles["elbow"] ?? 0}\u00B0` },
    ];
    for (const l of labels) {
      const p = px(l.at);
      if (!p) continue;
      ctx.fillStyle = COLORS.panel;
      const w = ctx.measureText(l.text).width + 10;
      ctx.fillRect(p.x + 8, p.y - fontBase, w, fontBase + 6);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(l.text, p.x + 13, p.y + 2);
    }
  }

  // MKI badge
  const badgeW = Math.max(120, width * 0.24);
  const badgeH = fontBase * 3.4;
  ctx.fillStyle = COLORS.panel;
  ctx.fillRect(12, 12, badgeW, badgeH);
  ctx.fillStyle = COLORS.muted;
  ctx.font = `600 ${fontBase * 0.75}px "Barlow Condensed", sans-serif`;
  ctx.fillText(`MKI SCORE  ${activityName.toUpperCase()}`, 22, 12 + fontBase);
  ctx.fillStyle =
    mki.score >= 75 ? COLORS.good : mki.score >= 55 ? COLORS.warn : COLORS.bad;
  ctx.font = `700 ${fontBase * 1.9}px "Barlow Condensed", sans-serif`;
  ctx.fillText(`${mki.score}`, 22, 12 + badgeH - fontBase * 0.5);
  ctx.fillStyle = COLORS.text;
  ctx.font = `600 ${fontBase}px "Barlow Condensed", sans-serif`;
  ctx.fillText(`/100  ${mki.grade}`, 22 + fontBase * 2.4, 12 + badgeH - fontBase * 0.7);

  if (showCues && errors.length > 0) {
    const shown = errors.slice(0, 3);
    ctx.font = `600 ${fontBase * 0.9}px "Barlow", sans-serif`;
    const lineH = fontBase * 1.7;
    const boxH = lineH * shown.length + 10;
    ctx.fillStyle = COLORS.panel;
    ctx.fillRect(12, height - boxH - 12, width - 24, boxH);
    shown.forEach((e, i) => {
      const y = height - boxH - 12 + lineH * (i + 1) - 4;
      ctx.fillStyle =
        e.severity === "high" ? COLORS.bad : e.severity === "medium" ? COLORS.warn : COLORS.good;
      ctx.fillRect(20, y - fontBase * 0.8, 4, fontBase);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(`${e.label}`, 32, y);
      ctx.fillStyle = COLORS.muted;
      const labelW = ctx.measureText(`${e.label}`).width;
      ctx.fillText(`  -  ${e.cue}`, 32 + labelW, y);
    });
  }
}

/** Picks the frame closest to a given media time. */
export function frameAtTime(frames: FrameSample[], timeSec: number): FrameSample | null {
  if (frames.length === 0) return null;
  const ms = timeSec * 1000;
  let best = frames[0]!;
  let bestDiff = Math.abs(best.timestampMs - ms);
  for (const f of frames) {
    const d = Math.abs(f.timestampMs - ms);
    if (d < bestDiff) {
      best = f;
      bestDiff = d;
    }
  }
  return best;
}