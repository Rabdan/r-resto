CREATE TABLE device_halls (
	device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
	hall_id INTEGER NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
	PRIMARY KEY (device_id, hall_id)
);
