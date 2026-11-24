// @req REQ-2026-006：页面与材质引擎之间的稳定语义契约。
export type GlassRole = 'composer' | 'topbar' | 'model-picker' | 'generate-pill';
export type GlassFallbackReason =
  | 'webgpu'
  | 'reduced-transparency'
  | 'forced-colors'
  | 'timeout'
  | 'map'
  | 'device-lost'
  | 'filter-budget'
  | 'geometry';
export type GlassState = 'css' | 'initializing' | 'active' | 'fallback';

export interface GlassCapabilities {
  webGPU: boolean;
  reducedTransparency: boolean;
  forcedColors: boolean;
}

export interface GlassDiagnostics {
  state: GlassState;
  surfaces: number;
  maps: number;
  mapPixels: number;
  mapBuilds: number;
  reason?: GlassFallbackReason;
}
