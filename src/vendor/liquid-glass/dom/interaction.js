import { Spring as e, rubberBand as t, springs as n } from "../core/spring.js";
//#region src/dom/interaction.ts
var r;
function i(e) {
	return e === "none" || e === "reduced" ? e : typeof matchMedia == "function" ? (r ??= matchMedia("(prefers-reduced-motion: reduce)"), r.matches ? "reduced" : "full") : "full";
}
var a = /* @__PURE__ */ new WeakSet(), o = "(hover: hover) and (pointer: fine)";
function s(e) {
	return e.matches(":disabled, [data-disabled], [aria-disabled='true']");
}
function c(r, i) {
	let c = r.ownerDocument.defaultView, l = {
		translate: r.style.translate,
		scale: r.style.scale
	}, u = new e(0, n.track), d = new e(0, n.track), f = new e(0, n.press), p = new e(0, n.glow), m = null, h = !1, g = !1, _ = 0, v = !1, y = 0, b = 0, x = 0, S = 0, C = (e, t) => {
		r.style.getPropertyValue(e) !== t && r.style.setProperty(e, t);
	}, w = () => ({
		width: r.offsetWidth || 1,
		height: r.offsetHeight || 1
	}), T = () => {
		let e = r.getBoundingClientRect(), { width: t, height: n } = w();
		return {
			cx: e.left + e.width / 2 - u.value,
			cy: e.top + e.height / 2 - d.value,
			width: t,
			height: n,
			rect: e,
			ratioX: t / (e.width || 1),
			ratioY: n / (e.height || 1)
		};
	}, E = (e, t) => {
		let { rect: n, ratioX: r, ratioY: i } = T();
		y = (e - n.left) * r, b = (t - n.top) * i;
	}, D = (e, t, n) => {
		e.configure(n).target = t;
	};
	function O(e) {
		m && e.pointerId === m.id && (m.clientX = e.clientX, m.clientY = e.clientY);
	}
	function k(e) {
		(!e || m && e.pointerId === m.id) && (m = null, c.removeEventListener("pointermove", O), c.removeEventListener("pointerup", k), c.removeEventListener("pointercancel", k), D(f, 0, n.release), D(u, 0, n.release), D(d, 0, n.release), D(p, g ? .35 : 0, n.glow));
	}
	function A(e) {
		if (a.has(e) || e.button !== 0 || s(r)) return;
		a.add(e);
		let { cx: t, cy: i } = T();
		m = {
			id: e.pointerId,
			x: e.clientX,
			y: e.clientY,
			cx: t,
			cy: i,
			clientX: e.clientX,
			clientY: e.clientY,
			lastX: t,
			lastY: i
		}, x = S = 0, E(e.clientX, e.clientY), D(f, 1, n.press), D(p, 1, n.press);
		let { width: o, height: l } = w(), h = {
			duration: n.track.duration + 5e-4 * Math.max(o, l),
			bounce: 0
		};
		D(u, 0, h), D(d, 0, h), c.addEventListener("pointermove", O), c.addEventListener("pointerup", k), c.addEventListener("pointercancel", k);
	}
	function j(e) {
		e.pointerType !== "touch" && c.matchMedia(o).matches && (g = e.type !== "pointerleave", g && E(e.clientX, e.clientY), !m && !h && D(p, g ? .35 : 0, n.glow));
	}
	function M(e) {
		if (e.key === " " || e.key === "Enter") {
			if (e.type === "keydown") {
				if (e.repeat || a.has(e) || s(r) || m) return;
				a.add(e), h = !0;
				let { width: t, height: i } = w();
				y = t / 2, b = i / 2, D(f, 1, n.press), D(p, 1, n.press);
			} else h && (h = !1, D(f, 0, n.release), D(p, g ? .35 : 0, n.glow));
		}
	}
	let N = () => {
		h && (h = !1, D(f, 0, n.release), D(p, 0, n.glow));
	};
	return r.addEventListener("pointerdown", A), r.addEventListener("pointerenter", j), r.addEventListener("pointermove", j), r.addEventListener("pointerleave", j), r.addEventListener("keydown", M), r.addEventListener("keyup", M), r.addEventListener("focusout", N), {
		frame(e, n) {
			if (n) return _ = e, !0;
			let a = _ ? Math.max(0, (e - _) / 1e3) : 1 / 60;
			_ = e;
			let o = i(), { width: s, height: c } = w();
			if (m) {
				let { cx: e, cy: n } = T(), r = Math.max(s, c) <= 72, i = r ? m.clientX - m.x - (e - m.cx) : m.clientX - Math.max(e - s / 2, Math.min(e + s / 2, m.clientX)), o = r ? m.clientY - m.y - (n - m.cy) : m.clientY - Math.max(n - c / 2, Math.min(n + c / 2, m.clientY)), l = r ? 4 + .15 * Math.max(s, c) : Math.min(10, 3 + .04 * Math.max(s, c));
				u.target = t(i, l), d.target = t(o, l), E(m.clientX, m.clientY), x += ((e - m.lastX) / a - x) * Math.min(1, a * 12), S += ((n - m.lastY) / a - S) * Math.min(1, a * 12), m.lastX = e, m.lastY = n;
			} else x *= Math.exp(-a * 10), S *= Math.exp(-a * 10);
			for (let e of [
				u,
				d,
				f,
				p
			]) e.step(a);
			let g = o === "full", D = g ? Math.min(.16, 8 / Math.max(s, c)) * f.value : 0, O = Math.max(s, c) <= 72 ? .2 : .12, k = g ? Math.min(O, .5 * Math.abs(u.value) / s + 7e-5 * Math.abs(u.velocity) + 5e-5 * Math.abs(x)) : 0, A = g ? Math.min(O, .5 * Math.abs(d.value) / c + 7e-5 * Math.abs(d.velocity) + 5e-5 * Math.abs(S)) : 0, j = (1 + D) * (1 + k) / Math.sqrt(1 + A), M = (1 + D) * (1 + A) / Math.sqrt(1 + k), N = g && (Math.abs(u.value) > .01 || Math.abs(d.value) > .01), P = Math.abs(j - 1) > 1e-4 || Math.abs(M - 1) > 1e-4, F = p.value > .001;
			if (N || P || F || m || h) v = !0, C("translate", N ? `${u.value.toFixed(3)}px ${d.value.toFixed(3)}px` : l.translate), C("scale", P ? `${j.toFixed(5)} ${M.toFixed(5)}` : l.scale), C("--lg-glow", F ? p.value.toFixed(4) : "0"), C("--lg-glow-x", `${y.toFixed(2)}px`), C("--lg-glow-y", `${b.toFixed(2)}px`), C("--lg-glow-size", `${Math.max(36, Math.min(180, Math.max(s, c) * .9)).toFixed(1)}px`), m || h ? r.dataset.glassPressed !== "" && (r.dataset.glassPressed = "") : r.dataset.glassPressed !== void 0 && delete r.dataset.glassPressed;
			else if (v) {
				v = !1, r.style.translate = l.translate, r.style.scale = l.scale;
				for (let e of [
					"--lg-glow",
					"--lg-glow-x",
					"--lg-glow-y",
					"--lg-glow-size"
				]) r.style.removeProperty(e);
				delete r.dataset.glassPressed;
			}
			let I = !!m || [
				u,
				d,
				f,
				p
			].some((e) => !e.settled);
			return I || (_ = 0), I;
		},
		dispose() {
			k(), r.removeEventListener("pointerdown", A), r.removeEventListener("pointerenter", j), r.removeEventListener("pointermove", j), r.removeEventListener("pointerleave", j), r.removeEventListener("keydown", M), r.removeEventListener("keyup", M), r.removeEventListener("focusout", N), r.style.translate = l.translate, r.style.scale = l.scale;
			for (let e of [
				"--lg-glow",
				"--lg-glow-x",
				"--lg-glow-y",
				"--lg-glow-size"
			]) r.style.removeProperty(e);
			delete r.dataset.glassPressed;
		}
	};
}
//#endregion
export { c as attachInteraction, i as resolveMotion };
