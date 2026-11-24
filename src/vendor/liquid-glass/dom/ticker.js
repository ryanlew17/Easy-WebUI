//#region src/dom/ticker.ts
var e = [
	"pointerdown",
	"pointerup",
	"pointercancel",
	"pointermove",
	"pointerenter",
	"pointerleave",
	"keydown",
	"keyup",
	"focusin",
	"focusout"
], t = [
	"transitionrun",
	"transitionstart",
	"transitionend",
	"transitioncancel",
	"animationstart",
	"animationiteration",
	"animationend",
	"animationcancel"
], n = class {
	view;
	raf = 0;
	pending = /* @__PURE__ */ new Set();
	constructor(e) {
		this.view = e;
	}
	schedule(e) {
		e.disposed || (this.pending.add(e), this.raf ||= this.view.requestAnimationFrame((e) => this.frame(e)));
	}
	frame(e) {
		this.raf = 0;
		let t = [...this.pending];
		this.pending.clear();
		let n = [];
		for (let r of t) {
			if (r.disposed) continue;
			let t;
			try {
				t = r.step(e);
			} catch (e) {
				queueMicrotask(() => {
					throw e;
				});
				continue;
			}
			let i = typeof t == "boolean" ? t : t.active;
			typeof t != "boolean" && t.write && n.push(t.write), r.idle = i ? 0 : r.idle + 1, r.idle < 3 && this.schedule(r);
		}
		for (let e of n) try {
			e();
		} catch (e) {
			queueMicrotask(() => {
				throw e;
			});
		}
	}
}, r = /* @__PURE__ */ new WeakMap();
function i(i, a) {
	let { root: o, ignore: s, onMutation: c } = a, l = (o.ownerDocument ?? o).defaultView ?? window, u = r.get(l) ?? (() => {
		let e = new n(l);
		return r.set(l, e), e;
	})(), d = {
		step: (time) => d.active ? i(time) : !1,
		idle: 0,
		disposed: !1, active: !0
	}, f = () => d.active && u.schedule(d), p = typeof ResizeObserver == "function" ? new ResizeObserver(f) : void 0, m = typeof MutationObserver == "function" ? new MutationObserver((e) => {
		(!s || e.some((e) => !s(e.target))) && (c?.(), f());
	}) : void 0;
	m?.observe(o, {
		subtree: !0,
		attributes: !0,
		childList: !0,
		characterData: !1
	});
	let h = o;
	for (let n of [...e, ...t]) h.addEventListener(n, f, {
		capture: !0,
		passive: !0
	});
	l.addEventListener("scroll", f, {
		capture: !0,
		passive: !0
	}), l.addEventListener("resize", f, { passive: !0 }), l.document.addEventListener("visibilitychange", f);
	let g = l.setInterval(f, a.heartbeat ?? 1e3);
	return f(), { setActive(active) { d.active = active, active && f() },
		wake: f,
		observe(e) {
			p?.observe(e);
		},
		unobserve(e) {
			p?.unobserve(e);
		},
		dispose() {
			d.disposed = !0, p?.disconnect(), m?.disconnect();
			for (let n of [...e, ...t]) h.removeEventListener(n, f, { capture: !0 });
			l.removeEventListener("scroll", f, { capture: !0 }), l.removeEventListener("resize", f), l.document.removeEventListener("visibilitychange", f), l.clearInterval(g);
		}
	};
}
//#endregion
export { i as createTicker };

