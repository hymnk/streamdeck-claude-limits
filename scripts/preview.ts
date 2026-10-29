// Writes dist/preview.html with every key layout/state at real (72px) and @2x (144px) size, for design checks.
import fs from "node:fs";
import path from "node:path";
import { renderSvg, type KeyView, type Metric, type RemainTag, type TextStyles, type ValueMode } from "../src/render";

const now = Date.now();
const min = 60000;
const sample = (s: number, w: number, stale = false): KeyView => ({
	kind: "usage",
	session: { utilization: s, resetsAt: now + 213 * min },
	week: { utilization: w, resetsAt: now + 963 * min },
	stale,
});

const big: TextStyles = {
	label: { font: "segoe-black", scale: 1.2 },
	value: { font: "bahnschrift-bold", scale: 1.1 },
	countdown: { font: "bahnschrift-bold", scale: 1.2 },
};

const cases: { title: string; view: KeyView; metric: Metric; valueMode?: ValueMode; styles?: TextStyles; remainTag?: RemainTag }[] = [
	{ title: "Session 16%", view: sample(16, 92), metric: "session" },
	{ title: "Week 92%", view: sample(16, 92), metric: "week" },
	{ title: "両方", view: sample(16, 92), metric: "both" },
	{ title: "両方 75%/45%", view: sample(75, 45), metric: "both" },
	{ title: "Session 残量表示", view: sample(16, 92), metric: "session", valueMode: "remaining" },
	{ title: "両方 残量表示", view: { ...sample(8, 53), session: { utilization: 8, resetsAt: now + 218 * min }, week: { utilization: 53, resetsAt: now + 3734 * min } }, metric: "both", valueMode: "remaining" },
	{ title: "両方 100%/2d", view: { ...sample(100, 99), week: { utilization: 99, resetsAt: now + 3734 * min } }, metric: "both" },
	{ title: "Week 2d表示", view: { ...sample(3, 41), week: { utilization: 41, resetsAt: now + 3 * 1440 * min + 125 * min } }, metric: "week" },
	{ title: "Session 未開始", view: { ...sample(0, 30), session: { utilization: 0, resetsAt: null } }, metric: "session" },
	{ title: "古いデータ", view: sample(55, 60, true), metric: "both" },
	{ title: "読み込み中", view: { kind: "loading" }, metric: "session" },
	{ title: "文字設定: 大きめ", view: sample(84, 46), metric: "session", styles: big },
	{ title: "文字設定: 大きめ 両方", view: sample(84, 46), metric: "both", valueMode: "remaining", styles: big },
	{ title: "文字設定: メイリオ 120%", view: sample(84, 46), metric: "both", styles: { label: { font: "meiryo-bold", scale: 1.2 }, value: { font: "meiryo-bold", scale: 1 }, countdown: { font: "meiryo-bold", scale: 1.2 } } },
	{ title: "両方 残量表示(残マークなし)", view: sample(84, 46), metric: "both", valueMode: "remaining", remainTag: "off" },
	{ title: "Session 残量表示(残マークなし)", view: sample(84, 46), metric: "session", valueMode: "remaining", remainTag: "off" },
	{ title: "両方 残量表示(Left)", view: sample(84, 46), metric: "both", valueMode: "remaining", remainTag: "left" },
	{ title: "Session 残量表示(Left)", view: sample(84, 46), metric: "session", valueMode: "remaining", remainTag: "left" },
	{ title: "要ログイン", view: { kind: "message", title: "要ログイン", detail: "claude で再認証" }, metric: "session" },
];

// Raw SVGs too, so they can be rendered with Qt (scripts/qt-render.py) the way Stream Deck does.
const svgDir = path.join(__dirname, "svg");
fs.rmSync(svgDir, { recursive: true, force: true });
fs.mkdirSync(svgDir, { recursive: true });

const cells = cases
	.map(({ title, view, metric, valueMode, styles, remainTag }, i) => {
		const svg = renderSvg(view, { metric, valueMode: valueMode ?? "used", now, styles, remainTag });
		fs.writeFileSync(path.join(svgDir, `${String(i).padStart(2, "0")}.svg`), svg);
		const url = `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
		return `<figure><img src="${url}" width="72" height="72"><span class="g"><img src="${url}" width="144" height="144"></span><figcaption>${title}</figcaption></figure>`;
	})
	.join("\n");

const html = `<!doctype html><meta charset="utf-8"><title>Key preview</title>
<style>body{background:#111;color:#ccc;font-family:'Segoe UI',sans-serif;display:flex;flex-wrap:wrap;gap:20px;padding:20px}
figure{margin:0;display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;width:240px}img{border-radius:10px}figcaption{width:100%;font-size:12px}.g{position:relative;display:inline-block;line-height:0}.g::after{content:"";position:absolute;left:18px;right:18px;top:0;bottom:0;border-left:1px dashed #0af6;border-right:1px dashed #0af6}</style>
${cells}`;
const out = path.join(__dirname, "preview.html");
fs.writeFileSync(out, html);
console.log(out);
