
const mysql = require("mysql2");
const fs = require("fs");
const path = require("path");

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
const MIN_BOOKING_MINUTES = 60;
const MAX_BOOKING_MINUTES = 120;
const TEACHER_MONTHLY_LIMIT = 20;
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

function normalizeDate(value) {
  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  return String(value || "").trim().slice(0, 10);
}

function normalizeTime(value) {
  const time = String(value || "").trim();

  if (/^\d{2}:\d{2}$/.test(time)) {
    return `${time}:00`;
  }

  return time;
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const parsed = new Date(`${date}T00:00:00Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}

function isWeekday(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();

  return day >= 1 && day <= 5;
}

function getMinutes(time) {
  const normalized = normalizeTime(time);
  const match = normalized.match(/^(\d{2}):(\d{2}):(\d{2})$/);

  if (!match) {
    return NaN;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3]);

  if (
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return NaN;
  }

  return hour * 60 + minute;
}

function validateBookingDateTime(date, startTime, endTime) {
  const bookingDate = normalizeDate(date);
  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);

  if (!isValidDate(bookingDate)) {
    throw new Error("วันที่จองไม่ถูกต้อง");
  }

  if (!isWeekday(bookingDate)) {
    throw new Error("สามารถจองห้องได้เฉพาะวันจันทร์ถึงวันศุกร์");
  }

  const startMinutes = getMinutes(start);
  const endMinutes = getMinutes(end);

  if (
    !Number.isFinite(startMinutes) ||
    !Number.isFinite(endMinutes)
  ) {
    throw new Error("รูปแบบเวลาไม่ถูกต้อง");
  }

  const openMinutes = getMinutes(OPEN_TIME);
  const closeMinutes = getMinutes(CLOSE_TIME);

  if (
    startMinutes < openMinutes ||
    endMinutes > closeMinutes ||
    endMinutes <= startMinutes
  ) {
    throw new Error("เวลาให้บริการคือ 08:00–16:00 น.");
  }

  const duration = endMinutes - startMinutes;

  if (
    duration < MIN_BOOKING_MINUTES ||
    duration > MAX_BOOKING_MINUTES
  ) {
    throw new Error("ระยะเวลาจองต้องอยู่ระหว่าง 1–2 ชั่วโมง");
  }

  const requestedStart = `${bookingDate} ${start}`;
  const now = getBangkokDateTime();

  if (requestedStart <= now) {
    throw new Error("ไม่สามารถจองวันที่หรือเวลาที่ผ่านมาแล้วได้");
  }

  return {
    date: bookingDate,
    startTime: start,
    endTime: end,
    duration
  };
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
    const role = String(user.role || "student").toLowerCase() === "student"
      ? "student"
      : "teacher";

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
      booking.end_time
    );

    const connection = await promisePool.getConnection();

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

      if (user.suspended_until) {
        const suspendedUntil = new Date(user.suspended_until).getTime();

        if (
          Number.isFinite(suspendedUntil) &&
          suspendedUntil > Date.now()
        ) {
          throw new Error("บัญชีถูกระงับการจองชั่วคราว เนื่องจากไม่มาเช็กอิน");
        }
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
           AND status IN ('reserved', 'confirmed', 'checked_in')
           AND start_time < ?
           AND end_time > ?
         LIMIT 1
         FOR UPDATE`,
        [
          room.room_id,
          validated.date,
          validated.endTime,
          validated.startTime
        ]
      );

      if (conflicts.length > 0) {
        throw new Error("ห้องนี้มีการจองในช่วงเวลาที่เลือกแล้ว");
      }

      if (role === "teacher") {
        const [usage] = await connection.execute(
          `SELECT
             COALESCE(
               SUM(TIME_TO_SEC(TIMEDIFF(end_time, start_time)) / 3600),
               0
             ) AS total_hours
           FROM bookings
           WHERE user_id = ?
             AND booking_date >= ?
             AND booking_date < ?
             AND status IN ('reserved', 'confirmed', 'checked_in', 'completed')`,
          [
            userId,
            `${validated.date.slice(0, 7)}-01`,
            `${getNextMonth(validated.date.slice(0, 7))}-01`
          ]
        );

        const usedHours = Number(usage[0]?.total_hours || 0);
        const requestedHours = validated.duration / 60;

        if (usedHours + requestedHours > TEACHER_MONTHLY_LIMIT) {
          throw new Error("การจองของอาจารย์ต้องไม่เกิน 20 ชั่วโมงต่อเดือน");
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
        status: "reserved"
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

function getNextMonth(yearMonth) {
  const [year, month] = yearMonth.split("-").map(Number);

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return `${nextYear}-${String(nextMonth).padStart(2, "0")}`;
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
         r.department_color
       FROM bookings b
       JOIN rooms r ON b.room_id = r.room_id
       WHERE b.user_id = ?
         AND b.status NOT IN ('cancelled', 'no_show')
       ORDER BY b.booking_date DESC, b.start_time DESC`,
      [userId]
    )
    .then(([rows]) => rows);

  return callbackResult(promise, callback);
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
      is_available
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

      if (!["reserved", "confirmed"].includes(booking.status)) {
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
             cancelled_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE booking_id = ? AND user_id = ?`,
        [bookingId, userId]
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
        `SELECT booking_id, user_id, booking_date, start_time, end_time, status
         FROM bookings
         WHERE booking_id = ? AND user_id = ?
         FOR UPDATE`,
        [bookingId, userId]
      );

      if (rows.length === 0) {
        throw new Error("ไม่พบรายการจอง");
      }

      const booking = rows[0];

      if (booking.status !== "reserved" && booking.status !== "confirmed") {
        throw new Error("รายการจองนี้ไม่สามารถเช็กอินได้");
      }

      const date = normalizeDate(booking.booking_date);
      const startTime = normalizeTime(booking.start_time);
      const endTime = normalizeTime(booking.end_time);
      const now = getBangkokDateTime();

      if (date !== getBangkokDate()) {
        throw new Error("สามารถเช็กอินได้เฉพาะวันที่จอง");
      }

      const startDate = new Date(`${date}T${startTime}+07:00`);
      const endDate = new Date(`${date}T${endTime}+07:00`);
      const nowDate = new Date(`${now.replace(" ", "T")}+07:00`);

      const earliest = startDate.getTime();
      const latest = earliest + CHECK_IN_GRACE_MINUTES * 60000;

      if (
        nowDate.getTime() < earliest ||
        nowDate.getTime() > latest
      ) {
        throw new Error("เช็กอินได้ตั้งแต่เวลาเริ่มจองจนถึง 15 นาทีหลังเวลาเริ่ม");
      }

      await connection.execute(
        `UPDATE bookings
         SET status = 'checked_in',
             checked_in_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE booking_id = ?`,
        [bookingId]
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

    await connection.execute(
      `UPDATE bookings
       SET status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE status = 'checked_in'
         AND TIMESTAMP(booking_date, end_time) <= ?`,
      [now]
    );

    const [missedBookings] = await connection.execute(
      `SELECT booking_id, user_id
       FROM bookings
       WHERE status IN ('reserved', 'confirmed')
         AND TIMESTAMP(booking_date, start_time)
             <= DATE_SUB(?, INTERVAL ? MINUTE)
       FOR UPDATE`,
      [now, CHECK_IN_GRACE_MINUTES]
    );

    for (const booking of missedBookings) {
      const [users] = await connection.execute(
        `SELECT no_show_count
         FROM users
         WHERE user_id = ?
         FOR UPDATE`,
        [booking.user_id]
      );

      if (users.length === 0) {
        continue;
      }

      const nextCount = Number(users[0].no_show_count || 0) + 1;

      if (nextCount >= 3) {
        await connection.execute(
          `UPDATE users
           SET no_show_count = ?,
               suspended_until = DATE_ADD(?, INTERVAL ? DAY),
               updated_at = CURRENT_TIMESTAMP
           WHERE user_id = ?`,
          [
            nextCount,
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

      await connection.execute(
        `UPDATE bookings
         SET status = 'no_show',
             updated_at = CURRENT_TIMESTAMP
         WHERE booking_id = ?
           AND status IN ('reserved', 'confirmed')`,
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
  getRooms,
  getBookingsByDate,
  deleteBooking,
  checkInBooking,
  updateBookingStatuses
};
