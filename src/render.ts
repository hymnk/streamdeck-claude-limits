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

/**
 * Fonts offered per text element. Each is a single family on purpose: Stream Deck renders with Qt SVG, which does
 * not understand CSS font-family lists and silently falls back to a much wider font when given one. Qt also only
 * picks regular or bold within a family, so the in-between weights are separate families (e.g. "Segoe UI Semibold").
 */
export const FONTS = {
	"segoe-bold": { family: "Segoe UI", weight: 700 },
	"segoe-semibold": { family: "Segoe UI Semibold", weight: 400 },
	"segoe-black": { family: "Segoe UI Black", weight: 400 },
	"segoe-regular": { family: "Segoe UI", weight: 400 },
	"bahnschrift-bold": { family: "Bahnschrift", weight: 700 },
	"bahnschrift-semibold": { family: "Bahnschrift SemiBold", weight: 400 },
	"meiryo-bold": { family: "Meiryo", weight: 700 },
	"yugothic-bold": { family: "Yu Gothic UI", weight: 700 },
	"arial-bold": { family: "Arial", weight: 700 },
	"verdana-bold": { family: "Verdana", weight: 700 },
} as const;
export type FontId = keyof typeof FONTS;

/** Header label (Session/Week and the 残 tag), the big percentage, and the reset countdown. */
export type TextRole = "label" | "value" | "countdown";
export interface TextStyle {
	font: FontId;
	/** Multiplier on the layout's built-in size, 1 = default. */
	scale: number;
}
export type TextStyles = Record<TextRole, TextStyle>;

const DEFAULT_STYLE: TextStyle = { font: "segoe-bold", scale: 1 };
export const DEFAULT_TEXT_STYLES: TextStyles = { label: DEFAULT_STYLE, value: DEFAULT_STYLE, countdown: DEFAULT_STYLE };

/** Tag next to the header in remaining mode: 残, Left, or none. */
export type RemainTag = "zan" | "left" | "off";

/** Bar colors for the three usage levels (below 70%, 70-89%, 90% and up). */
export interface BarColors {
	normal: string;
	warn: string;
	danger: string;
}

/** Bar colors per window, so Session and Week can look different. */
export type BarPalette = Record<"session" | "week", BarColors>;

export interface RenderOptions {
	metric: Metric;
	valueMode: ValueMode;
	now: number;
	styles?: TextStyles;
	/** Tag shown in remaining mode so it can't be mistaken for used-%. Defaults to "left". */
	remainTag?: RemainTag;
	barColors?: BarPalette;
}

const SIZE = 144;

export const COLORS = {
	bg: "#1f1e1c",
	track: "#3a3835",
	text: "#faf9f5",
	// Secondary text; kept bright since dimmer grays wash out on the physical key.
	muted: "#d9d5cb",
	claude: "#d97757",
	warn: "#e8a33d",
	danger: "#ef574a",
	// Spark color while showing cached numbers after a failed refresh.
	stale: "#77736a",
};

export const DEFAULT_BAR_COLORS: BarColors = { normal: COLORS.claude, warn: COLORS.warn, danger: COLORS.danger };

