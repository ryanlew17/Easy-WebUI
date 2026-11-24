//#region src/dom/filter-groups.ts
function e(e, t) {
	return e.x - 2 < t.x + t.w + 2 && t.x - 2 < e.x + e.w + 2 && e.y - 2 < t.y + t.h + 2 && t.y - 2 < e.y + e.h + 2;
}
var t = (e) => e.width * e.height;
function n(e, t) {
	let n = Math.min(e.x, t.x), r = Math.min(e.y, t.y);
	return {
		x: n,
		y: r,
		width: Math.max(e.x + e.width, t.x + t.width) - n,
		height: Math.max(e.y + e.height, t.y + t.height) - r
	};
}
function r(e, r, i) {
	let a = [], o = (e) => t(e.crop) + i.sampled * t(e.sampled) + (i.output + (e.members.length > 1 ? 4 : 0)) * t(e.output) + e.images;
	for (let i of e) {
		let e = r(i), s = {
			...e,
			members: [i],
			images: 4 * t(e.output)
		}, c = -1, l = 0, u;
		for (let [e, t] of a.entries()) {
			let r = {
				output: n(t.output, s.output),
				crop: n(t.crop, s.crop),
				sampled: n(t.sampled, s.sampled),
				members: [...t.members, i],
				images: t.images + s.images
			}, a = o(t) + o(s) - o(r);
			a > l && (c = e, l = a, u = r);
		}
		u ? a[c] = u : a.push(s);
	}
	return a.map((e) => e.members);
}
//#endregion
export { r as clusterFilterBranches, e as mapBoxesOverlap };
