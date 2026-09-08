'use strict';
/*
 * Бэкенд студии «Море красок» — Yandex Cloud Function.
 *
 * Два маршрута через API Gateway:
 *   POST /tg    — вебхук Telegram: мастер правит график кнопками в боте
 *   POST /book  — заявка с сайта: уходит мастеру в Telegram, нигде не хранится
 *
 * График лежит в Object Storage в файле schedule.json и читается сайтом напрямую.
 * Записи клиентов НЕ сохраняются: бакет публичный на чтение, персональным данным
 * там не место. История записей остаётся у мастера в переписке с ботом.
 *
 * Переменные окружения:
 *   BUCKET, TG_TOKEN, TG_ADMIN_ID, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

const BUCKET = process.env.BUCKET;
const TG_TOKEN = process.env.TG_TOKEN;
const ADMIN = String(process.env.TG_ADMIN_ID || '');
const KEY = 'schedule.json';

const s3 = new S3Client({ region: 'ru-central1', endpoint: 'https://storage.yandexcloud.net' });

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MGEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

// ---------- Object Storage ----------

async function loadSchedule() {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
    return JSON.parse(await r.Body.transformToString());
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.Code === 'NoSuchKey') return { off: {}, updated: null };
    throw e;
  }
}

async function saveSchedule(sched) {
  sched.updated = new Date().toISOString();
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: KEY,
    Body: JSON.stringify(sched),
    ContentType: 'application/json; charset=utf-8',
    // график меняется редко, но сайт должен подхватывать правку быстро
    CacheControl: 'public, max-age=300',
  }));
}

// ---------- Telegram ----------

async function tg(method, payload) {
  const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j.ok) console.error('Telegram ' + method + ': ' + j.description);
  return j;
}

// ---------- календарь кнопками ----------

function ym(y, m) { return y + '-' + String(m + 1).padStart(2, '0'); }

/* Клавиатура месяца: 7 колонок, выходной помечен точкой.
   Нажатие на день переключает его и сразу сохраняет — отдельной кнопки
   «Сохранить» нет намеренно, чтобы правку нельзя было потерять. */
