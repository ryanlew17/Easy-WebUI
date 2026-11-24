//#region src/dom/filter-reach.ts
function e(e, t, n, r = []) {
	let i = 0, a = (e) => {
		i = Math.max(i, e.x, t - e.x - e.width, e.y, n - e.y - e.height);
	};
	for (let [t] of e.matchAll(/<fe\w+\b[^>]*>/g)) {
		let e = (e) => Number(RegExp(`\\s${e}="([-\\d.e]+)"`).exec(t)?.[1] ?? NaN), n = {
			x: e("x"),
			y: e("y"),
			width: e("width"),
			height: e("height")
		};
		Object.values(n).every(Number.isFinite) && a(n);
	}
	return r.forEach(a), i > 0 ? Math.ceil((i / 2 + 2) / 16) * 16 : 0;
}
function t(e, t, r, i, a = !1) {
	let o = [...e.matchAll(/<feMerge[\s>]/g)].at(-1)?.index ?? -1;
	if (o < 0 || t <= 0) return e;
	let s = e.indexOf(">", o) + 1, c = `x="0" y="0" width="${r}" height="${i}"`, l = `<feFlood flood-opacity="0" ${c} result="reach"/>`, u;
	if (a) {
		let e = "reach", r = t, i = 0;
		for (; r > 0;) {
			let t = Math.min(r, 700);
			l += `<feGaussianBlur in="${e}" stdDeviation="${Math.ceil(t / n)}" ${c} result="reach-${++i}"/>`, e = `reach-${i}`, r -= t;
		}
		u = [e];
	} else {
		let e = Math.min(t, Math.floor(r / 2)), n = Math.min(t, Math.floor(i / 2));
		l += `<feOffset in="reach" dx="${e}" dy="${n}" ${c} result="reach-after"/><feOffset in="reach" dx="${-e}" dy="${-n}" ${c} result="reach-before"/>`, u = ["reach-after", "reach-before"];
	}
	return e.slice(0, o) + l + e.slice(o, s) + u.map((e) => `<feMergeNode in="${e}"/>`).join("") + e.slice(s);
}
var n = 2.25 * Math.sqrt(2 * Math.PI) / 2;
//#endregion
export { t as padRepaintReach, e as repaintReach };
