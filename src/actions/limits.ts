import {
	action,
	SingletonAction,
	type DidReceiveSettingsEvent,
	type KeyDownEvent,
	type WillAppearEvent,
	type WillDisappearEvent,
} from "@elgato/streamdeck";
import { renderDataUrl, type KeyView, type Metric, type ValueMode } from "../render";
import { usageStore } from "../usage";

export interface LimitsSettings {
	metric?: Metric;
	valueMode?: ValueMode;
	[key: string]: string | undefined;
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
		});
		if (this.#lastImage.get(id) === image) return;
		this.#lastImage.set(id, image);
		await instance.setImage(image);
	}
}
