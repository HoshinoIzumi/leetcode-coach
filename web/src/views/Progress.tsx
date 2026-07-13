import { useEffect, useState } from "react";
import { api, Progress as ProgressData } from "../api";

export default function Progress() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .progress()
      .then((d) => {
        if (!cancelled) setData(d);
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
          <div className={`value${data.due_reviews ? " due-count" : ""}`}>
            {data.due_reviews}
          </div>
          <div className="label">reviews due</div>
        </div>
      </div>

      <p className="section-note">By topic</p>
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
