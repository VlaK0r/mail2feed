-- Create junction table for many-to-many relationship between feeds and email rules
CREATE TABLE feed_email_rules (
    feed_id TEXT NOT NULL,
    email_rule_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (feed_id, email_rule_id),
    FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE,
    FOREIGN KEY (email_rule_id) REFERENCES email_rules(id) ON DELETE CASCADE
);

-- Migrate existing data: copy current feed-rule relationships to junction table
INSERT INTO feed_email_rules (feed_id, email_rule_id, created_at)
SELECT id, email_rule_id, updated_at
FROM feeds;

-- Create indexes for better query performance
CREATE INDEX idx_feed_email_rules_feed ON feed_email_rules(feed_id);
CREATE INDEX idx_feed_email_rules_rule ON feed_email_rules(email_rule_id);

-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the feeds table
-- Step 1: Create new feeds table without email_rule_id
CREATE TABLE feeds_new (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    link TEXT,
    feed_type TEXT NOT NULL DEFAULT 'rss',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    max_items INTEGER,
    max_age_days INTEGER,
    min_items INTEGER
);

-- Step 2: Copy data to new table (excluding email_rule_id)
INSERT INTO feeds_new (id, title, description, link, feed_type, is_active, created_at, updated_at, max_items, max_age_days, min_items)
SELECT id, title, description, link, feed_type, is_active, created_at, updated_at, max_items, max_age_days, min_items
FROM feeds;

-- Step 3: Drop old feeds table
DROP TABLE feeds;

-- Step 4: Rename new table to feeds
ALTER TABLE feeds_new RENAME TO feeds;

-- Step 5: Recreate feed_items foreign key constraint by recreating the table
CREATE TABLE feed_items_new (
    id TEXT PRIMARY KEY,
    feed_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    link TEXT,
    author TEXT,
    pub_date TEXT NOT NULL,
    email_message_id TEXT,
    email_subject TEXT,
    email_from TEXT,
    email_body TEXT,
    created_at TEXT NOT NULL,
    is_read BOOLEAN,
    starred BOOLEAN,
    body_size INTEGER,
    FOREIGN KEY (feed_id) REFERENCES feeds(id) ON DELETE CASCADE
);

INSERT INTO feed_items_new SELECT * FROM feed_items;
DROP TABLE feed_items;
ALTER TABLE feed_items_new RENAME TO feed_items;

-- Recreate feed_items indexes
CREATE INDEX idx_feed_items_feed ON feed_items(feed_id);
CREATE INDEX idx_feed_items_pub_date ON feed_items(pub_date);
CREATE INDEX idx_feed_items_message_id ON feed_items(email_message_id);
