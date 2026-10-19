import { h, mount } from '../dom.js';
import { api } from '../api.js';
import { toast, toastError } from '../toast.js';

const ON_THIS_PC = ['localhost', '127.0.0.1', '[::1]'];

function copy(input) {
  input.select();
  const done = () => toast('已复制', { kind: 'success' });
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(input.value).then(done, () => document.execCommand('copy') && done());
  else if (document.execCommand('copy')) done();
}

/** Calendar subscription card: a read-only .ics link whose token can be rotated or revoked. */
export function feedCard(lanUrls) {
  const box = h('div', { class: 'stack' });
  const bases = ON_THIS_PC.includes(location.hostname) && lanUrls.length ? lanUrls : [location.origin];

  async function change(action, message) {
    try {
      await action();
      toast(message, { kind: 'success' });
      await draw();
    } catch (err) { toastError(err); }
  }

  async function draw() {
    const feed = await api.get('/api/feed');
    if (!feed.enabled) {
      return mount(box,
        h('p', { class: 'small muted' }, '把待办和课表订阅到手机的日历 App，关闭本页面后也能在日历里看到。是否按时弹出提醒取决于日历 App（有的会忽略订阅日历里的提醒），建议先加一条几分钟后的备忘试一试。'),
        h('button', { class: 'btn', type: 'button', onclick: () => change(() => api.post('/api/feed', {}), '已开启订阅') }, '开启日历订阅'));
    }
    mount(box,
      bases.map((base) => {
        const input = h('input', { type: 'text', readOnly: true, value: `${base}/calendar.ics?token=${feed.token}`, 'aria-label': '订阅地址', onfocus: (e) => e.target.select() });
        return h('div', { class: 'row' }, input, h('button', { class: 'btn small', type: 'button', onclick: () => copy(input) }, '复制'));
      }),
      h('p', { class: 'small muted' }, 'iPhone：在系统设置的日历账户里选「添加账户 → 其他 → 添加已订阅的日历」，粘贴上面的地址。安卓的 Google 日历只接受公网地址，可改用支持订阅的日历 App（如 ICSx⁵）。手机要和电脑在同一网络，电脑上的本服务要开着；订阅失败时，先确认手机浏览器能打开这个地址。'),
      h('p', { class: 'small', style: { color: 'var(--warn)' } }, '⚠ 知道这个链接的人能看到你的待办标题，请当密码对待。'),
      h('div', { class: 'row wrap' },
        h('button', { class: 'btn small', type: 'button', onclick: () => confirm('换新链接后，已订阅的设备需要重新订阅。继续？') && change(() => api.post('/api/feed', { rotate: true }), '已更换链接') }, '更换链接'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => confirm('关闭后订阅链接立即失效。继续？') && change(() => api.del('/api/feed'), '已关闭订阅') }, '关闭订阅')));
  }
  draw().catch(toastError);
  return box;
}
