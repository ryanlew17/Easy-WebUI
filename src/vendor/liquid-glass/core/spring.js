//#region src/core/spring.ts
var e = {
	press: {
		duration: .24,
		bounce: .2
	},
	release: {
		duration: .5,
		bounce: .42
	},
	glow: {
		duration: .42,
		bounce: 0
	},
	morph: {
		duration: .42,
		bounce: .18
	},
	layout: {
		duration: .4,
		bounce: .16
	},
	track: {
		duration: .18,
		bounce: 0
	}
}, t = class {
	value;
	velocity = 0;
	target;
	stiffness = 0;
	damping = 0;
	constructor(e, t) {
		this.value = e, this.target = e, this.configure(t);
	}
	configure({ duration: e, bounce: t }) {
		if (!(e > 0) || !Number.isFinite(e)) throw RangeError("Spring duration must be positive and finite.");
		if (!(t > -1 && t < 1)) throw RangeError("Spring bounce must be greater than -1 and less than 1.");
		let n = 2 * Math.PI / e;
		return this.stiffness = n * n, this.damping = t >= 0 ? 4 * Math.PI * (1 - t) / e : 4 * Math.PI / (e * (1 + t)), this;
	}
	jump(e) {
		return this.value = this.target = e, this.velocity = 0, this;
	}
	get settled() {
		return this.value === this.target && this.velocity === 0;
	}
	step(e) {
		if (this.settled || !(e > 0)) return this;
		let t = Math.sqrt(this.stiffness), n = this.damping / (2 * t), r = this.value - this.target, i = this.velocity, a, o;
		if (n < 1) {
			let s = t * Math.sqrt(1 - n * n), c = Math.exp(-n * t * e), l = r, u = (i + n * t * r) / s, d = Math.cos(s * e), f = Math.sin(s * e);
			a = c * (l * d + u * f), o = c * ((u * s - n * t * l) * d - (l * s + n * t * u) * f);
		} else if (n === 1) {
			let n = Math.exp(-t * e), s = i + t * r;
			a = n * (r + s * e), o = n * (s - t * (r + s * e));
		} else {
			let s = t * Math.sqrt(n * n - 1), c = -n * t + s, l = -n * t - s, u = (i - c * r) / (l - c), d = r - u, f = Math.exp(c * e), p = Math.exp(l * e);
			a = d * f + u * p, o = d * c * f + u * l * p;
		}
		let s = Math.max(1, Math.abs(this.target), Math.abs(r));
		return Math.abs(a) < 1e-4 * s && Math.abs(o) < .001 * s ? (this.value = this.target, this.velocity = 0) : (this.value = this.target + a, this.velocity = o), this;
	}
};
function n(e, n, r, i = 0, a = 0) {
	let o = new t(n, e);
	o.target = r, o.velocity = i;
	let s = a * Math.abs(n - r), c = 0;
	for (; !o.settled && c < 5 && !(s && Math.abs(o.value - r) <= s && Math.abs(o.velocity) <= s * 10);) o.step(1 / 120), c += 1 / 120;
	return c;
}
function r(e, t, n = .55) {
	if (t <= 0) return 0;
	let r = Math.abs(e);
	return Math.sign(e) * t * (1 - 1 / (r * n / t + 1));
}
//#endregion
export { t as Spring, r as rubberBand, n as settleTime, e as springs };
