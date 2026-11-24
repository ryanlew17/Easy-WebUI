import { touchMaps as e } from "./maps.js";
//#region src/dom/map-image.ts
var t = {
	field: "field",
	overlay: "overlay"
}, n = (e, n) => `s${e}${t[n]}`;
function r(e) {
	if (!(e.outline || e.radius !== "capsule" || !Number.isFinite(e.width) || !Number.isFinite(e.height) || e.height <= 0 || e.width < e.height * 2)) return {
		...e,
		width: e.height * 3
	};
}
var i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), o = 0;
function s(e) {
	let t = i.get(e);
	return t || (t = `m${++o}`, i.set(e, t), a.set(t, e)), t;
}
function c(e) {
	return a.get(e);
}
function l(e) {
	let t = i.get(e);
	t && (i.delete(e), a.delete(t));
}
function u(t, n, r, i, a, o, c, l = 1, u = 1) {
	let d = (e, t, n, r) => `<feImage data-map="${s(e)}" x="${t / l}" y="${a / u}" width="${n / l}" height="${c / u}" preserveAspectRatio="none" result="${r}"/>`;
	e(t);
	let f = t.capsule, p = f ? f.cap * c / f.height : 0;
	if (!f || o < p * 2) return d(t[n], i, o, r);
	let [m, h, g] = f.planes[n];
	return d(h, i + p - .5, o - p * 2 + 1, `${r}M`) + d(m, i, p, `${r}L`) + d(g, i + o - p, p, `${r}R`) + `<feMerge result="${r}" x="${i / l}" y="${a / u}" width="${o / l}" height="${c / u}"><feMergeNode in="${r}M"/><feMergeNode in="${r}L"/><feMergeNode in="${r}R"/></feMerge>`;
}
//#endregion
export { r as capsuleMapGeometry, u as mapImage, s as mapToken, c as mapUrl, l as releaseMapToken, n as surfaceMapResult };
