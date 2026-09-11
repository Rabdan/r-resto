# Модернизация админки

План и реализация модернизации панели администратора (`/admin`). Источник требований — [`../idea_admin.md`](../idea_admin.md) и постановка пользователя.

## 1. Миграция

`006_admin_modernization.sql`:

- `devices.blocked_at` — дата-время блокировки устройства;
- `menu_categories.is_active` — софт-удаление категорий;
- `halls.is_active` / `halls.closed_at` — блокировка/закрытие зала;
- таблица `z_reports` — Z-отчёты по закрытым сменам (итоги + разрезы в JSON).

## 2. Персонал (`/admin/devices`)

Аккордеон: строка сотрудника → раскрытие настроек. Роль для сотрудника **не выбирается** — сотрудник либо обычный (`role='staff'`), либо админ (задан PIN → `role='admin'`). Роль официанта/кухни задаётся **устройству** при привязке (`devices.role`). В настройках: имя, пароль админки (обычное поле с предупреждением), привязанные устройства с блокировкой/разблокировкой и датой `blocked_at`, удаление (софт, `is_active=0`, пометка «удалён», восстановление). Суперадмин защищён от удаления и смены PIN.

Миграция `007_device_role.sql`: `devices.role`, пересоздание `users` (`role IN ('staff','admin')`).

API: `DELETE /api/admin/staff/[id]`, `POST /api/admin/staff/[id]/restore`, `PATCH /api/admin/devices/[id]`, `POST /api/admin/devices/bind` (`role`).

## 3. Меню (`/admin/menu`)

Софт-удаление товаров и категорий. Удаление непустой категории спрашивает «удалить все товары?».

API: `DELETE /api/admin/menu/items/[id]`, `DELETE /api/admin/menu/categories/[id]?deleteItems=1`.

## 4. Чеки (`/admin/prechecks`)

Вкладки: Активные / Закрытые / Отменённые / Все. `GET /api/admin/prechecks?tab=`.

## 5. Смена (`/admin/shift`)

Открытие смены, закрытие смены с расчётом Z-отчёта (`z_reports`), просмотр закрытых смен и их Z-отчётов, Excel.

API: `GET /api/admin/shifts`, `POST /api/admin/shifts/close`, `GET /api/admin/shifts/[id]/z/export`.

## 6. Отчёты (`/admin/analytics`)

5 разрезов: по сменам, по периоду, по товарам, по залам, по официантам + сводка по оплатам. Excel для всех.

API: `GET /api/admin/reports?from&to`, расширен `/api/admin/export`.

## 7. Настройки (`/admin/settings`)

Валюта (уже есть) + управление торговыми залами: добавить, переименовать/цвет, блокировать (остаётся в БД), удалить только при отсутствии движений (заказов).

API: `GET/POST /api/admin/halls`, `PUT/DELETE /api/admin/halls/[id]`.
