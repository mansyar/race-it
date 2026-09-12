/**
 * Test harness for the update-flow e2e: fixture management plus a tiny static
 * file server over a mutable directory, so a "new deploy" can be served to a
 * running app mid-test.
 */
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURES_DIR = resolve(ROOT, '.e2e', 'fixtures');
const TMP_DIR = resolve(ROOT, '.e2e', 'tmp');

const MIME_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.mjs': 'text/javascript',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

export interface StaticSite {
  origin: string;
  close(): Promise<void>;
}

/** Builds the a/b fixtures on demand (two cheap Vite builds). */
export function ensureUpdateFixtures(): void {
  if (existsSync(join(FIXTURES_DIR, 'a', 'index.html'))) {
    return;
  }
  execSync('node scripts/build-update-fixtures.mjs', { cwd: ROOT, stdio: 'inherit' });
}

/** Fresh per-test copy of a fixture variant, mutable in place. */
export function createServedCopy(label: 'a' | 'b'): string {
  mkdirSync(TMP_DIR, { recursive: true });
  const dir = mkdtempSync(join(TMP_DIR, 'serve-'));
  cpSync(join(FIXTURES_DIR, label), dir, { recursive: true });
  return dir;
}

/** "Deploys" another variant by overwriting the served directory in place. */
export function swapServedCopy(dir: string, label: 'a' | 'b'): void {
  cpSync(join(FIXTURES_DIR, label), dir, { recursive: true, force: true });
}

/** Serves `root` on an ephemeral localhost port with no-store caching. */
export function startStaticSite(root: string): Promise<StaticSite> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) {
      pathname += 'index.html';
    }
    const filePath = normalize(join(root, pathname));
    if (!filePath.startsWith(root)) {
      response.writeHead(403);
      response.end();
      return;
    }
    let body: Buffer;
    try {
      body = readFileSync(filePath);
    } catch {
      response.writeHead(404);
      response.end('not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': MIME_TYPES[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    response.end(body);
  });
  return new Promise((resolveSite, rejectSite) => {
    server.once('error', rejectSite);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      resolveSite({
        origin: `http://127.0.0.1:${port}`,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => resolveClose());
          }),
      });
    });
  });
}
