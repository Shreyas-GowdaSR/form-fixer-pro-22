import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Megaphone, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AnalysisResult } from "@/lib/sportai/contracts";
import { buildVoiceScript } from "@/lib/sportai/voice-script";
import { speak, type VoicePlayback } from "@/lib/sportai/voice-playback";
import { simplifyVoiceScript } from "@/lib/voice-coach.functions";

export function VoiceCoach({
  result,
  activityName,
  autoPlay = false,
}: {
  result: AnalysisResult;
  activityName: string;
  autoPlay?: boolean;
}) {
  const simplify = useServerFn(simplifyVoiceScript);
  const [script, setScript] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const playback = useRef<VoicePlayback | null>(null);
  const started = useRef(false);

  useEffect(() => {
    return () => playback.current?.stop();
  }, []);

  const run = useMutation({
    mutationFn: async () => {
      const lines = buildVoiceScript(result, activityName);
      const { script: text } = await simplify({ data: { activityName, lines } });
      setScript(text);
      playback.current?.stop();
      const handle = await speak(text);
      playback.current = handle;
      setSpeaking(true);
      await handle.done;
      setSpeaking(false);
    },
    onError: (e) => {
      setSpeaking(false);
      toast.error(e instanceof Error ? e.message : "Voice feedback failed.");
    },
  });

  useEffect(() => {
    if (autoPlay && !started.current) {
      started.current = true;
      run.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay]);

  const stop = () => {
    playback.current?.stop();
    playback.current = null;
    setSpeaking(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-display text-xl">
          <Megaphone className="size-5 text-accent" /> Voice coach
        </CardTitle>
        <CardDescription>
          Hear your mistakes explained in plain language, with exactly how much to change.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={() => run.mutate()} disabled={run.isPending && !speaking}>
            {run.isPending && !speaking ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            {speaking ? "Replay" : run.isPending ? "Preparing…" : "Play feedback"}
          </Button>
          {speaking ? (
            <Button variant="secondary" onClick={stop}>
              <Square className="size-4" /> Stop
            </Button>
          ) : null}
        </div>
        {script ? (
          <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
            {script}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
