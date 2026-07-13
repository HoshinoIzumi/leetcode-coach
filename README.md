# AI Daily LeetCode Coach

An AI coach that decides exactly what you should practice each day. Not a
tracker, not a dashboard — a coach. You only ever do two things:

1. Tell it how much time you have today.
2. Tell it (in plain English) how the session went.

The AI owns everything else: where you are on the roadmap, what to introduce
next, what to review, and when each problem should come back.

See [VISION.md](VISION.md) for the long-term product vision and how today's MVP
maps to it.

```
$ leetcode-coach plan 45

Today's a mix: two fresh Arrays & Hashing problems plus a quick review of
Two Sum to keep it warm.

Focus: a mix of new & review

  1. Two Sum  [review]
     Arrays & Hashing · Easy · ~8 min
     You solved this last week — a fast refresh before building on it.
  2. Group Anagrams  [new]
     Arrays & Hashing · Medium · ~22 min
     Next in your roadmap; builds directly on hashing patterns.
  ...

$ leetcode-coach done "Group Anagrams took me 25 min, needed one hint on the
  sorting key. Two Sum was instant."

Recorded:
  ✓ Group Anagrams  (solved with hints)   → review around 2026-07-14
  ✓ Two Sum  (reviewed easily)            → review around 2026-08-16

Nice — the hint on Group Anagrams was just the key-choice; the pattern itself
clearly landed. I'll surface it again in a couple of days to lock it in.
```

## How it works

- **Curriculum** — a fixed roadmap (NeetCode 150 in the MVP): topic order and
  candidate problems. The coach always knows where you are and what's next.
- **Scheduler** — Claude decides your daily plan from your history and today's
  available time, balancing new material against due reviews.
- **Memory** — every attempt, outcome, hint, and review date is stored as plain
  JSON and updated automatically from your natural-language feedback. You never
  edit it by hand.

The intelligence (planning + reading your feedback) runs through Claude with
structured outputs; the record it maintains is clean JSON so future features
(analytics, dashboards, custom roadmaps) build on the same foundation.

## Install

```bash
pip install -e .
```

Set your Anthropic API key (or use the `ant` CLI login):

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Use

```bash
leetcode-coach init            # choose a roadmap (once)
leetcode-coach plan 45         # "I have 45 minutes" -> today's plan
leetcode-coach done "..."      # recap your session in plain English
leetcode-coach progress        # a quick look at where you are
```

`plan` accepts natural phrasings too: `plan "1 hour"`, `plan 90m`.

If you don't want to install, run it as a module: `python -m coach plan 45`.

Your history lives at `~/.leetcode-coach/state.json` (override with
`LEETCODE_COACH_HOME` or `--state`).

## Web app

The same coach, in the browser: the daily loop (time → plan → recap), quick
per-problem check-ins, a progress dashboard, and per-problem history. It is a
thin FastAPI layer over the same `Coach` class the CLI uses, against the same
state file — use whichever interface you feel like on a given day.

```bash
pip install -e '.[web]'

# build the frontend once (rebuild after changing web/src)
cd web && npm install && npm run build && cd ..

uvicorn coach.api:app --port 8000    # open http://127.0.0.1:8000
```

For frontend development, run `npm run dev` inside `web/` (it proxies `/api`
to port 8000) alongside uvicorn.

### Deploying it (personal use)

The included `Dockerfile` builds the frontend and serves everything from one
container on port 8000. Two things matter when it's reachable from the
internet:

- **Auth** — set `COACH_TOKEN` to a secret string; every request must then
  carry it (the web UI asks once and remembers it in the browser).
- **Persistence** — history lives in `LEETCODE_COACH_HOME` (`/data` in the
  image); mount a volume there so it survives restarts.

```bash
docker build -t leetcode-coach .
docker run -p 8000:8000 \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e COACH_TOKEN=some-long-secret \
  -v coach-data:/data \
  leetcode-coach
```

Any single-container host (Fly.io, Railway, Render, a VPS) works as-is.

## Roadmap (beyond the MVP)

The architecture is built to grow into the full vision without a redesign:
personalized mistake analysis, concept-level mastery, adaptive spaced
repetition, interview-deadline plans, multiple/custom roadmaps, and a richer
dashboard. All of it builds on the same core idea — the AI observes your
history, knows where you are, and decides what you practice next.
