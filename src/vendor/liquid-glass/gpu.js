import { shapeSegments as e } from "./core/shape.js";
import { outlineSegments as t } from "./core/concentric.js";
import { mapPlanes as n } from "./gpu/planes.js";
import { mapScale as r } from "./gpu/geometry.js";
import i from "./gpu/maps.js";
import { effect as a, frame as o, init as s, target as c } from "./deps/vgpu.js";
//#region src/gpu/index.ts
var l = 32, u = 4096;
function d(n) {
	if (![
		n.width,
		n.height,
		n.dpr ?? 1
	].every(Number.isFinite) || n.width <= 0 || n.height <= 0) throw RangeError("Glass geometry must have positive, finite dimensions.");
	let i = r(n), a = Math.ceil((n.width + 4) * i), o = Math.ceil((n.height + 4) * i);
	if (a > 4096 || o * 2 > 8192) throw RangeError("Glass map exceeds the 4096 × 4096 pixel surface limit.");
	let { segments: s } = n.outline ? t(n.outline) : e(n.width, n.height, n.radius);
	return {
		geometry: n,
		columns: a,
		rows: o,
		dpr: i,
		segments: s
	};
}
var f = class {
	gpu;
	shader;
	ready;
	slots = [];
	queue = [];
	flushing = !1;
	warmed;
	constructor(e) {
		this.gpu = e;
		let t = {
			size: [1, 1],
			row: 0,
			rows: 1,
			columns: 1,
			dpr: 1,
			dark: 0,
			symmetric: 1,
			start: 0,
			count: 0,
			pad: [0, 0]
		};
		this.shader = a(e, i, {
			label: "liquid-glass/material-field",
			set: {
				batch: {
					count: 1,
					pad: [
						0,
						0,
						0
					],
					shapes: Array.from({ length: l }, () => t)
				},
				outline: { segments: Array.from({ length: u }, () => [
					0,
					0,
					0,
					0
				]) }
			}
		}), this.ready = this.shader.compile({ colors: ["rgba8unorm"] }).catch(() => void 0), this.warmed = this.ready.then(() => this.render({
			width: 4,
			height: 4,
			radius: 2,
			dpr: 1
		})).then(() => void 0, () => void 0);
	}
	render(e) {
		let t = performance.now();
		return new Promise((n, r) => {
			let i;
			try {
				i = d(e);
			} catch (e) {
				r(e);
				return;
			}
			this.queue.push({
				...i,
				resolve: n,
				reject: r,
				started: t
			}), this.flushing || (this.flushing = !0, queueMicrotask(() => this.flush()));
		});
	}
	flush() {
		this.flushing = !1;
		let e = this.queue;
		this.queue = [];
		let t = [], n = 0, r = 0, i = [];
		for (let a of e) {
			let e = a.rows * 2 + a.rows * 2 % 2;
			t.length && (t.length === l || n + a.segments.length > u || r + e > 8192) && (i.push(t), t = [], n = 0, r = 0), t.push(a), n += a.segments.length, r += e;
		}
		t.length && i.push(t);
		for (let e of i) this.draw(e);
	}
	slot(e) {
		let t = this.slots.find((e) => !e.busy);
		return t ? (t.busy = !0, (t.target.size[0] !== e[0] || t.target.size[1] !== e[1]) && t.target.resize(e), t) : (t = {
			target: c(this.gpu, {
				size: e,
				label: "liquid-glass/maps"
			}),
			busy: !0
		}, this.slots.push(t), t);
	}
	async draw(e) {
		try {
			await this.ready;
			let t = Math.max(...e.map((e) => e.columns)), n = [], r = 0, i = [], a = e.map((e) => {
				n.push(r);
				let t = i.length;
				i.push(...e.segments);
				let a = {
					size: [e.geometry.width, e.geometry.height],
					row: r,
					rows: e.rows,
					columns: e.columns,
					dpr: e.dpr,
					dark: +(e.geometry.appearance === "dark"),
					symmetric: +!e.geometry.outline,
					start: t,
					count: e.segments.length,
					pad: [0, 0]
				};
				return r += e.rows * 2 + e.rows * 2 % 2, a;
			}), s = r;
			for (; a.length < l;) a.push({
				...a[0],
				row: s + 2
			});
			for (; i.length < u;) i.push([
				0,
				0,
				0,
				0
			]);
			let c = this.slot([t, s]);
			try {
				this.shader.set({
					batch: {
						count: e.length,
						pad: [
							0,
							0,
							0
						],
						shapes: a
					},
					outline: { segments: i }
				}), o(this.gpu, (e) => e.pass({
					target: c.target,
					clear: [
						0,
						0,
						0,
						0
					]
				}, this.shader));
				let r = await c.target.color.read({
					mipLevel: 0,
					region: "all"
				}), s = performance.now();
				e.forEach((e, i) => {
					let a = e.rows * 2, o = new Uint8Array(e.columns * a * 4);
					for (let s = 0; s < a; s++) {
						let a = (n[i] + s) * t * 4;
						o.set(r.subarray(a, a + e.columns * 4), s * e.columns * 4);
					}
					e.resolve({
						width: e.columns,
						height: e.rows,
						pixels: o,
						duration: s - e.started
					});
				});
			} finally {
				c.busy = !1;
			}
		} catch (t) {
			for (let n of e) n.reject(t instanceof Error ? t : Error(String(t)));
		}
	}
	dispose() {
		this.gpu.dispose();
	}
}, p;
function m() {
	if (p) return p;
	let e = s().then((t) => {
		let n = new f(t);
		return t.gpu.lost.then(() => {
			p === e && (p = void 0), deviceLossListeners.forEach((listener) => listener());
		}), n;
	}).catch((t) => {
		throw p === e && (p = void 0), t;
	});
	return p = e, e;
}
async function h() {
	let e = p;
	p = void 0, e && (await e).dispose();
}
var deviceLossListeners = new Set();
function onMaterialDeviceLoss(listener) { deviceLossListeners.add(listener); return () => deviceLossListeners.delete(listener); }
var g = i;
//#endregion
export { f as MaterialRenderer, h as disposeMaterialRenderer, m as getMaterialRenderer, n as mapPlanes, r as mapScale, g as materialShader, onMaterialDeviceLoss };
