import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const srcDir = join(__dirname, '..', 'node_modules', 'hanzi-writer-data');
const destDir = join(__dirname, '..', 'public', 'hanzi-writer-data');

if (!existsSync(srcDir)) {
  console.error('hanzi-writer-data not found in node_modules. Run pnpm install first.');
  process.exit(1);
}

if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

const files = readdirSync(srcDir).filter((f) => f.endsWith('.json'));
for (const file of files) {
  copyFileSync(join(srcDir, file), join(destDir, file));
}
console.log(`Copied ${files.length} hanzi-writer-data files to public/hanzi-writer-data/`);
