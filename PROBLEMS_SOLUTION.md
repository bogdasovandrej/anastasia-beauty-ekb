# 🚀 Пошаговая инструкция по устранению проблем

## Проблема 1: Git ошибка "src refspec main does not match any"

### Решение:

Откройте PowerShell в папке `C:\Users\bogda\Desktop\beauty-website` и выполните по очереди:

```powershell
# Инициализация git репозитория
git init

# Добавление всех файлов
git add .

# Создание коммита
git commit -m "Initial commit: beauty website"

# Отправка в GitHub
git push -u origin main
```

Если ошибка останется, попробуйте:

```powershell
git branch -M main
git push -u origin main
```

---

## Проблема 2: Фото не отображаются

### Решение:

1. Откройте файл `C:\Users\bogda\Desktop\beauty-website\index.html` в текстовом редакторе

2. Найдите строку (примерно строка 55):
```html
<img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=500&h=650&fit=crop" alt="Анастасия Викторовна" class="hero-photo">
```

3. Замените на:
```html
<img src="images/hero.jpg" alt="Анастасия Викторовна" class="hero-photo">
```

4. Сохраните файл

5. Проверьте что файл `images/hero.jpg` существует в папке `C:\Users\bogda\Desktop\beauty-website\images\`

---

## Проблема 3: DNS не работает

### Решение:

У вас домен **anastasia-beauty-ekb.online**

### Шаг 1: Найдите где купили домен

Зайдите в панель управления доменом (там где покупали anastasia-beauty-ekb.online)

### Шаг 2: Добавьте DNS-записи

Найдите раздел "DNS-записи" или "Управление DNS" и добавьте:

#### Запись 1 (A record):
- **Тип:** A
- **Имя/Host:** @
- **Значение/Value:** 216.198.79.1
- **TTL:** автоматически

#### Запись 2 (CNAME record):
- **Тип:** CNAME
- **Имя/Host:** www
- **Значение/Value:** cname.vercel-dns.com
- **TTL:** автоматически

### Шаг 3: Подождите обновления DNS

DNS-изменения могут занять от **15 минут до 24 часов**. Обычно работает через 1-2 часа.

---

## Проблема 4: HTTPS не включается

### Решение:

HTTPS включается **автоматически** после того как DNS-записи обновятся.

1. Зайдите в Vercel dashboard
2. Перейдите в "Domains"
3. Нажмите на ваш домен `anastasia-beauty-ekb.online`
4. Подождите пока статус изменится на "Active"
5. HTTPS включится автоматически

---

## Проверка что всё работает

### 1. Проверьте локально:

```powershell
cd C:\Users\bogda\Desktop\beauty-website
python -m http.server 8000
```

Откройте в браузере: `http://localhost:8000`

### 2. Проверьте GitHub:

Зайдите на: `https://github.com/bogdasovandrej/anastasia-beauty-ekb`

Должны быть видны все файлы

### 3. Проверьте Vercel:

Зайдите в Vercel dashboard и проверьте:
- Статус деплоя: "Ready"
- Домены: `anastasia-beauty-ekb.online`
- DNS статус: должен быть "Active"

---

## Чек-лист

- [ ] Git инициализирован и файлы отправлены на GitHub
- [ ] Фото заменено на `images/hero.jpg`
- [ ] DNS-запись A добавлена: @ → 216.198.79.1
- [ ] DNS-запись CNAME добавлена: www → cname.vercel-dns.com
- [ ] Сайт открывается локально (http://localhost:8000)
- [ ] Сайт виден на GitHub
- [ ] DNS обновился (проверьте через 15-30 минут)
- [ ] HTTPS включился автоматически

---

## Если что-то не работает

### Проверьте локально:
1. Откройте `index.html` в браузере напрямую
2. Проверьте консоль браузера (F12) на ошибки

### Проверьте GitHub:
1. Убедитесь что все файлы в репозитории
2. Проверьте что `images/hero.jpg` загружен

### Проверьте Vercel:
1. Перейдите в "Settings" → "Domains"
2. Проверьте статус домена
3. Посмотрите логи ошибок

---

**Удачи! Если что-то не работает, напишите что именно.**