//#region src/core/optics.ts
function e(e, t, n) {
	let r = Math.max(0, Math.min(1, -e * n));
	return t * (1 - Math.max(0, Math.min(1, Math.sqrt((2 - r) * r))));
}
//#endregion
export { e as edgeDisplacement };
