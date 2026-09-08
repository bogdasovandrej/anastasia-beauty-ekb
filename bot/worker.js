/*
 * Бэкенд студии «Море красок» — Cloudflare Worker.
 *
 * Живёт вне России, поэтому достаёт и Telegram, и МАКС. Из Яндекс Облака
 * Telegram недоступен: соединение режется по имени домена в TLS-рукопожатии
 * (по «голому» IP связь есть, по имени — таймаут). Отсюда переезд.
 *
 * Маршруты:
 *   GET  /schedule.json  — график для сайта (публично, с CORS)
 *   POST /tg             — вебхук Telegram
 *   POST /max            — вебхук МАКС
 *   POST /book           — заявка с сайта, уходит в оба мессенджера
 *   GET  /diag           — проверка связи и настроек
 *   GET  /setup          — разовая привязка вебхуков, требует ADMIN_KEY
 *
 * Хранилище: KV-неймспейс SCHEDULE.
 *   schedule  — { off: { "2026-09": [11,12,...] }, updated: "..." }
 *   max_chat  — id чата мастера в МАКСе, запоминается при первом сообщению боту
 *
 * Секреты (задаются в Cloudflare, в коде их нет):
 *   TG_TOKEN, TG_ADMIN_ID, MAX_TOKEN, MAX_ADMIN_ID, ADMIN_KEY
 */

const SITE = 'https://more-krasok.ru';
const MAX_API = 'https://botapi.max.ru';
const PHONE = '+7 950 207-43-02';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MGEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

// ---------- график ----------

async function loadSchedule(env) {
  const raw = await env.SCHEDULE.get('schedule');
  if (!raw) return { off: {}, updated: null };
  try { return JSON.parse(raw); } catch (e) { return { off: {}, updated: null }; }
}

async function saveSchedule(env, sched) {
  sched.updated = new Date().toISOString();
  await env.SCHEDULE.put('schedule', JSON.stringify(sched));
}

function ym(y, m) { return y + '-' + String(m + 1).padStart(2, '0'); }

/* Раскладка месяца: недели по 7 ячеек, понедельник первый.
   Возвращает сетку чисел, где 0 — пустая клетка до начала или после конца месяца. */
function monthGrid(y, m) {
  const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(0);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7) cells.push(0);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}

function monthText(sched, y, m) {
  const key = ym(y, m);
  const off = sched.off[key];
  const head = MONTHS[m] + ' ' + y;
  if (!off) {
    return head + '\n\nМесяц закрыт — на сайте написано, что график ещё не готов.\n' +
      'Нажмите «месяц закрыт», чтобы открыть его, потом отметьте выходные.';
  }
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return head + '\n\nВыходные: ' + (off.length ? off.join(', ') : 'пока нет') +
    '\nРабочих дней: ' + (days - off.length) +
    '\n\nНажмите на число, чтобы переключить его.\nВыходные помечены точками: ·5·';
}

/* Одна раскладка кнопок для обоих мессенджеров: у них разный формат,
   но одинаковая логика, поэтому строим нейтральный массив и переводим ниже. */
function calendarButtons(sched, y, m) {
  const key = ym(y, m);
  const off = new Set(sched.off[key] || []);
  const isOpen = Object.prototype.hasOwnProperty.call(sched.off, key);
  const rows = monthGrid(y, m).map(function (week) {
    return week.map(function (d) {
      if (!d) return { text: ' ', data: 'x' };
      return { text: off.has(d) ? '·' + d + '·' : String(d), data: 'd:' + key + ':' + d };
    });
  });
  const prev = m === 0 ? ym(y - 1, 11) : ym(y, m - 1);
  const next = m === 11 ? ym(y + 1, 0) : ym(y, m + 1);
  rows.push([
    { text: '←', data: 'm:' + prev },
    { text: isOpen ? '✅ месяц открыт' : '⛔ месяц закрыт', data: 'o:' + key },
    { text: '→', data: 'm:' + next },
  ]);
  return rows;
}

