-- Synthetic fixtures for a fresh, dedicated BookingCSTU_test database only.
-- Verify NODE_ENV, configured DB_NAME, and SELECT DATABASE() before applying.
-- This file does not create or select a database.

SET @test_past_weekday = DATE_SUB(
    CURDATE(),
    INTERVAL (
        CASE DAYOFWEEK(CURDATE())
            WHEN 1 THEN 2
            WHEN 2 THEN 3
            WHEN 7 THEN 1
            ELSE 1
        END
    ) DAY
);

SET @test_future_weekday = DATE_ADD(
    CURDATE(),
    INTERVAL (
        CASE DAYOFWEEK(CURDATE())
            WHEN 6 THEN 3
            WHEN 7 THEN 2
            ELSE 1
        END
    ) DAY
);

SET @test_checkin_start = CASE
    WHEN CURTIME() < '00:15:00' THEN '00:00:00'
    WHEN CURTIME() >= '23:15:00' THEN '22:30:00'
    ELSE TIME_SUB(CURTIME(), INTERVAL 15 MINUTE)
END;

SET @test_checkin_end = CASE
    WHEN CURTIME() < '00:15:00' THEN '00:45:00'
    WHEN CURTIME() >= '23:15:00' THEN '23:59:00'
    ELSE TIME_ADD(CURTIME(), INTERVAL 45 MINUTE)
END;

INSERT INTO users (
    user_id,
    tu_id,
    username,
    email,
    name,
    displayname_th,
    faculty,
    major,
    role,
    access_level,
    no_show_count,
    suspended_until
) VALUES
    (
        900001,
        'TEST-STUDENT-001',
        'test_student_001',
        'student001@example.test',
        'Test Student One',
        'ผู้ใช้ทดสอบนักศึกษา 1',
        'คณะวิทยาศาสตร์และเทคโนโลยี',
        'Test Major',
        'student',
        'user',
        0,
        NULL
    ),
    (
        900002,
        'TEST-TEACHER-001',
        'test_teacher_001',
        'teacher001@example.test',
        'Test Teacher One',
        'ผู้ใช้ทดสอบอาจารย์ 1',
        'คณะวิทยาศาสตร์และเทคโนโลยี',
        'Test Major',
        'teacher',
        'user',
        0,
        NULL
    ),
    (
        900003,
        'TEST-ADMIN-001',
        'test_admin_001',
        'admin001@example.test',
        'Test Admin One',
        'ผู้ใช้ทดสอบผู้ดูแล 1',
        'คณะวิทยาศาสตร์และเทคโนโลยี',
        'Test Major',
        'admin',
        'admin',
        0,
        NULL
    );

INSERT INTO rooms (
    room_id,
    room_code,
    floor,
    room_name,
    department,
    capacity,
    facilities,
    department_color,
    is_available,
    room_type,
    image_url
) VALUES
    (
        910001,
        '301',
        3,
        'Test Room 301',
        'Test Department',
        6,
        'Synthetic test room',
        'blue',
        1,
        'meeting_room',
        NULL
    ),
    (
        910002,
        '302',
        3,
        'Test Room 302',
        'Test Department',
        6,
        'Synthetic test room',
        'blue',
        1,
        'meeting_room',
        NULL
    ),
    (
        910003,
        '303',
        3,
        'Test Room 303',
        'Test Department',
        6,
        'Synthetic test room',
        'blue',
        1,
        'meeting_room',
        NULL
    ),
    (
        910004,
        'TEST-T01',
        2,
        'Test Teacher Room',
        'Test Department',
        12,
        'Synthetic test room',
        'blue',
        1,
        'meeting_room',
        NULL
    );

INSERT INTO bookings (
    booking_id,
    user_id,
    room_id,
    booking_date,
    start_time,
    end_time,
    purpose,
    status,
    cancelled_at,
    checked_in_at
) VALUES
    (
        920001,
        900001,
        910001,
        @test_past_weekday,
        '09:00:00',
        '10:00:00',
        'Synthetic completed booking',
        'completed',
        NULL,
        TIMESTAMP(@test_past_weekday, '09:00:00')
    ),
    (
        920002,
        900001,
        910002,
        @test_past_weekday,
        '10:00:00',
        '11:00:00',
        'Synthetic cancelled booking',
        'cancelled',
        TIMESTAMP(@test_past_weekday, '08:30:00'),
        NULL
    ),
    (
        920003,
        900001,
        910003,
        @test_past_weekday,
        '11:00:00',
        '12:00:00',
        'Synthetic no-show booking',
        'no_show',
        NULL,
        NULL
    ),
    (
        920004,
        900001,
        910001,
        @test_future_weekday,
        '09:00:00',
        '10:00:00',
        'Synthetic reserved booking',
        'reserved',
        NULL,
        NULL
    ),
    (
        920005,
        900002,
        910004,
        CURDATE(),
        @test_checkin_start,
        @test_checkin_end,
        'Synthetic checked-in status fixture',
        'checked_in',
        NULL,
        TIMESTAMP(CURDATE(), CURTIME())
    );

INSERT INTO room_reviews (
    review_id,
    booking_id,
    rating,
    comment,
    status
) VALUES (
    930001,
    920001,
    5,
    'Synthetic room review for a completed test booking.',
    'visible'
);

INSERT INTO system_reviews (
    review_id,
    user_id,
    rating,
    comment,
    status
) VALUES
    (
        940001,
        900001,
        5,
        'Synthetic visible system review.',
        'visible'
    ),
    (
        940002,
        900002,
        3,
        'Synthetic hidden system review.',
        'hidden'
    );

INSERT INTO complaints (
    complaint_id,
    user_id,
    room_id,
    subject,
    description,
    status
) VALUES
    (
        950001,
        900001,
        NULL,
        'Synthetic general complaint',
        'Synthetic complaint without a room reference.',
        'รอดำเนินการ'
    ),
    (
        950002,
        900002,
        910001,
        'Synthetic room complaint',
        'Synthetic complaint linked to a test room.',
        'กำลังตรวจสอบ'
    ),
    (
        950003,
        900001,
        910002,
        'Synthetic processed complaint',
        'Synthetic complaint in processed state.',
        'ดำเนินการแล้ว'
    ),
    (
        950004,
        900002,
        NULL,
        'Synthetic finished complaint',
        'Synthetic complaint in finished state.',
        'เสร็จสิ้น'
    );

INSERT INTO repair_reports (
    repair_id,
    user_id,
    room_id,
    subject,
    description,
    status
) VALUES
    (
        960001,
        900001,
        NULL,
        'Synthetic general repair report',
        'Synthetic repair report without a room reference.',
        'รอดำเนินการ'
    ),
    (
        960002,
        900002,
        910001,
        'Synthetic room repair report',
        'Synthetic repair report linked to a test room.',
        'กำลังซ่อม'
    ),
    (
        960003,
        900001,
        910002,
        'Synthetic completed repair report',
        'Synthetic repair report in completed state.',
        'ซ่อมเสร็จ'
    ),
    (
        960004,
        900002,
        NULL,
        'Synthetic cancelled repair report',
        'Synthetic repair report in cancelled state.',
        'ยกเลิก'
    );
