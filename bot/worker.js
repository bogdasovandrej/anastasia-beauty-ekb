/*
 * Бэкенд студии «Море красок» — Cloudflare Worker.
 *
 * Живёт вне России, поэтому достаёт и Telegram, и МАКС. Из Яндекс Облака
 * Telegram недоступен: соединение режется по имени домена в TLS-рукопожатии
 * (по «голому» IP связь есть, по имени — таймаут). Отсюда переезд.
 *
 * Маршруты:
 *   GET  /schedule.json  — график работы для сайта (публично, с CORS)
 *   GET  /slots          — свободные окна под услугу на день
 *   GET  /busy           — занятое время дня: только часы, без имён и телефонов
 *   POST /book           — запись на время; без времени — просьба перезвонить
 *   POST /tg             — вебхук Telegram
 *   POST /max            — вебхук МАКС
 *   GET  /diag           — проверка связи и настроек
 *   GET  /setup          — разовая привязка вебхуков, требует ADMIN_KEY
 *
 * Хранилище: база D1 (привязка DB).
 *   open_months  — месяцы, за которые график опубликован
 *   off_days     — выходные, по строке на день
 *   bookings     — записи клиентов: день, время, услуга, имя, телефон, пометка
 *   notes        — блокнот мастера
 *   settings     — служебное, в том числе чат мастера в МАКСе
 *
 * Персональные данные лежат только в bookings и наружу не отдаются:
 * публичный /busy показывает лишь занятые часы. Имя и телефон видит
 * только мастер в мессенджере.
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

/* Хранилище — D1, а не KV, и это принципиально.
   KV кэширует чтение примерно на минуту: бот читал устаревшую копию графика,
   дописывал в неё день и сохранял обратно, затирая предыдущие нажатия. Мастер
   видел, что календарь не меняется, а часть отметок пропадала. В D1 чтение
   сразу видит запись, поэтому такой потери быть не может. */

async function loadSchedule(env) {
  const open = await env.DB.prepare('SELECT ym FROM open_months').all();
  const days = await env.DB.prepare('SELECT ym, day FROM off_days ORDER BY day').all();
  const off = {};
  for (const r of open.results) off[r.ym] = [];
  for (const r of days.results) {
    if (!off[r.ym]) off[r.ym] = [];
    off[r.ym].push(r.day);
  }
  return { off: off };
}

async function isMonthOpen(env, ym) {
  const r = await env.DB.prepare('SELECT 1 FROM open_months WHERE ym = ?').bind(ym).first();
  return !!r;
}

async function getSetting(env, k) {
  const r = await env.DB.prepare('SELECT v FROM settings WHERE k = ?').bind(k).first();
  return r ? r.v : null;
}

async function setSetting(env, k, v) {
  await env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind(k, String(v)).run();
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

/* Общая обработка нажатия: возвращает текст для всплывашки и месяц,
   который надо перерисовать.

   Каждое нажатие меняет ровно одну строку в базе, без чтения всего графика
   и записи его целиком. Поэтому два быстрых нажатия подряд не могут затереть
   друг друга, даже если придут почти одновременно. */
async function applyTap(env, data) {
  if (data.startsWith('d:')) {
    const parts = data.split(':');
    const ym = parts[1], d = parseInt(parts[2], 10);
    if (!(await isMonthOpen(env, ym))) {
      return { toast: 'Сначала откройте месяц кнопкой внизу', key: ym };
    }
    const has = await env.DB.prepare('SELECT 1 FROM off_days WHERE ym = ? AND day = ?').bind(ym, d).first();
    if (has) {
      await env.DB.prepare('DELETE FROM off_days WHERE ym = ? AND day = ?').bind(ym, d).run();
    } else {
      await env.DB.prepare('INSERT OR IGNORE INTO off_days (ym, day) VALUES (?, ?)').bind(ym, d).run();
    }
    const mm = parseInt(ym.slice(5), 10) - 1;
    return { toast: d + ' ' + MGEN[mm] + ' — ' + (has ? 'рабочий день' : 'выходной'), key: ym };
  }

  if (data.startsWith('o:')) {
    const ym = data.slice(2);
    if (await isMonthOpen(env, ym)) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM open_months WHERE ym = ?').bind(ym),
        env.DB.prepare('DELETE FROM off_days WHERE ym = ?').bind(ym),
      ]);
      return { toast: 'Месяц закрыт', key: ym };
    }
    await env.DB.prepare('INSERT OR IGNORE INTO open_months (ym) VALUES (?)').bind(ym).run();
    return { toast: 'Месяц открыт — отметьте выходные', key: ym };
  }

  if (data.startsWith('m:')) return { toast: '', key: data.slice(2) };
  return { toast: '', key: null };
}

