//#region src/dom/control-motion.ts
function e(e, t, n) {
	let r = 2 * Math.PI / .47, i = .7 * r, a = r * Math.sqrt(1 - .7 ** 2), o = e.value - t, s = (e.velocity + i * o) / a, c = Math.exp(-i * n), l = Math.sin(a * n), u = Math.cos(a * n);
	e.value = t + c * (o * u + s * l), e.velocity = c * ((s * a - i * o) * u - (i * s + a * o) * l), Math.abs(e.value - t) < .001 && Math.abs(e.velocity) < .01 && (e.value = t, e.velocity = 0);
}
var t = /* @__PURE__ */ new Map();
function n(e, n) {
	let r = !1;
	for (let [i, a] of t) e.contains(i) && (a.update(n), a.active() && (r = !0));
	return r;
}
var r = [
	[0, 0],
	[.06, 0],
	[.087, .120633],
	[.103, .204144],
	[.12, .280965],
	[.137, .334618],
	[.154, .353436],
	[.17, .333683],
	[.187, .281121],
	[.204, .209108],
	[.22, .133635],
	[.237, .068474],
	[.254, .02284],
	[.27, .001445],
	[.287, 0]
];
function i(e) {
	for (let t = 1; t < r.length; t++) {
		let [n, i] = r[t];
		if (e <= n) {
			let [a, o] = r[t - 1];
			return o + (i - o) * Math.max(0, (e - a) / (n - a));
		}
	}
	return 0;
}
function a(e) {
	if (e <= 0) return 0;
	if (e >= 1) return 1;
	let t = 0, n = 1, r = e;
	for (let i = 0; i < 12; i++) 3 * (1 - r) ** 2 * r * .42 + 3 * (1 - r) * r ** 2 * .58 + r ** 3 < e ? t = r : n = r, r = (t + n) / 2;
	return 3 * (1 - r) * r * r + r ** 3;
}
function o(n, r, o) {
	let s = n.ownerDocument.defaultView, c = s.matchMedia("(prefers-reduced-motion: reduce)"), l = {
		value: 0,
		velocity: 0
	}, u = n.classList.contains("lg-switch-thumb"), d = 0, f = 0, p = 0, m = 0, h = 0, g = !1, _ = !1, v = !1, y = 0, b = 0, x, S = 0, C = {
		time: 0,
		from: 0,
		to: 0
	}, w = () => r === "full" && !c.matches;
	function T(t) {
		d = 0;
		let c = f ? Math.min((t - f) / 1e3, .25) : 1 / 60;
		f = t;
		let E = w(), D = o && n.dataset.pressPhase === "pressed";
		D !== g && (g = D, g ? (m = t, _ = !1) : _ = t - m < 80 && h < .5, C = {
			time: t,
			from: h,
			to: +!!g
		}, p = t + 800), h = E ? _ ? i((t - m) / 1e3) : C.from + (C.to - C.from) * a(Math.min(1, (t - C.time) / 200)) : +!!g, n.style.setProperty("--lg-control-progress", String(h)), n.dataset.glassMotion = E ? "full" : r === "none" ? "none" : "reduced";
		let O = n.getBoundingClientRect(), k = O.left + O.width / 2 - b;
		(!v || !E || !u) && (l.value = k, l.velocity = 0, v = !0), Math.abs(k - y) > .01 && (p = t + 800), y = k, E && u && e(l, y, c), b = l.value - y, u && (n.style.translate = `${b}px 0`);
		let A = u ? l.value : k;
		x !== void 0 && c > 0 && (S += ((A - x) / c - S) * Math.min(1, c * 18)), x = A, E || (S = 0);
		let j = Math.min(.28, Math.abs(S) * 7e-4) * h;
		j > 1e-4 ? n.style.scale = `${(1 + j).toFixed(4)} ${(1 / Math.sqrt(1 + j)).toFixed(4)}` : n.style.removeProperty("scale"), Math.abs(S) > 1 && (p = Math.max(p, t + 100)), t < p || Math.abs(l.velocity) > .01 ? d = s.requestAnimationFrame(T) : f = 0;
	}
	function E() {
		p = performance.now() + 800, d ||= s.requestAnimationFrame(T);
	}
	t.set(n, {
		update(e) {
			d && f !== e && (s.cancelAnimationFrame(d), T(e));
		},
		active: () => d !== 0
	});
	let D = new MutationObserver(E);
	D.observe(n, {
		attributes: !0,
		attributeFilter: ["data-press-phase"]
	}), n.parentElement && D.observe(n.parentElement, {
		attributes: !0,
		attributeFilter: [
			"style",
			"data-checked",
			"data-presentation-checked"
		]
	}), c.addEventListener("change", E);
	let O = () => {
		v = !1, E();
	};
	return s.addEventListener("scroll", O, !0), E(), () => {
		t.delete(n), s.cancelAnimationFrame(d), D.disconnect(), c.removeEventListener("change", E), s.removeEventListener("scroll", O, !0), n.style.removeProperty("--lg-control-progress"), n.style.removeProperty("scale"), u && n.style.removeProperty("translate"), delete n.dataset.glassMotion;
	};
}
//#endregion
export { o as attachNativeControlMotion, n as updateControlMotion };
