// Reads Claude Code's OAuth login from ~/.claude/.credentials.json and keeps the access token fresh.
//
// When Claude Code runs inside the desktop app, the host app owns token refresh and this file is never
// updated, so the access token in it expires after a few hours. We refresh it the same way the Claude Code
// CLI does and write the rotated tokens back, so the CLI keeps working with the same file.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
// Refresh a little before the real expiry so a request never goes out with a token that dies mid-flight.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

export class AuthError extends Error {}

interface OAuthBlock {
	accessToken: string;
	refreshToken?: string;
	expiresAt?: number;
	refreshTokenExpiresAt?: number;
	scopes?: string[];
	[key: string]: unknown;
}

export function credentialsPath(): string {
	const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
	return path.join(dir, ".credentials.json");
}

function readFile(): { json: Record<string, unknown>; oauth: OAuthBlock } {
	let json: Record<string, unknown>;
	try {
		json = JSON.parse(fs.readFileSync(credentialsPath(), "utf8"));
	} catch {
		throw new AuthError("no-credentials");
	}
	const oauth = json.claudeAiOauth as OAuthBlock | undefined;
	if (!oauth || typeof oauth.accessToken !== "string" || !oauth.accessToken) throw new AuthError("no-credentials");
	return { json, oauth };
}

function isFresh(oauth: OAuthBlock): boolean {
	return typeof oauth.expiresAt === "number" && oauth.expiresAt - EXPIRY_MARGIN_MS > Date.now();
}

async function refresh(oauth: OAuthBlock): Promise<string> {
	if (!oauth.refreshToken) throw new AuthError("no-refresh-token");
	const body: Record<string, string> = {
		grant_type: "refresh_token",
		refresh_token: oauth.refreshToken,
		client_id: CLIENT_ID,
	};
	if (oauth.scopes?.length) body.scope = oauth.scopes.join(" ");

	const res = await fetch(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body),
		signal: AbortSignal.timeout(30000),
	});
	if (res.status === 400 || res.status === 401 || res.status === 403) throw new AuthError(`refresh-rejected-${res.status}`);
	if (!res.ok) throw new Error(`token refresh failed: HTTP ${res.status}`);
	const data = (await res.json()) as {
		access_token: string;
		refresh_token?: string;
		expires_in: number;
		refresh_token_expires_in?: number;
		scope?: string;
	};

	// Re-read right before writing so fields other tools added in the meantime are kept.
	const latest = readFile();
	const next: OAuthBlock = {
		...latest.oauth,
		accessToken: data.access_token,
		refreshToken: data.refresh_token ?? oauth.refreshToken,
		expiresAt: Date.now() + data.expires_in * 1000,
	};
	if (typeof data.refresh_token_expires_in === "number") {
		next.refreshTokenExpiresAt = Date.now() + data.refresh_token_expires_in * 1000;
	}
	if (data.scope) next.scopes = data.scope.split(" ").filter(Boolean);

	const file = credentialsPath();
	const tmp = `${file}.${process.pid}.tmp`;
	const content = JSON.stringify({ ...latest.json, claudeAiOauth: next });
	fs.writeFileSync(tmp, content, { encoding: "utf8", mode: 0o600 });
	try {
		fs.renameSync(tmp, file);
	} catch {
		// Windows refuses the rename while another process holds the file open; fall back to an in-place write.
		fs.rmSync(tmp, { force: true });
		fs.writeFileSync(file, content, "utf8");
	}
	return next.accessToken;
}

let inflight: Promise<string> | null = null;

/**
 * Returns a usable access token, refreshing it when it is expired (or when `force` is set after a 401).
 * Concurrent callers share one refresh so the rotating refresh token is only spent once.
 */
export function getAccessToken(force = false): Promise<string> {
	const { oauth } = readFile();
	if (!force && isFresh(oauth)) return Promise.resolve(oauth.accessToken);
	if (!inflight) {
		inflight = (async () => {
			// Another process (e.g. the CLI) may have refreshed since we looked; reuse its token if so.
			const current = readFile().oauth;
			if (current.accessToken !== oauth.accessToken && isFresh(current)) return current.accessToken;
			return refresh(current);
		})().finally(() => {
			inflight = null;
		});
	}
	return inflight;
}
