import { Question, Grade } from "./types";

// Markers let the workflow find/identify our comment and avoid grade loops.
export const MARKER = "<!-- pr-quiz -->";
export const GRADED_MARKER = "<!-- pr-quiz:graded -->";
export const SUBMIT_LABEL = "✅ **Submit my answers**";

// Build the interactive quiz comment. Each question is a <details> accordion;
// options are markdown task-list checkboxes (clickable in the PR comment).
// The correct answers are NOT included — they live server-side in the session.
export function buildQuizComment(questions: Question[]): string {
  const parts: string[] = [
    MARKER,
    `### 🧠 Code Understanding Check`,
    "",
    `${questions.length} question${questions.length === 1 ? "" : "s"} based on your diff. ` +
      `Expand each one, check your answer, then check **Submit** at the bottom.`,
    "",
  ];

  for (const q of questions) {
    parts.push(`<details><summary>Q${q.id}: ${escapeInline(q.question)}</summary>`);
    parts.push("");
    for (const opt of q.options) {
      parts.push(`- [ ] ${opt.label}) ${escapeInline(opt.text)}`);
    }
    parts.push("");
    parts.push(`</details>`);
    parts.push("");
  }

  parts.push("---");
  parts.push(`- [ ] ${SUBMIT_LABEL}`);
  return parts.join("\n");
}

// Build the result comment shown after grading. Includes GRADED_MARKER so the
// grade workflow won't re-trigger on its own edit.
export function buildResultComment(questions: Question[], grade: Grade): string {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const parts: string[] = [
    MARKER,
    GRADED_MARKER,
    `### 🧠 Code Understanding Check — ${grade.passed ? "✅ Passed" : "❌ Not passed"}`,
    "",
    `Score: **${grade.score} / ${grade.total}**`,
    "",
  ];

  for (const r of grade.results) {
    const q = byId.get(r.id)!;
    const mark = r.correct ? "✅" : "❌";
    const correctOpt = q.options.find((o) => o.label === q.correct);
    const pickedText =
      r.picked.length === 0 ? "_(no answer)_" : r.picked.join(", ");
    parts.push(
      `<details><summary>${mark} Q${q.id}: ${escapeInline(q.question)}</summary>`
    );
    parts.push("");
    parts.push(`- Your answer: ${pickedText}`);
    parts.push(`- Correct answer: **${q.correct})** ${escapeInline(correctOpt?.text ?? "")}`);
    parts.push(`- ${escapeInline(q.explanation)}`);
    parts.push("");
    parts.push(`</details>`);
    parts.push("");
  }

  if (!grade.passed) {
    parts.push("---");
    parts.push(
      "_Re-run the workflow (or push a commit) to get a fresh quiz and try again._"
    );
  }
  return parts.join("\n");
}

export interface ParsedAnswers {
  submitted: boolean;
  answers: Record<number, string[]>; // questionId -> checked option labels
}

// Parse the (edited) comment body: which option boxes are checked per question,
// and whether the Submit box is checked.
export function parseAnswers(body: string): ParsedAnswers {
  const answers: Record<number, string[]> = {};
  let current = 0;
  let submitted = false;

  const qHeader = /<summary>(?:[^<]*?)Q(\d+):/i;
  const option = /^\s*[-*]\s*\[([ xX])\]\s*([A-C])\)/;
  const submit = /^\s*[-*]\s*\[([ xX])\]\s*✅/;

  for (const rawLine of body.split("\n")) {
    const line = rawLine;

    const h = line.match(qHeader);
    if (h) {
      current = parseInt(h[1], 10);
      if (!answers[current]) answers[current] = [];
      continue;
    }

    const s = line.match(submit);
    if (s) {
      if (s[1].toLowerCase() === "x") submitted = true;
      continue;
    }

    const o = line.match(option);
    if (o && current > 0) {
      const checked = o[1].toLowerCase() === "x";
      const label = o[2];
      if (checked) {
        if (!answers[current]) answers[current] = [];
        answers[current].push(label);
      }
    }
  }

  return { submitted, answers };
}

// Strip characters that would break the markdown layout (newlines, our marker).
function escapeInline(s: string): string {
  return s.replace(/\r?\n/g, " ").trim();
}
