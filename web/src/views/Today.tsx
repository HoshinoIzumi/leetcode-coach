import { useEffect, useState } from "react";
import {
  api,
  AttemptResult,
  FeedbackResult,
  leetcodeUrl,
  outcomeLabel,
  Plan,
  PlanItem,
} from "../api";

const PRESETS = [20, 30, 45, 60, 90];

const NEW_OUTCOMES = ["solved_independently", "solved_with_hints", "viewed_solution", "gave_up"];
const REVIEW_OUTCOMES = ["reviewed_easily", "struggled", "viewed_solution"];

export default function Today() {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [minutes, setMinutes] = useState<number | null>(45);
  const [custom, setCustom] = useState("");
  const [planning, setPlanning] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .cachedPlan()
      .then((r) => {
        if (!cancelled) setPlan(r.plan);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveMinutes = custom ? parseInt(custom, 10) || 0 : (minutes ?? 0);

  const makePlan = async () => {
    if (effectiveMinutes <= 0) return;
    setPlanning(true);
    setError("");
    try {
      const r = await api.plan(effectiveMinutes);
      setPlan(r.plan);
      setAsking(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPlanning(false);
    }
  };

  if (!loaded) return null;

  if (planning) {
    return (
      <div className="thinking">
        <span className="dot" />
        Your coach is thinking about the best {effectiveMinutes} minutes today…
      </div>
    );
  }

  if (!plan || asking) {
    return (
      <section className="ask">
        <h2>How much time do you have today?</h2>
        <p>That's all the coach needs — it already knows the rest.</p>
        {error && <div className="error">{error}</div>}
        <div className="time-chips" role="group" aria-label="Available time">
          {PRESETS.map((m) => (
            <button
              key={m}
              className={!custom && minutes === m ? "selected" : ""}
              onClick={() => {
                setMinutes(m);
                setCustom("");
              }}
            >
              {m} min
            </button>
          ))}
          <input
            className="time-custom"
            type="number"
            min={1}
            placeholder="custom"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            aria-label="Custom minutes"
          />
        </div>
        <button className="go" onClick={makePlan} disabled={effectiveMinutes <= 0}>
          Plan my session
        </button>
        {plan && !planning && (
          <p style={{ marginTop: "1.25rem" }}>
            <button className="replan" onClick={() => setAsking(false)}>
              ← back to today's plan
            </button>
          </p>
        )}
      </section>
    );
  }

  return (
    <PlanView plan={plan} onReplan={() => setAsking(true)} />
  );
}

function PlanView({ plan, onReplan }: { plan: Plan; onReplan: () => void }) {
  const total = plan.items.reduce((s, i) => s + i.estimated_minutes, 0);
  const focusLabel =
    plan.focus === "new"
      ? "New material"
      : plan.focus === "review"
        ? "Review"
        : "New & review";

  return (
    <section>
      {plan.coach_note && <p className="coach-note">{plan.coach_note}</p>}

      <div className="plan-meta">
        <span>{focusLabel}</span>
        <span>~{total} min</span>
      </div>

      {plan.items.length === 0 ? (
        <p className="empty">Nothing to practice right now — enjoy the break.</p>
      ) : (
        <ol className="plan-items">
          {plan.items.map((item, i) => (
            <PlanItemRow key={item.title} item={item} index={i} />
          ))}
        </ol>
      )}

      <Recap onReplan={onReplan} />
    </section>
  );
}

function PlanItemRow({ item, index }: { item: PlanItem; index: number }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState<AttemptResult | null>(null);
  const [error, setError] = useState("");

  const outcomes = item.kind === "review" ? REVIEW_OUTCOMES : NEW_OUTCOMES;

  const record = async (outcome: string) => {
    setBusy(true);
    setError("");
    try {
      const r = await api.attempt({
        title: item.title,
        outcome,
        used_hint: outcome === "solved_with_hints",
        viewed_solution: outcome === "viewed_solution",
      });
      setRecorded(r);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="plan-item" style={{ animationDelay: `${0.08 * index + 0.1}s` }}>
      <div className="plan-item-head">
        <span className="num">{String(index + 1).padStart(2, "0")}</span>
        <a
          className="title"
          href={leetcodeUrl(item.title)}
          target="_blank"
          rel="noreferrer"
        >
          {item.title}
        </a>
        <span className={`tag ${item.kind}`}>{item.kind}</span>
      </div>
      <p className="plan-item-sub">
        {item.topic} · <span className={`diff-${item.difficulty.toLowerCase()}`}>{item.difficulty}</span> · ~
        {item.estimated_minutes} min
      </p>
      {item.reason && <p className="plan-item-reason">{item.reason}</p>}

      {error && <div className="error">{error}</div>}

      {recorded ? (
        <p className="recorded">
          ✓ {outcomeLabel(recorded.outcome)}
          {recorded.next_review && (
            <span className="next"> — review around {recorded.next_review}</span>
          )}
        </p>
      ) : open ? (
        <div className="checkin" role="group" aria-label={`How did ${item.title} go?`}>
          {outcomes.map((o) => (
            <button key={o} onClick={() => record(o)} disabled={busy}>
              {outcomeLabel(o)}
            </button>
          ))}
        </div>
      ) : (
        <button className="checkin-toggle" onClick={() => setOpen(true)}>
          Check in
        </button>
      )}
    </li>
  );
}

function Recap({ onReplan }: { onReplan: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResult(await api.feedback(text.trim()));
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="recap">
      <h3>How did it go?</h3>
      <p className="hint">
        Just tell the coach in your own words — it updates your history and
        review schedule from what you say.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Group Anagrams took me 25 min, needed one hint on the sorting key. Two Sum was instant."
        aria-label="Session recap"
      />
      {error && <div className="error">{error}</div>}
      <div className="row">
        <button className="go" onClick={submit} disabled={busy || !text.trim()}>
          {busy ? "Reading your recap…" : "Tell the coach"}
        </button>
        <button className="replan" onClick={onReplan}>
          plan a different session
        </button>
      </div>

      {result && (
        <div className="result">
          {result.applied.length > 0 && (
            <ul>
              {result.applied.map((a) => (
                <li key={a.title}>
                  <span className="check">✓</span>
                  <strong>{a.title}</strong>
                  <span className="outcome">{outcomeLabel(a.outcome)}</span>
                  {a.next_review && (
                    <span className="next">review ~{a.next_review}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {result.coach_note && (
            <p className="coach-note reply">{result.coach_note}</p>
          )}
          {result.unmatched.length > 0 && (
            <p className="unmatched">
              Couldn't match: {result.unmatched.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
