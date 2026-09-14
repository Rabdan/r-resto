# AGENTS.md — R-resto

Инструкции для агентов, работающих с этим репозиторием. Код приложения живёт **только** в [`app/`](app/). Корень — ТЗ, планы, Docker Compose, персистентные данные.

Источники требований: [`plans/ARCHITECTURE.md`](plans/ARCHITECTURE.md), [`plans/WAITER_UX.md`](plans/WAITER_UX.md), [`plans/ADMIN_MODERNIZATION.md`](plans/ADMIN_MODERNIZATION.md).

## Границы репозитория

| Путь | Назначение |
| --- | --- |
| `app/` | SvelteKit 2 + Svelte 5. `src/`, `package.json`, `Dockerfile`, `Dockerfile.dev` |
| `data/sqlite/` | SQLite (`pos.db`, WAL-файлы). Не коммитить `.db` |
| `data/uploads/menu/`, `data/uploads/qr/` | Фото блюд, QR оплаты |
| `plans/` | Архитектура и UX. Менять вместе с кодом, если расходятся |
| `docker-compose.dev.yml`, `docker-compose.prod.yml` | Оркестрация. Context: `./app` |

Не класть `src/` в корень. Не подключать ORM (Drizzle, Prisma, Kysely). Не менять realtime на WebSocket без явного запроса — используем SSE.

Не повышать major до **SvelteKit 3** без явной просьбы пользователя. Текущий стек: Kit 2.x (адаптер в `vite.config.ts`), Svelte 5 runes.

## Svelte 5

- Компоненты только в режиме runes (`runes: true` в `vite.config.ts`).
- Пропсы: `let { foo, children }: Props = $props();` — не `export let`.
- Состояние: `$state`, производные: `$derived` / `$derived.by`, побочки: `$effect`. Не использовать устаревшие `$:` для новой логики.
- Двусторонние пропсы: `$bindable()`.
- Слоты: `{@render children()}` и `{#snippet}` — не `<slot>`.
- События: `onclick={...}` — не `on:click`. Модификаторы: `onclick={(e) => ...}` вместо `on:click|preventDefault` где возможно.
- `$effect` не должен безусловно писать в ту же реактивность, от которой зависит — иначе цикл. Для «запустить один раз» — `$effect.pre` / явное условие / `onMount`.
- Не тащить внешние store-библиотеки (writable из `svelte/store`) в новый код. Исключение: тонкий контекст устройства через `setContext` / `getContext`.

## SvelteKit 2 (этот репозиторий)

- Конфиг Kit — в [`app/vite.config.ts`](app/vite.config.ts) (`sveltekit({ adapter, compilerOptions })`). Отдельный `svelte.config.js` **не** создавать, пока проект на Kit ≥ 2.62.
- Адаптер: `@sveltejs/adapter-node`. Не `adapter-auto`, не `adapter-static` (нужны SQLite, SSE, uploads).
- Приложение — **SPA с Node-бэкендом**: в [`app/src/routes/+layout.ts`](app/src/routes/+layout.ts) задано `ssr = false`. Клиентский роутер + API/SSE на том же origin. Не включать SSR на POS-экранах.
- Серверный код только в:
  - `app/src/lib/server/**`
  - `+page.server.ts` / `+layout.server.ts` (для SPA почти не нужны)
  - `+server.ts` (REST/SSE)
  - `hooks.server.ts`
- Не импортировать `$lib/server/**` из клиентских `.svelte` / `+page.ts`. Для клиента — `fetch('/api/...')`.
- `better-sqlite3` — native addon. В Vite: `ssr.external: ['better-sqlite3']`. Не бандлировать его.
- Хуки: cookie `device_uuid` (терминал) и `admin_session` (админ). Официант/кухня — таблица `devices`. Админ — PIN, не привязка устройства.
- Админка: вход на `/admin` цифровым паролем (4–8 цифр, numpad). Суперадмин по умолчанию: **1708**. PIN в БД как `scrypt` (`salt:hash`), не plaintext. Не логировать PIN.
- Формы POS — JSON API, не progressive enhancement / Form Actions. Терминал должен работать как приложение, а не как сайт с перезагрузкой.
- PWA: `static/manifest.webmanifest` (POS, `/`) и `static/admin.webmanifest` (админ, `/admin`) + `src/service-worker.ts`. **Не** кэшировать `/api/*` и SSE. Service worker не должен отдавать устаревшее меню как истину — меню обновляется событием `MENU_UPDATED`.

