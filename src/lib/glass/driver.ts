// @req REQ-2026-006：vendored 引擎的唯一 DOM 驱动边界；静态依赖不得指向 vendor。
import type { GlassDriver, GlassSurfaceHooks } from './engine';
import { isValidSurfaceGeometry, nextGeometryGrace, surfaceOptionsForRole } from './geometry';
import type { GlassFallbackReason, GlassRole } from './types';

/** 资源上限类失败（像素预算 / 表面·采样上限）一律以 RangeError 抛出，归为 filter-budget；
 * vendored 的 refraction 参数校验同为 RangeError，但适配层参数固定、该路径不可达。 */
export function errorReason(error: unknown): GlassFallbackReason {
  return error instanceof RangeError ? 'filter-budget' : 'map';
}

export function createVendoredGlassDriver(): GlassDriver {
  return {
    async start({ root, content, signal, onDiagnostic, onDeviceLoss }) {
      if (signal.aborted) throw new Error('Glass initialization aborted.');
      const [{ createGlassScene, clearMaterialMapCache, getMaterialMapStats }, gpu, encoder] = await Promise.all([
        import('../../vendor/liquid-glass/dom.js'),
        import('../../vendor/liquid-glass/gpu.js'),
        import('../../vendor/liquid-glass/dom/map-encoder.js'),
      ]);
      if (signal.aborted) throw new Error('Glass initialization aborted.');
      const scene = createGlassScene(root, {
        maxSurfaces: 4,
        onDiagnostic: () => onDiagnostic(getMaterialMapStats()),
      });
      scene.setContent(content);
      const unsubscribeLoss = gpu.onMaterialDeviceLoss(onDeviceLoss);
      let disposed = false;
      const doc = root.ownerDocument;
      const appearance = (): 'light' | 'dark' => doc.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      return {
        addSurface(role: GlassRole, element: HTMLElement, hooks: GlassSurfaceHooks) {
          if (disposed) return () => undefined;
          let active = true;
          let invalid = false;
          let invalidSince: number | null = null;
          let sceneReady = false;
          // 逐帧动画器只在就绪状态变化时回调；恒定 onReady 会每帧写 dataset，唤醒 ticker 形成自持 rAF 循环。
          let notifiedReady: boolean | null = null;
          const notify = (ready: boolean): void => {
            if (ready === notifiedReady) return;
            notifiedReady = ready;
            hooks.onReady(ready);
          };
          const options = {
            ...surfaceOptionsForRole(role, appearance()),
            onReady: (ready: boolean) => {
              sceneReady = ready;
              notify(ready && invalidSince === null);
            },
            onError: (error: Error) => hooks.onError(errorReason(error)),
          };
          const temporary = role === 'model-picker' || role === 'generate-pill';
          const geometry = () => {
            const viewport = doc.defaultView?.visualViewport;
            return {
              surface: element.getBoundingClientRect(),
              root: root.getBoundingClientRect(),
              viewport: {
                left: 0,
                top: 0,
                width: viewport?.width ?? doc.documentElement.getBoundingClientRect().width,
                height: viewport?.height ?? doc.documentElement.getBoundingClientRect().height,
              },
              temporary,
            };
          };
          const valid = (): boolean => isValidSurfaceGeometry(geometry());
          let unregister: () => void;
          try {
            unregister = scene.addSurface(element, options);
          } catch (error) {
            queueMicrotask(() => hooks.onError(errorReason(error)));
            return () => undefined;
          }
          const stopGeometryWatch = scene.addAnimator({
            frame: (time: number) => {
              if (!active) return false;
              options.appearance = appearance();
              const grace = nextGeometryGrace({ valid: valid(), invalidSince, time });
              invalidSince = grace.invalidSince;
              if (grace.failed && !invalid) {
                invalid = true;
                queueMicrotask(() => {
                  if (active) hooks.onError('geometry');
                });
              } else if (!invalid) {
                notify(sceneReady && invalidSince === null);
              }
              return false;
            },
            dispose: () => { active = false; },
          });
          return () => {
            if (!active) return;
            active = false;
            stopGeometryWatch();
            unregister();
            hooks.onReady(false);
          };
        },
        setActive(active: boolean) {
          if (!disposed) scene.setActive(active);
        },
        dispose() {
          if (disposed) return;
          disposed = true;
          scene.dispose();
          unsubscribeLoss();
          clearMaterialMapCache();
          encoder.disposeMaterialEncoder();
          void gpu.disposeMaterialRenderer().catch(() => undefined);
        },
      };
    },
  };
}
