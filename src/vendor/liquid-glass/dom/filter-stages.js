import { gecko as e } from "./engine.js";
//#region src/dom/filter-stages.ts
function t(e) {
	return [...e.matchAll(/<fe(?!Func[RGBA]\b|MergeNode\b)[A-Z][\w]*\b/g)].length;
}
//#endregion
export { t as filterPrimitiveCount, e as gecko };
