import { smoothUnion as e } from "./union.js";
//#region src/core/morph-path.ts
var t = (e, t, n) => e + (t - e) * n;
function n(e, t, n) {
	let r = Math.min(1, Math.max(0, (n - e) / (t - e)));
	return r * r * (3 - 2 * r);
}
function r(e, t, n) {
	let r = Math.min(t, n) / 2;
	if (e === "capsule" || e === "circle") return r;
	let i = Number(e);
	return Math.max(0, Math.min(Number.isFinite(i) ? i : 8, r));
}
function i(e, t) {
	let n = r(e.radius, e.width, e.height), i = r(t.radius, t.width, t.height);
	return Math.abs(Math.log(e.width / t.width)) + Math.abs(Math.log(e.height / t.height)) + Math.abs(n - i) / Math.max(4, Math.min(t.width, t.height) / 2);
}
var a = (e, t) => Math.hypot(Math.max(0, e.left - (t.left + t.width), t.left - (e.left + e.width)), Math.max(0, e.top - (t.top + t.height), t.top - (e.top + e.height))), o = (e, t, n = .5) => t.left >= e.left - n && t.top >= e.top - n && t.left + t.width <= e.left + e.width + n && t.top + t.height <= e.top + e.height + n;
function s(e, t) {
	let n = t.top >= e.top + e.height - .5 || t.top + t.height <= e.top + .5;
	return n === (t.left >= e.left + e.width - .5 || t.left + t.width <= e.left + .5) ? Math.abs(t.left + t.width / 2 - e.left - e.width / 2) / Math.max(1, t.width) > Math.abs(t.top + t.height / 2 - e.top - e.height / 2) / Math.max(1, t.height) ? "x" : "y" : n ? "y" : "x";
}
function c(e, t, n) {
	if (!n || e >= 1) return e;
	let r = Math.max(0, e);
	return t ? 1 - (1 - r) ** 1.6 : r ** 1.4;
}
function l(e, i) {
	let a = e.along !== void 0, o = c(i, e.along === "x", a), s = c(i, e.along === "y", a), l = Math.max(1, t(e.from.width, e.to.width, o)), u = Math.max(1, t(e.from.height, e.to.height, s)), d = t(e.from.left + e.from.width / 2, e.to.left + e.to.width / 2, o), f = t(e.from.top + e.from.height / 2, e.to.top + e.to.height / 2, s), p = Math.min(l, u) / 2, m = Math.min(1, Math.max(0, i)), h = r(e.fromRadius, e.from.width, e.from.height), g = t(h, r(e.toRadius, l, u), m), _ = Math.min(p, Math.max(g, .34 * Math.min(l, u))), v = .12 * (1 - h / Math.max(1, Math.min(e.from.width, e.from.height) / 2)), y = a ? (v > 0 ? n(0, v, m) : 1) * (1 - n(.35, .8, m)) : 0, b = Math.min(p, t(g, _, y));
	return {
		left: d - l / 2,
		top: f - u / 2,
		width: l,
		height: u,
		radius: b
	};
}
var u = (e) => n(.4, .9, e), d = (e) => n(.02, .3, e), f = (e, t) => t * (1 - n(.3, .95, e)), p = (e, t) => Math.round(e / t) * t, m = /* @__PURE__ */ new Map();
function h(e, t, n = {}) {
	if (!t) return g(e, t, n);
	let r = (e) => ({
		...e,
		left: Number((e.left - t.left).toFixed(8)),
		top: Number((e.top - t.top).toFixed(8))
	}), i = {
		...e,
		from: r(e.from),
		to: r(e.to)
	}, a = {
		...t,
		left: 0,
		top: 0
	}, o = JSON.stringify([
		i,
		a,
		n
	]), s = m.get(o);
	return s ? m.delete(o) : s = g(i, a, n), m.set(o, s), m.size > 16 && m.delete(m.keys().next().value), s.map((e) => ({
		...e,
		shape: { ...e.shape },
		...e.box ? { box: {
			...e.box,
			left: e.box.left + t.left,
			top: e.box.top + t.top
		} } : {}
	}));
}
function g(n, s, c) {
	let { stops: u = 14, unions: d = 16, neck: m = 18, dpr: h = 1, restDpr: g = h } = c, _ = Array.from({ length: 241 }, (e, t) => l(n, t / 240)), v = (e, t, n) => {
		let r = n ? t.width : Math.max(1, Math.round(t.width)), i = n ? t.height : Math.max(1, Math.round(t.height)), a = p(Math.min(t.radius, r / 2, i / 2), .5);
		return {
			p: e,
			shape: {
				width: r,
				height: i,
				radius: a >= Math.min(r, i) / 2 - .25 ? "capsule" : a,
				dpr: h
			},
			absorbs: !1
		};
	}, y = [], b = [0];
	for (let e = 1; e <= 240; e++) b.push(b[e - 1] + i(_[e], _[e - 1]));
	let x = b[240], S = 1;
	for (let e = 1; e < 240 && x > 0; e++) b[e] >= x * S / (u - 1) && S < u - 1 && (y.push(v(e / 240, _[e], !1)), S++);
	let C = {
		p: 0,
		shape: {
			width: n.from.width,
			height: n.from.height,
			radius: n.fromRadius,
			dpr: g,
			resting: !0
		},
		absorbs: !1
	}, w = {
		p: 1,
		shape: {
			width: n.to.width,
			height: n.to.height,
			radius: n.toRadius,
			dpr: g,
			resting: !0
		},
		absorbs: !1
	};
	if (!s) return [
		C,
		...y,
		w
	];
	let T = {
		x: s.left,
		y: s.top,
		width: s.width,
		height: s.height,
		radius: r(s.radius, s.width, s.height)
	}, E = (e) => {
		let t = _[e], n = f(e / 240, m);
		return !o(s, t) && n >= 1 && a(s, t) <= n;
	}, D = -1, O = -1;
	for (let e = 0; e <= 240; e++) {
		if (!E(e)) {
			if (D >= 0) break;
			continue;
		}
		D < 0 && (D = e), O = e;
	}
	if (D < 0) return [
		C,
		...y,
		w
	];
	let k = {
		p: Math.max(0, D - 1) / 240,
		shape: {
			width: s.layoutWidth,
			height: s.layoutHeight,
			radius: s.radius,
			dpr: g,
			resting: !0
		},
		box: { ...s },
		absorbs: !0
	}, A = Math.max(2, Math.min(d, Math.ceil((O - D) / 240 / .025) + 1)), j = [];
	for (let n = 0; n < A; n++) {
		let r = Math.round(t(D, O, n / (A - 1))), i = _[r], a = r / 240, o = e([T, {
			x: i.left,
			y: i.top,
			width: i.width,
			height: i.height,
			radius: i.radius
		}], f(a, m), 1.5, 700);
		if (o.length !== 1) continue;
		let s = o[0], c = Math.floor(Math.min(...s.map(([e]) => e))), l = Math.floor(Math.min(...s.map(([, e]) => e))), u = Math.ceil(Math.max(...s.map(([e]) => e))), d = Math.ceil(Math.max(...s.map(([, e]) => e)));
		j.push({
			p: a,
			shape: {
				width: u - c,
				height: d - l,
				radius: 0,
				outline: s.map(([e, t]) => [e - c, t - l]),
				dpr: h
			},
			box: {
				left: c,
				top: l,
				width: u - c,
				height: d - l
			},
			absorbs: !0
		});
	}
	if (!j.length) return [
		C,
		...y,
		w
	];
	let M = v(Math.min(1, (O + 1) / 240), _[Math.min(240, O + 1)], !1), N = y.filter((e) => e.p > M.p);
	return [
		k,
		...j,
		M,
		...N,
		w
	];
}
function _(e, t) {
	if (!e.length || t < e[0].p - 1e-9) return;
	let n = 0;
	for (; n + 1 < e.length && e[n + 1].p <= t;) n++;
	let r = e[n], i = e[n + 1];
	if (!i || i.p <= r.p) return {
		a: r,
		mix: 0,
		absorb: +!!r.absorbs
	};
	let a = Math.min(1, Math.max(0, (t - r.p) / (i.p - r.p)));
	return {
		a: r,
		b: i,
		mix: a,
		absorb: (r.absorbs ? 1 - a : 0) + (i.absorbs ? a : 0)
	};
}
//#endregion
export { a as boxGap, u as contentReveal, t as mix, _ as morphDraw, l as morphShape, f as neckWidth, s as openingAxis, h as planMorph, r as radiusPixels, i as shapeDistance, n as smoothstep, d as sourceConceal };
