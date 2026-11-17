-- Initial room catalog data retained from the legacy tables/rooms.sql.
INSERT INTO rooms
(
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
)
VALUES

-- ==========================================
-- FLOOR 1
-- ==========================================

(
    1,
    '107',
    1,
    '107 ห้องปฏิบัติการคอมพิวเตอร์',
    'Computer Science',
    80,
    'โปรเจคเตอร์ 2, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1, ไมโครโฟนลอย 2',
    'orange',
    1,
    'classroom',
    '/uploads/rooms/9d64fda1ac6b6d4a0d1bbb8fdb5fe8db.jpg'
),

(
    2,
    '111-classroom',
    1,
    '111 ห้องปฏิบัติการคอมพิวเตอร์ (ห้องเรียน)',
    'Computer Science',
    40,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1',
    'orange',
    1,
    'classroom',
    '/uploads/rooms/19b3694128fe5bc83d128403f188300e.jpg'
),

(
    3,
    '111-greader',
    1,
    '111 ห้องปฏิบัติการคอมพิวเตอร์ (Greader)',
    'Computer Science',
    20,
    NULL,
    'orange',
    1,
    'classroom',
    '/uploads/rooms/c71e147d239161aa366d5608055f774e.jpg'
),


-- ==========================================
-- FLOOR 2
-- ==========================================

(
    4,
    'meeting-1',
    2,
    'ห้องประชุม 1',
    'Computer Science',
    24,
    'จอทีวี 4, โปรเจคเตอร์ 1, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนห้องประชุม 18',
    'orange',
    1,
    'meeting_room',
    '/uploads/rooms/c14766a1c33cea27aa55e71380128cbc.jpg'
),

(
    5,
    'meeting-2',
    2,
    'ห้องประชุม 2',
    'Computer Science',
    24,
    'โปรเจคเตอร์ 1, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนห้องประชุม 18',
    'orange',
    1,
    'meeting_room',
    '/uploads/rooms/fde92a53a5f3bb4f98ec1bcb751991c0.jpg'
),

(
    6,
    '213',
    2,
    '213 ห้องปฏิบัติการคอมพิวเตอร์พื้นฐาน',
    'Computer Science',
    60,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1',
    'orange',
    1,
    'meeting_room',
    '/uploads/rooms/d5e8409b1be5365c98a69eb08d64a6e5.jpg'
),


-- ==========================================
-- FLOOR 3
-- ==========================================

(
    7,
    '301',
    3,
    'ห้องประชุม 301',
    'Computer Science',
    4,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ',
    'orange',
    1,
    'meeting_room',
    '/uploads/rooms/cb3f7042f3d278a9ff7d72445b0c9772.jpg'
),

(
    8,
    '302',
    3,
    'ห้องประชุม 302',
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange',
    1,
    'meeting_room',
    '/uploads/rooms/1108e96489262f53b606b93aaa02f292.jpg'
),

(
    9,
    '303',
    3,
    'ห้องประชุม 303',
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange',
    1,
    'meeting_room',
    '/uploads/rooms/db220d74b18367f6dee58c023e9fd6fc.jpg'
),

(
    10,
    '304',
    3,
    'ห้องประชุม 304',
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange',
    1,
    'meeting_room',
    '/uploads/rooms/d72c18c79c7e8e3d85612008e2c931f0.jpg'
),

(
    11,
    '305',
    3,
    'ห้องประชุม 305',
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange',
    1,
    'meeting_room',
    '/uploads/rooms/9298cad2e109045252cbfb31c0f7c668.jpg'
),

(
    12,
    '306',
    3,
    'ห้องเรียน 306 (สำหรับปริญญาโท)',
    'Computer Science',
    50,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1, ไมโครโฟนลอย 2',
    'orange',
    1,
    'study_room',
    '/uploads/rooms/95dd987629e8929d695afe683a92150a.jpg'
),

(
    13,
    '308',
    3,
    'ห้องเรียน 308',
    'Computer Science',
    70,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนลอย 2',
    'orange',
    1,
    'study_room',
    '/uploads/rooms/7e5537a1ef5cb504f82da1ceb07c6c85.jpg'
),

(
    14,
    '309',
    3,
    'ห้องเรียน 309',
    'Computer Science',
    70,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1, ไมโครโฟนลอย 2',
    'orange',
    1,
    'study_room',
    '/uploads/rooms/272ef58e6490337787ce8085833980e0.jpg'
),

(
    15,
    '310',
    3,
    'ห้องเรียน 310',
    'Computer Science',
    70,
    'โปรเจคเตอร์ 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1, ไมโครโฟนลอย 2',
    'orange',
    1,
    'study_room',
    '/uploads/rooms/18a3a3f047dc7903ed84a5712e6394c8.jpg'
),

(
    16,
    '314',
    3,
    'ห้องประชุม 314',
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange',
    1,
    'meeting_room',
    '/uploads/rooms/181be3ac3fe73c3d881967a716961200.jpg'
),

(
    17,
    '315',
    3,
    'ห้องประชุม 315',
    'Computer Science',
    8,
    'จอทีวี 1, Whiteboard พร้อมปากกาและแปรงลบ, คอมพิวเตอร์ 1',
    'orange',
    1,
    'meeting_room',
    '/uploads/rooms/6842c00bc1cb91b24531083429292760.jpg'
);