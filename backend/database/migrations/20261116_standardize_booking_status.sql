-- MANUAL, SINGLE-USE MIGRATION — DO NOT EXECUTE WITHOUT THE PREFLIGHT BELOW.
--
-- This project has no identified migration runner or verified MySQL server
-- version. The checks below are diagnostic SELECT/SHOW statements, not an
-- in-file guard: a SQL client cannot safely abort the later DDL based on a
-- previous SELECT result in a portable way. Run each preflight statement
-- separately, inspect its result, and do not continue if any stop condition
-- is met. Do not execute this file as an unattended batch.
--
-- Before preflight:
-- 1. Confirm the selected database is the intended, isolated target.
-- 2. Take and verify a restorable backup.
-- 3. Stop all booking writers, scheduled jobs, and old application instances.
-- 4. Never use database/database.sql for this purpose. It is a fresh-schema
--    bootstrap for an empty BookingCSTU_test database, not an existing-DB
--    migration.
--
-- PRE-FLIGHT (read-only; execute separately and inspect):
--
-- A. Confirm the target database and complete table definition:
--    SELECT DATABASE();
--    SHOW CREATE TABLE bookings;
--    SHOW COLUMNS FROM bookings;
--    SHOW INDEX FROM bookings;
--    SELECT TRIGGER_NAME, EVENT_OBJECT_TABLE, ACTION_STATEMENT
--    FROM INFORMATION_SCHEMA.TRIGGERS
--    WHERE TRIGGER_SCHEMA = DATABASE()
--      AND EVENT_OBJECT_TABLE = 'bookings';
--
-- B. Confirm the status column exactly matches the expected legacy definition
--    before running this migration. The canonical definition means this
--    migration has already been applied: stop and do not run it again.
--    Any other result, missing table/column, unexpected comment, collation,
--    NULL rule, default, or extra attribute is a stop condition.
--    SELECT
--      c.COLUMN_TYPE,
--      c.IS_NULLABLE,
--      c.COLUMN_DEFAULT,
--      c.COLUMN_COMMENT,
--      c.CHARACTER_SET_NAME,
--      c.COLLATION_NAME,
--      c.EXTRA,
--      t.TABLE_COLLATION
--    FROM INFORMATION_SCHEMA.COLUMNS AS c
--    JOIN INFORMATION_SCHEMA.TABLES AS t
--      ON t.TABLE_SCHEMA = c.TABLE_SCHEMA
--     AND t.TABLE_NAME = c.TABLE_NAME
--    WHERE c.TABLE_SCHEMA = DATABASE()
--      AND c.TABLE_NAME = 'bookings'
--      AND c.COLUMN_NAME = 'status';
--
--    Expected legacy COLUMN_TYPE:
--      enum('confirmed','checked_in','completed','cancelled','no_show')
--    Expected legacy nullability/default from the original source schema:
--      IS_NULLABLE = 'YES', COLUMN_DEFAULT = 'confirmed'
--    The column must have no comment or extra attribute, and its collation
--    must equal TABLE_COLLATION. If the deployed definition differs, stop;
--    do not infer missing attributes or run these MODIFY statements.
--    Record the indexes, constraints, and triggers from the SHOW results.
--    Stop if any dependency references 'confirmed' or if its preservation
--    cannot be verified; compare those definitions again after migration.
--
-- C. Inspect every stored status and verify no NULL, empty/unknown, or
--    unsupported value exists. The empty-table case is valid. Do not map
--    NULL or unknown values automatically.
--    SELECT status, COUNT(*) AS total
--    FROM bookings
--    GROUP BY status;
--
--    SELECT COUNT(*) AS confirmed_count
--    FROM bookings
--    WHERE status = 'confirmed';
--
--    SELECT COUNT(*) AS null_status_count
--    FROM bookings
--    WHERE status IS NULL;
--
--    SELECT COUNT(*) AS unknown_status_count
--    FROM bookings
--    WHERE status IS NOT NULL
--      AND status NOT IN (
--        'confirmed',
--        'reserved',
--        'checked_in',
--        'completed',
--        'cancelled',
--        'no_show'
--      );
--
--    Stop unless both counts are zero. Record the total and per-status counts
--    for post-migration comparison. Also inspect triggers for assumptions
--    about 'confirmed'; the source files cannot reveal deployed triggers.
--
-- MAPPING:
--   confirmed -> reserved
--   reserved, checked_in, completed, cancelled, no_show -> unchanged
--   NULL and unknown values -> never converted by this migration
--
-- APPLY ONLY after all preflight checks pass and writes remain stopped.
-- The source schema defines status as nullable, with no column comment and
-- no column-specific collation. These definitions explicitly retain NULL,
-- the default, and the empty comment; preflight requires the column to inherit
-- the table collation so omitting a column-specific COLLATE is safe.
--
-- Stage 1 temporarily accepts the legacy and canonical booking statuses.
ALTER TABLE bookings
    MODIFY COLUMN status ENUM(
        'confirmed',
        'reserved',
        'checked_in',
        'completed',
        'cancelled',
        'no_show'
    ) NULL DEFAULT 'reserved' COMMENT '';

-- Only the known legacy value is mapped. All other accepted values stay as-is.
UPDATE bookings
SET status = 'reserved'
WHERE status = 'confirmed';

-- Stage 2 removes the legacy value after conversion.
ALTER TABLE bookings
    MODIFY COLUMN status ENUM(
        'reserved',
        'checked_in',
        'completed',
        'cancelled',
        'no_show'
    ) NULL DEFAULT 'reserved' COMMENT '';

-- POST-FLIGHT (read-only; execute separately):
--    SHOW CREATE TABLE bookings;
--    SELECT status, COUNT(*) AS total FROM bookings GROUP BY status;
--    SELECT COUNT(*) AS null_status_count
--    FROM bookings WHERE status IS NULL;
--    SELECT COUNT(*) AS legacy_or_unknown_count
--    FROM bookings
--    WHERE status IS NULL OR status NOT IN (
--      'reserved', 'checked_in', 'completed', 'cancelled', 'no_show'
--    );
-- Verify no NULL/legacy/unknown values, unchanged total row count, unchanged
-- counts for checked_in/completed/cancelled/no_show, and reserved count equal
-- to its preflight count plus the preflight confirmed count. Compare the
-- column attributes, indexes, constraints, and triggers with the preflight.
-- Keep writes stopped until these checks pass.
--
-- IDEMPOTENCY: this is intentionally a gated, single-use migration, not an
-- automatically idempotent script. If preflight reports the canonical ENUM,
-- skip it. A rerun without that gate temporarily re-adds 'confirmed'.
--
-- FAILURE / RECOVERY:
-- MySQL DDL may implicitly commit; a transaction cannot roll back both ALTERs
-- and the UPDATE as one unit. If Stage 1 succeeds but a later statement fails,
-- keep application writes stopped, inspect the current schema and row counts,
-- then either resolve and continue under a reviewed recovery plan or restore
-- the verified backup during a maintenance window.
-- Do not reverse-map reserved to confirmed: after conversion, original
-- confirmed rows cannot be distinguished from pre-existing reserved rows.
-- No automatic rollback SQL is safe without the backup/pre-migration data.
