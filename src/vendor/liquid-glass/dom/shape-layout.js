import { cornerOptions as e } from "../core/shape.js";
import { concentricOutline as t, contentInsets as n, cornerPlacement as r, insetShape as i, polygonClip as a } from "../core/concentric.js";
import { createTicker as o } from "./ticker.js";
import { getLayoutSize as s } from "../deps/lisse.js";
//#region src/dom/shape-layout.ts
var c = /* @__PURE__ */ new Set(), l, u = /* @__PURE__ */ new Map();
function d() {
	u = /* @__PURE__ */ new Map();
	let e = [], t = !1;
	for (let n of c) try {
		let r = n();
		r?.changed && (t = !0), e.push(r?.write);
	} catch (e) {
		c.delete(n), queueMicrotask(() => {
			throw e;
		});
	}
	return {
		active: t,
		write: () => {
			for (let t of e) t?.();
		}
	};
}
function f(e, ...t) {
	c.add(e), l ??= o(d, { root: document });
	for (let e of t) l.observe(e);
	return l.wake(), () => {
		c.delete(e);
		for (let e of t) l?.unobserve(e);
		c.size || (l?.dispose(), l = void 0);
	};
}
function p(e) {
	e && l?.observe(e), l?.wake();
}
function m(t) {
	return e(t), {
		"data-lg-container": "",
		"data-lg-container-radius": String(t)
	};
}
function h(e, t) {
	let n = m(t), r = Object.keys(n).map((t) => [t, e.getAttribute(t)]);
	for (let [t, r] of Object.entries(n)) e.getAttribute(t) !== r && e.setAttribute(t, r);
	let i = !1;
	return () => {
		if (!i) {
			i = !0;
			for (let [t, n] of r) n === null ? e.removeAttribute(t) : e.setAttribute(t, n);
		}
	};
}
var g = /* @__PURE__ */ new WeakMap();
function _(e, t) {
	t ? g.set(e, t) : g.delete(e);
}
function v(e) {
	let t = e.getAttribute("data-lg-container-radius");
	if (t === null) throw Error("Declare the container with GlassShapeContainer, GlassShape, GlassSurface, or registerShapeContainer.");
	let { width: n, height: r } = s(e);
	return {
		width: n,
		height: r,
		radius: t === "circle" || t === "capsule" ? t : Number(t),
		outline: g.get(e)
	};
}
function y(e, t) {
	if (t) return t();
	let n = e.parentElement?.closest("[data-lg-container]");
	if (!n && e.isConnected) throw Error("Container-relative geometry requires a declared shape container.");
	return n ?? null;
}
function b(e, r = {}, o) {
	if (r.contentPadding !== void 0 && (!Number.isFinite(r.contentPadding) || r.contentPadding < 0)) throw RangeError("Content padding must be finite and nonnegative.");
	let c = h(e, r.radius ?? 8), l = {
		clipPath: e.style.clipPath,
		paddingLeft: e.style.paddingLeft,
		paddingRight: e.style.paddingRight
	}, d = "", m = "", g = [], b = "", x = "", S, C = [], w, T = f(() => {
		let c = y(e, o);
		if (!c || !e.isConnected) return;
		c !== w && (w = c, p(c));
		let l = v(c), f = s(e), h = c.getBoundingClientRect(), T = e.getBoundingClientRect();
		if (!l.width || !l.height || !f.width || !f.height || !h.width || !h.height) return;
		let E = (T.left - h.left) * l.width / h.width, D = (T.top - h.top) * l.height / h.height, O = JSON.stringify([
			l,
			f.width,
			f.height,
			E,
			D,
			r
		]), k = d !== O;
		if (k) {
			d = O;
			let o = r.inset ?? Math.max(0, Math.min(E, D, l.width - E - f.width, l.height - D - f.height)), s = JSON.stringify([l, o]);
			s !== m && (g = i(l, o), m = s);
			let c = t(g, {
				x: E,
				y: D,
				width: f.width,
				height: f.height
			}, r.radius ?? 8);
			b = a(c), C = c;
			let u = Math.min(f.height, Math.max(16, parseFloat(getComputedStyle(e).lineHeight) || 20));
			S = r.contentPadding === void 0 ? void 0 : n(c, f.width, f.height, u);
		}
		if (S) {
			let e = u.get(c) ?? {
				left: 0,
				right: 0
			};
			e.left = Math.max(e.left, S.left), e.right = Math.max(e.right, S.right), u.set(c, e);
		}
		return {
			changed: k,
			write: () => {
				if (_(e, C), x !== b && (e.style.clipPath = b, x = b), S) {
					let t = u.get(c), n = `${t.left + r.contentPadding}px`, i = `${t.right + r.contentPadding}px`;
					e.style.paddingLeft !== n && (e.style.paddingLeft = n), e.style.paddingRight !== i && (e.style.paddingRight = i);
				}
			}
		};
	}, e);
	return () => {
		T(), c(), _(e), Object.assign(e.style, l);
	};
}
function x(e, t = {}, n) {
	let i = {
		left: e.style.left,
		top: e.style.top,
		right: e.style.right,
		bottom: e.style.bottom
	}, a = "", o = "", c = 0, l, u = f(() => {
		let i = y(e, n);
		if (!i || !e.isConnected) return;
		i !== l && (l = i, p(i));
		let u = v(i), d = s(e), f = i.getBoundingClientRect();
		if (!u.width || !u.height || !d.width || !d.height || !f.width || !f.height) return;
		let m = getComputedStyle(e).position === "fixed" ? null : e.offsetParent, h = m?.getBoundingClientRect(), g = JSON.stringify([
			u,
			d.width,
			d.height,
			f.x,
			f.y,
			f.width,
			f.height,
			h?.x,
			h?.y,
			m?.scrollLeft,
			m?.scrollTop,
			t
		]);
		if (g === a) return { changed: !1 };
		a = g;
		let _ = JSON.stringify([
			u,
			d.width,
			d.height,
			t
		]);
		_ !== o && (c = r(u, d.width, d.height, t.gap ?? 8, t.radius ?? "circle"), o = _);
		let b = c, x = t.corner ?? "top-right", S = x.endsWith("right") ? u.width - b - d.width : b, C = x.startsWith("bottom") ? u.height - b - d.height : b, w = f.width / u.width, T = f.height / u.height, E = m && h ? h.width / m.offsetWidth : 1, D = m && h ? h.height / m.offsetHeight : 1, O = (f.left + S * w - (h?.left ?? 0)) / E + (m?.scrollLeft ?? 0) - (m?.clientLeft ?? 0), k = (f.top + C * T - (h?.top ?? 0)) / D + (m?.scrollTop ?? 0) - (m?.clientTop ?? 0);
		return {
			changed: !0,
			write: () => {
				e.style.left = `${O}px`, e.style.top = `${k}px`, e.style.right = "auto", e.style.bottom = "auto";
			}
		};
	}, e);
	return () => {
		u(), Object.assign(e.style, i);
	};
}
function S(e, n, r) {
	let a = "", o = [];
	return () => {
		let c = y(e);
		if (!c) return;
		let l = v(c), u = s(e), d = c.getBoundingClientRect(), f = e.getBoundingClientRect();
		if (!l.width || !l.height || !d.width || !d.height || !u.width || !u.height) return;
		let p = {
			x: (f.left - d.left) * l.width / d.width,
			y: (f.top - d.top) * l.height / d.height,
			width: u.width,
			height: u.height
		}, m = JSON.stringify([
			l,
			p,
			n,
			r
		]), h = n ?? Math.max(0, Math.min(p.x, p.y, l.width - p.x - p.width, l.height - p.y - p.height));
		return m !== a && (o = t(i(l, h), p, r), a = m), o;
	};
}
//#endregion
export { S as createConcentricResolver, b as observeConcentricShape, x as observeCornerPlacement, h as registerShapeContainer, _ as setResolvedShape, m as shapeContainerAttributes, p as wakeShapeLayout };
