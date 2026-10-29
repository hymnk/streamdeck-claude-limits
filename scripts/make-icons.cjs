// Generates the plugin/category/action icons and the default key image from the same spark used on the keys.
// Plugin icons must be PNG; the rest are SVG.
const fs = require("fs");
const path = require("path");
const { Resvg } = require("@resvg/resvg-js");

const root = path.join(__dirname, "..", "com.hymnk.claudelimits.sdPlugin", "imgs");
const ORANGE = "#d97757";

function sparkPath(cx, cy, r) {
	const parts = [];
	for (let i = 0; i < 12; i++) {
		const angle = (Math.PI * 2 * i) / 12 - Math.PI / 2 + 0.13;
		const len = r * (i % 2 === 0 ? 1 : 0.72);
		const inner = r * 0.16;
		const p = (d) => `${(cx + Math.cos(angle) * d).toFixed(2)} ${(cy + Math.sin(angle) * d).toFixed(2)}`;
		parts.push(`M${p(inner)}L${p(len)}`);
	}
	return `<path d="${parts.join("")}" stroke="COLOR" stroke-width="${(r * 0.26).toFixed(2)}" stroke-linecap="round" fill="none"/>`;
}

function svg(size, { bg, color, scale = 0.36, bars = false }) {
	const c = size / 2;
	let body = "";
	if (bars) {
		// Default key image: spark over two usage bars, hinting at what the key will show.
		const u = size / 144;
		body += sparkPath(72 * u, 40 * u, 24 * u).replace("COLOR", color);
		body += `<rect x="${14 * u}" y="${80 * u}" width="${116 * u}" height="${20 * u}" rx="${8 * u}" fill="#3a3835"/>`;
		body += `<rect x="${14 * u}" y="${80 * u}" width="${40 * u}" height="${20 * u}" rx="${8 * u}" fill="${color}"/>`;
		body += `<rect x="${14 * u}" y="${108 * u}" width="${116 * u}" height="${20 * u}" rx="${8 * u}" fill="#3a3835"/>`;
		body += `<rect x="${14 * u}" y="${108 * u}" width="${92 * u}" height="${20 * u}" rx="${8 * u}" fill="${color}"/>`;
	} else {
		body += sparkPath(c, c, size * scale).replace("COLOR", color);
	}
	const bgRect = bg ? `<rect width="${size}" height="${size}" rx="${size * 0.18}" fill="${bg}"/>` : "";
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bgRect}${body}</svg>`;
}

function write(rel, content) {
	const file = path.join(root, rel);
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, content);
}

function png(rel, svgText) {
	write(rel, new Resvg(svgText).render().asPng());
}

// Plugin icon (marketplace / plugin list): 256 and 512 PNG.
png("plugin/icon.png", svg(256, { bg: "#1f1e1c", color: ORANGE }));
png("plugin/icon@2x.png", svg(512, { bg: "#1f1e1c", color: ORANGE }));
// Category and action list icons are shown monochrome-ish on the dark sidebar.
write("plugin/category.svg", svg(28, { color: "#ffffff", scale: 0.4 }));
write("actions/limits/icon.svg", svg(20, { color: "#ffffff", scale: 0.42 }));
write("actions/limits/key.svg", svg(144, { bg: "#1f1e1c", color: ORANGE, bars: true }).replace(/rx="25.92"/, 'rx="0"'));
console.log("icons written to", root);
