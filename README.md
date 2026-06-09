# VibeCheck

**Make sure _you_ understand what's going into _your_ codebase.** VibeCheck runs when you open a pull request and asks a few AI-generated multiple-choice questions about the diff — a "is there still a human in the loop?" check for AI-assisted development. It lives **inline in the PR comment thread** as a clickable accordion; you check your answers and a Submit box, and a commit status reports the result.

It's a **non-blocker by default**: the quiz posts a `VibeCheck` commit status that shows on the PR but only gates merge if you opt in via branch protection.

**This is a self-hosted tool.** You deploy your own copy, so quizzes run on *your* Anthropic key and your code never passes through anyone else's server. No central service, no sign-up, no per-user allowlist — see [Deploy your own](#deploy-your-own) below.

## Deploy your own

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/new/template)
<!-- ^ Replace the URL above with your published Railway template URL
     (Railway → your project → Settings → publish as Template). -->

1. **Deploy the server.** Click the button (or in Railway: New Project → Deploy from GitHub → this repo, root directory `server/`).
2. **Set two variables** when prompted:
   - `ANTHROPIC_API_KEY` (required) — your Anthropic key
   - `VIBECHECK_ALLOWED_OWNERS` (required) — **your own** GitHub username or org, e.g. `boJackEden`. This locks the server to workflows from *your* repos. You're allowlisting yourself, not other users — there's no list of "people allowed to use the tool."
3. **Generate a public domain** — Railway → service → Settings → Networking → Generate Domain. Confirm `https://<domain>/health` returns `{"ok":true}`.
4. **Install in any of your repos** — copy [`action/workflow-template.yml`](action/workflow-template.yml) to `.github/workflows/vibecheck.yml`. It's ~16 lines and just references the published action (`uses: boJackEden/vibecheck@v1`). Then set `VIBECHECK_SERVER_URL` = your domain as a variable — **set it at the org level** and every repo inherits it. Open a PR.

That's it — every repo under an allowlisted owner works with just step 4, no extra secrets (auth is via GitHub Actions OIDC). Set the org variable once and adding the quiz to a new repo is a single 16-line file.

> **Publishing your own one-click button:** deploy once, then in Railway open the project → Settings → **publish as Template**, and paste the generated template URL into the button link above. Adopters then get the two variable prompts automatically.

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
vibecheck/
├── action.yml                  # the reusable composite action (uses: boJackEden/vibecheck@v1)
├── action/
│   └── workflow-template.yml   # the ~16-line workflow consuming repos copy in
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

Copy `action/workflow-template.yml` to that repo as `.github/workflows/vibecheck.yml`, then add a repository **variable** `VIBECHECK_SERVER_URL` pointing at your deployed server (Settings → Secrets and variables → Actions → Variables). Open a PR to see it run.

To make the quiz **block merge**, add `VibeCheck` as a required status check in branch protection. Leave it out to keep the quiz a non-blocker.

## Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ ok, sessions }` |
| POST | `/vibecheck/generate` | `{ repo, pr, diff, config? }` | `{ comment, count }` |
| POST | `/vibecheck/grade` | `{ repo, pr, commentBody }` | `{ submitted, comment?, passed?, score?, total? }` |
| POST | `/vibecheck/cleanup` | `{ repo, pr }` | `{ cleaned }` |

The server never needs GitHub credentials — the workflow runs in repo context, grabs the diff, and does all GitHub writes itself.

## Security (GitHub Actions OIDC)

The `/vibecheck/*` endpoints are locked down with **GitHub Actions OIDC** — no shared secret. Each workflow run mints a short-lived token that cryptographically proves it's a real Actions run from one of your repos; the server verifies it against GitHub's public keys and checks the repo owner against an allowlist.

Set on the **server** (Railway variable):

```
VIBECHECK_ALLOWED_OWNERS=boJackEden        # comma-separated owners/orgs allowed to call the server
```

That's the only setup. Any repo under an allowlisted owner works by **just copying the workflow** — the workflow already requests the OIDC token (`id-token: write` + `core.getIDToken('vibecheck')`) and sends it as a bearer token. No per-repo secret.

Defense in depth: the token also names the calling repo, and the server rejects a request whose `repo` body doesn't match the token's repository — so a workflow in one repo can't touch another's quiz session.

> If `VIBECHECK_ALLOWED_OWNERS` is unset the endpoints are open (fine for local dev, logged as a warning at boot). Always set it in production.

## Known MVP limitations

- **Sessions are in-memory.** A server restart between quiz generation and submission loses the correct answers (they're never in the PR comment). Re-run the workflow to regenerate. Swap `sessions.ts` for Redis to survive restarts.
- **Checkboxes aren't radio buttons.** Markdown can't enforce single-select; checking two boxes for one question grades as wrong.
- **Write access required to toggle checkboxes.** PR authors normally have it; external fork contributors don't.
- **~10–30s latency** on `issue_comment` workflow runs (GitHub queue time).
- **One quiz per PR**, regenerated on each push. Once graded, the comment shows results and isn't re-takeable without a fresh run.

## Tuning (post-MVP)

`quiz.ts` accepts a `config` (`difficulty`, `focus`, `passRatio`) — wire it through the workflow as env/inputs to add difficulty modes. Pass threshold defaults to 70% (`VIBECHECK_PASS_RATIO`).

## Roadmap

- **Optional OpenAI provider** — abstract the LLM call so adopters can supply an OpenAI key instead of Anthropic. (Today: Anthropic only.)
- **Redis-backed sessions** — survive server restarts (today: in-memory).
- **Difficulty modes** — expose `difficulty`/`focus` as workflow inputs.
