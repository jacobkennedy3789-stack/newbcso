
CREATE TABLE deputies(
id SERIAL PRIMARY KEY,
name TEXT,
callsign TEXT,
rank TEXT,
division TEXT,
username TEXT UNIQUE,
password TEXT,
photo TEXT,
locked BOOLEAN DEFAULT false,
admin BOOLEAN DEFAULT false,
can_promote BOOLEAN DEFAULT false,
can_demote BOOLEAN DEFAULT false,
can_add_notes BOOLEAN DEFAULT false,
can_lockdown BOOLEAN DEFAULT false,
created TIMESTAMP,
hire_date DATE
);

CREATE TABLE notes(
id SERIAL PRIMARY KEY,
deputy_id INT,
note TEXT,
created TIMESTAMP
);

CREATE TABLE promotions(
id SERIAL PRIMARY KEY,
deputy_id INT,
rank TEXT,
created TIMESTAMP
);

CREATE TABLE audit_logs(
id SERIAL PRIMARY KEY,
username TEXT,
action TEXT,
created TIMESTAMP
);
