// Draws the key face as an SVG data URL. Everything is laid out on a 144x144 canvas (the @2x key size);
// Stream Deck scales it down for 72px keys.

export type Metric = "session" | "week" | "both";
export type ValueMode = "used" | "remaining";

export interface LimitWindow {
	/** Percent of the window already used, 0-100. */
	utilization: number;
	/** Epoch ms when the window resets, or null when it has not started yet. */
	resetsAt: number | null;
}

export type KeyView =
	| { kind: "loading" }
	| { kind: "message"; title: string; detail: string }
	| { kind: "usage"; session: LimitWindow | null; week: LimitWindow | null; stale: boolean };

export interface RenderOptions {
	metric: Metric;
	valueMode: ValueMode;
	now: number;
}

const SIZE = 144;
// A single family on purpose: Stream Deck renders with Qt SVG, which does not understand CSS font-family lists
// and silently falls back to a much wider font when given one.
const FONT = "Segoe UI";

export const COLORS = {
	bg: "#1f1e1c",
	track: "#3a3835",
	text: "#faf9f5",
	muted: "#b7b3a8",
	claude: "#d97757",
	warn: "#e8a33d",
	danger: "#ef574a",
	// Spark color while showing cached numbers after a failed refresh.
	stale: "#77736a",
};

/** Bar/accent color for a given used percentage: Claude orange while there is headroom, then amber, then red. */
export function levelColor(utilization: number): string {
	if (utilization >= 90) return COLORS.danger;
	if (utilization >= 70) return COLORS.warn;
	return COLORS.claude;
}

