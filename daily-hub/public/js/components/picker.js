// Image picking shared by the task import and the timetable import: file input, drag and drop,
// paste, thumbnails. prepare() runs lazily so thumbnails appear instantly.
import { h } from '../dom.js';
import { api } from '../api.js';
import { prepareImage } from '../image-prep.js';

export const MAX_PIECES = 6; // matches the server's per-request image cap

/** @returns {{ el: HTMLElement, files: () => File[], upload: (setStatus) => Promise<{ ids: string[], stitched: boolean }> }} */
export function createPicker({ label = '选择图片或截图', onChange = () => {} } = {}) {
  let files = [];
  const thumbs = h('div', { class: 'thumbs' });
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, class: 'sr-only', id: `pick-${Math.random().toString(36).slice(2)}` });
  const zone = h('label', { class: 'dropzone', for: input.id },
    h('span', { style: { 'font-size': '2rem' }, 'aria-hidden': 'true' }, '📷'),
    h('strong', {}, label),
    h('span', { class: 'small muted' }, '可多选；也支持拖入或粘贴（Ctrl+V）。很长的截图会自动分段'));

  function refresh() {
    thumbs.replaceChildren(...files.map((file, i) => {
      const url = URL.createObjectURL(file);
      return h('div', { class: 'thumb' },
        h('img', { src: url, alt: `已选图片 ${i + 1}`, onload: () => URL.revokeObjectURL(url) }),
        h('button', { type: 'button', 'aria-label': `移除图片 ${i + 1}`, onclick: () => { files.splice(i, 1); refresh(); } }, '✕'));
    }));
    onChange(files);
  }
  function add(list) {
    const images = [...list].filter((f) => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
    files = [...files, ...images].slice(0, MAX_PIECES);
    refresh();
  }
  input.addEventListener('change', () => { add(input.files); input.value = ''; });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); add(e.dataTransfer.files); });
  const onPaste = (e) => add([...(e.clipboardData?.files ?? [])]);
  document.addEventListener('paste', onPaste);

  return {
    el: h('div', { class: 'stack' }, input, zone, thumbs),
    files: () => files,
    dispose: () => document.removeEventListener('paste', onPaste),
    /** Compresses / slices every file, uploads the pieces and returns their ids. */
    async upload(setStatus, signal) {
      const ids = [];
      let sliced = false;
      for (const [i, file] of files.entries()) {
        setStatus(`正在处理图片 ${i + 1}/${files.length}…`);
        const prepared = await prepareImage(file);
        if (ids.length + prepared.blobs.length > MAX_PIECES) {
          throw new Error(`图片太长或太多，最多支持 ${MAX_PIECES} 段，请分批上传`);
        }
        sliced ||= prepared.sliced;
        for (const blob of prepared.blobs) ids.push((await api.upload(blob, { signal })).id);
      }
      return { ids, stitched: sliced && files.length === 1, singlePiece: ids.length === 1 };
    },
  };
}
