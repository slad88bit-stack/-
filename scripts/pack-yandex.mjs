import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const outZip = path.join(rootDir, 'yandex-game.zip');

const MAX_UNPACKED_BYTES = 100 * 1024 * 1024; // Yandex Games 100 MB unpacked limit

function walkFiles(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, base));
    } else if (entry.isFile()) {
      const rel = path.relative(base, full).replace(/\\/g, '/');
      const stat = fs.statSync(full);
      results.push({ full, rel, size: stat.size });
    }
  }
  return results;
}

console.log('1/4 Building production bundle (tsc -b && vite build)...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

console.log('\n2/4 Auditing dist/ against Yandex Games requirements...');
const indexPath = path.join(distDir, 'index.html');
if (!fs.existsSync(indexPath)) {
  throw new Error('dist/index.html is missing!');
}

const html = fs.readFileSync(indexPath, 'utf8');
const checks = [
  {
    name: 'index.html at archive root',
    ok: true,
  },
  {
    name: 'Yandex SDK loaded via relative /sdk.js',
    ok: html.includes('src="/sdk.js"'),
  },
  {
    name: 'No forbidden absolute games.s3.yandex.net SDK URL',
    ok: !html.includes('games.s3.yandex.net'),
  },
  {
    name: 'No external Google Fonts CDN links',
    ok: !html.includes('fonts.googleapis.com') && !html.includes('fonts.gstatic.com'),
  },
  {
    name: 'Relative asset paths (./assets/)',
    ok: html.includes('./assets/'),
  },
];

const files = walkFiles(distDir);
let totalBytes = 0;
const badNames = [];
for (const f of files) {
  totalBytes += f.size;
  if (/[^a-zA-Z0-9._\-/]/.test(f.rel)) {
    badNames.push(f.rel);
  }
}

checks.push({
  name: `No spaces or Cyrillic in filenames (${files.length} files)`,
  ok: badNames.length === 0,
  detail: badNames.join(', '),
});
checks.push({
  name: `Unpacked size <= 100 MB (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`,
  ok: totalBytes <= MAX_UNPACKED_BYTES,
});

let allOk = true;
for (const c of checks) {
  const icon = c.ok ? '✅' : '❌';
  console.log(`  ${icon} ${c.name}${c.detail ? ' -> ' + c.detail : ''}`);
  if (!c.ok) allOk = false;
}
if (!allOk) {
  throw new Error('Yandex Games audit failed — see items marked ❌ above.');
}

console.log('\n3/4 Packing yandex-game.zip (index.html at ZIP root)...');
if (fs.existsSync(outZip)) fs.unlinkSync(outZip);

// Use Python's built-in zipfile with maximum DEFLATE compression (portable, zero extra deps)
const pyPack = `
import os, sys, zipfile
dist_dir, out_zip = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out_zip, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, _, filenames in os.walk(dist_dir):
        for fn in sorted(filenames):
            full = os.path.join(root, fn)
            arc = os.path.relpath(full, dist_dir).replace(os.sep, '/')
            zf.write(full, arc)
`;
execFileSync('python3', ['-c', pyPack, distDir, outZip], { stdio: 'inherit' });

console.log('\n4/4 Verifying ZIP root layout...');
const pyVerify = `
import sys, zipfile
with zipfile.ZipFile(sys.argv[1], 'r') as zf:
    names = zf.namelist()
    assert 'index.html' in names, 'index.html not at ZIP root!'
    bad = zf.testzip()
    assert bad is None, f'Corrupt entry: {bad}'
    print(f'Verified {len(names)} entries in ZIP, root index.html OK')
`;
execFileSync('python3', ['-c', pyVerify, outZip], { stdio: 'inherit' });

const zipBytes = fs.statSync(outZip).size;
console.log(
  `\n🎉 Ready! yandex-game.zip = ${(zipBytes / 1024 / 1024).toFixed(2)} MB compressed / ${(
    totalBytes /
    1024 /
    1024
  ).toFixed(2)} MB unpacked.`,
);
