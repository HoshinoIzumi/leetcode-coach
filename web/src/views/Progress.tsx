import { useEffect, useState } from "react";
import { Activity, api, Progress as ProgressData } from "../api";

export default function Progress() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.progress(), api.activity()])
      .then(([d, a]) => {
        if (cancelled) return;
        setData(d);
        setActivity(a);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!data) return null;

  const pct = data.total ? Math.round((data.solved / data.total) * 100) : 0;

  return (
    <section>
      <div className="stats">
        <div className="stat">
          <div className="value">{data.solved}</div>
          <div className="label">solved of {data.total}</div>
        </div>
        <div className="stat">
          <div className="value">{pct}%</div>
          <div className="label">of {data.roadmap}</div>
        </div>
        <div className="stat">
          <div className="value">{data.streak}</div>
          <div className="label">day streak</div>
        </div>
        <div className="stat">
          <div className={`value${data.due_reviews ? " due-count" : ""}`}>
            {data.due_reviews}
          </div>
          <div className="label">reviews due</div>
        </div>
      </div>

      {activity && <Heatmap activity={activity} />}

      <p className="section-note" style={{ marginTop: "2.25rem" }}>
        By topic
      </p>
      <div className="topics">
        {data.by_topic.map((t, i) => (
          <div
            className="topic-row"
            key={t.topic}
            style={{ animationDelay: `${0.04 * i}s` }}
          >
            <span className="name">{t.topic}</span>
            <div
              className="meter"
              role="progressbar"
              aria-valuenow={t.solved}
              aria-valuemin={0}
              aria-valuemax={t.total}
              aria-label={`${t.topic}: ${t.solved} of ${t.total} solved`}
            >
              <div
                className="fill"
                style={{ width: `${t.total ? (t.solved / t.total) * 100 : 0}%` }}
              />
            </div>
            <span className="count">
              {t.solved}/{t.total}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const WEEKS = 26;

// Local-timezone ISO date; toISOString() would use UTC and shift dates.
function isoLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function Heatmap({ activity }: { activity: Activity }) {
  const counts = new Map(activity.days.map((d) => [d.date, d.count]));

  // Grid of the last 26 weeks, columns = weeks, rows = Mon..Sun.
  const today = new Date();
  const todayIso = isoLocal(today);
  const dow = (today.getDay() + 6) % 7; // Monday = 0
  const startOffset = (6 - dow) - (WEEKS * 7 - 1);

  const weeks: { date: string; count: number; future: boolean }[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const day = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + startOffset + w * 7 + d,
      );
      const iso = isoLocal(day);
      col.push({
        date: iso,
        count: counts.get(iso) ?? 0,
        future: iso > todayIso,
      });
    }
    weeks.push(col);
  }

  return (
    <div>
      <p className="section-note" style={{ marginTop: "2.25rem" }}>
        Last six months
      </p>
      <div className="heatmap" role="img" aria-label="Practice activity for the last six months">
        {weeks.map((col, w) => (
          <div className="heatmap-col" key={w}>
            {col.map((cell) => (
              <div
                key={cell.date}
                className={`heatmap-cell level-${cell.future ? "future" : level(cell.count)}`}
                title={`${cell.date} · ${cell.count} ${cell.count === 1 ? "session" : "sessions"}`}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function level(count: number): number {
  if (count === 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}
