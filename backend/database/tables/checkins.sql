CREATE TABLE checkins (
    checkin_id INT AUTO_INCREMENT PRIMARY KEY,

    booking_id INT NOT NULL UNIQUE,

    checkin_time DATETIME NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_checkin_booking
        FOREIGN KEY (booking_id)
        REFERENCES bookings(booking_id)
        ON DELETE CASCADE
        ON UPDATE CASCADE
);