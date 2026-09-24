# Архитектура R-resto

POS / KDS / админка одним Node-процессом. Код: [`app/`](../app/). Данные: [`data/`](../data/).

Связанные документы: [`WAITER_UX.md`](WAITER_UX.md), [`../AGENTS.md`](../AGENTS.md).

## 1. Стек

- **SvelteKit 2** + **Svelte 5** (runes), TypeScript.
- **Адаптер:** `@sveltejs/adapter-node` (не serverless, не static).
- **Клиент:** одна SPA (`ssr = false` в корневом layout). Один origin с API. Официант и кухня — отдельные оболочки (`waiter/+layout`, `kitchen/+layout`), не отдельные сборки.
- **PWA:** два манифеста, один service worker. POS: `static/manifest.webmanifest` (`id`/`start_url`/`scope` `/`). Админ: `static/admin.webmanifest` (`id`/`start_url`/`scope` `/admin`). `app.html` подставляет манифест по pathname. PNG 192/512 + maskable, `apple-touch-icon.png`, `src/service-worker.ts`. Навигации — network-first; `/_app/immutable/*` — cache-first; остальной static — stale-while-revalidate. `/api/*` и SSE всегда из сети. Меню на клиенте обновляется событием `MENU_UPDATED`.
- **БД:** SQLite, `better-sqlite3`, **без ORM**. WAL.
- **Realtime:** Server-Sent Events (`GET /api/events`). REST пишет, SSE рассылает.
- **Отчёты:** ExcelJS на сервере.
- **Загрузки:** файлы на диск `data/uploads`, в БД только относительный путь.

```mermaid
flowchart LR
  PosPwa["PWA R-resto"] --> Home["/"]
  Home -->|"одна роль"| Waiter["/waiter"]
  Home -->|"одна роль"| Kitchen["/kitchen"]
  Home -->|"две роли"| Pick["выбор роли"]
  Pick --> Waiter
  Pick --> Kitchen
  AdminPwa["PWA Админ"] --> Admin["/admin PIN"]
  Waiter --> SK["SvelteKit Node"]
  Kitchen --> SK
  Admin --> SK
  SK --> DB["data/sqlite/pos.db"]
  SK --> Files["data/uploads"]
  SK -->|"SSE"| Waiter
  SK --> Kitchen
```

## 2. Роли и доступ

**Официант и кухня** — BYOD, без логина:

1. Браузер получает cookie `device_uuid` (hooks).
2. Если устройства нет — `pending`, на экране 6-значный `device_code` (`481-902`).
3. Админ вводит код, назначает пользователя и роли устройства: официант и/или кухня (`device_roles`, можно обе).
4. Статус `active`. Если роль одна — клиент по SSE `DEVICE_ACTIVATED` сразу на `/waiter` или `/kitchen`. Если обе — остаётся на `/` для выбора. С POS при двух ролях можно вернуться на главную.
5. `suspended` / `terminated` → SSE `DEVICE_BLOCKED` → экран привязки.

**Админ** — отдельный PWA (`/admin`), вход по PIN, не привязка устройства:

1. Открывает `/admin`.
2. Если админов несколько — выбирает имя, затем цифровой пароль на нумпаде (4–8 цифр).
3. `POST /api/admin/login` → cookie `admin_session` (~12 часов), таблица `admin_sessions`.
4. Суперадмин (`users.is_superadmin`): имя «Администратор», пароль по умолчанию **1708**. Хеш `pin_hash` через scrypt. Нельзя удалить и снять роль.
5. При создании нового админа обязательно задаётся цифровой PIN.

Один сотрудник зала может быть на нескольких устройствах. Официант видит заказы своей точки; фильтр по залу — в шапке.

## 3. Доменная модель

**Деньги только в копейках (`INTEGER`).** `1 850 ₽` = `185000`.

```mermaid
erDiagram
  locations ||--o{ halls : has
  locations ||--o{ users : via_user_locations
  locations ||--o{ menu_items : has
  halls ||--o{ orders : in
  users ||--o{ orders : waiter
  shifts ||--o{ orders : during
  orders ||--o{ order_guests : split
  orders ||--o{ order_items : contains
  order_guests ||--o{ order_items : assigned
```

