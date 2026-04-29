# ПОЛНАЯ ИНСТРУКЦИЯ ПО ОБНОВЛЕНИЮ САЙТА

## Что нужно сделать после изменений в коде

### Шаг 1: Сохраните все файлы в VSCode
- Нажмите `Ctrl+S` для всех открытых файлов

### Шаг 2: Откройте терминал в папке beauty-website
```powershell
cd beauty-website
```

### Шаг 3: Проверьте статус Git
```powershell
git status
```

### Шаг 4: Добавьте все изменения
```powershell
git add .
```

### Шаг 5: Создайте коммит
```powershell
git commit -m "Описание изменений"
```

### Шаг 6: Отправьте на GitHub
```powershell
git push origin main
```

### Шаг 7: Подождите деплой Vercel
- Vercel автоматически деплоит через 1-2 минуты
- Проверьте: https://vercel.com/dashboard

---

## ЧТО ДЕЛАТЬ ЕСЛИ КАРТИНКИ НЕ ГРУЗЯТСЯ

### Причина 1: Кэш браузера
**Решение:**
- Нажмите `Ctrl+F5` для полного обновления
- Или откройте в режиме инкогнито `Ctrl+Shift+N`

### Причина 2: Vercel не деплоит новые файлы
**Решение:**
1. Зайдите на https://vercel.com/dashboard
2. Выберите проект
3. Нажмите **Deployments**
4. Нажмите на последнюю деплойку
5. Нажмите **Retry Deployment**

### Причина 3: Неправильный путь к файлам
**Проверьте в index.html:**
```html
<!-- Правильно -->
<img src="images/hero.jpg" alt="...">
<img src="images/brows.png" alt="...">
<img src="images/lashes.png" alt="...">

<!-- Неправильно -->
<img src="images\brows.png" alt="...">  <!-- обратный слэш -->
<img src="/images/brows.png" alt="...">  <!-- слэш в начале -->
```

---

## КАК САМОМУ ЗАМЕНИТЬ КАРТИНКИ

### Способ 1: Через файловую систему (проще)

1. **Откройте папку проекта:**
   ```
   C:\Users\bogda\Desktop\beauty-website\images\
   ```

2. **Удалите старые картинки:**
   - Выделите файл и нажмите `Delete`

3. **Скопируйте новые картинки:**
   - Перетащите новые файлы в папку `images`
   - Назовите файлы латиницей: `hero.jpg`, `brows.png`, `lashes.png`

4. **Обновите Git:**
   ```powershell
   cd beauty-website
   git add images/
   git commit -m "Обновил картинки"
   git push origin main
   ```

### Способ 2: Через VSCode

1. **Откройте папку в VSCode:**
   - File → Open Folder → выберите `beauty-website`

2. **Замените файлы:**
   - В панели файлов перетащите новые картинки в папку `images`
   - VSCode спросит "Replace" → нажмите Yes

3. **Обновите Git:**
   ```powershell
   cd beauty-website
   git add images/
   git commit -m "Обновил картинки"
   git push origin main
   ```

---

## ЧТО ДЕЛАТЬ ЕСЛИ НИЧЕ НЕ ПОМОГАЕТ

### Полный сброс деплоя Vercel

1. **Очистите кэш Vercel:**
   - Settings → Caching → Clear Cache

2. **Пересоздайте деплой:**
   - Deployments → Retry Deployment

3. **Если не помогает - пересоздайте проект:**
   ```bash
   # Удалите старый проект
   vercel rm anastasia-beauty-ekb
   
   # Зайдите в папку проекта
   cd beauty-website
   
   # Создайте новый проект
   vercel
   ```

---

## БЫСТРЫЙ ЧЕКЛИСТ

- [ ] Все файлы сохранены (`Ctrl+S`)
- [ ] Изменения добавлены в Git (`git add .`)
- [ ] Коммит создан (`git commit -m "...")`
- [ ] Отправлено на GitHub (`git push origin main`)
- [ ] Vercel деплоит (проверить в dashboard)
- [ ] Кэш браузера очищен (`Ctrl+F5`)
- [ ] Картинки в папке `images/` с правильными именами
- [ ] Пути в HTML используют `/` а не `\`

---

## КОНТРОЛЬНЫЙ СПИСОК ДЛЯ КАРТИНОК

1. **Проверьте что файлы существуют:**
   ```powershell
   cd beauty-website\images
   dir
   ```

2. **Проверьте имена файлов:**
   - Должны быть латиницей: `hero.jpg`, `brows.png`, `lashes.png`
   - НЕ кириллицей: `фото.jpg`, `брови.png`

3. **Проверьте пути в HTML:**
   ```html
   <img src="images/hero.jpg" ...>
   <img src="images/brows.png" ...>
   <img src="images/lashes.png" ...>
   ```

4. **Проверьте в браузере:**
   - Откройте DevTools (`F12`)
   - Перейдите во вкладку **Network**
   - Обновите страницу (`F5`)
   - Ищите статус 200 для картинок
   - Если 404 - путь неправильный

---

## ЧТО ДЕЛАТЬ ЕСЛИ ФОРМА НЕ ОТПРАВЛЯЕТСЯ

1. **Проверьте Formspree:**
   - Зайдите на https://formspree.io/
   - Убедитесь что форма активна
   - Проверьте endpoint: `https://formspree.io/f/maqarovr`

2. **Проверьте консоль браузера:**
   - Откройте DevTools (`F12`)
   - Вкладка **Console**
   - Ищите ошибки

3. **Проверьте Network:**
   - Вкладка **Network**
   - Отправьте форму
   - Проверьте статус запроса

---

## ЧТО ДЕЛАТЬ ЕСЛИ САЙТ НЕ ОТКРЫВАЕТСЯ

1. **Проверьте GitHub:**
   - https://github.com/bogdasovandrej/anastasia-beauty-ekb
   - Убедитесь что есть последние коммиты

2. **Проверьте Vercel:**
   - https://vercel.com/dashboard
   - Проект должен быть активен
   - Деплои должны быть успешными

3. **Проверьте домен:**
   - Если используете кастомный домен - подождите DNS
   - Если временный домен - проверьте что он работает