import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listActivityCatalogue } from "@/lib/activities.functions";
import { getProfile } from "@/lib/profile.functions";
import { saveSession } from "@/lib/sessions.functions";
import { runPipeline, type PipelineProgress } from "@/lib/sportai/pipeline";
import type { AnalysisResult } from "@/lib/sportai/contracts";
import { AnalysisReport } from "@/components/sportai/analysis-report";
import { CoachingVideo } from "@/components/sportai/coaching-video";
import { VoiceCoach } from "@/components/sportai/voice-coach";
import { useAuth } from "@/hooks/useAuth";

const searchSchema = z.object({
  activity: z.string().optional(),
});

export const Route = createFileRoute("/analyze")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Analyse running form — SportAI+" },
      {
        name: "description",
        content:
          "Upload a side-on running clip and get cadence, trunk lean, oscillation, MKI score, drills and an annotated coaching video.",
      },
      { property: "og:title", content: "Analyse running form — SportAI+" },
      {
        property: "og:description",
        content: "On-device pose analysis with instant technique feedback and drills.",
      },
    ],
  }),
  component: AnalyzePage,
});

function AnalyzePage() {
  const search = Route.useSearch();
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activity, setActivity] = useState(search.activity ?? "long-distance-running");
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const catalogue = useQuery({
    queryKey: ["activities"],
    queryFn: () => listActivityCatalogue(),
  });

  const fetchProfile = useServerFn(getProfile);
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
    enabled: Boolean(user),
  });

  const persist = useServerFn(saveSession);
  const save = useMutation({
    mutationFn: (analysis: AnalysisResult) => {
      const step = Math.max(1, Math.floor(analysis.phase1.frames.length / 24));
      return persist({
        data: {
          activity_slug: activity,
          video_name: fileName || "clip.mp4",
          duration_sec: analysis.phase1.durationSec,
          fps: analysis.phase1.fps,
          frames_processed: analysis.phase1.frames.length,
          avg_confidence: analysis.phase1.avgConfidence,
          mki_score: analysis.phase2.mki.score,
          grade: analysis.phase2.mki.grade,
          intensity_level: analysis.phase2.intensityLevel,
          metrics: analysis.phase2.metrics,
          errors: analysis.phase2.errors,
          feedback: analysis.phase3,
          keyframes: analysis.phase1.frames
            .filter((_, i) => i % step === 0)
            .slice(0, 40)
            .map((f) => ({
              frame_id: f.frameId,
              timestamp_ms: f.timestampMs,
              avg_confidence: f.avgConfidence,
              joints: f.joints,
              occlusion_flags: f.occlusionFlags,
              angles: f.angles,
            })),
        },
      });
    },
    onSuccess: () => {
      setSaved(true);
      toast.success("Session saved to your dashboard.");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save session."),
  });

  async function onFile(file: File) {
    setError(null);
    setResult(null);
    setSaved(false);
    setFileName(file.name);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));

    try {
      const analysis = await runPipeline({
        file,
        activitySlug: activity,
        athlete: {
          weightKg: profile.data?.weight_kg ?? null,
          heightCm: profile.data?.height_cm ?? null,
          age: profile.data?.age ?? null,
          experienceLevel: profile.data?.experience_level ?? null,
        },
        onProgress: setProgress,
      });
      setResult(analysis);
      if (user) save.mutate(analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setProgress(null);
    }
  }

  const activeOptions = (catalogue.data ?? []).filter((a) => a.is_active);
  const activityName =
    activeOptions.find((a) => a.slug === activity)?.name ?? "Long distance running";
  const busy = progress !== null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <p className="font-display text-sm uppercase tracking-[0.2em] text-primary">Analyse</p>
      <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">Form analysis studio</h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Film 5–15 seconds from the side, full body in frame. Pose detection runs entirely in your
        browser — the video never leaves your device.
      </p>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="font-display text-xl">Upload a clip</CardTitle>
          <CardDescription>MP4 or MOV, landscape, one athlete in frame.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56 space-y-1.5">
              <span className="text-sm text-muted-foreground">Activity</span>
              <Select value={activity} onValueChange={setActivity} disabled={busy}>
                <SelectTrigger>
                  <SelectValue placeholder="Select activity" />
                </SelectTrigger>
                <SelectContent>
                  {(activeOptions.length > 0
                    ? activeOptions
                    : [
                        {
                          slug: "long-distance-running",
                          name: "Long distance running",
                        } as (typeof activeOptions)[number],
                      ]
                  ).map((a) => (
                    <SelectItem key={a.slug} value={a.slug}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
                e.target.value = "";
              }}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
              {busy ? "Analysing…" : "Choose video"}
            </Button>
          </div>

          {progress ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>
                  Phase {progress.phase} · {progress.label}
                </span>
                <span>{Math.round(progress.progress * 100)}%</span>
              </div>
              <Progress value={progress.progress * 100} />
            </div>
          ) : null}

          {error ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}

          {result && !user ? (
            <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Sign in to save this report and track progress over time.
            </p>
          ) : null}
          {saved ? (
            <p className="text-sm text-primary">Saved to your dashboard.</p>
          ) : null}
        </CardContent>
      </Card>

      {result && videoUrl ? (
        <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-3">
            <h2 className="font-display text-2xl font-bold">Coaching video</h2>
            <CoachingVideo videoUrl={videoUrl} result={result} activityName={activityName} />
            <VoiceCoach result={result} activityName={activityName} autoPlay />
          </div>
          <div>
            <h2 className="mb-3 font-display text-2xl font-bold">Performance report</h2>
            <AnalysisReport result={result} />
          </div>
        </div>
      ) : null}
    </main>
  );
}