| Сущность | Смысл |
| --- | --- |
| `locations` | Торговая точка (заведение) |
| `halls` | Зал внутри точки, `color_hex` для шапки официанта, `qr_image_path` для безнала и печати |
| `users` | `waiter` / `kitchen` / `admin`; у админа `pin_hash`, у суперадмина `is_superadmin` |
| `admin_sessions` | Сессия PIN-входа, cookie `admin_session` |
| `devices` | Телефон/планшет, код, uuid, статус |
| `menu_categories`, `menu_items` | Справочник; `is_available` = стоп-лист; `image_path` |
| `shifts` | Кассовая смена точки |
| `orders` | Заказ: `open` / `closed` / `cancelled` |
| `order_guests` | Гости сплита, оплата каждого: `cash_cents` / `cashless_cents` / `shortfall_cents` / `writeoff_cents` |
| `order_items` | Позиции: цена зафиксирована; статус кухни |
| `expenses` | Расходы смены: `shift_id`, `payment_method` (`cash` / `cashless`), сумма, примечание |

### Статусы позиции (`order_items.status`)

| Статус | Кто ставит | KDS |
| --- | --- | --- |
| `held` | официант набрал, ещё не отправил | не виден |
| `pending` | «На кухню» | карточка / строка |
| `ready` | кухня двойной тап «готово» (`ready_at`) | зелёная строка сразу; официант видит через 10 с |
| `out_of_stock` | кухня «Нет блюда» | красный, алерт официанту |

`order_items.ready_at` — момент, когда кухня поставила `ready`. Повторный двойной тап на кухне возвращает `pending` и сбрасывает `ready_at`.

Готовность для официанта — **на уровне заказа**: когда все отправленные позиции (`pending`/`ready`) стали `ready`, ставится `orders.ready_at` и рассылается `ORDER_READY`. Официант видит «Готов» на карточке заказа и пуш только после 10 секунд (`orders.ready_at` + 10 с). Досыл позиций (`/fire`) и откат готовности на кухне сбрасывают `orders.ready_at` в `NULL`.

Кухня не видит `held`. Официант может править отправленные позиции (`pending`/`ready`) — изменение количества при увеличении сбрасывает позицию в `pending` (уходит на кухню заново). KDS: светлая тема, FIFO (старые сверху), состав без цен, фильтр зала («Все» + залы устройства, `localStorage`). Полностью готовый заказ уходит после неисполненных; дозаказ/изменение ставит заказ в конец очереди. Карточка пропадает при `closed` / `cancelled`.

### Закрытие заказа

`orders.status = closed` только принудительно — кнопкой **«Закрыть заказ»** в модалке оплаты (`POST /api/orders/[id]/close`). После оплаты заказ остаётся `open`. Оплата гостя — комбинированная: в `order_guests` пишутся суммы по способам (`cash_cents`, `cashless_cents`) и, если внесено меньше суммы гостя, `shortfall_cents` (недоплата). Закрытие возможно с частичной или отсутствующей оплатой: если заказ оплачен не полностью, официант получает подтверждение. Полностью оплаченный закрывается без вопроса. В админке неоплаченные/частично оплаченные чеки помечаются. Недоплата блокирует закрытие смены: админ списывает её (`shortfall_cents` → `writeoff_cents`, причина обязательна). Отмена — только админ, с обязательной причиной; SSE `ORDER_CANCELLED` снимает карточку с KDS.

## 4. SSE-события

Канал: `GET /api/events` (cookie устройства). Heartbeat `: ping` каждые 15 с.

| Событие | Источник | Получатели |
| --- | --- | --- |
| `DEVICE_ACTIVATED` / `DEVICE_BLOCKED` | админ | это устройство |
| `MENU_UPDATED` | админ (CRUD / стоп-лист) | официанты точки |
| `ORDER_CREATED` / `ORDER_UPDATED` | официант | кухня, админ, другие официанты точки |
| `ORDER_CANCELLED` / `ORDER_CLOSED` | админ / оплата | официант, кухня |
| `ITEM_STATUS_CHANGED` | кухня | официант |
| `ORDER_READY` | кухня (весь заказ готов) | официант |
| `ORDER_FIRED` | официант («На кухню» / дозаказ) | кухня (нотификация + перезагрузка очереди) |
| `SHIFT_OPENED` / `SHIFT_CLOSED` | админ | все терминалы точки |

Клиент: один `EventSource` на POS-сессию (`lib/client/pos-session.svelte.ts`) с reconnect/backoff. Страницы подписываются на события, не открывают свой канал. Конструктор официанта на `MENU_UPDATED` перезапрашивает `GET /api/menu`. Не кэшировать SSE и `/api/*` в SW.

