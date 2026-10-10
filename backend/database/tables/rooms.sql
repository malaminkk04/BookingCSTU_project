CREATE TABLE rooms (
    room_id INT AUTO_INCREMENT PRIMARY KEY,

    room_code VARCHAR(50) NOT NULL UNIQUE,
    room_name VARCHAR(255) NOT NULL,

    floor INT NOT NULL,
    department VARCHAR(100) DEFAULT 'Computer Science',

    capacity INT NOT NULL,

    facilities TEXT,

    department_color VARCHAR(20),

    is_available BOOLEAN DEFAULT TRUE,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO rooms
(
    room_code,
    room_name,
    floor,
    department,
    capacity,
    facilities,
    department_color
)
VALUES

-- ==========================================
-- FLOOR 1
-- ==========================================

(
    '107',
    '107 ห้องปฏิบัติการคอมพิวเตอร์',
    1,
    'Computer Science',
    80,
    'โปรเจคเตอร์ 2, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1, ไมโครโฟนลอย 2',
    'orange'
),

(
    '111-classroom',
    '111 ห้องปฏิบัติการคอมพิวเตอร์ (ห้องเรียน)',
    1,
    'Computer Science',
    40,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1',
    'orange'
),

(
    '111-greader',
    '111 ห้องปฏิบัติการคอมพิวเตอร์ (Greader)',
    1,
    'Computer Science',
    20,
    NULL,
    'orange'
),


-- ==========================================
-- FLOOR 2
-- ==========================================

(
    'meeting-1',
    'ห้องประชุม 1',
    2,
    'Computer Science',
    24,
    'จอทีวี 4, โปรเจคเตอร์ 1, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนห้องประชุม 18',
    'orange'
),

(
    'meeting-2',
    'ห้องประชุม 2',
    2,
    'Computer Science',
    24,
    'โปรเจคเตอร์ 1, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนห้องประชุม 18',
    'orange'
),

(
    '213',
    '213 ห้องปฏิบัติการคอมพิวเตอร์พื้นฐาน',
    2,
    'Computer Science',
    60,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1',
    'orange'
),


-- ==========================================
-- FLOOR 3
-- ==========================================

(
    '301',
    'ห้องประชุม 301',
    3,
    'Computer Science',
    4,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ',
    'orange'
),

(
    '302',
    'ห้องประชุม 302',
    3,
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange'
),

(
    '303',
    'ห้องประชุม 303',
    3,
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange'
),

(
    '304',
    'ห้องประชุม 304',
    3,
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange'
),

(
    '305',
    'ห้องประชุม 305',
    3,
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange'
),

(
    '306',
    'ห้องเรียน 306 (สำหรับปริญญาโท)',
    3,
    'Computer Science',
    50,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1, ไมโครโฟนลอย 2',
    'orange'
),

(
    '308',
    'ห้องเรียน 308',
    3,
    'Computer Science',
    70,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนลอย 2',
    'orange'
),

(
    '309',
    'ห้องเรียน 309',
    3,
    'Computer Science',
    70,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1, ไมโครโฟนลอย 2',
    'orange'
),

(
    '310',
    'ห้องเรียน 310',
    3,
    'Computer Science',
    70,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1, ไมโครโฟนลอย 2',
    'orange'
),

(
    '314',
    'ห้องประชุม 314',
    3,
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange'
),

(
    '315',
    'ห้องประชุม 315',
    3,
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange'
);