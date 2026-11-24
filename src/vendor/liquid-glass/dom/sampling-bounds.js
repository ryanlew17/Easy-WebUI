//#region src/dom/sampling-bounds.ts
function e(e, t, n = !1) {
	let r = Math.abs(t), i = (e) => !n || t < 0 ? r + 3 : Math.min(r, Math.max(0, r - e / 2) + r / 255) + 3, a = i(e.width), o = i(e.height);
	return {
		x: e.x - a,
		y: e.y - o,
		width: e.width + 2 * a,
		height: e.height + 2 * o
	};
}
function t(e) {
	if (!e.length) throw RangeError("At least one sampling box is required.");
	let t = Math.min(...e.map((e) => e.x)), n = Math.min(...e.map((e) => e.y));
	return {
		x: t,
		y: n,
		width: Math.max(...e.map((e) => e.x + e.width)) - t,
		height: Math.max(...e.map((e) => e.y + e.height)) - n
	};
}
//#endregion
export { e as refractionSamplingBounds, t as unionSamplingBounds };
