import "./planes.js";
//#region src/gpu/geometry.ts
var e = 8192;
function t(t) {
	let n = Math.max(1, Math.min(t.dpr ?? 1, 2)), r = Math.min(1, 4096 / ((t.width + 4) * n), e / 2 / ((t.height + 4) * n));
	return r < 1 ? Math.max(.25, n * r) : n;
}
//#endregion
export { t as mapScale, e as maxAtlasRows };
