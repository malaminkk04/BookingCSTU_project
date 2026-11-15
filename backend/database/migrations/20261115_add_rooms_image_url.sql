-- Apply once to an existing database after confirming the column is absent.
-- This nullable column preserves existing room rows and booking relationships.
ALTER TABLE rooms
    ADD COLUMN image_url VARCHAR(500) DEFAULT NULL;