// ---------- запись по времени ----------

/* Длительности услуг в минутах. Это то, на сколько занимается кресло,
   а не «сколько идёт процедура» — на них строится сетка свободных окон.
   Значения взяты из описаний услуг на сайте, мастеру их стоит подтвердить. */
const DURATION = {
  'Маникюр': 120,
  'Педикюр': 90,
  'Окрашивание': 180,
  'Химзавивка': 120,
  'Женская стрижка': 30,
  'Мужская стрижка': 30,
  'Детская стрижка': 30,
  'Брови': 60,
};
const WORK_FROM = 9 * 60;    // 9:00
const WORK_TO = 19 * 60;     // 19:00
const STEP = 30;             // шаг сетки — полчаса
const EKB = 5 * 60;          // Екатеринбург, UTC+5

function hhmm(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

/* Сейчас по Екатеринбургу. Сервер живёт по UTC, поэтому все сравнения
   «уже прошло / ещё нет» делаем через смещение, а не через часовой пояс машины. */
function nowEkb() {
  const t = new Date(Date.now() + EKB * 60000);
  return {
    day: t.toISOString().slice(0, 10),
    min: t.getUTCHours() * 60 + t.getUTCMinutes(),
  };
}

async function isWorkingDay(env, day) {
  const ym = day.slice(0, 7);
  if (!(await isMonthOpen(env, ym))) return false;
  const d = parseInt(day.slice(8), 10);
  const off = await env.DB.prepare('SELECT 1 FROM off_days WHERE ym = ? AND day = ?').bind(ym, d).first();
  return !off;
}

async function busyOn(env, day) {
  const r = await env.DB.prepare(
    "SELECT start_min, end_min FROM bookings WHERE day = ? AND status != 'cancelled' ORDER BY start_min"
  ).bind(day).all();
  return r.results;
}

/* Свободные окна под конкретную услугу: перебираем сетку с шагом в полчаса
   и оставляем те начала, где услуга целиком помещается до конца рабочего дня
   и не задевает уже занятое время. */
async function freeSlots(env, day, service) {
  const dur = DURATION[service];
  if (!dur) return { error: 'Неизвестная услуга' };
  if (!(await isWorkingDay(env, day))) return { slots: [], reason: 'выходной' };

  const busy = await busyOn(env, day);
  const now = nowEkb();
  const slots = [];

  for (let s = WORK_FROM; s + dur <= WORK_TO; s += STEP) {
    if (day < now.day) break;
    // на сегодня не предлагаем то, что уже началось, и оставляем час на сборы
    if (day === now.day && s < now.min + 60) continue;
    const clash = busy.some(function (b) { return s < b.end_min && b.start_min < s + dur; });
    if (!clash) slots.push({ start: hhmm(s), end: hhmm(s + dur), min: s });
  }
  return { slots: slots, duration: dur };
}

function cleanField(v, max) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max);
}

/* Бронирование. Проверку на занятость делаем ещё раз прямо перед записью:
   между тем, как клиент увидел окно и нажал кнопку, его мог занять другой. */
