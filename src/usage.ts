// Polls Claude's usage endpoint once for all keys and hands out the latest result.
import streamDeck from "@elgato/streamdeck";
import { AuthError, getAccessToken } from "./credentials";
import type { KeyView, LimitWindow } from "./render";

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const POLL_MS = 5 * 60 * 1000;
// The endpoint rate-limits per account (other tools polling with the same login count too) and sends
// retry-after: 0, so back off on our own: 5, 10, 20, then 30 minutes.
const MAX_BACKOFF_MS = 30 * 60 * 1000;
// Key presses force a refresh, but never more often than this so mashing a key can't trip rate limits.
const MIN_MANUAL_GAP_MS = 15 * 1000;

interface RawWindow {
	utilization?: number | null;
	resets_at?: string | null;
}

interface RawUsage {
	five_hour?: RawWindow | null;
	seven_day?: RawWindow | null;
}

function toWindow(raw: RawWindow | null | undefined): LimitWindow | null {
	if (!raw || typeof raw.utilization !== "number") return null;
	const resetsAt = raw.resets_at ? Date.parse(raw.resets_at) : NaN;
	return { utilization: raw.utilization, resetsAt: Number.isNaN(resetsAt) ? null : resetsAt };
}

async function requestUsage(token: string): Promise<Response> {
	return fetch(USAGE_URL, {
		headers: {
			Authorization: `Bearer ${token}`,
			"anthropic-beta": "oauth-2025-04-20",
			Accept: "application/json",
		},
		signal: AbortSignal.timeout(20000),
	});
}

/** Last good reading, kept in the plugin's global settings so a restart or rate limit still has numbers to show. */
// Type aliases (not interfaces) so it satisfies the SDK's JsonObject constraint for global settings.
type CachedWindow = { utilization: number; resetsAt: number | null };
type CachedUsage = { session: CachedWindow | null; week: CachedWindow | null; fetchedAt: number };

class UsageStore {
	#view: KeyView = { kind: "loading" };
	#listeners = new Set<(view: KeyView) => void>();
	#timer: NodeJS.Timeout | null = null;
	#lastFetch = 0;
	#running: Promise<void> | null = null;
	#backoffUntil = 0;
	#rateLimitStreak = 0;
	#cacheLoaded = false;

	get view(): KeyView {
		return this.#view;
	}

	/** Start polling while at least one key is subscribed; returns the unsubscribe function. */
	subscribe(listener: (view: KeyView) => void): () => void {
		this.#listeners.add(listener);
		if (!this.#timer) {
			this.#timer = setInterval(() => void this.refresh(), POLL_MS);
			void this.#loadCache().then(() => this.refresh());
		}
		return () => {
			this.#listeners.delete(listener);
			if (this.#listeners.size === 0 && this.#timer) {
				clearInterval(this.#timer);
				this.#timer = null;
			}
		};
	}

	/** Re-fetch now if the last fetch is older than the manual gap (key press). */
	refreshSoon(): Promise<void> {
		if (Date.now() - this.#lastFetch < MIN_MANUAL_GAP_MS) return this.#running ?? Promise.resolve();
		return this.refresh();
	}

	refresh(): Promise<void> {
		if (Date.now() < this.#backoffUntil) return Promise.resolve();
		if (!this.#running) {
			this.#running = this.#fetch().finally(() => {
				this.#running = null;
			});
		}
		return this.#running;
	}

	async #loadCache(): Promise<void> {
		if (this.#cacheLoaded) return;
		this.#cacheLoaded = true;
		try {
			const { lastUsage } = await streamDeck.settings.getGlobalSettings<{ lastUsage?: CachedUsage }>();
			// Shown as stale (gray spark) until a live fetch succeeds.
			if (lastUsage && this.#view.kind === "loading") {
				this.#set({ kind: "usage", session: lastUsage.session, week: lastUsage.week, stale: true });
			}
		} catch (e) {
			streamDeck.logger.warn(`could not read cached usage: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	#set(view: KeyView): void {
		this.#view = view;
		for (const l of this.#listeners) l(view);
	}

	/** Keep showing the last good numbers (marked stale) on transient errors; otherwise show the message. */
	#fail(title: string, detail: string): void {
		if (this.#view.kind === "usage") this.#set({ ...this.#view, stale: true });
		else this.#set({ kind: "message", title, detail });
	}

	async #fetch(): Promise<void> {
		this.#lastFetch = Date.now();
		try {
			let res = await requestUsage(await getAccessToken());
			if (res.status === 401) {
				// The token looked valid by its expiry but the server rejected it; refresh once and retry.
				res = await requestUsage(await getAccessToken(true));
			}
			if (res.status === 401 || res.status === 403) throw new AuthError(`usage-${res.status}`);
			if (res.status === 429) {
				const retryAfter = Number(res.headers.get("retry-after")) * 1000;
				const backoff = Math.min(MAX_BACKOFF_MS, POLL_MS * 2 ** this.#rateLimitStreak);
				this.#rateLimitStreak++;
				this.#backoffUntil = Date.now() + (retryAfter > 0 ? Math.max(retryAfter, backoff) : backoff);
				streamDeck.logger.warn(`usage endpoint rate limited; next try in ${Math.round(backoff / 60000)} min`);
				this.#fail("取得制限中", "しばらく待機");
				return;
			}
			if (!res.ok) throw new Error(`usage HTTP ${res.status}`);
			const raw = (await res.json()) as RawUsage;
			this.#rateLimitStreak = 0;
			const cache: CachedUsage = { session: toWindow(raw.five_hour), week: toWindow(raw.seven_day), fetchedAt: Date.now() };
			this.#set({ kind: "usage", session: cache.session, week: cache.week, stale: false });
			await streamDeck.settings.setGlobalSettings({ lastUsage: cache });
		} catch (e) {
			if (e instanceof AuthError) {
				streamDeck.logger.warn(`auth problem: ${e.message}`);
				// A rejected login won't fix itself by retrying; drop the cached numbers so the key says so.
				this.#set(
					e.message === "no-credentials"
						? { kind: "message", title: "未ログイン", detail: "CLIで認証" }
						: { kind: "message", title: "要ログイン", detail: "CLIで再認証" },
				);
				return;
			}
			streamDeck.logger.error(`usage fetch failed: ${e instanceof Error ? e.message : String(e)}`);
			this.#fail("取得エラー", "押して再試行");
		}
	}
}

export const usageStore = new UsageStore();
