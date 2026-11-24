import { cornerOptions as e, shapeClip as t, shapePolygon as n } from "./core/shape.js";
import { polygonClip as r } from "./core/concentric.js";
import { createTicker as i } from "./dom/ticker.js";
import { createConcentricResolver as a, observeConcentricShape as o, observeCornerPlacement as s, registerShapeContainer as c, setResolvedShape as l } from "./dom/shape-layout.js";
import { chromium as u, gecko as d, webkit as f } from "./dom/engine.js";
import { blurOutsets as p, filterBudgetFactor as m, filterGraphOutsets as h, outsetBudget as g } from "./dom/filter-budget.js";
import { attachInteraction as _, resolveMotion as v } from "./dom/interaction.js";
import { radiusPixels as y, shapeDistance as b } from "./core/morph-path.js";
import { attachGeometryMotion as x } from "./dom/morph.js";
import { attachSelectionLens as S } from "./dom/selection.js";
import { materials as C } from "./core/materials.js";
import { getMaterialRenderer as w } from "./dom/renderer.js";
import { clearMaterialMapCache as T, getMaterialMaps as E, getSurfaceMaterialMaps as D, peekMaterialMaps as O, peekSurfaceMaterialMaps as k, getMaterialMapStats as mapStats } from "./dom/maps.js";
import { capsuleMapGeometry as A, mapImage as ee, mapUrl as te, surfaceMapResult as ne } from "./dom/map-image.js";
import { comparePaintOrder as j, foregroundFilter as re, overlaps as ie } from "./dom/foreground.js";
import { filterPixelRatio as ae, pageZoom as M, untiledOutsets as oe } from "./dom/page-zoom.js";
import { patchFilters as se } from "./dom/filter-patch.js";
import { createMapWarmer as N } from "./dom/warm.js";
import { updateControlMotion as P } from "./dom/control-motion.js";
import { padRepaintReach as ce, repaintReach as le } from "./dom/filter-reach.js";
import { acquireFilterPaintRoot as ue, acquireSceneCompositingLayer as de } from "./dom/filter-paint-root.js";
import { createProgressiveLayer as fe } from "./dom/progressive.js";
import { crossedSides as pe, edgeTiles as me, filterBounds as he, tilesFor as ge } from "./dom/filter-bounds.js";
import { clusterFilterBranches as _e, mapBoxesOverlap as ve } from "./dom/filter-groups.js";
import { compoundFieldImage as ye, compoundSources as be, fieldTouches as xe } from "./dom/compound-field.js";
import { refractionSamplingBounds as Se, unionSamplingBounds as Ce } from "./dom/sampling-bounds.js";
import { sharedBackdropMaterials as we } from "./dom/shared-backdrop.js";
import { blendMapImage as Te } from "./dom/map-blend.js";
import { frostMarkup as Ee, overlayTintMarkup as De, tintChannels as Oe, tintMarkup as ke, toneMarkup as Ae } from "./dom/material-graph.js";
import { createLensLayers as je } from "./dom/lens-layers.js";
import { composeSparseLayers as Me } from "./dom/compose-layers.js";
import { getLayoutSize as Ne } from "./deps/lisse.js";
//#region src/dom/index.ts
var Pe = 0, Fe = 0, F = "transform";
function I(e) {
	let t = e.promoted;
	e.promoted = void 0, t && !t.value && e.element.style.getPropertyValue("will-change") === F && e.element.style.removeProperty("will-change");
}
var Ie = 1, L = (e) => JSON.stringify(A(e) ?? e);
function Le(e, t) {
	let n = 1;
	for (let r = e; r && r !== t; r = r.parentElement) {
		let e = Number(getComputedStyle(r).opacity);
		if (Number.isFinite(e) && (n *= e), n < .001) return 0;
	}
	return n;
}
var Re = "http://www.w3.org/2000/svg";
function R(o, s = {}) {
	let y = f ? de(o) : void 0, S = ++Pe, T = document.createElementNS(Re, "svg");
	T.setAttribute("aria-hidden", "true"), T.setAttribute("width", "0"), T.setAttribute("height", "0"), T.style.position = "absolute", T.style.inset = "0", T.style.pointerEvents = "none";
	let A = document.createElementNS(Re, "defs");
	T.append(A), o.append(T);
	let R = Math.max(1, Math.min(64, Math.floor(s.maxSurfaces ?? 16))), ze = "", Be, Ve, z = null, B = !1, V = !0, He = "", H = /* @__PURE__ */ new Set(), U = /* @__PURE__ */ new Set(), W = 0, Ue = 0, We = !1, Ge = 0, Ke = (e) => {
		e ??= Be ?? Ve ?? [...H].find((e) => e.error)?.error;
		let t = [...H].filter((e) => e.maps), n = String(t.length === H.size && !e);
		o.dataset.glassReady !== n && (o.dataset.glassReady = n);
		let r = `${H.size},${t.length},${e?.message ?? ""},${t.reduce((e, t) => e + t.maps.duration, 0)}`;
		ze !== r && (ze = r, s.onDiagnostic?.({
			surfaces: H.size,
			maps: t.length,
			mapTime: t.reduce((e, t) => e + t.maps.duration, 0),
			error: e
		}), o.dispatchEvent(new CustomEvent("glass:diagnostic", { detail: {
			surfaces: H.size,
			maps: t.length,
			error: e?.message
		} })));
	}, G = fe(o, (e) => Ke(e)), K = N(o), qe = typeof navigator < "u" && "gpu" in navigator ? setTimeout(() => {
		w().then((e) => e.warmed).catch(() => void 0);
	}, 600) : void 0, Je = "", q = 0, Ye = `${M()} ${devicePixelRatio}`, J = d ? je(o) : void 0, Xe = {
		left: 0,
		top: 0,
		width: 0,
		height: 0
	}, Ze = "", Qe = (e) => {
		let t = e.style.getPropertyValue("filter");
		return {
			original: t,
			base: /^(initial|inherit|unset|revert|revert-layer)$/i.test(t.trim()) ? getComputedStyle(e).filter : t,
			priority: e.style.getPropertyPriority("filter"),
			releasePaint: f ? ue(e) : void 0
		};
	}, $e = (e, t, n) => {
		let r = t.base.trim().toLowerCase() === "none" ? "" : t.base, i = n ? [r, n].filter(Boolean).join(" ") : t.original;
		(e.style.getPropertyValue("filter") !== i || e.style.getPropertyPriority("filter") !== t.priority) && e.style.setProperty("filter", i, t.priority), t.applied = e.style.getPropertyValue("filter");
	}, et = (e, t) => {
		t.applied !== void 0 && e.style.getPropertyValue("filter") === t.applied && e.style.getPropertyPriority("filter") === t.priority && (t.original ? e.style.setProperty("filter", t.original, t.priority) : e.style.removeProperty("filter")), t.releasePaint?.();
	}, Y, X, tt = "", Z = /* @__PURE__ */ new Map(), nt = /* @__PURE__ */ new Set(), rt = (e) => {
		Y && et(e, Y), X && (et(X.element, X.style), X.element.removeAttribute("data-glass-blur-active")), X = void 0, Y = void 0;
	}, it = (e) => {
		let t = Z.get(e);
		t !== void 0 && (et(e, t), Z.delete(e));
	}, at = (e, t) => {
		if (e.options.refraction !== void 0) return e.options.refraction;
		if (!t.length) return C[e.options.material ?? "clear"].refraction;
		let n = Math.min(...t.map((t) => Math.min(e.x - t.x, e.y - t.y, t.x + t.w - e.x - e.w, t.y + t.h - e.y - e.h)));
		return Math.max(0, Math.min(8, n * .6));
	}, ot = (e) => [...H].filter((t) => t !== e && t.element.contains(e.element)), st = (e, t) => e.options.material === "regular" ? Math.max(C.regular.blur, (e.options.appearance === "dark" ? C.regular.dark : C.regular.light).fillSigma) * t : 0, Q = 0, ct = -1, lt = [], ut = () => (ct !== Q && (lt = [...H].sort((e, t) => j(e.element, t.element)), ct = Q), lt), dt = -1, ft = [], pt = () => (dt !== Q && (ft = [...ut(), ...nt].sort((e, t) => j(e.element, t.element)), dt = Q), ft);
	function mt(e, t) {
		if (!z) return;
		if (!e || !t) {
			Y && $e(z, Y, "");
			return;
		}
		(T.getAttribute("width") !== String(e) || T.getAttribute("height") !== String(t)) && (T.setAttribute("width", String(e)), T.setAttribute("height", String(t)), T.setAttribute("viewBox", `0 0 ${e} ${t}`));
		let n = `lg-${S}`, r = [], i = [], a = ut(), o = f ? be(a, {
			source: (e) => e.outline?.detachedSource(),
			nested: (e) => ot(e).length > 0,
			refraction: (e) => at(e, ot(e)),
			reach: (e) => Math.ceil(3 * st(e, 1) + at(e, ot(e)) + 8) + 2
		}) : /* @__PURE__ */ new Map(), s = new Set(o.values()), c = (e) => e.length === 2 && o.get(e[1]) === e[0] ? {
			source: e[0],
			popup: e[1]
		} : void 0, l = a.filter((e) => e.maps && (e.opacity >= .001 || s.has(e))), u = new Map(l.map((e) => [e, ot(e)])), _ = new Map(l.map((e) => [e, at(e, u.get(e))])), v = (e) => _.get(e) + 4, y = (e, t) => e.x < t.x + t.w && t.x < e.x + e.w && e.y < t.y + t.h && t.y < e.y + e.h, b = (e, t) => {
			let n = Math.max(v(e), v(t));
			return e.x < t.x + t.w + n && t.x - n < e.x + e.w && e.y < t.y + t.h + n && t.y - n < e.y + e.h;
		}, x = (e) => `${e.options.material ?? "clear"},${e.options.appearance ?? "light"},${e.options.tint ?? ""},${_.get(e)}`, w = (e) => f && e.opacity >= .999 && !u.get(e).length, E = (e) => w(e) && !l.some((t) => t !== e && b(e, t) && (!w(t) || x(t) !== x(e) || ve(e, t))), D = [], O = /* @__PURE__ */ new Map();
		for (let e of l) {
			if (s.has(e)) continue;
			let t = o.get(e);
			if (t) {
				D.push([t, e]);
				continue;
			}
			if (!E(e)) {
				D.push([e]);
				continue;
			}
			let n = x(e), r = O.get(n);
			r || (r = [], O.set(n, r), D.push(r)), r.push(e);
		}
		let k = new Map(D.flatMap((e) => e.map((t) => [t, e]))), j = ae(), M = new Map(l.map((e) => {
			let t = e.options.appearance === "dark" ? C.regular.dark : C.regular.light, n = e.options.material === "regular" ? p(C.regular.blur) + p(t.fillSigma) : 0;
			return [e, j * (n + _.get(e))];
		})), N = (e) => e.reduce((e, t) => e + Math.max(...t.map((e) => M.get(e))) + (t.length === 1 || c(t) ? l.filter((e) => !t.includes(e) && t.some((t) => y(e, t))).reduce((e, t) => Math.max(e, M.get(t)), 0) : 0), 0), P = m(e * j, t * j, N(D)), ue = new Map(l.map((e) => [e, _.get(e) * P])), de = new Map(l.map((e) => {
			let t = e.place, n = !o.has(e) && !s.has(e) && (t ? t.stretched && t.a.x === t.b.x && t.a.y === t.b.y && t.a.w === t.b.w && t.a.h === t.b.h : !(!e.shown || e.shown.outline));
			return [e, Se({
				x: e.x - 2,
				y: e.y - 2,
				width: e.w + 4,
				height: e.h + 4
			}, ue.get(e), n)];
		})), fe = (e) => {
			let t = Math.ceil(3 * st(e, P) + ue.get(e) + 8);
			return {
				x: e.x - 2 - t,
				y: e.y - 2 - t,
				width: e.w + 4 + 2 * t,
				height: e.h + 4 + 2 * t
			};
		}, je = D.flatMap((e) => {
			if (e.length < 2 || c(e)) return [e];
			let t = e[0].options.material === "regular", n = /^#[\da-f]{6}$/i.test(e[0].options.tint ?? "");
			return _e(e, (e) => {
				let t = {
					x: e.x - 2,
					y: e.y - 2,
					width: e.w + 4,
					height: e.h + 4
				}, n = ue.get(e) + 3;
				return {
					output: t,
					crop: fe(e),
					sampled: {
						x: t.x - n,
						y: t.y - n,
						width: t.width + 2 * n,
						height: t.height + 2 * n
					}
				};
			}, {
				output: (t ? 4 : 3) + (n ? 3 : 0),
				sampled: t ? 4 : 0
			});
		});
		!d && m(e * j, t * j, N(je)) >= P && (D = je);
		let Ne = (e) => e.length > 1 ? `g${e.map((e) => e.serial).sort((e, t) => e - t).join("-")}` : `s${e[0].serial}`, Pe = l.map(fe), Fe = (e) => {
			let t = Math.min(...e.map((e) => e.x)), n = Math.min(...e.map((e) => e.y));
			return {
				x: t,
				y: n,
				width: Math.max(...e.map((e) => e.x + e.width)) - t,
				height: Math.max(...e.map((e) => e.y + e.height)) - n
			};
		}, F = he(e, t, Pe, 0), I = (e) => `x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}"`, Ie = (n) => {
			let r = new Map(n.flatMap((e) => e.map((t) => [t, e]))), i = n.flat().map((e) => f ? de.get(e) : fe(e)), a = n.length ? me(e, t, f ? Ce(i) : F, "scene", pe(e, t, i)) : {
				markup: "",
				names: {}
			}, o = [a.markup], s = "SourceGraphic", l = new Map(n.map((e, t) => {
				let r = c(e)?.popup ?? e[0];
				return [e, e.length > 1 && !c(e) ? [] : n.slice(0, t).flat().filter((t) => k.get(t) !== k.get(r) && e.some((e) => xe(t, e, v(r))))];
			})), p = f ? we(n.map((e) => ({
				key: e,
				id: Ne(e),
				options: (c(e)?.popup ?? e[0]).options,
				bounds: Ce(e.map((e) => de.get(e))),
				inputs: l.get(e)
			})), P) : void 0, m = /* @__PURE__ */ new Set(), h = /* @__PURE__ */ new Map(), g = /* @__PURE__ */ new Map();
			return n.forEach((n) => {
				let i = c(n), _ = i?.popup ?? n[0], v = _.options, y = Ne(n), b = Fe(n.map((e) => ({
					x: e.x - 2,
					y: e.y - 2,
					width: e.w + 4,
					height: e.h + 4
				}))), x = b.x, S = b.y, C = b.width, w = b.height, T = (e, t) => {
					let r = (t, n, r = e) => {
						let i = t.place;
						return i ? Te(r, n, i, t, d) : ee(t.maps, r, n, t.x - 2, t.y - 2, t.w + 4, t.h + 4);
					};
					return i ? ye(i.source, i.popup, e, t, b, (e, t, n) => r(e, n, t)) : n.length === 1 ? r(_, t) : n.map((t) => r(t, ne(t.serial, e))).join("") + `<feMerge result="${t}" ${I(b)}>${n.map((t) => `<feMergeNode in="${ne(t.serial, e)}"/>`).join("")}</feMerge>`;
				}, E = n.length > 1 || _.opacity >= .999, D = o.length;
				o.push(T("field", `${y}field`), ...E ? [] : [`<feComponentTransfer in="${y}field" result="${y}mask"><feFuncA type="linear" slope="${_.opacity}"/></feComponentTransfer>`]);
				let O = E ? `${y}field` : `${y}mask`, k = u.get(_), A = Fe(n.map(fe)), te = l.get(n), j = [];
				for (let e of te) if (n.some((t) => xe(e, t))) j.push(...h.get(r.get(e)));
				else {
					let t = `s${e.serial}`;
					o.push(ee(e.maps, "overlay", `${y}by${t}overlay`, e.x - 2, e.y - 2, e.w + 4, e.h + 4)), j.push(`${y}by${t}overlay`);
				}
				let re = ge(e, t, A).map((e) => a.names[e]).filter((e) => !!e);
				(re.length || j.length) && o.push(`<feMerge result="${y}crop" ${I(A)}>${re.map((e) => `<feMergeNode in="${e}"/>`).join("")}<feMergeNode in="${s}"/>${j.map((e) => `<feMergeNode in="${e}"/>`).join("")}</feMerge>`);
				let ie = re.length || j.length ? `${y}crop` : s, ae = ie;
				if (v.material === "regular") {
					let e = p?.get(n);
					if (e) m.has(e.result) || (o.push(e.markup), m.add(e.result)), ae = e.result;
					else {
						let e = Ee(y, ie, v, P);
						o.push(e.markup), ae = e.result;
					}
				}
				let M = ue.get(_);
				o.push(`<feDisplacementMap in="${ae}" in2="${y}field" scale="${M * 2}" xChannelSelector="R" yChannelSelector="G" result="${y}refracted"/>`, Ae(y, v, k.length > 0));
				let oe = `${y}color`, se = `${y}overlay`, N = Oe(v);
				if (N) {
					let e = ke(y, v, N);
					o.push(e.markup), oe = e.color, se = `${y}tintOverlay`;
				}
				o.push(`<feComposite in="${oe}" in2="${O}" operator="in" result="${y}inside"/>`, T("overlay", `${y}overlay`), ...N ? [De(`${y}overlay`, se, v, N)] : [], ...E ? [] : [`<feComponentTransfer in="${se}" result="${y}fadedOverlay"><feFuncA type="linear" slope="${_.opacity}"/></feComponentTransfer>`]);
				let ce = Ce(n.map((e) => de.get(e))), le = new Set([
					"frost",
					"fill",
					"blend",
					"mix",
					...f ? ["refracted"] : []
				].map((e) => `${y}${e}`));
				for (let e = D; e < o.length; e++) o[e] = o[e].replace(/<(feFlood|feComposite|feDisplacementMap|feColorMatrix|feComponentTransfer|feGaussianBlur|feBlend)\b([^>]*?)(\/?)>/g, (e, t, n, r) => {
					if (/\sx="/.test(n)) return e;
					let i = le.has(/result="([^"]+)"/.exec(n)?.[1] ?? "") ? ce : {
						x,
						y: S,
						width: C,
						height: w
					};
					return `<${t}${n} x="${i.x}" y="${i.y}" width="${i.width}" height="${i.height}"${r}>`;
				});
				let pe = [`${y}inside`, E ? se : `${y}fadedOverlay`];
				h.set(n, pe), g.set(n, O);
			}), n.length && o.push(Me(n.map((e) => ({
				id: Ne(e),
				mask: g.get(e),
				layers: h.get(e),
				bounds: Ce(e.map((e) => ({
					x: e.x - 2,
					y: e.y - 2,
					width: e.w + 4,
					height: e.h + 4
				})))
			})))), o.join("");
		};
		if (Be = void 0, J) {
			let e = new Map(l.filter((e) => e.frame).map((e) => [e, {
				serial: e.serial,
				element: e.element,
				options: e.options,
				maps: e.maps,
				place: e.place,
				x: e.x,
				y: e.y,
				w: e.w,
				h: e.h,
				opacity: e.opacity,
				refraction: _.get(e),
				frame: e.frame,
				parents: [],
				beneath: []
			}]));
			for (let [t, n] of e) {
				n.parents.push(...u.get(t).map((t) => e.get(t)).filter((e) => e !== void 0));
				for (let r of l) {
					if (r === t) break;
					let i = e.get(r);
					i && !n.parents.includes(i) && !t.element.contains(r.element) && xe(r, t, v(t)) && n.beneath.push(i);
				}
			}
			J.update([...e.values()], z, Xe, X?.matches ? {
				left: 0,
				top: 0,
				regions: G.regions()
			} : void 0);
		} else if (l.length) {
			let a = Ie(D);
			if (f) {
				let n = h(a), r = n + q, i = m(e * j, t * j, r * j), o = n ? Math.max(0, Math.min(1, (r * i - q) / n)) : 1;
				o < 1 && (a = a.replace(/(<fe(?:GaussianBlur|DisplacementMap)\b[^>]*?\s(?:stdDeviation|scale)=")([^"]+)(")/g, (e, t, n, r) => t + n.split(" ").map((e) => Number(e) * o).join(" ") + r));
				let s = le(a, e, t, G.regions()), c = n * o + q > oe(e, t), l = Math.min(c ? 2 * s : s, g(e * j, t * j) / j, c ? Infinity : oe(e, t, .85)) - q;
				l > n * o && (a = ce(a, Math.floor(l), e, t, c));
			}
			let o = `${n}-scene`;
			r.push(`<filter id="${o}" x="${F.x / e}" y="${F.y / t}" width="${F.width / e}" height="${F.height / t}" filterUnits="objectBoundingBox" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">${a}</filter>`), i.push(o);
		}
		let L = /* @__PURE__ */ new Map(), Le = /* @__PURE__ */ new Map(), Re = pt(), R = new Map(Re.map((e, t) => [e, t]));
		J || Re.forEach((e) => {
			if (!e.w || !e.h || e.opacity < .001) return;
			let t = a.filter((t) => R.get(e) < R.get(t) && t.maps && t.opacity > .001 && ie(e, t) && t.absorbs?.element !== e.element && !e.element.contains(t.element) && !t.element.contains(e.element) && ![...Le].some(([n, r]) => n.element.contains(e.element) && r.includes(t)));
			if (!t.length) return;
			let i = `${n}-f${e.serial}`;
			r.push(re(i, e, t)), L.set(e.element, i), Le.set(e, t);
		});
		for (let e of Z.keys()) L.has(e) || it(e);
		let ze = se(A, r, te);
		for (let [e, t] of L) Z.has(e) || Z.set(e, Qe(e)), $e(e, Z.get(e), `url("#${ze(t)}")`);
		Je = i.map((e) => `url("#${ze(e)}")`).join(" "), Ke();
	}
	function ht(e, t, n) {
		let r = L(t);
		if (e.prepared.has(r) || e.preparing.has(r)) return;
		let i = k(t);
		if (i) {
			let n = K.has(i);
			K.warm(i), e.prepared.set(r, {
				geometry: t,
				maps: i,
				ready: n ? 0 : performance.now() + 50
			}), V = !0;
			return;
		}
		e.preparing.add(r), W++, D(t, n).then((n) => {
			if (e.preparing.delete(r), !B && H.has(e) && e.path?.some((e) => L({
				...e,
				dpr: t.dpr,
				appearance: t.appearance
			}) === r)) {
				let i = K.has(n);
				K.warm(n), e.prepared.set(r, {
					geometry: t,
					maps: n,
					ready: i ? 0 : performance.now() + 50
				}), V = !0;
			}
		}).catch(() => {
			e.preparing.delete(r);
		}).finally(() => {
			W--, $.wake();
		});
	}
	function gt(e, t, n) {
		let r = n ? L(t) : JSON.stringify(t);
		if (e.wanted = r, r === e.key || e.inflight) return;
		let i = n ? k(t) : O(t);
		if (i && (K.has(i) || !e.maps)) {
			e.key = r, K.warm(i), e.maps = i, e.shown = t, e.error = void 0, V = !0, e.options.onReady?.(!0);
			return;
		}
		e.key = r, e.inflight = !0, W++, (n ? D(t) : E(t)).then((n) => {
			if (e.inflight = !1, B || !H.has(e)) return;
			if (f && !e.maps && e.wanted !== r) {
				e.key = void 0, $.wake();
				return;
			}
			let i = K.has(n);
			K.warm(n);
			let a = () => {
				!B && H.has(e) && (e.maps = n, e.shown = t, e.error = void 0, V = !0, $.wake(), e.options.onReady?.(!0));
			};
			e.maps && !i ? setTimeout(a, 50) : a();
		}).catch((t) => {
			e.inflight = !1, !B && H.has(e) && e.key === r && (e.error = t instanceof Error ? t : Error(String(t)), Ke(e.error),e.options.onError?.(e.error));
		}).finally(() => {
			W--, $.wake();
		});
	}
	function _t(e) {
		if (B) return !1;
		let i = [], a = P(o, e), s = !1, c = !1, d = (z ?? o).getBoundingClientRect(), f = z ? z.offsetWidth : o.clientWidth, p = z ? z.offsetHeight : o.clientHeight;
		Xe = {
			left: 0,
			top: 0,
			width: d.width,
			height: d.height
		};
		let m = `${f},${p}`;
		m !== He && (V = !0, He = m), U.forEach((t) => {
			t.frame(e, We) && (a = !0);
		}), H.forEach((t) => t.animators.forEach((t) => {
			t.frame(e, We) && (a = !0);
		}));
		let h = [...H].some((e) => e.outline?.pending());
		We = h;
		let g = (e, t) => L({
			width: t.width,
			height: t.height,
			radius: t.radius,
			outline: t.outline,
			dpr: t.dpr ?? Ie,
			appearance: e.options.appearance
		}), _ = /* @__PURE__ */ new Map(), v = (e, t) => {
			e.writtenClip !== t && (e.writtenClip = t, i.push(() => {
				e.element.style.clipPath = t, e.element.style.borderRadius = "0px";
			}));
		}, y = (e, t) => {
			e.writtenRadius !== t && (e.writtenRadius = t, i.push(() => e.element.style.setProperty("--lg-radius", t)));
		};
		H.forEach((t) => {
			t.place = void 0;
			let n = t.outline?.geometry();
			if (!n) return;
			let r = t.outline.waypoints();
			if (r !== t.path) {
				t.path = r;
				let e = new Set(r.map((e) => g(t, e)));
				for (let [n, r] of t.prepared) !e.has(n) && r.maps !== t.maps && t.prepared.delete(n);
				for (let e of r) ht(t, {
					width: e.width,
					height: e.height,
					radius: e.radius,
					outline: e.outline,
					dpr: e.dpr ?? Ie,
					appearance: t.options.appearance
				}, !!e.resting);
			}
			let i = n.draw;
			if (!i) return;
			let a = (n) => {
				let r = t.prepared.get(g(t, n.shape));
				return r && r.ready <= e ? r : void 0;
			}, o = (e, t) => ({
				maps: t.maps,
				x: e.left - d.left,
				y: e.top - d.top,
				w: e.width,
				h: e.height
			}), s = a(i.a), c = i.b ? a(i.b) : s, l = !1;
			if (!s) {
				let r = Infinity;
				for (let i of t.prepared.values()) {
					if (i.geometry.outline || i.ready > e) continue;
					let t = b(i.geometry, n);
					t < r && (r = t, s = i);
				}
				l = !0;
			}
			if (!s) return;
			let u = {
				shape: i.a.shape,
				left: n.left,
				top: n.top,
				width: n.width,
				height: n.height
			}, f = o(l ? u : i.a, s), p = !l && c && i.b ? o(i.b, c) : f;
			t.place = {
				a: f,
				b: p,
				mix: p === f ? 0 : i.mix,
				stretched: l || !i.a.shape.outline && !i.b?.shape.outline
			}, n.absorbs && !l && _.set(n.absorbs.element, Math.max(_.get(n.absorbs.element) ?? 0, n.absorbs.weight));
		}), H.forEach((c) => {
			let u = c.outline?.geometry(), f = c.place;
			if (J) {
				let e = c.element.getBoundingClientRect(), t = {
					left: e.left - d.left,
					top: e.top - d.top,
					sx: e.width / (c.element.offsetWidth || e.width || 1),
					sy: e.height / (c.element.offsetHeight || e.height || 1),
					clientLeft: c.element.clientLeft,
					clientTop: c.element.clientTop
				};
				(!c.frame || Object.entries(t).some(([e, t]) => Math.abs(t - c.frame[e]) > .01)) && (V = !0), c.frame = t;
			}
			let p = f ? {
				left: Math.min(f.a.x, f.b.x) + d.left,
				top: Math.min(f.a.y, f.b.y) + d.top,
				width: Math.max(f.a.x + f.a.w, f.b.x + f.b.w) - Math.min(f.a.x, f.b.x),
				height: Math.max(f.a.y + f.a.h, f.b.y + f.b.h) - Math.min(f.a.y, f.b.y)
			} : u ?? (({ left: e, top: t, width: n, height: r }) => ({
				left: e,
				top: t,
				width: n,
				height: r
			}))(c.element.getBoundingClientRect()), m = p.left - d.left, h = p.top - d.top, b = p.width, x = p.height;
			[
				m - c.x,
				h - c.y,
				b - c.w,
				x - c.h
			].some((e) => Math.abs(e) > .05) && (Object.assign(c, {
				x: m,
				y: h,
				w: b,
				h: x
			}), u || (c.movedAt = e), s = !0, V = !0), c.baseOpacity = Le(c.element, o) * (c.outline?.opacity() ?? 1);
			let S = c.baseOpacity * (1 - (_.get(c.element) ?? 0));
			Math.abs(S - c.opacity) > .001 && (c.opacity = S, V = !0);
			let C = Math.min(devicePixelRatio || 1, 2);
			if (u || (c.absorbs = void 0), u) {
				a = !0, c.absorbs = u.absorbs, f ? (c.maps = f.a.maps, c.shown = c.prepared.get(g(c, u.draw.a.shape))?.geometry ?? c.shown) : c.maps = void 0, V = !0;
				let e = f?.stretched ? c.shown : void 0, t = c.element.getBoundingClientRect(), o = (c.element.offsetWidth || 1) / (t.width || 1), s = (c.element.offsetHeight || 1) / (t.height || 1), l = !e || e.radius === "capsule" && u.radius === "capsule" && Math.abs(e.height - u.height) < .5 ? {
					width: u.width,
					height: u.height,
					radius: u.radius
				} : e, d = u.width / l.width, p = u.height / l.height, m = n(l.width, l.height, l.radius).map(([e, n]) => [(u.left - t.left + e * d) * o, (u.top - t.top + n * p) * s]);
				v(c, r(m));
				let h = u.radius === "capsule" ? Math.min(u.width, u.height) / 2 : u.radius;
				y(c, `${h.toFixed(2)}px`);
				let _ = c.maps ? "1" : "0";
				c.writtenReady !== _ && (c.writtenReady = _, i.push(() => c.element.style.setProperty("--lg-glass-ready", _))), c.geometryKey = void 0, c.key = void 0;
				return;
			}
			if (c.outline?.positioning()) return;
			let { width: w, height: T } = Ne(c.element);
			if (!w || !T) return;
			let E = c.options.radius ?? 8, D = c.resolveShape?.();
			if (c.resolveShape && (!D || D.length < 3)) {
				c.maps && (c.maps = void 0, V = !0), c.key = void 0, c.geometryKey = void 0, l(c.element, []), v(c, r([]));
				return;
			}
			l(c.element, D);
			let O = {
				outline: D,
				width: w,
				height: T,
				radius: E,
				dpr: C,
				appearance: c.options.appearance
			};
			if (E === "capsule" && !D && Math.abs(b / w - x / T) > .004) {
				let e = n(b, x, "capsule").map(([e, t]) => [e * w / b, t * T / x]);
				v(c, r(e)), c.geometryKey = void 0, gt(c, O, !0);
				return;
			}
			let k = JSON.stringify(O);
			k !== c.geometryKey && (c.geometryKey !== void 0 && (c.resized = e), c.geometryKey = k, v(c, D ? r(D) : t(w, T, E)), y(c, `${typeof E == "number" ? Math.min(E, w / 2, T / 2) : Math.min(w, T) / 2}px`));
			let A = E === "capsule" && e - (c.resized ?? 0) < 500;
			A && (a = !0), gt(c, O, A);
		}), u && H.forEach((t) => {
			let n = e - (t.movedAt ?? -Infinity) < 400;
			n && (c = !0), n !== !!t.promoted && (n ? (t.promoted = {
				value: t.element.style.getPropertyValue("will-change"),
				priority: t.element.style.getPropertyPriority("will-change")
			}, t.promoted.value || i.push(() => t.element.style.setProperty("will-change", F))) : i.push(() => I(t)));
		}), nt.forEach((e) => {
			let t = e.element.getBoundingClientRect(), n = {
				x: t.left - d.left,
				y: t.top - d.top,
				w: t.width,
				h: t.height
			};
			Object.entries(n).some(([t, n]) => Math.abs(n - e[t]) > .05) && (Object.assign(e, n), V = !0);
		});
		let x = pt().map((e) => e.serial).join(",");
		if (x !== Ze && (V = !0, Ze = x), X) {
			let e = X.element.getBoundingClientRect();
			X.matches = Math.abs(e.left - d.left) < .5 && Math.abs(e.top - d.top) < .5 && Math.abs(e.width - d.width) < .5 && Math.abs(e.height - d.height) < .5;
		}
		let S = z ? G.update(z) : "";
		if (X) {
			let e = JSON.stringify([X.matches, G.regions()]);
			e !== tt && (tt = e, V = !0);
		}
		let C = G.outsets();
		C !== q && (q = C, V = !0);
		let w = `${M()} ${devicePixelRatio}`;
		w !== Ye && (Ye = w, V = !0);
		let T = V, E = (a || s) && e - Ge < 15, D = V && !h && !E;
		D && (Ge = e), !h && !E && (V = !1);
		let O = G.error(), k = Ve?.message !== O?.message;
		return Ve = O, i.push(() => {
			if (D && mt(f, p), z) {
				let e = X?.matches ? Je : (G.scrollsContent() ? [S, Je] : [Je, S]).filter(Boolean).join(" ");
				Y && $e(z, Y, e), X && $e(X.element, X.style, X.matches ? S : "");
			}
			k && Ke();
		}), {
			active: a || T || c || W > 0,
			write: () => {
				for (let e of i) e();
			}
		};
	}
	let $ = i(_t, {
		root: o,
		ignore: (e) => T.contains(e) || K.owns(e) || !!J?.owns(e),
		onMutation: () => {
			Q++;
		}
	});
	return {
		setActive(active) { $.setActive(active) },
		setContent(e) {
			z && rt(z), z && $.unobserve(z), z = e, e && (Y = Qe(e));
			let t = e?.parentElement;
			J && t?.hasAttribute("data-glass-blur-host") && (t.setAttribute("data-glass-blur-active", ""), X = {
				element: t,
				style: Qe(t)
			}), e && $.observe(e), V = !0, $.wake();
		},
		addSurface(t, n = {}) {
			if (H.size >= R) throw RangeError(`GlassScene supports ${R} surfaces; increase maxSurfaces up to 64 or split the scene.`);
			if (!Number.isFinite(n.refraction ?? 60) || (n.refraction ?? 60) < 0) throw RangeError("Refraction must be finite and nonnegative.");
			e(n.radius ?? 8);
			let r = {
				serial: ++Fe,
				element: t,
				options: n,
				resolveShape: n.concentric ? a(t, typeof n.concentric == "object" ? n.concentric.inset : void 0, n.radius ?? 8) : void 0,
				releaseShape: c(t, n.radius ?? 8),
				clip: t.style.clipPath,
				borderRadius: t.style.borderRadius,
				x: 0,
				y: 0,
				w: 0,
				h: 0,
				opacity: 1,
				animators: [],
				prepared: /* @__PURE__ */ new Map(),
				preparing: /* @__PURE__ */ new Set()
			}, i = () => v(n.motion);
			(n.morphFrom || n.fluid) && !n.concentric && r.animators.push(r.outline = x(t, {
				from: n.morphFrom,
				morph: n.morph,
				layout: n.fluid,
				radius: n.radius ?? 8,
				motion: i,
				neck: n.neck,
				enter: n.morphEnter,
				submenu: t.hasAttribute("data-glass-submenu"),
				prepared: (e) => {
					let t = r.prepared.get(L({
						width: e.width,
						height: e.height,
						radius: e.radius,
						outline: e.outline,
						dpr: e.dpr ?? Ie,
						appearance: n.appearance
					}));
					return !!t && t.ready <= performance.now();
				}
			})), n.interactive && (r.animators.push(_(t, i)), t.dataset.glassInteractive !== "" && (t.dataset.glassInteractive = ""));
			let s = t.getAttribute("data-glass-appearance");
			return s !== (n.appearance ?? "light") && (t.dataset.glassAppearance = n.appearance ?? "light"), H.add(r), $.observe(t), Q++, V = !0, n.morphFrom && (Ue++, o.dataset.glassPopup = ""), $.wake(), () => {
				r.animators.forEach((e) => e.dispose()), n.interactive && delete t.dataset.glassInteractive, l(t), r.releaseShape(), it(t), t.style.clipPath = r.clip, t.style.borderRadius = r.borderRadius, t.style.removeProperty("--lg-radius"), I(r), H.delete(r), Q++, $.unobserve(t), n.morphFrom && --Ue === 0 && delete o.dataset.glassPopup, s === null ? t.removeAttribute("data-glass-appearance") : t.setAttribute("data-glass-appearance", s), V = !0, $.wake();
			};
		},
		addForeground(e) {
			let t = {
				element: e,
				serial: ++Fe,
				x: 0,
				y: 0,
				w: 0,
				h: 0,
				opacity: 1,
				options: {}
			};
			return nt.add(t), Q++, $.observe(e), V = !0, $.wake(), () => {
				it(e), nt.delete(t), Q++, $.unobserve(e), V = !0, $.wake();
			};
		},
		addAnimator(e) {
			return U.add(e), $.wake(), () => {
				U.delete(e), e.dispose(), $.wake();
			};
		},
		addProgressiveBlur: (e, t) => {
			let n = G.add(e, t);
			return $.wake(), () => {
				n(), $.wake();
			};
		},
		addScrollEdges: (e) => {
			let t = G.addScroll(e);
			return $.wake(), () => {
				t(), $.wake();
			};
		},
		dispose() {
			clearTimeout(qe), G.dispose(), J?.dispose(), K.dispose(), U.forEach((e) => e.dispose()), U.clear(), B = !0, $.dispose(), z && rt(z);
			for (let e of Z.keys()) it(e);
			T.remove(), y?.(), H.forEach((e) => {
				e.animators.forEach((e) => e.dispose()), l(e.element), e.releaseShape(), e.element.style.clipPath = e.clip, e.element.style.borderRadius = e.borderRadius, e.element.style.removeProperty("--lg-radius"), I(e);
			}), H.clear(), nt.clear();
		}
	};
}
//#endregion
export { x as attachGeometryMotion, _ as attachInteraction, S as attachSelectionLens, T as clearMaterialMapCache, R as createGlassScene, E as getMaterialMaps, o as observeConcentricShape, s as observeCornerPlacement, y as radiusPixels, c as registerShapeContainer, v as resolveMotion, mapStats as getMaterialMapStats };