/* Общая обработка нажатия. Возвращает короткий ответ для всплывашки
   и координаты месяца, который надо перерисовать. */
async function applyTap(env, sched, data) {
  if (data.startsWith('d:')) {
    const parts = data.split(':');
    const key = parts[1], d = parseInt(parts[2], 10);
    if (!sched.off[key]) return { toast: 'Сначала откройте месяц кнопкой внизу', key: key };
    const set = new Set(sched.off[key]);
    const nowOff = !set.has(d);
    if (nowOff) set.add(d); else set.delete(d);
    sched.off[key] = [...set].sort(function (a, b) { return a - b; });
    await saveSchedule(env, sched);
    const mm = parseInt(key.slice(5), 10) - 1;
    return { toast: d + ' ' + MGEN[mm] + ' — ' + (nowOff ? 'выходной' : 'рабочий день'), key: key };
  }
  if (data.startsWith('o:')) {
    const key = data.slice(2);
    if (sched.off[key]) delete sched.off[key]; else sched.off[key] = [];
    await saveSchedule(env, sched);
    return { toast: sched.off[key] ? 'Месяц открыт — отметьте выходные' : 'Месяц закрыт', key: key };
  }
  if (data.startsWith('m:')) return { toast: '', key: data.slice(2) };
  return { toast: '', key: null };
}

// ---------- Telegram ----------

async function tg(env, method, payload) {
  const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j.ok) console.log('Telegram ' + method + ': ' + j.description);
  return j;
}

function tgKeyboard(rows) {
  return {
    inline_keyboard: rows.map(function (row) {
      return row.map(function (b) { return { text: b.text, callback_data: b.data }; });
    }),
  };
}

async function tgShowMonth(env, chatId, messageId, sched, y, m) {
  const payload = {
    chat_id: chatId,
    text: monthText(sched, y, m),
    reply_markup: tgKeyboard(calendarButtons(sched, y, m)),
  };
  if (messageId) {
    payload.message_id = messageId;
    return tg(env, 'editMessageText', payload);
  }
  return tg(env, 'sendMessage', payload);
}

async function handleTelegram(env, update) {
  const msg = update.message;
  const cb = update.callback_query;
  const from = (msg && msg.from) || (cb && cb.from);
  const chatId = (msg && msg.chat && msg.chat.id) || (cb && cb.message.chat.id);
  if (!from || !chatId) return;

  if (String(from.id) !== String(env.TG_ADMIN_ID)) {
    if (msg) {
      await tg(env, 'sendMessage', {
        chat_id: chatId,
        text: 'Это служебный бот студии «Море красок».\n\nЗаписаться: ' + SITE + '\nПозвонить: ' + PHONE,
      });
    }
    return;
  }

  const sched = await loadSchedule(env);
  const now = new Date();

  if (msg && msg.text) {
    const cmd = msg.text.trim().toLowerCase().split('@')[0];
    if (cmd === '/start' || cmd === '/grafik' || cmd === '/график') {
      await tgShowMonth(env, chatId, null, sched, now.getUTCFullYear(), now.getUTCMonth());
    } else {
      await tg(env, 'sendMessage', {
        chat_id: chatId,
        text: '/grafik — календарь, отметить выходные\n\nЗаявки с сайта приходят сюда сами.',
      });
    }
    return;
  }

  if (cb) {
    const res = await applyTap(env, sched, cb.data || '');
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: res.toast || undefined });
    if (res.key) {
      const y = parseInt(res.key.slice(0, 4), 10), m = parseInt(res.key.slice(5), 10) - 1;
      await tgShowMonth(env, chatId, cb.message.message_id, sched, y, m);
    }
  }
}

// ---------- МАКС ----------

