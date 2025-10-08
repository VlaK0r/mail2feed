-- Rollback: Restore single email_rule_id to feeds table

-- Add email_rule_id column back to feeds
ALTER TABLE feeds ADD COLUMN email_rule_id TEXT;

-- Populate email_rule_id with the first rule from junction table
UPDATE feeds f
SET email_rule_id = (
    SELECT email_rule_id
    FROM feed_email_rules
    WHERE feed_id = f.id
    LIMIT 1
);

-- Make email_rule_id NOT NULL after populating
ALTER TABLE feeds ALTER COLUMN email_rule_id SET NOT NULL;

-- Add foreign key constraint
ALTER TABLE feeds
ADD CONSTRAINT feeds_email_rule_id_fkey
FOREIGN KEY (email_rule_id) REFERENCES email_rules(id) ON DELETE CASCADE;

-- Recreate index
CREATE INDEX idx_feeds_email_rule ON feeds(email_rule_id);

-- Drop junction table
DROP TABLE feed_email_rules;
