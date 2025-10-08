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

-- PostgreSQL supports ALTER TABLE DROP COLUMN, so we can do this directly
ALTER TABLE feeds DROP COLUMN email_rule_id;
