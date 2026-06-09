-- schema.sql

DROP TABLE IF EXISTS discord_users;

CREATE TABLE discord_users (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    global_name TEXT,
    avatar TEXT,
    locale TEXT,
    bpm INTEGER DEFAULT 90,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
