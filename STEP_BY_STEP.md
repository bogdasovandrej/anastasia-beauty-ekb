# 🚀 Пошаговая инструкция: Регистрация и настройка beauty-evryone.online

## Шаг 1: Регистрация на reg.ru

1. Зайдите на [reg.ru](https://reg.ru)
2. Нажмите **"Войти"** → **"Регистрация"**
3. Заполните:
   - Email
   - Пароль
   - Телефон (для подтверждения)
4. Подтвердите email и телефон

## Шаг 2: Покупка домена

1. В поиске введите: `beauty-evryone.online`
2. Нажмите **"Зарегистрировать"**
3. Выберите срок регистрации: **1 год**
4. Цена: **1₽** (акционная цена)
5. Нажмите **"Продолжить"**
6. Заполните данные (можно без ИП/ООО для .online домена)
7. Оплатите (можно картой или через СБП)
8. Домен активируется автоматически

## Шаг 3: Настройка DNS на reg.ru

### 3.1 Получите DNS-серверы Vercel

1. Зайдите на [vercel.com](https://vercel.com)
2. Создайте проект (или импортируйте существующий)
3. Перейдите в **"Settings"** → **"Domains"**
4. Нажмите **"Add Domain"**
5. Введите: `beauty-evryone.online`
6. Нажмите **"Add"**
7. Vercel покажет DNS-серверы:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```

### 3.2 Настройте NS-серверы на reg.ru

1. Зайдите в личный кабинет reg.ru
2. Перейдите в **"Мои домены"**
3. Найдите `beauty-evryone.online`
4. Нажмите **"Управление доменом"**
5. Перейдите в раздел **"DNS-серверы"**
6. Выберите **"Указать свои NS-серверы"**
7. Введите:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```
8. Нажмите **"Изменить"**

### 3.3 Добавьте поддомен www (опционально)

1. В Vercel: **"Settings"** → **"Domains"**
2. Нажмите **"Add Domain"**
3. Введите: `www.beauty-evryone.online`
4. Нажмите **"Add"**

5. В reg.ru: **"DNS-записи"** → **"Добавить запись"**
6. Выберите тип: **CNAME**
7. Заполните:
   - **Имя:** www
   - **Значение:** cname.vercel-dns.com
8. Нажмите **"Добавить запись"**

## Шаг 4: Загрузка сайта на Vercel

### Вариант А: Через GitHub (рекомендуется)

#### 4.1 Создайте репозиторий на GitHub

1. Зайдите на [github.com](https://github.com)
2. Нажмите **"+"** → **"New repository"**
3. Назовите: `beauty-evryone`
4. Сделайте **Public**
5. Нажмите **"Create repository"**

#### 4.2 Загрузите файлы

**Способ 1: Через GitHub Desktop**

1. Скачайте [GitHub Desktop](https://desktop.github.com)
2. Откройте папку `beauty-website`
3. Нажмите **"Create a repository"**
4. Назовите `beauty-evryone`
5. Нажмите **"Publish repository"**

**Способ 2: Через терминал**

```bash
cd beauty-website
git init
git add .
git commit -m "Initial commit: beauty website"
git remote add origin https://github.com/ВАШ_НИКNAME/beauty-evryone.git
git push -u origin main
```

#### 4.3 Подключите к Vercel

1. Зайдите на [vercel.com](https://vercel.com)
2. Нажмите **"Add New..."** → **"Project"**
3. Выберите репозиторий `beauty-evryone`
4. Нажмите **"Import"**
5. Нажмите **"Deploy"**

### Вариант Б: Без GitHub (просто перетаскивание)

1. Зайдите на [vercel.com](https://vercel.com)
2. Нажмите **"Add New..."** → **"Project"**
3. Перетащите папку `beauty-website` в интерфейс
4. Нажмите **"Deploy"**

## Шаг 5: Подключение домена к Vercel

1. В Vercel: выберите проект → **"Settings"** → **"Domains"**
2. Нажмите **"Add Domain"**
3. Введите: `beauty-evryone.online`
4. Нажмите **"Add"**
5. Подождите 1-2 минуты (Vercel проверит DNS)
6. Если всё правильно — домен появится в списке

## Шаг 6: Включение HTTPS

1. В Vercel: **"Settings"** → **"Domains"**
2. Нажмите на ваш домен `beauty-evryone.online`
3. Включите **"Force HTTPS"**
4. Нажмите **"Save"**

## Шаг 7: Проверка

### Проверьте:

1. **Локально:**
   ```bash
   cd beauty-website
   python -m http.server 8000
   # Откройте http://localhost:8000
   ```

2. **Vercel URL:**
   - Откройте ваш временный URL на Vercel
   - Проверьте, что сайт отображается

3. **Домен:**
   - Откройте `https://beauty-evryone.online`
   - Проверьте, что сайт загружается
   - Проверьте, что HTTPS работает (зелёный замочек в браузере)

4. **Форму:**
   - Заполните форму записи
   - Проверьте email на Formspree (должно прийти письмо)

## Время активации DNS

DNS-изменения могут занять от **1 часа до 48 часов**. Обычно работает через **1-2 часа**.

Если сайт не открывается:
1. Подождите ещё
2. Проверьте через [whatsmydns.net](https://whatsmydns.net)
3. Убедитесь, что NS-серверы правильные

## Итоговый чек-лист

- [ ] Домен `beauty-evryone.online` куплен на reg.ru
- [ ] DNS-серверы настроены на Vercel
- [ ] Сайт загружен на Vercel
- [ ] Домен подключён к Vercel
- [ ] HTTPS включён
- [ ] Сайт открывается по `https://beauty-evryone.online`
- [ ] Форма отправляет заявки на email

## Полезные ссылки

- [reg.ru](https://reg.ru) — регистрация домена
- [vercel.com](https://vercel.com) — хостинг сайта
- [github.com](https://github.com) — репозиторий кода
- [formspree.io](https://formspree.io) — отправка форм
- [whatsmydns.net](https://whatsmydns.net) — проверка DNS

---

**Удачи с запуском сайта! 🎉**