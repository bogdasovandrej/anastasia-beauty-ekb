'use strict';
/*
 * Тонкий посредник в Яндекс Облаке.
 *
 * Зачем он нужен. Домен `*.workers.dev` в России заблокирован: сайт
 * открывается (он на GitHub Pages), а обращения из браузера к серверу записи
 * не проходят — человек выбирает день и видит «позвоните». С включённым VPN
 * всё работает, но клиентам студии VPN никто не поставит.
 *
 * Переносить весь сервер обратно в Яндекс нельзя: оттуда недоступен Telegram.
 * Поэтому запросы клиентов идут через российский адрес, а он передаёт их
 * на Cloudflare, где живёт вся логика и база. Из дата-центра Яндекса
 * Cloudflare доступен — блокировка касается только браузеров в России.
 *
 * Никакой логики здесь нет намеренно: только передача запроса дальше.
 * Всё, что можно сломать, — уже сломано в одном месте, а не в двух.
 *
 * Переменная окружения:
 *   UPSTREAM — адрес воркера, например https://mk-bot.more-krasok-bot.workers.dev
 */

const UPSTREAM = process.env.UPSTREAM;

// наружу открыты только те пути, что нужны сайту; всё остальное — 404
const ALLOWED = ['/schedule.json', '/slots', '/busy', '/book'];

module.exports.handler = async (event) => {
  const cors = {
    'Access-Control-Allow-Origin': 'https://more-krasok.ru',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  const path = (event.path || event.url || '').split('?')[0];
  const route = ALLOWED.find((p) => path.endsWith(p));
  if (!route) {
    return { statusCode: 404, headers: cors, body: '{"error":"Неизвестный путь"}' };
  }

  // строку запроса передаём как есть: в ней день и услуга
  const qs = event.queryStringParameters
    ? '?' +
      Object.keys(event.queryStringParameters)
        .map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(event.queryStringParameters[k]))
        .join('&')
    : '';

  const body = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';

  try {
    const r = await fetch(UPSTREAM + route + qs, {
      method: event.httpMethod || 'GET',
      headers: {
        'Content-Type': 'application/json',
        // воркер по этому заголовку решает, кому разрешён доступ из браузера
        Origin: 'https://more-krasok.ru',
      },
      body: event.httpMethod === 'POST' ? body : undefined,
    });
    const text = await r.text();
    return {
      statusCode: r.status,
      headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors),
      body: text,
    };
  } catch (e) {
    console.error('Не достучались до воркера: ' + e.message);
    return {
      statusCode: 502,
      headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, cors),
      body: JSON.stringify({ ok: false, error: 'Сервис записи недоступен. Позвоните: +7 950 207-43-02' }),
    };
  }
};
