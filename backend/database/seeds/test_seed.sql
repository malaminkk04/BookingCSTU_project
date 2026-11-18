
-- Synthetic fixtures for BookingCSTU_test only.
-- Uses the existing 17 rooms from seeds/rooms.sql.
-- Uses the existing demo accounts copied from BookingCSTU_project.
-- Do not run this seed more than once.
--
-- IMPORTANT:
-- 1. Select BookingCSTU_test before running this file.
-- 2. Verify SELECT DATABASE() before applying.
-- 3. Never run this file against BookingCSTU_project.
-- 4. This file does not create, drop, or truncate any table.

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

-- Existing accounts copied from BookingCSTU_project.
-- Apisada's no_show_count is intentionally reset to 0 in Demo.
-- Teacher retains no_show_count = 1 to match the no_show fixture.

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
    1,
    '6609612301',
    '6609612301',
    'apisada.cha@dome.tu.ac.th',
    'อภิษฎา ไชยเสนา',
    'อภิษฎา ไชยเสนา',
    'คณะวิทยาศาสตร์และเทคโนโลยี',
    'ภาควิชาวิทยาการคอมพิวเตอร์',
    'student',
    'user',
    0,
    NULL
),
(
    3,
    'TEACHER001',
    'teacher_demo',
    'teacher.demo@example.com',
    'อาจารย์ตัวอย่าง',
    'อาจารย์ตัวอย่าง',
    'คณะวิทยาศาสตร์และเทคโนโลยี',
    'Computer Science',
    'teacher',
    'user',
    1,
    NULL
),
(
    45,
    'ADMINDEMO001',
    'admin_demo',
    'admin.demo@example.com',
    'ผู้ดูแลระบบตัวอย่าง',
    'ผู้ดูแลระบบตัวอย่าง',
    'คณะวิทยาศาสตร์และเทคโนโลยี',
    'Computer Science',
    'admin',
    'admin',
    0,
    NULL
);

-- Existing rooms:
-- 7  = Room 301
-- 8  = Room 302
-- 9  = Room 303
-- 10 = Room 304
--
-- Past bookings are on a weekday.
-- Future reserved bookings will not be converted to no_show.

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
    1,
    7,
    @test_past_weekday,
    '09:00:00',
    '10:00:00',
    'Demo completed booking - Student',
    'completed',
    NULL,
    TIMESTAMP(@test_past_weekday, '09:00:00')
),
(
    920002,
    1,
    8,
    @test_past_weekday,
    '10:00:00',
    '11:00:00',
    'Demo cancelled booking - Student',
    'cancelled',
    TIMESTAMP(@test_past_weekday, '08:30:00'),
    NULL
),
(
    920003,
    3,
    9,
    @test_past_weekday,
    '11:00:00',
    '12:00:00',
    'Demo no-show booking - Teacher',
    'no_show',
    NULL,
    NULL
),
(
    920004,
    1,
    7,
    @test_future_weekday,
    '09:00:00',
    '10:00:00',
    'Demo upcoming booking - Student',
    'reserved',
    NULL,
    NULL
),
(
    920005,
    3,
    10,
    @test_past_weekday,
    '13:00:00',
    '14:00:00',
    'Demo completed booking - Teacher',
    'completed',
    NULL,
    TIMESTAMP(@test_past_weekday, '13:00:00')
),
(
    920006,
    3,
    10,
    @test_future_weekday,
    '14:00:00',
    '15:00:00',
    'Demo upcoming booking - Teacher',
    'reserved',
    NULL,
    NULL
);

-- Room review: only for a completed booking.

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
    'ห้องสะอาดและอุปกรณ์พร้อมใช้งาน',
    'visible'
);

-- System reviews.

INSERT INTO system_reviews (
    review_id,
    user_id,
    rating,
    comment,
    status
) VALUES
(
    940001,
    1,
    5,
    'ระบบจองห้องใช้งานง่ายและสะดวก',
    'visible'
),
(
    940002,
    3,
    3,
    'ตัวอย่างรีวิวที่ซ่อนอยู่สำหรับทดสอบ Admin',
    'hidden'
);

-- Complaints.

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
    1,
    NULL,
    'สอบถามการใช้งานระบบ',
    'ตัวอย่างคอมเพลนทั่วไปที่ไม่เกี่ยวข้องกับห้อง',
    'รอดำเนินการ'
),
(
    950002,
    3,
    7,
    'อุปกรณ์ภายในห้องมีปัญหา',
    'ตัวอย่างคอมเพลนที่เกี่ยวข้องกับห้อง 301',
    'กำลังตรวจสอบ'
),
(
    950003,
    1,
    8,
    'แจ้งปัญหาการใช้งานห้อง',
    'ตัวอย่างคอมเพลนที่ดำเนินการแล้ว',
    'ดำเนินการแล้ว'
),
(
    950004,
    3,
    NULL,
    'สอบถามการจองห้อง',
    'ตัวอย่างคอมเพลนที่เสร็จสิ้นแล้ว',
    'เสร็จสิ้น'
);

-- Repair reports.

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
    1,
    NULL,
    'แจ้งซ่อมทั่วไป',
    'ตัวอย่างแจ้งซ่อมที่ไม่เกี่ยวข้องกับห้อง',
    'รอดำเนินการ'
),
(
    960002,
    3,
    7,
    'แจ้งซ่อมอุปกรณ์ห้อง 301',
    'ตัวอย่างแจ้งซ่อมที่กำลังดำเนินการ',
    'กำลังซ่อม'
),
(
    960003,
    1,
    8,
    'แจ้งซ่อมห้อง 302',
    'ตัวอย่างแจ้งซ่อมที่ดำเนินการเสร็จแล้ว',
    'ซ่อมเสร็จ'
),
(
    960004,
    3,
    NULL,
    'แจ้งซ่อมทั่วไป',
    'ตัวอย่างรายการแจ้งซ่อมที่ถูกยกเลิก',
    'ยกเลิก'
);
