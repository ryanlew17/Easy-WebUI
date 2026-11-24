import { webkit as e } from "./engine.js";
import { Spring as t, settleTime as n, springs as r } from "../core/spring.js";
import { contentReveal as i, morphDraw as a, morphShape as o, openingAxis as ee, planMorph as s, radiusPixels as te, sourceConceal as ne } from "../core/morph-path.js";
import { finishRetainedExit as re, retainLatestExit as ie } from "./exit-handoff.js";
import { getLayoutSize as c } from "../deps/lisse.js";
//#region src/dom/morph.ts
var l = (t) => e ? Math.max(4, Math.round(t / 2)) : t, ae = 140, oe = 1 / 60, u = /* @__PURE__ */ new WeakMap(), d = /* @__PURE__ */ new WeakMap();
function f(e) {
	let t = e.parentElement?.closest(".lg-menu"), n = t ? d.get(t) : void 0;
	return n?.visible() && n.trigger() !== e ? n.retain() : () => {};
}
function p(e) {
	if (!(e instanceof HTMLElement)) return () => {};
	u.set(e, (u.get(e) ?? 0) + 1), e.dataset.glassMorphSource = "";
	let t = !1;
	return () => {
		if (t) return;
		t = !0;
		let n = (u.get(e) ?? 1) - 1;
		n > 0 ? u.set(e, n) : (u.delete(e), delete e.dataset.glassMorphSource, e.style.removeProperty("--lg-morph-source"));
	};
}
function m(e) {
	let t = e.getBoundingClientRect();
	return {
		left: t.left,
		top: t.top,
		width: t.width,
		height: t.height
	};
}
var h = (e) => {
	let t = e.getAttribute("data-lg-container-radius");
	if (t === "capsule" || t === "circle") return t;
	let n = Number(t);
	return Number.isFinite(n) && t !== null ? n : e.classList.contains("lg-surface") ? 8 : 0;
}, g = (e) => c(e), se = (e, t) => Math.hypot(e.left - t.left, e.top - t.top) > 1 || ce(e, t), ce = (e, t) => Math.abs(e.width - t.width) > .5 || Math.abs(e.height - t.height) > .5;
function _(c, u) {
	let f = {
		duration: .32,
		bounce: .1
	}, _ = u.submenu ? {
		duration: .22,
		bounce: 0
	} : r.morph, le = u.submenu ? {
		duration: .14,
		bounce: 0
	} : r.glow, v = new t(0, r.morph), y = new t(1, le), b = null, x = null, S = "become", C = {
		left: 0,
		top: 0,
		width: 0,
		height: 0
	}, w, T, E = !1, D, O = 0, ue = 0, k, A, j = !1, M = !1, N = !1, P = 0, F = !1, I, L, R = null, z, B = 0, V = 0, H = {
		element: c,
		visible: () => !F,
		trigger: () => u.from?.(),
		retain: () => {
			B++, D?.pause();
			let e = !1;
			return () => {
				e || (e = !0, --B === 0 && !F && (O = performance.now(), D?.play()));
			};
		},
		snapshot: () => A ?? (P && L ? L.snapshot() : m(c)),
		finish: () => {
			T?.(), T = void 0, j = !1, F = !0, P = 0, v.jump(0), y.jump(0), A = void 0, c.style.setProperty("--lg-morph", "0"), D?.finish(), c.dispatchEvent(new CustomEvent("glass:exited"));
		}
	}, U = (e, t) => u.radius === "capsule" ? "capsule" : te(u.radius, e, t), W = () => Math.min(devicePixelRatio || 1, 2), G = () => {
		if (!u.submenu || L) return;
		R = u.from?.()?.parentElement?.closest(".lg-menu") ?? null;
		let e = R ? d.get(R) : void 0;
		e !== H && e?.element.isConnected && e.visible() && (L = e, z = e.retain());
	}, K = () => {
		if (b = u.from?.() ?? null, u.submenu) {
			G(), b = L?.element ?? null, x = null, S = "become", L && (C = { ...L.snapshot() }), N = !L;
			return;
		}
		let e = b?.classList.contains("lg-surface") ? b : null, t = b?.parentElement?.closest(".lg-surface") ?? null;
		S = u.morph ?? (e ? "become" : "detach"), x = S === "become" ? e : e ?? (t && !t.contains(c) ? t : null), S === "become" && x && (b = x), b?.isConnected && (C = m(b)), N = !b?.isConnected || !C.width || !C.height;
	}, q = () => {
		let e = m(c), t = g(c);
		if (!t.width || !t.height || N || !b) {
			k = void 0;
			return;
		}
		let n = {
			from: { ...C },
			fromRadius: h(b),
			to: e,
			toRadius: u.radius,
			along: ee(C, e)
		}, r = S === "detach" && x?.isConnected ? (() => {
			let e = m(x), t = g(x);
			return {
				...e,
				radius: h(x),
				layoutWidth: t.width || e.width,
				layoutHeight: t.height || e.height
			};
		})() : void 0, i = u.neck ?? 18, a = s(n, i > 0 ? r : void 0, {
			dpr: 1,
			restDpr: W(),
			neck: i,
			stops: l(i > 0 ? 14 : 10)
		});
		if (S === "become" && x) {
			let e = g(x);
			e.width && e.height && Object.assign(a[0].shape, {
				width: e.width,
				height: e.height
			});
		}
		Object.assign(a.at(-1).shape, {
			width: t.width,
			height: t.height
		});
		let o = i > 0 && r ? x ?? void 0 : void 0;
		k = {
			endpoints: n,
			stops: a,
			shapes: a.map((e) => e.shape),
			glass: S === "become" ? x ?? void 0 : o,
			glassRect: o && r ? {
				left: r.left,
				top: r.top,
				width: r.width,
				height: r.height
			} : void 0
		};
	}, J = () => !k || !u.prepared || k.stops.every((e) => u.prepared(e.shape)) ? !0 : !k.stops.some((e) => e.shape.outline) && u.prepared(k.stops.at(-1).shape);
	function de() {
		if (u.motion() === "none") return;
		T?.(), T = void 0, K(), R && d.set(R, H), E = !0, S === "become" && x && !N && (w?.(), w = p(x)), j = !0, M = !1, F = !1;
		let e = N || u.motion() === "reduced";
		v.configure(_).jump(+!!e), e ? (k = void 0, P = 0) : (q(), P = ue || performance.now()), y.jump(+!e).target = 1, c.dataset.glassMorph = "enter", c.style.setProperty("--lg-morph", "0");
	}
	function fe() {
		if (u.motion() === "none") return;
		E = !1, u.submenu && (k = void 0, N = !0, z?.(), z = void 0, L = void 0), j || (u.submenu || K(), !N && u.motion() !== "reduced" ? (S === "become" && x && (w ??= p(x)), !k || se(k.endpoints.to, m(c)) ? q() : k.endpoints.from = { ...C }, v.jump(1)) : k = void 0), j = !0, M = !0, P = 0;
		let e = !k || N || u.motion() === "reduced";
		v.configure(f).target = +!!e, y.target = +!e, c.dataset.glassMorph = "exit";
		let t = e ? n(le, y.value, 0, y.velocity) : n(f, v.value, 0, v.velocity, .01);
		D?.cancel(), O = performance.now();
		let r = u.submenu ? 60 : 0;
		V = O + r, D = c.animate([{}, {}], { duration: Math.max(16, t * 1e3 + 40 + r) }), B && D.pause();
		let i = u.submenu ? R : b?.parentElement?.closest(".lg-menu");
		i && (T = ie(i, () => {
			M && !F && (T?.(), T = void 0, j = !1, F = !0, P = 0, v.jump(0), y.jump(0), A = void 0, c.style.setProperty("--lg-morph", "0"), w?.(), w = void 0, D?.finish(), c.dispatchEvent(new CustomEvent("glass:exited")));
		}));
	}
	function Y() {
		T?.(), T = void 0, E = !1, j = !1, M = !1, P = 0, D = void 0, delete c.dataset.glassMorph, c.style.removeProperty("--lg-morph");
	}
	let pe = new MutationObserver(() => {
		let e = c.hasAttribute("data-ending-style");
		e && !M ? fe() : !e && !c.hasAttribute("data-closed") && F && !M ? (F = !1, Z = u.enter !== !1 && u.motion() !== "none", Q = void 0, me = 0, $ = 0, Z && (G(), c.dataset.glassMorph = "enter", c.style.setProperty("--lg-morph", "0"))) : !e && !c.hasAttribute("data-closed") && M && (T?.(), T = void 0, E = !0, R && d.set(R, H), F && (F = !1, S === "become" && x && (w ??= p(x))), D?.cancel(), D = void 0, M = !1, j = !0, v.configure(_).target = 1, y.target = 1, P = u.motion() === "full" && k && !J() ? performance.now() : 0, c.dataset.glassMorph = "enter");
	}), X = !!u.from && c.hasAttribute("data-ending-style");
	F = !!u.from && !X && c.hasAttribute("data-closed");
	let Z = !!u.from && u.enter !== !1 && !X && !F && u.motion() !== "none", Q, me = 0, $ = 0;
	u.from && pe.observe(c, {
		attributes: !0,
		attributeFilter: ["data-ending-style", "data-closed"]
	}), X && u.motion() !== "none" && fe(), Z && (G(), c.dataset.glassMorph = "enter", c.style.setProperty("--lg-morph", "0"));
	let he = (e, t) => {
		if (!e.box) return {
			shape: e.shape,
			...t
		};
		let n = k?.glassRect, r = n && k?.glass?.isConnected ? m(k.glass) : void 0, i = r && n ? r.left - n.left : 0, a = r && n ? r.top - n.top : 0;
		return {
			shape: e.shape,
			left: e.box.left + i,
			top: e.box.top + a,
			width: e.box.width,
			height: e.box.height
		};
	}, ge = (e, t) => {
		let n = k ? a(k.stops, e) : void 0, r = !k?.glass || !n ? 0 : S === "become" ? 1 : n.absorb;
		return {
			...t,
			draw: n && {
				a: he(n.a, t),
				b: n.b && he(n.b, t),
				mix: n.mix
			},
			absorbs: r > 0 && k?.glass ? {
				element: k.glass,
				weight: r
			} : void 0
		};
	};
	return {
		frame(e) {
			let t = O ? Math.max(0, (e - O) / 1e3) : oe;
			if (O = e, ue = e, B && M && !F) return !0;
			if (M && u.submenu && (t = Math.min(t, Math.max(0, (e - V) / 1e3))), Z) {
				let e = m(c), n = !c.hasAttribute("data-starting-style") && Q && Math.hypot(e.left - Q.left, e.top - Q.top) < .5 && Math.abs(e.width - Q.width) < .5 && Math.abs(e.height - Q.height) < .5;
				Q = e, $ = n ? $ + 1 : 0, ($ >= 2 || ++me > 8) && (Z = !1, t = 0, c.hasAttribute("data-ending-style") || de(), j || Y());
			}
			if (u.layout && !j) {
				let e = {
					x: c.offsetLeft,
					y: c.offsetTop,
					width: c.offsetWidth,
					height: c.offsetHeight
				};
				if (I && e.width && e.height && u.motion() === "full" && [
					e.x - I.x,
					e.y - I.y,
					e.width - I.width,
					e.height - I.height
				].some((e) => Math.abs(e) > .5)) {
					let n = k?.layout && A ? {
						left: A.left - k.layout.x,
						top: A.top - k.layout.y,
						width: A.width,
						height: A.height
					} : {
						left: I.x,
						top: I.y,
						width: I.width,
						height: I.height
					}, i = {
						from: n,
						fromRadius: U(n.width, n.height),
						to: {
							left: e.x,
							top: e.y,
							width: e.width,
							height: e.height
						},
						toRadius: u.radius
					}, a = s(i, void 0, {
						stops: l(12),
						dpr: 1,
						restDpr: W()
					});
					k = {
						endpoints: i,
						stops: a,
						shapes: a.map((e) => e.shape),
						layout: e
					}, v.configure(r.layout).jump(0).target = 1, t = 0;
				}
				e.width && e.height && (I = e);
			}
			if (P && (J() || e - P > ae) && (P = 0, v.target = 1, t = 0), P && (t = 0), E && !P) {
				E = !1, L?.finish(), z?.(), z = void 0, L = void 0;
				let e = u.submenu ? R : b?.parentElement?.closest(".lg-menu");
				e && re(e);
			}
			v.step(t), y.step(t);
			let n = () => {
				let e = Z || j || P > 0 || !v.settled || !y.settled;
				return e || (O = 0), e;
			}, a = M && k && !N && u.motion() === "full" && v.value <= .012 && Math.abs(v.velocity) <= .15;
			if (j && !P && (a || v.settled && y.settled) && (M ? (T?.(), T = void 0, j = !1, F = !0, k && v.jump(0), w?.(), w = void 0, c.dispatchEvent(new CustomEvent("glass:exited"))) : Y()), k?.layout) {
				if (v.settled && v.value === 1) return k = void 0, A = void 0, n();
				let e = m(c), t = v.value, r = o(k.endpoints, t), i = k.layout, a = {
					left: e.left + r.left - i.x,
					top: e.top + r.top - i.y,
					width: r.width,
					height: r.height,
					radius: r.radius
				};
				return A = {
					...ge(t, a),
					radius: U(r.width, r.height)
				}, !0;
			}
			if (F) return A = void 0, n();
			if (j && k) {
				if (b?.isConnected && !M) {
					let t = m(c);
					ce(k.endpoints.to, t) ? P || (C = m(b), q(), J() || (P = e)) : se(k.endpoints.to, t) && (k.endpoints.to = t);
				}
				let t = v.value, r = o(k.endpoints, t);
				return c.style.setProperty("--lg-morph", (i(t) * y.value).toFixed(3)), S === "become" && x instanceof HTMLElement && x.style.setProperty("--lg-morph-source", ne(t).toFixed(3)), A = ge(t, r), n();
			}
			return j ? (c.style.setProperty("--lg-morph", y.value.toFixed(3)), A = void 0, n()) : (A = void 0, n());
		},
		geometry: () => A,
		detachedSource: () => !F && S === "detach" && x?.isConnected && k?.stops.some((e) => e.absorbs) ? x : void 0,
		waypoints: () => k?.shapes ?? [],
		pending: () => P > 0,
		positioning: () => Z,
		opacity() {
			return F || Z ? 0 : j ? k ? u.submenu || k.glass ? 1 : Math.min(1, Math.max(0, v.value / .2)) : e && !u.submenu ? 1 : y.value : 1;
		},
		dispose() {
			z?.(), z = void 0, R && d.get(R) === H && d.delete(R), pe.disconnect(), D?.cancel(), w?.(), Y();
		}
	};
}
//#endregion
export { _ as attachGeometryMotion, f as prepareSubmenuHandoff, te as radiusPixels };
