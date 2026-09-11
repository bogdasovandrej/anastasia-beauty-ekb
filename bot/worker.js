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
 *   POST /tg             — вебхук Telegram, бот мастера
 *   POST /tgc            — вебхук Telegram, бот для клиентов
 *   GET  /planer         — планер дня для мастера, по отдельному ключу
 *   POST /max            — вебхук МАКС
 *   GET  /calendar.ics   — подписка на календарь телефона, по отдельному ключу
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
 *   TG_TOKEN, TG_ADMIN_ID, TG_CLIENT_TOKEN, MAX_TOKEN, MAX_ADMIN_ID, ADMIN_KEY
 */

const SITE = 'https://more-krasok.ru';
const SELF_URL = 'https://mk-bot.more-krasok-bot.workers.dev';
const MAX_API = 'https://botapi.max.ru';
const PHONE = '+7 950 207-43-02';
const NL = String.fromCharCode(10); // перенос строки, устойчивый к правкам файла

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];
const MGEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

// ---------- график ----------

/* Хранилище — D1, а не KV, и это принципиально.
KV кэширует чтение примерно на минуту: бот читал устаревшую копию графика,
дописывал в неё день и сохранял обратно, затирая предыдущие нажатия. Мастер
видел, что календарь не меняется, а часть отметок пропадала. В D1 чтение
сразу видит запись, поэтому такой потери быть не может. */

async function loadSchedule(env) {
  /* Оба запроса одной посылкой: раздельно это два обращения к базе и вдвое
     больше задержки. В МАКСе из-за неё кнопки не успевали ответить вовремя. */
  const [open, days] = await env.DB.batch([
    env.DB.prepare('SELECT ym FROM open_months'),
    env.DB.prepare('SELECT ym, day FROM off_days ORDER BY day'),
  ]);
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
  await env.DB.prepare(
    'INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v',
  )
    .bind(k, String(v))
    .run();
}

function ym(y, m) {
  return y + '-' + String(m + 1).padStart(2, '0');
}

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
    return (
      head +
      '\n\nМесяц закрыт — на сайте написано, что график ещё не готов.\n' +
      'Нажмите «месяц закрыт», чтобы открыть его, потом отметьте выходные.'
    );
  }
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return (
    head +
    '\n\nВыходные: ' +
    (off.length ? off.join(', ') : 'пока нет') +
    '\nРабочих дней: ' +
    (days - off.length) +
    '\n\nНажмите на число, чтобы переключить его.\nВыходные помечены точками: ·5·'
  );
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
    const ym = parts[1],
      d = parseInt(parts[2], 10);
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

// ---------- персональные данные: хранятся в России ----------

/* Имя, телефон и пометки лежат не здесь, а в закрытом бакете Яндекса.
   Закон требует, чтобы база с персональными данными россиян физически
   находилась в России, а Cloudflare — это не Россия. Тут остаются только
   день, время и услуга: по ним человека не опознать.

   Обращение идёт через российский шлюз и закрыто общим секретом PD_KEY.
   Если хранилище недоступно, запись всё равно состоится — время займётся,
   мастер получит уведомление, просто без имени. Терять запись из-за
   недоступности хранилища хуже, чем показать «имя не загрузилось». */

let pdLastError = null; // последняя ошибка обращения к хранилищу — для диагностики
const PD_URL = 'https://d5dlpkp30bicbqp0edul.7qsg961h.apigw.yandexcloud.net/pd/';

async function pdCall(env, action, body) {
  if (!env.PD_KEY) return null;
  try {
    const r = await fetch(PD_URL + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Pd-Key': env.PD_KEY },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      // текст ответа сохраняем: по нему видно, отказ это по ключу или ошибка бакета
      const text = (await r.text()).slice(0, 200);
      console.log('pd/' + action + ': HTTP ' + r.status + ' ' + text);
      pdLastError = 'HTTP ' + r.status + ': ' + text;
      return null;
    }
    pdLastError = null;
    return await r.json();
  } catch (e) {
    console.log('pd/' + action + ': ' + e.message);
    pdLastError = e.message;
    return null;
  }
}

async function pdSave(env, id, name, phone, note) {
  await pdCall(env, 'put', { id: id, name: name, phone: phone, note: note || '' });
}

async function pdLoad(env, id) {
  const r = await pdCall(env, 'get', { id: id });
  return (r && r.data) || null;
}

/* Имена сразу для нескольких записей — планеру и списку нужен весь день,
   а не по одной записи за раз. */
async function pdLoadMany(env, ids) {
  if (!ids.length) return {};
  const r = await pdCall(env, 'many', { ids: ids });
  return (r && r.data) || {};
}

async function pdDelete(env, id) {
  await pdCall(env, 'del', { id: id });
}

/* Подставить имя и телефон в список записей, пришедший из базы.
   Если хранилище не ответило — ставим понятную заглушку, а не пустоту. */
async function withPersonal(env, rows) {
  const ids = rows.map(function (r) {
    return r.id;
  });
  const pd = await pdLoadMany(env, ids);
  return rows.map(function (r) {
    const p = pd[r.id];
    return Object.assign({}, r, {
      name: (p && p.name) || 'имя не загрузилось',
      phone: (p && p.phone) || '',
      note: (p && p.note) || '',
    });
  });
}

// ---------- запись по времени ----------

/* Длительности услуг в минутах. Это то, на сколько занимается кресло,
а не «сколько идёт процедура» — на них строится сетка свободных окон.
Значения взяты из описаний услуг на сайте, мастеру их стоит подтвердить. */
const DURATION = {
  Маникюр: 120,
  Педикюр: 120,
  Окрашивание: 120,
  Химзавивка: 120,
  'Женская стрижка': 30,
  'Мужская стрижка': 30,
  'Детская стрижка': 30,
  Брови: 30,
};
const WORK_FROM = 8 * 60; // 8:00 — по просьбе мастера, раньше было 9:00
const WORK_TO = 19 * 60; // 19:00
const STEP = 30; // шаг сетки — полчаса
const EKB = 5 * 60; // Екатеринбург, UTC+5

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
    "SELECT start_min, end_min FROM bookings WHERE day = ? AND status != 'cancelled' ORDER BY start_min",
  )
    .bind(day)
    .all();
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
    const clash = busy.some(function (b) {
      return s < b.end_min && b.start_min < s + dur;
    });
    if (!clash) slots.push({ start: hhmm(s), end: hhmm(s + dur), min: s });
  }
  return { slots: slots, duration: dur };
}

