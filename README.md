# pr-quiz

An AI-generated, multiple-choice **code-understanding quiz** that runs when you open a pull request — a "is there still a human in the loop?" gate for AI-assisted development. The quiz lives **inline in the PR comment thread** as a clickable accordion; the developer checks their answers and a Submit box, and a commit status reports pass/fail.

It's a **non-blocker by default**: the quiz posts a `pr-quiz` commit status that shows on the PR but only gates merge if you opt in via branch protection.

## How it works

```
PR opened
  → GitHub Action grabs the diff (git diff base...HEAD)
  → POSTs diff to your server
  → server calls Claude, generates N multiple-choice questions (N scales with PR size)
  → server returns comment markdown; Action posts it as a PR comment
  → developer expands questions, checks answers, checks "✅ Submit"
  → checkbox edit fires issue_comment.edited → Action POSTs comment to server
  → server parses checked boxes, grades, returns result
  → Action edits the comment to show the score + sets the commit status
  → PR merged/closed → Action tells server to drop the in-memory session
```

The interactive UI uses GitHub's native **markdown task-list checkboxes** — clicking one edits the comment and fires a webhook, which is the submit mechanism. No external page, no browser tab.

### Question scaling

| Changed lines | Questions |
|---|---|
| 1–50 | 3 |
| 51–200 | 5 |
| 201–500 | 7 |
| 500+ | 10 |

## Repo layout

```
pr-quiz/
├── action/
│   └── workflow-template.yml   # consuming repos copy this into .github/workflows/
└── server/
    ├── src/
    │   ├── index.ts            # Express server (generate / grade / cleanup)
    │   ├── quiz.ts             # Claude question generation + scaling
    │   ├── grade.ts            # answer grading
    │   ├── comment.ts          # build + parse the checkbox comment
    │   ├── sessions.ts         # in-memory session store
    │   ├── types.ts
    │   └── test-quiz.ts        # standalone generation test (no server/GitHub)
    ├── package.json
    ├── tsconfig.json
    ├── Dockerfile
    └── .env.example
```

## Quick start

### 1. Test question generation standalone (do this first)

```bash
cd server
npm install
ANTHROPIC_API_KEY=sk-ant-... npm run test:quiz
```

This generates a quiz from a sample diff and prints the questions, the rendered comment, and a simulated grade — no server or GitHub needed. Use it to judge question quality before wiring anything up.

### 2. Run the server locally

```bash
cd server
cp .env.example .env   # fill in ANTHROPIC_API_KEY
npm run dev
```

### 3. Deploy to Railway

Point Railway at this repo with root directory `server/` (the Dockerfile builds it). Set `ANTHROPIC_API_KEY` in Railway's variables. Railway provides `PORT` automatically.

### 4. Install in a consuming repo

Copy `action/workflow-template.yml` to that repo as `.github/workflows/pr-quiz.yml`, then add a repository **variable** `QUIZ_SERVER_URL` pointing at your deployed server (Settings → Secrets and variables → Actions → Variables). Open a PR to see it run.

To make the quiz **block merge**, add `pr-quiz` as a required status check in branch protection. Leave it out to keep the quiz a non-blocker.

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ ok, sessions }` |
| POST | `/quiz/generate` | `{ repo, pr, diff, config? }` | `{ comment, count }` |
| POST | `/quiz/grade` | `{ repo, pr, commentBody }` | `{ submitted, comment?, passed?, score?, total? }` |
| POST | `/quiz/cleanup` | `{ repo, pr }` | `{ cleaned }` |

The server never needs GitHub credentials — the workflow runs in repo context, grabs the diff, and does all GitHub writes itself.

## Known MVP limitations

- **Sessions are in-memory.** A server restart between quiz generation and submission loses the correct answers (they're never in the PR comment). Re-run the workflow to regenerate. Swap `sessions.ts` for Redis to survive restarts.
- **Checkboxes aren't radio buttons.** Markdown can't enforce single-select; checking two boxes for one question grades as wrong.
- **Write access required to toggle checkboxes.** PR authors normally have it; external fork contributors don't.
- **~10–30s latency** on `issue_comment` workflow runs (GitHub queue time).
- **One quiz per PR**, regenerated on each push. Once graded, the comment shows results and isn't re-takeable without a fresh run.

## Tuning (post-MVP)

`quiz.ts` accepts a `config` (`difficulty`, `focus`, `passRatio`) — wire it through the workflow as env/inputs to add difficulty modes. Pass threshold defaults to 70% (`QUIZ_PASS_RATIO`).
