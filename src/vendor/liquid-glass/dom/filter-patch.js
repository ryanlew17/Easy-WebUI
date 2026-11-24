import { chromium as e } from "./engine.js";
import { pageZoom as t, zoomFilterMarkup as n } from "./page-zoom.js";
//#region src/dom/filter-patch.ts
var r = /* @__PURE__ */ new WeakMap(), i = "http://www.w3.org/2000/svg", a = 0;
function o(i, o, c) {
	let d = r.get(i);
	d || (d = /* @__PURE__ */ new Map(), r.set(i, d));
	let p = new Set(d.keys()), m = /* @__PURE__ */ new Map(), h = [], g = t();
	for (let t of o) {
		let r = n(t, g), o = /\bid="([^"]+)"/.exec(r)?.[1];
		if (!o) throw Error("A glass filter must have an id.");
		p.delete(o);
		let c = d.get(o);
		if (c?.element.parentElement !== i && (c = void 0), c?.markup === r) {
			m.set(o, c.id);
			continue;
		}
		let f = s(r);
		if (c) {
			let t = u(c, f, h);
			c.markup = r, t && e && c.element.setAttribute("x", f.attributes.x);
		} else {
			let e = `${o}-${++a}`, t = l(i.ownerDocument, f, h);
			t.element.setAttribute("data-filter", o), t.element.id = e, i.append(t.element), c = {
				...t,
				markup: r,
				id: e
			}, d.set(o, c);
		}
		m.set(o, c.id);
	}
	for (let e of p) d.get(e).element.remove(), d.delete(e);
	let _ = !1;
	for (let e of h) {
		let t = c(e.getAttribute("data-map"));
		t && e.getAttribute("href") !== t && (e.setAttribute("href", t), _ = !0);
	}
	return _ && e && f(i), (e) => m.get(e) ?? e;
}
function s(e) {
	let t = [], n;
	for (let r of e.matchAll(/<(\/?)([\w:-]+)([^>]*?)(\/?)>/g)) {
		let [, e, i, a, o] = r;
		if (e) {
			if (t.pop()?.tag !== i) throw Error("Unbalanced glass filter markup.");
			continue;
		}
		let s = {};
		for (let [, e, t] of a.matchAll(/([\w:-]+)="([^"]*)"/g)) s[e] = t;
		let c = {
			tag: i,
			attributes: s,
			children: []
		};
		if (t.length) t[t.length - 1].children.push(c);
		else if (n) throw Error("Expected one glass filter.");
		else n = c;
		o || t.push(c);
	}
	if (!n || t.length || n.tag !== "filter") throw Error("Invalid glass filter markup.");
	let r = /* @__PURE__ */ new Set();
	for (let e of n.children) {
		let t = e.attributes.result;
		if (t) {
			if (r.has(t)) throw Error(`Duplicate glass filter result "${t}".`);
			r.add(t);
		}
	}
	if (n.children.every((e) => [
		"feImage",
		"feFlood",
		"feTurbulence"
	].includes(e.tag) ? !0 : e.tag === "feMerge" ? e.children.every((e) => !!e.attributes.in) : !!e.attributes.in && (![
		"feBlend",
		"feComposite",
		"feDisplacementMap"
	].includes(e.tag) || !!e.attributes.in2)) && n.children.at(-1)?.tag !== "feImage") {
		let e = n.children.filter((e) => e.tag === "feImage");
		e.sort((e, t) => (e.attributes.result ?? "") < (t.attributes.result ?? "") ? -1 : +((e.attributes.result ?? "") > (t.attributes.result ?? ""))), n.children = [...e, ...n.children.filter((e) => e.tag !== "feImage")];
	}
	return n;
}
var c = (e, t) => e.attributes.result ?? `${e.tag}#${t}`;
function l(e, t, n) {
	let r = e.createElementNS(i, t.tag);
	for (let [e, n] of Object.entries(t.attributes)) r.setAttribute(e, n);
	let a = /* @__PURE__ */ new Map();
	return t.children.forEach((t, i) => {
		let o = l(e, t, n);
		a.set(c(t, i), o), r.append(o.element);
	}), t.attributes["data-map"] && n.push(r), {
		element: r,
		description: t,
		children: a
	};
}
function u(e, t, n) {
	let r = e.description.attributes;
	for (let [i, a] of Object.entries(t.attributes)) i !== "id" && r[i] !== a && (e.element.setAttribute(i, a), i === "data-map" && n.push(e.element));
	for (let n of Object.keys(r)) n !== "id" && !(n in t.attributes) && e.element.removeAttribute(n);
	let i = new Map(e.children), a = /* @__PURE__ */ new Map(), o = !1, s = new Map(t.children.map((e, t) => [c(e, t), e.tag]));
	for (let [e, t] of i) s.get(e) !== t.description.tag && (t.element.remove(), i.delete(e), o = !0);
	let d = e.element.firstElementChild;
	t.children.forEach((t, r) => {
		let s = c(t, r), f = i.get(s);
		f?.description.tag === t.tag ? (i.delete(s), o = u(f, t, n) || o) : (f = l(e.element.ownerDocument, t, n), o = !0), f.element !== d && (e.element.insertBefore(f.element, d), o = !0), d = f.element.nextElementSibling, a.set(s, f);
	});
	for (let e of i.values()) e.element.remove(), o = !0;
	return e.description = t, e.children = a, o;
}
var d = /* @__PURE__ */ new WeakMap();
function f(e) {
	let t = (d.get(e) ?? 0) + 1;
	d.set(e, t);
	for (let n of [
		16,
		100,
		300,
		700,
		1500,
		3e3
	]) setTimeout(() => {
		if (d.get(e) !== t || !e.isConnected) return;
		let n = e.querySelector("feImage");
		n?.setAttribute("x", n.getAttribute("x"));
	}, n);
}
//#endregion
export { o as patchFilters };
