ALTER TABLE menu_categories ADD COLUMN color_hex TEXT NOT NULL DEFAULT '#0F172A';
ALTER TABLE menu_items ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE menu_categories SET color_hex = '#0F766E' WHERE id = 1;
UPDATE menu_categories SET color_hex = '#7C3AED' WHERE id = 2;
UPDATE menu_categories SET color_hex = '#0EA5E9' WHERE id = 3;

UPDATE menu_items SET sort_order = id;
