# -*- coding: utf-8 -*-
"""
Сборка страниц услуг.

Зачем отдельные страницы: одностраничник борется в поиске за один запрос.
Страница «Маникюр в Екатеринбурге» борется за свой, «Стрижки на Уралмаше» —
за свой. Для салона это главный способ занять место по запросам вида
«услуга + район», где конкуренция в разы меньше, чем по городу целиком.

Страницы собираются скриптом, а не пишутся руками: так у всех одинаковая
разметка, а правка цены в одном месте расходится по всем страницам сразу.
Запускать после изменения цен: python update-prices.py && python build-pages.py
"""
import io, json, os

SITE = 'https://more-krasok.ru'
PHONE = '+7 950 207-43-02'
PHONE_RAW = '+79502074302'
BOT = 'https://t.me/more_krasok_zapis_bot'
ADDR = 'Екатеринбург, ул. Донбасская, 4'
HOURS = '8:00 — 19:00'

# Цены, длительности и строки прайса берутся из prices.json — того же файла,
# из которого собираются главная и боты. Здесь только тексты страниц и то,
# какие услуги прайса относятся к странице. {from} в заголовке и описании
# подставляется автоматически — минимальной ценой по этим услугам.
PRICES = json.load(io.open('prices.json', encoding='utf-8'))['categories']
BY_NAME = {x['n']: x for c in PRICES for x in c['services']}


def pick(spec):
    if 'names' in spec:
        for n in spec['names']:
            assert n in BY_NAME, 'Страница ссылается на услугу, которой нет в прайсе: ' + n
        return [BY_NAME[n] for n in spec['names']]
    return [x for c in PRICES if c['name'] in spec['cats'] for x in c['services']]


def hours(m):
    if m < 60:
        return '%d мин' % m
    return ('%g' % (m / 60)).replace('.', ',') + ' ч'


