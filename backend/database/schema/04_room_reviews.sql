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