async function maxApi(env, path, payload, query) {
  const url = MAX_API + path + (query ? query : '');
  const opts = {
    method: payload ? 'POST' : 'GET',
    headers: { 'Authorization': env.MAX_TOKEN },
  };
  if (payload) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(payload);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) console.log('MAX ' + path + ' -> ' + r.status + ' ' + text.slice(0, 200));
  try { return JSON.parse(text); } catch (e) { return { raw: text, status: r.status }; }
}

function maxKeyboard(rows) {
  return [{
    type: 'inline_keyboard',
    payload: {
      buttons: rows.map(function (row) {
        return row.map(function (b) { return { type: 'callback', text: b.text, payload: b.data }; });
      }),
    },
  }];
}

async function maxSend(env, chatId, text, rows) {
  const body = { text: text };
  if (rows) body.attachments = maxKeyboard(rows);
  return maxApi(env, '/messages', body, '?chat_id=' + encodeURIComponent(chatId));
}

async function handleMax(env, update) {
  const type = update.update_type || '';

  // сообщение боту
  if (type === 'message_created' && update.message) {
    const m = update.message;
    const chatId = m.recipient && m.recipient.chat_id;
    const userId = m.sender && m.sender.user_id;
    const text = ((m.body && m.body.text) || '').trim().toLowerCase();
    if (!chatId) return;

    // запоминаем чат мастера, чтобы потом слать туда заявки
    if (env.MAX_ADMIN_ID && String(userId) === String(env.MAX_ADMIN_ID)) {
      await env.SCHEDULE.put('max_chat', String(chatId));
    } else if (!(await env.SCHEDULE.get('max_chat'))) {
      // первый, кто написал боту, — сама мастер: бот ещё никому не показан
      await env.SCHEDULE.put('max_chat', String(chatId));
    } else {
      await maxSend(env, chatId, 'Это служебный бот студии «Море красок».\n\nЗаписаться: ' + SITE + '\nПозвонить: ' + PHONE);
      return;
    }

    const sched = await loadSchedule(env);
    const now = new Date();
    if (text === '/start' || text === '/grafik' || text === 'график') {
      const y = now.getUTCFullYear(), mo = now.getUTCMonth();
      await maxSend(env, chatId, monthText(sched, y, mo), calendarButtons(sched, y, mo));
    } else {
      await maxSend(env, chatId, '/grafik — календарь, отметить выходные\n\nЗаявки с сайта приходят сюда сами.');
    }
    return;
  }

  // нажатие кнопки
  if (type === 'message_callback' && update.callback) {
    const cbk = update.callback;
    const chatId = update.message && update.message.recipient && update.message.recipient.chat_id;
    const sched = await loadSchedule(env);
    const res = await applyTap(env, sched, cbk.payload || '');
    if (res.key && chatId) {
      const y = parseInt(res.key.slice(0, 4), 10), mo = parseInt(res.key.slice(5), 10) - 1;
      await maxApi(env, '/answers', {
        message: { text: monthText(sched, y, mo), attachments: maxKeyboard(calendarButtons(sched, y, mo)) },
        notification: res.toast || undefined,
      }, '?callback_id=' + encodeURIComponent(cbk.callback_id));
    }
  }
}

// ---------- заявка с сайта ----------

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max);
}

async function handleBooking(env, body) {
  const name = clean(body.name, 80);
  const phone = clean(body.phone, 30);
  const service = clean(body.service, 80);
  const date = clean(body.date, 20);

  if (!name || !phone) return { ok: false, error: 'Укажите имя и телефон' };
  if (clean(body.website, 50)) return { ok: true };  // ловушка для ботов

  const lines = ['🔔 Новая заявка с сайта', '', '👤 ' + name, '📞 ' + phone];
  if (service) lines.push('💅 ' + service);
  if (date) lines.push('📅 ' + date);
  const text = lines.join('\n');

  // шлём в оба мессенджера; молчание одного не должно ронять заявку
  const jobs = [];
  if (env.TG_TOKEN && env.TG_ADMIN_ID) {
    jobs.push(tg(env, 'sendMessage', { chat_id: env.TG_ADMIN_ID, text: text }).catch(function (e) { console.log('TG: ' + e.message); }));
  }
  if (env.MAX_TOKEN) {
    jobs.push((async function () {
      const chat = await env.SCHEDULE.get('max_chat');
      if (chat) await maxSend(env, chat, text);
    })().catch(function (e) { console.log('MAX: ' + e.message); }));
  }
  await Promise.all(jobs);
  return { ok: true };
}

