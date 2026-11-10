import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function checkSourceMap(root: string, packageRoot: string, output: string): void {
  const outputPath = join(packageRoot, output);
  const mapPath = `${outputPath}.map`;
  const map: unknown = JSON.parse(readFileSync(mapPath, 'utf8'));
  assert(typeof map === 'object' && map !== null);
  assert('version' in map && map.version === 3);
  assert('sources' in map && Array.isArray(map.sources) && map.sources.length > 0);
  assert('mappings' in map && typeof map.mappings === 'string' && map.mappings.length > 0);
  assert(!('sourceRoot' in map) || map.sourceRoot === '');
  assert(readFileSync(outputPath, 'utf8').includes(`sourceMappingURL=${basename(output)}.map`));
  assert('sourcesContent' in map && Array.isArray(map.sourcesContent));
  for (let i = 0; i < map.sources.length; i++) {
    const source: unknown = map.sources[i];
    assert(typeof source === 'string');
    const sourceRelative = relative(packageRoot, resolve(dirname(mapPath), source)).split(sep).join('/');
    assert(sourceRelative.startsWith('src/'), `Map source outside src: ${source}`);
    assert.equal(map.sourcesContent[i], readFileSync(join(root, sourceRelative), 'utf8'), `Embedded source differs: ${source}`);
  }
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCli = process.env['npm_execpath'];
if (npmCli === undefined) throw new Error('Run this check through npm run test:package');
const cache = join(root, '.cache', 'package');
mkdirSync(cache, { recursive: true });
const consumer = mkdtempSync(join(cache, 'consumer-'));
const output = execFileSync(process.execPath, [npmCli, 'pack', '--ignore-scripts', '--json', '--pack-destination', consumer], {
  cwd: root,
  encoding: 'utf8'
});
const packs: unknown = JSON.parse(output);
assert(typeof packs === 'object' && packs !== null);
const packList: unknown[] = Array.isArray(packs) ? packs : Object.values(packs);
assert(packList.length === 1);
const pack: unknown = packList[0];
assert(typeof pack === 'object' && pack !== null && 'filename' in pack && typeof pack.filename === 'string');
const packageRoot = join(consumer, 'node_modules', '@three.ez', 'simplify-geometry');
mkdirSync(packageRoot, { recursive: true });
execFileSync('tar', ['-xf', pack.filename, '--strip-components=1', '-C', relative(consumer, packageRoot)], { cwd: consumer });
const packedFiles = readdirSync(packageRoot, { recursive: true, encoding: 'utf8' }).map((file) => file.split(sep).join('/'));
for (const file of packedFiles) {
  assert(/^build(?:\/|$)|^(?:package\.json|README\.md|LICENSE)$/.test(file), `Unexpected packed path: ${file}`);
  assert(!file.endsWith('.map') || file === 'build/index.js.map', `Unexpected source map: ${file}`);
}
for (const file of readdirSync(join(root, 'src'), { recursive: true, encoding: 'utf8' })) {
  if (!file.endsWith('.ts') || file.endsWith('.d.ts')) continue;
  const declaration = `build/types/${file.split(sep).join('/').replace(/\.ts$/, '.d.ts')}`;
  assert(packedFiles.includes(declaration), `Missing declaration: ${declaration}`);
}
assert.deepEqual(packedFiles.filter((file) => file.endsWith('.js')), ['build/index.js']);
const bundle = readFileSync(join(packageRoot, 'build', 'index.js'), 'utf8');
assert(/from ['"]three['"]/.test(bundle), 'three must stay external');
assert(/from ['"]meshoptimizer\/simplifier['"]/.test(bundle), 'meshoptimizer must stay external');
checkSourceMap(root, packageRoot, 'build/index.js');
writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
const probe = `import { simplifyGeometry, simplifyReady } from '@three.ez/simplify-geometry';
import { TorusKnotGeometry } from 'three';
const geometry = new TorusKnotGeometry(1, 0.4, 64, 8);
let threwBeforeReady = false;
try { simplifyGeometry(geometry, { ratio: 0.5 }); } catch { threwBeforeReady = true; }
if (!threwBeforeReady) throw new Error('simplifyGeometry must throw before simplifyReady');
await simplifyReady();
const simplified = simplifyGeometry(geometry, { ratio: 0.5 });
const index = simplified.geometry.index;
if (index === null || geometry.index === null || index.count === 0 || index.count >= geometry.index.count) throw new Error('Invalid package runtime');
if (!(simplified.error >= 0)) throw new Error('Invalid simplification error');
`;
writeFileSync(join(consumer, 'consumer.ts'), probe);
writeFileSync(join(consumer, 'tsconfig.json'), JSON.stringify({
  extends: join(root, 'tsconfig.base.json'),
  include: ['consumer.ts']
}));
execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(consumer, 'tsconfig.json')], {
  stdio: 'inherit'
});
writeFileSync(join(consumer, 'consumer.mjs'), probe);
execFileSync(process.execPath, [join(consumer, 'consumer.mjs')], { stdio: 'inherit' });
console.info('Packed package: contents, source maps, external dependencies, runtime import and strict consumer types passed');