## 5. HTTP API (скелет)

Префикс `/api`. JSON, копейки в числах.

- `POST /api/devices/register` — код или уже active+роль
- `GET /api/devices/me`
- `GET /api/admin/login` — список админов для экрана входа
- `POST /api/admin/login` — `{ userId, pin }`
- `POST /api/admin/logout`
- `GET /api/admin/me`
- `POST /api/admin/devices/bind` — код + waiter/kitchen
- `GET|POST /api/orders`, `POST /api/orders/:id/items`, split, pay, fire, `POST /api/orders/:id/close`
- `GET /api/kds` — очередь кухни (открытые заказы с pending/ready, новые сверху, позиции без цен)
- `PATCH /api/kds/items/:id` — `{ status: 'ready' | 'pending' }`
- `GET|POST /api/menu`, upload картинки
- `GET|POST /api/shifts`, close + Z (открытие смены — сессия админа; закрытие — без открытых заказов и недоплат)
- `POST /api/admin/orders/:id/writeoff` — списание недоплаты заказа, `{ reason }`
- `GET /api/admin/shifts` — текущая и закрытые смены с чеками, выручкой и расходами
- `GET /api/admin/orders` — заказы и чеки открытой смены
- `POST /api/admin/orders/:id/cancel` — `{ reason }` обязательно
- `POST /api/admin/expenses`, `DELETE /api/admin/expenses/:id` — расходы открытой смены
- `GET /api/admin/analytics?from&to` — товары vs прошлый период той же длины
- `GET /api/admin/export?from&to` — xlsx (Чеки, Товары, Сравнение, Расходы)
- `GET /api/events` — SSE

Терминал: cookie `device_uuid`, `devices.status = active`. Админские пути: cookie `admin_session`, не роль на устройстве.

## 6. Каталоги `app/src`

```text
src/
  hooks.server.ts          # cookie, migrate side-effect via db import
  service-worker.ts       # PWA: network-first navigate, exclude /api
  lib/
    money.ts
    types.ts
    client/pos-session.svelte.ts  # device + один SSE для POS
    components/
      PosShell, PosRoleGate, PinPad, AdminNav
      waiter/              # OrderItems, MenuSheet, PayDialog
    server/
      paths.ts
      sse.ts
      db/index.ts          # singleton
      db/migrate.ts
      db/migrations/
  routes/
    +layout.ts             # ssr = false, currency в data
    +page.svelte           # привязка
    waiter/+layout.svelte  # гард роли waiter, светлая оболочка
    kitchen/+layout.svelte # гард роли kitchen, светлая оболочка
    admin/{devices,menu,shift,analytics,settings}
    api/...
```

PWA-файлы в `app/static/`: `manifest.webmanifest` (POS), `admin.webmanifest` (админ), `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, SVG-исходники иконок.

Официант: `/waiter` — список заказов/чеков по возрастанию времени. `/waiter/new` и `/waiter/{id}` — позиции на экране (`OrderItems`), меню в нижней шторке (`MenuSheet`) до строки итогов. Новый заказ открывается с меню; существующий и закрытый — со свёрнутой шторкой. Оплата — `PayDialog` с переключателем нал/безнал.

## 7. Данные и Docker

- `DATABASE_PATH`, `UPLOADS_PATH`. Compose монтирует `./data:/data`.
- Dev: hot reload, volume `app_node_modules` чтобы не затирать native-модуль.
- Prod: multi-stage, `node build`, `HOST=0.0.0.0`, порт 3000 закрыт снаружи — перед ним Caddy (`Caddyfile`) на 80/443, который сам выпускает Let's Encrypt. Домен задаётся через `DOMAIN` (`.env`). Cert-данные Caddy — volume `caddy_data`/`caddy_config`.

Миграции на старте **первого** обращения к БД (`getDb()`), не при импорте модуля (иначе `vite build` открывает SQLite). SQL подключается через `?raw`.

## 8. Фазы реализации UI

1. Устройства + SSE + редирект роли (каркас уже есть).
2. Официант: список (старые сверху), экран позиций заказа/чека, шторка меню снизу, гости/сплит, fire, оплата.
3. KDS.
4. Админ: устройства, меню/uploads, отмена, смена, Excel/P&L.
5. PWA: два манифеста (POS и админ), PNG-иконки, standalone, SW без кэша API; жесты официанта в браузере.
