export interface GlassDiagnostic { surfaces: number; maps: number; mapTime: number; error?: Error; }
export interface GlassSceneOptions { onDiagnostic?: (diagnostic: GlassDiagnostic) => void; maxSurfaces?: number; }
export interface SurfaceOptions {
  material?: 'clear' | 'regular';
  appearance?: 'light' | 'dark';
  radius?: number | 'capsule';
  refraction?: number;
  tint?: string;
  interactive?: false;
  onReady?: (ready: boolean) => void;
  onError?: (error: Error) => void;
}
export interface GlassSurfaceAnimator { frame(time: number): boolean | void; dispose(): void; }
export interface GlassSceneController {
  setContent(element: HTMLElement | null): void;
  setActive(active: boolean): void;
  addSurface(element: HTMLElement, options?: SurfaceOptions): () => void;
  addAnimator(animator: GlassSurfaceAnimator): () => void;
  dispose(): void;
}
export declare function createGlassScene(root: HTMLElement, config?: GlassSceneOptions): GlassSceneController;
export declare function clearMaterialMapCache(): void;
export declare function getMaterialMapStats(): { maps: number; mapPixels: number; mapBuilds: number };

