import { Question, Grade } from "./types";

const DEFAULT_PASS_RATIO = parseFloat(process.env.QUIZ_PASS_RATIO || "0.7");

// Grade picked answers against the stored correct answers.
// A question is correct only if exactly the one correct option is checked
// (checking multiple boxes for a single-answer question counts as wrong).
export function grade(
  questions: Question[],
  answers: Record<number, string[]>,
  passRatio: number = DEFAULT_PASS_RATIO
): Grade {
  const results = questions.map((q) => {
    const picked = answers[q.id] || [];
    const correct = picked.length === 1 && picked[0] === q.correct;
    return { id: q.id, picked, correct };
  });

  const score = results.filter((r) => r.correct).length;
  const total = questions.length;
  const passed = score >= Math.ceil(passRatio * total);

  return { results, score, total, passed };
}
