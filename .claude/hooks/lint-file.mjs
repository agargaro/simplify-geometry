import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const input = JSON.parse(readFileSync(0, 'utf8'));
const file = input.tool_response?.filePath ?? input.tool_input?.file_path;
if (typeof file !== 'string' || !file.endsWith('.ts')) process.exit(0);
const path = relative(root, resolve(file));
if (path.startsWith('..') || /^(build|node_modules|coverage)[\\/]/.test(path)) process.exit(0);

const result = spawnSync('npx', ['eslint', '--max-warnings=0', path], { cwd: root, encoding: 'utf8', shell: true });
if (result.status === 0) process.exit(0);
process.stderr.write(`ESLint errors in ${path}:\n${result.stdout}${result.stderr}`);
process.exit(2);