// ---------- служебное ----------

async function handleDiag(env) {
  async function probe(name, url, opts) {
    const t0 = Date.now();
    try {
      const r = await fetch(url, opts);
      return { что: name, итог: 'ответил ' + r.status, мс: Date.now() - t0 };
    } catch (e) {
      return { что: name, итог: 'ошибка: ' + e.message, мс: Date.now() - t0 };
    }
  }
  const sched = await loadSchedule(env);
  return {
    секреты: {
      TG_TOKEN: !!env.TG_TOKEN, TG_ADMIN_ID: !!env.TG_ADMIN_ID,
      MAX_TOKEN: !!env.MAX_TOKEN, ADMIN_KEY: !!env.ADMIN_KEY,
    },
    kv: { месяцев_в_графике: Object.keys(sched.off).length, обновлён: sched.updated, чат_макса: await env.SCHEDULE.get('max_chat') },
    связь: await Promise.all([
      probe('Telegram getMe', 'https://api.telegram.org/bot' + env.TG_TOKEN + '/getMe'),
      probe('МАКС me', MAX_API + '/me', { headers: { 'Authorization': env.MAX_TOKEN || '' } }),
    ]),
  };
}

/* Разовая привязка вебхуков. Закрыта ключом, чтобы посторонний
   не мог перенаправить бота на свой адрес. */
async function handleSetup(env, url) {
  if (!env.ADMIN_KEY || url.searchParams.get('key') !== env.ADMIN_KEY) {
    return { ok: false, error: 'Нужен правильный ?key=' };
  }
  const base = url.origin;
  const out = {};
  if (env.TG_TOKEN) {
    const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/setWebhook?url=' + encodeURIComponent(base + '/tg'));
    out.telegram = await r.json();
  }
  if (env.MAX_TOKEN) {
    out.max = await maxApi(env, '/subscriptions', {
      url: base + '/max',
      update_types: ['message_created', 'message_callback'],
    });
  }
  return out;
}

// ---------- точка входа ----------

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const cors = {
      'Access-Control-Allow-Origin': SITE,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    const json = function (data, status, extra) {
      return new Response(JSON.stringify(data, null, 1), {
        status: status || 200,
        headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra || {}),
      });
    };

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    try {
      if (path === '/schedule.json') {
        const sched = await loadSchedule(env);
        return json(sched, 200, Object.assign({ 'Cache-Control': 'public, max-age=120' }, cors));
      }

      if (path === '/diag') return json(await handleDiag(env));
      if (path === '/setup') return json(await handleSetup(env, url));

      if (path === '/book' && request.method === 'POST') {
        const body = await request.json().catch(function () { return {}; });
        const res = await handleBooking(env, body);
        return json(res, res.ok ? 200 : 400, cors);
      }

      // вебхуки: всегда отвечаем 200, иначе мессенджер шлёт одно и то же по кругу
      if (path === '/tg' && request.method === 'POST') {
        const body = await request.json().catch(function () { return {}; });
        await handleTelegram(env, body);
        return new Response('ok');
      }
      if (path === '/max' && request.method === 'POST') {
        const body = await request.json().catch(function () { return {}; });
        await handleMax(env, body);
        return new Response('ok');
      }

      return new Response('Море красок', { status: 200 });
    } catch (e) {
      console.log('Ошибка: ' + e.stack);
      if (path === '/book') return json({ ok: false, error: 'Не удалось отправить. Позвоните: ' + PHONE }, 500, cors);
      return new Response('ok');  // мессенджеру всё равно отвечаем успехом
    }
  },
};
