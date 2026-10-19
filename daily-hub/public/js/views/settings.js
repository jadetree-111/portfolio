import { h, mount } from '../dom.js';
import { api } from '../api.js';
import { state, saveSettings } from '../store.js';
import { toast, toastError } from '../toast.js';
import { REMIND_OPTIONS } from '../format.js';
import { notificationState, enableNotifications } from '../reminders.js';
import { periodsEditor } from '../components/periods-editor.js';
import { feedCard } from '../components/feed-card.js';
import { DEFAULT_PERIODS } from '/shared/schedule.js';

export const title = '设置';

const field = (label, control, hint) => h('label', { class: 'field' }, label, control, hint && h('span', { class: 'small muted' }, hint));
const card = (heading, ...children) => h('section', { class: 'card stack' }, h('h2', {}, heading), ...children);

async function save(patch) {
  try {
    await saveSettings(patch);
    toast('已保存', { kind: 'success' });
  } catch (err) { toastError(err); }
}

function calendarCard() {
  const s = state.settings;
  return card('学期与日历',
    field('开学第一天', h('input', { type: 'date', value: s.semester_start, onchange: (e) => save({ semester_start: e.target.value }) }),
      '用于计算「第几周」以及课表的单双周；选开学当周内的任意一天即可'),
    field('每周从哪天开始', h('select', { value: String(s.week_start), onchange: (e) => save({ week_start: Number(e.target.value) }) },
      h('option', { value: '1' }, '周一'), h('option', { value: '7' }, '周日'))),
    h('label', { class: 'row' }, h('input', { type: 'checkbox', checked: s.show_lunar, onchange: (e) => save({ show_lunar: e.target.checked }) }, ), '日历显示农历、节气和节日'));
}

function reminderCard() {
  const s = state.settings;
  const perm = notificationState();
  const note = !window.isSecureContext
    ? '当前是 http 地址，浏览器不允许系统通知。页面打开时仍会弹出提醒横幅；关闭页面后想继续提醒，可以用下面的日历订阅（效果取决于日历 App）。'
    : perm === 'granted' ? '系统通知已开启' : perm === 'denied' ? '通知被浏览器拦截，请在浏览器的网站设置里允许' : perm === 'unsupported' ? '这个浏览器不支持系统通知' : '';
  return card('提醒',
    field('有具体时间的备忘，默认提醒', h('select', { value: s.remind_default_min == null ? '' : String(s.remind_default_min), onchange: (e) => save({ remind_default_min: e.target.value === '' ? null : Number(e.target.value) }) },
      REMIND_OPTIONS.map(([v, l]) => h('option', { value: v ?? '' }, l)))),
    note && h('p', { class: 'small muted' }, note),
    window.isSecureContext && perm === 'default' && h('button', { class: 'btn', type: 'button', onclick: async (e) => { await enableNotifications(); e.target.replaceWith(h('span', { class: 'small muted' }, '已处理，刷新页面查看状态')); } }, '开启系统通知'),
    h('h3', {}, '日历订阅（关闭页面也能提醒）'),
    feedCard(state.lan ?? []));
}

function timetableCard() {
  return card('课程节次时间', h('p', { class: 'small muted' }, '识别课表时若图上带有节次时间表，会自动填入这里。'),
    periodsEditor(state.settings.periods?.length ? state.settings.periods : DEFAULT_PERIODS, (periods) => save({ periods })));
}

function phoneCard(info) {
  return card('用手机访问',
    info.lan.length
      ? h('div', { class: 'stack' }, info.lan.map((u) => h('code', {}, u)),
        h('p', { class: 'small muted' }, '手机和电脑连同一个 Wi-Fi，在手机浏览器打开上面的地址，输入登录口令即可。浏览器菜单里选「添加到主屏幕」，就能像 App 一样使用。若打不开，请检查 Windows 防火墙是否放行了 Node.js。'))
      : h('p', { class: 'small muted' }, '服务当前只监听本机。要让手机访问，请在 .env 里设置 HOST=0.0.0.0 后重启。'));
}

function aiCard(ai) {
  return card('AI 识别',
    ai.configured
      ? h('p', { class: 'small' }, `已配置 · 模型 ${ai.model} · 本小时还可识别 ${ai.remaining} 次`)
      : h('p', { class: 'small' }, '未配置。在 .env 填写 ANTHROPIC_API_KEY（或 ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN）并重启后启用。'));
}

export async function render(container, ctx) {
  const [info, ai] = await Promise.all([api.get('/api/info', { signal: ctx.signal }), api.get('/api/ai/status', { signal: ctx.signal })]);
  state.lan = info.lan;
  mount(container, h('div', { class: 'stack' },
    calendarCard(), reminderCard(), timetableCard(),
    card('城市', h('p', { class: 'small' }, `当前：${state.settings.city.name}`), h('a', { class: 'btn', href: '#/weather' }, '去天气页更换')),
    phoneCard(info), aiCard(ai),
    card('账号', h('button', { class: 'btn danger', type: 'button', onclick: async () => { await api.post('/api/logout').catch(() => {}); location.reload(); } }, '退出登录'))));
}