/** "3h 33m", "2d 4h", "45m" until the reset time; "--" when the window has not started. */
export function formatCountdown(resetsAt: number | null, now: number): string {
	if (resetsAt === null) return "--";
	const totalMin = Math.max(0, Math.ceil((resetsAt - now) / 60000));
	const d = Math.floor(totalMin / 1440);
	const h = Math.floor((totalMin % 1440) / 60);
	const m = totalMin % 60;
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

/**
 * Claude-style spark: rounded rays of alternating length radiating from a center point.
 * Used as the brand cue so the key reads as "Claude" at a glance.
 */
export function spark(cx: number, cy: number, r: number, color: string): string {
	const rays = 12;
	const parts: string[] = [];
	for (let i = 0; i < rays; i++) {
		const angle = (Math.PI * 2 * i) / rays - Math.PI / 2 + 0.13;
		const len = r * (i % 2 === 0 ? 1 : 0.72);
		const inner = r * 0.16;
		const x1 = cx + Math.cos(angle) * inner;
		const y1 = cy + Math.sin(angle) * inner;
		const x2 = cx + Math.cos(angle) * len;
		const y2 = cy + Math.sin(angle) * len;
		parts.push(`M${x1.toFixed(2)} ${y1.toFixed(2)}L${x2.toFixed(2)} ${y2.toFixed(2)}`);
	}
	const width = Math.max(1.5, r * 0.26);
	return `<path d="${parts.join("")}" stroke="${color}" stroke-width="${width.toFixed(2)}" stroke-linecap="round" fill="none"/>`;
}

function esc(s: string): string {
	return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function text(x: number, y: number, size: number, weight: number, fill: string, content: string, anchor = "start"): string {
	return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${content}</text>`;
}

function barFill(x: number, y: number, w: number, h: number, rx: number, ratio: number, color: string): string {
	const clamped = Math.min(1, Math.max(0, ratio));
	if (clamped === 0) return "";
	// Keep a visible pill even for tiny values so 1-2% still shows color.
	const fw = Math.max(rx * 2, w * clamped);
	return `<rect x="${x}" y="${y}" width="${fw.toFixed(1)}" height="${h}" rx="${rx}" fill="${color}"/>`;
}

function shownValue(win: LimitWindow, mode: ValueMode): number {
	const used = Math.min(100, Math.max(0, win.utilization));
	return Math.round(mode === "used" ? used : 100 - used);
}

function sparkColor(stale: boolean): string {
	return stale ? COLORS.stale : COLORS.claude;
}

// Content stays inside this horizontal band: the outer edge of a physical key is hard to read behind the bezel.
// Rows also sit a little above center, since the bottom of a tilted Stream Deck key reads as cramped.
const LEFT = 18;
const RIGHT = 126;
const WIDTH = RIGHT - LEFT;

/** Small "残" tag so a remaining-% reading can't be mistaken for used-%. */
function modeTag(y: number, size: number, opts: RenderOptions): string {
	return opts.valueMode === "remaining" ? text(RIGHT, y, size, 700, COLORS.claude, "残", "end") : "";
}

function thinBar(y: number, h: number, win: LimitWindow, value: number): string {
	return (
		`<rect x="${LEFT}" y="${y}" width="${WIDTH}" height="${h}" rx="${h / 2}" fill="${COLORS.track}"/>` +
		barFill(LEFT, y, WIDTH, h, h / 2, value / 100, levelColor(win.utilization))
	);
}

/** One metric on the whole key: header, big percentage, thin bar, countdown — each on its own line. */
function renderSingle(label: string, win: LimitWindow | null, stale: boolean, opts: RenderOptions): string {
	const head = spark(LEFT + 9, 23, 9, sparkColor(stale)) + text(LEFT + 23, 29, 18, 600, COLORS.muted, esc(label)) + modeTag(29, 16, opts);
	if (!win) return head + text(72, 84, 40, 700, COLORS.muted, "--", "middle");
	const value = shownValue(win, opts.valueMode);
	return (
		head +
		text(72, 78, 46, 700, COLORS.text, `${value}<tspan font-size="26" fill="${COLORS.muted}">%</tspan>`, "middle") +
		thinBar(89, 9, win, value) +
		text(72, 118, 19, 600, COLORS.muted, esc(formatCountdown(win.resetsAt, opts.now)), "middle")
	);
}

/** Session and week stacked: label line, then % on the left with countdown on the right, then a thin bar. */
function renderBoth(view: Extract<KeyView, { kind: "usage" }>, opts: RenderOptions): string {
	const row = (y: number, label: string, withSpark: boolean, win: LimitWindow | null): string => {
		const labelX = withSpark ? LEFT + 16 : LEFT;
		const head = (withSpark ? spark(LEFT + 6, y + 9, 6.5, sparkColor(view.stale)) : "") + text(labelX, y + 14, 15, 600, COLORS.muted, label);
		if (!win) return head + text(LEFT, y + 44, 26, 700, COLORS.muted, "--");
		const value = shownValue(win, opts.valueMode);
		return (
			head +
			// "100" is a digit wider; shrink it so it never runs into the countdown.
			text(LEFT, y + 44, value >= 100 ? 23 : 28, 700, COLORS.text, `${value}<tspan font-size="${value >= 100 ? 14 : 17}" fill="${COLORS.muted}">%</tspan>`) +
			text(RIGHT, y + 43, 15, 600, COLORS.muted, esc(formatCountdown(win.resetsAt, opts.now)), "end") +
			thinBar(y + 51, 7, win, value)
		);
	};
	return modeTag(21, 14, opts) + row(7, "Session", true, view.session) + row(67, "Week", false, view.week);
}

function renderMessage(title: string, detail: string): string {
	return (
		spark(72, 36, 18, COLORS.claude) +
		text(72, 87, 21, 700, COLORS.text, esc(title), "middle") +
		text(72, 113, 16, 600, COLORS.muted, esc(detail), "middle")
	);
}

export function renderSvg(view: KeyView, opts: RenderOptions): string {
	let body: string;
	if (view.kind === "loading") {
		body = renderMessage("Claude", "読み込み中…");
	} else if (view.kind === "message") {
		body = renderMessage(view.title, view.detail);
	} else if (opts.metric === "both") {
		body = renderBoth(view, opts);
	} else if (opts.metric === "session") {
		body = renderSingle("Session", view.session, view.stale, opts);
	} else {
		body = renderSingle("Week", view.week, view.stale, opts);
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${COLORS.bg}"/>${body}</svg>`;
}

export function renderDataUrl(view: KeyView, opts: RenderOptions): string {
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(renderSvg(view, opts))}`;
}