/** Bar/accent color for a given used percentage: Claude orange while there is headroom, then amber, then red. */
export function levelColor(utilization: number, colors: BarColors = DEFAULT_BAR_COLORS): string {
	if (utilization >= 90) return colors.danger;
	if (utilization >= 70) return colors.warn;
	return colors.normal;
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

/** Font size for a style, given the layout's default size. */
function px(style: TextStyle, size: number): number {
	return Math.round(size * style.scale * 10) / 10;
}

// Sizes are the layout defaults; the style scales them. The default font is bold, since regular strokes are too
// thin to read on the key's LCD.
function text(style: TextStyle, x: number, y: number, size: number, fill: string, content: string, anchor = "start"): string {
	const { family, weight } = FONTS[style.font];
	return `<text x="${x}" y="${y}" font-family="${family}" font-size="${px(style, size)}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}">${content}</text>`;
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

function stylesOf(opts: RenderOptions): TextStyles {
	return opts.styles ?? DEFAULT_TEXT_STYLES;
}

/** Small tag so a remaining-% reading can't be mistaken for used-%. "Left" is wider, so it is drawn smaller. */
function modeTag(y: number, size: number, opts: RenderOptions): string {
	const tag = opts.remainTag ?? "left";
	if (opts.valueMode !== "remaining" || tag === "off") return "";
	const label = stylesOf(opts).label;
	return tag === "left" ? text(label, RIGHT, y, Math.min(size, 14), COLORS.claude, "Left", "end") : text(label, RIGHT, y, size, COLORS.claude, "残", "end");
}

function colorsFor(opts: RenderOptions, which: "session" | "week"): BarColors {
	return opts.barColors?.[which] ?? DEFAULT_BAR_COLORS;
}

function thinBar(y: number, h: number, win: LimitWindow, value: number, colors: BarColors): string {
	return (
		`<rect x="${LEFT}" y="${y}" width="${WIDTH}" height="${h}" rx="${h / 2}" fill="${COLORS.track}"/>` +
		barFill(LEFT, y, WIDTH, h, h / 2, value / 100, levelColor(win.utilization, colors))
	);
}

/** One metric on the whole key: header, big percentage, thin bar, countdown — each on its own line. */
function renderSingle(which: "session" | "week", label: string, win: LimitWindow | null, stale: boolean, opts: RenderOptions): string {
	const st = stylesOf(opts);
	// Sized so "Session" still clears the tag at the right edge ("Left" is wider than 残, so the label gives up a pixel).
	const labelSize = opts.valueMode === "remaining" && opts.remainTag === "left" ? 17 : 18;
	const head = spark(LEFT + 8, 23, 8, sparkColor(stale)) + text(st.label, LEFT + 20, 29, labelSize, COLORS.muted, esc(label)) + modeTag(29, 17, opts);
	if (!win) return head + text(st.value, 72, 84, 40, COLORS.muted, "--", "middle");
	const value = shownValue(win, opts.valueMode);
	return (
		head +
		text(st.value, 72, 78, 46, COLORS.text, `${value}<tspan font-size="${px(st.value, 26)}" fill="${COLORS.muted}">%</tspan>`, "middle") +
		thinBar(89, 9, win, value, colorsFor(opts, which)) +
		text(st.countdown, 72, 120, 22, COLORS.muted, esc(formatCountdown(win.resetsAt, opts.now)), "middle")
	);
}

/** Session and week stacked: label line, then % on the left with countdown on the right, then a thin bar. */
function renderBoth(view: Extract<KeyView, { kind: "usage" }>, opts: RenderOptions): string {
	const st = stylesOf(opts);
	const row = (y: number, which: "session" | "week", label: string, withSpark: boolean, win: LimitWindow | null): string => {
		const labelX = withSpark ? LEFT + 16 : LEFT;
		const head = (withSpark ? spark(LEFT + 6, y + 9, 6.5, sparkColor(view.stale)) : "") + text(st.label, labelX, y + 15, 16, COLORS.muted, label);
		if (!win) return head + text(st.value, LEFT, y + 44, 26, COLORS.muted, "--");
		const value = shownValue(win, opts.valueMode);
		return (
			head +
			// "100" is a digit wider; shrink it so it never runs into the countdown.
			text(st.value, LEFT, y + 44, value >= 100 ? 21 : 28, COLORS.text, `${value}<tspan font-size="${px(st.value, value >= 100 ? 12 : 17)}" fill="${COLORS.muted}">%</tspan>`) +
			text(st.countdown, RIGHT, y + 43, 15, COLORS.muted, esc(formatCountdown(win.resetsAt, opts.now)), "end") +
			thinBar(y + 51, 7, win, value, colorsFor(opts, which))
		);
	};
	return modeTag(22, 15, opts) + row(7, "session", "Session", true, view.session) + row(67, "week", "Week", false, view.week);
}

function renderMessage(title: string, detail: string): string {
	return (
		spark(72, 36, 18, COLORS.claude) +
		text(DEFAULT_STYLE, 72, 87, 21, COLORS.text, esc(title), "middle") +
		text(DEFAULT_STYLE, 72, 114, 17, COLORS.muted, esc(detail), "middle")
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
		body = renderSingle("session", "Session", view.session, view.stale, opts);
	} else {
		body = renderSingle("week", "Week", view.week, view.stale, opts);
	}
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><rect width="${SIZE}" height="${SIZE}" fill="${COLORS.bg}"/>${body}</svg>`;
}

export function renderDataUrl(view: KeyView, opts: RenderOptions): string {
	return `data:image/svg+xml;charset=utf8,${encodeURIComponent(renderSvg(view, opts))}`;
}
