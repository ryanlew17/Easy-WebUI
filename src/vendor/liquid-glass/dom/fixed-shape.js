import { cornerOptions as e, shapeClip as t } from "../core/shape.js";
import { acquirePosition as n, createDropShadow as r, createSvgEffects as i, extractAndStripEffects as a, getLayoutSize as o, hasEffects as s, observeAnchor as c, observeResize as l, releasePosition as u, restoreStyles as d } from "../deps/lisse.js";
//#region src/dom/fixed-shape.ts
function f(f, p) {
	let m = e(p), h = f.style.clipPath, g = a(f), _ = s(g.effects) ? f.parentElement : null, v = _ ? n(_) : !1, y = _ ? i(_, f) : null, b = _ && g.effects.shadow ? r(_, f) : null, x = _ ? c(_, f) : null, S = l(f, (e) => {
		let { width: n, height: r } = e ?? o(f);
		if (!(n <= 0 || r <= 0) && (f.style.clipPath = t(n, r, p), y)) {
			let t = {
				x: e?.offsetLeft ?? f.offsetLeft,
				y: e?.offsetTop ?? f.offsetTop
			};
			y.update(m, g.effects, n, r, t), b && g.effects.shadow && b.update(m, g.effects.shadow, n, r, t);
		}
	});
	return () => {
		S(), x?.(), y?.destroy(), b?.destroy(), v && _ && u(_), d(f, g.savedStyles), f.style.clipPath = h;
	};
}
//#endregion
export { f as observeFixedShape };
