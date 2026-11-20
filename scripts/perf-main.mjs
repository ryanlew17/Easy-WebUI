import './node-version-guard.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { measurementIdentity } from './perf-identity.mjs';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';

const require = createRequire(import.meta.url);
const { openDatabase } = require('../dist-electron/electron/db/index.js');
const { createConversationsDao } = require('../dist-electron/electron/db/conversations.js');
const { createMessagesDao } = require('../dist-electron/electron/db/messages.js');
const { createCryptoService } = require('../dist-electron/electron/crypto/index.js');
const { createBackupService } = require('../dist-electron/electron/backup/index.js');
const { breakParentCycles } = require('../dist-electron/electron/backup/core.js');

const environment = {
  ...measurementIdentity(),
  platform: process.platform,
  release: os.release(),
  arch: process.arch,
  cpu: os.cpus()[0]?.model ?? 'unknown',
  logicalCores: os.cpus().length,
  memoryGiB: +(os.totalmem() / 2 ** 30).toFixed(1),
  node: process.version,
};

function measure(fn, runs) {
  const durations = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    durations.push(performance.now() - start);
  }
  durations.sort((a, b) => a - b);
  return {
    runs,
    p50: +durations[Math.floor((runs - 1) * 0.5)].toFixed(2),
    p95: +durations[Math.floor((runs - 1) * 0.95)].toFixed(2),
    min: +durations[0].toFixed(2),
    max: +durations[runs - 1].toFixed(2),
  };
}

function seedMessages() {
  const db = openDatabase(':memory:');
  const conversation = createConversationsDao(db).create();
  const messages = createMessagesDao(db);
  const insert = db.prepare(`
    INSERT INTO messages (
      id, conversation_id, parent_id, role, content, reasoning, token_count, partial,
      error_json, reasoning_ms, ttft_ms, total_ms, finish_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, NULL, ?, 0, NULL, NULL, NULL, NULL, NULL, ?)
  `);
  db.transaction(() => {
    let parent = null;
    for (let i = 0; i < 10000; i++) {
      const id = `m${i}`;
      insert.run(
        id,
        conversation.id,
        parent,
        i % 2 ? 'assistant' : 'user',
        `message ${i} ${'x'.repeat(120)}`,
        30,
        i,
      );
      parent = id;
    }
  })();
  messages.setActiveLeaf(conversation.id, 'm9999');
  return { db, conversationId: conversation.id, messages };
}

const memoryBefore = process.memoryUsage();
const { db, conversationId, messages } = seedMessages();
const memoryAfterSeed = process.memoryUsage();
const listed = messages.list(conversationId);
if (listed.length !== 10000 || listed[0].id !== 'm0' || listed.at(-1).id !== 'm9999') {
  throw new Error(`list correctness failed: ${listed.length}`);
}
if (messages.pathTo('m9999').length !== 10000) throw new Error('pathTo correctness failed');
if (messages.subtreeIds('m0').length !== 10000) throw new Error('subtree correctness failed');

const messageMetrics = {
  list: measure(() => messages.list(conversationId), 15),
  pathTo: measure(() => messages.pathTo('m9999'), 15),
  subtreeIds: measure(() => messages.subtreeIds('m0'), 7),
  queryPlan: db
    .prepare(
      'EXPLAIN QUERY PLAN SELECT * FROM messages WHERE conversation_id = ? AND parent_id = ? ORDER BY created_at ASC, rowid ASC',
    )
    .all(conversationId, 'm0'),
};
db.close();

const deleteMetrics = measure(() => {
  const seeded = seedMessages();
  try {
    const deleted = seeded.messages.deleteWithDescendants(seeded.conversationId, ['m5000']);
    if (deleted !== 5000) throw new Error(`delete correctness failed: ${deleted}`);
    if (seeded.messages.list(seeded.conversationId).length !== 5000) {
      throw new Error('delete survivor correctness failed');
    }
  } finally {
    seeded.db.close();
  }
}, 3);

const cycleMetrics = measure(() => {
  const rows = Array.from({ length: 10000 }, (_, i) => ({
    id: `m${i}`,
    conversation_id: 'c-backup',
    parent_id: i === 0 ? null : `m${i - 1}`,
  }));
  const out = breakParentCycles(rows);
  if (out.length !== 10000 || out[0].parent_id !== null) {
    throw new Error('backup cycle traversal correctness failed');
  }
}, 3);
const cyclic = breakParentCycles([
  { id: 'a', conversation_id: 'c', parent_id: null },
  { id: 'b', conversation_id: 'c', parent_id: 'c' },
  { id: 'c', conversation_id: 'c', parent_id: 'b' },
]);
for (const row of cyclic) {
  const seen = new Set();
  let current = row;
  while (current) {
    if (seen.has(current.id)) throw new Error('backup cycle was not broken');
    seen.add(current.id);
    const parentId = current.parent_id;
    current = parentId ? cyclic.find((candidate) => candidate.id === parentId) : null;
  }
}