function monthKeyboard(sched, y, m) {
  const key = ym(y, m);
  const off = new Set(sched.off[key] || []);
  const isOpen = Object.prototype.hasOwnProperty.call(sched.off, key);
  const first = (new Date(y, m, 1).getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();

  const rows = [[
    { text: 'Пн', callback_data: 'x' }, { text: 'Вт', callback_data: 'x' },
    { text: 'Ср', callback_data: 'x' }, { text: 'Чт', callback_data: 'x' },
    { text: 'Пт', callback_data: 'x' }, { text: 'Сб', callback_data: 'x' },
    { text: 'Вс', callback_data: 'x' },
  ]];

  let row = [];
  for (let i = 0; i < first; i++) row.push({ text: ' ', callback_data: 'x' });
  for (let d = 1; d <= dim; d++) {
    row.push({
      text: off.has(d) ? '·' + d + '·' : String(d),
      callback_data: 'd:' + key + ':' + d,
    });
    if (row.length === 7) { rows.push(row); row = []; }
  }
  if (row.length) {
    while (row.length < 7) row.push({ text: ' ', callback_data: 'x' });
    rows.push(row);
  }

  const prev = m === 0 ? ym(y - 1, 11) : ym(y, m - 1);
  const next = m === 11 ? ym(y + 1, 0) : ym(y, m + 1);
  rows.push([
    { text: '←', callback_data: 'm:' + prev },
    { text: isOpen ? '✅ месяц открыт' : '⛔ месяц закрыт', callback_data: 'o:' + key },
    { text: '→', callback_data: 'm:' + next },
  ]);
  return { inline_keyboard: rows };
}

function monthCaption(sched, y, m) {
  const key = ym(y, m);
  const off = sched.off[key];
  const head = '<b>' + MONTHS[m] + ' ' + y + '</b>';
  if (!off) {
    return head + '\n\nМесяц закрыт — на сайте написано, что график ещё не готов.\n' +
      'Нажмите «месяц закрыт», чтобы открыть его, потом отметьте выходные.';
  }
  const list = off.length ? off.join(', ') : 'пока нет';
  return head + '\n\nВыходные: <b>' + list + '</b>\n' +
    'Рабочих дней: ' + (new Date(y, m + 1, 0).getDate() - off.length) +
    '\n\nНажмите на число, чтобы сделать его выходным или рабочим.\n' +
    'Выходные помечены точками: ·5·';
}

async function showMonth(chatId, messageId, sched, y, m) {
  const payload = {
    chat_id: chatId,
    text: monthCaption(sched, y, m),
    parse_mode: 'HTML',
    reply_markup: monthKeyboard(sched, y, m),
  };
  if (messageId) {
    payload.message_id = messageId;
    return tg('editMessageText', payload);
  }
  return tg('sendMessage', payload);
}

// ---------- обработка Telegram ----------

async function handleTelegram(update) {
  const msg = update.message;
  const cb = update.callback_query;
  const from = (msg && msg.from) || (cb && cb.from);
  const chatId = (msg && msg.chat.id) || (cb && cb.message.chat.id);
  if (!from || !chatId) return;

  // график правит только мастер
  if (String(from.id) !== ADMIN) {
    if (msg) {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Это служебный бот студии «Море красок».\n\nЗаписаться: https://more-krasok.ru\nПозвонить: +7 950 207-43-02',
      });
    }
    return;
  }

  const sched = await loadSchedule();
  const now = new Date();

  if (msg && msg.text) {
    const cmd = msg.text.trim().toLowerCase().split('@')[0];
    if (cmd === '/start' || cmd === '/grafik' || cmd === '/график') {
      await showMonth(chatId, null, sched, now.getFullYear(), now.getMonth());
    } else {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Команды:\n/grafik — календарь, отметить выходные\n\n' +
          'Заявки с сайта приходят сюда автоматически.',
      });
    }
    return;
  }

  if (cb) {
    const data = cb.data || '';
    const messageId = cb.message.message_id;

    if (data === 'x') { await tg('answerCallbackQuery', { callback_query_id: cb.id }); return; }

    // переключить день
    if (data.startsWith('d:')) {
      const [, key, dStr] = data.split(':');
      const d = parseInt(dStr, 10);
      if (!sched.off[key]) {
        await tg('answerCallbackQuery', {
          callback_query_id: cb.id,
          text: 'Сначала откройте месяц кнопкой внизу',
          show_alert: true,
        });
        return;
      }
      const set = new Set(sched.off[key]);
      const nowOff = !set.has(d);
      if (nowOff) set.add(d); else set.delete(d);
      sched.off[key] = [...set].sort((a, b) => a - b);
      await saveSchedule(sched);

      const [yy, mm] = key.split('-').map(Number);
      await tg('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: d + ' ' + MGEN[mm - 1] + ' — ' + (nowOff ? 'выходной' : 'рабочий день'),
      });
      await showMonth(chatId, messageId, sched, yy, mm - 1);
      return;
    }

    // открыть/закрыть месяц
    if (data.startsWith('o:')) {
      const key = data.slice(2);
      if (sched.off[key]) delete sched.off[key]; else sched.off[key] = [];
      await saveSchedule(sched);
      const [yy, mm] = key.split('-').map(Number);
      await tg('answerCallbackQuery', {
        callback_query_id: cb.id,
        text: sched.off[key] ? 'Месяц открыт — отметьте выходные' : 'Месяц закрыт',
      });
      await showMonth(chatId, messageId, sched, yy, mm - 1);
      return;
    }

    // листание месяцев
    if (data.startsWith('m:')) {
      const [yy, mm] = data.slice(2).split('-').map(Number);
      await tg('answerCallbackQuery', { callback_query_id: cb.id });
      await showMonth(chatId, messageId, sched, yy, mm - 1);
      return;
    }
  }
}

// ---------- заявка с сайта ----------

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, max);
}

