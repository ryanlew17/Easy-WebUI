import { materials as e } from "../core/materials.js";
import { mapImage as t } from "./map-image.js";
//#region src/dom/foreground.ts
function n(e, t) {
	if (e === t) return 0;
	let n = (e) => {
		let t = [];
		for (let n = e; n; n = n.parentElement) t.unshift(n);
		return t;
	}, r = n(e), i = n(t), a = 0;
	for (; r[a] && r[a] === i[a];) a++;
	let o = (e) => {
		for (let t of e.slice(a)) {
			let e = getComputedStyle(t);
			if (e.zIndex !== "auto" && e.position !== "static") return Number(e.zIndex) || 0;
		}
		return 0;
	};
	return o(r) - o(i) || (e.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
}
function r(e, t) {
	return e.x < t.x + t.w && t.x < e.x + e.w && e.y < t.y + t.h && t.y < e.y + e.h;
}
function i(n, r, i) {
	let a = r.w > 0 ? (r.element?.offsetWidth || r.w) / r.w : 1, o = r.h > 0 ? (r.element?.offsetHeight || r.h) / r.h : 1, s = Math.max(a, o), c = Math.abs(a - o) > 1e-6, l = [], u = "SourceGraphic";
	for (let [n, d] of i.entries()) {
		if (!d.maps) continue;
		let i = `f${n}`, f = d.x - r.x - 2, p = d.y - r.y - 2, m = (e, n) => t(d.maps, e, n, f, p, d.w + 4, d.h + 4, 1 / a, 1 / o), h = (e = 0) => `x="${(f - e) * a}" y="${(p - e) * o}" width="${(d.w + 4 + 2 * e) * a}" height="${(d.h + 4 + 2 * e) * o}"`, g = h(), _ = d.opacity >= 1;
		l.push(m("field", `${i}raw`)), c && l.push(`<feComponentTransfer in="${i}raw" ${g} result="${i}map"><feFuncR type="linear" slope="${a / s}" intercept="${(1 - a / s) / 2}"/><feFuncG type="linear" slope="${o / s}" intercept="${(1 - o / s) / 2}"/></feComponentTransfer>`), _ || l.push(`<feComponentTransfer in="${i}raw" ${g} result="${i}mask"><feFuncA type="linear" slope="${d.opacity}"/></feComponentTransfer>`);
		let v = c ? `${i}map` : `${i}raw`, y = _ ? `${i}raw` : `${i}mask`, b = e[d.options.material ?? "clear"].blur, x = d.options.refraction ?? e[d.options.material ?? "clear"].refraction;
		b > 0 && l.push(`<feGaussianBlur in="${u}" ${h(Math.ceil(3 * b + Math.abs(x) + 2))} stdDeviation="${b * a} ${b * o}" result="${i}blur"/>`), l.push(`<feDisplacementMap in="${b > 0 ? `${i}blur` : u}" in2="${v}" ${g} scale="${x * 2 * s}" xChannelSelector="R" yChannelSelector="G" result="${i}refracted"/>`), l.push(`<feComposite in="${i}refracted" in2="${y}" operator="in" ${g} result="${i}inside"/><feComposite in="${u}" in2="${y}" operator="out" result="${i}outside"/><feMerge result="${i}result"><feMergeNode in="${i}outside"/><feMergeNode in="${i}inside"/></feMerge>`), u = `${i}result`;
	}
	return `<filter id="${n}" x="-1" y="-1" width="3" height="3" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${l.join("")}</filter>`;
}
//#endregion
export { n as comparePaintOrder, i as foregroundFilter, r as overlaps };
