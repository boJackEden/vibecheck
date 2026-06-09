import Anthropic from "@anthropic-ai/sdk";
import { Question, QuizConfig } from "./types";

const client = new Anthropic();
const MODEL = process.env.VIBECHECK_MODEL || "claude-opus-4-8";

// Cap the diff we send to the model so a huge PR can't blow the context window.
const MAX_DIFF_CHARS = 120_000;

const LABELS = ["A", "B", "C"];

const SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string", enum: LABELS },
                text: { type: "string" },
              },
              required: ["label", "text"],
              additionalProperties: false,
            },
          },
          correct: { type: "string", enum: LABELS },
          explanation: { type: "string" },
        },
        required: ["question", "options", "correct", "explanation"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

const SYSTEM = `You write multiple-choice quizzes that verify a developer actually understands code they are about to merge — the kind of code an AI assistant might have written for them.

Rules for the questions you generate:
- Test UNDERSTANDING and REASONING, not recall. A good question cannot be answered by skimming the diff; it requires understanding WHY the code is the way it is, what it implies, or what would break.
- Favor: "why was this approach chosen over X", "what happens if this input is null/empty/concurrent", "what is the complexity / edge-case behavior", "what bug would this introduce", "what does this function guarantee to its callers".
- Avoid: trivia ("what is this variable named"), pure syntax recall, anything answerable without thought.
- Every question has EXACTLY 3 options labeled A, B, C — never more, never fewer. Do NOT add a fourth option and do NOT repeat the correct answer as an extra entry. Exactly ONE of the three is correct.
- Distractors must be plausible — wrong but tempting to someone who only half-read the code. No obviously-silly options.
- Keep each question self-contained and answerable from the diff plus general engineering knowledge.
- Write a one-sentence explanation of why the correct answer is right.`;

export function countChangedLines(diff: string): number {
  let n = 0;
  for (const line of diff.split("\n")) {
    if (
      (line.startsWith("+") && !line.startsWith("+++")) ||
      (line.startsWith("-") && !line.startsWith("---"))
    ) {
      n++;
    }
  }
  return n;
}

// Scale question count to PR size.
export function questionCount(diff: string): number {
  const changed = countChangedLines(diff);
  if (changed <= 50) return 3;
  if (changed <= 200) return 5;
  if (changed <= 500) return 7;
  return 10;
}

export async function generateQuiz(
  diff: string,
  config: QuizConfig = {}
): Promise<Question[]> {
  const count = questionCount(diff);
  const truncated = diff.length > MAX_DIFF_CHARS;
  const diffForModel = truncated ? diff.slice(0, MAX_DIFF_CHARS) : diff;

  const difficulty = config.difficulty || "mid";
  const focus = config.focus || "general";

  const userPrompt = [
    `Generate exactly ${count} multiple-choice questions about the following pull request diff.`,
    `Difficulty: ${difficulty}-level engineer. Focus area: ${focus}.`,
    truncated
      ? `\n(Note: the diff was truncated to the first ${MAX_DIFF_CHARS} characters — base questions only on what is shown.)`
      : "",
    "\n--- DIFF ---\n",
    diffForModel,
    "\n--- END DIFF ---",
  ].join("\n");

  // output_config.format constrains the response to our JSON schema. It is the
  // canonical API parameter but may lag the SDK's static types, so the params
  // object is built loosely and the response narrowed below.
  const params = {
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{ role: "user", content: userPrompt }],
    output_config: { format: { type: "json_schema", schema: SCHEMA } },
  };

  const response = await client.messages.create(
    params as unknown as Anthropic.MessageCreateParamsNonStreaming
  );

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Model returned no text block");
  }

  const parsed = JSON.parse(textBlock.text) as { questions: Omit<Question, "id">[] };

  // Sanitize: drop blank-text options and any duplicate labels (the model
  // sometimes appends a phantom option echoing the correct answer).
  return parsed.questions.map((q, i) => {
    const seen = new Set<string>();
    const options = q.options.filter((o) => {
      if (!o.text || !o.text.trim()) return false;
      if (seen.has(o.label)) return false;
      seen.add(o.label);
      return true;
    });
    return { ...q, options, id: i + 1 };
  });
}
