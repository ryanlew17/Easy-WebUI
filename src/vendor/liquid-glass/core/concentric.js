import { shapePolygon as e } from "./shape.js";
//#region src/core/concentric.ts
function t(t, r) {
	if (!Number.isFinite(r) || r < 0) throw RangeError("Shape inset must be finite and nonnegative.");
	if (t.outline && !t.outline.length) return [];
	let i = t.outline ? [...t.outline, t.outline[0]] : e(t.width, t.height, t.radius), a = [
		[0, 0],
		[t.width, 0],
		[t.width, t.height],
		[0, t.height]
	];
	for (let e = 1; e < i.length; e++) {
		let t = i[e - 1], o = i[e], s = o[0] - t[0], c = o[1] - t[1], l = Math.hypot(s, c);
		if (!(l < 2e-4) && (a = n(a, -c / l, s / l, (-c * t[0] + s * t[1]) / l + r), !a.length)) break;
	}
	return a;
}
function n(e, t, n, r) {
	let i = [];
	for (let a = 0; a < e.length; a++) {
		let o = e[a], s = e[(a + 1) % e.length], c = o[0] * t + o[1] * n - r, l = s[0] * t + s[1] * n - r;
		if (c >= -1e-7 && i.push(o), c < 0 != l < 0) {
			let e = c / (c - l);
			i.push([o[0] + (s[0] - o[0]) * e, o[1] + (s[1] - o[1]) * e]);
		}
	}
	return i;
}
function r(t, r, i = 8) {
	let a = e(r.width, r.height, i).map(([e, t]) => [e + r.x, t + r.y]);
	for (let e = 0; e < t.length; e++) {
		let r = t[e], i = t[(e + 1) % t.length], o = i[0] - r[0], s = i[1] - r[1], c = Math.hypot(o, s);
		c < 1e-7 || (a = n(a, -s / c, o / c, (-s * r[0] + o * r[1]) / c));
	}
	return a.map(([e, t]) => [Math.round((e - r.x) * 1e4) / 1e4, Math.round((t - r.y) * 1e4) / 1e4]);
}
function i(e) {
	return e.length ? `polygon(${e.map(([e, t]) => `${e.toFixed(3)}px ${t.toFixed(3)}px`).join(",")})` : "polygon(0px 0px,0px 0px,0px 0px)";
}
function a(e, t, n) {
	return e.every((r, i) => {
		let a = e[(i + 1) % e.length];
		return (a[0] - r[0]) * (n - r[1]) - (a[1] - r[1]) * (t - r[0]) >= -.001;
	});
}
function o(n, r, i, o, s = "circle") {
	let c = t(n, o), l = e(r, i, s), u = (e) => c.length > 0 && l.every(([t, n]) => a(c, t + e, n + e)), d = Math.min((n.width - r) / 2, (n.height - i) / 2);
	if (d < 0 || !u(d)) throw RangeError("The control does not fit inside its shape container.");
	let f = 0, p = d;
	for (let e = 0; e < 24; e++) {
		let e = (f + p) / 2;
		u(e) ? p = e : f = e;
	}
	return p;
}
function s(e, t, n, r) {
	let i = [(n - Math.min(n, r)) / 2, (n + Math.min(n, r)) / 2], a = 0, o = t;
	for (let t of i) {
		let n = [];
		for (let r = 0; r < e.length; r++) {
			let i = e[r], a = e[(r + 1) % e.length];
			Math.abs(i[1] - a[1]) < 1e-7 ? Math.abs(t - i[1]) < 1e-5 && n.push(i[0], a[0]) : t >= Math.min(i[1], a[1]) && t <= Math.max(i[1], a[1]) && n.push(i[0] + (a[0] - i[0]) * (t - i[1]) / (a[1] - i[1]));
		}
		n.length && (a = Math.max(a, Math.min(...n)), o = Math.min(o, Math.max(...n)));
	}
	return {
		left: a,
		right: t - o
	};
}
function c(e) {
	let t = [];
	for (let n = 0; n < e.length; n++) {
		let r = e[n], i = e[(n + 1) % e.length];
		if (![...r, ...i].every(Number.isFinite)) throw RangeError("Outline coordinates must be finite.");
		Math.hypot(i[0] - r[0], i[1] - r[1]) > 1e-5 && t.push([...r, ...i]);
	}
	let n = t.length;
	if (n < 3 || n > 1024) throw RangeError("A glass outline needs between 3 and 1024 edges.");
	return {
		segments: t,
		count: n
	};
}
//#endregion
export { r as concentricOutline, s as contentInsets, o as cornerPlacement, t as insetShape, c as outlineSegments, i as polygonClip };
