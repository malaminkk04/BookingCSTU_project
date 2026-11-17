CREATE TABLE rooms (
    room_id INT NOT NULL AUTO_INCREMENT,
    room_code VARCHAR(50) NOT NULL,
    floor INT NOT NULL,
    room_name VARCHAR(255) NOT NULL,
    department VARCHAR(100) NULL DEFAULT 'Computer Science',
    capacity INT NOT NULL,
    facilities TEXT NULL,
    department_color VARCHAR(20) NULL DEFAULT NULL,
    is_available TINYINT(1) NULL DEFAULT 1,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    room_type VARCHAR(50) NOT NULL DEFAULT 'meeting_room',
    image_url VARCHAR(500) NULL DEFAULT NULL,
    PRIMARY KEY (room_id),
    UNIQUE KEY uq_rooms_room_code (room_code),
    UNIQUE KEY uq_rooms_room_name (room_name)
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
