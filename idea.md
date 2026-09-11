# Спецификация и Архитектура POS-системы

## 1. Архитектура и стек технологий

Система строится по монолитной схеме с разделением на клиентские роли через единый API на SvelteKit 2.

```
+-----------------------------------------------------------------------+
|                           SVELTEKIT 2 APP                             |
|                                                                       |
|  +-------------------+  +-------------------+  +-------------------+  |
|  |  Экран Официанта  |  |    Экран Кухни    |  | Экран Админа      |  |
|  |  (Mobile PWA)     |  |    (KDS Tablet)   |  | (Desktop Web)     |  |
|  +---------+---------+  +---------+---------+  +---------+---------+  |
|            |                      |                      |            |
|            +----------------------+----------------------+            |
|                                   |                                   |
|                      Server Routes / SSE Handlers                     |
|                                   |                                   |
|                          better-sqlite3 / WAL                         |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
                           [ sqlite.db (SQLite) ]

```

* **Frontend & Backend**: SvelteKit 2 (SSR + Client SPA for POS interfaces).
* **База данных**: SQLite (драйвер `better-sqlite3` с включенным режимом `WAL` — Write-Ahead Logging для высоких скоростей записи).
* **Синхронизация реального времени (KDS / Чеки)**: Server-Sent Events (SSE) через Server Routes в SvelteKit.
* **Генерация отчетов**: Библиотека `exceljs` для выгрузки отчетов в `.xlsx`.

---

## 2. Схема базы данных (SQLite Schema)

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Торговые точки
CREATE TABLE locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Пользователи
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT CHECK(role IN ('waiter', 'kitchen', 'admin')) NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Назначение пользователей на торговые точки
CREATE TABLE user_locations (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, location_id)
);

-- Привязанные устройства
CREATE TABLE devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_code TEXT UNIQUE NOT NULL, -- 6-значный код (напр. 894-201)
    device_uuid TEXT UNIQUE,          -- Персистентный токен браузера
    location_id INTEGER REFERENCES locations(id),
    assigned_user_id INTEGER REFERENCES users(id),
    status TEXT CHECK(status IN ('pending', 'active', 'blocked')) DEFAULT 'pending',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Справочник меню
CREATE TABLE menu_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    price REAL NOT NULL,
    is_active INTEGER DEFAULT 1
);

-- Кассовые смены
CREATE TABLE shifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER REFERENCES locations(id) NOT NULL,
    opened_by_user_id INTEGER REFERENCES users(id) NOT NULL,
    closed_by_user_id INTEGER REFERENCES users(id),
    opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME,
    status TEXT CHECK(status IN ('open', 'closed')) DEFAULT 'open'
);

-- Чеки / Заказы
CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER REFERENCES locations(id) NOT NULL,
    shift_id INTEGER REFERENCES shifts(id) NOT NULL,
    waiter_id INTEGER REFERENCES users(id) NOT NULL,
    status TEXT CHECK(status IN ('open', 'closed', 'cancelled')) DEFAULT 'open',
    payment_method TEXT CHECK(payment_method IN ('cash', 'bank')),
    total_amount REAL DEFAULT 0.0,
    cash_received REAL DEFAULT 0.0,
    change_amount REAL DEFAULT 0.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    closed_at DATETIME
);

-- Позиции в чеке
CREATE TABLE order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    menu_item_id INTEGER REFERENCES menu_items(id), -- NULL если кастомная позиция
    title TEXT NOT NULL,                             -- Фиксируется на момент продажи
    price REAL NOT NULL,                             -- Фиксируется на момент продажи
    quantity INTEGER DEFAULT 1,
    status TEXT CHECK(status IN ('new', 'ready')) DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Расходы по торговой точке
CREATE TABLE expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location_id INTEGER REFERENCES locations(id) NOT NULL,
    user_id INTEGER REFERENCES users(id) NOT NULL,
    amount REAL NOT NULL,
    description TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Индексы для оптимизации выборок
CREATE INDEX idx_orders_location_status ON orders(location_id, status);
CREATE INDEX idx_orders_shift ON orders(shift_id);
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_devices_code ON devices(device_code);

