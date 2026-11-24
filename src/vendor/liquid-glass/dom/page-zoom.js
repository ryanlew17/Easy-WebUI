import { webkit as e } from "./engine.js";
//#region src/dom/page-zoom.ts
var t = {
	ratio: 0,
	pinch: 0,
	zoom: 1
}, n = () => e && typeof visualViewport == "object" && visualViewport && visualViewport.scale > 0 ? visualViewport.scale : 1;
function r() {
	return (typeof devicePixelRatio == "number" && devicePixelRatio > 0 ? devicePixelRatio : 1) / n();
}
function i(t, r, i = 1) {
	if (!e) return Infinity;
	let o = (typeof navigator == "object" && navigator.maxTouchPoints > 1 ? 1024 : 2048) * i;
	return Math.max(0, (o / (a() * n()) - Math.max(t, r)) / 2);
}
function a() {
	if (!e || typeof matchMedia != "function") return 1;
	let r = typeof devicePixelRatio == "number" && devicePixelRatio > 0 ? devicePixelRatio : 1, i = n();
	if (r === t.ratio && i === t.pinch) return t.zoom;
	let a = .25, o = 16;
	for (let e = 0; e < 24; e++) {
		let e = (a + o) / 2;
		matchMedia(`(min-resolution: ${e}dppx)`).matches ? a = e : o = e;
	}
	let s = Math.round(r / i / a * 1e3) / 1e3;
	return t = {
		ratio: r,
		pinch: i,
		zoom: Math.abs(s - 1) < .005 ? 1 : s
	}, t.zoom;
}
var o = /* @__PURE__ */ new Set([
	"x",
	"y",
	"width",
	"height",
	"dx",
	"dy",
	"stdDeviation",
	"scale"
]);
function s(e, t) {
	return t === 1 ? e : e.replace(/<(fe\w+)\b([^>]*)>/g, (e, n, r) => `<${n}${r.replace(/([\w-]+)="([^"]*)"/g, (e, n, r) => o.has(n) ? `${n}="${r.split(/[\s,]+/).filter(Boolean).map((e) => Number(e) * t).join(" ")}"` : e)}>`);
}
//#endregion
export { r as filterPixelRatio, a as pageZoom, i as untiledOutsets, s as zoomFilterMarkup };
