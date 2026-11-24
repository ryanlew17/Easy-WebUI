//#region src/dom/filter-bounds.ts
function e(e, t, n, r) {
	let i = Math.min(0, ...n.map((e) => e.x)) - r, a = Math.min(0, ...n.map((e) => e.y)) - r, o = Math.max(e, ...n.map((e) => e.x + e.width)) + r, s = Math.max(t, ...n.map((e) => e.y + e.height)) + r;
	return {
		x: i,
		y: a,
		width: o - i,
		height: s - a
	};
}
function t(e, t, n) {
	let r = /* @__PURE__ */ new Set();
	for (let i of n) {
		let n = i.x < 0, a = i.y < 0, o = i.x + i.width > e, s = i.y + i.height > t;
		n && a && r.add("00"), o && a && r.add("20"), n && s && r.add("02"), o && s && r.add("22");
	}
	return {
		left: n.some((e) => e.x < 0),
		top: n.some((e) => e.y < 0),
		right: n.some((t) => t.x + t.width > e),
		bottom: n.some((e) => e.y + e.height > t),
		corners: r
	};
}
function n(e, t, n, r, i, a = "SourceGraphic") {
	let o = Math.min(1, e, t), s = [
		{
			source: 0,
			size: o,
			target: n.x,
			extent: -n.x,
			needed: i.left
		},
		{
			source: 0,
			size: e,
			target: 0,
			extent: e,
			needed: !0
		},
		{
			source: e - o,
			size: o,
			target: e,
			extent: n.x + n.width - e,
			needed: i.right
		}
	], c = [
		{
			source: 0,
			size: o,
			target: n.y,
			extent: -n.y,
			needed: i.top
		},
		{
			source: 0,
			size: t,
			target: 0,
			extent: t,
			needed: !0
		},
		{
			source: t - o,
			size: o,
			target: t,
			extent: n.y + n.height - t,
			needed: i.bottom
		}
	], l = [], u = {};
	return s.forEach((e, t) => c.forEach((n, o) => {
		if (t === 1 && o === 1 || !e.needed || !n.needed || e.extent <= 0 || n.extent <= 0 || t !== 1 && o !== 1 && !i.corners.has(`${t}${o}`)) return;
		let s = `${r}edge${t}${o}`;
		l.push(`<feOffset in="${a}" dx="0" dy="0" x="${e.source}" y="${n.source}" width="${e.size}" height="${n.size}" result="${s}"/>`);
		let c = t !== 1 && o !== 1;
		c && l.push(`<feTile in="${s}" x="${e.target}" y="${n.source}" width="${e.extent}" height="${n.size}" result="${s}row"/>`), l.push(`<feTile in="${c ? `${s}row` : s}" x="${e.target}" y="${n.target}" width="${e.extent}" height="${n.extent}" result="${s}tile"/>`), u[`${t}${o}`] = `${s}tile`;
	})), {
		markup: l.join(""),
		names: u
	};
}
function r(e, t, n) {
	let r = n.x < 0, i = n.y < 0, a = n.x + n.width > e, o = n.y + n.height > t, s = [];
	return r && s.push("01"), a && s.push("21"), i && s.push("10"), o && s.push("12"), r && i && s.push("00"), a && i && s.push("20"), r && o && s.push("02"), a && o && s.push("22"), s;
}
//#endregion
export { t as crossedSides, n as edgeTiles, e as filterBounds, r as tilesFor };
