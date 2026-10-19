// Plans how to cut a screenshot into pieces the vision model can read.
// Long chat or notice screenshots are often 1080 x 8000+. Shrinking one of those to fit a single
// image makes the text unreadable, so tall images are cut into evenly sized, overlapping bands.
const OVERLAP = 0.06;

/**
 * @returns {{ scale: number, slices: Array<{ y: number, h: number }> }}
 *   y/h are in source pixels; `scale` is the factor to apply when drawing each slice.
 */
export function planSlices(width, height, { maxEdge = 2400, maxSlices = 6, tallRatio = 2.2 } = {}) {
  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) return { scale: 1, slices: [{ y: 0, h: height }] };
  if (height <= width * tallRatio) return { scale: maxEdge / longEdge, slices: [{ y: 0, h: height }] };

  const baseScale = Math.min(1, maxEdge / width);
  const band = Math.min(Math.round(maxEdge / baseScale), Math.round(width * 1.9));
  const wanted = Math.ceil((height - band * OVERLAP) / (band * (1 - OVERLAP)));
  const count = Math.min(Math.max(2, wanted), maxSlices);
  const overlap = Math.round(band * OVERLAP);
  const size = Math.ceil((height + (count - 1) * overlap) / count);

  const slices = Array.from({ length: count }, (_, i) => {
    const y = i * (size - overlap);
    return { y, h: Math.min(size, height - y) };
  });
  return { scale: Math.min(baseScale, maxEdge / size), slices };
}
