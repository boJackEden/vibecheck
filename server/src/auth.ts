import { createRemoteJWKSet, jwtVerify } from "jose";

// Verify GitHub Actions OIDC tokens. A workflow with `id-token: write` can mint
// a short-lived JWT that cryptographically proves "this request is a real
// GitHub Actions run from repo X". We verify it against GitHub's public keys
// and check the repo owner against an allowlist — so only workflows in YOUR
// repos can call the server. No shared secret to distribute or leak.
const ISSUER = "https://token.actions.githubusercontent.com";
const AUDIENCE = process.env.QUIZ_OIDC_AUDIENCE || "pr-quiz";

// Comma-separated GitHub owners/orgs allowed to call the server, e.g. "boJackEden".
export const ALLOWED_OWNERS = (process.env.QUIZ_ALLOWED_OWNERS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export const OIDC_ENABLED = ALLOWED_OWNERS.length > 0;

const JWKS = createRemoteJWKSet(
  new URL(`${ISSUER}/.well-known/jwks`)
);

export interface OIDCResult {
  ok: boolean;
  reason?: string;
  repository?: string; // "owner/repo"
  owner?: string;
}

export async function verifyGitHubOIDC(token: string): Promise<OIDCResult> {
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: ISSUER,
      audience: AUDIENCE,
    });
    const owner = String(payload.repository_owner || "").toLowerCase();
    const repository = String(payload.repository || "");

    if (!ALLOWED_OWNERS.includes(owner)) {
      return { ok: false, reason: `owner '${owner}' not in allowlist` };
    }
    return { ok: true, owner, repository };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "verify failed" };
  }
}
