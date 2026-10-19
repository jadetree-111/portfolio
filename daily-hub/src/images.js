import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './http.js';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ascii = (b, from, to) => b.subarray(from, to).toString('latin1');

// Only raster formats the vision API accepts. SVG is refused: served same-origin it could run script.
const FORMATS = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(PNG) },
  { mime: 'image/webp', ext: 'webp', test: (b) => ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP' },
  { mime: 'image/gif', ext: 'gif', test: (b) => ascii(b, 0, 3) === 'GIF' },
];
const EXT_BY_MIME = Object.fromEntries(FORMATS.map((f) => [f.mime, f.ext]));
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const sniffImage = (buf) => FORMATS.find((f) => f.test(buf)) ?? null;
export const isImageId = (id) => typeof id === 'string' && ID_RE.test(id);

export function createImageStore(db, dataDir) {
  const dir = path.join(dataDir, 'images');
  fs.mkdirSync(dir, { recursive: true });
  const bySha = db.prepare('SELECT id, mime, bytes FROM images WHERE sha256 = ?');
  const byId = db.prepare('SELECT id, mime, bytes FROM images WHERE id = ?');
  const insert = db.prepare('INSERT INTO images(id, sha256, mime, bytes) VALUES (?, ?, ?, ?)');
  const fileFor = (id, mime) => path.join(dir, `${id}.${EXT_BY_MIME[mime]}`);

  return {
    save(buf, maxBytes) {
      if (!buf.length) throw new HttpError(400, '没有收到图片', 'empty_image');
      if (buf.length > maxBytes) throw new HttpError(413, `图片超过 ${Math.round(maxBytes / 1048576)}MB`, 'too_large');
      const format = sniffImage(buf);
      if (!format) throw new HttpError(415, '仅支持 JPG / PNG / WebP / GIF 图片', 'bad_image_type');
      const sha = crypto.createHash('sha256').update(buf).digest('hex');
      const existing = bySha.get(sha);
      if (existing) {
        const file = fileFor(existing.id, existing.mime);
        if (!fs.existsSync(file)) fs.writeFileSync(file, buf); // the row outlived a hand-deleted file
        return { ...existing, duplicate: true };
      }
      const id = crypto.randomUUID();
      fs.writeFileSync(fileFor(id, format.mime), buf);
      insert.run(id, sha, format.mime, buf.length);
      return { id, mime: format.mime, bytes: buf.length, duplicate: false };
    },
    /** Deletes uploads nobody references (a task or course keeps its source image) after olderThanDays. */
    prune(olderThanDays = 1) {
      const rows = db.prepare(`SELECT id, mime FROM images WHERE created_at < datetime('now', ?)
        AND id NOT IN (SELECT source_image FROM tasks WHERE source_image IS NOT NULL
                       UNION SELECT source_image FROM courses WHERE source_image IS NOT NULL)`).all(`-${olderThanDays} days`);
      const del = db.prepare('DELETE FROM images WHERE id = ?');
      for (const row of rows) {
        try { fs.rmSync(fileFor(row.id, row.mime), { force: true }); } catch { /* already gone */ }
        del.run(row.id);
      }
      db.prepare("DELETE FROM ai_calls WHERE ts < ?").run(Date.now() - 60 * 24 * 3600 * 1000);
      return rows.length;
    },
    meta: (id) => (isImageId(id) ? byId.get(id) ?? null : null),
    read(id) {
      const meta = isImageId(id) ? byId.get(id) : null;
      if (!meta) return null;
      try {
        return { ...meta, data: fs.readFileSync(fileFor(id, meta.mime)) };
      } catch {
        return null;
      }
    },
  };
}
