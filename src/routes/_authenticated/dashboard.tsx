import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getProfile, upsertProfile } from "@/lib/profile.functions";
import { deleteSession, listSessions } from "@/lib/sessions.functions";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Athlete dashboard — SportAI+" },
      {
        name: "description",
        content:
          "Review saved running-form sessions, MKI score history and keep your athlete profile up to date.",
      },
      { property: "og:title", content: "Athlete dashboard — SportAI+" },
      {
        property: "og:description",
        content: "Your saved form analyses and athlete profile in one place.",
      },
    ],
  }),
  component: DashboardPage,
});

type ErrorSummary = { label: string; severity: string };

function DashboardPage() {
  const queryClient = useQueryClient();
  const fetchSessions = useServerFn(listSessions);
  const fetchProfile = useServerFn(getProfile);
  const saveProfile = useServerFn(upsertProfile);
  const removeSession = useServerFn(deleteSession);

  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => fetchSessions() });
  const profile = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });

  const [form, setForm] = useState({
    full_name: "",
    age: "",
    height_cm: "",
    weight_kg: "",
    experience_level: "beginner",
    weekly_training_days: "3",
  });

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    setForm({
      full_name: p.full_name ?? "",
      age: p.age?.toString() ?? "",
      height_cm: p.height_cm?.toString() ?? "",
      weight_kg: p.weight_kg?.toString() ?? "",
      experience_level: p.experience_level ?? "beginner",
      weekly_training_days: p.weekly_training_days?.toString() ?? "3",
    });
  }, [profile.data]);

  const profileMutation = useMutation({
    mutationFn: () =>
      saveProfile({
        data: {
          full_name: form.full_name || null,
          age: form.age ? Number(form.age) : null,
          height_cm: form.height_cm ? Number(form.height_cm) : null,
          weight_kg: form.weight_kg ? Number(form.weight_kg) : null,
          experience_level: form.experience_level as "beginner" | "intermediate" | "advanced",
          weekly_training_days: Number(form.weekly_training_days || 0),
        },
      }),
    onSuccess: () => {
      toast.success("Profile updated.");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save profile."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeSession({ data: { id } }),
    onSuccess: () => {
      toast.success("Session deleted.");
      void queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const rows = sessions.data ?? [];
  const best = rows.reduce((acc, r) => Math.max(acc, Number(r.mki_score ?? 0)), 0);
  const avg =
    rows.length > 0
      ? Math.round(rows.reduce((a, r) => a + Number(r.mki_score ?? 0), 0) / rows.length)
      : 0;

  return (
    <main className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="font-display text-4xl font-bold tracking-tight">Athlete dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Your saved analyses and the profile used to personalise drills and nutrition.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Sessions", value: rows.length },
          { label: "Best MKI", value: best },
          { label: "Average MKI", value: avg },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6 text-center">
              <p className="font-display text-3xl font-bold text-primary">{s.value}</p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <section>
          <h2 className="font-display text-2xl font-bold">Session history</h2>
          {sessions.isLoading ? (
            <p className="mt-3 text-sm text-muted-foreground">Loading sessions…</p>
          ) : rows.length === 0 ? (
            <Card className="mt-3">
              <CardContent className="pt-6">
                <p className="text-sm text-muted-foreground">
                  No sessions yet. Analyse a clip to build your history.
                </p>
                <Button className="mt-4" size="sm" asChild>
                  <Link to="/analyze">Analyse a clip</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <ul className="mt-3 space-y-3">
              {rows.map((s) => {
                const errs = (Array.isArray(s.errors) ? s.errors : []) as ErrorSummary[];
                return (
                  <li key={s.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{s.video_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(s.created_at as string).toLocaleString()} ·{" "}
                          {s.activity_slug.replace(/-/g, " ")} · {s.frames_processed} frames
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-display text-2xl font-bold text-primary">
                          {s.mki_score}
                        </span>
                        <Badge variant="secondary">{s.grade}</Badge>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete session"
                          onClick={() => deleteMutation.mutate(s.id as string)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    {errs.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {errs.slice(0, 4).map((e, i) => (
                          <Badge key={`${s.id}-${i}`} variant="outline" className="text-xs">
                            {e.label}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-display text-2xl font-bold">Athlete profile</h2>
          <Card className="mt-3">
            <CardHeader>
              <CardTitle className="text-base">Personalisation inputs</CardTitle>
              <CardDescription>Used for nutrition targets and drill dosage.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="age">Age</Label>
                  <Input
                    id="age"
                    inputMode="numeric"
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="height">Height cm</Label>
                  <Input
                    id="height"
                    inputMode="numeric"
                    value={form.height_cm}
                    onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="weight">Weight kg</Label>
                  <Input
                    id="weight"
                    inputMode="numeric"
                    value={form.weight_kg}
                    onChange={(e) => setForm({ ...form, weight_kg: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Experience</Label>
                <Select
                  value={form.experience_level}
                  onValueChange={(v) => setForm({ ...form, experience_level: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="days">Training days / week</Label>
                <Input
                  id="days"
                  inputMode="numeric"
                  value={form.weekly_training_days}
                  onChange={(e) => setForm({ ...form, weekly_training_days: e.target.value })}
                />
              </div>
              <Button
                className="w-full"
                onClick={() => profileMutation.mutate()}
                disabled={profileMutation.isPending}
              >
                Save profile
              </Button>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}