// Thin fetch client for the coach API. If the server sets COACH_TOKEN, the
// token entered by the user is kept in localStorage and sent as a Bearer header.

export interface PlanItem {
  title: string;
  kind: "new" | "review";
  difficulty: string;
  topic: string;
  estimated_minutes: number;
  reason: string;
}

export interface Plan {
  focus: string;
  coach_note: string;
  items: PlanItem[];
}

export interface AppState {
  initialized: boolean;
  roadmap: {
    id: string;
    name: string;
    description: string;
    topics: string[];
    problem_count: number;
  } | null;
  available_roadmaps: string[];
  today: string;
}

export interface Progress {
  roadmap: string;
  solved: number;
  attempted: number;
  total: number;
  due_reviews: number;
  by_topic: { topic: string; solved: number; total: number }[];
}

export interface ProblemSummary {
  title: string;
  topic: string;
  difficulty: string;
  order: number;
  status: "new" | "in_progress" | "solved";
  attempts: number;
  next_review: string | null;
  due: boolean;
}

export interface Attempt {
  date: string;
  minutes: number | null;
  outcome: string;
  used_hint: boolean;
  viewed_solution: boolean;
  notes: string;
}

export interface ProblemDetail extends Omit<ProblemSummary, "attempts"> {
  review_streak: number;
  attempts: Attempt[];
}

export interface FeedbackResult {
  applied: { title: string; outcome: string; next_review: string | null }[];
  unmatched: string[];
  coach_note: string;
}

export interface AttemptResult {
  title: string;
  outcome: string;
  next_review: string | null;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "coach_token";

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(path, { ...init, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, detail);
  }
  return res.json();
}

export const api = {
  state: () => request<AppState>("/api/state"),
  init: (roadmap_id: string) =>
    request("/api/init", { method: "POST", body: JSON.stringify({ roadmap_id }) }),
  cachedPlan: () => request<{ plan: Plan | null }>("/api/plan"),
  plan: (minutes: number) =>
    request<{ plan: Plan }>("/api/plan", {
      method: "POST",
      body: JSON.stringify({ minutes }),
    }),
  feedback: (text: string) =>
    request<FeedbackResult>("/api/feedback", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  attempt: (payload: {
    title: string;
    outcome: string;
    minutes?: number | null;
    used_hint?: boolean;
    viewed_solution?: boolean;
    notes?: string;
  }) =>
    request<AttemptResult>("/api/attempts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  progress: () => request<Progress>("/api/progress"),
  problems: () => request<{ problems: ProblemSummary[] }>("/api/problems"),
  problem: (title: string) =>
    request<ProblemDetail>(`/api/problems/${encodeURIComponent(title)}`),
};

export function leetcodeUrl(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `https://leetcode.com/problems/${slug}/`;
}

export function outcomeLabel(outcome: string): string {
  const labels: Record<string, string> = {
    solved_independently: "Solved it myself",
    solved_with_hints: "Needed a hint",
    viewed_solution: "Read the solution",
    gave_up: "Gave up",
    reviewed_easily: "Easy review",
    struggled: "Struggled",
  };
  return labels[outcome] ?? outcome.replace(/_/g, " ");
}
