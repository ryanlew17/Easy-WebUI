import { pngDataUrl as e } from "./png.js";
import "../gpu/planes.js";
//#region src/dom/map-encoding.ts
function t(t, n, r, i) {
	let a = n * 4, o = i === void 0 ? [[0, n]] : [
		[0, n],
		[0, i],
		[i, n - 2 * i],
		[n - i, i]
	];
	return Promise.all(Array.from({ length: 2 }, (n, i) => {
		let s = i * r * a;
		return Promise.all(o.map(([n, i]) => e(i, r, t.subarray(s + n * 4, s + r * a), a)));
	}));
}
//#endregion
export { t as encodeMapPixels };
