import { Spring as e, springs as t } from "../core/spring.js";
//#region src/dom/selection.ts
var n = (e) => !e.matches(":disabled, [data-disabled], [aria-disabled='true']");
function r(r, i) {
	let a = r.parentElement;
	if (!a) return {
		frame() {},
		dispose() {}
	};
	let o = r.ownerDocument.defaultView, s = {
		left: r.style.left,
		top: r.style.top,
		width: r.style.width,
		height: r.style.height,
		scale: r.style.scale
	}, c = new e(0, t.layout), l = new e(0, t.layout), u = new e(0, t.layout), d = new e(0, t.layout), f = !1, p = 0, m = !1, h = !1, g = null, _ = () => a.getAttribute("aria-orientation") === "vertical" || a.dataset.orientation === "vertical", v = () => [...a.querySelectorAll("[role=\"tab\"]")].filter((e) => e.parentElement === a || e.closest("[role=\"tablist\"]") === a), y = (e) => _() ? {
		pos: e.offsetTop,
		cross: e.offsetLeft,
		length: e.offsetHeight,
		thickness: e.offsetWidth
	} : {
		pos: e.offsetLeft,
		cross: e.offsetTop,
		length: e.offsetWidth,
		thickness: e.offsetHeight
	}, b = (e) => _() ? e.clientY : e.clientX, x = (e) => {
		let t = a.getBoundingClientRect();
		return _() ? (e - t.top) * a.offsetHeight / (t.height || 1) : (e - t.left) * a.offsetWidth / (t.width || 1);
	}, S = (e) => v().filter(n).map((t) => ({
		tab: t,
		distance: Math.abs(y(t).pos + y(t).length / 2 - e)
	})).sort((e, t) => e.distance - t.distance)[0]?.tab;
	function C(e) {
		if (e.button !== 0 || i() === "none") return;
		let t = e.target?.closest("[role=\"tab\"]");
		if (!t || !a.contains(t) || !n(t)) return;
		let r = x(b(e)), s = t.getAttribute("aria-selected") === "true";
		g = {
			id: e.pointerId,
			start: b(e),
			client: b(e),
			grab: s ? r - (c.value + u.value / 2) : 0
		}, m = !1, o.addEventListener("pointermove", w), o.addEventListener("pointerup", E), o.addEventListener("pointercancel", D);
	}
	function w(e) {
		g && e.pointerId === g.id && (g.client = b(e), m ||= Math.abs(g.client - g.start) > 4);
	}
	function T() {
		g = null, o.removeEventListener("pointermove", w), o.removeEventListener("pointerup", E), o.removeEventListener("pointercancel", D);
	}
	function E(e) {
		if (!g || e.pointerId !== g.id) return;
		let t = S(c.value + u.value / 2);
		T(), m && t && (h = !0, setTimeout(() => {
			h = !1;
		}, 0), t.getAttribute("aria-selected") !== "true" && t.click());
	}
	function D(e) {
		g && e.pointerId === g.id && T();
	}
	function O(e) {
		h && e.isTrusted && (h = !1, e.preventDefault(), e.stopPropagation());
	}
	return a.addEventListener("pointerdown", C), a.addEventListener("click", O, !0), {
		frame(e) {
			let n = p ? Math.min((e - p) / 1e3, 1 / 20) : 1 / 60;
			p = e;
			let a = i(), o = v().find((e) => e.getAttribute("aria-selected") === "true");
			if (!o) return !1;
			let h = y(o);
			if (!f || a !== "full") c.jump(h.pos), l.jump(h.cross), u.jump(h.length), d.jump(h.thickness), f = h.length > 0;
			else if (g && m && a === "full") {
				let e = v().map(y), n = Math.min(...e.map((e) => e.pos)), r = Math.max(...e.map((e) => e.pos + e.length)), i = S(x(g.client) - g.grab), a = i ? y(i).length : h.length, o = Math.max(n + a / 2, Math.min(r - a / 2, x(g.client) - g.grab));
				c.configure(t.track).target = o - a / 2, u.configure(t.track).target = a, l.target = h.cross, d.target = h.thickness;
			} else {
				for (let e of [
					c,
					l,
					u,
					d
				]) e.configure(t.layout);
				c.target = h.pos, l.target = h.cross, u.target = h.length, d.target = h.thickness;
			}
			for (let e of [
				c,
				l,
				u,
				d
			]) e.step(n);
			let b = Math.min(.2, Math.abs(c.velocity) * 35e-5) * (g ? 1 : .6), C = 1 + b, w = 1 / Math.sqrt(1 + b), T = _();
			r.style.left = `${(T ? l.value : c.value).toFixed(3)}px`, r.style.top = `${(T ? c.value : l.value).toFixed(3)}px`, r.style.width = `${(T ? d.value : u.value).toFixed(3)}px`, r.style.height = `${(T ? u.value : d.value).toFixed(3)}px`;
			let E = T ? `${w.toFixed(4)} ${C.toFixed(4)}` : `${C.toFixed(4)} ${w.toFixed(4)}`;
			return r.style.scale = Math.abs(C - 1) + Math.abs(w - 1) > 1e-4 ? E : s.scale, g ? r.dataset.glassLifted = "" : delete r.dataset.glassLifted, !f || !!g || [
				c,
				l,
				u,
				d
			].some((e) => !e.settled);
		},
		dispose() {
			T(), a.removeEventListener("pointerdown", C), a.removeEventListener("click", O, !0), Object.assign(r.style, s), delete r.dataset.glassLifted;
		}
	};
}
//#endregion
export { r as attachSelectionLens };
