import { QuizSession } from "./types";

// In-memory quiz store. Keyed by `${repo}#${pr}`.
// Holds questions + correct answers between the generate and grade workflow runs.
// Destroyed when the PR is merged/closed (see /quiz/cleanup).
//
// MVP caveat: if the server restarts, sessions are lost — correct answers live
// only here, never in the PR comment. A restart between generate and submit
// means the quiz can't be graded and must be regenerated (re-run the workflow).
const store = new Map<string, QuizSession>();

function key(repo: string, pr: number): string {
  return `${repo}#${pr}`;
}

export function saveSession(session: QuizSession): void {
  store.set(key(session.repo, session.pr), session);
}

export function getSession(repo: string, pr: number): QuizSession | undefined {
  return store.get(key(repo, pr));
}

export function deleteSession(repo: string, pr: number): boolean {
  return store.delete(key(repo, pr));
}

export function sessionCount(): number {
  return store.size;
}
