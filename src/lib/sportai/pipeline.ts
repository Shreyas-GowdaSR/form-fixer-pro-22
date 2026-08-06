import type {
  AnalysisResult,
  AthleteContext,
  FrameSample,
  Joint,
  Phase1Output,
} from "./contracts";
import { CRITICAL_JOINTS, LANDMARK_FALLBACK, mean, round } from "./pipeline-utils";
import { getPoseLandmarker } from "./pose-detector";
import { getActivity } from "./registry";
import "./activities";

export interface PipelineProgress {
  phase: 1 | 2 | 3;
  label: string;
  /** 0..1 */
  progress: number;
}

export interface RunPipelineOptions {
  file: File;
  activitySlug: string;
  athlete: AthleteContext;
  /** target sampling rate for pose inference */
  targetFps?: number;
  onProgress?: (p: PipelineProgress) => void;
}

function loadVideo(file: File): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadedmetadata = () => resolve({ video, url });
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This video format could not be read. Try an MP4 (H.264) clip."));
    };
  });
}

function seek(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.02));
  });
}

/**
 * Phase 1 -> Phase 2 -> Phase 3, exactly as in the SportAI+ architecture.
 * Everything runs on-device; only the resulting report is persisted.
 */
export async function runPipeline(options: RunPipelineOptions): Promise<AnalysisResult> {
  const { file, activitySlug, athlete, targetFps = 12, onProgress } = options;
  const module = getActivity(activitySlug);
  if (!module) {
    throw new Error("This activity is not available yet. Long distance running is live today.");
  }

  onProgress?.({ phase: 1, label: "Loading pose model", progress: 0.02 });
  const landmarker = await getPoseLandmarker();
  const { video, url } = await loadVideo(file);

  try {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (!duration || duration < 1) {
      throw new Error("Clip is too short. Record at least 3 seconds of running.");
    }
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 360;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas is unavailable in this browser.");

    const analysedDuration = Math.min(duration, 20);
    const step = 1 / targetFps;
    const frames: FrameSample[] = [];
    let occludedFrames = 0;
    let frameId = 0;

    for (let t = 0; t < analysedDuration; t += step) {
      await seek(video, t);
      ctx.drawImage(video, 0, 0, width, height);
      const result = landmarker.detectForVideo(canvas, Math.round(t * 1000));
      const landmarks = result.landmarks?.[0];
      const world = result.worldLandmarks?.[0];
      frameId += 1;
      if (!landmarks || landmarks.length < 33) {
        onProgress?.({
          phase: 1,
          label: "Detecting body joints",
          progress: 0.02 + (t / analysedDuration) * 0.6,
        });
        continue;
      }

      const joints: Joint[] = landmarks.map((lm, i) => ({
        x: lm.x,
        y: lm.y,
        // Phase 1 keeps MediaPipe's relative depth; Phase 2 (MotionBERT) refines it to metres.
        z: world?.[i]?.z ?? lm.z ?? 0,
        conf: lm.visibility ?? 0,
      }));

      const occlusionFlags = CRITICAL_JOINTS.filter((i) => (joints[i]?.conf ?? 0) < 0.5);
      if (occlusionFlags.length > 0) occludedFrames += 1;

      frames.push({
        frameId,
        timestampMs: Math.round(t * 1000),
        joints,
        occlusionFlags,
        avgConfidence: round(mean(joints.map((j) => j.conf)), 3),
        angles: {},
      });

      onProgress?.({
        phase: 1,
        label: "Detecting body joints",
        progress: 0.02 + (t / analysedDuration) * 0.6,
      });
    }

    if (frames.length < 8) {
      throw new Error(
        "Not enough of the body was visible to analyse. Film from the side with the full body in frame.",
      );
    }

    const phase1: Phase1Output = {
      sport: activitySlug,
      fps: round(frames.length / analysedDuration, 2),
      durationSec: round(analysedDuration, 2),
      width,
      height,
      frames,
      avgConfidence: round(mean(frames.map((f) => f.avgConfidence)), 3),
      occludedFramePct: round(occludedFrames / Math.max(frameId, 1), 3),
    };

    onProgress?.({ phase: 2, label: "Analysing motion and detecting errors", progress: 0.75 });
    const phase2 = module.analyse(phase1);

    onProgress?.({ phase: 3, label: "Generating coaching feedback", progress: 0.92 });
    const phase3 = module.feedback(phase2, athlete);

    onProgress?.({ phase: 3, label: "Report ready", progress: 1 });
    return { phase1, phase2, phase3 };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    void LANDMARK_FALLBACK;
  }
}