## SQLite без ORM

- Один процесс Node — один singleton [`app/src/lib/server/db/index.ts`](app/src/lib/server/db/index.ts).
- Драйвер: `better-sqlite3`. Синхронный API. Запросы: `db.prepare(...).get/all/run`.
- Обязательные pragma: `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`.
- Схема — SQL-файлы в `app/src/lib/server/db/migrations/`, подключаются через `?raw` в [`migrate.ts`](app/src/lib/server/db/migrate.ts) (чтобы `vite build` не искал файлы на диске). Имена `00N_*.sql`, учёт в `schema_migrations`. Не править уже применённую миграцию — добавить новую и зарегистрировать импорт в `migrate.ts`.
- Соединение ленивое (`getDb()`): импорт модуля при `vite build` не открывает SQLite.
- Деньги — **INTEGER копейки** (`price_cents`, `amount_cents`). Никогда `REAL`/`FLOAT` для денег. Формат в UI: [`app/src/lib/money.ts`](app/src/lib/money.ts).
- Мутации заказа, сплит, оплата, закрытие смены — `db.transaction(() => { ... })()`. **Не** держать транзакцию через `await` (sqlite sync, но нельзя смешивать с промисами внутри транзакции).
- Именованные плейсхолдеры: `@id`, не конкатенация строк. `prepare` один раз на модуль, если запрос горячий.
- Пути: `DATABASE_PATH`, `UPLOADS_PATH`. Локально по умолчанию `../data/...` от cwd=`app/`. В Docker: `/data/sqlite/pos.db`, `/data/uploads`.
- После `npm ci` в Linux-контейнере: native rebuild (`npm rebuild better-sqlite3`), если бинарник с хоста.

## Интерфейсы — что нельзя упрощать

Официант — **главный** интерфейс. Не сводить конструктор заказа к «список + форма». Обязательны (см. `plans/WAITER_UX.md`):

- плиточное меню (2 колонки на телефоне);
- красный балун количества на плитке; корректировка `−`/`+` только в списке позиций;
- экран позиций заказа/чека; шторка меню снизу до итогов (новый заказ — открыта, существующий и закрытый — закрыта);
- гости и сплит (tap-to-move, не только DnD);
- «На кухню» (`held` → `pending`); официант не удаляет уже отправленное;
- оплата по гостям; заказ `closed` только когда все гости оплачены;
- отмена заказа — только админ.

Кухня: светлая тема, зоны ≥ 56px, новые сверху, фильтр зала («Все»), двойной тап позиции — готово / снова на кухне; официант видит «Готов» через 10 с.

Админ: mobile-first, вход по PIN (`/admin`), нижняя навигация, Excel через ExcelJS на сервере. Устройства привязываются только к официанту и кухне.

## Docker

- Dev: `docker compose -f docker-compose.dev.yml up --build` из корня. Bind-mount `./app`, volume `app_node_modules`, `./data:/data`.
- Prod: `docker compose -f docker-compose.prod.yml up --build`. Volume только `./data`.
- Не копировать `data/` в образ.

## Стиль кода

- TypeScript strict. UI на русском.
- Tailwind, тёмная база `slate-900`. Touch-target официант ≥ 48px, кухня ≥ 56px.
- Не добавлять библиотеки жестов/анимаций, пока хватает Pointer Events + CSS. Шторка — кастомный pointer, не `dialog` на весь экран без snap.
- Комментарии — только неочевидное (деньги, жесты, транзакции).
