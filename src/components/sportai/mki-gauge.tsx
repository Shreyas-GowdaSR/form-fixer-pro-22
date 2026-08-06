import type { MkiResult } from "@/lib/sportai/contracts";

export function MkiGauge({ mki }: { mki: MkiResult }) {
  const pct = Math.max(0, Math.min(100, mki.score));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const dash = (pct / 100) * circumference;
  const tone = pct >= 75 ? "text-primary" : pct >= 55 ? "text-accent" : "text-destructive";

  return (
    <div className="flex items-center gap-5">
      <div className="relative size-32 shrink-0">
        <svg viewBox="0 0 128 128" className="size-32 -rotate-90">
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            strokeWidth="10"
            className="stroke-muted"
          />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            className={`${tone} stroke-current`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`font-display text-4xl font-bold leading-none ${tone}`}>
            {mki.score}
          </span>
          <span className="text-xs text-muted-foreground">MKI · {mki.grade}</span>
        </div>
      </div>

      <ul className="flex-1 space-y-2">
        {mki.components.map((c) => (
          <li key={c.key}>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-foreground">{c.label}</span>
              <span className="text-muted-foreground">
                {c.score} · w{Math.round(c.weight * 100)}%
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}