USE BookingCSTU_project;

-- ==========================================
-- ตรวจสอบโครงสร้างตารางเดิม
-- ==========================================

SHOW CREATE TABLE rooms;
SHOW CREATE TABLE bookings;
SHOW CREATE TABLE reviews;
SHOW CREATE TABLE users;


-- ==========================================
-- เพิ่ม room_id ใน reviews
-- ใช้เมื่อ reviews ยังไม่มี room_id เท่านั้น
-- ==========================================

ALTER TABLE reviews
ADD COLUMN room_id INT NULL AFTER booking_id;


-- ==========================================
-- เพิ่มประเภทความคิดเห็นและสถานะ
-- ใช้เมื่อ reviews ยังไม่มีสองคอลัมน์นี้
-- ==========================================

ALTER TABLE reviews
ADD COLUMN feedback_type
    ENUM('review', 'suggestion', 'problem')
    NOT NULL DEFAULT 'review';

ALTER TABLE reviews
ADD COLUMN status
    ENUM('pending', 'approved', 'rejected')
    NOT NULL DEFAULT 'approved';


-- ==========================================
-- เชื่อมรีวิวเก่ากับห้องจากรายการจอง
-- สมมติ bookings มี booking_id และ room_id
-- ==========================================

UPDATE reviews AS r
JOIN bookings AS b
    ON b.booking_id = r.booking_id
SET r.room_id = b.room_id
WHERE r.room_id IS NULL;


-- ==========================================
-- สร้าง Index สำหรับค้นหารีวิวรายห้อง
-- ใช้เมื่อยังไม่มี Index นี้
-- ==========================================

CREATE INDEX idx_reviews_room_created
ON reviews (room_id, created_at);


-- ==========================================
-- เพิ่ม Foreign Key ของ room_id
-- สมมติ rooms ใช้ room_id เป็น Primary Key
-- และชนิดข้อมูลตรงกัน
-- ==========================================

ALTER TABLE reviews
ADD CONSTRAINT fk_reviews_room
FOREIGN KEY (room_id)
REFERENCES rooms(room_id)
ON DELETE SET NULL
ON UPDATE CASCADE;


-- ==========================================
-- ดึงรีวิวของห้องที่เลือก
-- เปลี่ยน ? เป็นค่าพารามิเตอร์จาก Backend
-- ==========================================

SELECT
    r.review_id,
    r.room_id,
    r.user_id,
    r.rating,
    r.feedback_type,
    r.comment,
    r.status,
    r.created_at,
    u.username
FROM reviews AS r
LEFT JOIN users AS u
    ON u.user_id = r.user_id
WHERE r.room_id = ?
  AND r.status = 'approved'
ORDER BY r.created_at DESC;


-- ==========================================
-- คะแนนเฉลี่ยของห้องที่เลือก นับเฉพาะรีวิวที่มีคะแนน
-- ==========================================

SELECT
    room_id,
    ROUND(AVG(rating), 1) AS average_rating,
    COUNT(rating) AS review_count
FROM reviews
WHERE room_id = ?
  AND status = 'approved'
  AND feedback_type = 'review'
  AND rating BETWEEN 1 AND 5
GROUP BY room_id;


-- ==========================================
-- จำนวนครั้งที่ห้องถูกใช้งานตัวอย่างนี้นับเฉพาะ confirmed และ completed
-- ==========================================

SELECT
    room_id,
    COUNT(*) AS usage_count
FROM bookings
WHERE room_id = ?
  AND status IN ('confirmed', 'completed')
GROUP BY room_id;


-- ==========================================
-- ตรวจสอบรีวิวหลังปรับฐานข้อมูล
-- ==========================================

SELECT
    review_id,
    room_id,
    rating,
    feedback_type,
    status,
    created_at
FROM reviews
ORDER BY created_at DESC;