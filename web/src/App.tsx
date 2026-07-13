import { useCallback, useEffect, useState } from "react";
import { api, ApiError, AppState, setToken } from "./api";
import Today from "./views/Today";
import Progress from "./views/Progress";
import Problems from "./views/Problems";

type View = "today" | "progress" | "problems";

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<View>("today");
  const [needsToken, setNeedsToken] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    try {
      setState(await api.state());
      setNeedsToken(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setNeedsToken(true);
      } else {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (needsToken) return <TokenGate onSubmit={refresh} />;

  return (
    <div className="shell">
      <header className="masthead">
        <h1>
          <span className="leaf">●</span> LeetCode Coach
        </h1>
        <nav aria-label="Views">
          {(
            [
              ["today", "Today"],
              ["progress", "Progress"],
              ["problems", "Problems"],
            ] as [View, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              aria-current={view === id}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {error && <div className="error">{error}</div>}
        {state && !state.initialized && <InitScreen onDone={refresh} state={state} />}
        {state?.initialized && view === "today" && <Today />}
        {state?.initialized && view === "progress" && <Progress />}
        {state?.initialized && view === "problems" && <Problems />}
      </main>
    </div>
  );
}

function TokenGate({ onSubmit }: { onSubmit: () => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="gate">
      <h2>Your coach is locked</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setToken(value.trim());
          onSubmit();
        }}
      >
        <input
          type="password"
          placeholder="Access token"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
        />
        <button className="go" type="submit" disabled={!value.trim()}>
          Unlock
        </button>
      </form>
    </div>
  );
}

function InitScreen({
  state,
  onDone,
}: {
  state: AppState;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choose = async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await api.init(id);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ask">
      <h2>Pick your roadmap.</h2>
      <p>
        Choose once — from then on the coach decides what you practice each
        day.
      </p>
      {error && <div className="error">{error}</div>}
      <div className="time-chips">
        {state.available_roadmaps.map((id) => (
          <button key={id} onClick={() => choose(id)} disabled={busy}>
            {id}
          </button>
        ))}
      </div>
    </section>
  );
}
