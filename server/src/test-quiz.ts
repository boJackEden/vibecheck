// Standalone test of question generation — no server, no GitHub.
// Run: ANTHROPIC_API_KEY=... npm run test:quiz
//
// This is the fastest way to judge whether the idea works: does Claude produce
// genuine reasoning questions from a real diff? Inspect the output before
// trusting any of the GitHub plumbing.
import { generateQuiz, questionCount, countChangedLines } from "./quiz";
import { buildQuizComment, parseAnswers } from "./comment";
import { grade } from "./grade";

const SAMPLE_DIFF = `diff --git a/src/cache.ts b/src/cache.ts
index 1234567..89abcde 100644
--- a/src/cache.ts
+++ b/src/cache.ts
@@ -1,10 +1,28 @@
-export function getUser(id: string) {
-  return db.query("SELECT * FROM users WHERE id = " + id);
+const cache = new Map<string, { value: User; expires: number }>();
+const TTL_MS = 60_000;
+
+export async function getUser(id: string): Promise<User | null> {
+  const hit = cache.get(id);
+  if (hit && hit.expires > Date.now()) {
+    return hit.value;
+  }
+  const rows = await db.query("SELECT * FROM users WHERE id = $1", [id]);
+  const user = rows[0] ?? null;
+  if (user) {
+    cache.set(id, { value: user, expires: Date.now() + TTL_MS });
+  }
+  return user;
+}
+
+export function invalidateUser(id: string): void {
+  cache.delete(id);
}
`;

async function main() {
  console.log(`Changed lines: ${countChangedLines(SAMPLE_DIFF)}`);
  console.log(`Question count: ${questionCount(SAMPLE_DIFF)}\n`);

  const questions = await generateQuiz(SAMPLE_DIFF);
  console.log(JSON.stringify(questions, null, 2));

  console.log("\n--- RENDERED COMMENT ---\n");
  const comment = buildQuizComment(questions);
  console.log(comment);

  // Simulate the developer answering every question correctly + submitting.
  // Walk line by line, tracking the current question, and only check the box
  // for that question's correct option (a global replace would cross questions).
  const correctById = new Map(questions.map((q) => [q.id, q.correct]));
  let current = 0;
  const answered = comment
    .split("\n")
    .map((line) => {
      const h = line.match(/<summary>(?:[^<]*?)Q(\d+):/i);
      if (h) {
        current = parseInt(h[1], 10);
        return line;
      }
      const o = line.match(/^(\s*[-*]\s*)\[ \](\s*([A-C])\))/);
      if (o && current > 0 && o[3] === correctById.get(current)) {
        return line.replace("[ ]", "[x]");
      }
      if (/^\s*[-*]\s*\[ \]\s*✅/.test(line)) {
        return line.replace("[ ]", "[x]");
      }
      return line;
    })
    .join("\n");

  const { submitted, answers } = parseAnswers(answered);
  console.log("\n--- PARSE (all-correct simulation) ---");
  console.log({ submitted, answers });
  console.log("Grade:", grade(questions, answers));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
