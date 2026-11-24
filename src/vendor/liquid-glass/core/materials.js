//#region src/core/materials.ts
var e = {
	clear: {
		blur: 0,
		refraction: 60,
		light: {
			shadowLift: .18,
			highlightRolloff: 0
		},
		dark: {
			shadowLift: .15,
			highlightRolloff: .2
		}
	},
	regular: {
		blur: 7.33,
		refraction: 60,
		light: {
			fillSigma: 23,
			fillOpacity: .34,
			tone: [
				.36,
				.67,
				-.1113,
				1.1031
			]
		},
		dark: {
			fillSigma: 21.8,
			fillOpacity: .65,
			tone: [
				.105,
				.83,
				-.2091,
				1.0648
			]
		}
	}
};
//#endregion
export { e as materials };
