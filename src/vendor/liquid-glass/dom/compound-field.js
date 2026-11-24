import { surfaceMapResult as e } from "./map-image.js";
//#region src/dom/compound-field.ts
var t = (e, t, n = 0) => e.x < t.x + t.w + n && t.x - n < e.x + e.w && e.y < t.y + t.h + n && t.y - n < e.y + e.h;
function n(e, n) {
	let r = new Map(e.map((e) => [e, n.source(e)])), i = /* @__PURE__ */ new Map();
	for (let e of r.values()) e && i.set(e, (i.get(e) ?? 0) + 1);
	let a = /* @__PURE__ */ new Map();
	for (let [o, s] of e.entries()) {
		let c = r.get(s), l = c && e.find((e) => e.element === c);
		if (!l || l === s || !l.maps || !s.maps || i.get(c) !== 1 || r.get(l) || i.has(s.element) || (l.baseOpacity ?? l.opacity) < .999 || (s.baseOpacity ?? s.opacity) < .999 || n.nested(l) || n.nested(s)) continue;
		let u = l.options, d = s.options;
		if ((u.material ?? "clear") !== (d.material ?? "clear") || (u.appearance ?? "light") !== (d.appearance ?? "light") || u.tint !== d.tint || n.refraction(l) !== n.refraction(s)) continue;
		let f = e.indexOf(l);
		f >= o || e.slice(f + 1, o).some((e) => e.maps && e.opacity >= .001 && t(l, e, Math.max(n.reach(l), n.reach(e)))) || a.set(s, l);
	}
	return a;
}
function r(t, n, r, i, a, o) {
	let s = `x="${a.x}" y="${a.y}" width="${a.width}" height="${a.height}"`, c = e(t.serial, r), l = e(n.serial, r), u = Math.max(0, Math.min(1, t.opacity / (t.baseOpacity || 1))), d = (e, t) => `<feMerge result="${i}" ${s}><feMergeNode in="${e}"/><feMergeNode in="${t}"/></feMerge>`, f = `<feComponentTransfer in="${c}" result="${c}faded" ${s}><feFuncA type="linear" slope="${u}"/></feComponentTransfer>`, p = o(t, r, c) + o(n, r, l) + f;
	return r === "field" ? p + d(`${c}faded`, l) : p + `<feComposite in="${c}faded" in2="${e(n.serial, "field")}" operator="out" result="${c}under" ${s}/>` + d(`${c}under`, l);
}
//#endregion
export { r as compoundFieldImage, n as compoundSources, t as fieldTouches };
