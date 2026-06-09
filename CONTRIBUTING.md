# Contributing to VibeCheck

How the pieces fit, how to run it locally, and the server's API. For setup/usage, see the [README](README.md).

## Architecture

VibeCheck is two parts:

- **A composite GitHub Action** (`action.yml`, published as `boJackEden/vibecheck@v1`) that runs in the consuming repo. It grabs the PR diff, calls the server, and does all GitHub writes (posting/editing the comment, setting the commit status). It authenticates to the server with a GitHub Actions OIDC token — no shared secret.
- **A self-hosted server** (`server/`, Node/TypeScript + Express) that calls Claude to generate and grade the quiz, and holds quiz sessions in memory between the "PR opened" and "answers submitted" runs.

The interactive UI is native GitHub markdown task-list checkboxes in a single PR comment — checking the Submit box fires `issue_comment.edited`, which triggers grading.

## Repo layout

```
vibecheck/
├── action.yml                  # the reusable composite action (uses: boJackEden/vibecheck@v1)
├── action/
│   └── workflow-template.yml   # the workflow consuming repos copy in
└── server/
    ├── src/
    │   ├── index.ts            # Express server (generate / grade / cleanup)
    │   ├── quiz.ts             # Claude question generation + scaling
    │   ├── grade.ts            # answer grading
    │   ├── comment.ts          # build + parse the checkbox comment
    │   ├── auth.ts             # GitHub Actions OIDC verification
    │   ├── sessions.ts         # in-memory session store
    │   ├── types.ts
    │   └── test-quiz.ts        # standalone generation test (no server/GitHub)
    ├── package.json
    ├── tsconfig.json
    ├── Dockerfile
    └── .env.example
```

## Local development

```bash
cd server
npm install

# Judge question quality with no server/GitHub — generates a quiz from a sample diff:
ANTHROPIC_API_KEY=sk-ant-... npm run test:quiz

# Run the server locally:
cp .env.example .env   # fill in ANTHROPIC_API_KEY
npm run dev
```

`quiz.ts` accepts a `config` (`difficulty`, `focus`, `passRatio`); pass threshold defaults to 70% (`VIBECHECK_PASS_RATIO`). With `VIBECHECK_ALLOWED_OWNERS` unset, the server logs a warning and leaves `/vibecheck/*` open — fine for local dev, never in production.

## Server API

The server never needs GitHub credentials — the Action runs in repo context, grabs the diff, and does all GitHub writes itself.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | — | `{ ok, sessions }` |
| POST | `/vibecheck/generate` | `{ repo, pr, diff, config? }` | `{ comment, count }` |
| POST | `/vibecheck/grade` | `{ repo, pr, commentBody }` | `{ submitted, comment?, passed?, score?, total? }` |
| POST | `/vibecheck/cleanup` | `{ repo, pr }` | `{ cleaned }` |

All `/vibecheck/*` routes require a valid GitHub Actions OIDC bearer token (see [Security](README.md#security-github-actions-oidc) in the README).

## Releasing

The action is consumed at `boJackEden/vibecheck@v1`. After changing `action.yml`, move the tag:

```bash
git tag -f v1 && git push -f origin v1
```
