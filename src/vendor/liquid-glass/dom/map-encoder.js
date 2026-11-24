// @req REQ-2026-006：本地 module Worker 失败时回退主线程编码，不使用 blob/data Worker。
import { encodeMapPixels } from './map-encoding.js';
let worker;
let unavailable = false;
let serial = 0;
const pending = new Map();

function fail(error) {
  unavailable = true;
  worker?.terminate();
  worker = undefined;
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}

function getWorker() {
  if (unavailable) return undefined;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./map-encoder.worker.js', import.meta.url), {
      type: 'module', name: 'easyui-material-encoder',
    });
    worker.onmessage = ({ data: { id, planes, error } }) => {
      const request = pending.get(id);
      pending.delete(id);
      if (error) request?.reject(Error(error));
      else request?.resolve(planes);
    };
    worker.onerror = (event) => { event.preventDefault(); fail(Error('Material encoder worker unavailable.')); };
    worker.onmessageerror = () => fail(Error('Material encoder worker message failed.'));
    return worker;
  } catch {
    unavailable = true;
    return undefined;
  }
}

export async function encodeMaterialPixels(pixels, width, height, cap) {
  const encoder = getWorker();
  if (encoder) {
    try {
      return await new Promise((resolve, reject) => {
        const id = ++serial;
        pending.set(id, { resolve, reject });
        try { encoder.postMessage({ id, pixels, width, height, cap }); }
        catch (error) { pending.delete(id); reject(error); }
      });
    } catch {}
  }
  return encodeMapPixels(pixels, width, height, cap);
}

export function disposeMaterialEncoder() {
  // 会话卸载只终止当前 Worker；下次编码允许重建，不在页面生命周期内永久禁用 Worker 路径。
  fail(Error('Material encoder disposed.'));
  unavailable = false;
}

