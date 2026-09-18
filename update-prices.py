"""Разносит прайс из prices.json по сайту и ботам.

Цены и длительности раньше жили в трёх местах — на главной, в разметке
для поиска и в боте — и правились каждый раз вручную. Стоило забыть
одно место, и сайт показывал одну цену, а бот записывал на другую длительность.
Теперь правится только prices.json, а этот скрипт обновляет всё остальное:

    python update-prices.py

Что обновляется:
  - bot/worker.js       каталог для ботов и расчёта свободного времени
  - index.html          каталог на странице, полный прайс, выбор услуги в форме
  - index.html          услуги с ценами в разметке для поиска (schema.org)

После запуска бот нужно выложить заново (npx wrangler deploy из папки bot),
а сайт — просто запушить.
"""
import io
import json
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

SITE = 'https://more-krasok.ru'

data = json.load(io.open('prices.json', encoding='utf-8'))
cats = data['categories']

# ---- проверки: лучше упасть здесь, чем записать клиента на непонятную услугу ----
names = set()
for c in cats:
    for x in c['services']:
        assert x['n'] not in names, 'Услуга встречается дважды: ' + x['n']
        names.add(x['n'])
        assert isinstance(x['m'], int) and 5 <= x['m'] <= 600, 'Странная длительность у «%s»' % x['n']
        assert x['p'] is None or isinstance(x['p'], int), 'Цена должна быть числом у «%s»' % x['n']

compact = json.dumps(
    [{'name': c['name'], 'services': [{'n': x['n'], 'm': x['m'], 'p': x['p']} for x in c['services']]}
     for c in cats],
    ensure_ascii=False, separators=(',', ':'))


def replace_between(text, start_marker, end_marker, body, where):
    i = text.find(start_marker)
    j = text.find(end_marker, i)
    assert i != -1 and j != -1, 'Не найдены метки %s … %s в %s' % (start_marker, end_marker, where)
    return text[:i + len(start_marker)] + '\n' + body + '\n' + text[j:]


# ---- бот ----
p = 'bot/worker.js'
s = io.open(p, encoding='utf-8').read()
s = replace_between(
    s,
    '// >>> CATALOG — генерируется из prices.json скриптом update-prices.py, руками не править',
    '// <<< CATALOG',
    'const CATALOG = ' + compact + ';',
    p)
io.open(p, 'w', encoding='utf-8').write(s)

# ---- сайт: каталог для страницы ----
p = 'index.html'
s = io.open(p, encoding='utf-8').read()
s = replace_between(s, '/* >>> CATALOG из prices.json */', '/* <<< CATALOG */',
                    'var CATALOG=' + compact + ';', p)

# ---- сайт: карточки услуг ----
# Какие услуги стоят за каждой карточкой. Цена «от» и длительность
# считаются по ним, а не пишутся руками — иначе снова разъедутся с прайсом.
CARDS = [
    ('Маникюр', 'manikyur.html', 'svc-manicure',
     'Комбинированный и японский маникюр, покрытие гель-лак, наращивание.',
     {'names': ['Маникюр без покрытия (комбинированный)', 'Маникюр с покрытием гель-лак',
                'Маникюр с покрытием гель-лак + наращивание', 'Японский маникюр']}),
    ('Педикюр', 'pedikyur.html', 'svc-pedicure',
     'Комбинированный педикюр, покрытие гель-лак, полная обработка стоп.',
     {'names': ['Педикюр комбинированный (стопы и пальчики)', 'Педикюр + гель-лак (без обработки стоп)',
                'Педикюр комбинированный (полная обработка)']}),
    ('Окрашивание', 'okrashivanie-volos.html', 'svc-coloring',
     'В один тон и тонирование, корни, мелирование, комплексы со стрижкой.',
     {'cats': ['Окрашивание', 'Мелирование', 'Комплексы'], 'except': ['Окрашивание прядей (1 прядь)']}),
    ('Химзавивка', 'himicheskaya-zavivka.html', 'svc-perm',
     'Химическая завивка на короткие, средние и длинные волосы.',
     {'cats': ['Химическая завивка']}),
    ('Женская стрижка', 'strizhki.html', 'svc-haircut-women',
     'С учётом формы лица и пожеланий. Отдельная цена для густых волос.',
     {'names': ['Стрижка женская', 'Стрижка женская (густые волосы)']}),
    ('Мужская стрижка', 'strizhki.html', 'svc-haircut-men',
     'Классическая или под насадку.',
     {'names': ['Стрижка мужская (под насадку)', 'Стрижка мужская']}),
    ('Детская стрижка', 'strizhki.html', 'svc-haircut-kids',
     'Спокойно и аккуратно. Пенсионерам — та же цена.',
     {'names': ['Стрижка детская', 'Стрижка пенсионерам']}),
    ('Брови', 'brovi.html', 'svc-brows',
     'Коррекция, окрашивание или всё вместе.',
     {'cats': ['Брови']}),
]

