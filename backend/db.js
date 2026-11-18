
const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");
const {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_QUOTA_STATUSES
} = require("./utils/booking-status");
const {
  BOOKING_QUOTA_LIMIT_MINUTES,
  normalizeDate,
  normalizeTime,
  validateBookingDateTime,
  getMonthDateBounds,
  summarizeBookingQuota,
  calculateMonthlyUsageMinutes
} = require("./utils/booking-rules");
const {
  parseBangkokDateTime,
  getBangkokDateTimeMinutesBefore,
  getBookingStartTimestamp,
  isWithinCheckInWindow,
  isSuspendedUntilActive
} = require("./utils/booking-time");

const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "BookingCSTU_project",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "+07:00",
  charset: "utf8mb4"
});

const promisePool = db.promise();

const STUDENT_ROOMS = [
  "301",
  "302",
  "303",
  "304",
  "305",
  "314",
  "315"
];

const OPEN_TIME = "08:00:00";
const CLOSE_TIME = "16:00:00";
const CHECK_IN_GRACE_MINUTES = 15;
const CANCEL_LIMIT_MINUTES = 30;
const NO_SHOW_SUSPENSION_DAYS = 14;
const TIME_ZONE = "Asia/Bangkok";

function callbackResult(promise, callback) {
  if (typeof callback === "function") {
    promise
      .then((result) => callback(null, result))
      .catch((error) => callback(error));
  }

  return promise;
}

function getBangkokParts() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const result = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      result[part.type] = part.value;
    }
  }

  return result;
}

function getBangkokDateTime() {
  const p = getBangkokParts();

  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

function getBangkokDate() {
  return getBangkokDateTime().slice(0, 10);
}

function getBangkokTime() {
  return getBangkokDateTime().slice(11, 19);
}

function getRoomCode(room) {
  return String(
    room?.room_code ??
    room?.room_name ??
    room?.room ??
    room ??
    ""
  ).trim();
}

function isStudentRoomAllowed(room) {
  const code = getRoomCode(room);

  return STUDENT_ROOMS.includes(code);
}

function getRoomByCode(connection, roomCode) {
  return connection.execute(
    `SELECT *
     FROM rooms
     WHERE (room_code = ? OR room_name = ?)
       AND is_available = 1
     LIMIT 1
     FOR UPDATE`,
    [roomCode, roomCode]
  );
}

function upsertUser(user, callback) {
  const promise = (async () => {
    if (!user) {
      throw new Error("ไม่พบข้อมูลผู้ใช้");
    }

    const tuId = user.tu_id || user.username || user.user_id;
    const name =
      user.name ||
      user.displayname_th ||
      user.displayName ||
      user.username ||
      tuId;

    if (!tuId || !name) {
      throw new Error("ข้อมูลผู้ใช้ไม่ครบถ้วน");
    }

    const email = user.email || null;
    const username = user.username || String(tuId);
    const displaynameTh = user.displayname_th || user.displayName || name;
    const faculty = user.faculty || null;
    const major = user.major || user.department || null;
    const role = ["student", "teacher", "admin"].includes(user.role)
  ? user.role
  : "student";

    const [result] = await promisePool.execute(
      `INSERT INTO users
        (tu_id, name, email, username, displayname_th,
         faculty, major, role)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         email = VALUES(email),
         username = VALUES(username),
         displayname_th = VALUES(displayname_th),
         faculty = VALUES(faculty),
         major = VALUES(major),
         role = VALUES(role),
         updated_at = CURRENT_TIMESTAMP`,
      [
        String(tuId),
        String(name),
        email,
        String(username),
        String(displaynameTh),
        faculty,
        major,
        role
      ]
    );

    if (result.insertId) {
      return getUserById(result.insertId);
    }

    const [rows] = await promisePool.execute(
      `SELECT *
       FROM users
       WHERE tu_id = ? OR username = ? OR email = ?
       LIMIT 1`,
      [String(tuId), String(username), email]
    );

    return rows[0] || null;
  })();

  return callbackResult(promise, callback);
}

function getUserById(userId, callback) {
  const promise = promisePool
    .execute(
      `SELECT *
       FROM users
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    )
    .then(([rows]) => rows[0] || null);

  return callbackResult(promise, callback);
}

function getUserByEmail(email, callback) {
  const promise = promisePool
    .execute(
      `SELECT *
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email]
    )
    .then(([rows]) => rows[0] || null);

  return callbackResult(promise, callback);
}

