DROP DATABASE IF EXISTS BookingCSTU_project;

CREATE DATABASE BookingCSTU_project
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE BookingCSTU_project;

SOURCE tables/users.sql;
SOURCE tables/rooms.sql;
SOURCE tables/bookings.sql;
SOURCE tables/checkins.sql;
SOURCE tables/reviews.sql;