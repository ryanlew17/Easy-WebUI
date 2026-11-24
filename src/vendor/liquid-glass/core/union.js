//#region src/core/union.ts
function e(e, t, n) {
	let r = Math.max(0, Math.min(n.radius, n.width / 2, n.height / 2)), i = Math.abs(e - (n.x + n.width / 2)) - (n.width / 2 - r), a = Math.abs(t - (n.y + n.height / 2)) - (n.height / 2 - r);
	return Math.hypot(Math.max(i, 0), Math.max(a, 0)) + Math.min(Math.max(i, a), 0) - r;
}
function t(e, t, n) {
	if (n <= 0) return Math.min(e, t);
	let r = Math.max(n - Math.abs(e - t), 0) / n;
	return Math.min(e, t) - r * r * n * .25;
}
function n(e) {
	let t = 0;
	for (let n = 0; n < e.length; n++) {
		let r = e[n], i = e[(n + 1) % e.length];
		t += r[0] * i[1] - i[0] * r[1];
	}
	return t;
}
function r(e, t) {
	if (e.length < 4) return e;
	let n = new Uint8Array(e.length);
	n[0] = n[e.length - 1] = 1;
	let r = [[0, e.length - 1]];
	for (; r.length;) {
		let [i, a] = r.pop(), [o, s] = e[i], [c, l] = e[a], u = Math.hypot(c - o, l - s) || 1, d = -1, f = -1;
		for (let t = i + 1; t < a; t++) {
			let [n, r] = e[t], i = Math.abs((c - o) * (s - r) - (o - n) * (l - s)) / u;
			i > d && (d = i, f = t);
		}
		d > t && (n[f] = 1, r.push([i, f], [f, a]));
	}
	return e.filter((e, t) => n[t]);
}
function i(e, t) {
	let [n, i] = e[0], a = 0, o = -1;
	e.forEach(([e, t], r) => {
		let s = Math.hypot(e - n, t - i);
		s > o && (o = s, a = r);
	});
	let s = r(e.slice(0, a + 1), t), c = r([...e.slice(a), e[0]], t);
	return [...s, ...c.slice(1, -1)];
}
function a(r, a, o = 1, s = 1e3) {
	if (!r.length) return [];
	let c = a / 2 + 2 * o, l = Math.min(...r.map((e) => e.x)) - c, u = Math.min(...r.map((e) => e.y)) - c, d = Math.max(...r.map((e) => e.x + e.width)) + c, f = Math.max(...r.map((e) => e.y + e.height)) + c, p = Math.ceil((d - l) / o) + 1, m = Math.ceil((f - u) / o) + 1, h = new Float64Array(p * m);
	for (let n = 0; n < m; n++) for (let i = 0; i < p; i++) {
		let s = l + i * o, c = u + n * o, d = Infinity;
		for (let n of r) d = d === Infinity ? e(s, c, n) : t(d, e(s, c, n), a);
		h[n * p + i] = d;
	}
	let g = /* @__PURE__ */ new Map(), _ = (e, t, n, r) => {
		let i = e === n ? (t * p + e) * 2 + 1 : (t * p + Math.min(e, n)) * 2;
		if (!g.has(i)) {
			let a = h[t * p + e], s = a / (a - h[r * p + n]);
			g.set(i, [l + (e + (n - e) * s) * o, u + (t + (r - t) * s) * o]);
		}
		return i;
	}, v = /* @__PURE__ */ new Map();
	for (let e = 0; e < m - 1; e++) for (let t = 0; t < p - 1; t++) {
		let n = h[e * p + t] < 0, r = h[e * p + t + 1] < 0, i = h[(e + 1) * p + t + 1] < 0, a = h[(e + 1) * p + t] < 0, o = () => _(t, e, t + 1, e), s = () => _(t + 1, e, t + 1, e + 1), c = () => _(t, e + 1, t + 1, e + 1), l = () => _(t, e, t, e + 1), u = (e, t) => v.set(e, t);
		switch ((n ? 8 : 0) | (r ? 4 : 0) | (i ? 2 : 0) | !!a) {
			case 1:
				u(l(), c());
				break;
			case 2:
				u(c(), s());
				break;
			case 3:
				u(l(), s());
				break;
			case 4:
				u(s(), o());
				break;
			case 5:
				u(l(), o()), u(s(), c());
				break;
			case 6:
				u(c(), o());
				break;
			case 7:
				u(l(), o());
				break;
			case 8:
				u(o(), l());
				break;
			case 9:
				u(o(), c());
				break;
			case 10:
				u(o(), s()), u(c(), l());
				break;
			case 11:
				u(o(), s());
				break;
			case 12:
				u(s(), l());
				break;
			case 13:
				u(s(), c());
				break;
			case 14: u(c(), l());
		}
	}
	let y = [], b = /* @__PURE__ */ new Set();
	for (let e of v.keys()) {
		if (b.has(e)) continue;
		let t = [];
		for (let n = e; n !== void 0 && !b.has(n); n = v.get(n)) b.add(n), t.push(g.get(n));
		if (t.length < 3) continue;
		let r = i(t, o * .12);
		for (let e = o * .25; r.length > s; e *= 1.6) r = i(t, e);
		n(r) < 0 && r.reverse(), y.push(r);
	}
	return y;
}
//#endregion
export { e as roundRectDistance, t as smoothMin, a as smoothUnion, n as windingArea };