function cleanField(v, max) {
  return String(v == null ? '' : v)
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

/* Бронирование. Проверку на занятость делаем ещё раз прямо перед записью:
между тем, как клиент увидел окно и нажал кнопку, его мог занять другой. */
async function createBooking(env, body) {
  const name = cleanField(body.name, 80);
  const phone = cleanField(body.phone, 30);
  const service = cleanField(body.service, 80);
  const day = cleanField(body.day, 10);
  const start = parseInt(body.start, 10);

  if (cleanField(body.website, 50)) return { ok: true }; // ловушка для ботов
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
  if (
    busy.some(function (b) {
      return start < b.end_min && b.start_min < start + dur;
    })
  ) {
    return { ok: false, error: 'Это время только что заняли. Выберите другое, пожалуйста' };
  }

  const res = await env.DB.prepare(
    /* Имя и телефон сюда больше не пишутся — они уходят в российское
       хранилище сразу после того, как станет известен номер записи. */
    'INSERT INTO bookings (day, start_min, end_min, service, status, created_at, client_chat, client_kind) ' +
      'VALUES (?,?,?,?,?,?,?,?)',
  )
    .bind(
      day,
      start,
      start + dur,
      service,
      'new',
      new Date().toISOString(),
      body.clientChat ? String(body.clientChat) : null,
      body.clientKind || null,
    )
    .run();

  const id = res.meta.last_row_id;
  // имя и телефон — в российское хранилище, отдельным обращением
  await pdSave(env, id, name, phone, '');
  // если запись завела сама мастер — уведомлять её о ней же незачем
  if (!body.silent) {
    await notifyMaster(env, {
      id: id,
      day: day,
      start: start,
      end: start + dur,
      service: service,
      name: name,
      phone: phone,
    });
  }
  return { ok: true, id: id, start: hhmm(start), end: hhmm(start + dur) };
}

function bookingText(b) {
  const p = b.day.split('-');
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return (
    '🔔 Новая запись\n\n' +
    '📅 ' +
    +p[2] +
    ' ' +
    MGEN[+p[1] - 1] +
    ', ' +
    WDAYS[d.getUTCDay()] +
    '\n' +
    '🕐 ' +
    hhmm(b.start) +
    ' — ' +
    hhmm(b.end) +
    '\n' +
    '💅 ' +
    b.service +
    '\n\n' +
    '👤 ' +
    b.name +
    '\n' +
    '📞 ' +
    b.phone
  );
}

const WDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

/* Файл-приглашение прямо в чат.
   Подписка на календарь по ссылке — теория: Google обновляет такие календари
   по своему расписанию, иногда сутками, и на телефоне ничего не появляется.
   Файл .ics работает мгновенно и в любом календаре, включая встроенный
   самсунговский: мастер нажимает на него и подтверждает добавление. */
function icsForBooking(b) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//more-krasok//RU',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:booking-' + b.id + '@more-krasok.ru',
    'DTSTAMP:' + stamp,
    'DTSTART:' + icsTime(b.day, b.start),
    'DTEND:' + icsTime(b.day, b.end),
    'SUMMARY:' + icsEscape(b.service + ' — ' + b.name),
    'DESCRIPTION:' + icsEscape(b.phone),
    'LOCATION:' + icsEscape('ул. Донбасская, 4, Екатеринбург'),
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    'DESCRIPTION:' + icsEscape('Через час: ' + b.name),
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

async function sendIcsToMaster(env, b) {
  if (!env.TG_TOKEN || !env.TG_ADMIN_ID) return;
  const form = new FormData();
  form.append('chat_id', String(env.TG_ADMIN_ID));
  form.append('caption', '📅 Нажмите, чтобы добавить в календарь телефона');
  form.append(
    'document',
    new Blob([icsForBooking(b)], { type: 'text/calendar' }),
    'zapis-' + b.day + '-' + hhmm(b.start).replace(':', '') + '.ics',
  );
  const r = await fetch('https://api.telegram.org/bot' + env.TG_TOKEN + '/sendDocument', {
    method: 'POST',
    body: form,
  });
  if (!r.ok) console.log('ics: ' + (await r.text()).slice(0, 200));
}

async function notifyMaster(env, b) {
  const text = bookingText(b);
  const jobs = [];
  if (env.TG_TOKEN && env.TG_ADMIN_ID) {
    jobs.push(
      tg(env, 'sendMessage', {
        chat_id: env.TG_ADMIN_ID,
        text: text + '\n\n💬 Ответьте на это сообщение, чтобы добавить фамилию или пометку',
        reply_markup: { inline_keyboard: [[{ text: '✖ Отменить запись', callback_data: 'c:' + b.id }]] },
      })
        .then(function (r) {
          // запоминаем номер сообщения: по ответу на него найдём эту запись
          if (r && r.ok && r.result) {
            return env.DB.prepare('UPDATE bookings SET tg_msg_id = ? WHERE id = ?')
              .bind(r.result.message_id, b.id)
              .run();
          }
        })
        .catch(function (e) {
          console.log('TG: ' + e.message);
        }),
    );
  }
  if (env.MAX_TOKEN) {
    jobs.push(
      (async function () {
        const chat = await getSetting(env, 'max_chat');
        if (chat) {
          await maxSend(env, chat, text, [[{ text: '✖ Отменить запись', data: 'c:' + b.id }]]);
        }
      })().catch(function (e) {
        console.log('MAX: ' + e.message);
      }),
    );
  }
  await Promise.all(jobs);
  // файл для календаря — отдельным сообщением, чтобы не мешал кнопке отмены
  await sendIcsToMaster(env, b).catch(function (e) {
    console.log('ics: ' + e.message);
  });
}

/* Список записей на ближайшие дни — для команды /zapisi в боте. */
async function upcomingText(env) {
  const now = nowEkb();
  const r = await env.DB.prepare(
    'SELECT id, day, start_min, end_min, service FROM bookings ' +
      "WHERE day >= ? AND status != 'cancelled' ORDER BY day, start_min LIMIT 20",
  )
    .bind(now.day)
    .all();
  if (!r.results.length) return 'Записей пока нет.';
  // имена и телефоны лежат в России — подтягиваем их отдельным обращением
  const rows = await withPersonal(env, r.results);
  let out = 'Ближайшие записи:\n';
  let lastDay = '';
  for (const b of rows) {
    if (b.day !== lastDay) {
      const p = b.day.split('-');
      const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
      out += '\n📅 ' + +p[2] + ' ' + MGEN[+p[1] - 1] + ', ' + WDAYS[d.getUTCDay()] + '\n';
      lastDay = b.day;
    }
    out +=
      '  ' +
      hhmm(b.start_min) +
      '–' +
      hhmm(b.end_min) +
      '  ' +
      b.service +
      '\n     ' +
      b.name +
      ', ' +
      b.phone +
      '\n';
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
  // пометка живёт рядом с именем и телефоном — в российском хранилище
  const b = await pdLoad(env, id);
  if (!b) return null;
  const note = (b.note ? b.note + '\n' : '') + text;
  await pdSave(env, id, b.name || '', b.phone || '', note);
  return note;
}

async function addFreeNote(env, text) {
  await env.DB.prepare('INSERT INTO notes (text, created_at) VALUES (?, ?)')
    .bind(text, new Date().toISOString())
    .run();
}

async function notesText(env) {
  const r = await env.DB.prepare('SELECT text, created_at FROM notes ORDER BY id DESC LIMIT 30').all();
  if (!r.results.length) {
    return (
      'Блокнот пуст.\n\nПросто напишите боту любой текст — он сохранится сюда.\n' +
      'А если ответить на сообщение о записи, заметка прицепится к ней.'
    );
  }
  let out = '📓 Блокнот:\n';
  for (const n of r.results) {
    const d = new Date(new Date(n.created_at).getTime() + EKB * 60000);
    out +=
      '\n' +
      String(d.getUTCDate()).padStart(2, '0') +
      '.' +
      String(d.getUTCMonth() + 1).padStart(2, '0') +
      ' — ' +
      n.text;
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
  const b = await env.DB.prepare('SELECT id FROM bookings WHERE id = ?').bind(id).first();
  if (!b) return 'Запись не найдена';
  const p = await pdLoad(env, id);
  await env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ?").bind(id).run();
  return (
    'Запись отменена, время снова свободно.' +
    (p && p.phone ? '\nПозвоните клиенту: ' + p.phone : '')
  );
}

// ---------- меню, состояние, запись мастером ----------

const SERVICE_NAMES = Object.keys(DURATION);

/* Постоянные кнопки под полем ввода: мастеру не нужно помнить команды
и что-то печатать — всё делается нажатиями. */
const MENU_TG = {
  keyboard: [
    [{ text: '✍️ Записать клиента' }, { text: '📋 Мои записи' }],
    [{ text: '📅 График' }],
    [{ text: '📖 Планер дня' }, { text: '📱 Календарь на телефон' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};
/* В МАКСе оставлено только то, что там надёжно работает.
   Его сервер отвечает на нажатие 1,2–1,5 секунды против 150 мс у Telegram,
   и многошаговые действия — выбор дня, услуги, времени — не доживали
   до конца: мастер видела кнопки, которые «не нажимаются». Поэтому запись
   клиента и правка графика живут в Telegram и планере, а здесь остаются
   просмотр записей и ссылки — то, что укладывается в одно нажатие. */
const MENU_MAX = [
  [{ text: '📋 Мои записи', data: 'menu:zapisi' }],
  [{ text: '📖 Планер дня', data: 'menu:planer' }],
  [{ text: '📱 Календарь на телефон', data: 'menu:cal' }],
];

/* Состояние пошаговой записи. Мастер тычет день → услугу → время,
между нажатиями надо помнить, что уже выбрано. */
async function getState(env) {
  const raw = await getSetting(env, 'state');
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
async function setState(env, st) {
  await setSetting(env, 'state', JSON.stringify(st));
}
async function clearState(env) {
  await setSetting(env, 'state', '{}');
}

/* Календарь для выбора дня записи: выходные не нажимаются,
прошедшие дни тоже. Отличается от календаря графика только смыслом нажатия. */
function bookDayButtons(sched, y, m) {
  const key = ym(y, m);
  const off = new Set(sched.off[key] || []);
  const open = Object.prototype.hasOwnProperty.call(sched.off, key);
  const now = nowEkb();
  const rows = monthGrid(y, m).map(function (week) {
    return week.map(function (d) {
      if (!d) return { text: ' ', data: 'x' };
      const day = key + '-' + String(d).padStart(2, '0');
      if (!open || off.has(d) || day < now.day) return { text: '·', data: 'x' };
      return { text: String(d), data: 'bd:' + day };
    });
  });
  const prev = m === 0 ? ym(y - 1, 11) : ym(y, m - 1);
  const next = m === 11 ? ym(y + 1, 0) : ym(y, m + 1);
  rows.push([
    { text: '←', data: 'bm:' + prev },
    { text: MONTHS[m] + ' ' + y, data: 'x' },
    { text: '→', data: 'bm:' + next },
  ]);
  return rows;
}

function serviceButtons() {
  const rows = [];
  for (let i = 0; i < SERVICE_NAMES.length; i += 2) {
    const row = [{ text: SERVICE_NAMES[i], data: 'bs:' + i }];
    if (SERVICE_NAMES[i + 1]) row.push({ text: SERVICE_NAMES[i + 1], data: 'bs:' + (i + 1) });
    rows.push(row);
  }
  return rows;
}

async function slotButtons(env, day, service) {
  const res = await freeSlots(env, day, service);
  const rows = [];
  const list = res.slots || [];
  for (let i = 0; i < list.length; i += 3) {
    rows.push(
      list.slice(i, i + 3).map(function (s) {
        return { text: s.start, data: 'bt:' + s.min };
      }),
    );
  }
  return { rows: rows, count: list.length };
}

/* Последний шаг записи клиента: мастер пишет «Иванова 89001234567» одной
   строкой. Длинную цепочку цифр считаем телефоном, остальное — именем.
   Общая для обоих мессенджеров, чтобы поведение не разъезжалось. */
async function bookFromLine(env, st, raw) {
  /* Разбор строки «Иванова 89001234567».
     Раньше бралось первое совпадение подряд идущих цифр и пробелов —
     и на строке вроде «886 64 79506562515» телефоном становился хвост,
     а именем оставался обрывок «886 64». Теперь ищем все куски, похожие
     на телефон, и берём последний с десятью и более цифрами: имя человек
     пишет первым, телефон — в конце. */
  const line = String(raw || '').trim();
  const all = line.match(/\+?\d[\d\s()-]{8,}\d/g) || [];
  const phones = all.filter(function (x) {
    return (x.match(/\d/g) || []).length >= 10;
  });
  const phone = phones.length ? phones[phones.length - 1].trim() : '';
  // сначала убираем пробелы, потом хвостовую пунктуацию: иначе «Ольга, » остаётся с запятой
  const name = (phone ? line.replace(phone, '') : line).trim().replace(/[,;.\s]+$/, '') || 'Без имени';

  const res = await createBooking(env, {
    name: name,
    phone: phone || 'не указан',
    service: st.service,
    day: st.day,
    start: st.start,
    silent: true, // записала сама мастер — уведомлять её же незачем
  });
  if (!res.ok) return { ok: false, text: '❌ ' + res.error };
  return {
    ok: true,
    text:
      '✅ Записала' +
      NL +
      NL +
      '📅 ' +
      ruDay(st.day) +
      NL +
      '🕐 ' +
      res.start +
      ' — ' +
      res.end +
      NL +
      '💅 ' +
      st.service +
      NL +
      '👤 ' +
      name +
      (phone ? NL + '📞 ' + phone : ''),
  };
}

function ruDay(day) {
  const p = day.split('-');
  const d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  return +p[2] + ' ' + MGEN[+p[1] - 1] + ', ' + WDAYS[d.getUTCDay()];
}

// ---------- календарь на телефон (подписка ICS) ----------

/* Ссылка на календарь попадает в телефон и живёт там долго, поэтому у неё
отдельный ключ: если он утечёт, это откроет только просмотр записей,
а не управление ботом. */
async function calendarKey(env) {
  let k = await getSetting(env, 'cal_key');
  if (!k) {
    k = crypto.randomUUID().replace(/-/g, '');
    await setSetting(env, 'cal_key', k);
  }
  return k;
}

function icsTime(day, min) {
  // время храним по Екатеринбургу, в календарь отдаём в UTC — так не нужен
  // блок описания часового пояса, и телефон покажет верное время в любом поясе
  const p = day.split('-');
  const t = Date.UTC(+p[0], +p[1] - 1, +p[2], 0, min - EKB);
  return new Date(t)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

function icsEscape(s) {
  return String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

async function calendarIcs(env) {
  const now = nowEkb();
  const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const r = await env.DB.prepare(
    'SELECT id, day, start_min, end_min, service FROM bookings ' +
      "WHERE day >= ? AND status != 'cancelled' ORDER BY day, start_min",
  )
    .bind(from)
    .all();
  // имена для календаря тоже приходят из России
  const rows = await withPersonal(env, r.results);

  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//more-krasok//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Море красок — записи',
    'X-WR-TIMEZONE:Asia/Yekaterinburg',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  ];
  for (const b of rows) {
    lines.push('BEGIN:VEVENT');
    lines.push('UID:booking-' + b.id + '@more-krasok.ru');
    lines.push('DTSTAMP:' + stamp);
    lines.push('DTSTART:' + icsTime(b.day, b.start_min));
    lines.push('DTEND:' + icsTime(b.day, b.end_min));
    lines.push('SUMMARY:' + icsEscape(b.service + ' — ' + b.name));
    lines.push('DESCRIPTION:' + icsEscape(b.phone + (b.note ? '\n' + b.note : '')));
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

// ---------- бот для клиентов ----------

/* Отдельный бот: мастеру — свой, клиентам — свой. Один бот на двоих был бы
   опасен: любая ошибка в проверке «свой-чужой» открыла бы посторонним
   управление графиком и телефоны клиентов.

   Запись целиком кнопками: услуга → день → время → телефон одной кнопкой
   «поделиться контактом». Печатать не нужно ничего. */

async function cstate(env, chat) {
  const raw = await getSetting(env, 'c:' + chat);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}
async function setCstate(env, chat, st) {
  await setSetting(env, 'c:' + chat, JSON.stringify(st));
}

async function tgc(env, method, payload) {
  const r = await fetch('https://api.telegram.org/bot' + env.TG_CLIENT_TOKEN + '/' + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j.ok) console.log('Клиентский бот ' + method + ': ' + j.description);
  return j;
}

/* Ближайшие рабочие дни, где под услугу вообще есть свободное время.
   Показывать день, в который всё занято, — злить человека впустую. */
async function clientDays(env, service, limit) {
  const out = [];
  const probe = new Date(Date.now() + EKB * 60000);
  for (let i = 0; i < 60 && out.length < (limit || 8); i++) {
    const day = probe.toISOString().slice(0, 10);
    if (await isWorkingDay(env, day)) {
      const f = await freeSlots(env, day, service);
      if (f.slots && f.slots.length) out.push({ day: day, free: f.slots.length });
    }
    probe.setUTCDate(probe.getUTCDate() + 1);
  }
  return out;
}

function clientServiceButtons() {
  return SERVICE_NAMES.map(function (n, i) {
    return [{ text: n + ' · ' + DURATION[n] + ' мин', callback_data: 'cs:' + i }];
  });
}

async function clientStart(env, chat) {
  await setCstate(env, chat, {});
  await tgc(env, 'sendMessage', {
    chat_id: chat,
    text:
      'Студия красоты «Море красок»' +
      NL +
      'Екатеринбург, Уралмаш, ул. Донбасская, 4' +
      NL +
      NL +
      'Записаться можно прямо здесь — выберите услугу:',
    reply_markup: { inline_keyboard: clientServiceButtons() },
  });
}

async function handleClientBot(env, update) {
  const msg = update.message;
  const cb = update.callback_query;
  const chat = (msg && msg.chat && msg.chat.id) || (cb && cb.message.chat.id);
  if (!chat) return;

  if (msg && msg.contact && msg.contact.phone_number) {
    // человек нажал «поделиться контактом» — это последний шаг
    const st = await cstate(env, chat);
    if (!st.start) return;
    const name = [msg.contact.first_name, msg.contact.last_name].filter(Boolean).join(' ') || 'Клиент';
    const res = await createBooking(env, {
      name: name,
      phone: msg.contact.phone_number,
      service: st.service,
      day: st.day,
      start: st.start,
      clientChat: chat,
      clientKind: 'tg',
    });
    await setCstate(env, chat, {});
    await tgc(env, 'sendMessage', {
      chat_id: chat,
      text: res.ok
        ? '✅ Вы записаны!' +
          NL +
          NL +
          '📅 ' +
          ruDay(st.day) +
          NL +
          '🕐 ' +
          res.start +
          ' — ' +
          res.end +
          NL +
          '💅 ' +
          st.service +
          NL +
          NL +
          'Адрес: ул. Донбасская, 4' +
          NL +
          'Напомню накануне. Если планы изменятся — позвоните: ' +
          PHONE
        : '❌ ' + res.error,
      reply_markup: { remove_keyboard: true },
    });
    if (res.ok) await clientStart(env, chat);
    return;
  }

  if (msg && msg.text) {
    await clientStart(env, chat);
    return;
  }

  if (cb) {
    const data = cb.data || '';
    const st = await cstate(env, chat);

    if (data.startsWith('cs:')) {
      st.service = SERVICE_NAMES[parseInt(data.slice(3), 10)];
      await setCstate(env, chat, st);
      const days = await clientDays(env, st.service, 8);
      await tgc(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      await tgc(env, 'editMessageText', {
        chat_id: chat,
        message_id: cb.message.message_id,
        text:
          '💅 ' +
          st.service +
          ' · ' +
          DURATION[st.service] +
          ' мин' +
          NL +
          NL +
          (days.length ? 'Выберите день:' : 'Свободных дней пока нет. Позвоните: ' + PHONE),
        reply_markup: {
          inline_keyboard: days
            .map(function (d) {
              // без числа свободных окон: клиенту оно ничего не говорит,
              // а «свободно 22» выглядит как техническая надпись
              return [{ text: ruDay(d.day), callback_data: 'cd:' + d.day }];
            })
            .concat([[{ text: '← Другая услуга', callback_data: 'cb:svc' }]]),
        },
      });
      return;
    }

    if (data === 'cb:svc') {
      await tgc(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      await tgc(env, 'editMessageText', {
        chat_id: chat,
        message_id: cb.message.message_id,
        text: 'Выберите услугу:',
        reply_markup: { inline_keyboard: clientServiceButtons() },
      });
      return;
    }

    if (data.startsWith('cd:')) {
      st.day = data.slice(3);
      await setCstate(env, chat, st);
      const f = await freeSlots(env, st.day, st.service);
      const rows = [];
      const list = f.slots || [];
      for (let i = 0; i < list.length; i += 3) {
        rows.push(
          list.slice(i, i + 3).map(function (s) {
            return { text: s.start, callback_data: 'ct:' + s.min };
          }),
        );
      }
      rows.push([{ text: '← Другой день', callback_data: 'cs:' + SERVICE_NAMES.indexOf(st.service) }]);
      await tgc(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      await tgc(env, 'editMessageText', {
        chat_id: chat,
        message_id: cb.message.message_id,
        text: '💅 ' + st.service + NL + '📅 ' + ruDay(st.day) + NL + NL + 'Выберите время:',
        reply_markup: { inline_keyboard: rows },
      });
      return;
    }

    if (data.startsWith('ct:')) {
      st.start = parseInt(data.slice(3), 10);
      await setCstate(env, chat, st);
      await tgc(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      await tgc(env, 'editMessageText', {
        chat_id: chat,
        message_id: cb.message.message_id,
        text:
          '💅 ' +
          st.service +
          NL +
          '📅 ' +
          ruDay(st.day) +
          NL +
          '🕐 ' +
          hhmm(st.start) +
          NL +
          NL +
          'Остался последний шаг — телефон, чтобы мастер могла с вами связаться.',
      });
      await tgc(env, 'sendMessage', {
        chat_id: chat,
        text: 'Нажмите кнопку внизу — номер подставится сам.',
        reply_markup: {
          keyboard: [[{ text: '📞 Отправить мой номер', request_contact: true }]],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      });
      return;
    }
  }
}

// ---------- напоминания ----------

/* Раз в день: клиентам, записанным через бота, — напоминание накануне,
   мастеру — расписание на сегодня. Неявки чаще всего от забывчивости,
   и одно сообщение накануне снимает большую их часть. */
async function sendReminders(env, утро) {
  const now = nowEkb();

  /* Напоминание за сутки. Смотрим завтрашний день и шлём тем, кому ещё
     не отправляли. Час выбран удобный — не раньше десяти утра, чтобы
     не будить человека сообщением о визите. Отдельный признак reminded_day,
     иначе суточное и трёхчасовое напоминания гасили бы друг друга. */
  const tomorrow = new Date(Date.now() + EKB * 60000 + 86400000).toISOString().slice(0, 10);
  if (now.min >= 600 && now.min < 660) {
    const d = await env.DB.prepare(
      'SELECT id, day, start_min, end_min, service, client_chat, client_kind FROM bookings ' +
        "WHERE day = ? AND status != 'cancelled' AND reminded_day = 0 AND client_chat IS NOT NULL",
    )
      .bind(tomorrow)
      .all();
    for (const b of d.results) {
      const text =
        'Напоминаем о записи 🌸' + NL + NL +
        '📅 завтра, ' + ruDay(b.day) + NL +
        '🕐 ' + hhmm(b.start_min) + ' — ' + hhmm(b.end_min) + NL +
        '💅 ' + b.service + NL + NL +
        'Студия «Море красок», ул. Донбасская, 4' + NL +
        'Если планы изменились, позвоните: ' + PHONE;
      try {
        if (b.client_kind === 'tg' && env.TG_CLIENT_TOKEN) {
          await tgc(env, 'sendMessage', { chat_id: b.client_chat, text: text });
        }
        await env.DB.prepare('UPDATE bookings SET reminded_day = 1 WHERE id = ?').bind(b.id).run();
      } catch (e) {
        console.log('Напоминание за сутки ' + b.id + ': ' + e.message);
      }
    }
  }

  /* Напоминаем примерно за три часа до визита. Проверка идёт каждые полчаса,
     поэтому берём окно от двух до трёх с половиной часов: сообщение уйдёт
     ровно один раз и заведомо не позже, чем за два часа до начала.
     Имя из запроса убрано — оно больше не хранится в этой базе. */
  const r = await env.DB.prepare(
    'SELECT id, day, start_min, end_min, service, client_chat, client_kind FROM bookings ' +
      "WHERE day = ? AND status != 'cancelled' AND reminded = 0 AND client_chat IS NOT NULL " +
      'AND (start_min - ?) BETWEEN 120 AND 210',
  )
    .bind(now.day, now.min)
    .all();

  for (const b of r.results) {
    const text =
      'Напоминаем о записи 🌸' +
      NL +
      NL +
      '🕐 сегодня в ' +
      hhmm(b.start_min) +
      ', примерно через ' +
      Math.round((b.start_min - now.min) / 60) +
      ' ч' +
      NL +
      '💅 ' +
      b.service +
      NL +
      NL +
      'Студия «Море красок», ул. Донбасская, 4' +
      NL +
      'Если планы изменились, позвоните: ' +
      PHONE;
    try {
      if (b.client_kind === 'tg' && env.TG_CLIENT_TOKEN) {
        await tgc(env, 'sendMessage', { chat_id: b.client_chat, text: text });
      }
      await env.DB.prepare('UPDATE bookings SET reminded = 1 WHERE id = ?').bind(b.id).run();
    } catch (e) {
      console.log('Напоминание ' + b.id + ': ' + e.message);
    }
  }

  // мастеру — что сегодня; только в утренний запуск
  if (!утро) return { напомнили: r.results.length, записей_сегодня: null };
  const today = await env.DB.prepare(
    'SELECT id, start_min, end_min, service FROM bookings ' +
      "WHERE day = ? AND status != 'cancelled' ORDER BY start_min",
  )
    .bind(now.day)
    .all();
  if (today.results.length) {
    // имена приходят из российского хранилища
    const todayRows = await withPersonal(env, today.results);
    let out = 'Доброе утро! Сегодня, ' + ruDay(now.day) + ':' + NL;
    for (const b of todayRows) {
      out +=
        NL +
        hhmm(b.start_min) +
        '–' +
        hhmm(b.end_min) +
        '  ' +
        b.service +
        NL +
        '   ' +
        b.name +
        ', ' +
        b.phone +
        (b.note ? NL + '   💬 ' + b.note : '');
    }
    if (env.TG_TOKEN && env.TG_ADMIN_ID) {
      await tg(env, 'sendMessage', { chat_id: env.TG_ADMIN_ID, text: out });
    }
    const mc = await getSetting(env, 'max_chat');
    if (env.MAX_TOKEN && mc) await maxSend(env, mc, out);
  }
  return { напомнили: r.results.length, записей_сегодня: today.results.length };
}

// ---------- планер дня ----------

/* Страница на замену планеру из «Lubava»: лента дня с 9:00 до 19:00,
   занятые часы блоками, свободные — нажимаются и открывают быстрое добавление.
   Отдаёт её сам сервер по ссылке с ключом: на статическом сайте пароль
   спрятать негде, а здесь проверка происходит до отдачи страницы. */

async function planerKey(env) {
  let k = await getSetting(env, 'planer_key');
  if (!k) {
    k = crypto.randomUUID().replace(/-/g, '');
    await setSetting(env, 'planer_key', k);
  }
  return k;
}

async function dayData(env, day) {
  const r = await env.DB.prepare(
    'SELECT id, start_min, end_min, service FROM bookings ' +
      "WHERE day = ? AND status != 'cancelled' ORDER BY start_min",
  )
    .bind(day)
    .all();
  return {
    day: day,
    подпись: ruDay(day),
    рабочий: await isWorkingDay(env, day),
    услуги: SERVICE_NAMES.map(function (n) {
      return { имя: n, мин: DURATION[n] };
    }),
    записи: (await withPersonal(env, r.results)).map(function (b) {
      return {
        id: b.id,
        начало: b.start_min,
        конец: b.end_min,
        время: hhmm(b.start_min) + '–' + hhmm(b.end_min),
        услуга: b.service,
        имя: b.name,
        телефон: b.phone,
        пометка: b.note || '',
      };
    }),
  };
}

function planerHtml() {
  return `<!DOCTYPE html><html lang="ru"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><title>Планер — Море красок</title>
<style>
:root{--bg:#faf7f4;--card:#fff;--ink:#1c1917;--ink2:#57534e;--ink3:#a8a29e;--line:#ebe4dc;
--rose:#d4a5a5;--rose2:#b27d7d;--soft:#f7ebeb;--ok:#1d7a3f;--okbg:#e7f6ec;--off:#c07816;--offbg:#fdf3e3}
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{font:15px/1.5 -apple-system,system-ui,Roboto,sans-serif;background:var(--bg);color:var(--ink);padding-bottom:40px}
.top{position:sticky;top:0;z-index:5;background:rgba(250,247,244,.94);backdrop-filter:blur(12px);
border-bottom:1px solid var(--line);padding:12px 14px}
.nav{display:flex;align-items:center;gap:10px}
.nav button{flex:none;width:44px;height:44px;border:1px solid var(--line);background:var(--card);
border-radius:14px;font-size:19px;color:var(--ink)}
.nav .t{flex:1;text-align:center}
.nav .t b{display:block;font-size:16px}
.nav .t span{font-size:12px;color:var(--ink3)}
.badge{display:inline-block;margin-top:8px;padding:4px 12px;border-radius:99px;font-size:12px;font-weight:700}
.badge.w{background:var(--okbg);color:var(--ok)}
.badge.o{background:var(--offbg);color:var(--off)}
.wrap{padding:14px}
.row{display:flex;gap:10px;margin-bottom:6px}
.hh{flex:none;width:46px;font-size:12px;color:var(--ink3);font-weight:700;padding-top:12px}
.cell{flex:1;min-height:40px;border:1px dashed var(--line);border-radius:12px;background:var(--card);
display:flex;align-items:center;justify-content:center;color:var(--ink3);font-size:13px}
.cell.free:active{background:var(--soft);border-color:var(--rose)}
.bk{flex:1;border-radius:14px;padding:12px 14px;background:linear-gradient(135deg,#d4a5a5,#b27d7d);color:#fff;
box-shadow:0 6px 16px rgba(212,165,165,.35)}
.bk b{display:block;font-size:15px}
.bk .s{font-size:13px;opacity:.92}
.bk .p{font-size:13px;opacity:.92;margin-top:2px}
.bk .n{font-size:12.5px;opacity:.92;margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,.3)}
.bk a{color:#fff}
.empty{text-align:center;color:var(--ink2);padding:28px 10px}
dialog{border:none;border-radius:20px;padding:0;width:min(420px,92vw);background:var(--card)}
dialog::backdrop{background:rgba(28,25,23,.45)}
.dlg{padding:20px}
.dlg h3{font-size:17px;margin-bottom:14px}
.dlg label{display:block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
color:var(--ink3);margin:12px 0 5px}
.dlg input,.dlg select{width:100%;padding:13px 14px;border:1px solid var(--line);border-radius:14px;
font:15px inherit;background:var(--bg);color:var(--ink)}
.btns{display:flex;gap:8px;margin-top:18px}
.btns button{flex:1;padding:14px;border:none;border-radius:14px;font:700 15px inherit;color:#fff;
background:linear-gradient(135deg,#d4a5a5,#b27d7d)}
.btns button.gray{background:var(--bg);color:var(--ink2);border:1px solid var(--line)}
.btns button.red{background:#c0392b}
.msg{padding:10px 14px;border-radius:12px;font-size:13.5px;margin-top:12px;display:none}
.msg.err{display:block;background:#fdeceb;color:#c0392b}
</style></head><body>
<div class="top">
  <div class="nav">
    <button id="prev" aria-label="Назад">←</button>
    <div class="t"><b id="dt">—</b><span id="cnt"></span></div>
    <button id="next" aria-label="Вперёд">→</button>
  </div>
  <div style="text-align:center"><span class="badge" id="wd"></span></div>
</div>
<div class="wrap" id="grid"></div>

<dialog id="add"><form class="dlg" method="dialog" id="addForm">
  <h3 id="addTitle">Новая запись</h3>
  <label>Услуга</label><select id="svc"></select>
  <label>Имя и фамилия</label><input id="nm" placeholder="Иванова Мария" maxlength="80">
  <label>Телефон</label><input id="ph" type="tel" placeholder="8 900 123-45-67" maxlength="30">
  <div class="msg" id="addMsg"></div>
  <div class="btns"><button type="button" class="gray" id="addCancel">Отмена</button>
  <button type="button" id="addOk">Записать</button></div>
</form></dialog>

<dialog id="info"><div class="dlg">
  <h3 id="infoTitle">Запись</h3>
  <div id="infoBody"></div>
  <div class="btns"><button type="button" class="gray" id="infoClose">Закрыть</button>
  <button type="button" class="red" id="infoDel">Отменить запись</button></div>
</div></dialog>

<script>
var KEY=new URLSearchParams(location.search).get('key');
var day=new URLSearchParams(location.search).get('day')||new Date(Date.now()+5*3600000).toISOString().slice(0,10);
var data=null,pickStart=null,pickId=null;
var FROM=540,TO=1140,STEP=30;
function hhmm(m){return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
// 1 запись, 2 записи, 5 записей — иначе получается «1 записи»
function plural(n){
  if(!n)return 'записей нет';
  var d=n%10,dd=n%100;
  if(d===1&&dd!==11)return n+' запись';
  if(d>=2&&d<=4&&(dd<12||dd>14))return n+' записи';
  return n+' записей';
}
function shift(n){var p=day.split('-');var d=new Date(Date.UTC(+p[0],+p[1]-1,+p[2]));d.setUTCDate(d.getUTCDate()+n);
  day=d.toISOString().slice(0,10);load()}
function api(path,opts){return fetch('/planer/'+path+'?key='+encodeURIComponent(KEY)+'&day='+day,opts).then(function(r){return r.json()})}

function load(){
  api('data').then(function(d){
    data=d;
    document.getElementById('dt').textContent=d.подпись;
    document.getElementById('cnt').textContent=plural(d.записи.length);
    var wd=document.getElementById('wd');
    wd.textContent=d.рабочий?'рабочий день':'выходной';
    wd.className='badge '+(d.рабочий?'w':'o');
    var svc=document.getElementById('svc');
    svc.innerHTML=d.услуги.map(function(s){return '<option value="'+s.имя+'">'+s.имя+' · '+s.мин+' мин</option>'}).join('');
    draw();
  });
}

function draw(){
  var g=document.getElementById('grid');g.innerHTML='';
  if(!data.рабочий&&!data.записи.length){g.innerHTML='<p class="empty">В этот день вы не работаете.<br>Записей нет.</p>';return}
  var m=FROM;
  while(m<TO){
    var bk=data.записи.find(function(b){return b.начало===m});
    var busy=data.записи.find(function(b){return m>=b.начало&&m<b.конец});
    var row=document.createElement('div');row.className='row';
    row.innerHTML='<div class="hh">'+hhmm(m)+'</div>';
    if(bk){
      var el=document.createElement('div');el.className='bk';el.dataset.id=bk.id;
      el.innerHTML='<b>'+esc(bk.имя)+'</b><span class="s">'+esc(bk.услуга)+' · '+bk.время+'</span>'+
        '<div class="p">'+esc(bk.телефон)+'</div>'+(bk.пометка?'<div class="n">'+esc(bk.пометка)+'</div>':'');
      row.appendChild(el);
      m=bk.конец;
    }else if(busy){
      m+=STEP;continue;
    }else{
      var c=document.createElement('div');c.className='cell free';c.dataset.min=m;c.textContent='свободно';
      row.appendChild(c);m+=STEP;
    }
    g.appendChild(row);
  }
}
function esc(s){return String(s||'').replace(/[<>&]/g,function(c){return {'<':'&lt;','>':'&gt;','&':'&amp;'}[c]})}

document.getElementById('prev').onclick=function(){shift(-1)};
document.getElementById('next').onclick=function(){shift(1)};

document.getElementById('grid').addEventListener('click',function(e){
  var free=e.target.closest('.cell.free');
  if(free){pickStart=+free.dataset.min;
    document.getElementById('addTitle').textContent='Запись на '+hhmm(pickStart);
    document.getElementById('addMsg').className='msg';
    document.getElementById('add').showModal();return}
  var bk=e.target.closest('.bk');
  if(bk){var b=data.записи.find(function(x){return x.id==bk.dataset.id});pickId=b.id;
    document.getElementById('infoTitle').textContent=b.имя;
    document.getElementById('infoBody').innerHTML='<p>'+esc(b.услуга)+'<br>'+b.время+'</p>'+
      '<p style="margin-top:8px"><a href="tel:'+esc(b.телефон)+'">'+esc(b.телефон)+'</a></p>'+
      (b.пометка?'<p style="margin-top:8px;color:#57534e">'+esc(b.пометка)+'</p>':'');
    document.getElementById('info').showModal()}
});
document.getElementById('addCancel').onclick=function(){document.getElementById('add').close()};
document.getElementById('infoClose').onclick=function(){document.getElementById('info').close()};

document.getElementById('addOk').onclick=function(){
  var body={start:pickStart,service:document.getElementById('svc').value,
    name:document.getElementById('nm').value.trim(),phone:document.getElementById('ph').value.trim()};
  api('add',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
    .then(function(r){
      if(r.ok){document.getElementById('add').close();
        document.getElementById('nm').value='';document.getElementById('ph').value='';load()}
      else{var m=document.getElementById('addMsg');m.className='msg err';m.textContent=r.error||'Не получилось'}
    });
};
document.getElementById('infoDel').onclick=function(){
  api('cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:pickId})})
    .then(function(){document.getElementById('info').close();load()});
};
load();
</script></body></html>`;
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
      return row.map(function (b) {
        return { text: b.text, callback_data: b.data };
      });
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
    const raw = msg.text.trim();
    const cmd = raw.toLowerCase().split('@')[0];

    // ---- нажатия кнопок меню ----
    if (raw === '✍️ Записать клиента') {
      await setState(env, { step: 'day' });
      const now2 = new Date();
      await tg(env, 'sendMessage', {
        chat_id: chatId,
        text: 'Выберите день записи:',
        reply_markup: tgKeyboard(bookDayButtons(sched, now2.getUTCFullYear(), now2.getUTCMonth())),
      });
      return;
    }
    if (raw === '📋 Мои записи') {
      await tg(env, 'sendMessage', { chat_id: chatId, text: await upcomingText(env), reply_markup: MENU_TG });
      return;
    }
    if (raw === '📅 График') {
      await tgShowMonth(env, chatId, null, sched, now.getUTCFullYear(), now.getUTCMonth());
      return;
    }
    if (raw === '📓 Блокнот') {
      await tg(env, 'sendMessage', { chat_id: chatId, text: await notesText(env), reply_markup: MENU_TG });
      return;
    }
    if (raw === '📖 Планер дня') {
      const k = await planerKey(env);
      await tg(env, 'sendMessage', {
        chat_id: chatId,
        text:
          'Планер дня — расписание с 8:00 до 19:00.' +
          NL +
          NL +
          SITE +
          '/planer.html?key=' +
          k +
          NL +
          NL +
          '⚡ Откройте ссылку и добавьте её на главный экран: меню браузера → «На главный экран». ' +
          'Появится значок, планер будет открываться мгновенно и работать даже без интернета — ' +
          'он держит расписание на три недели вперёд прямо в телефоне.' +
          NL +
          NL +
          'Нажмите на свободный час, чтобы записать клиента, или на запись, чтобы позвонить или отменить.' +
          NL +
          NL +
          'Ссылку никому не передавайте: по ней видны телефоны клиентов.',
        reply_markup: MENU_TG,
      });
      return;
    }
    if (raw === '📱 Календарь на телефон') {
      const k = await calendarKey(env);
      await tg(env, 'sendMessage', {
        chat_id: chatId,
        text:
          'Записи в календаре телефона\n\n' +
          'Ссылка для подписки:\n' +
          SELF_URL +
          '/calendar.ics?key=' +
          k +
          '\n\n' +
          'Айфон: Настройки → Календарь → Учётные записи → Добавить → Другое → ' +
          'Подписной календарь → вставить ссылку.\n\n' +
          'Андроид: открыть calendar.google.com на компьютере → слева «Другие календари» → ' +
          '«Подписаться по URL» → вставить ссылку. В телефоне появится само.\n\n' +
          'Дальше записи будут добавляться в календарь без вашего участия.',
        reply_markup: MENU_TG,
      });
      return;
    }

    // ---- пошаговая запись: ждём имя и телефон ----
    const st = await getState(env);
    if (st.step === 'name' && !raw.startsWith('/')) {
      const res = await bookFromLine(env, st, raw);
      await clearState(env);
      await tg(env, 'sendMessage', { chat_id: chatId, text: res.text, reply_markup: MENU_TG });
      return;
    }

    if (cmd === '/start') {
      // кнопки появляются под полем ввода и остаются там — печатать ничего не нужно
      await tg(env, 'sendMessage', {
        chat_id: chatId,
        text:
          'Здравствуйте, Анастасия!\n\nВнизу появились кнопки — всё делается нажатиями:\n\n' +
          '✍️ Записать клиента — если позвонили напрямую\n' +
          '📋 Мои записи — кто и когда придёт\n' +
          '📅 График — отметить выходные\n' +
          '📓 Блокнот — фамилии и всё, что нужно не забыть\n' +
          '📱 Календарь на телефон — записи сами появятся в календаре',
        reply_markup: MENU_TG,
      });
    } else if (cmd === '/grafik' || cmd === '/график') {
      await tgShowMonth(env, chatId, null, sched, now.getUTCFullYear(), now.getUTCMonth());
    } else if (cmd === '/zapisi' || cmd === '/записи') {
      await tg(env, 'sendMessage', { chat_id: chatId, text: await upcomingText(env) });
    } else if (cmd === '/zametki' || cmd === '/заметки') {
      await tg(env, 'sendMessage', { chat_id: chatId, text: await notesText(env) });
    } else if (cmd.startsWith('/')) {
      await tg(env, 'sendMessage', {
        chat_id: chatId,
        text:
          '/grafik — календарь, отметить выходные\n' +
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
        await tg(env, 'sendMessage', {
          chat_id: chatId,
          text: '✅ Записал в блокнот. Посмотреть — /zametki',
        });
      }
    }
    return;
  }

  if (cb) {
    const data0 = cb.data || '';

    // ---- пошаговая запись клиента мастером ----
    if (data0.startsWith('bm:')) {
      const [yy, mm] = data0.slice(3).split('-').map(Number);
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      await tg(env, 'editMessageReplyMarkup', {
        chat_id: chatId,
        message_id: cb.message.message_id,
        reply_markup: tgKeyboard(bookDayButtons(sched, yy, mm - 1)),
      });
      return;
    }
    if (data0.startsWith('bd:')) {
      await setState(env, { step: 'service', day: data0.slice(3) });
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      await tg(env, 'editMessageText', {
        chat_id: chatId,
        message_id: cb.message.message_id,
        text: '📅 ' + ruDay(data0.slice(3)) + '\n\nКакая услуга?',
        reply_markup: tgKeyboard(serviceButtons()),
      });
      return;
    }
    if (data0.startsWith('bs:')) {
      const st = await getState(env);
      st.service = SERVICE_NAMES[parseInt(data0.slice(3), 10)];
      st.step = 'slot';
      await setState(env, st);
      const sb = await slotButtons(env, st.day, st.service);
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      await tg(env, 'editMessageText', {
        chat_id: chatId,
        message_id: cb.message.message_id,
        text:
          '📅 ' +
          ruDay(st.day) +
          '\n💅 ' +
          st.service +
          ' · ' +
          DURATION[st.service] +
          ' мин\n\n' +
          (sb.count ? 'Во сколько?' : 'Свободного времени в этот день не осталось.'),
        reply_markup: tgKeyboard(
          sb.rows.length ? sb.rows : [[{ text: '← Другой день', data: 'bm:' + st.day.slice(0, 7) }]],
        ),
      });
      return;
    }
    if (data0.startsWith('bt:')) {
      const st = await getState(env);
      st.start = parseInt(data0.slice(3), 10);
      st.step = 'name';
      await setState(env, st);
      await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id });
      await tg(env, 'editMessageText', {
        chat_id: chatId,
        message_id: cb.message.message_id,
        text:
          '📅 ' +
          ruDay(st.day) +
          '\n🕐 ' +
          hhmm(st.start) +
          '\n💅 ' +
          st.service +
          '\n\nНапишите одним сообщением имя и телефон.\nНапример: Иванова 89001234567',
      });
      return;
    }

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
      const y = parseInt(res.key.slice(0, 4), 10),
        m = parseInt(res.key.slice(5), 10) - 1;
      await tgShowMonth(env, chatId, cb.message.message_id, fresh, y, m);
    }
  }
}

// ---------- МАКС ----------

async function maxApi(env, path, payload, query) {
  const url = MAX_API + path + (query ? query : '');
  const opts = {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: env.MAX_TOKEN },
  };
  if (payload) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(payload);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) console.log('MAX ' + path + ' -> ' + r.status + ' ' + text.slice(0, 200));
  try {
    return JSON.parse(text);
  } catch (e) {
    return { raw: text, status: r.status };
  }
}

function maxKeyboard(rows) {
  return [
    {
      type: 'inline_keyboard',
      payload: {
        buttons: rows.map(function (row) {
          return row.map(function (b) {
            return { type: 'callback', text: b.text, payload: b.data };
          });
        }),
      },
    },
  ];
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
      await maxSend(
        env,
        chatId,
        'Это служебный бот студии «Море красок».\n\nЗаписаться: ' + SITE + '\nПозвонить: ' + PHONE,
      );
      return;
    }

    const sched = await loadSchedule(env);
    const now = new Date();
    if (text === '/start') {
      await maxSend(env, chatId, 'Здравствуйте, Анастасия!' + NL + NL +
        'Здесь приходят новые записи и можно посмотреть расписание.' + NL +
        'Записать клиента и отметить выходные удобнее в Telegram или в планере — ' +
        'МАКС для этого слишком медленный.', MENU_MAX);
    } else if (text === '/grafik' || text === 'график') {
      // календарь на месяц в МАКСе не доживал до отрисовки — отправляем туда,
      // где он работает быстро
      await maxSend(
        env,
        chatId,
        'Отметить выходные удобнее в Telegram: там календарь открывается сразу.' +
          NL +
          NL +
          'Посмотреть расписание и записать клиента — в планере:' +
          NL +
          SITE +
          '/planer.html?key=' +
          (await planerKey(env)),
        MENU_MAX,
      );
    } else if (text === '/zapisi' || text === 'записи') {
      await maxSend(env, chatId, await upcomingText(env));
    } else if (text === '/zametki' || text === 'заметки') {
      await maxSend(env, chatId, await notesText(env));
    } else if (text.startsWith('/')) {
      await maxSend(
        env,
        chatId,
        '/grafik — календарь, отметить выходные\n' +
          '/zapisi — ближайшие записи\n' +
          '/zametki — блокнот\n\n' +
          'Новые записи с сайта приходят сюда сами.\n' +
          'Любой текст без команды сохраняется в блокнот.',
      );
    } else {
      const st = await getState(env);
      if (st.step === 'name') {
        // последний шаг записи клиента: имя и телефон одной строкой
        const res = await bookFromLine(env, st, (m.body && m.body.text) || '');
        await clearState(env);
        await maxSend(env, chatId, res.text, MENU_MAX);
      } else {
        // ответ на конкретное сообщение в МАКСе не отслеживаем — пишем в общий блокнот
        await addFreeNote(env, ((m.body && m.body.text) || '').trim());
        await maxSend(env, chatId, '✅ Записал в блокнот. Посмотреть — /zametki');
      }
    }
    return;
  }

  // нажатие кнопки
  if (type === 'message_callback' && update.callback) {
    const cbk = update.callback;
    const chatId = update.message && update.message.recipient && update.message.recipient.chat_id;
    const data = cbk.payload || '';

    /* Пошаговая запись клиента: день → услуга → время → имя с телефоном.
       Ответ на нажатие в МАКСе один — /answers, он же и перерисовывает
       сообщение, поэтому каждый шаг отдаёт новый текст и новые кнопки. */
    /* Отвечать надо быстро: МАКС ждёт ответа на нажатие пару секунд и молча
       бросает. Поэтому работа с базой идёт после ответа, а не до.
       Если ответить не успели — шлём обычным сообщением, чтобы мастер
       не смотрела на кнопку, которая «не работает». */
    const step = async function (text, rows) {
      /* Раньше ответ на нажатие нёс в себе целое сообщение с клавиатурой:
         МАКС отвечал на это 1,5 секунды и часто не успевал, а результат
         подменял старое сообщение с меню — оно далеко вверху, и мастеру
         приходилось листать. Теперь нажатие подтверждаем пустым ответом
         (он быстрый), а содержимое шлём новым сообщением вниз чата. */
      await maxApi(
        env,
        '/answers',
        {},
        '?callback_id=' + encodeURIComponent(cbk.callback_id),
      ).catch(function () {});
      if (chatId) await maxSend(env, chatId, text, rows);
    };

    if (data === 'menu:zapis' || data.startsWith('bm:')) {
      const sc = await loadSchedule(env);
      let y, mo;
      if (data.startsWith('bm:')) {
        y = parseInt(data.slice(3, 7), 10);
        mo = parseInt(data.slice(8), 10) - 1;
      } else {
        const t = new Date();
        y = t.getUTCFullYear();
        mo = t.getUTCMonth();
      }
      // сначала ответ мастеру, запись состояния — следом
      await step('Выберите день записи:', bookDayButtons(sc, y, mo));
      await setState(env, { step: 'day' });
      return;
    }

    if (data.startsWith('bd:')) {
      // клавиатура услуг не зависит от базы — отвечаем сразу, состояние потом
      await step('📅 ' + ruDay(data.slice(3)) + NL + NL + 'Какая услуга?', serviceButtons());
      await setState(env, { step: 'service', day: data.slice(3) });
      return;
    }

    if (data.startsWith('bs:')) {
      const st = await getState(env);
      st.service = SERVICE_NAMES[parseInt(data.slice(3), 10)];
      st.step = 'slot';
      await setState(env, st);
      const sb = await slotButtons(env, st.day, st.service);
      await step(
        '📅 ' +
          ruDay(st.day) +
          NL +
          '💅 ' +
          st.service +
          ' · ' +
          DURATION[st.service] +
          ' мин' +
          NL +
          NL +
          (sb.count ? 'Во сколько?' : 'Свободного времени в этот день не осталось.'),
        sb.rows.length ? sb.rows : [[{ text: '← Другой день', data: 'bm:' + st.day.slice(0, 7) }]],
      );
      return;
    }

    if (data.startsWith('bt:')) {
      const st = await getState(env);
      st.start = parseInt(data.slice(3), 10);
      st.step = 'name';
      await setState(env, st);
      await step(
        '📅 ' +
          ruDay(st.day) +
          NL +
          '🕐 ' +
          hhmm(st.start) +
          NL +
          '💅 ' +
          st.service +
          NL +
          NL +
          'Напишите одним сообщением имя и телефон.' +
          NL +
          'Например: Иванова 89001234567',
        [],
      );
      return;
    }

    if (data.startsWith('menu:')) {
      const what = data.slice(5);
      let out = '';
      if (what === 'zapisi') {
        out = await upcomingText(env);
      } else if (what === 'zametki') {
        out = await notesText(env);
      } else if (what === 'planer') {
        const k = await planerKey(env);
        out =
          'Планер дня — расписание с 8:00 до 19:00.' +
          NL +
          NL +
          SITE +
          '/planer.html?key=' +
          k +
          NL +
          NL +
          'Добавьте ссылку на главный экран телефона — планер будет открываться мгновенно ' +
          'и работать без интернета.' +
          NL +
          'Нажмите на свободный час, чтобы записать клиента.' +
          NL +
          'Ссылку никому не передавайте: по ней видны телефоны клиентов.';
      } else if (what === 'cal') {
        const k = await calendarKey(env);
        out =
          'Ссылка для подписки на календарь:' +
          NL +
          SELF_URL +
          '/calendar.ics?key=' +
          k +
          NL +
          NL +
          'Айфон: Настройки → Календарь → Учётные записи → Добавить → Другое → Подписной календарь.' +
          NL +
          'Андроид: calendar.google.com на компьютере → «Другие календари» → «Подписаться по URL».';
      } else if (what === 'grafik') {
        const sc = await loadSchedule(env);
        const t = new Date();
        await maxApi(env, '/answers', {}, '?callback_id=' + encodeURIComponent(cbk.callback_id)).catch(
          function () {},
        );
        if (chatId) {
          await maxSend(
            env,
            chatId,
            monthText(sc, t.getUTCFullYear(), t.getUTCMonth()),
            calendarButtons(sc, t.getUTCFullYear(), t.getUTCMonth()),
          );
        }
        return;
      }
      await maxApi(env, '/answers', {}, '?callback_id=' + encodeURIComponent(cbk.callback_id)).catch(
        function () {},
      );
      if (chatId) await maxSend(env, chatId, out, MENU_MAX);
      return;
    }

    if (data.startsWith('c:')) {
      const msg2 = await cancelBooking(env, parseInt(data.slice(2), 10));
      await maxApi(
        env,
        '/answers',
        { message: { text: msg2 }, notification: 'Отменено' },
        '?callback_id=' + encodeURIComponent(cbk.callback_id),
      );
      return;
    }
    const res = await applyTap(env, data);
    if (res.key) {
      const fresh = await loadSchedule(env);
      const y = parseInt(res.key.slice(0, 4), 10),
        mo = parseInt(res.key.slice(5), 10) - 1;
      await maxApi(
        env,
        '/answers',
        {
          message: { text: monthText(fresh, y, mo), attachments: maxKeyboard(calendarButtons(fresh, y, mo)) },
          notification: res.toast || undefined,
        },
        '?callback_id=' + encodeURIComponent(cbk.callback_id),
      );
    }
  }
}

// ---------- заявка с сайта ----------

function clean(v, max) {
  return String(v == null ? '' : v)
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, max);
}

async function handleBooking(env, body) {
  const name = clean(body.name, 80);
  const phone = clean(body.phone, 30);
  const service = clean(body.service, 80);
  const date = clean(body.date, 20);

  if (!name || !phone) return { ok: false, error: 'Укажите имя и телефон' };
  if (clean(body.website, 50)) return { ok: true }; // ловушка для ботов

  const lines = ['🔔 Новая заявка с сайта', '', '👤 ' + name, '📞 ' + phone];
  if (service) lines.push('💅 ' + service);
  if (date) lines.push('📅 ' + date);
  const text = lines.join('\n');

  // шлём в оба мессенджера; молчание одного не должно ронять заявку
  const jobs = [];
  if (env.TG_TOKEN && env.TG_ADMIN_ID) {
    jobs.push(
      tg(env, 'sendMessage', { chat_id: env.TG_ADMIN_ID, text: text }).catch(function (e) {
        console.log('TG: ' + e.message);
      }),
    );
  }
  if (env.MAX_TOKEN) {
    jobs.push(
      (async function () {
        const chat = await getSetting(env, 'max_chat');
        if (chat) await maxSend(env, chat, text);
      })().catch(function (e) {
        console.log('MAX: ' + e.message);
      }),
    );
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

  /* Проверка хранилища в России: пишем пробную запись, читаем обратно, стираем.
     Так видно не «ключ задан», а что цепочка работает целиком. */
  let pdCheck = 'не проверялось';
  if (env.PD_KEY) {
    const t0 = Date.now();
    const testId = 999999;
    const put = await pdCall(env, 'put', { id: testId, name: 'проверка', phone: '000', note: '' });
    const got = await pdLoad(env, testId);
    await pdDelete(env, testId);
    pdCheck = !put
      ? 'запись не прошла: ' + (pdLastError || 'функция не ответила')
      : got && got.name === 'проверка'
        ? 'работает, ' + (Date.now() - t0) + ' мс'
        : 'записалось, но не читается обратно';
  }

  // состояние вебхука клиентского бота: молчащий бот чаще всего означает,
  // что Telegram не может достучаться, а не ошибку в коде
  let clientHook = null;
  if (env.TG_CLIENT_TOKEN) {
    try {
      const r = await fetch('https://api.telegram.org/bot' + env.TG_CLIENT_TOKEN + '/getWebhookInfo');
      const j = await r.json();
      if (j.ok) {
        clientHook = {
          адрес: j.result.url || 'не задан',
          ждут_доставки: j.result.pending_update_count,
          последняя_ошибка: j.result.last_error_message || 'нет',
        };
      }
    } catch (e) {
      clientHook = 'ошибка: ' + e.message;
    }
  }

  // адрес клиентского бота — нужен, чтобы поставить ссылку на сайт
  let clientBot = null;
  if (env.TG_CLIENT_TOKEN) {
    try {
      const r = await fetch('https://api.telegram.org/bot' + env.TG_CLIENT_TOKEN + '/getMe');
      const j = await r.json();
      if (j.ok) clientBot = '@' + j.result.username;
    } catch (e) {
      clientBot = 'ошибка: ' + e.message;
    }
  }

  // с кем бот в МАКСе уже переписывался — по этому видно, заходила ли мастер
  let maxChats = 'не проверялось';
  try {
    const r = await maxApi(env, '/chats', null, '?count=20');
    maxChats = (r.chats || []).map(function (c) {
      return {
        id: c.chat_id,
        тип: c.type,
        участников: c.participants_count,
        последнее_сообщение: c.last_event_time
          ? new Date(c.last_event_time + EKB * 60000).toISOString().slice(0, 16).replace('T', ' ')
          : null,
      };
    });
  } catch (e) {
    maxChats = 'ошибка: ' + e.message;
  }

  return {
    хранилище_в_России: pdCheck,
    клиентский_бот: clientBot,
    вебхук_клиентского: clientHook,
    диалоги_в_максе: maxChats,
    секреты: {
      TG_TOKEN: !!env.TG_TOKEN,
      TG_ADMIN_ID: !!env.TG_ADMIN_ID,
      MAX_TOKEN: !!env.MAX_TOKEN,
      ADMIN_KEY: !!env.ADMIN_KEY,
    },
    база: {
      месяцев_в_графике: Object.keys(sched.off).length,
      выходных_всего: Object.values(sched.off).reduce(function (a, b) {
        return a + b.length;
      }, 0),
      чат_макса: await getSetting(env, 'max_chat'),
    },
    связь: await Promise.all([
      probe('Telegram getMe', 'https://api.telegram.org/bot' + env.TG_TOKEN + '/getMe'),
      probe('Клиентский бот getMe', 'https://api.telegram.org/bot' + (env.TG_CLIENT_TOKEN || 'нет') + '/getMe'),
      probe('МАКС me', MAX_API + '/me', { headers: { Authorization: env.MAX_TOKEN || '' } }),
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
    const r = await fetch(
      'https://api.telegram.org/bot' + env.TG_TOKEN + '/setWebhook?url=' + encodeURIComponent(base + '/tg'),
    );
    out.telegram = await r.json();
  }
  if (env.TG_CLIENT_TOKEN) {
    const r = await fetch(
      'https://api.telegram.org/bot' +
        env.TG_CLIENT_TOKEN +
        '/setWebhook?url=' +
        encodeURIComponent(base + '/tgc'),
    );
    out.telegram_клиентский = await r.json();
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
  /* Задача идёт каждые полчаса — так часто нужно только напоминаниям,
     которые уходят примерно за три часа до визита. Уборка и утренняя
     сводка мастеру нужны раз в день, поэтому они по времени. */
  async scheduled(event, env, ctx) {
    const t = new Date(Date.now() + EKB * 60000);
    const утро = t.getUTCHours() === 8 && t.getUTCMinutes() < 30;

    try {
      const rem = await sendReminders(env, утро);
      console.log('Напоминания: ' + JSON.stringify(rem));
    } catch (e) {
      console.log('Напоминания упали: ' + e.message);
    }

    if (!утро) return;

    /* Записи с именами и телефонами храним полгода: этого хватает, чтобы
       узнать постоянного клиента, и телефоны не копятся годами. Заметки — год. */
    const cut = new Date(Date.now() - 182 * 86400000).toISOString().slice(0, 10);
    /* Сначала стираем имена и телефоны в российском хранилище, потом сами
       записи. Обратный порядок оставил бы файлы с телефонами без владельца:
       записи бы исчезли, а данные остались лежать. */
    const old = await env.DB.prepare('SELECT id FROM bookings WHERE day < ?').bind(cut).all();
    for (const row of old.results) await pdDelete(env, row.id);
    const cutNotes = new Date(Date.now() - 365 * 86400000).toISOString();
    const r = await env.DB.batch([
      env.DB.prepare('DELETE FROM bookings WHERE day < ?').bind(cut),
      env.DB.prepare('DELETE FROM notes WHERE created_at < ?').bind(cutNotes),
    ]);
    console.log('Очистка: записей ' + r[0].meta.changes + ', заметок ' + r[1].meta.changes);
  },

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
      Vary: 'Origin',
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

      // подписка календаря: ключ отдельный, в ссылке, и открывает только просмотр
      if (path === '/calendar.ics') {
        const k = await getSetting(env, 'cal_key');
        if (!k || url.searchParams.get('key') !== k) return new Response('Нет доступа', { status: 403 });
        return new Response(await calendarIcs(env), {
          headers: {
            'Content-Type': 'text/calendar; charset=utf-8',
            'Cache-Control': 'public, max-age=300',
            'Content-Disposition': 'inline; filename="more-krasok.ics"',
          },
        });
      }

      // ---- планер дня, закрыт собственным ключом ----
      if (path === '/planer' || path.startsWith('/planer/')) {
        const k = await getSetting(env, 'planer_key');
        if (!k || url.searchParams.get('key') !== k) {
          return new Response('Нет доступа', { status: 403, headers: cors });
        }
        if (path === '/planer') {
          // страница переехала на сайт: там российский адрес и работа без сети
          return Response.redirect(SITE + '/planer.html?key=' + k, 302);
        }
        const day = url.searchParams.get('day') || nowEkb().day;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'Нужен день' }, 400, cors);

        if (path === '/planer/data') return json(await dayData(env, day), 200, cors);

        if (path === '/planer/add' && request.method === 'POST') {
          const b = await request.json().catch(function () {
            return {};
          });
          // мастер записывает вручную — уведомлять её же о своей записи незачем
          const res = await createBooking(env, {
            name: b.name || 'Без имени',
            phone: b.phone || 'не указан',
            service: b.service,
            day: day,
            start: b.start,
            silent: true,
          });
          return json(res, res.ok ? 200 : 400, cors);
        }

        if (path === '/planer/cancel' && request.method === 'POST') {
          const b = await request.json().catch(function () {
            return {};
          });
          await cancelBooking(env, parseInt(b.id, 10));
          return json({ ok: true }, 200, cors);
        }
        return new Response('Не найдено', { status: 404, headers: cors });
      }

      /* Временная проверка: сколько кнопок принимает МАКС.
         Шлём в заведомо несуществующий чат — если клавиатура велика,
         ошибка придёт про неё, а не про чат, и мамин чат не засоряется. */
      if (path === '/diag/max') {
        const cases = {
          'обычные кнопки': [[{ text: '1', data: 'a' }, { text: '2', data: 'b' }]],
          'текст из пробела': [[{ text: ' ', data: 'x' }, { text: '2', data: 'b' }]],
          'пустой текст': [[{ text: '', data: 'x' }, { text: '2', data: 'b' }]],
          'точка вместо пробела': [[{ text: '·', data: 'x' }, { text: '2', data: 'b' }]],
          'одинаковый data у двух': [[{ text: '1', data: 'x' }, { text: '2', data: 'x' }]],
          'настоящий календарь': null,
        };
        const t0 = Date.now();
        const sc = await loadSchedule(env);
        const tLoad = Date.now() - t0;
        const t = new Date();
        const cal = bookDayButtons(sc, t.getUTCFullYear(), t.getUTCMonth());
        const t1 = Date.now();
        await setState(env, { step: 'проверка' });
        const tState = Date.now() - t1;

        const out = [{ шаг: 'чтение графика из базы', мс: tLoad }, { шаг: 'запись состояния', мс: tState }];

        // тот же метод, которым бот отвечает на нажатия
        for (const [имя, rows] of [
          ['ответ: маленькая клавиатура', [[{ text: '1', data: 'a' }]]],
          ['ответ: календарь целиком', cal],
        ]) {
          const t2 = Date.now();
          const r = await maxApi(
            env,
            '/answers',
            { message: { text: 'тест', attachments: maxKeyboard(rows) } },
            '?callback_id=zzz',
          );
          out.push({ шаг: имя, мс: Date.now() - t2, ответ: JSON.stringify(r).slice(0, 200) });
        }
        return json(out);
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
        return json(
          {
            busy: busy.map(function (b) {
              return { start: hhmm(b.start_min), end: hhmm(b.end_min) };
            }),
          },
          200,
          cors,
        );
      }

      if (path === '/book' && request.method === 'POST') {
        const body = await request.json().catch(function () {
          return {};
        });
        // с выбранным временем — бронь; без него — просто просьба перезвонить
        const res =
          body.day && body.start != null ? await createBooking(env, body) : await handleBooking(env, body);
        return json(res, res.ok ? 200 : 400, cors);
      }

      // вебхуки: всегда отвечаем 200, иначе мессенджер шлёт одно и то же по кругу
      if (path === '/tg' && request.method === 'POST') {
        const body = await request.json().catch(function () {
          return {};
        });
        await handleTelegram(env, body);
        return new Response('ok');
      }
      if (path === '/tgc' && request.method === 'POST') {
        const body = await request.json().catch(function () {
          return {};
        });
        if (env.TG_CLIENT_TOKEN) await handleClientBot(env, body);
        return new Response('ok');
      }
      if (path === '/max' && request.method === 'POST') {
        const body = await request.json().catch(function () {
          return {};
        });
        await handleMax(env, body);
        return new Response('ok');
      }

      return new Response('Море красок', { status: 200 });
    } catch (e) {
      console.log('Ошибка: ' + e.stack);
      if (path === '/book')
        return json({ ok: false, error: 'Не удалось отправить. Позвоните: ' + PHONE }, 500, cors);
      return new Response('ok'); // мессенджеру всё равно отвечаем успехом
    }
  },
};
