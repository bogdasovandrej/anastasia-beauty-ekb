/**
 * Студия красоты «Море красок» — Main JavaScript
 * ================================================
 * Визуальный календарь графика работы + плавная навигация
 */

// ============================================
// ГРАФИК РАБОТЫ — список рабочих дней
// ============================================

/**
 * Список рабочих дней. Формат: 'YYYY-MM-DD'.
 * Все дни, которых здесь нет, считаются выходными.
 *
 * Чтобы добавить/убрать день — просто отредактируй массив ниже.
 */
const WORK_DAYS = [
    // Май 2026
    '2026-05-25', '2026-05-26',

    // Июнь 2026 (по календарю мастера)
    '2026-06-03', '2026-06-04',
    '2026-06-08', '2026-06-12',
    '2026-06-17', '2026-06-18',
    '2026-06-22', '2026-06-26',
    '2026-06-30',

    // Июль 2026 (по календарю мастера)
    '2026-07-01', '2026-07-02',
    '2026-07-07', '2026-07-08', '2026-07-09',
    '2026-07-13', '2026-07-16',
    '2026-07-21', '2026-07-22', '2026-07-23',
    '2026-07-27', '2026-07-30', '2026-07-31'
];

const WORK_DAYS_SET = new Set(WORK_DAYS);

/**
 * Форматирует дату в строку 'YYYY-MM-DD' (локальное время, без UTC-сдвига).
 */
function toIsoDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Проверяет, является ли дата рабочим днём по списку.
 * @param {Date} date
 * @returns {boolean}
 */
function isWorkDay(date) {
    return WORK_DAYS_SET.has(toIsoDate(date));
}

// ============================================
// ДАННЫЕ ДЛЯ ОТОБРАЖЕНИЯ
// ============================================

const MONTHS_RU = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const MONTHS_RU_GENITIVE = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];

const WEEKDAYS_RU = [
    'воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'
];

// ============================================
// КАЛЕНДАРЬ
// ============================================

let currentCalendarDate = new Date();

/**
 * Отрисовывает календарь для указанного месяца/года.
 * @param {Date} date
 */
function renderCalendar(date) {
    const year  = date.getFullYear();
    const month = date.getMonth();

    // Заголовок
    const titleEl = document.getElementById('calendarTitle');
    if (titleEl) titleEl.textContent = `${MONTHS_RU[month]} ${year}`;

    const grid = document.getElementById('calendarGrid');
    if (!grid) return;
    grid.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Первый день месяца: getDay() → 0=Вс…6=Сб, переводим в 0=Пн…6=Вс
    const firstDay = new Date(year, month, 1);
    const startOffset = (firstDay.getDay() + 6) % 7;

    // Дни предыдущего месяца (серые заглушки)
    const daysInPrevMonth = new Date(year, month, 0).getDate();
    for (let i = startOffset - 1; i >= 0; i--) {
        const d = new Date(year, month - 1, daysInPrevMonth - i);
        grid.appendChild(createDayCell(d, today, true));
    }

    // Дни текущего месяца
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
        const cellDate = new Date(year, month, d);
        grid.appendChild(createDayCell(cellDate, today, false));
    }

    // Дни следующего месяца (серые заглушки), чтобы заполнить последнюю строку
    const totalCells = grid.children.length;
    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let d = 1; d <= remaining; d++) {
        const nd = new Date(year, month + 1, d);
        grid.appendChild(createDayCell(nd, today, true));
    }

    // Статус сегодня
    updateTodayStatus(today);
}

/**
 * Создаёт ячейку дня в сетке календаря.
 */
function createDayCell(date, today, isOtherMonth) {
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';
    cell.textContent = date.getDate();

    const isToday  = date.getTime() === today.getTime();
    const isPast   = date < today && !isToday;
    const isWork   = isWorkDay(date);

    if (isOtherMonth) {
        cell.classList.add('other-month');
    } else {
        cell.classList.add(isWork ? 'work' : 'off');
        if (isPast) cell.classList.add('past');
    }

    if (isToday) cell.classList.add('today');

    // Подсказка при наведении (для десктопа)
    if (!isOtherMonth) {
        const dayName = WEEKDAYS_RU[date.getDay()];
        const statusText = isWork ? 'Рабочий день' : 'Выходной';
        cell.title = `${date.getDate()} ${MONTHS_RU_GENITIVE[date.getMonth()]} — ${dayName}, ${statusText}`;
    }

    return cell;
}

/**
 * Обновляет строку «Сегодня, ... — Рабочий/Выходной».
 */
function updateTodayStatus(today) {
    const todayEl = document.getElementById('calendarToday');
    if (!todayEl) return;

    const dayName  = WEEKDAYS_RU[today.getDay()];
    const dateStr  = `${today.getDate()} ${MONTHS_RU_GENITIVE[today.getMonth()]}`;
    const isWork   = isWorkDay(today);
    const statusText = isWork ? '✓ Рабочий день' : '✕ Выходной';
    const statusColor = isWork ? '#2e7d32' : '#f57f17';

    todayEl.innerHTML =
        `Сегодня, ${dateStr} — ${dayName}<br>` +
        `<strong style="color:${statusColor}">${statusText}</strong>`;
}

// ============================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================

document.addEventListener('DOMContentLoaded', function () {

    // Инициализируем календарь
    const prevBtn = document.getElementById('prevMonth');
    const nextBtn = document.getElementById('nextMonth');

    if (prevBtn && nextBtn) {
        prevBtn.addEventListener('click', function () {
            currentCalendarDate = new Date(
                currentCalendarDate.getFullYear(),
                currentCalendarDate.getMonth() - 1,
                1
            );
            renderCalendar(currentCalendarDate);
        });

        nextBtn.addEventListener('click', function () {
            currentCalendarDate = new Date(
                currentCalendarDate.getFullYear(),
                currentCalendarDate.getMonth() + 1,
                1
            );
            renderCalendar(currentCalendarDate);
        });

        renderCalendar(currentCalendarDate);
    }

    // Эффект тени при прокрутке navbar
    const navbar = document.querySelector('.navbar');
    if (navbar) {
        window.addEventListener('scroll', function () {
            if (window.scrollY > 50) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }
        }, { passive: true });
    }

});

// Плавная прокрутка для якорных ссылок
document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href && href !== '#') {
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });
});
