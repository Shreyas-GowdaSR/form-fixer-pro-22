import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock } from "lucide-react";
import { listActivityCatalogue } from "@/lib/activities.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const activitiesQuery = queryOptions({
  queryKey: ["activities"],
  queryFn: () => listActivityCatalogue(),
});

export const Route = createFileRoute("/activities")({
  loader: ({ context }) => context.queryClient.ensureQueryData(activitiesQuery),
  head: () => ({
    meta: [
      { title: "Sports catalogue — SportAI+ form analysis" },
      {
        name: "description",
        content:
          "Long distance running form analysis is live. Sprint, shot put, discus and more plug into the same SportAI+ pipeline.",
      },
      { property: "og:title", content: "Sports catalogue — SportAI+" },
      {
        property: "og:description",
        content: "One pluggable motion-analysis pipeline, many track and field events.",
      },
    ],
  }),
  component: ActivitiesPage,
  errorComponent: () => (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="font-display text-2xl font-bold">Catalogue unavailable</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        We could not load the sports list. Refresh to try again.
      </p>
    </main>
  ),
});

function ActivitiesPage() {
  const { data: activities } = useSuspenseQuery(activitiesQuery);

  return (
    <main className="mx-auto max-w-5xl px-4 py-14">
      <p className="font-display text-sm uppercase tracking-[0.2em] text-primary">Catalogue</p>
      <h1 className="mt-2 font-display text-4xl font-bold tracking-tight">
        One pipeline, every event
      </h1>
      <p className="mt-3 max-w-2xl text-muted-foreground">
        Each sport is an independent analysis module registered against the shared Phase 1 pose
        contract, so new events drop in without touching the detection or feedback layers.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {activities.map((activity) => (
          <Card key={activity.slug} className={activity.is_active ? "border-primary/40" : ""}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <Badge variant={activity.is_active ? "default" : "secondary"}>
                  {activity.is_active ? (
                    <CheckCircle2 className="mr-1 size-3" />
                  ) : (
                    <Clock className="mr-1 size-3" />
                  )}
                  {activity.is_active ? "Live" : "Coming soon"}
                </Badge>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {activity.category}
                </span>
              </div>
              <CardTitle className="mt-3 font-display text-xl">{activity.name}</CardTitle>
              <CardDescription>{activity.description}</CardDescription>
            </CardHeader>
            <CardContent>
              {activity.is_active ? (
                <Button size="sm" asChild>
                  <Link to="/analyze" search={{ activity: activity.slug }}>
                    Analyse a clip
                  </Link>
                </Button>
              ) : (
                <Button size="sm" variant="outline" disabled>
                  Module pending
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}