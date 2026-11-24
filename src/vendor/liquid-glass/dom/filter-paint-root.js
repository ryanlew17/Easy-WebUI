//#region src/dom/filter-paint-root.ts
var e = /* @__PURE__ */ new WeakMap();
function t(e) {
	return r(e, "transform");
}
function n(e) {
	return r(e, "opacity");
}
function r(t, n) {
	let r = e.get(t);
	if (!r) {
		let n = t.style, i = t.ownerDocument.defaultView?.getComputedStyle(t).willChange ?? n.getPropertyValue("will-change");
		r = {
			hints: /* @__PURE__ */ new Map(),
			tokens: i.split(",").map((e) => e.trim()).filter((e) => e && e !== "auto"),
			original: n.getPropertyValue("will-change"),
			priority: n.getPropertyPriority("will-change"),
			owned: null,
			superseded: !1
		}, e.set(t, r);
	}
	let i = () => {
		let e = t.style;
		if ((e.getPropertyValue("will-change") !== (r.owned ?? r.original) || e.getPropertyPriority("will-change") !== (r.owned === null ? r.priority : "important")) && (r.superseded = !0), r.superseded) return;
		let n = [...r.hints.keys()].filter((e) => !r.tokens.includes(e));
		if (n.length) {
			let t = [...r.tokens, ...n].join(", ");
			t !== r.owned && e.setProperty("will-change", t, "important"), r.owned = e.getPropertyValue("will-change");
		} else r.owned !== null && (r.original ? e.setProperty("will-change", r.original, r.priority) : e.removeProperty("will-change"), r.owned = null);
	};
	r.hints.set(n, (r.hints.get(n) ?? 0) + 1), i();
	let a = !1;
	return () => {
		if (a) return;
		a = !0;
		let o = r.hints.get(n) - 1;
		o ? r.hints.set(n, o) : r.hints.delete(n), i(), r.hints.size || e.delete(t);
	};
}
//#endregion
export { t as acquireFilterPaintRoot, n as acquireSceneCompositingLayer };