function addBooking(booking, callback) {
  const promise = (async () => {
    if (!booking) {
      throw new Error("ไม่พบข้อมูลการจอง");
    }

    const userId = Number(booking.user_id);
    const roomCode = getRoomCode(booking);
    const purpose = String(booking.purpose || "").trim();

    if (!Number.isInteger(userId) || userId <= 0) {
      throw new Error("ข้อมูลผู้ใช้ไม่ถูกต้อง");
    }

    if (!roomCode) {
      throw new Error("กรุณาเลือกห้อง");
    }

    const validated = validateBookingDateTime(
      booking.date || booking.booking_date,
      booking.start_time,
      booking.end_time,
      getBangkokDateTime()
    );

    const connection = await promisePool.getConnection();
    let bookingQuota;

    try {
      await connection.beginTransaction();

      const [users] = await connection.execute(
        `SELECT user_id, role, no_show_count, suspended_until
         FROM users
         WHERE user_id = ?
         FOR UPDATE`,
        [userId]
      );

      if (users.length === 0) {
        throw new Error("ไม่พบข้อมูลผู้ใช้");
      }

      const user = users[0];
      const role = String(user.role || "student").toLowerCase();

      if (role !== "student" && role !== "teacher") {
        throw new Error("ประเภทผู้ใช้ไม่ถูกต้อง");
      }

      if (isSuspendedUntilActive(user.suspended_until)) {
        const error = new Error(
          "บัญชีถูกระงับการจองชั่วคราว 2 สัปดาห์ เนื่องจากไม่มาใช้งานเกิน 2 ครั้ง"
        );

        error.code = "ACCOUNT_SUSPENDED";
        throw error;
      }

      const [rooms] = await getRoomByCode(connection, roomCode);

      if (rooms.length === 0) {
        throw new Error("ไม่พบห้องหรือห้องนี้ไม่เปิดให้จอง");
      }

      const room = rooms[0];

      if (
        role === "student" &&
        !isStudentRoomAllowed(room)
      ) {
        throw new Error("นักศึกษาสามารถจองได้เฉพาะห้อง 301–305, 314 และ 315");
      }

      const [conflicts] = await connection.execute(
        `SELECT booking_id
         FROM bookings
         WHERE room_id = ?
           AND booking_date = ?
             AND status IN (?, ?)
           AND start_time < ?
           AND end_time > ?
         LIMIT 1
         FOR UPDATE`,
        [
          room.room_id,
          validated.date,
          ...ACTIVE_BOOKING_STATUSES,
          validated.endTime,
          validated.startTime
        ]
      );

      if (conflicts.length > 0) {
        throw new Error("ห้องนี้มีการจองในช่วงเวลาที่เลือกแล้ว");
      }

      {
        const { monthStart, nextMonthStart } = getMonthDateBounds(validated.date);
        const [usage] = await connection.execute(
          `SELECT DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date,
                  start_time, end_time, status
           FROM bookings
           WHERE user_id = ?
             AND booking_date >= ?
             AND booking_date < ?
             AND status IN (?, ?, ?, ?)`,
          [
            userId,
            monthStart,
            nextMonthStart,
            ...BOOKING_QUOTA_STATUSES
          ]
        );

        const usedMinutes = calculateMonthlyUsageMinutes(
          usage,
          validated.date.slice(0, 7)
        );
        bookingQuota = summarizeBookingQuota(
          usedMinutes,
          validated.duration
        );

        if (bookingQuota.exceeded) {
          throw new Error("การจองต้องไม่เกิน 20 ชั่วโมงต่อเดือน");
        }
      }

      const [result] = await connection.execute(
        `INSERT INTO bookings
          (user_id, room_id, booking_date, start_time, end_time,
           purpose, status)
         VALUES (?, ?, ?, ?, ?, ?, 'reserved')`,
        [
          userId,
          room.room_id,
          validated.date,
          validated.startTime,
          validated.endTime,
          purpose
        ]
      );

      await connection.commit();

      return {
        booking_id: result.insertId,
        user_id: userId,
        room_id: room.room_id,
        room_code: room.room_code,
        room_name: room.room_name,
        booking_date: validated.date,
        start_time: validated.startTime,
        end_time: validated.endTime,
        purpose,
        status: "reserved",
        quota: {
          month: validated.date.slice(0, 7),
          limit_minutes: BOOKING_QUOTA_LIMIT_MINUTES,
          used_minutes: bookingQuota.used_minutes,
          remaining_minutes: bookingQuota.remaining_minutes
        }
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })();

  return callbackResult(promise, callback);
}

function getMonthlyBookingQuota(userId, date = getBangkokDate(), callback) {
  if (typeof date === "function") {
    callback = date;
    date = getBangkokDate();
  }
  const { monthStart, nextMonthStart } = getMonthDateBounds(date);
  const promise = promisePool.execute(
    `SELECT DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date,
            start_time, end_time, status
     FROM bookings
     WHERE user_id = ?
       AND booking_date >= ?
       AND booking_date < ?
       AND status IN (?, ?, ?, ?)`,
    [userId, monthStart, nextMonthStart, ...BOOKING_QUOTA_STATUSES]
  ).then(([rows]) => {
    const usedMinutes = calculateMonthlyUsageMinutes(rows, date.slice(0, 7));
    const quota = summarizeBookingQuota(usedMinutes);
    return {
      month: monthStart.slice(0, 7),
      limit_minutes: BOOKING_QUOTA_LIMIT_MINUTES,
      used_minutes: quota.used_minutes,
      remaining_minutes: quota.remaining_minutes
    };
  });

  return callbackResult(promise, callback);
}


function getBookingsByUser(userId, callback) {
  const promise = promisePool
    .execute(
      `SELECT
         b.*,
         r.room_code,
         r.room_name,
         r.floor,
         r.capacity,
         r.facilities,
         r.department,
         r.department_color,
         CASE
           WHEN rr.review_id IS NOT NULL THEN 1
           ELSE 0
         END AS reviewed
       FROM bookings b
       JOIN rooms r ON b.room_id = r.room_id
       LEFT JOIN room_reviews rr ON rr.booking_id = b.booking_id
       WHERE b.user_id = ?
         AND b.status <> 'cancelled'
       ORDER BY b.booking_date DESC, b.start_time DESC`,
      [userId]
    )
    .then(([rows]) => rows);

  return callbackResult(promise, callback);
}


async function getRoomReview(bookingId, userId) {
  const [rows] = await promisePool.execute(
    `SELECT
       b.booking_id,
       b.status AS booking_status,
       rr.review_id,
       rr.rating,
       rr.comment,
       rr.status AS review_status,
       rr.created_at,
       u.name AS reviewer_name
     FROM bookings b
     JOIN users u ON u.user_id = b.user_id
     LEFT JOIN room_reviews rr ON rr.booking_id = b.booking_id
     WHERE b.booking_id = ?
       AND b.user_id = ?
     LIMIT 1`,
    [bookingId, userId]
  );

  if (!rows.length) return null;
  const row = rows[0];
  return {
    booking_id: row.booking_id,
    booking_status: row.booking_status,
    reviewed: row.review_id != null,
    review: row.review_id == null ? null : {
      review_id: row.review_id,
      rating: row.rating,
      comment: row.comment,
      status: row.review_status,
      created_at: row.created_at,
      reviewer_name: row.reviewer_name
    }
  };
}

async function getRoomReviewsByRoom(roomId) {
  const [roomRows] = await promisePool.execute(
    `SELECT
       COALESCE(AVG(rr.rating), 0) AS average_rating,
       COUNT(DISTINCT rr.review_id) AS review_count,
       COUNT(DISTINCT CASE WHEN b.status = 'completed' THEN b.booking_id END) AS usage_count
     FROM rooms r
     LEFT JOIN bookings b ON b.room_id = r.room_id
     LEFT JOIN room_reviews rr ON rr.booking_id = b.booking_id AND rr.status = 'visible'
     WHERE r.room_id = ?
     GROUP BY r.room_id`,
    [roomId]
  );
  if (!roomRows.length) return null;
  const [reviews] = await promisePool.execute(
    `SELECT
       rr.review_id AS id,
       u.name AS name,
       DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS date,
       rr.rating,
       rr.comment AS message,
       'รีวิว' AS type,
       1 AS verified,
       rr.created_at
     FROM room_reviews rr
     JOIN bookings b ON b.booking_id = rr.booking_id
     JOIN users u ON u.user_id = b.user_id
     WHERE b.room_id = ? AND rr.status = 'visible'
     ORDER BY rr.created_at DESC`,
    [roomId]
  );
  return {
    average_rating: Number(roomRows[0].average_rating) || 0,
    review_count: Number(roomRows[0].review_count) || 0,
    usage_count: Number(roomRows[0].usage_count) || 0,
    reviews
  };
}

async function submitRoomReview(bookingId, userId, rating, comment) {
  const connection = await promisePool.getConnection();
  try {
    await connection.beginTransaction();
    const [bookings] = await connection.execute(
      `SELECT b.booking_id, b.status, u.name AS reviewer_name
       FROM bookings b
       JOIN users u ON u.user_id = b.user_id
       WHERE b.booking_id = ? AND b.user_id = ?
       FOR UPDATE`,
      [bookingId, userId]
    );
    if (!bookings.length) {
      const error = new Error("ไม่พบรายการจองของผู้ใช้นี้");
      error.statusCode = 404;
      throw error;
    }
    if (bookings[0].status !== "completed") {
      const error = new Error("รีวิวได้เฉพาะรายการจองที่เสร็จสิ้นแล้ว");
      error.statusCode = 409;
      throw error;
    }
    const [existing] = await connection.execute(
      "SELECT review_id FROM room_reviews WHERE booking_id = ? LIMIT 1",
      [bookingId]
    );
    if (existing.length) {
      const error = new Error("รายการจองนี้ได้รับรีวิวแล้ว");
      error.statusCode = 409;
      throw error;
    }
    await connection.execute(
      "INSERT INTO room_reviews (booking_id, rating, comment) VALUES (?, ?, ?)",
      [bookingId, rating, comment]
    );
    await connection.commit();
    return {
      booking_id: Number(bookingId),
      rating,
      comment,
      reviewer_name: bookings[0].reviewer_name
    };
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY" || error.errno === 1062) {
      error.statusCode = 409;
      error.message = "รายการจองนี้ได้รับรีวิวแล้ว";
    }
    throw error;
  } finally {
    connection.release();
  }
}

function getRooms(role, callback) {
  if (typeof role === "function") {
    callback = role;
    role = "student";
  }

  const normalizedRole = String(role || "student").toLowerCase();

  let sql = `
    SELECT
      room_id AS id,
      room_id,
      room_code,
      room_name,
      floor,
      capacity,
      facilities,
      department,
      department_color,
      is_available,
      image_url
    FROM rooms
    WHERE is_available = 1
  `;

  if (normalizedRole === "student") {
    sql += ` AND room_code IN (${STUDENT_ROOMS.map(() => "?").join(", ")})`;
  }

  sql += " ORDER BY floor ASC, room_code ASC";

  const params = normalizedRole === "student" ? STUDENT_ROOMS : [];

  const promise = promisePool
    .execute(sql, params)
    .then(([rows]) => rows);

  return callbackResult(promise, callback);
}

function getBookingsByDate(date, callback) {
  const bookingDate = normalizeDate(date);

  const promise = promisePool
    .execute(
      `SELECT
         b.*,
         r.room_code,
         r.room_name,
         u.name AS user_name
       FROM bookings b
       JOIN rooms r ON b.room_id = r.room_id
       JOIN users u ON b.user_id = u.user_id
       WHERE b.booking_date = ?
         AND b.status NOT IN ('cancelled', 'no_show')
       ORDER BY b.start_time ASC`,
      [bookingDate]
    )
    .then(([rows]) => rows);

  return callbackResult(promise, callback);
}

function deleteBooking(bookingId, userId, callback) {
  const promise = (async () => {
    const connection = await promisePool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.execute(
        `SELECT booking_id, user_id, booking_date, start_time, status
         FROM bookings
         WHERE booking_id = ? AND user_id = ?
         FOR UPDATE`,
        [bookingId, userId]
      );

      if (rows.length === 0) {
        throw new Error("ไม่พบรายการจองของผู้ใช้นี้");
      }

      const booking = rows[0];

      if (booking.status !== "reserved") {
        throw new Error("รายการจองนี้ไม่สามารถยกเลิกได้");
      }

      const bookingStart = `${normalizeDate(booking.booking_date)} ${normalizeTime(booking.start_time)}`;
      const now = getBangkokDateTime();

      const startDate = new Date(`${bookingStart.replace(" ", "T")}+07:00`);
      const nowDate = new Date(`${now.replace(" ", "T")}+07:00`);
      const minutesRemaining = (startDate.getTime() - nowDate.getTime()) / 60000;

      if (minutesRemaining < CANCEL_LIMIT_MINUTES) {
        throw new Error("ต้องยกเลิกก่อนเวลาเริ่มจองอย่างน้อย 30 นาที");
      }

      await connection.execute(
        `UPDATE bookings
         SET status = 'cancelled',
             cancelled_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE booking_id = ? AND user_id = ?`,
        [now, bookingId, userId]
      );

      await connection.commit();

      return {
        booking_id: Number(bookingId),
        status: "cancelled"
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })();

  return callbackResult(promise, callback);
}

function checkInBooking(bookingId, userId, callback) {
  const promise = (async () => {
    const connection = await promisePool.getConnection();

    try {
      await connection.beginTransaction();

      const [rows] = await connection.execute(
        `SELECT booking_id, user_id,
                DATE_FORMAT(booking_date, '%Y-%m-%d') AS booking_date,
                TIME_FORMAT(start_time, '%H:%i:%s') AS start_time,
                TIME_FORMAT(end_time, '%H:%i:%s') AS end_time,
                status
         FROM bookings
         WHERE booking_id = ? AND user_id = ?
         FOR UPDATE`,
        [bookingId, userId]
      );

      if (rows.length === 0) {
        throw new Error("ไม่พบรายการจอง");
      }

      const booking = rows[0];

      if (booking.status !== "reserved") {
        throw new Error("รายการจองนี้ไม่สามารถเช็กอินได้");
      }

      const date = normalizeDate(booking.booking_date);
      const startTime = normalizeTime(booking.start_time);
      const now = getBangkokDateTime();

      if (date !== getBangkokDate()) {
        throw new Error("สามารถเช็กอินได้เฉพาะวันที่จอง");
      }

      const startTimestamp = getBookingStartTimestamp(date, startTime);
      const nowTimestamp = parseBangkokDateTime(now);
      if (!isWithinCheckInWindow(
        startTimestamp,
        nowTimestamp,
        CHECK_IN_GRACE_MINUTES
      )) {
        throw new Error("เช็กอินได้ตั้งแต่ 15 นาทีก่อนเวลาเริ่มถึง 15 นาทีหลังเวลาเริ่ม");
      }

      await connection.execute(
        `UPDATE bookings
         SET status = 'checked_in',
             checked_in_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE booking_id = ?`,
        [now, bookingId]
      );

      await connection.commit();

      return {
        booking_id: Number(bookingId),
        status: "checked_in"
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })();

  return callbackResult(promise, callback);
}


async function updateBookingStatuses() {
  const connection = await promisePool.getConnection();

  try {
    await connection.beginTransaction();

    const now = getBangkokDateTime();
    const noShowCutoff = getBangkokDateTimeMinutesBefore(
      now,
      CHECK_IN_GRACE_MINUTES
    );

    // เปลี่ยนสถานะรายการที่เช็กอินแล้วและหมดเวลาเป็น completed
    await connection.execute(
      `UPDATE bookings
       SET status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'checked_in'
         AND TIMESTAMP(booking_date, end_time) <= ?`,
      [now]
    );

    // ค้นหารายการที่ไม่มาเช็กอินเกิน 15 นาที
    const [missedBookings] = await connection.execute(
      `SELECT booking_id, user_id
       FROM bookings
       WHERE status = 'reserved'
         AND TIMESTAMP(booking_date, start_time) < ?
       FOR UPDATE`,
      [noShowCutoff]
    );

    for (const booking of missedBookings) {
      const [users] = await connection.execute(
        `SELECT no_show_count, suspended_until
         FROM users
         WHERE user_id = ?
         FOR UPDATE`,
        [booking.user_id]
      );

      if (users.length === 0) {
        continue;
      }

      const nextCount =
        Number(users[0].no_show_count || 0) + 1;

      // ระงับเมื่อ No-show ครบทุก 3 ครั้ง
      if (nextCount > 0 && nextCount % 3 === 0) {
        await connection.execute(
          `UPDATE users
           SET no_show_count = ?,
               suspended_until = DATE_ADD(
                 GREATEST(COALESCE(suspended_until, ?), ?),
                 INTERVAL ? DAY
               ),
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [
            nextCount,
            now,
            now,
            NO_SHOW_SUSPENSION_DAYS,
            booking.user_id
          ]
        );
      } else {
        await connection.execute(
          `UPDATE users
           SET no_show_count = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [nextCount, booking.user_id]
        );
      }

      // เปลี่ยนรายการจองเป็น no_show
      await connection.execute(
        `UPDATE bookings
         SET status = 'no_show',
             updated_at = CURRENT_TIMESTAMP
         WHERE booking_id = ?
           AND status = 'reserved'`,
        [booking.booking_id]
      );
    }

    await connection.commit();

    return {
      completed: true,
      no_show_processed: missedBookings.length
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function seedRooms() {
  const sqlPath = path.join(
    __dirname,
    "database",
    "tables",
    "rooms.sql"
  );

  if (!fs.existsSync(sqlPath)) {
    return;
  }

  const sql = fs.readFileSync(sqlPath, "utf8").trim();

  if (!sql) {
    return;
  }

  await promisePool.query(sql);
}

module.exports = {
  db,
  promisePool,
  seedRooms,
  upsertUser,
  getUserByEmail,
  getUserById,
  addBooking,
  getBookingsByUser,
  getRoomReview,
  getRoomReviewsByRoom,
  submitRoomReview,
  getMonthlyBookingQuota,
  getRooms,
  getBookingsByDate,
  deleteBooking,
  checkInBooking,
  updateBookingStatuses
};
