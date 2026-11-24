import { mapImage as e } from "./map-image.js";
//#region src/dom/map-blend.ts
function t(t, n, r, i, a = !1) {
	let { a: o, b: s, mix: c } = r, l = (n, r) => e(n.maps, t, r, n.x - 2, n.y - 2, n.w + 4, n.h + 4);
	return a && (o === s || o.maps === s.maps && o.x === s.x && o.y === s.y && o.w === s.w && o.h === s.h) ? l(o, n) : l(o, `${n}A`) + l(s, `${n}B`) + `<feComposite in="${n}A" in2="${n}B" operator="arithmetic" k1="0" k2="${(1 - c).toFixed(4)}" k3="${c.toFixed(4)}" k4="0" result="${n}" x="${i.x - 2}" y="${i.y - 2}" width="${i.w + 4}" height="${i.h + 4}"/>`;
}
//#endregion
export { t as blendMapImage };
