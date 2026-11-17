-- PHASE 6 — LIVE SCHEMA ALIGNMENT
--
-- One-time, manually reviewed migration for the deployed BookingCSTU_project
-- schema inspected on 2026-11-17. This does not drop tables or rows.
-- Do not run unless the preflight checks below have been verified and a
-- complete, readable backup has been made. Run only against the main schema.
--
-- PRE-FLIGHT (all must be true):
-- 1. SELECT DATABASE() identifies BookingCSTU_project (case may be normalized
--    by lower_case_table_names=2).
-- 2. `room_reviews` and `system_reviews` do not exist.
-- 3. Every legacy `reviews` row belongs to its booking owner, its booking is
--    completed, the rating is 1–5, booking_id is unique, comments are not
--    NULL and are at most 1,000 characters, and statuses are understood.
-- 4. `bookings` has no NULL/unknown status and no `confirmed` rows.
-- 5. Complaint and repair statuses are all in the target ENUMs; descriptions
--    and user_id are non-NULL; room references have no orphans.
-- 6. Existing booking and report references have no orphans.
-- 7. A restorable backup exists outside the repository.
--
-- Legacy reviews are copied to `room_reviews` with their original IDs and
-- timestamps. `แสดงผล` maps to `visible`; other known hidden labels map to
-- `hidden`. `INSERT IGNORE` keeps a concurrent new review unchanged if it
-- wins the unique booking key first. The legacy `reviews` and `checkins`
-- tables are retained for data preservation and compatibility.

CREATE TABLE room_reviews (
    review_id INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment VARCHAR(1000) NOT NULL,
    status ENUM('visible', 'hidden') NOT NULL DEFAULT 'visible',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (review_id),
    UNIQUE KEY uq_room_reviews_booking (booking_id),
    KEY idx_room_reviews_status_created (status, created_at),
    CONSTRAINT fk_room_reviews_booking
        FOREIGN KEY (booking_id)
        REFERENCES bookings (booking_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

CREATE TABLE system_reviews (
    review_id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    rating TINYINT UNSIGNED NOT NULL,
    comment VARCHAR(1000) NOT NULL,
    status ENUM('visible', 'hidden') NOT NULL DEFAULT 'visible',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (review_id),
    KEY idx_system_reviews_user_created (user_id, created_at),
    KEY idx_system_reviews_status_created (status, created_at),
    CONSTRAINT fk_system_reviews_user
        FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO room_reviews
    (review_id, booking_id, rating, comment, status, created_at)
SELECT
    legacy.review_id,
    legacy.booking_id,
    legacy.rating,
    legacy.comment,
    CASE
        WHEN legacy.status IN ('แสดงผล', 'visible', 'approved') THEN 'visible'
        WHEN legacy.status IN ('ซ่อน', 'hidden', 'rejected') THEN 'hidden'
        ELSE NULL
    END,
    COALESCE(legacy.created_at, CURRENT_TIMESTAMP)
FROM reviews AS legacy
JOIN bookings AS booking
  ON booking.booking_id = legacy.booking_id
 AND booking.user_id = legacy.user_id
 AND booking.status = 'completed'
WHERE legacy.rating BETWEEN 1 AND 5
  AND legacy.comment IS NOT NULL
  AND CHAR_LENGTH(legacy.comment) <= 1000
  AND legacy.status IN ('แสดงผล', 'visible', 'approved', 'ซ่อน', 'hidden', 'rejected');

ALTER TABLE users
    MODIFY COLUMN username VARCHAR(100) NOT NULL,
    MODIFY COLUMN email VARCHAR(255) NULL DEFAULT NULL,
    MODIFY COLUMN displayname_th VARCHAR(255) NOT NULL,
    MODIFY COLUMN faculty VARCHAR(255) NULL DEFAULT NULL,
    MODIFY COLUMN major VARCHAR(255) NULL DEFAULT NULL,
    ADD KEY idx_users_username (username);

ALTER TABLE bookings
    MODIFY COLUMN purpose VARCHAR(500) NOT NULL DEFAULT '',
    MODIFY COLUMN status ENUM(
        'reserved',
        'checked_in',
        'completed',
        'cancelled',
        'no_show'
    ) NOT NULL DEFAULT 'reserved',
    ADD KEY idx_bookings_room_date_status_start
        (room_id, booking_date, status, start_time),
    ADD KEY idx_bookings_user_date_status
        (user_id, booking_date, status),
    ADD KEY idx_bookings_date_status
        (booking_date, status);

ALTER TABLE bookings
    DROP FOREIGN KEY fk_booking_user,
    DROP FOREIGN KEY fk_booking_room,
    ADD CONSTRAINT fk_bookings_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT fk_bookings_room
        FOREIGN KEY (room_id) REFERENCES rooms (room_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE complaints
    MODIFY COLUMN description TEXT NOT NULL,
    MODIFY COLUMN status ENUM(
        'รอดำเนินการ', 'กำลังตรวจสอบ', 'ดำเนินการแล้ว', 'เสร็จสิ้น'
    ) NOT NULL DEFAULT 'รอดำเนินการ',
    ADD KEY idx_complaints_status_created (status, created_at),
    ADD CONSTRAINT fk_complaints_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT fk_complaints_room
        FOREIGN KEY (room_id) REFERENCES rooms (room_id)
        ON DELETE SET NULL ON UPDATE RESTRICT;

ALTER TABLE repair_reports
    MODIFY COLUMN description TEXT NOT NULL,
    MODIFY COLUMN status ENUM(
        'รอดำเนินการ', 'กำลังซ่อม', 'ซ่อมเสร็จ', 'ยกเลิก'
    ) NOT NULL DEFAULT 'รอดำเนินการ',
    ADD KEY idx_repair_reports_user_created (user_id, created_at),
    ADD KEY idx_repair_reports_room (room_id),
    ADD KEY idx_repair_reports_status_created (status, created_at),
    ADD CONSTRAINT fk_repair_reports_user
        FOREIGN KEY (user_id) REFERENCES users (user_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT fk_repair_reports_room
        FOREIGN KEY (room_id) REFERENCES rooms (room_id)
        ON DELETE SET NULL ON UPDATE RESTRICT;

-- POST-FLIGHT: compare table counts, all statuses, migrated review count,
-- columns, indexes, and foreign-key rules with the recorded pre-flight.