```

---

## 3. Авторизация устройств и ролевая модель

### Сценарий подключения нового устройства (BYOD / Терминал)

1. Устройство открывает веб-приложение. В `localStorage` генерируется или считывается `device_uuid`.
2. Если устройство не привязано, сервер генерирует короткий код (`device_code`, напр., `481-902`) и сохраняет запись в `devices` со статусом `pending`.
3. На экране устройства отображается крупный код `481-902`.
4. Администратор в админ-панели вводит/выбирает этот код, назначает:
* Торговую точку (`location_id`)
* Сотрудника (`assigned_user_id`) и его роль (`waiter` / `kitchen` / `admin`).


5. Статус устройства меняется на `active`.
6. Клиент через SSE-канал получает сигнал подтверждения и перенаправляется на рабочий экран согласно роли.
7. При изменении статуса на `blocked` экран мгновенно перекрывается заглушкой блокировки.

---

## 4. Спецификация экранов и UI-потоков

### 4.1. Экран Официанта (`/waiter`)

Интерфейс оптимизирован под сенсорный ввод на смартфонах и планшетах.

```
+-------------------------------------------------------------+
| ТОП-БАР: [Точка: Центр] | [Официант: Иван] | [Смена #12: OK]|
+-------------------------------------------------------------+
| СПИСОК НЕЗАКРЫТЫХ ЧЕКОВ (Горизонтальный/Вертикальный скролл) |
| +---------------------+  +---------------------+            |
| | Чек #104    $ 45.00 |  | Чек #105    $ 12.00 |  [ + НОВЫЙ |
| | Стол/Заказ 4        |  | Экспресс            |    ЧЕК ]   |
| | [2 поз]     (08 мин)|  | [1 поз]     (02 мин)|            |
| +---------------------+  +---------------------+            |
+-------------------------------------------------------------+
| РЕДАКТИРОВАНИЕ АКТИВНОГО ЧЕКА #104                          |
| ----------------------------------------------------------- |
| 1. Пицца Маргарита          1 x $ 15.00 = $ 15.00   [-] [+] |
| 2. Кола 0.5                 2 x $  5.00 = $ 10.00   [-] [+] |
| 3. [Своя] Экспресс-добавка  1 x $ 20.00 = $ 20.00   [Удалить]|
+-------------------------------------------------------------+
| ДЕЙСТВИЯ:                                                   |
| [ + Из меню ]  [ + Своя позиция ]                           |
|                                                             |
| ИТОГО: $ 45.00                                              |
| [ ЗАКРЫТЬ ЧЕК (ВЫБОР ОПЛАТЫ) ]                              |
+-------------------------------------------------------------+

```

#### Функционал официанта:

1. **Список незакрытых чеков**: Просмотр всех чеков в статусе `open` текущей торговой точки.
2. **Создание чека**: Нажатие «+ Новый чек» создает запись в `orders` со статусом `open`.
3. **Редактирование чека**:
* Добавление позиций из справочника `menu_items`.
* Изменение количества (`+` / `-`) или полное удаление строки.


4. **Добавление своей позиции**:
* Нажатие «+ Своя позиция».
* Форма с двумя полями: **Название** (TEXT) и **Цена** (NUMERIC).
* Сохраняется в `order_items` с `menu_item_id = NULL`.


5. **Закрытие чека (Checkout Modal)**:
* **Наличные**: Ввод полученной суммы $\rightarrow$ Авторасчет сдачи ($\text{Сдача} = \text{Получено} - \text{Итого}$). Кнопка «Подтвердить закрытие».
* **Банк**: Отображение динамического или статического QR-кода оплаты. Кнопка «Оплачено».



---

### 4.2. Экран Кухни / KDS (`/kitchen`)

Интерфейс для планшетов на кухне. Минималистичный карточный вид.

```
+-------------------------------------------------------------+
| КУХНЯ | Точка: Главный зал                       [Sync: OK] |
+-------------------------------------------------------------+
| ЗАЯВКИ В РАБОТЕ:                                            |
|                                                             |
| +-------------------------+     +-------------------------+ |
| | ЧЕК #104       (05 мин) |     | ЧЕК #106       (01 мин) | |
| | ----------------------- |     | ----------------------- | |
| | • 1х Пицца Маргарита    |     | • 2х Кола 0.5           | |
| | • 1х Своя позиция       |     |                         | |
| |   (Экспресс-добавка)    |     |                         | |
| | ----------------------- |     | ----------------------- | |
| | [ ГОТОВ К ВЫДАЧЕ ]      |     | [ ГОТОВ К ВЫДАЧЕ ]      | |
| +-------------------------+     +-------------------------+ |
+-------------------------------------------------------------+

