import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { AnalysisResult } from "@/lib/sportai/contracts";
import { drawOverlay, frameAtTime } from "@/lib/sportai/overlay";

interface CoachingVideoProps {
  videoUrl: string;
  result: AnalysisResult;
  activityName: string;
}

/** Phase 3 output: annotated coaching video, played in-browser and exportable as WebM. */
export function CoachingVideo({ videoUrl, result, activityName }: CoachingVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showAngles, setShowAngles] = useState(true);
  const [showCues, setShowCues] = useState(true);
  const [exporting, setExporting] = useState(false);

  const render = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const frame = frameAtTime(result.phase1.frames, video.currentTime);
    if (frame) {
      drawOverlay(ctx, video, {
        frame,
        errors: result.phase2.errors,
        mki: result.phase2.mki,
        activityName,
        showSkeleton,
        showAngles,
        showCues,
      });
    }
  }, [result, activityName, showSkeleton, showAngles, showCues]);

  useEffect(() => {
    const loop = () => {
      render();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [render]);

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  async function exportWebm() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || exporting) return;
    if (typeof MediaRecorder === "undefined") return;

    setExporting(true);
    const stream = canvas.captureStream(30);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    const finished = new Promise<void>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: "video/webm" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `sportai-coaching-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        resolve();
      };
    });

    video.pause();
    video.currentTime = 0;
    recorder.start();
    await video.play();
    setPlaying(true);

    await new Promise<void>((resolve) => {
      const onEnd = () => {
        video.removeEventListener("ended", onEnd);
        resolve();
      };
      video.addEventListener("ended", onEnd);
    });

    recorder.stop();
    await finished;
    setPlaying(false);
    setExporting(false);
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <canvas
          ref={canvasRef}
          width={result.phase1.width}
          height={result.phase1.height}
          className="block w-full"
        />
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          playsInline
          className="hidden"
          onEnded={() => setPlaying(false)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <Button size="sm" onClick={toggle}>
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          {playing ? "Pause" : "Play coaching video"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void exportWebm()} disabled={exporting}>
          <Download className="size-4" />
          {exporting ? "Recording…" : "Download WebM"}
        </Button>

        <div className="flex items-center gap-2">
          <Switch id="skeleton" checked={showSkeleton} onCheckedChange={setShowSkeleton} />
          <Label htmlFor="skeleton" className="text-xs">
            Skeleton
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="angles" checked={showAngles} onCheckedChange={setShowAngles} />
          <Label htmlFor="angles" className="text-xs">
            Angles
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="cues" checked={showCues} onCheckedChange={setShowCues} />
          <Label htmlFor="cues" className="text-xs">
            Fault cues
          </Label>
        </div>
      </div>
    </div>
  );
}