PAGES = [
    dict(
        slug='manikyur',
        svc='svc-manicure',
        h1='Маникюр в Екатеринбурге на Уралмаше',
        title='Маникюр в Екатеринбурге — от {from} ₽ | Уралмаш, ул. Донбасская, 4',
        desc='Маникюр у мастера Анастасии в Екатеринбурге: комбинированный, японский, с покрытием гель-лак и наращиванием. От {from} ₽. Уралмаш, ул. Донбасская, 4. Запись онлайн.',
        lead='Комбинированный и японский маникюр, покрытие гель-лаком, наращивание. Работаю на проверенных профессиональных материалах.',
        items=dict(cats=['Маникюр']),
        includes=['Обработка ногтей и кутикулы',
                  'Придание формы по вашему желанию',
                  'Покрытие гель-лаком',
                  'Наращивание',
                  'Японский маникюр для укрепления ногтей'],
        about='Маникюр без покрытия занимает около получаса, с покрытием гель-лаком — около двух часов. '
              'Если ногти слоятся или ломаются, скажите об этом при записи: японский маникюр их укрепляет.',
        key='маникюр',
    ),
    dict(
        slug='pedikyur',
        svc='svc-pedicure',
        h1='Педикюр в Екатеринбурге на Уралмаше',
        title='Педикюр в Екатеринбурге — от {from} ₽ | Уралмаш, ул. Донбасская, 4',
        desc='Комбинированный педикюр в Екатеринбурге: обработка стоп и пальчиков, покрытие гель-лаком, полная обработка. От {from} ₽. Уралмаш, ул. Донбасская, 4. Запись онлайн.',
        lead='Комбинированный педикюр: обработка пальчиков и стоп, покрытие гель-лаком. Аккуратно и гигиенично.',
        items=dict(cats=['Педикюр']),
        includes=['Обработка ногтей и пальчиков',
                  'Обработка стоп',
                  'Покрытие гель-лаком по желанию',
                  'Полная обработка — всё вместе',
                  'Можно просто подстричь ногти'],
        about='Комбинированный педикюр совмещает аппаратную и классическую обработку. '
              'Полная обработка занимает около двух часов.',
        key='педикюр',
    ),
    dict(
        slug='okrashivanie-volos',
        svc='svc-coloring',
        h1='Окрашивание волос в Екатеринбурге на Уралмаше',
        title='Окрашивание волос в Екатеринбурге — от {from} ₽ | Уралмаш',
        desc='Окрашивание волос в Екатеринбурге: в один тон и тонирование, корни, мелирование, комплексы со стрижкой. От {from} ₽. Уралмаш, ул. Донбасская, 4.',
        lead='Окрашивание в один тон и тонирование, окрашивание корней, мелирование и комплексы со стрижкой. Цена зависит от длины волос — до 15, до 30 или до 45 см.',
        items=dict(cats=['Окрашивание', 'Мелирование', 'Комплексы']),
        includes=['Подбор оттенка',
                  'Профессиональные красители',
                  'Окрашивание корней или всей длины',
                  'Мелирование',
                  'Стрижка и окрашивание за один визит'],
        about='Цена зависит от длины волос: до 15, до 30 или до 45 см. '
              'Если сомневаетесь, какая у вас длина, — скажу на месте, до начала работы.',
        key='окрашивание волос',
    ),
    dict(
        slug='strizhki',
        svc='svc-haircut-women',
        h1='Стрижки в Екатеринбурге на Уралмаше',
        title='Стрижки в Екатеринбурге — женские, мужские, детские от {from} ₽ | Уралмаш',
        desc='Стрижки в Екатеринбурге на Уралмаше: мужская, женская, детская, пенсионерам. От {from} ₽. ул. Донбасская, 4. Запись онлайн.',
        lead='Женские, мужские и детские стрижки. Подстригу с учётом формы лица, структуры волос и того, сколько времени вы готовы тратить на укладку.',
        items=dict(cats=['Стрижки']),
        includes=['Стрижка с учётом формы лица',
                  'Отдельная цена для густых волос',
                  'Мужская классическая или под насадку',
                  'Подравнивание кончиков и чёлки',
                  'Стрижка занимает полчаса'],
        about='Стрижка занимает около получаса, поэтому её удобно поставить до работы или в обед. '
              'Детей стригу спокойно и без спешки — если ребёнок боится, скажите заранее.',
        key='стрижка',
    ),
    dict(
        slug='himicheskaya-zavivka',
        svc='svc-perm',
        h1='Химическая завивка в Екатеринбурге на Уралмаше',
        title='Химическая завивка волос в Екатеринбурге — от {from} ₽ | Уралмаш',
        desc='Химическая завивка волос в Екатеринбурге от {from} ₽ — на короткие, средние и длинные волосы. Уралмаш, ул. Донбасская, 4. Запись онлайн.',
        lead='Химическая завивка на волосы до 15, до 30 и до 45 см. Устойчивая форма, которая заметно упрощает укладку по утрам.',
        items=dict(cats=['Химическая завивка']),
        includes=['Подбор состава под тип волос',
                  'Размер локона по вашему желанию',
                  'Короткие, средние и длинные волосы',
                  'Рекомендации по уходу',
                  'Рекомендации по укладке'],
        about='Процедура занимает от двух до трёх часов в зависимости от длины. '
              'Какой размер локона подойдёт именно вам, скажу после того, как посмотрю волосы.',
        key='химическая завивка',
    ),
    dict(
        slug='brovi',
        svc='svc-brows',
        h1='Коррекция и окрашивание бровей в Екатеринбурге',
        title='Брови в Екатеринбурге — коррекция и окрашивание от {from} ₽ | Уралмаш',
        desc='Коррекция и окрашивание бровей в Екатеринбурге от {from} ₽. Подбор формы под черты лица. Уралмаш, ул. Донбасская, 4. Запись онлайн.',
        lead='Коррекция формы и окрашивание бровей — по отдельности или вместе. Подберу форму под черты лица, чтобы выглядело естественно.',
        items=dict(cats=['Брови']),
        includes=['Подбор формы под черты лица',
                  'Коррекция',
                  'Окрашивание с подбором оттенка',
                  'Естественный результат',
                  'От получаса'],
        about='Коррекция или окрашивание занимает полчаса, вместе — около часа. '
              'Если раньше форму задавали неудачно, скажите: отращивать придётся постепенно, но план подскажу.',
        key='брови',
    ),
]

