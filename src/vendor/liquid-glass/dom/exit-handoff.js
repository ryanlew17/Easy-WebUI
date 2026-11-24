//#region src/dom/exit-handoff.ts
var e = /* @__PURE__ */ new WeakMap();
function t(t) {
	let n = e.get(t);
	e.delete(t), n?.();
}
function n(t, n) {
	let r = e.get(t);
	return e.set(t, n), r?.(), () => {
		e.get(t) === n && e.delete(t);
	};
}
//#endregion
export { t as finishRetainedExit, n as retainLatestExit };
