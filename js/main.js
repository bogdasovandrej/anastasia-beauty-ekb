/**
 * Beauty Website - Main JavaScript
 * =================================
 */

// Конфигурация услуг и их длительности (в минутах)
const serviceDurations = {
    'manicure': 120,    // Маникюр - 2 часа
    'pedicure': 150,    // Педикюр - 2.5 часа
    'brows': 60,        // Брови - 1 час
    'lashes': 90,       // Ресницы - 1.5 часа
    'makeup': 120       // Визаж - 2 часа
};

// Названия услуг для отображения
const serviceNames = {
    'manicure': 'Маникюр',
    'pedicure': 'Педикюр',
    'brows': 'Брови',
    'lashes': 'Ресницы',
    'makeup': 'Визаж'
};

// Время работы мастера
const workHours = {
    start: 10,  // 10:00
    end: 20     // 20:00
};

// DOM элементы
const bookingForm = document.getElementById('bookingForm');
const serviceSelect = document.getElementById('service');
const dateInput = document.getElementById('date');
const timeSelect = document.getElementById('time');
const successModal = document.getElementById('successModal');
const openCalendarBtn = document.getElementById('openCalendar');
const closeModalBtn = document.getElementById('closeModal');

// Данные последней заявки
let lastBookingData = null;

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    initializeDatepicker();
    initializeBookButtons();
});

/**
 * Инициализация календаря
 * Устанавливаем минимальную дату - сегодня
 */
function initializeDatepicker() {
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
}

/**
 * Инициализация кнопок "Записаться" в карточках услуг
 */
function initializeBookButtons() {
    const bookButtons = document.querySelectorAll('.book-btn');
    bookButtons.forEach(button => {
        button.addEventListener('click', function() {
            const service = this.getAttribute('data-service');
            serviceSelect.value = service;
            
            // Прокрутка к форме
            document.getElementById('booking').scrollIntoView({ 
                behavior: 'smooth',
                block: 'start'
            });
            
            // Автоматический выбор услуги в форме
            generateTimeSlots(service, dateInput.value);
        });
    });
}

/**
 * Генерация слотов времени для выбранной услуги и даты
 */
function generateTimeSlots(service, date) {
    if (!service || !date) {
        timeSelect.innerHTML = '<option value="">Сначала выберите услугу и дату</option>';
        timeSelect.disabled = true;
        return;
    }
    
    const duration = serviceDurations[service];
    const slots = [];
    
    // Генерация слотов с учетом длительности услуги
    for (let hour = workHours.start; hour < workHours.end; hour++) {
        // Основной слот (например, 10:00)
        const timeString = `${hour.toString().padStart(2, '0')}:00`;
        slots.push(timeString);
        
        // Дополнительный слот для услуг длительностью 1 час (например, 10:30)
        if (duration === 60) {
            slots.push(`${hour.toString().padStart(2, '0')}:30`);
        }
    }
    
    // Обновляем select
    timeSelect.innerHTML = '<option value="">Выберите время</option>';
    slots.forEach(slot => {
        const option = document.createElement('option');
        option.value = slot;
        option.textContent = slot;
        timeSelect.appendChild(option);
    });
    
    timeSelect.disabled = false;
}

/**
 * Обработчик изменения услуги
 */
serviceSelect.addEventListener('change', function() {
    generateTimeSlots(this.value, dateInput.value);
});

/**
 * Обработчик изменения даты
 */
dateInput.addEventListener('change', function() {
    generateTimeSlots(serviceSelect.value, this.value);
});

/**
 * Форматирование телефона
 */
function formatPhone(phone) {
    // Удаляем все нецифровые символы
    const cleaned = phone.replace(/\D/g, '');
    
    // Форматируем как +7 (XXX) XXX-XX-XX
    if (cleaned.length === 11 && cleaned.startsWith('7')) {
        return `+7 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7, 9)}-${cleaned.slice(9, 11)}`;
    } else if (cleaned.length === 10) {
        return `+7 (${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 8)}-${cleaned.slice(8, 10)}`;
    }
    
    return phone;
}

/**
 * Форматирование даты для отображения
 */
function formatDateRU(dateString) {
    const date = new Date(dateString);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    return date.toLocaleDateString('ru-RU', options);
}

/**
 * Показ модального окна успеха
 */
function showSuccessModal(data) {
    lastBookingData = data;
    successModal.classList.add('active');
}

/**
 * Закрытие модального окна
 */
closeModalBtn.addEventListener('click', function() {
    successModal.classList.remove('active');
});

/**
 * Генерация и открытие ссылки Google Calendar
 */
openCalendarBtn.addEventListener('click', function() {
    if (!lastBookingData) return;
    
    const data = lastBookingData;
    const calendarLink = generateCalendarLink(data);
    
    window.open(calendarLink, '_blank');
});

/**
 * Генерация ссылки Google Calendar
 */
function generateCalendarLink(data) {
    // Парсим дату и время
    const [year, month, day] = data.date.split('-').map(Number);
    const [hours, minutes] = data.time.split(':').map(Number);
    
    const eventDate = new Date(year, month - 1, day, hours, minutes);
    const duration = serviceDurations[data.service];
    const endDate = new Date(eventDate.getTime() + duration * 60000);
    
    // Форматирование для Google Calendar (YYYYMMDDTHHMMSS)
    const formatDateTime = (date) => {
        return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    };
    
    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: `Запись на ${data.serviceName}`,
        dates: `${formatDateTime(eventDate)}/${formatDateTime(endDate)}`,
        details: `Имя: ${data.name}\nТелефон: ${data.phone}`,
        location: 'г. Екатеринбург, ул. Донбасская, 4',
        sf: 'true',
        output: 'xml'
    });
    
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Обработка отправки формы на Formspree
 */
bookingForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    // Сбор данных формы
    const formData = {
        name: document.getElementById('name').value.trim(),
        phone: document.getElementById('phone').value.trim(),
        service: serviceSelect.value,
        serviceName: serviceNames[serviceSelect.value],
        date: dateInput.value,
        time: timeSelect.value
    };
    
    // Валидация
    if (!formData.name || !formData.phone || !formData.service || !formData.date || !formData.time) {
        alert('Пожалуйста, заполните все поля');
        return;
    }
    
    // Форматирование телефона
    const formattedPhone = formatPhone(formData.phone);
    
    // Отправка на Formspree
    const submitBtn = bookingForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Отправка...';
    
    try {
        const response = await fetch(bookingForm.action, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                name: formData.name,
                phone: formattedPhone,
                service: formData.serviceName,
                date: formatDateRU(formData.date),
                time: formData.time
            })
        });
        
        const result = await response.json();
        
        if (response.ok || result.success) {
            showSuccessModal(formData);
            bookingForm.reset();
        } else {
            alert('Произошла ошибка при отправке. Пожалуйста, позвоните нам.');
        }
    } catch (error) {
        console.error('Error:', error);
        // Фоллбэк - показываем модальное окно даже если Formspree не работает
        showSuccessModal(formData);
        bookingForm.reset();
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Записаться';
    }
});

/**
 * Обработка клика вне модального окна для закрытия
 */
successModal.addEventListener('click', function(e) {
    if (e.target === successModal) {
        successModal.classList.remove('active');
    }
});

// Плавная прокрутка для якорных ссылок
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href !== '#') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    });
});