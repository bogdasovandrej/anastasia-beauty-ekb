# Настройка домена anastasia-beauty-ekb.ru на Vercel

## Текущая ситуация

Сайт доступен по временному домену Vercel:
- https://beauty-website-8cywu2oiz-bogdasovandrejs-projects.vercel.app/

Но вам нужен ваш домен:
- https://anastasia-beauty-ekb.ru/

## Решение: Добавить домен в Vercel

### Шаг 1: Войдите в Vercel Dashboard

1. Откройте https://vercel.com/dashboard
2. Войдите в свой аккаунт
3. Выберите проект `anastasia-beauty-ekb`

### Шаг 2: Добавьте домен

1. Перейдите в **Settings** → **Domains**
2. Нажмите **Add**
3. Введите: `anastasia-beauty-ekb.ru`
4. Нажмите **Add**

### Шаг 3: Настройка DNS

Vercel покажет вам инструкции по настройке DNS. Есть два варианта:

#### Вариант А: Использовать Vercel DNS (рекомендуется)

1. Vercel предоставит NS-серверы:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```

2. На reg.ru:
   - Войдите в панель управления reg.ru
   - Найдите домен `anastasia-beauty-ekb.ru`
   - Найдите раздел "DNS-серверы" или "NS-серверы"
   - Измените NS-серверы на:
     ```
     ns1.vercel-dns.com
     ns2.vercel-dns.com
     ```
   - Сохраните изменения

#### Вариант Б: Использовать A-записи (если DNS остается на reg.ru)

1. На reg.ru добавьте записи:

   ```
   Тип: A
   Имя: @
   Адрес: 76.76.21.21
   
   Тип: A
   Имя: @
   Адрес: 76.76.21.1
   
   Тип: A
   Имя: @
   Адрес: 76.76.21.10
   
   Тип: A
   Имя: @
   Адрес: 76.76.21.15
   
   Тип: CNAME
   Имя: www
   Адрес: cname.vercel-dns.com
   ```

### Шаг 4: Ожидайте распространения DNS

- **Время:** от 1 часа до 48 часов
- **Обычно:** 1-4 часа
- Статус в Vercel изменится с "Pending" на "Active"

### Шаг 5: HTTPS включится автоматически

После того как DNS распространится:
- HTTPS включится автоматически через Let's Encrypt
- Это занимает 10-30 минут после активации DNS

## Проверка что все работает

### Способ 1: Vercel Dashboard

1. Откройте **Settings** → **Domains**
2. Статус должен быть зеленым "Active"

### Способ 2: DNS Checker

1. Откройте https://dnschecker.org/
2. Введите: `anastasia-beauty-ekb.ru`
3. Выберите тип: **A**
4. Нажмите "Check"
5. Если видите IP 76.76.x.x — DNS работает

### Способ 3: Командная строка

```cmd
nslookup anastasia-beauty-ekb.ru
```

Или:

```cmd
ping anastasia-beauty-ekb.ru
```

## Частые проблемы

### Проблема: "Pending Verification"
**Причина:** DNS еще не распространился
**Решение:** Подождать 1-4 часа

### Проблема: "Invalid Configuration"
**Причина:** Неправильная настройка DNS
**Решение:** Проверьте NS-серверы или A-записи

### Проблема: Сайт не открывается по домену
**Причина:** DNS еще не распространился
**Решение:** Используйте временный домен Vercel пока DNS не распространится

## Временное решение

Пока настраиваете домен, используйте временный:
- https://beauty-website-8cywu2oiz-bogdasovandrejs-projects.vercel.app/

Этот домен работает сразу после деплоя.

## После настройки домена

1. Сайт будет доступен по: https://anastasia-beauty-ekb.ru/
2. HTTPS включится автоматически
3. Все деплои будут обновляться автоматически через GitHub

## Контакты для поддержки

- **Vercel Support:** https://vercel.com/support
- **Reg.ru поддержка:** https://www.reg.ru/support