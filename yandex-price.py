"""Прайс для Яндекс Бизнеса из prices.json.

    python yandex-price.py

Получится yandex-price.xlsx. В кабинете Яндекс Бизнеса:
«Товары и услуги» → «Загрузить XLS/YML» → выбрать этот файл.
Колонки — как в выгрузке самого Бизнеса: Название, Цена, Категория, Описание.
"""
import io
import json
import sys

from openpyxl import Workbook

sys.stdout.reconfigure(encoding='utf-8')


def hours(m):
    if m < 60:
        return '%d мин' % m
    return ('%g' % (m / 60)).replace('.', ',') + ' ч'


cats = json.load(io.open('prices.json', encoding='utf-8'))['categories']
wb = Workbook()
ws = wb.active
ws.title = 'Прайс'
ws.append(['Название', 'Цена', 'Категория', 'Описание'])
n = 0
for c in cats:
    for x in c['services']:
        if x['p'] is None:
            continue
        ws.append([x['n'], x['p'], c['name'], 'Длительность около %s. Запись онлайн на more-krasok.ru' % hours(x['m'])])
        n += 1
for col, w in zip('ABCD', (52, 10, 20, 60)):
    ws.column_dimensions[col].width = w
wb.save('yandex-price.xlsx')
print('yandex-price.xlsx: %d услуг' % n)