```

#### Функционал кухни:

1. **Просмотр заявок**: Отображение чеков, содержащих позиции со статусом `status = 'new'`.
2. **Смена статуса (Необязательный этап)**: Нажатие кнопки «Готов к выдаче» обновляет статус позиций на `ready`.
3. **Обновление**: Автоматический прием новых чеков через SSE без перезагрузки страницы.

---

### 4.3. Экран Администратора (`/admin`)

Панель управления и аналитики для настольного браузера.

```
+-------------------------------------------------------------+
| АДМИНИСТРИРОВАНИЕ | [Выбор точки: Все v]                    |
+-------------------------------------------------------------+
| ВЛАДКИ: [Пользователи] [Устройства] [Точки] [Отчеты] [Расходы]|
+-------------------------------------------------------------+
| ВКЛАДКА "ОТЧЕТЫ И ЧЕКИ":                                    |
| Фильтры: [Период: С... По...] [Смена: Все v] [Официант: Все v]|
|          [Тип оплаты: Все v (Наличные / Банк)]              |
|                                                             |
| СВОДКА ЗА ПЕРИОД:                                           |
| Всего чеков: 42 | Наличные: $ 420.00 | Банк: $ 890.00         |
| ОБЩАЯ ВЫРУЧКА: $ 1,310.00                                   |
| ----------------------------------------------------------- |
| ТАБЛИЦА ЧЕКОВ:                                              |
| ID  | Дата/Время   | Официант | Оплата   | Сумма    | Статус|
| 104 | 04.09 14:20  | Иван     | Наличные | $ 45.00  | Закрыт|
| 103 | 04.09 13:50  | Анна     | Банк     | $ 112.00 | Закрыт|
| ----------------------------------------------------------- |
| [ ВЫГРУЗИТЬ ОТЧЕТ В EXCEL (.XLSX) ]                         |
+-------------------------------------------------------------+

```

#### Функционал администратора:

1. **Управление пользователями**: Создание профилей, назначение ролей (`waiter`, `kitchen`, `admin`), деактивация.
2. **Подключение устройств**:
* Ввод кода `device_code` с экрана нового устройства.
* Назначение привязки к торговой точке и пользователю.
* Блокировка / разблокировка устройств в 1 клик.


3. **Торговые точки**: Создание и редактирование локаций.
4. **Учет расходов**:
* Форма ввода расхода: Выбор точки, сумма, описание причины расхода.


5. **Аналитика и Отчетность**:
* Выборка чеков с фильтрацией по дате, смене, официанту, методу оплаты.
* Итоговые агрегированные суммы (Наличные, Банк, Общий итог).
* Табличный вывод отчетов по реализованным позициям (топ продаж), сменам и расходам.
* **Выгрузка в Excel**: Серверное формирование `.xlsx` файла с несколькими листами (Чеки, Проданные товары, Расходы).



---

## 5. Реализация ключевых модулей на SvelteKit 2

### 5.1. Подключение к SQLite (`src/lib/server/db.js`)

```javascript
import Database from 'better-sqlite3';

const db = new Database('pos_system.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;

```

### 5.2. Реализация Server-Sent Events для KDS (`src/routes/api/kds/stream/+server.js`)

```javascript
export function GET({ request }) {
    let controller;
    
    const stream = new ReadableStream({
        start(c) {
            controller = c;
            // Добавление клиента в глобальный список слушателей
        },
        cancel() {
            // Удаление клиента из списка
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
}

```

### 5.3. Серверная выгрузка отчета в Excel (`src/routes/api/admin/export/+server.js`)

```javascript
import ExcelJS from 'exceljs';
import db from '$lib/server/db';

export async function GET({ url }) {
    const fromDate = url.searchParams.get('from');
    const toDate = url.searchParams.get('to');

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Отчет по чекам');

    sheet.columns = [
        { header: 'ID Чека', key: 'id', width: 10 },
        { header: 'Дата', key: 'created_at', width: 20 },
        { header: 'Официант', key: 'waiter_name', width: 20 },
        { header: 'Тип оплаты', key: 'payment_method', width: 15 },
        { header: 'Сумма', key: 'total_amount', width: 15 }
    ];

    const rows = db.prepare(`
        SELECT o.id, o.created_at, u.name as waiter_name, o.payment_method, o.total_amount
        FROM orders o
        JOIN users u ON o.waiter_id = u.id
        WHERE o.status = 'closed' AND DATE(o.created_at) BETWEEN ? AND ?
    `).all(fromDate, toDate);

    sheet.addRows(rows);

    const buffer = await workbook.xlsx.writeBuffer();

    return new Response(buffer, {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="report_${fromDate}_${toDate}.xlsx"`
        }
    });
}

```

---

## 6. Структура каталогов проекта SvelteKit 2

```text
/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── WaiterCheckoutModal.svelte
│   │   │   ├── CustomPositionModal.svelte
│   │   │   └── KdsCard.svelte
│   │   └── server/
│   │       ├── db.js          # better-sqlite3 instance
│   │       └── sse.js         # SSE broadcast manager
│   ├── routes/
│   │   ├── +page.svelte       # Инициализация / Проверка кода устройства
│   │   ├── waiter/            # Экран официанта
│   │   │   └── +page.svelte
│   │   ├── kitchen/           # Экран кухни (KDS)
│   │   │   └── +page.svelte
│   │   ├── admin/             # Панель администратора
│   │   │   └── +page.svelte
│   │   └── api/
│   │       ├── orders/        # CRUD чеков
│   │       ├── devices/       # Привязка по коду
│   │       ├── kds/stream/    # SSE эндпоинт
│   │       └── export/        # Генерация XLSX
├── sqlite.db
├── svelte.config.js
└── package.json

```