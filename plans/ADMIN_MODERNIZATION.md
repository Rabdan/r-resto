# Модернизация админки

План и реализация модернизации панели администратора (`/admin`). Источник требований — [`../idea_admin.md`](../idea_admin.md) и постановка пользователя.

## 1. Миграция

`006_admin_modernization.sql`:

- `devices.blocked_at` — дата-время блокировки устройства;
- `menu_categories.is_active` — софт-удаление категорий;
- `halls.is_active` / `halls.closed_at` — блокировка/закрытие зала;
- таблица `z_reports` — Z-отчёты по закрытым сменам (итоги + разрезы в JSON).

## 2. Персонал (`/admin/devices`)

Карточка сотрудника: имя, тумблер **Админ** (поле PIN появляется только при включении; предупреждение про полный доступ и `0000`), устройства с несколькими POS-ролями, блокировка тумблером, удаление (софт, `is_active=0`). Суперадмин защищён от удаления, снятия админки и смены PIN.

Роли **официант** и **кухня** задаются устройству независимо (`device_roles`, можно обе сразу). `devices.role` — основная (первая) роль для совместимости. Админ — PIN на пользователе (`users.role='admin'`), не роль устройства и не `device_uuid`.

Миграции: `007_device_role.sql` (`devices.role`, `users.role IN ('staff','admin')`); `012_device_roles.sql` (несколько POS-ролей на устройство).

API: `DELETE /api/admin/staff/[id]`, `POST /api/admin/staff/[id]/restore`, `PATCH /api/admin/devices/[id]` (`roles[]`), `POST /api/admin/devices/bind` (`roles[]`).

## 3. Меню (`/admin/menu`)

Софт-удаление товаров и категорий. Удаление непустой категории спрашивает «удалить все товары?».

API: `DELETE /api/admin/menu/items/[id]`, `DELETE /api/admin/menu/categories/[id]?deleteItems=1`.

## 4. Чеки

Отдельного пункта навигации нет: `/admin/orders` редиректит на `/admin/shift`. Отмена заказа — на текущей смене.

API: `GET /api/admin/orders` (заказы и чеки открытой смены), `POST /api/admin/orders/:id/cancel`.

## 5. Смена (`/admin/shift`)

Открытие смены. На открытой смене: выручка банк/касса, вкладки чеков (все / незакрытые / закрытые / отменённые), отмена заказа, таблица расходов (время, сумма, банк/наличные, примечание). Закрытие смены блокируется, пока есть незакрытые заказы; Z-отчёт (`z_reports`) как раньше.

Закрытые смены: число чеков, выручка, расходы, итого (выручка − расходы); раскрытие — нал/банк, залы, официанты, список расходов, Excel.

Миграция `010_shift_expenses.sql`: `expenses.shift_id`, `payment_method` (`cash` | `cashless`).

API: `GET /api/admin/shifts`, `POST /api/admin/shifts/close`, `GET /api/admin/shifts/[id]/export`, `POST /api/admin/expenses`, `DELETE /api/admin/expenses/[id]`.

## 6. Отчёты (`/admin/analytics`)

5 разрезов: по сменам, по периоду, по товарам, по залам, по официантам + сводка по оплатам. Excel для всех.

API: `GET /api/admin/reports?from&to`, расширен `/api/admin/export`.

## 7. Настройки (`/admin/settings`)

Валюта + торговые залы. В списке зала — статус и правка. Блок/удаление только в карточке: тумблер «Активен», кнопка «Удалить» (нет заказов — hard delete; есть заказы — блокировка `is_active=0`, история сохраняется).

API: `GET/POST /api/admin/halls`, `PUT/DELETE /api/admin/halls/[id]`.
