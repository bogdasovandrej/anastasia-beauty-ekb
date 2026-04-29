# 🌐 НАСТРОЙКА ДОМЕНА anastasia-beauty-ekb.ru НА VERCEL

## ✅ ЧТО ПРОИСХОДИТ СЕЙЧАС

- **Временный домен Vercel работает:**
  ```
  https://beauty-website-git-main-bogdasovandrejs-projects.vercel.app/
  ```
  ✅ Все картинки грузятся, сайт работает

- **Ваш домен anastasia-beauty-ekb.ru:**
  - ❌ Еще не подключен к Vercel
  - ⏳ DNS еще не распространился
  - ⏳ HTTPS еще не включился

---

## 📋 ШАГИ ПО НАСТРОЙКЕ ДОМЕНА

### Шаг 1: Добавить домен на Vercel

1. Откройте:
   ```
   https://vercel.com/dashboard
   ```

2. Найдите проект **anastasia-beauty-ekb**

3. Перейдите во вкладку **Domains** (слева)

4. Нажмите **Add** → **Add Custom Domain**

5. Введите:
   ```
   anastasia-beauty-ekb.ru
   ```
   И нажмите **Add**

6. Добавьте также:
   ```
   www.anastasia-beauty-ekb.ru
   ```

### Шаг 2: Настроить DNS на reg.ru

1. Войдите в личный кабинет на [reg.ru](https://www.reg.ru/)

2. Найдите домен **anastasia-beauty-ekb.ru**

3. Перейдите в **DNS-серверы** или **Настройки DNS**

4. Измените NS-серверы на:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```

5. Сохраните изменения

### Шаг 3: Подождать распространения DNS

- DNS распространяется от **1 до 48 часов**
- Обычно занимает **15-60 минут**
- Вы можете проверить статус на:
  ```
  https://dnschecker.org/
  ```
  Введите: `anastasia-beauty-ekb.ru`

### Шаг 4: Включить HTTPS на Vercel

1. На Vercel перейдите в **Domains**

2. После того как DNS настроится, Vercel автоматически проверит домен

3. HTTPS включится автоматически (зеленый замочек в браузере)

---

## 🔍 КАК ПРОВЕРИТЬ ЧТО DNS НАСТРОИЛСЯ

### Способ 1: Через dnschecker.org

1. Откройте:
   ```
   https://dnschecker.org/
   ```

2. Введите:
   ```
   anastasia-beauty-ekb.ru
   ```

3. Выберите тип записи: **A** или **CNAME**

4. Нажмите **Forward**

5. Подождите пока все сервера покажут IP Vercel

### Способ 2: Через командную строку

Откройте PowerShell и выполните:
```powershell
nslookup anastasia-beauty-ekb.ru
```

Если видите IP адрес Vercel (например, 76.76.21.21) - DNS настроен

---

## ⚠️ ЧТО ДЕЛАТЬ ЕСЛИ VERCEL ПИШЕТ "INVALID CONFIGURATION"

### Причина 1: DNS еще не распространился

**Решение:**
- Подождите 1-48 часов
- Проверьте на dnschecker.org

### Причина 2: NS-серверы не настроены на reg.ru

**Решение:**
1. Войдите на reg.ru
2. Найдите домен **anastasia-beauty-ekb.ru**
3. Убедитесь что NS-серверы установлены на:
   ```
   ns1.vercel-dns.com
   ns2.vercel-dns.com
   ```

### Причина 3: Домен не добавлен в Vercel

**Решение:**
1. Откройте Vercel Dashboard
2. Проект **anastasia-beauty-ekb**
3. **Domains** → **Add**
4. Добавьте `anastasia-beauty-ekb.ru`

---

## 🎯 ЧТО БУДЕТ ПОСЛЕ НАСТРОЙКИ

После того как DNS распространится:

1. **Сайт будет доступен по:**
   ```
   https://anastasia-beauty-ekb.ru/
   ```

2. **HTTPS включится автоматически:**
   - В браузере появится зеленый замочек
   - Сайт будет безопасным

3. **Все картинки будут грузиться:**
   - Так как они уже есть на GitHub
   - Vercel их автоматически загрузит

4. **Форма будет работать:**
   - Заявки будут приходить на Formspree

---

## 🚀 БЫСТРАЯ ПРОВЕРКА

### Проверьте что файлы на GitHub:
```
https://github.com/bogdasovandrej/anastasia-beauty-ekb/tree/main/images
```

Вы должны увидеть:
- hero.jpg
- brows.png
- lashes.png

### Проверьте деплой на Vercel:
```
https://vercel.com/dashboard
```

Проект **anastasia-beauty-ekb** → **Deployments**

Убедитесь что последний деплой со статусом **Ready**

---

## 📞 ЧТО ДЕЛАТЬ ЕСЛИ ЧТО-ТО НЕ РАБОТАЕТ

### Картинки не грузятся на anastasia-beauty-ekb.ru:

1. Очистите кэш браузера:
   ```
   Ctrl + Shift + Delete
   ```

2. Откройте в режиме инкогнито:
   ```
   Ctrl + Shift + N
   ```

3. Проверьте DevTools (F12) → Console → ищите ошибки

### Домен не открывается:

1. Подождите 1-48 часов для распространения DNS

2. Проверьте на dnschecker.org

3. Убедитесь что NS-серверы на reg.ru настроены правильно

### HTTPS не включается:

1. Подождите пока DNS распространится

2. HTTPS включится автоматически через Vercel

3. Если не включается через 48 часов - обратитесь в поддержку Vercel

---

## ✅ ЧЕКЛИСТ НАСТРОЙКИ ДОМЕНА

- [ ] Файлы изображений есть на GitHub (images/ папка)
- [ ] Проект на Vercel связан с GitHub
- [ ] Последний деплой со статусом **Ready**
- [ ] Домен anastasia-beauty-ekb.ru добавлен в Vercel
- [ ] NS-серверы на reg.ru изменены на Vercel
- [ ] DNS распространился (проверено на dnschecker.org)
- [ ] HTTPS включился (зеленый замочек в браузере)
- [ ] Сайт открывается по anastasia-beauty-ekb.ru
- [ ] Все картинки грузятся
- [ ] Форма отправляет заявки

---

## 🎉 ГОТОВО!

После настройки домена ваш сайт будет доступен по:
```
https://anastasia-beauty-ekb.ru/
```

И все будет работать так же как на временном домене Vercel!