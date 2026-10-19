// Prepares a picked photo or screenshot for upload: fixes rotation, shrinks it under the
// API size limit, and cuts very tall screenshots into overlapping bands (see shared/image-plan.js).
import { planSlices } from '/shared/image-plan.js';

const MAX_BYTES = 4.5 * 1024 * 1024;
const toBlob = (canvas, quality) => new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/** <img> decoding: the last resort for browsers whose createImageBitmap is missing or picky. */
async function decodeWithImg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function decode(file) {
  // Newer browsers apply the camera's rotation flag while decoding; older ones reject the option.
  const attempts = [
    () => createImageBitmap(file, { imageOrientation: 'from-image' }),
    () => createImageBitmap(file),
    () => decodeWithImg(file),
  ];
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch { /* try the next decoder */ }
  }
  throw new Error(`「${file.name || '图片'}」无法读取，可能是不支持的格式，请换成截图或 JPG/PNG`);
}

async function encode(bitmap, slice, scale) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(slice.h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; // JPEG has no alpha channel
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, slice.y, bitmap.width, slice.h, 0, 0, canvas.width, canvas.height);
  for (let quality = 0.92; quality >= 0.5; quality -= 0.14) {
    const blob = await toBlob(canvas, quality);
    if (blob && blob.size <= MAX_BYTES) return blob;
  }
  throw new Error('图片压缩后仍然太大，请裁剪后再试');
}

/** @returns {Promise<{ blobs: Blob[], sliced: boolean, name: string }>} */
export async function prepareImage(file) {
  const bitmap = await decode(file);
  try {
    const { scale, slices } = planSlices(bitmap.width, bitmap.height);
    // Screenshots that already fit go up untouched: re-encoding as JPEG would blur small text.
    // JPEG photos are always redrawn, which also applies the camera's rotation flag.
    if (slices.length === 1 && scale === 1 && file.size <= MAX_BYTES && /^image\/(png|webp)$/.test(file.type)) {
      return { blobs: [file], sliced: false, name: file.name || '截图' };
    }
    const blobs = [];
    for (const slice of slices) blobs.push(await encode(bitmap, slice, scale));
    return { blobs, sliced: slices.length > 1, name: file.name || '截图' };
  } finally {
    bitmap.close?.();
  }
}
