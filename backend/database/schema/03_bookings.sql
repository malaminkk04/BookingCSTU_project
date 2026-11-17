CREATE TABLE bookings (
    booking_id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    room_id INT NOT NULL,
    booking_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    purpose VARCHAR(500) NOT NULL DEFAULT '',
    status ENUM(
        'reserved',
        'checked_in',
        'completed',
        'cancelled',
        'no_show'
    ) NOT NULL DEFAULT 'reserved',
    cancelled_at DATETIME NULL DEFAULT NULL,
    checked_in_at DATETIME NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (booking_id),
    KEY idx_bookings_room_date_status_start
        (room_id, booking_date, status, start_time),
    KEY idx_bookings_user_date_status
        (user_id, booking_date, status),
    KEY idx_bookings_date_status
        (booking_date, status),
    CONSTRAINT fk_bookings_user
        FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_bookings_room
        FOREIGN KEY (room_id)
        REFERENCES rooms (room_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
