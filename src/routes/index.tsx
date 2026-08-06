import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import heroRunner from "@/assets/hero-runner.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SportAI+ — AI running form correction" },
      {
        name: "description",
        content:
          "Upload a side-on running clip. SportAI+ detects 33 joints on-device, scores your technique with MKI and returns cues, drills and nutrition.",
      },
      { property: "og:title", content: "SportAI+ — AI running form correction" },
      {
        property: "og:description",
        content: "On-device pose analysis, MKI scoring and coaching feedback for runners.",
      },
    ],
  }),
  component: Index,
});

const phases = [
  {
    tag: "Phase 1",
    title: "Pose detection",
    body: "MediaPipe BlazePose tracks 33 joints per frame with confidence and occlusion flags — entirely in your browser.",
  },
  {
    tag: "Phase 2",
    title: "Motion analysis",
    body: "Spatial-temporal analysis extracts cadence, trunk lean, vertical oscillation and stride faults, then fuses them into an MKI score.",
  },
  {
    tag: "Phase 3",
    title: "Coaching feedback",
    body: "Fault-driven cues, corrective drills and a nutrition plan, plus an annotated coaching video you can download.",
  },
];

function Index() {
  return (
    <main>
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={heroRunner}
          alt="Runner on a floodlit track with a pose-estimation skeleton overlay"
          width={1600}
          height={1008}
          className="absolute inset-0 size-full object-cover opacity-45"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
        <div className="relative mx-auto max-w-6xl px-4 py-24">
          <p className="font-display text-sm uppercase tracking-[0.25em] text-primary">
            SportAI+ · long distance running
          </p>
          <h1 className="mt-4 max-w-2xl font-display text-5xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Fix your running form with frame-by-frame AI coaching
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            One side-on clip is enough. Get cadence, lean, oscillation and stride faults, an MKI
            technique score, and drills that target exactly what went wrong.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link to="/analyze">Analyse my run</Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/activities">See all sports</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20">
        <h2 className="font-display text-3xl font-bold tracking-tight">The pipeline</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {phases.map((p) => (
            <article key={p.tag} className="rounded-xl border border-border bg-card p-6">
              <p className="font-display text-xs uppercase tracking-[0.2em] text-primary">
                {p.tag}
              </p>
              <h3 className="mt-2 font-display text-xl font-bold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