# цены и длительность — из прайса, чтобы не расходились с сайтом и ботами
for _p in PAGES:
    _items = pick(_p['items'])
    # дополнительные услуги в «от» не участвуют: иначе маникюр был бы «от 200 ₽»
    _known = [x['p'] for x in _items if x['p'] is not None and not x.get('extra')]
    _p['price'] = min(_known)
    _p['prices'] = [(x['n'], 'по запросу' if x['p'] is None else '%d ₽' % x['p']) for x in _items]
    _lo, _hi = min(x['m'] for x in _items), max(x['m'] for x in _items)
    _p['dur'] = hours(_lo) if _lo == _hi else 'от %s до %s' % (hours(_lo), hours(_hi))
    _p['title'] = _p['title'].replace('{from}', str(_p['price']))
    _p['desc'] = _p['desc'].replace('{from}', str(_p['price']))

TPL = '''<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#faf7f4">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{site}/{slug}.html">
<meta name="geo.region" content="RU-SVE">
<meta name="geo.placename" content="Екатеринбург">
<meta name="geo.position" content="56.8773;60.6007">
<meta property="og:type" content="website">
<meta property="og:url" content="{site}/{slug}.html">
<meta property="og:title" content="{h1}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{site}/images/logo.jpg">
<meta property="og:locale" content="ru_RU">
<meta property="og:site_name" content="Море красок">

<script type="application/ld+json">
{schema}
</script>

<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Unbounded:wght@400;500;600&family=Manrope:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="css/page.css">

<!-- Yandex.Metrika counter -->
<script type="text/javascript">
    (function(m,e,t,r,i,k,a){{
        m[i]=m[i]||function(){{(m[i].a=m[i].a||[]).push(arguments)}};
        m[i].l=1*new Date();
        for (var j = 0; j < document.scripts.length; j++) {{if (document.scripts[j].src === r) {{ return; }}}}
        k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    }})(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=108994204', 'ym');
    ym(108994204, 'init', {{ssr:true, webvisor:true, clickmap:true, referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true}});
</script>
<noscript><div><img src="https://mc.yandex.ru/watch/108994204" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
</head>
<body>

<nav class="nav"><div class="wrap nav-in">
  <a class="nav-brand" href="/"><img src="images/logo.jpg" alt="Море красок" width="36" height="36">МОРЕ КРАСОК</a>
  <a class="nav-cta" href="/#booking">Записаться</a>
</div></nav>

<div class="wrap">
  <p class="crumbs"><a href="/">Главная</a> → {crumb}</p>

  <header class="head">
    <h1>{h1}</h1>
    <p class="lead">{lead}</p>
  </header>

  <div class="hero-img"><img src="images/{svc}.svg" alt="{crumb} — студия «Море красок», Екатеринбург, Уралмаш" width="560" height="420"></div>

  <div class="info">
    <div><b>Цена</b>от {price} ₽</div>
    <div><b>Длительность</b>{dur}</div>
    <div><b>Адрес</b>{addr}</div>
  </div>

  <section class="sec">
    <h2>Сколько стоит</h2>
    <table class="price-table"><tbody>
{price_rows}
    </tbody></table>
    <p style="margin-top:14px;color:#57534e;font-size:14px">Оплата наличными или картой на месте. Предоплата не нужна.</p>
  </section>

  <section class="sec">
    <h2>Что входит</h2>
    <ul class="checks">
{includes}
    </ul>
  </section>

  <section class="sec">
    <h2>Как проходит</h2>
    <p>{about}</p>
  </section>

  <div class="cta">
    <h3>Записаться на {key}</h3>
    <p>Выберите свободное время на сайте или напишите — отвечу в рабочие часы.</p>
    <div class="cta-btns">
      <a class="btn btn-main" href="/#booking">Выбрать время</a>
      <a class="btn btn-tg" href="{bot}" target="_blank" rel="noopener">Бот для записи</a>
      <a class="btn btn-ghost" href="tel:{phone_raw}">{phone}</a>
    </div>
  </div>

  <section class="sec">
    <h2>Где находится студия</h2>
    <p>{addr} — это Уралмаш. Работаю ежедневно с {hours}, по плавающему графику: свободные дни видно
    в <a href="/#booking" style="color:#b27d7d;font-weight:600">календаре на главной странице</a>.</p>
  </section>

  <section class="sec">
    <h2>Другие услуги</h2>
    <div class="other">
{others}
    </div>
  </section>
</div>

<footer class="foot"><div class="wrap">
  <p>Студия красоты «Море красок» · Мастер Анастасия</p>
  <p>{addr} · <a href="tel:{phone_raw}">{phone}</a></p>
  <div class="links"><a href="/">Главная</a><a href="/#booking">Запись</a><a href="/#faq">Вопросы</a></div>
</div></footer>

</body>
</html>
'''