by_name = {x['n']: x for c in cats for x in c['services']}


def pick(spec):
    if 'names' in spec:
        for n in spec['names']:
            assert n in by_name, 'Карточка ссылается на услугу, которой нет в прайсе: ' + n
        return [by_name[n] for n in spec['names']]
    out = [x for c in cats if c['name'] in spec['cats'] for x in c['services']]
    return [x for x in out if x['n'] not in spec.get('except', [])]


def hours(m):
    if m < 60:
        return '%d мин' % m
    h = m / 60
    return ('%g' % h).replace('.', ',') + ' ч'


def dur_range(ms):
    lo, hi = min(ms), max(ms)
    if lo == hi:
        return hours(lo)
    if lo >= 60:
        return hours(lo).replace(' ч', '') + '–' + hours(hi)
    return hours(lo) + ' – ' + hours(hi)


def price_label(items):
    # дополнительные услуги (снятие покрытия, одна прядь) в «от» не участвуют
    ps = [x['p'] for x in items if x['p'] is not None and not x.get('extra')]
    if not ps:
        return 'по запросу'
    lo = min(ps)
    return ('%d₽' % lo) if len(set(ps)) == 1 else ('от %d₽' % lo)


cards_html = []
for i, (title, href, img, desc, spec) in enumerate(CARDS):
    items = pick(spec)
    cards_html.append(
        '      <div class="card rv" style="--d:%.2fs">\n'
        '        <a class="go" href="%s" aria-label="Подробнее: %s">↗</a>\n'
        '        <div class="shot"><img src="images/%s.svg" alt="%s — студия «Море красок», Екатеринбург" '
        'width="560" height="420" loading="lazy"></div>\n'
        '        <div class="body"><h3><a href="%s">%s</a></h3><p class="desc">%s</p>\n'
        '        <div class="meta"><span class="price">%s</span><span class="dur">⏱ %s</span></div></div>\n'
        '      </div>'
        % ((i % 4) * 0.08, href, title, img, title, href, title, desc,
           price_label(items), dur_range([x['m'] for x in items])))
s = replace_between(s, '<!-- >>> CARDS из prices.json -->', '<!-- <<< CARDS -->', '\n'.join(cards_html), p)

# ---- сайт: полный прайс ----
# Обычная разметка, не скрипт: поиск читает исходный код, и прайс целиком
# с ценами — самое полезное, что он может найти на странице салона.
pl = ['    <div class="pricelist rv">',
      '      <h3 class="pl-title">Полный прайс</h3>',
      '      <p class="pl-note">Нажмите на раздел, чтобы раскрыть. Длина волос — до 15, до 30 и до 45 см.</p>']
for c in cats:
    lo = [x['p'] for x in c['services'] if x['p'] is not None and not x.get('extra')]
    pl.append('      <details class="pl-cat"><summary>%s<span>от %d ₽</span></summary>' % (c['name'], min(lo)))
    pl.append('        <table class="pl-table">')
    for x in c['services']:
        pl.append('          <tr><td>%s</td><td class="t">%s</td><td class="p">%s</td></tr>'
                  % (x['n'], hours(x['m']), 'по запросу' if x['p'] is None else '%d ₽' % x['p']))
    pl.append('        </table>')
    pl.append('      </details>')
pl.append('    </div>')
s = replace_between(s, '<!-- >>> PRICELIST из prices.json -->', '<!-- <<< PRICELIST -->', '\n'.join(pl), p)

# ---- сайт: разметка для поиска ----
m = re.search(r'(<script type="application/ld\+json">)(.*?)(</script>)', s, re.S)
ld = json.loads(m.group(2))
offers = []
prices = []
for c in cats:
    for x in c['services']:
        if x['p'] is None:
            continue
        prices.append(x['p'])
        offers.append({
            '@type': 'Offer',
            'itemOffered': {'@type': 'Service', 'name': x['n'], 'category': c['name']},
            'price': x['p'],
            'priceCurrency': 'RUB',
        })
ld['hasOfferCatalog'] = {
    '@type': 'OfferCatalog',
    'name': 'Услуги студии «Море красок»',
    'itemListElement': offers,
}
ld['priceRange'] = '%d–%d ₽' % (min(p for p in prices if p >= 250), max(prices))
s = s[:m.start(2)] + '\n' + json.dumps(ld, ensure_ascii=False, indent=2) + '\n' + s[m.end(2):]
io.open(p, 'w', encoding='utf-8').write(s)

total = sum(len(c['services']) for c in cats)
no_price = [x['n'] for c in cats for x in c['services'] if x['p'] is None]
print('Категорий: %d, услуг: %d' % (len(cats), total))
print('Обновлены: bot/worker.js, index.html (каталог и разметка для поиска)')
if no_price:
    print('Без цены (на сайте «по запросу»):', ', '.join(no_price))
print('Не забудьте выложить бота: cd bot && npx wrangler deploy')
