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
