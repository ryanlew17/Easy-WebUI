export const NODE_VERSION_RANGE = '>=26.13.1 <27';

export function isSupportedNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  return major === 26 && (minor > 13 || (minor === 13 && patch >= 1));
}

export function assertSupportedNodeVersion(version = process.versions.node) {
  if (!isSupportedNodeVersion(version)) {
    throw new Error(`Unsupported Node.js ${version}. Easy WebUI requires ${NODE_VERSION_RANGE}.`);
  }
}

assertSupportedNodeVersion();