let decryptCalls = 0;
const safeStorage = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async () => {
    return Buffer.from('renewed', 'utf8');
  },
  decryptStringAsync: async (encrypted) => {
    decryptCalls++;
    const legacy = encrypted.toString('utf8') === 'legacy';
    return { result: 'sk-perf-benchmark', shouldReEncrypt: legacy };
  },
};
const decryptCounts = [];
let cipher = '';
let fallbackKeyringIsolated = false;
const cryptoTempDir = fs.mkdtempSync(path.join(process.cwd(), 'build', 'req003-crypto-'));
try {
  const crypto = await createCryptoService({ dataDir: cryptoTempDir, safeStorage });
  cipher = `v1:ss:${Buffer.from('legacy').toString('base64')}`;
  for (let i = 0; i < 2; i++) {
    const before = decryptCalls;
    const plain = await crypto.decryptString(cipher, (nextCipher) => {
      cipher = nextCipher;
    });
    if (plain !== 'sk-perf-benchmark') throw new Error('decrypt correctness failed');
    decryptCounts.push(decryptCalls - before);
  }

  const fallback = await createCryptoService({ dataDir: cryptoTempDir, safeStorage: null });
  await fallback.encryptString('perf-fallback-probe');
  fallbackKeyringIsolated = fs.existsSync(path.join(cryptoTempDir, 'keyring.bin'));
  if (!fallbackKeyringIsolated) throw new Error('machine fallback keyring isolation failed');
} finally {
  fs.rmSync(cryptoTempDir, { recursive: true, force: true });
}

const tempDir = fs.mkdtempSync(path.join(process.cwd(), 'build', 'req003-perf-'));
let backupMetrics;
try {
  const backupsDir = path.join(tempDir, 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  for (let i = 0; i < 4; i++) {
    const zip = new AdmZip();
    zip.addFile(
      'manifest.json',
      Buffer.from(JSON.stringify({ includes_keys: i % 2 === 0, created_at: 1000 + i }), 'utf8'),
    );
    zip.addFile('data.json', Buffer.from('{}', 'utf8'));
    zip.writeZip(path.join(backupsDir, `easyui-backup-20990101-000${i}.zip`));
  }
  const backup = createBackupService({
    db: {},
    crypto: {},
    dataDir: tempDir,
    appVersion: 'perf',
  });
  const coldStart = performance.now();
  const first = backup.listBackups();
  const coldMs = +(performance.now() - coldStart).toFixed(2);
  if (first.length !== 4 || first[0].created_at !== 1003) {
    throw new Error('backup manifest correctness failed');
  }
  const warm = measure(() => backup.listBackups(), 7);
  backupMetrics = { files: first.length, repeatReadMs: coldMs, warm };
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}

const assets = [];
for (const dir of ['dist/assets', 'dist-electron/electron']) {
  for (const filename of fs.readdirSync(dir)) {
    if (dir.endsWith('assets') && !/\.(js|css)$/.test(filename)) continue;
    if (!dir.endsWith('assets') && filename !== 'preload.js') continue;
    const bytes = fs.readFileSync(path.join(dir, filename));
    assets.push({
      file: `${dir}/${filename}`,
      bytes: bytes.length,
      gzip: zlib.gzipSync(bytes, { level: 9 }).length,
      brotli: zlib.brotliCompressSync(bytes).length,
    });
  }
}

const mib = (value) => +(value / 1048576).toFixed(1);
console.log(
  JSON.stringify(
    {
      kind: 'req003-main',
      environment,
      dataset: {
        messages: 10000,
        charactersPerMessage: '120 plus id prefix',
        deleteRoots: ['m5000'],
        backupRows: 10000,
        visibleBubbleBenchmark: 'separate renderer script',
      },
      messages: { ...messageMetrics, deleteTrailing5000: deleteMetrics },
      backup: { breakParentCycles: cycleMetrics, manifests: backupMetrics },
      safeStorage: {
        decryptCounts,
        finalCipherUsesRenewedValue: cipher.includes('cmVuZXdlZA'),
        fallbackKeyringIsolated,
      },
      memory: {
        before: { heapUsedMiB: mib(memoryBefore.heapUsed), rssMiB: mib(memoryBefore.rss) },
        afterSeed: { heapUsedMiB: mib(memoryAfterSeed.heapUsed), rssMiB: mib(memoryAfterSeed.rss) },
        final: { heapUsedMiB: mib(process.memoryUsage().heapUsed), rssMiB: mib(process.memoryUsage().rss) },
      },
      assets,
    },
    null,
    2,
  ),
);
