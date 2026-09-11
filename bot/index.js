'use strict';
/*
 * Функция в Яндекс Облаке. Две роли.
 *
 * 1. Посредник для сайта. Домен *.workers.dev заблокирован в России, поэтому
 *    браузер клиента не может обратиться к Cloudflare напрямую. Запрос
 *    приходит сюда и передаётся дальше.
 *
 * 2. Хранилище персональных данных. Закон требует, чтобы база с именами
 *    и телефонами россиян физически находилась в России. Имя, телефон
 *    и пометки лежат в закрытом бакете здесь, а в Cloudflare остаются
 *    только день, время и услуга — данные, по которым человека не опознать.
 *
 * Маршруты /pd/* закрыты общим секретом PD_KEY: его знают только эта функция
 * и воркер. Наружу они не выставляются.
 *
 * Переменные окружения:
 *   UPSTREAM       адрес воркера на Cloudflare
 *   PD_BUCKET      закрытый бакет для персональных данных
 *   PD_KEY         общий секрет с воркером
 *   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 */

const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const UPSTREAM = process.env.UPSTREAM || 'https://mk-bot.more-krasok-bot.workers.dev';
const PD_BUCKET = process.env.PD_BUCKET || 'more-krasok-clients';
const PD_KEY = process.env.PD_KEY || '';
const SITE = 'https://more-krasok.ru';

const s3 = new S3Client({ region: 'ru-central1', endpoint: 'https://storage.yandexcloud.net' });

const CORS = {
  'Access-Control-Allow-Origin': SITE,
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body, status, extra) {
  return {
    statusCode: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra || {}),
    body: typeof body === 'string' ? body : JSON.stringify(body),
  };
}

// ---------- персональные данные ----------

function pdKey(id) {
  return 'clients/' + String(id).replace(/[^0-9a-zA-Z_-]/g, '') + '.json';
}

async function pdPut(id, data) {
  await s3.send(new PutObjectCommand({
    Bucket: PD_BUCKET,
    Key: pdKey(id),
    Body: JSON.stringify(data),
    ContentType: 'application/json; charset=utf-8',
  }));
}

async function pdGet(id) {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: PD_BUCKET, Key: pdKey(id) }));
    return JSON.parse(await r.Body.transformToString());
  } catch (e) {
    if (e.name === 'NoSuchKey' || e.Code === 'NoSuchKey') return null;
    throw e;
  }
}

async function pdDel(id) {
  await s3.send(new DeleteObjectCommand({ Bucket: PD_BUCKET, Key: pdKey(id) }));
}

/* Забрать данные сразу по нескольким записям — планеру и списку записей
   нужны все имена за день, а не по одному. Запросы идут параллельно. */
async function pdMany(ids) {
  const out = {};
  await Promise.all(
    ids.map(async function (id) {
      try {
        out[id] = await pdGet(id);
      } catch (e) {
        out[id] = null;
      }
    }),
  );
  return out;
}

// ---------- посредник ----------

async function proxy(event, path) {
  const qs = event.queryStringParameters || {};
  const q = Object.keys(qs)
    .map(function (k) {
      return encodeURIComponent(k) + '=' + encodeURIComponent(qs[k]);
    })
    .join('&');

  const method = event.httpMethod || 'GET';
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event.body || '';

  const r = await fetch(UPSTREAM + path + (q ? '?' + q : ''), {
    method: method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'GET' || method === 'HEAD' ? undefined : raw,
  });
  const text = await r.text();
  const isHtml = (r.headers.get('content-type') || '').indexOf('text/html') !== -1;
  return {
    statusCode: r.status,
    headers: Object.assign(
      { 'Content-Type': r.headers.get('content-type') || 'application/json; charset=utf-8' },
      isHtml ? {} : CORS,
    ),
    body: text,
  };
}

// ---------- точка входа ----------

module.exports.handler = async (event) => {
  const path = event.path || event.url || '/';
  const method = event.httpMethod || 'GET';

  if (method === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };

  try {
    // хранилище персональных данных — только для воркера, по общему секрету
    if (path.indexOf('/pd/') === 0) {
      const given = (event.headers && (event.headers['X-Pd-Key'] || event.headers['x-pd-key'])) || '';
      if (!PD_KEY || given !== PD_KEY) return json({ error: 'нет доступа' }, 403);

      let body = {};
      try {
        const raw = event.isBase64Encoded
          ? Buffer.from(event.body || '', 'base64').toString('utf8')
          : event.body || '';
        if (raw) body = JSON.parse(raw);
      } catch (e) {
        return json({ error: 'тело запроса не разобрать' }, 400);
      }

      /* Действие берём из параметра пути, а не из самого пути.
         Шлюз с шаблоном /pd/{action} передаёт в функцию шаблон как есть —
         строка «/pd/{action}», а не «/pd/put». Сравнение с готовым путём
         не срабатывало, и функция отвечала «нет такого действия».
         Подстановка приходит в params; запасной вариант — разбор пути. */
      const action =
        (event.params && event.params.action) ||
        (event.pathParams && event.pathParams.action) ||
        path.split('/').pop();

      if (action === 'put') {
        await pdPut(body.id, { name: body.name || '', phone: body.phone || '', note: body.note || '' });
        return json({ ok: true });
      }
      if (action === 'get') {
        return json({ ok: true, data: await pdGet(body.id) });
      }
      if (action === 'many') {
        return json({ ok: true, data: await pdMany(body.ids || []) });
      }
      if (action === 'del') {
        await pdDel(body.id);
        return json({ ok: true });
      }
      return json({ error: 'нет такого действия: ' + action }, 404);
    }

    // всё остальное просто передаём на Cloudflare
    return await proxy(event, path);
  } catch (e) {
    console.error(e);
    return json({ ok: false, error: 'Сервис недоступен. Позвоните: +7 950 207-43-02' }, 500, CORS);
  }
};
