-- FRESH SETUP ONLY for a dedicated, empty test database.
-- This script never drops or resets a database. Do not run it against
-- BookingCSTU_project, production, or any database that already has tables.
CREATE DATABASE IF NOT EXISTS BookingCSTU_test
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE BookingCSTU_test;

SOURCE schema/01_users.sql;
SOURCE schema/02_rooms.sql;
SOURCE schema/03_bookings.sql;
SOURCE schema/04_room_reviews.sql;
SOURCE schema/05_system_reviews.sql;
SOURCE schema/06_complaints.sql;
SOURCE schema/07_repair_reports.sql;