async function createBooking(env, body) {
  const name = cleanField(body.name, 80);
  const phone = cleanField(body.phone, 30);
  const service = cleanField(body.service, 80);
  const day = cleanField(body.day, 10);
  const start = parseInt(body.start, 10);

  if (cleanField(body.website, 50)) return { ok: true };  // ловушка для ботов
  if (!name || !phone) return { ok: false, error: 'Укажите имя и телефон' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { ok: false, error: 'Выберите день' };
  const dur = DURATION[service];
  if (!dur) return { ok: false, error: 'Выберите услугу' };
  if (!(start >= WORK_FROM && start + dur <= WORK_TO)) return { ok: false, error: 'Выберите время' };
  if (!(await isWorkingDay(env, day))) return { ok: false, error: 'В этот день мастер не работает' };

  const now = nowEkb();
  if (day < now.day || (day === now.day && start < now.min)) {
    return { ok: false, error: 'Это время уже прошло' };
  }

  const busy = await busyOn(env, day);
  if (busy.some(function (b) { return start < b.end_min && b.start_min < start + dur; })) {
    return { ok: false, error: 'Это время только что заняли. Выберите другое, пожалуйста' };
  }

  const res = await env.DB.prepare(
    'INSERT INTO bookings (day, start_min, end_min, service, name, phone, status, created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(day, start, start + dur, service, name, phone, 'new', new Date().toISOString()).run();

  const id = res.meta.last_row_id;
  await notifyMaster(env, {
    id: id, day: day, start: start, end: start + dur, service: service, name: name, phone: phone,
  });
  return { ok: true, id: id, start: hhmm(start), end: hhmm(start + dur) };
}

function bookingText(b) {
  const p = b.day.split('-');
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return '🔔 Новая запись\n\n' +
    '📅 ' + (+p[2]) + ' ' + MGEN[+p[1] - 1] + ', ' + WDAYS[d.getUTCDay()] + '\n' +
    '🕐 ' + hhmm(b.start) + ' — ' + hhmm(b.end) + '\n' +
    '💅 ' + b.service + '\n\n' +
    '👤 ' + b.name + '\n' +
    '📞 ' + b.phone;
}

const WDAYS = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];

async function notifyMaster(env, b) {
  const text = bookingText(b);
  const jobs = [];
  if (env.TG_TOKEN && env.TG_ADMIN_ID) {
    jobs.push(tg(env, 'sendMessage', {
      chat_id: env.TG_ADMIN_ID,
      text: text + '\n\n💬 Ответьте на это сообщение, чтобы добавить фамилию или пометку',
      reply_markup: { inline_keyboard: [[{ text: '✖ Отменить запись', callback_data: 'c:' + b.id }]] },
    }).then(function (r) {
      // запоминаем номер сообщения: по ответу на него найдём эту запись
      if (r && r.ok && r.result) {
        return env.DB.prepare('UPDATE bookings SET tg_msg_id = ? WHERE id = ?')
          .bind(r.result.message_id, b.id).run();
      }
    }).catch(function (e) { console.log('TG: ' + e.message); }));
  }
  if (env.MAX_TOKEN) {
    jobs.push((async function () {
      const chat = await getSetting(env, 'max_chat');
      if (chat) {
        await maxSend(env, chat, text, [[{ text: '✖ Отменить запись', data: 'c:' + b.id }]]);
      }
    })().catch(function (e) { console.log('MAX: ' + e.message); }));
  }
  await Promise.all(jobs);
}

/* Список записей на ближайшие дни — для команды /zapisi в боте. */
async function upcomingText(env) {
  const now = nowEkb();
  const r = await env.DB.prepare(
    "SELECT id, day, start_min, end_min, service, name, phone, note FROM bookings " +
    "WHERE day >= ? AND status != 'cancelled' ORDER BY day, start_min LIMIT 20"
  ).bind(now.day).all();
  if (!r.results.length) return 'Записей пока нет.';
  let out = 'Ближайшие записи:\n';
  let lastDay = '';
  for (const b of r.results) {
    if (b.day !== lastDay) {
      const p = b.day.split('-');
      const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      out += '\n📅 ' + (+p[2]) + ' ' + MGEN[+p[1] - 1] + ', ' + WDAYS[d.getUTCDay()] + '\n';
      lastDay = b.day;
    }
    out += '  ' + hhmm(b.start_min) + '–' + hhmm(b.end_min) + '  ' + b.service +
      '\n     ' + b.name + ', ' + b.phone + '\n';
    if (b.note) out += '     💬 ' + b.note.replace(/\n/g, '\n        ') + '\n';
  }
  return out;
}

/* ---- Заметки ----
   Сайт спрашивает у клиента только имя, а мастеру нужна фамилия и мелочи
   вроде «гель красный». Поэтому любой обычный текст, отправленный боту,
   сохраняется: ответом на уведомление о записи — прямо к этой записи,
   просто так — в общий блокнот. Никаких команд запоминать не нужно. */

async function addNoteToBooking(env, id, text) {
  const b = await env.DB.prepare('SELECT note FROM bookings WHERE id = ?').bind(id).first();
  if (!b) return null;
  const note = (b.note ? b.note + '\n' : '') + text;
  await env.DB.prepare('UPDATE bookings SET note = ? WHERE id = ?').bind(note, id).run();
  return note;
}

async function addFreeNote(env, text) {
  await env.DB.prepare('INSERT INTO notes (text, created_at) VALUES (?, ?)')
    .bind(text, new Date().toISOString()).run();
}

async function notesText(env) {
  const r = await env.DB.prepare('SELECT text, created_at FROM notes ORDER BY id DESC LIMIT 30').all();
  if (!r.results.length) {
    return 'Блокнот пуст.\n\nПросто напишите боту любой текст — он сохранится сюда.\n' +
      'А если ответить на сообщение о записи, заметка прицепится к ней.';
  }
  let out = '📓 Блокнот:\n';
  for (const n of r.results) {
    const d = new Date(new Date(n.created_at).getTime() + EKB * 60000);
    out += '\n' + String(d.getUTCDate()).padStart(2, '0') + '.' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + ' — ' + n.text;
  }
  return out;
}

/* По какой записи пришёл ответ. Telegram сообщает, на какое сообщение
   отвечают, а мы при отправке уведомления запомнили его номер. */
async function bookingByTgMessage(env, msgId) {
  if (!msgId) return null;
  return env.DB.prepare('SELECT id FROM bookings WHERE tg_msg_id = ?').bind(msgId).first();
}

async function cancelBooking(env, id) {
  const b = await env.DB.prepare('SELECT * FROM bookings WHERE id = ?').bind(id).first();
  if (!b) return 'Запись не найдена';
  await env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(id).run();
  return 'Запись отменена, время снова свободно.\nПозвоните клиенту: ' + b.phone;
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
    } else if (cmd === '/zapisi' || cmd === '/записи') {
      await tg(env, 'sendMessage', { chat_id: chatId, text: await upcomingText(env) });
    } else if (cmd === '/zametki' || cmd === '/заметки') {
      await tg(env, 'sendMessage', { chat_id: chatId, text: await notesText(env) });
    } else if (cmd.startsWith('/')) {
      await tg(env, 'sendMessage', {
        chat_id: chatId,
        text: '/grafik — календарь, отметить выходные\n' +
          '/zapisi — ближайшие записи\n' +
          '/zametki — блокнот\n\n' +
          'Новые записи с сайта приходят сюда сами.\n' +
          'Любой текст без команды сохраняется в блокнот, а ответ на запись — прямо к ней.',
      });
    } else {
      // обычный текст — это заметка
      const reply = msg.reply_to_message && msg.reply_to_message.message_id;
      const b = await bookingByTgMessage(env, reply);
      if (b) {
        const note = await addNoteToBooking(env, b.id, msg.text.trim());
        await tg(env, 'sendMessage', { chat_id: chatId, text: '✅ Записал к этой записи:\n' + note });
      } else {
        await addFreeNote(env, msg.text.trim());
        await tg(env, 'sendMessage', { chat_id: chatId, text: '✅ Записал в блокнот. Посмотреть — /zametki' });
      }
    }
    return;
  }

  if (cb) {
    // отмена записи — отдельная ветка, месяц перерисовывать не нужно
    if ((cb.data || '').startsWith('c:')) {
      const msg2 = await cancelBooking(env, parseInt(cb.data.slice(2), 10));
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: 'Отменено' });
      await tg(env, 'sendMessage', { chat_id: chatId, text: msg2 });
      return;
    }
    const res = await applyTap(env, cb.data || '');
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: res.toast || undefined });
    if (res.key) {
      // перечитываем график после правки, чтобы показать сохранённое, а не ожидаемое
      const fresh = await loadSchedule(env);
      const y = parseInt(res.key.slice(0, 4), 10), m = parseInt(res.key.slice(5), 10) - 1;
      await tgShowMonth(env, chatId, cb.message.message_id, fresh, y, m);
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

    /* Кто здесь мастер. В МАКСе нет постоянного идентификатора чата, который
       можно прописать заранее, поэтому первого написавшего запоминаем как мастера.
       Дальше сверяемся именно с запомненным чатом: в первой версии этой сверки
       не было, и со второго сообщения мастер становился «посторонним». */
    const known = await getSetting(env, 'max_chat');
    const byId = env.MAX_ADMIN_ID && String(userId) === String(env.MAX_ADMIN_ID);
    if (!known) {
      await setSetting(env, 'max_chat', chatId);
    } else if (!byId && String(known) !== String(chatId)) {
      await maxSend(env, chatId, 'Это служебный бот студии «Море красок».\n\nЗаписаться: ' + SITE + '\nПозвонить: ' + PHONE);
      return;
    }

    const sched = await loadSchedule(env);
    const now = new Date();
    if (text === '/start' || text === '/grafik' || text === 'график') {
      const y = now.getUTCFullYear(), mo = now.getUTCMonth();
      await maxSend(env, chatId, monthText(sched, y, mo), calendarButtons(sched, y, mo));
    } else if (text === '/zapisi' || text === 'записи') {
      await maxSend(env, chatId, await upcomingText(env));
    } else if (text === '/zametki' || text === 'заметки') {
      await maxSend(env, chatId, await notesText(env));
    } else if (text.startsWith('/')) {
      await maxSend(env, chatId,
        '/grafik — календарь, отметить выходные\n' +
        '/zapisi — ближайшие записи\n' +
        '/zametki — блокнот\n\n' +
        'Новые записи с сайта приходят сюда сами.\n' +
        'Любой текст без команды сохраняется в блокнот.');
    } else {
      // в МАКСе ответ на конкретное сообщение не отслеживаем — пишем в общий блокнот
      await addFreeNote(env, ((m.body && m.body.text) || '').trim());
      await maxSend(env, chatId, '✅ Записал в блокнот. Посмотреть — /zametki');
    }
    return;
  }

  // нажатие кнопки
  if (type === 'message_callback' && update.callback) {
    const cbk = update.callback;
    const chatId = update.message && update.message.recipient && update.message.recipient.chat_id;
    const data = cbk.payload || '';
    if (data.startsWith('c:')) {
      const msg2 = await cancelBooking(env, parseInt(data.slice(2), 10));
      await maxApi(env, '/answers', { message: { text: msg2 }, notification: 'Отменено' },
        '?callback_id=' + encodeURIComponent(cbk.callback_id));
      return;
    }
    const res = await applyTap(env, data);
    if (res.key) {
      const fresh = await loadSchedule(env);
      const y = parseInt(res.key.slice(0, 4), 10), mo = parseInt(res.key.slice(5), 10) - 1;
      await maxApi(env, '/answers', {
        message: { text: monthText(fresh, y, mo), attachments: maxKeyboard(calendarButtons(fresh, y, mo)) },
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
      const chat = await getSetting(env, 'max_chat');
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
    база: { месяцев_в_графике: Object.keys(sched.off).length, выходных_всего: Object.values(sched.off).reduce(function(a,b){return a+b.length},0), чат_макса: await getSetting(env, 'max_chat') },
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

    /* Кому разрешено обращаться из браузера: боевой сайт и локальная копия
       для проверок. Чужому сайту заявку через браузер посетителя не отправить. */
    const origin = request.headers.get('Origin') || '';
    const allowed = origin === SITE || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : SITE,
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Vary': 'Origin',
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

      // свободные окна под услугу на конкретный день
      if (path === '/slots') {
        const day = url.searchParams.get('day') || '';
        const service = url.searchParams.get('service') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'Нужен день' }, 400, cors);
        return json(await freeSlots(env, day, service), 200, cors);
      }

      // занятое время — только часы, без имён и телефонов
      if (path === '/busy') {
        const day = url.searchParams.get('day') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'Нужен день' }, 400, cors);
        const busy = await busyOn(env, day);
        return json({ busy: busy.map(function (b) { return { start: hhmm(b.start_min), end: hhmm(b.end_min) }; }) }, 200, cors);
      }

      if (path === '/book' && request.method === 'POST') {
        const body = await request.json().catch(function () { return {}; });
        // с выбранным временем — бронь; без него — просто просьба перезвонить
        const res = (body.day && body.start != null)
          ? await createBooking(env, body)
          : await handleBooking(env, body);
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
