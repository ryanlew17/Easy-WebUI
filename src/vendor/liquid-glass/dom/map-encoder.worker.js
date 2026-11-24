// @req REQ-2026-006：Vite 将本文件及依赖编译为 file:// 可加载的本地 Worker。
import { encodeMapPixels } from './map-encoding.js';
let queue = Promise.resolve();
self.onmessage = ({ data: { id, pixels, width, height, cap } }) => {
  queue = queue.then(async () => {
    try { self.postMessage({ id, planes: await encodeMapPixels(pixels, width, height, cap) }); }
    catch (error) { self.postMessage({ id, error: String(error) }); }
  });
};

