import { materials as e } from "../core/materials.js";
//#region src/dom/material-graph.ts
var t = (e) => e.appearance === "dark";
function n(n, r, i, a = 1) {
	let o = t(i) ? e.regular.dark : e.regular.light;
	return {
		markup: `<feGaussianBlur in="${r}" stdDeviation="${e.regular.blur * a}" result="${n}frost"/><feGaussianBlur in="${r}" stdDeviation="${o.fillSigma * a}" result="${n}fill"/><feBlend in="${n}frost" in2="${n}fill" mode="${t(i) ? "darken" : "lighten"}" result="${n}blend"/><feComposite in="${n}blend" in2="${n}frost" operator="arithmetic" k2="${o.fillOpacity}" k3="${1 - o.fillOpacity}" result="${n}mix"/>`,
		result: `${n}mix`
	};
}
function r(n, r, i) {
	if (r.material === "regular") {
		let [i, a, o, s] = (t(r) ? e.regular.dark : e.regular.light).tone, c = Array.from({ length: 33 }, (e, n) => {
			let s = n / 32, c = i + a * s + o * s * s, l = t(r) ? .9 : .8;
			return l * c + (1 - l) * s;
		}).join(" ");
		return `<feComponentTransfer in="${n}refracted" result="${n}tone"><feFuncR type="table" tableValues="${c}"/><feFuncG type="table" tableValues="${c}"/><feFuncB type="table" tableValues="${c}"/></feComponentTransfer><feColorMatrix in="${n}tone" type="saturate" values="${s}" result="${n}color"/>`;
	}
	let a = t(r) ? e.clear.dark : e.clear.light, o = Array.from({ length: 33 }, (e, n) => {
		let o = n / 32, s = o + a.shadowLift * (1 - o) ** 3 - a.highlightRolloff * o ** 3, c = t(r) ? .38 * o + .2 : .78 * o + .26, l = t(r) ? .14 : .06, u = t(r) && i ? .08 * (1 - o) : 0;
		return Math.max(0, Math.min(1, (1 - l) * s + l * c + u));
	}).join(" ");
	return `<feComponentTransfer in="${n}refracted" result="${n}color"><feFuncR type="table" tableValues="${o}"/><feFuncG type="table" tableValues="${o}"/><feFuncB type="table" tableValues="${o}"/></feComponentTransfer>`;
}
function i(e) {
	return e.tint && /^#[\da-f]{6}$/i.test(e.tint) ? [
		1,
		3,
		5
	].map((t) => parseInt(e.tint.slice(t, t + 2), 16) / 255) : void 0;
}
function a(e, t, n) {
	let r = t.material === "regular" ? .78 : .68;
	return {
		markup: `<feColorMatrix in="${e}color" type="saturate" values="0" result="${e}luminance"/><feComponentTransfer in="${e}luminance" result="${e}tinted">${[
			"R",
			"G",
			"B"
		].map((e, t) => `<feFunc${e} type="linear" slope="${n[t] * (1 - r)}" intercept="${n[t] * r}"/>`).join("")}<feFuncA type="linear" slope="${1 - r}" intercept="${r}"/></feComponentTransfer>`,
		color: `${e}tinted`
	};
}
function o(e, n, r, i) {
	let a = t(r) ? .82 : 1;
	return `<feComponentTransfer in="${e}" result="${n}">${[
		"R",
		"G",
		"B"
	].map((e, t) => `<feFunc${e} type="linear" slope="${(.45 + .55 * i[t]) / a}"/>`).join("")}</feComponentTransfer>`;
}
//#endregion
export { n as frostMarkup, o as overlayTintMarkup, i as tintChannels, a as tintMarkup, r as toneMarkup };
