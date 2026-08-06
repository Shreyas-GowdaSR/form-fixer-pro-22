import { AlertTriangle, Apple, Dumbbell, Target } from "lucide-react";
import type { AnalysisResult } from "@/lib/sportai/contracts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MkiGauge } from "./mki-gauge";

const statusTone: Record<string, string> = {
  good: "text-primary",
  warn: "text-accent",
  bad: "text-destructive",
};

export function AnalysisReport({ result }: { result: AnalysisResult }) {
  const { phase1, phase2, phase3 } = result;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-xl">Movement Kinematic Intelligence</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <MkiGauge mki={phase2.mki} />
          <p className="text-sm text-muted-foreground">{phase3.summary}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge variant="secondary">Intensity: {phase2.intensityLevel}</Badge>
            <Badge variant="secondary">
              Fused confidence: {Math.round(phase2.fusedConfidence * 100)}%
            </Badge>
            <Badge variant="secondary">{phase1.frames.length} frames analysed</Badge>
            <Badge variant="secondary">
              Occlusion: {Math.round(phase1.occludedFramePct * 100)}%
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <Target className="size-5 text-primary" /> Kinematic metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {phase2.metrics.map((m) => {
            const span = Math.max(m.max - m.min, 0.0001);
            const pos = Math.max(0, Math.min(100, ((m.value - m.min) / span) * 100));
            const idealPos = Math.max(0, Math.min(100, ((m.ideal - m.min) / span) * 100));
            return (
              <div key={m.key} className="rounded-lg border border-border p-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">{m.label}</span>
                  <span className={`font-display text-lg font-bold ${statusTone[m.status]}`}>
                    {m.value}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">{m.unit}</span>
                  </span>
                </div>
                <div className="relative mt-3 h-1.5 rounded-full bg-muted">
                  <div
                    className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary"
                    style={{ left: `${pos}%` }}
                  />
                  <div
                    className="absolute top-0 h-1.5 w-0.5 bg-foreground/50"
                    style={{ left: `${idealPos}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{m.note}</p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <AlertTriangle className="size-5 text-accent" /> Detected faults
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {phase2.errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No significant technique faults detected in this clip. Keep the same rhythm.
            </p>
          ) : (
            phase2.errors.map((e) => (
              <div key={e.code} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{e.label}</span>
                  <Badge
                    variant={e.severity === "high" ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {e.severity}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(e.framePct * 100)}% of strides
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{e.evidence}</p>
                <p className="mt-1 text-sm text-primary">Cue: {e.cue}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <Dumbbell className="size-5 text-primary" /> Corrective drills
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {phase3.drills.map((d) => (
            <div key={d.title} className="rounded-lg border border-border p-3">
              <p className="font-medium">{d.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{d.detail}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-primary">{d.dosage}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-xl">
            <Apple className="size-5 text-accent" /> Nutrition guidance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {[
              { label: "kcal", value: phase3.nutrition.calories },
              { label: "protein g", value: phase3.nutrition.protein_g },
              { label: "carbs g", value: phase3.nutrition.carbs_g },
              { label: "fat g", value: phase3.nutrition.fat_g },
              { label: "water L", value: phase3.nutrition.hydration_l },
            ].map((n) => (
              <div key={n.label} className="rounded-lg border border-border p-3 text-center">
                <p className="font-display text-xl font-bold text-foreground">{n.value}</p>
                <p className="text-xs text-muted-foreground">{n.label}</p>
              </div>
            ))}
          </div>
          <ul className="space-y-2">
            {phase3.nutrition.meals.map((meal) => (
              <li key={meal.slot} className="text-sm">
                <span className="font-medium">{meal.slot}: </span>
                <span className="text-muted-foreground">{meal.items}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}