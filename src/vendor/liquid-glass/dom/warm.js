//#region src/dom/warm.ts
var e = "http://www.w3.org/2000/svg", t = 0;
function n(n) {
	let r = `lg-warm-${++t}`, i = n.ownerDocument, a = i.createElementNS(e, "svg");
	a.setAttribute("aria-hidden", "true"), a.setAttribute("width", "0"), a.setAttribute("height", "0"), a.style.position = "absolute", n.append(a);
	let o = [], s = () => {
		let t = i.createElementNS(e, "filter");
		t.id = `${r}-${o.length}`;
		for (let [e, n] of Object.entries({
			x: "0",
			y: "0",
			width: "1",
			height: "1",
			filterUnits: "objectBoundingBox",
			primitiveUnits: "objectBoundingBox"
		})) t.setAttribute(e, n);
		a.append(t);
		let s = i.createElement("div");
		s.setAttribute("aria-hidden", "true"), Object.assign(s.style, {
			position: "absolute",
			left: "0",
			top: "0",
			width: "1px",
			height: "1px",
			opacity: "0.004",
			pointerEvents: "none",
			filter: `url("#${t.id}")`
		}), n.append(s);
		let c = i.createElementNS(e, "feMerge");
		t.append(c);
		let l = {
			filter: t,
			merge: c,
			element: s,
			count: 0
		};
		return o.push(l), l;
	};
	s();
	let c = /* @__PURE__ */ new Map(), l = /* @__PURE__ */ new WeakSet(), u = /* @__PURE__ */ new Map(), d, f = 0, p = (t) => {
		if (c.has(t)) return;
		if (c.size >= 96) {
			let [e, t] = c.entries().next().value;
			t.image.remove(), t.node.remove(), t.probe.count--, c.delete(e);
		}
		let n = o.find((e) => e.count < 48) ?? s(), r = `w${++f}`, a = i.createElementNS(e, "feImage");
		for (let [e, t] of Object.entries({
			x: "0",
			y: "0",
			width: "1",
			height: "1",
			preserveAspectRatio: "none",
			result: r
		})) a.setAttribute(e, t);
		let l = i.createElementNS(e, "feMergeNode");
		l.setAttribute("in", r), n.filter.insertBefore(a, n.merge), n.merge.append(l), a.setAttribute("href", t), n.count++, c.set(t, {
			image: a,
			node: l,
			probe: n
		});
	}, m = 0, h = !1, g = [], _ = () => {
		let e = ++m;
		g.forEach(clearTimeout), g = [
			16,
			60,
			150
		].map((t) => setTimeout(() => {
			if (m === e && !h) for (let { filter: e } of o) e.setAttribute("x", e.getAttribute("x") === "0" ? "0.000001" : "0");
		}, t));
	}, v = (e) => [
		e.field,
		e.overlay,
		...Object.values(e.capsule?.planes ?? {}).flat()
	], y = () => {
		let e = performance.now();
		for (let [t, n] of u) n <= e && (v(t).every((e) => c.has(e)) && l.add(t), u.delete(t));
	}, b = () => {
		if (d !== void 0 || !u.size) return;
		let e = Math.min(...u.values());
		d = setTimeout(() => {
			d = void 0, !h && (y(), b());
		}, Math.max(0, e - performance.now()));
	};
	return {
		warm(e) {
			if (h || (y(), l.has(e))) return;
			let t = v(e).filter((e) => !c.has(e));
			if (t.length) {
				for (let e of t) p(e);
				_();
			}
			(t.length || !u.has(e)) && u.set(e, performance.now() + 50), b();
		},
		has(e) {
			return !h && (y(), l.has(e));
		},
		owns(e) {
			return a.contains(e) || o.some((t) => t.element.contains(e));
		},
		dispose() {
			h = !0, g.forEach(clearTimeout), g = [], d !== void 0 && clearTimeout(d), d = void 0, u.clear(), a.remove();
			for (let { element: e } of o) e.remove();
			c.clear();
		}
	};
}
//#endregion
export { n as createMapWarmer };
