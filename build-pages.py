# -*- coding: utf-8 -*-
"""
Сборка страниц услуг.

Зачем отдельные страницы: одностраничник борется в поиске за один запрос.
Страница «Маникюр в Екатеринбурге» борется за свой, «Стрижки на Уралмаше» —
за свой. Для салона это главный способ занять место по запросам вида
«услуга + район», где конкуренция в разы меньше, чем по городу целиком.

Страницы собираются скриптом, а не пишутся руками: так у всех одинаковая
разметка, а правка цены в одном месте расходится по всем страницам сразу.
Запускать после изменения цен: python build-pages.py
"""
import io, json, os

SITE = 'https://more-krasok.ru'
PHONE = '+7 950 207-43-02'
PHONE_RAW = '+79502074302'
BOT = 'https://t.me/more_krasok_zapis_bot'
ADDR = 'Екатеринбург, ул. Донбасская, 4'
HOURS = '8:00 — 19:00'

PAGES = [
    dict(
        slug='manikyur',
        svc='svc-manicure',
        h1='Маникюр в Екатеринбурге на Уралмаше',
        title='Маникюр в Екатеринбурге — от 1000 ₽ | Уралмаш, ул. Донбасская, 4',
        desc='Маникюр у мастера Анастасии в Екатеринбурге: без покрытия 1000 ₽, с гель-лаком 1800 ₽, наращивание 2800 ₽. Уралмаш, ул. Донбасская, 4. Запись онлайн.',
        lead='Аккуратный маникюр с покрытием гель-лаком или без. Работаю на проверенных профессиональных материалах, инструмент стерилизую после каждого клиента.',
        price=1000,
        dur='около 2 часов',
        prices=[('Маникюр без покрытия', '1000 ₽'),
                ('Маникюр с покрытием гель-лак', '1800 ₽'),
                ('Наращивание с покрытием', '2800 ₽')],
        includes=['Обработка ногтей и кутикулы',
                  'Придание формы по вашему желанию',
                  'Покрытие гель-лаком с укреплением',
                  'Простой дизайн по договорённости',
                  'Стерильный инструмент'],
        about='Маникюр занимает около двух часов — этого хватает, чтобы сделать всё без спешки. '
              'Покрытие гель-лаком носится три-четыре недели. Если ногти слоятся или ломаются, '
              'скажите об этом при записи: подберём укрепление.',
        key='маникюр',
    ),
    dict(
        slug='pedikyur',
        svc='svc-pedicure',
        h1='Педикюр в Екатеринбурге на Уралмаше',
        title='Педикюр в Екатеринбурге — от 1000 ₽ | Уралмаш, ул. Донбасская, 4',
        desc='Аппаратный педикюр в Екатеринбурге: без покрытия 1000 ₽, с покрытием 1600 ₽, обработка стоп 1400 ₽. Уралмаш, ул. Донбасская, 4. Запись онлайн.',
        lead='Аппаратный педикюр с обработкой стоп. Аккуратно, гигиенично и без боли — в том числе если есть натоптыши или огрубевшая кожа.',
        price=1000,
        dur='около 2 часов',
        prices=[('Педикюр без покрытия', '1000 ₽'),
                ('Педикюр с покрытием', '1600 ₽'),
                ('Обработка стоп', '1400 ₽'),
                ('Педикюр с покрытием и обработкой стоп', '2500 ₽')],
        includes=['Аппаратная обработка ногтей и кожи',
                  'Удаление огрубевшей кожи и натоптышей',
                  'Покрытие гель-лаком по желанию',
                  'Уход за стопами',
                  'Стерильный инструмент'],
        about='Аппаратный педикюр мягче классического обрезного: кожа обрабатывается фрезой, '
              'без размачивания и лезвий. Держится дольше, а риск порезов исключён.',
        key='педикюр',
    ),
    dict(
        slug='okrashivanie-volos',
        svc='svc-coloring',
        h1='Окрашивание волос в Екатеринбурге на Уралмаше',
        title='Окрашивание волос в Екатеринбурге — от 1500 ₽ | Уралмаш',
        desc='Окрашивание волос в Екатеринбурге: корни 1500 ₽, в один тон и тонирование от 2000 ₽, мелирование от 2500 ₽. Уралмаш, ул. Донбасская, 4.',
        lead='Окрашивание в один тон, тонирование, окрашивание корней, мелирование и осветление. Подберу оттенок под ваш цветотип и состояние волос.',
        price=1500,
        dur='около 2 часов',
        prices=[('Окрашивание корней', '1500 ₽'),
                ('Окрашивание в один тон', 'от 2000 ₽'),
                ('Тонирование', 'от 2000 ₽'),
                ('Осветление корней', '2000 ₽'),
                ('Мелирование', 'от 2500 ₽'),
                ('Скрытое окрашивание, окрашивание прядей', 'от 1500 ₽')],
        includes=['Подбор оттенка под цветотип',
                  'Профессиональные красители',
                  'Окрашивание корней или всей длины',
                  'Мелирование и сложные техники',
                  'Уход после окрашивания'],
        about='Итоговая стоимость зависит от длины и густоты волос и от того, сколько нужно красителя. '
              'На консультации перед работой скажу точную сумму — сюрпризов в конце не будет.',
        key='окрашивание волос',
    ),
    dict(
        slug='strizhki',
        svc='svc-haircut-women',
        h1='Стрижки в Екатеринбурге на Уралмаше',
        title='Стрижки в Екатеринбурге — женские, мужские, детские от 300 ₽ | Уралмаш',
        desc='Стрижки в Екатеринбурге на Уралмаше: мужская 300 ₽, детская и пенсионерам 400 ₽, женская от 600 ₽. ул. Донбасская, 4. Запись онлайн.',
        lead='Женские, мужские и детские стрижки. Подстригу с учётом формы лица, структуры волос и того, сколько времени вы готовы тратить на укладку.',
        price=300,
        dur='30 минут',
        prices=[('Мужская стрижка', '300 ₽'),
                ('Детская стрижка', '400 ₽'),
                ('Стрижка пенсионерам', '400 ₽'),
                ('Женская стрижка', 'от 600 ₽'),
                ('Стрижка чёлки, подравнивание кончиков', 'от 200 ₽')],
        includes=['Стрижка с учётом формы лица',
                  'Совет по укладке дома',
                  'Спокойная обстановка для детей',
                  'Подравнивание кончиков и чёлки',
                  'Стрижка занимает полчаса'],
        about='Стрижка занимает около получаса, поэтому её удобно поставить до работы или в обед. '
              'Детей стригу спокойно и без спешки — если ребёнок боится, скажите заранее.',
        key='стрижка',
    ),
    dict(
        slug='himicheskaya-zavivka',
        svc='svc-perm',
        h1='Химическая завивка и биозавивка в Екатеринбурге',
        title='Химическая завивка волос в Екатеринбурге — от 3000 ₽ | Уралмаш',
        desc='Химическая завивка и биозавивка волос в Екатеринбурге от 3000 ₽. Уралмаш, ул. Донбасская, 4. Устойчивая форма надолго. Запись онлайн.',
        lead='Биозавивка и классическая химическая завивка. Устойчивая форма, которая держится месяцами и заметно упрощает укладку по утрам.',
        price=3000,
        dur='около 2 часов',
        prices=[('Химическая завивка', 'от 3000 ₽'),
                ('Биозавивка', 'от 3000 ₽')],
        includes=['Подбор состава под тип волос',
                  'Классическая или биозавивка',
                  'Размер локона по вашему желанию',
                  'Уход после процедуры',
                  'Рекомендации по укладке'],
        about='Биозавивка бережнее классической: состав мягче и меньше сушит волосы. '
              'Какой вариант подойдёт именно вам, скажу после того, как посмотрю волосы.',
        key='химическая завивка',
    ),
    dict(
        slug='brovi',
        svc='svc-brows',
        h1='Коррекция и окрашивание бровей в Екатеринбурге',
        title='Брови в Екатеринбурге — коррекция и окрашивание от 800 ₽ | Уралмаш',
        desc='Коррекция и окрашивание бровей в Екатеринбурге от 800 ₽. Подбор формы под черты лица. Уралмаш, ул. Донбасская, 4. Запись онлайн.',
        lead='Коррекция формы и окрашивание бровей. Подберу форму под черты лица — так, чтобы выглядело естественно, а не нарисованно.',
        price=800,
        dur='30 минут',
        prices=[('Коррекция бровей', 'от 800 ₽'),
                ('Коррекция и окрашивание', 'от 800 ₽')],
        includes=['Подбор формы под черты лица',
                  'Коррекция',
                  'Окрашивание с подбором оттенка',
                  'Естественный результат',
                  'Занимает полчаса'],
        about='Полчаса — и лицо выглядит собраннее без макияжа. Если раньше форму задавали неудачно, '
              'скажите: отращивать придётся постепенно, но план подскажу.',
        key='брови',
    ),
]

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
    io.open('sitemap.xml', 'w', encoding='utf-8').write(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + '\n'.join(urls) + '\n</urlset>\n')
    print('   sitemap.xml —', len(PAGES) + 1, 'адресов')


if __name__ == '__main__':
    print('Собираю страницы услуг:')
    build()
