import { useEffect, useState } from "react";
import {
  api,
  leetcodeUrl,
  outcomeLabel,
  ProblemDetail,
  ProblemSummary,
} from "../api";

export default function Problems() {
  const [problems, setProblems] = useState<ProblemSummary[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .problems()
      .then((r) => {
        if (!cancelled) setProblems(r.problems);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <div className="error">{error}</div>;
  if (!problems) return null;

  if (selected) {
    return <Detail title={selected} onBack={() => setSelected(null)} />;
  }

  const topics: { name: string; items: ProblemSummary[] }[] = [];
  for (const p of problems) {
    const last = topics[topics.length - 1];
    if (last && last.name === p.topic) last.items.push(p);
    else topics.push({ name: p.topic, items: [p] });
  }

  return (
    <section>
      {topics.map((t, i) => (
        <div
          className="topic-group"
          key={t.name}
          style={{ animationDelay: `${0.03 * i}s` }}
        >
          <h3>
            {t.name}
            <span className="count">
              {t.items.filter((p) => p.status === "solved").length}/
              {t.items.length}
            </span>
          </h3>
          <ul className="problem-rows">
            {t.items.map((p) => (
              <li className="problem-row" key={p.title}>
                <button onClick={() => setSelected(p.title)}>
                  <span className={`status-dot ${p.status}`} aria-hidden />
                  <span className="title">{p.title}</span>
                  <span className="meta">
                    {p.due && <span className="due-badge">due</span>}
                    {p.attempts > 0 && <span>×{p.attempts}</span>}
                    <span className={`diff-${p.difficulty.toLowerCase()}`}>
                      {p.difficulty}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function Detail({ title, onBack }: { title: string; onBack: () => void }) {
  const [detail, setDetail] = useState<ProblemDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .problem(title)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [title]);

  return (
    <section className="detail">
      <button className="back" onClick={onBack}>
        ← All problems
      </button>
      {error && <div className="error">{error}</div>}
      {detail && (
        <>
          <h2>{detail.title}</h2>
          <p className="sub">
            {detail.topic} ·{" "}
            <span className={`diff-${detail.difficulty.toLowerCase()}`}>
              {detail.difficulty}
            </span>
            {detail.next_review && <> · next review {detail.next_review}</>}
            {detail.due && (
              <>
                {" "}
                · <span className="due-badge">due now</span>
              </>
            )}
          </p>
          <a
            className="open-link"
            href={leetcodeUrl(detail.title)}
            target="_blank"
            rel="noreferrer"
          >
            Open on LeetCode ↗
          </a>

          <div className="history">
            {detail.attempts.length === 0 ? (
              <p className="empty" style={{ padding: "1.25rem 0" }}>
                No attempts yet — it'll show up in a plan when you're ready for
                it.
              </p>
            ) : (
              [...detail.attempts].reverse().map((a, i) => (
                <div className="attempt" key={`${a.date}-${i}`}>
                  <span className="date">{a.date}</span>
                  <div>
                    <div className="outcome">{outcomeLabel(a.outcome)}</div>
                    {a.notes && <p className="notes">{a.notes}</p>}
                    <p className="flags">
                      {[
                        a.minutes ? `${a.minutes} min` : null,
                        a.used_hint ? "hint" : null,
                        a.viewed_solution ? "solution" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
}
