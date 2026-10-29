import {
	action,
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import { DEFAULT_BAR_COLORS, DEFAULT_TEXT_STYLES, FONTS, renderDataUrl, type BarColors, type FontId, type KeyView, type Metric, type TextRole, type TextStyles, type ValueMode } from "../render";
import { usageStore } from "../usage";

/** Per-element text settings are stored flat: labelFont / labelSize (percent as a string), and so on per role. */
export interface LimitsSettings {
	metric?: Metric;
	valueMode?: ValueMode;
	[key: string]: string | undefined;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function barColors(settings: LimitsSettings): BarColors {
	const pick = (value: string | undefined, fallback: string) => (value && HEX_COLOR.test(value) ? value : fallback);
	return {
		normal: pick(settings.barNormal, DEFAULT_BAR_COLORS.normal),
		warn: pick(settings.barWarn, DEFAULT_BAR_COLORS.warn),
		danger: pick(settings.barDanger, DEFAULT_BAR_COLORS.danger),
	};
}

const ROLES: TextRole[] = ["label", "value", "countdown"];

function textStyles(settings: LimitsSettings): TextStyles {
	const styles = { ...DEFAULT_TEXT_STYLES };
	for (const role of ROLES) {
		const font = settings[`${role}Font`];
		const size = Number(settings[`${role}Size`]);
		styles[role] = {
			font: font && font in FONTS ? (font as FontId) : DEFAULT_TEXT_STYLES[role].font,
			scale: Number.isFinite(size) && size > 0 ? Math.min(160, Math.max(60, size)) / 100 : DEFAULT_TEXT_STYLES[role].scale,
		};
	}
	return styles;
}

// Countdowns are shown to the minute, so redrawing twice a minute keeps them accurate without refetching.
const REDRAW_MS = 30 * 1000;

/** Shows Claude's session (5h) / weekly (7d) usage on a key. Pressing the key refreshes immediately. */
@action({ UUID: "com.hymnk.claudelimits.limits" })
export class LimitsAction extends SingletonAction<LimitsSettings> {
	#settings = new Map<string, LimitsSettings>();
	#unsubscribe: (() => void) | null = null;
	#redrawTimer: NodeJS.Timeout | null = null;
	// Last image sent per key, so unchanged frames are not re-sent over the socket.
	#lastImage = new Map<string, string>();

	override async onWillAppear(ev: WillAppearEvent<LimitsSettings>): Promise<void> {
		this.#settings.set(ev.action.id, ev.payload.settings);
		if (!this.#unsubscribe) {
			this.#unsubscribe = usageStore.subscribe((view) => void this.#drawAll(view));
			this.#redrawTimer = setInterval(() => void this.#drawAll(usageStore.view), REDRAW_MS);
		}
		await this.#draw(ev.action.id, usageStore.view);
	}

	override onWillDisappear(ev: WillDisappearEvent<LimitsSettings>): void {
		this.#settings.delete(ev.action.id);
		this.#lastImage.delete(ev.action.id);
		if (this.#settings.size === 0) {
			this.#unsubscribe?.();
			this.#unsubscribe = null;
			if (this.#redrawTimer) clearInterval(this.#redrawTimer);
			this.#redrawTimer = null;
		}
	}

	override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<LimitsSettings>): Promise<void> {
		this.#settings.set(ev.action.id, ev.payload.settings);
		await this.#draw(ev.action.id, usageStore.view);
	}

	override async onKeyDown(ev: KeyDownEvent<LimitsSettings>): Promise<void> {
		await usageStore.refreshSoon();
		if (usageStore.view.kind === "message") await ev.action.showAlert();
	}

	async #drawAll(view: KeyView): Promise<void> {
		await Promise.all([...this.#settings.keys()].map((id) => this.#draw(id, view)));
	}

	async #draw(id: string, view: KeyView): Promise<void> {
		const instance = this.actions.find((a) => a.id === id);
		if (!instance) return;
		const settings = this.#settings.get(id) ?? {};
		const image = renderDataUrl(view, {
			metric: settings.metric ?? "session",
			valueMode: settings.valueMode ?? "used",
			now: Date.now(),
			styles: textStyles(settings),
			// "on" is the value older versions saved for the 残 tag.
			remainTag: settings.remainTag === "off" ? "off" : settings.remainTag === "on" ? "zan" : "left",
			barColors: barColors(settings),
		});
		if (this.#lastImage.get(id) === image) return;
		this.#lastImage.set(id, image);
		await instance.setImage(image);
	}
}