def build():
    names = {p['slug']: p for p in PAGES}
    for p in PAGES:
        crumb = p['h1'].split(' в Екатеринбурге')[0].split(' и биозавивка')[0]

        rows = '\n'.join(
            '      <tr><td>%s</td><td>%s</td></tr>' % (a, b) for a, b in p['prices'])
        incl = '\n'.join('      <li>%s</li>' % x for x in p['includes'])

        others = []
        for q in PAGES:
            if q['slug'] == p['slug']:
                continue
            label = q['h1'].split(' в Екатеринбурге')[0].split(' и биозавивка')[0]
            others.append('      <a href="%s.html">%s <span>от %s ₽</span></a>' % (
                q['slug'], label, q['price']))
        others_html = '\n'.join(others)

        schema = json.dumps({
            "@context": "https://schema.org",
            "@type": "Service",
            "name": crumb,
            "serviceType": crumb,
            "description": p['desc'],
            "url": '%s/%s.html' % (SITE, p['slug']),
            "areaServed": {"@type": "City", "name": "Екатеринбург"},
            "provider": {
                "@type": "BeautySalon",
                "name": "Море красок",
                "telephone": PHONE_RAW,
                "url": SITE,
                "address": {
                    "@type": "PostalAddress",
                    "streetAddress": "ул. Донбасская, 4",
                    "addressLocality": "Екатеринбург",
                    "addressRegion": "Свердловская область",
                    "postalCode": "620012",
                    "addressCountry": "RU",
                },
            },
            "offers": {
                "@type": "Offer",
                "priceCurrency": "RUB",
                "priceSpecification": {
                    "@type": "PriceSpecification",
                    "minPrice": p['price'],
                    "priceCurrency": "RUB",
                },
            },
        }, ensure_ascii=False, indent=2)

        html = TPL.format(
            title=p['title'], desc=p['desc'], slug=p['slug'], site=SITE,
            h1=p['h1'], lead=p['lead'], svc=p['svc'], crumb=crumb,
            price=p['price'], dur=p['dur'], addr=ADDR, hours=HOURS,
            price_rows=rows, includes=incl, about=p['about'], key=p['key'],
            bot=BOT, phone=PHONE, phone_raw=PHONE_RAW,
            others=others_html, schema=schema,
        )
        io.open(p['slug'] + '.html', 'w', encoding='utf-8').write(html)
        print('  ', p['slug'] + '.html', len(html), 'байт')

    # карта сайта: главная плюс все страницы услуг
    import datetime
    today = datetime.date.today().isoformat()
    urls = ['  <url>\n    <loc>%s/</loc>\n    <lastmod>%s</lastmod>\n    <priority>1.0</priority>\n  </url>' % (SITE, today)]
    for p in PAGES:
        urls.append('  <url>\n    <loc>%s/%s.html</loc>\n    <lastmod>%s</lastmod>\n    <priority>0.8</priority>\n  </url>' % (SITE, p['slug'], today))
    # политика обработки данных — тоже в карте: на неё ведёт ссылка из формы
    urls.append('  <url>\n    <loc>%s/privacy.html</loc>\n    <lastmod>%s</lastmod>\n    <priority>0.3</priority>\n  </url>' % (SITE, today))
    io.open('sitemap.xml', 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(urls) + '\n</urlset>\n')
    print('   sitemap.xml —', len(PAGES) + 1, 'адресов')


if __name__ == '__main__':
    print('Собираю страницы услуг:')
    build()
