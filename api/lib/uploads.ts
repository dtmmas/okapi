import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

export const uploadsStaticDir = path.join(projectRoot, 'public', 'uploads');
export const menuUploadsDir = path.join(uploadsStaticDir, 'menu');

export function ensureUploadsDirectories() {
  fs.mkdirSync(menuUploadsDir, { recursive: true });
}

export function buildMenuUploadUrl(fileName: string) {
  return `/uploads/menu/${fileName}`;
}
