# 🔧 Решение проблемы с Git

## Ошибка:
```
error: src refspec main does not match any
```

## Причина:
У вас ветка называется `master`, а вы пытаетесь отправить в `main`.

## Решение 1: Переименовать ветку в main

Выполните в PowerShell:

```powershell
git branch -M main
git push -u origin main
```

## Решение 2: Отправить в ветку master

Выполните в PowerShell:

```powershell
git push -u origin master
```

## Решение 3: Настроить GitHub на master

1. Зайдите на GitHub: https://github.com/bogdasovandrej/anastasia-beauty-ekb
2. Перейдите в Settings → Advanced
3. Измените default branch с main на master
4. Или создайте новую ветку main из master:

```powershell
git checkout -b main
git push -u origin main
```

---

## После успешной отправки:

Проверьте на GitHub: https://github.com/bogdasovandrej/anastasia-beauty-ekb

Должны быть видны все файлы сайта.

---

## Следующие шаги:

1. ✅ Git отправлен на GitHub
2. ⏳ Vercel автоматически обновится (проверьте в Vercel dashboard)
3. ⏳ Замените фото в index.html
4. ⏳ Добавьте DNS-записи у провайдера домена
5. ⏳ Подождите обновления DNS (15 мин - 24 часа)
6. ⏳ HTTPS включится автоматически