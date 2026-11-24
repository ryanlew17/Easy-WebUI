import { unionSamplingBounds as e } from "./sampling-bounds.js";
//#region src/dom/compose-layers.ts
var t = (e, t) => e.x < t.x + t.width && t.x < e.x + e.width && e.y < t.y + t.height && t.y < e.y + e.height, n = (e) => `x="${e.x}" y="${e.y}" width="${e.width}" height="${e.height}"`, r = (e) => {
	let t = Math.floor(e.x), n = Math.floor(e.y);
	return {
		x: t,
		y: n,
		width: Math.ceil(e.x + e.width) - t,
		height: Math.ceil(e.y + e.height) - n
	};
}, i = (e, t, r) => `<feMerge result="${t}"${r ? ` ${n(r)}` : ""}>${e.map((e) => `<feMergeNode in="${e}"/>`).join("")}</feMerge>`;
function a(a, o = "scene", s = "SourceGraphic") {
	if (!a.length) return i([s], o);
	let c = [];
	a.forEach((n, i) => {
		let a = {
			members: [i],
			bounds: r(n.bounds)
		};
		for (let n = 0; n < c.length;) {
			if (!t(a.bounds, c[n].bounds)) {
				n++;
				continue;
			}
			let i = c.splice(n, 1)[0];
			a = {
				members: [...a.members, ...i.members],
				bounds: r(e([a.bounds, i.bounds]))
			}, n = 0;
		}
		a.members.sort((e, t) => e - t), c.push(a);
	});
	let l = [], u = [], d = [];
	c.forEach((e, t) => {
		if (e.members.length === 1) {
			let t = a[e.members[0]];
			u.push(t.mask), d.push(...t.layers);
			return;
		}
		let r = `${o}-group${t}`, c = n(e.bounds), f = `${r}-area`;
		l.push(`<feFlood flood-color="white" ${c} result="${f}"/>`), u.push(f);
		let p = `${r}-source`;
		l.push(`<feComposite in="${s}" in2="${f}" operator="in" ${c} result="${p}"/>`);
		for (let t of e.members) {
			let n = a[t], r = `${o}-${n.id}-outside`, s = `${o}-${n.id}-output`;
			l.push(`<feComposite in="${p}" in2="${n.mask}" operator="out" ${c} result="${r}"/>`), l.push(i([r, ...n.layers], s, e.bounds)), p = s;
		}
		d.push(p);
	});
	let f = u[0];
	return u.length > 1 && (l.push(i(u, `${o}-areas`, e(c.map((e) => e.bounds)))), f = `${o}-areas`), l.push(`<feComposite in="${s}" in2="${f}" operator="out" result="${o}-outside"/>`), l.push(i([`${o}-outside`, ...d], o)), l.join("");
}
//#endregion
export { a as composeSparseLayers };