async function handleBooking(body) {
  const name = clean(body.name, 80);
  const phone = clean(body.phone, 30);
  const service = clean(body.service, 80);
  const date = clean(body.date, 20);
  const comment = clean(body.comment, 300);

  if (!name || !phone) return { ok: false, error: 'Укажите имя и телефон' };
  if (clean(body.website, 50)) return { ok: true };  // ловушка для ботов: поле скрыто от людей

  const lines = [
    '🔔 <b>Новая заявка с сайта</b>',
    '',
    '👤 ' + name,
    '📞 ' + phone,
  ];
  if (service) lines.push('💅 ' + service);
  if (date) lines.push('📅 ' + date);
  if (comment) lines.push('💬 ' + comment);

  await tg('sendMessage', {
    chat_id: ADMIN,
    text: lines.join('\n'),
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: '📞 Позвонить', url: 'tel:' + phone.replace(/[^\d+]/g, '') },
      ]],
    },
  });
  return { ok: true };
}

// ---------- диагностика ----------

/* Маршрут /diag проверяет, куда функция вообще может дозвониться.
   Возвращает только «получилось / не получилось» и время ответа —
   ни токена, ни ключей наружу не отдаёт. */
async function probe(name, url, opts) {
  const t0 = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 5000);
  try {
    const r = await fetch(url, Object.assign({ signal: ac.signal }, opts || {}));
    return { что: name, итог: 'ответил ' + r.status, мс: Date.now() - t0 };
  } catch (e) {
    return { что: name, итог: e.name === 'AbortError' ? 'таймаут 5 сек' : 'ошибка: ' + e.message, мс: Date.now() - t0 };
  } finally {
    clearTimeout(timer);
  }
}

async function handleDiag() {
  const out = { переменные: {}, связь: [], хранилище: null };
  out.переменные = {
    BUCKET: !!BUCKET,
    TG_TOKEN: !!TG_TOKEN,
    TG_ADMIN_ID: !!ADMIN,
    AWS_ACCESS_KEY_ID: !!process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: !!process.env.AWS_SECRET_ACCESS_KEY,
  };

  out.связь = await Promise.all([
    probe('api.telegram.org', 'https://api.telegram.org/bot' + TG_TOKEN + '/getMe'),
    probe('storage.yandexcloud.net', 'https://storage.yandexcloud.net/' + BUCKET + '/schedule.json'),
    probe('example.com (внешний интернет)', 'https://example.com'),
    probe('max.ru', 'https://botapi.max.ru/me'),
  ]);

  // запись в бакет — та самая связка, что ещё ни разу не проверялась
  try {
    const s = await loadSchedule();
    await saveSchedule(s);
    out.хранилище = 'чтение и запись работают';
  } catch (e) {
    out.хранилище = 'ошибка: ' + (e.name || '') + ' ' + e.message;
  }
  return out;
}

// ---------- точка входа ----------

module.exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': 'https://more-krasok.ru',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  let body = {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body || '', 'base64').toString('utf8')
      : (event.body || '');
    if (raw) body = JSON.parse(raw);
  } catch (e) {
    return { statusCode: 400, headers: cors, body: '{"ok":false}' };
  }

  const path = event.path || event.url || '';

  try {
    if (path.indexOf('/diag') !== -1) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify(await handleDiag(), null, 1),
      };
    }
    if (path.indexOf('/book') !== -1) {
      const res = await handleBooking(body);
      return {
        statusCode: res.ok ? 200 : 400,
        headers: Object.assign({ 'Content-Type': 'application/json' }, cors),
        body: JSON.stringify(res),
      };
    }
    // Telegram: всегда отвечаем 200, иначе он будет слать апдейт по кругу
    await handleTelegram(body);
    return { statusCode: 200, body: 'ok' };
  } catch (e) {
    console.error(e);
    if (path.indexOf('/book') !== -1) {
      return {
        statusCode: 500,
        headers: Object.assign({ 'Content-Type': 'application/json' }, cors),
        body: '{"ok":false,"error":"Не получилось отправить. Позвоните, пожалуйста."}',
      };
    }
    return { statusCode: 200, body: 'ok' };
  }
};
