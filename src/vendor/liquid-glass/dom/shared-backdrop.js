import { materials as e } from "../core/materials.js";
import { unionSamplingBounds as t } from "./sampling-bounds.js";
//#region src/dom/shared-backdrop.ts
function n(n, r) {
	let i = /* @__PURE__ */ new Map();
	for (let e of n) {
		if (e.options.material !== "regular" || e.inputs.length) continue;
		let t = e.options.appearance ?? "light", n = i.get(t) ?? [];
		n.push(e), i.set(t, n);
	}
	let a = /* @__PURE__ */ new Map(), o = (e) => `x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}"`;
	for (let [n, s] of i) {
		let i = e.regular[n], c = e.regular.blur * r, l = i.fillSigma * r, u = Math.ceil(3 * c) + 2, d = Math.ceil(3 * l) + 2, f = (e, t) => ({
			x: e.x - t,
			y: e.y - t,
			width: e.width + 2 * t,
			height: e.height + 2 * t
		}), p = (e) => e.width * e.height, m = (e) => 3 * p(f(e, u)) + 3 * p(f(e, d)) + 2 * p(e), h = [];
		for (let e of s) {
			let n = -1, r = 0, i = e.bounds;
			for (let [a, o] of h.entries()) {
				let s = t([o.bounds, e.bounds]), c = m(o.bounds) + m(e.bounds) - m(s);
				c > r && (n = a, r = c, i = s);
			}
			n < 0 ? h.push({
				members: [e],
				bounds: e.bounds
			}) : (h[n].members.push(e), h[n].bounds = i);
		}
		for (let { members: e, bounds: t } of h) {
			let r = o(f(t, u)), s = o(f(t, d)), p = o(t), m = e.length === 1 ? e[0].id : `shared${n === "dark" ? "Dark" : "Light"}-${e.map((e) => e.id).sort().join("-")}`, h = {
				result: `${m}mix`,
				markup: `<feGaussianBlur in="SourceGraphic" stdDeviation="${c}" result="${m}frost" ${r}/><feGaussianBlur in="SourceGraphic" stdDeviation="${l}" result="${m}fill" ${s}/><feBlend in="${m}frost" in2="${m}fill" mode="${n === "dark" ? "darken" : "lighten"}" result="${m}blend" ${p}/><feComposite in="${m}blend" in2="${m}frost" operator="arithmetic" k2="${i.fillOpacity}" k3="${1 - i.fillOpacity}" k4="0" result="${m}mix" ${p}/>`
			};
			for (let t of e) a.set(t.key, h);
		}
	}
	return a;
}
//#endregion
export { n as sharedBackdropMaterials };
