import { generateClipPath as e, generatePath as t } from "../deps/lisse.js";
//#region src/core/shape.ts
function n(e) {
	if (typeof e != "number" && e !== "capsule" && e !== "circle") throw RangeError("Unknown glass radius.");
	if (typeof e == "number" && (!Number.isFinite(e) || e < 0)) throw RangeError("Corner radius must be finite and nonnegative.");
	return {
		radius: typeof e == "number" ? e : 2 ** 53 - 1,
		smoothing: .8125,
		preserveSmoothing: !0,
		curve: e === "circle" ? "arc" : "squircle"
	};
}
var r = /* @__PURE__ */ new Map();
function i(e, t) {
	let n = r.get(e);
	return n === void 0 && (n = t(), r.size >= 1024 && r.delete(r.keys().next().value), r.set(e, n)), n;
}
function a(e, r, a) {
	return i(`p|${e}|${r}|${a}`, () => t(e, r, n(a)));
}
function o(t, r, a) {
	return i(`c|${t}|${r}|${a}`, () => e(t, r, n(a)));
}
function s(e, t, n) {
	let r = a(e, t, n).match(/[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g), i = [], o = 0, s = [0, 0], c = [0, 0], l = () => Number(r[o++]), u = () => [l(), l()], d = (e) => {
		i.push(e), s = e;
	};
	for (; o < r.length;) {
		let e = r[o++];
		if (e === "M") d(u()), c = s;
		else if (e === "L") d(u());
		else if (e === "H") d([l(), s[1]]);
		else if (e === "V") d([s[0], l()]);
		else if (e === "c") {
			let e = s, t = u(), n = u(), r = u();
			for (let i = 1; i <= 32; i++) {
				let a = i / 32, o = 1 - a;
				d([e[0] + 3 * o * o * a * t[0] + 3 * o * a * a * n[0] + a * a * a * r[0], e[1] + 3 * o * o * a * t[1] + 3 * o * a * a * n[1] + a * a * a * r[1]]);
			}
		} else if (e === "a") {
			let e = l(), t = l(), n = l(), r = l(), i = l(), a = u();
			if (e !== t || n !== 0 || r !== 0 || i !== 1) throw Error("Unsupported Lisse arc geometry.");
			let o = s, c = Math.hypot(...a);
			if (c < 1e-8) continue;
			let f = Math.sqrt(Math.max(0, e * e - c * c / 4)), p = [o[0] + a[0] / 2 - a[1] / c * f, o[1] + a[1] / 2 + a[0] / c * f], m = Math.atan2(o[1] - p[1], o[0] - p[0]), h = 2 * Math.asin(Math.min(1, c / (2 * e)));
			for (let t = 1; t <= 32; t++) {
				let n = m + h * t / 32;
				d([p[0] + e * Math.cos(n), p[1] + e * Math.sin(n)]);
			}
		} else if (e === "Z") d(c);
		else throw Error(`Unsupported Lisse path command: ${e}`);
	}
	return i;
}
function c(e, t, n) {
	let r = s(e, t, n);
	for (let n of r) {
		for (let t of [0, e]) Math.abs(n[0] - t) < 2e-4 && (n[0] = t);
		for (let e of [0, t]) Math.abs(n[1] - e) < 2e-4 && (n[1] = e);
		Math.abs(n[0] - e / 2) < 2e-4 && (n[0] = e / 2), Math.abs(n[1] - t / 2) < 2e-4 && (n[1] = t / 2);
	}
	let i = [];
	for (let n = 1; n < r.length; n++) {
		let a = r[n - 1], o = r[n], s = o[0] - a[0], c = o[1] - a[1], l = 0, u = 1;
		for (let [n, r, i, o] of [[
			a[0],
			s,
			e / 2,
			1
		], [
			a[1],
			c,
			t / 2,
			-1
		]]) if (Math.abs(r) < 1e-8) (n - i) * o < -1e-6 && (u = -1);
		else {
			let e = (i - n) / r;
			r * o > 0 ? l = Math.max(l, e) : u = Math.min(u, e);
		}
		u <= l || Math.hypot(s, c) * (u - l) < 1e-6 || i.push([
			a[0] + s * l,
			a[1] + c * l,
			a[0] + s * u,
			a[1] + c * u
		]);
	}
	let a = i.length;
	if (a > 128 || !a) throw RangeError("Lisse outline exceeds the GPU segment budget.");
	return {
		segments: i,
		count: a
	};
}
//#endregion
export { n as cornerOptions, o as shapeClip, a as shapePath, s as shapePolygon, c as shapeSegments };
