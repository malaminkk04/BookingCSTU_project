CREATE TABLE users (
    user_id INT NOT NULL AUTO_INCREMENT,
    tu_id VARCHAR(20) NOT NULL,
    username VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    name VARCHAR(100) NOT NULL,
    displayname_th VARCHAR(255) NOT NULL,
    faculty VARCHAR(255) NULL,
    major VARCHAR(255) NULL,
    role ENUM('student', 'teacher', 'admin') NOT NULL,
    access_level ENUM('user', 'admin') NOT NULL DEFAULT 'user',
    no_show_count INT NOT NULL DEFAULT 0,
    suspended_until DATETIME NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id),
    UNIQUE KEY uq_users_tu_id (tu_id),
    UNIQUE KEY uq_users_email (email),
    KEY idx_users_username (username)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
