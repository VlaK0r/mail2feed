-- Rollback: Restore single email_rule_id to feeds table

-- Step 1: Create new feeds table with email_rule_id
CREATE TABLE feeds_new (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    link TEXT,
    email_rule_id TEXT NOT NULL,
    feed_type TEXT NOT NULL DEFAULT 'rss',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    max_items INTEGER,
    max_age_days INTEGER,
    min_items INTEGER,
    FOREIGN KEY (email_rule_id) REFERENCES email_rules(id) ON DELETE CASCADE
);

-- Step 2: Copy data back with the first email_rule_id from junction table
INSERT INTO feeds_new (id, title, description, link, email_rule_id, feed_type, is_active, created_at, updated_at, max_items, max_age_days, min_items)
SELECT f.id, f.title, f.description, f.link,
       (SELECT email_rule_id FROM feed_email_rules WHERE feed_id = f.id LIMIT 1),
       f.feed_type, f.is_active, f.created_at, f.updated_at, f.max_items, f.max_age_days, f.min_items
FROM feeds f;

-- Step 3: Drop old feeds table
DROP TABLE feeds;

-- Step 4: Rename new table to feeds
ALTER TABLE feeds_new RENAME TO feeds;

-- Step 5: Recreate feed_items foreign key constraint
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

-- Recreate indexes
CREATE INDEX idx_email_rules_imap_account ON email_rules(imap_account_id);
CREATE INDEX idx_feeds_email_rule ON feeds(email_rule_id);
CREATE INDEX idx_feed_items_feed ON feed_items(feed_id);
CREATE INDEX idx_feed_items_pub_date ON feed_items(pub_date);
CREATE INDEX idx_feed_items_message_id ON feed_items(email_message_id);

-- Drop junction table
DROP TABLE feed_email_rules;
