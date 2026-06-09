import express, { Request, Response } from "express";
import { generateQuiz } from "./quiz";
import { grade } from "./grade";
import { buildQuizComment, buildResultComment, parseAnswers } from "./comment";
import {
  saveSession,
  getSession,
  deleteSession,
  sessionCount,
} from "./sessions";
import { QuizConfig } from "./types";

const app = express();
app.use(express.json({ limit: "15mb" }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, sessions: sessionCount() });
});

// Generate a quiz from a diff, store it, return the comment markdown.
// Body: { repo: string, pr: number, diff: string, config?: QuizConfig }
app.post("/quiz/generate", async (req: Request, res: Response) => {
  try {
    const { repo, pr, diff, config } = req.body as {
      repo: string;
      pr: number;
      diff: string;
      config?: QuizConfig;
    };

    if (!repo || !pr || typeof diff !== "string") {
      return res.status(400).json({ error: "repo, pr, and diff are required" });
    }
    if (diff.trim().length === 0) {
      return res.status(400).json({ error: "diff is empty" });
    }

    const questions = await generateQuiz(diff, config || {});
    saveSession({ repo, pr, questions, createdAt: Date.now() });

    res.json({ comment: buildQuizComment(questions), count: questions.length });
  } catch (err) {
    console.error("generate failed:", err);
    res.status(500).json({ error: "quiz generation failed" });
  }
});

// Grade an edited comment body against the stored session.
// Body: { repo: string, pr: number, commentBody: string }
app.post("/quiz/grade", (req: Request, res: Response) => {
  try {
    const { repo, pr, commentBody } = req.body as {
      repo: string;
      pr: number;
      commentBody: string;
    };

    if (!repo || !pr || typeof commentBody !== "string") {
      return res
        .status(400)
        .json({ error: "repo, pr, and commentBody are required" });
    }

    const session = getSession(repo, pr);
    if (!session) {
      return res.status(404).json({ error: "no active quiz session for this PR" });
    }

    const { submitted, answers } = parseAnswers(commentBody);
    if (!submitted) {
      return res.json({ submitted: false });
    }

    const result = grade(session.questions, answers);
    res.json({
      submitted: true,
      comment: buildResultComment(session.questions, result),
      passed: result.passed,
      score: result.score,
      total: result.total,
    });
  } catch (err) {
    console.error("grade failed:", err);
    res.status(500).json({ error: "grading failed" });
  }
});

// Destroy the in-memory session (called when the PR is merged/closed).
// Body: { repo: string, pr: number }
app.post("/quiz/cleanup", (req: Request, res: Response) => {
  const { repo, pr } = req.body as { repo: string; pr: number };
  if (!repo || !pr) {
    return res.status(400).json({ error: "repo and pr are required" });
  }
  const existed = deleteSession(repo, pr);
  res.json({ cleaned: existed });
});

const port = parseInt(process.env.PORT || "3000", 10);
app.listen(port, () => {
  console.log(`pr-quiz server listening on :${port}`);
});
