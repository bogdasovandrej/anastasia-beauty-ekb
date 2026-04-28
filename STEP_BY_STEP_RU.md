# 🚀 Пошаговая инструкция: Настройка beauty-evryone.ru

## Шаг 1: Покупка домена beauty-evryone.ru

1. Зайдите на [reg.ru](https://reg.ru)
2. В поиске введите: `beauty-evryone.ru`
3. Нажмите **"Зарегистрировать"**
4. Выберите срок: **1 год**
5. Цена: **~226₽** (со скидкой ~169₽)
6. Заполните данные и оплатите
7. Домен активируется автоматически

## Шаг 2: Загрузка сайта на Vercel

### Вариант А: Через GitHub Desktop (проще всего)

1. **Скачайте GitHub Desktop:**
   - [https://desktop.github.com](https://desktop.github.com)

2. **Откройте папку сайта:**
   - Файл → Add Local Repository
   - Выберите: `C:\Users\bogda\Desktop\beauty-website`

3. **Создайте репозиторий:**
   - File → New Repository
   - Name: `beauty-evryone`
   - Description: `Сайт для Анастасии Викторовны`
   - Public
   - Create Repository

4. **Опубликуйте:**
   - Вверху нажмите "Publish repository"
   - Создайте аккаунт GitHub если нужно

### Вариант Б: Через терминал

Откройте PowerShell в папке `beauty-website` и выполните:

```powershell
git init
git add .
git commit -m "Initial commit: beauty website"
git remote add origin https://github.com/ВАШ_НИКNAME/beauty-evryone.git
git push -u origin main
```

### Вариант В: Без Git (просто файлы)

1. Зайдите на [vercel.com](https://vercel.com)
2. Нажмите **"Add New..."** → **"Project"**
3. Перетащите папку `C:\Users\bogda\Desktop\beauty-website` в интерфейс
4. Нажмите **"Deploy"**

## Шаг 3: Подключение домена beauty-evryone.ru к Vercel

### 3.1 Получите DNS-серверы Vercel

1. Зайдите на [vercel.com](https://vercel.com)
2. Выберите ваш проект
3. Перейдите в **"Settings"** → **"Domains"**
4. Нажмите **"Add Domain"**
5. Введите: `beauty-evryone.ru`
6. Нажмите **"Add"**
7. Vercel покажет DNS-серверы:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```

### 3.2 Настройте DNS на reg.ru

1. Зайдите в личный кабинет [reg.ru](https://reg.ru)
2. Перейдите в **"Мои домены"**
3. Найдите `beauty-evryone.ru`
4. Нажмите **"Управление доменом"**
5. Перейдите в раздел **"DNS-серверы"**
6. Выберите **"Указать свои NS-серверы"**
7. Введите:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```
8. Нажмите **"Изменить"**

### 3.3 Добавьте www (опционально)

1. В Vercel: **"Settings"** → **"Domains"**
2. Нажмите **"Add Domain"**
3. Введите: `www.beauty-evryone.ru`
4. Нажмите **"Add"**

5. В reg.ru: **"DNS-записи"** → **"Добавить запись"**
6. Тип: **CNAME**
7. Заполните:
   - **Имя:** www
   - **Значение:** cname.vercel-dns.com
8. Нажмите **"Добавить запись"**

## Шаг 4: Включение HTTPS

1. В Vercel: **"Settings"** → **"Domains"**
2. Нажмите на `beauty-evryone.ru`
3. Включите **"Force HTTPS"**
4. Нажмите **"Save"**

## Шаг 5: Проверка

### Проверьте:

1. **Локально:**
   ```powershell
   cd C:\Users\bogda\Desktop\beauty-website
   python -m http.server 8000
   # Откройте http://localhost:8000
   ```

2. **Vercel URL:**
   - Откройте временный URL на Vercel
   - Проверьте сайт

3. **Домен:**
   - Откройте `https://beauty-evryone.ru`
   - Проверьте HTTPS (зелёный замочек)

4. **Форму:**
   - Заполните форму
   - Проверьте email на Formspree

## ⏱ Время активации DNS

DNS-изменения занимают от **1 часа до 48 часов**. Обычно работает через **1-2 часа**.

Если сайт не открывается:
1. Подождите ещё
2. Проверьте через [whatsmydns.net](https://whatsmydns.net)
3. Убедитесь, что NS-серверы правильные

## 💰 Итоговая стоимость

| Услуга | Цена |
|--------|------|
| Домен beauty-evryone.ru (1 год) | ~169₽ |
| Vercel хостинг | Бесплатно |
| Формспри | Бесплатно (50 отправлений/мес) |
| **Итого:** | **~169₽ в год** |

## ✅ Чек-лист

- [ ] Домен beauty-evryone.ru куплен на reg.ru
- [ ] Сайт загружен на Vercel
- [ ] DNS-серверы настроены на Vercel
- [ ] Домен подключён к Vercel
- [ ] HTTPS включён
- [ ] Сайт открывается по https://beauty-evryone.ru
- [ ] Форма отправляет заявки

## 📞 Контакты в сайте

- Телефон: +7 950 207 43 02
- Адрес: г. Екатеринбург, ул. Донбасская, 4
- Formspree: maqarovr

---

**Удачи с запуском! 🎉**