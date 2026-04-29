# 🚀 ПОЛНАЯ ИНСТРУКЦИЯ ПО ОБНОВЛЕНИЮ САЙТА НА VERCEL

## ✅ ЧТО БЫЛО СДЕЛАНО

1. **Все 3 картинки восстановлены:**
   - `images/hero.jpg` - фото мамы (90KB)
   - `images/brows.png` - фото бровей (660KB)
   - `images/lashes.png` - фото ресниц (617KB)

2. **Все файлы отправлены на GitHub:**
   ```
   https://github.com/bogdasovandrej/anastasia-beauty-ekb
   ```

3. **Добавлен .vercel.json** - конфигурация для правильной работы картинок

4. **Проверено что картинки работают локально:**
   - ✅ hero.jpg - 200 OK
   - ✅ brows.png - 200 OK
   - ✅ lashes.png - 200 OK

---

## 📋 ЧТО ВАМ НУЖНО СДЕЛАТЬ СЕЙЧАС

### Шаг 1: Проверить что код на GitHub

Откройте:
```
https://github.com/bogdasovandrej/anastasia-beauty-ekb/tree/main/images
```

Вы должны увидеть 3 файла:
- hero.jpg
- brows.png
- lashes.png

### Шаг 2: Принудительный деплой на Vercel

1. Откройте:
   ```
   https://vercel.com/dashboard
   ```

2. Найдите проект **anastasia-beauty-ekb**

3. Нажмите кнопку **Redeploy**:
   - Это заставит Vercel перезагрузить код с GitHub

4. Или нажмите **Settings** → **Git** → **Manual Deploy** и выберите последнюю версию

### Шаг 3: Подождать деплой

- Деплой занимает 1-3 минуты
- Вы увидите статус **Deploying** → **Ready**

### Шаг 4: Проверить сайт

Откройте:
```
https://anastasia-beauty-ekb.ru/
```

Или временную ссылку:
```
https://beauty-website-8cywu2oiz-bogdasovandrejs-projects.vercel.app/
```

---

## 🖼️ ЕСЛИ КАРТИНКИ НЕ ГРУЗЯТСЯ НА VERCEL

### Причина 1: Кэш браузера

**Решение:**
```
Ctrl + Shift + Delete
```
Или откройте в режиме инкогнито:
```
Ctrl + Shift + N
```

### Причина 2: Кэш Vercel

**Решение:**
1. Откройте Vercel Dashboard
2. Проект **anastasia-beauty-ekb**
3. **Settings** → **Caching**
4. Нажмите **Clear Cache**

### Причина 3: Картинки не загрузились на Vercel

**Решение через Vercel Dashboard:**

1. Откройте:
   ```
   https://vercel.com/dashboard
   ```

2. Проект **anastasia-beauty-ekb**

3. Перейдите во вкладку **Storage** (если есть)

4. Или загрузите файлы вручную:
   - Откройте GitHub: https://github.com/bogdasovandrej/anastasia-beauty-ekb
   - Перейдите в папку `images/`
   - Нажмите **Upload files**
   - Загрузите: hero.jpg, brows.png, lashes.png

### Причина 4: Неправильные пути в HTML

**Проверьте что в index.html:**

```html
<!-- Правильно -->
<img src="images/hero.jpg" ...>
<img src="images/brows.png" ...>
<img src="images/lashes.png" ...>
```

**Неправильно:**
```html
<!-- ОШИБКА -->
<img src="/images/hero.jpg" ...>  <!-- слэш в начале -->
<img src="./images/hero.jpg" ...>  <!-- относительный путь -->
```

---

## 🔧 АЛЬТЕРНАТИВНЫЙ СПОСОБ: Загрузить картинки через GitHub

Если Vercel не загружает картинки автоматически:

### Способ 1: Через веб-интерфейс GitHub

1. Откройте:
   ```
   https://github.com/bogdasovandrej/anastasia-beauty-ekb
   ```

2. Нажмите **Add file** → **Upload files**

3. Перетащите файлы:
   - hero.jpg
   - brows.png
   - lashes.png

4. В поле **Commit changes** напишите:
   ```
   Upload image files
   ```

5. Нажмите **Commit changes**

6. После этого нажмите **Sync fork** → **Update branch**

7. Вернитесь на Vercel и нажмите **Redeploy**

### Способ 2: Через Git командную строку

