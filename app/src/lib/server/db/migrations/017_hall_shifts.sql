-- Смена принадлежит конкретному залу: раздельный учёт по торговым залам.
ALTER TABLE shifts ADD COLUMN hall_id INTEGER REFERENCES halls(id);

-- Одна открытая смена на зал (location_id + hall_id).
CREATE UNIQUE INDEX idx_shifts_open_hall ON shifts(location_id, hall_id) WHERE status = 'open';
