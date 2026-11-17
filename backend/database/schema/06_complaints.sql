CREATE TABLE complaints (
    complaint_id INT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    room_id INT NULL DEFAULT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status ENUM(
        'รอดำเนินการ',
        'กำลังตรวจสอบ',
        'ดำเนินการแล้ว',
        'เสร็จสิ้น'
    ) NOT NULL DEFAULT 'รอดำเนินการ',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (complaint_id),
    KEY idx_complaints_user_created (user_id, created_at),
    KEY idx_complaints_room (room_id),
    KEY idx_complaints_status_created (status, created_at),
    CONSTRAINT fk_complaints_user
        FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE RESTRICT
        ON UPDATE RESTRICT,
    CONSTRAINT fk_complaints_room
        FOREIGN KEY (room_id)
        REFERENCES rooms (room_id)
        ON DELETE SET NULL
        ON UPDATE RESTRICT
) ENGINE=InnoDB
  DEFAULT CHARACTER SET=utf8mb4
  COLLATE=utf8mb4_unicode_ci;
