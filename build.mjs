import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(fileURLToPath(import.meta.url));
const publicDir = join(rootDir, 'public');

mkdirSync(publicDir, { recursive: true });
copyFileSync(join(rootDir, 'index.html'), join(publicDir, 'index.html'));
copyFileSync(join(rootDir, 'admin.html'), join(publicDir, 'admin.html'));
copyFileSync(join(rootDir, 'admin-login.html'), join(publicDir, 'admin-login.html'));
mkdirSync(join(publicDir, 'admin'), { recursive: true });
copyFileSync(join(rootDir, 'admin', 'index.html'), join(publicDir, 'admin', 'index.html'));

console.log('Build complete: public assets copied');
