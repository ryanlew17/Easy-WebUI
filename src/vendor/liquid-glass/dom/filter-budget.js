import { webkit as e } from "./engine.js";
//#region src/dom/filter-budget.ts
var t = (e) => 3 * (e * .75 * Math.sqrt(2 * Math.PI)) / 2, n = 15099494.4;
function r(t, r, a) {
	return !e || a <= 0 || (t + 2 * a) * (r + 2 * a) <= n ? 1 : Math.max(.1, Math.min(1, i(t, r) / a));
}
function i(e, t) {
	return Math.max(0, (-(e + t) + Math.sqrt((e + t) ** 2 - 4 * (e * t - n))) / 4);
}
function a(e, t = 1, n = t) {
	let r = /* @__PURE__ */ new Map(), i;
	for (let a of e.matchAll(/<(fe\w+)\b([^>]*?)(?:\/>|>(.*?)<\/\1>)/gs)) {
		let [, e, o = "", s = ""] = a, c = Object.fromEntries([...o.matchAll(/([\w-]+)="([^"]*)"/g)].map((e) => [e[1], e[2]])), l = e === "feMerge" ? [...s.matchAll(/in="([^"]+)"/g)].map((e) => e[1]) : [c.in, c.in2].filter((e) => !!e), u = (c.stdDeviation ?? "0").split(" ").map(Number), d = Math.max(u[0] * t, (u[1] ?? u[0]) * n);
		i = {
			inputs: l,
			outset: e === "feGaussianBlur" && d > 0 ? Math.floor(3 * Math.min(500, Math.max(2, Math.floor(d * .75 * Math.sqrt(2 * Math.PI) + .5))) / 2) : e === "feDisplacementMap" ? Math.ceil(Math.abs(Number(c.scale ?? 0)) * Math.max(t, n) / 2) : e === "feOffset" ? Math.ceil(Math.max(Math.abs(Number(c.dx ?? 0)) * t, Math.abs(Number(c.dy ?? 0)) * n)) : 0
		}, c.result && r.set(c.result, i);
	}
	if (!i) return 0;
	let a = [], o = () => {
		let e = a.at(-1).depth, t = 0;
		for (; a.length && a.at(-1).depth === e;) t = Math.max(t, a.pop().outset);
		return t;
	}, s = (e, t) => {
		if (a.length && t < a.at(-1).depth) {
			let e = o();
			a.at(-1).outset += e;
		}
		a.push({
			outset: e.outset,
			depth: t
		});
		for (let n of e.inputs) {
			let e = r.get(n);
			e && s(e, t + 1);
		}
	};
	for (s(i, 0); a.length > 1;) {
		let e = o();
		a.at(-1).outset += e;
	}
	return a[0].outset;
}
//#endregion
export { t as blurOutsets, r as filterBudgetFactor, a as filterGraphOutsets, i as outsetBudget, e as webkit };
