# VibeCheck

**Make sure _you_ understand what's going into _your_ codebase.** VibeCheck runs when you open a pull request and asks a few AI-generated multiple-choice questions about the diff. 

It lives **inline in the PR comment thread** as a clickable accordion: you check your answers and a Submit box, and a commit status reports the result.

Non-blocking by default — it posts a `VibeCheck` commit status that shows on the PR but only gates merge if you opt in via branch protection. Self-hosted: you run your own copy, so quizzes use *your* Anthropic key and your code never touches anyone else's server.

![A VibeCheck quiz on a pull request](docs/quiz.png)

## Setup

Two steps: deploy the server once, then drop a small workflow into each repo.

### 1. Deploy the server

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/vibecheck)

Click the button and fill in the two prompted variables:

| Variable | What to enter |
|---|---|
| `ANTHROPIC_API_KEY` | Your [Anthropic API key](https://console.anthropic.com/settings/keys) (needs credits) |
| `VIBECHECK_ALLOWED_OWNERS` | Your GitHub username or org, e.g. `boJackEden`. Locks the server to workflows from *your* repos — you're allowlisting yourself, not other people. |

Railway builds it and assigns a public URL. Confirm `https://<your-domain>/health` returns `{"ok":true}`, and copy that domain — it's your `VIBECHECK_SERVER_URL`.

### 2. Add VibeCheck to a repo

Create `.github/workflows/vibecheck.yml`:

```yaml
name: VibeCheck
on:
  pull_request:
    types: [opened, synchronize, closed]
  issue_comment:
    types: [edited]
permissions:
  contents: read
  pull-requests: write
  statuses: write
  id-token: write
jobs:
  vibecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: boJackEden/vibecheck@v1
        with:
          server-url: ${{ vars.VIBECHECK_SERVER_URL }}
```

Then, in **GitHub**, go to your repo's **Settings → Secrets and variables → Actions → Variables** and add `VIBECHECK_SERVER_URL` = your domain from step 1 (e.g. `https://vibecheck-production.up.railway.app`). Set it at the GitHub **org** level instead and every repo inherits it — adding VibeCheck to a new repo is then just this one file.

Open a PR and you'll see the quiz. To **block merge** on it, add `VibeCheck` as a required status check in branch protection (otherwise it's informational).

## How it works

```
PR opened
  → GitHub Action grabs the diff (git diff base...HEAD)
  → POSTs diff to your server
  → server calls Claude, generates N multiple-choice questions (N scales with PR size)
  → server returns comment markdown; Action posts it as a PR comment
  → you expand questions, check answers, check "✅ Submit"
  → checkbox edit fires issue_comment.edited → Action POSTs comment to server
  → server parses checked boxes, grades, returns result
  → Action edits the comment to show the score + sets the commit status
  → PR merged/closed → Action tells server to drop the in-memory session
```

The interactive UI uses GitHub's native **markdown task-list checkboxes** — clicking one edits the comment and fires a webhook, which is the submit mechanism. No external page, no browser tab. Auth is **GitHub Actions OIDC** (see [Security](#security-github-actions-oidc)) — no shared secret, no per-repo key.

### Question scaling

| Changed lines | Questions |
|---|---|
| 1–50 | 3 |
| 51–200 | 5 |
| 201–500 | 7 |
| 500+ | 10 |

## Security (GitHub Actions OIDC)

The `/vibecheck/*` endpoints are locked down with **GitHub Actions OIDC** — no shared secret. Each workflow run mints a short-lived token that cryptographically proves it's a real Actions run from one of your repos; the server verifies it against GitHub's public keys and checks the repo owner against `VIBECHECK_ALLOWED_OWNERS`.

Defense in depth: the token also names the calling repo, and the server rejects any request whose `repo` body doesn't match the token's repository — so a workflow in one repo can't touch another's quiz session.

> If `VIBECHECK_ALLOWED_OWNERS` is unset, the endpoints are open (fine for local dev, logged as a warning at boot). Always set it in production.

## Known limitations

- **Sessions are in-memory.** A server restart between quiz generation and submission loses the correct answers (they're never in the PR comment). Push a commit to regenerate. Swap `sessions.ts` for Redis to survive restarts.
- **Checkboxes aren't radio buttons.** Markdown can't enforce single-select; checking two boxes for one question grades as wrong.
- **Write access required to toggle checkboxes.** PR authors normally have it; external fork contributors don't.
- **~10–30s latency** on `issue_comment` workflow runs (GitHub queue time).
- **One quiz per PR**, regenerated on each push. Once graded, the comment shows results and isn't re-takeable without a fresh run.

## Contributing

Running it locally, the repo layout, and the server API live in [CONTRIBUTING.md](CONTRIBUTING.md).

## Roadmap

- **Optional OpenAI provider** — abstract the LLM call so adopters can supply an OpenAI key instead of Anthropic. (Today: Anthropic only.)
- **Redis-backed sessions** — survive server restarts.
- **Difficulty modes** — expose `difficulty`/`focus` as workflow inputs.