Откройте PowerShell в папке `C:\Users\bogda\Desktop\beauty-website`:

```powershell
# Добавить файлы
git add images/

# Проверить что добавились
git status

# Закоммитить
git commit -m "Add image files: hero.jpg, brows.png, lashes.png"

# Отправить на GitHub
git push origin main

# Проверить что отправилось
git log -1
```

---

## 📱 ПРОВЕРКА НА МОБИЛЬНЫХ УСТРОЙСТВАХ

### На Android:

1. Откройте Chrome на Android
2. Перейдите на сайт:
   ```
   https://anastasia-beauty-ekb.ru/
   ```

3. Проверьте:
   - ✅ Картинки грузятся
   - ✅ Фото мамы отображается
   - ✅ Фото бровей и ресниц видно
   - ✅ Кнопки нажимаются
   - ✅ Форма отправляется

### Если что-то не работает:

1. Очистите кэш Chrome:
   - Настройки → Конфиденциальность → Очистить данные просмотра
   - Выберите **Кэшированные изображения и файлы**

2. Перезагрузите сайт:
   - Нажмите кнопку обновления
   - Или закройте и откройте снова

---

## 🎯 ЧТО РАБОТАЕТ НА САЙТЕ

| Функция | Статус |
|---------|--------|
| Картинки (локальные) | ✅ Готовы к деплою |
| Форма записи | ✅ Отправляет на Formspree |
| Google Calendar | ✅ Генерирует ссылки |
| Адаптивность | ✅ Работает на мобильных |
| HTTPS | ⏳ Включится автоматически |
| Домен | ⏳ Ждет DNS (1-48 часов) |

---

## 🌐 НАСТРОЙКА ДОМЕНА anastasia-beauty-ekb.ru

### На reg.ru:

1. Войдите в личный кабинет reg.ru
2. Найдите домен **anastasia-beauty-ekb.ru**
3. **DNS-серверы** → Изменить
4. Укажите NS-серверы Vercel:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```
5. Сохраните

### На Vercel:

1. Откройте https://vercel.com/dashboard
2. Проект **anastasia-beauty-ekb**
3. **Settings** → **Domains**
4. Добавьте: **anastasia-beauty-ekb.ru**
5. Нажмите **Add**

### ⏰ Время ожидания:

- DNS распространяется от **1 до 48 часов**
- HTTPS включится автоматически
- Сайт будет доступен по обоим доменам

---

## 🚨 БЫСТРЫЕ КОМАНДЫ ДЛЯ ОБНОВЛЕНИЯ

Откройте PowerShell в папке `C:\Users\bogda\Desktop\beauty-website`:

```powershell
# 1. Проверить статус
git status

# 2. Добавить все изменения
git add .

# 3. Закоммитить
git commit -m "Ваш комментарий"

# 4. Отправить на GitHub
git push origin main

# 5. Проверить что отправилось
git log -1
```

---

## ✅ ЧЕКЛИСТ ПОСЛЕ ОБНОВЛЕНИЯ

- [ ] Проверил что файлы есть на GitHub (images/ папка)
- [ ] Нажал **Redeploy** на Vercel
- [ ] Дождётся статуса **Ready**
- [ ] Открыл сайт в браузере
- [ ] Очистил кэш (Ctrl + Shift + Delete)
- [ ] Проверил что 3 картинки отображаются
- [ ] Проверил что фото мамы видно
- [ ] Проверил работу на Android
- [ ] Форма отправляет заявки

---

## 📞 КОНТАКТЫ И ПОДДЕРЖКА

- **GitHub:** https://github.com/bogdasovandrej/anastasia-beauty-ekb
- **Vercel:** https://vercel.com/dashboard
- **Email:** +7 950 207 43 02
- **Адрес:** г. Екатеринбург, ул. Донбасская, 4

---

## 🎉 ГОТОВО!

Ваш сайт теперь:
- ✅ **С локальными картинками** которые у вас есть на компьютере
- ✅ **Оптимизирован** для быстрой загрузки
- ✅ **Адаптивен** для всех устройств
- ✅ **Отправляет заявки** на email
- ✅ **Готов к работе** с клиентами

**Главное:** После каждого изменения файлов выполняйте:
```powershell
git add .
git commit -m "комментарий"
git push origin main
```

И на Vercel нажимайте **Redeploy**!