require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const {
  db,
  upsertUser,
  getUserById,
  addBooking,
  getBookingsByUser,
  getBookingsByDate,
  getRooms,
  deleteBooking,
  checkInBooking,
  updateBookingStatuses
} = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 5001);

const TU_AUTH_URL = "https://restapi.tu.ac.th/api/v1/auth/Ad/verify";

const DEMO_TEACHER_USERNAME = "teacher_demo";
const DEMO_TEACHER_PASSWORD = "TeacherDemo123!";

const DEMO_ADMIN_USERNAME = "admin_demo";
const DEMO_ADMIN_PASSWORD = "AdminDemo123!";

const sessions = new Map();

app.use(cors());
app.use(express.json());

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function isAllowedFaculty(faculty) {
  const normalized = String(faculty || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();

  return (
    normalized === "คณะวิทยาศาสตร์และเทคโนโลยี" ||
    normalized === "facultyofscienceandtechnology"
  );
}

function getUserIdentifier(body = {}) {
  return String(
    body.identifier ||
    body.username ||
    body.tu_id ||
    body.usernameOrEmail ||
    ""
  ).trim();
}

function getUserRole(accountType) {
  const type = String(accountType || "").trim().toLowerCase();
  return type === "student" ? "student" : "teacher";
}

function createToken(user) {
  const token = crypto.randomBytes(32).toString("hex");

  sessions.set(token, {
    userId: Number(user.user_id),
    accessLevel: String(user.access_level || "user"),
    expiresAt: Date.now() + 8 * 60 * 60 * 1000
  });

  return token;
}

function getSession(req) {
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const token = match[1].trim();
  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function authenticateSession(req, res, next) {
  const session = getSession(req);

  if (!session) {
    return res.status(401).json({
      success: false,
      message: "กรุณาเข้าสู่ระบบใหม่"
    });
  }

  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.accessLevel !== "admin") {
    return res.status(403).json({
      success: false,
      message: "คุณไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ"
    });
  }

  next();
}

function getBangkokDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function resolveLoginIdentifier(identifier) {
  const value = String(identifier || "").trim();

  if (!value.includes("@")) {
    return Promise.resolve(value);
  }

  return new Promise((resolve, reject) => {
    db.query(
      `SELECT username, tu_id
       FROM users
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
       LIMIT 1`,
      [value],
      (error, rows) => {
        if (error) {
          return reject(error);
        }

        if (!rows || rows.length === 0) {
          return reject(
            new Error("No account found for this email address")
          );
        }

        const account = rows[0];
        const loginUsername = account.username || account.tu_id;

        if (!loginUsername) {
          return reject(
            new Error("No username found for this email address")
          );
        }

        resolve(String(loginUsername).trim());
      }
    );
  });
}

function saveUser(userData) {
  return new Promise((resolve, reject) => {
    upsertUser(userData, (error, user) => {
      if (error) {
        return reject(error);
      }

      if (!user || !user.user_id) {
        return reject(
          new Error("Unable to save or load user account from database")
        );
      }

      resolve(user);
    });
  });
}

function findUserById(userId) {
  return new Promise((resolve, reject) => {
    getUserById(userId, (error, user) => {
      if (error) {
        return reject(error);
      }

      resolve(user);
    });
  });
}

function findRooms(role) {
  return new Promise((resolve, reject) => {
    getRooms(role, (error, rooms) => {
      if (error) {
        return reject(error);
      }

      resolve(rooms);
    });
  });
}

function findBookingsByDate(date) {
  return new Promise((resolve, reject) => {
    getBookingsByDate(date, (error, bookings) => {
      if (error) {
        return reject(error);
      }

      resolve(bookings);
    });
  });
}

function findBookingsByUser(userId) {
  return new Promise((resolve, reject) => {
    getBookingsByUser(userId, (error, bookings) => {
      if (error) {
        return reject(error);
      }

      resolve(bookings);
    });
  });
}

function createBooking(booking) {
  return new Promise((resolve, reject) => {
    addBooking(booking, (error, result) => {
      if (error) {
        return reject(error);
      }

      resolve(result);
    });
  });
}

function cancelBooking(bookingId, userId) {
  return new Promise((resolve, reject) => {
    deleteBooking(bookingId, userId, (error, result) => {
      if (error) {
        return reject(error);
      }

      resolve(result);
    });
  });
}

async function verifyWithTuApi(identifier, password) {
  const applicationKey = process.env.TU_API_KEY;

  if (!applicationKey) {
    throw new Error("TU_API_KEY is missing from the backend .env file");
  }

  const response = await fetch(TU_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Application-Key": applicationKey
    },
    body: JSON.stringify({
      UserName: identifier,
      PassWord: password
    })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.message ||
      result.Message ||
      "TU authentication failed"
    );
  }

  const data = result.data || result.Data || result;

  const success =
    result.status === true ||
    result.success === true ||
    result.status === "success" ||
    result.status === "SUCCESS" ||
    Boolean(data.username || data.username_en || data.username_th);

  if (!success) {
    throw new Error(
      result.message ||
      result.Message ||
      "Invalid TU username or password"
    );
  }

  return data;
}

function sendLoginSuccess(res, user) {
  const token = createToken(user);

  return res.json({
    success: true,
    message: "Login successful",
    token,
    user: {
      user_id: user.user_id,
      username: user.username,
      tu_id: user.tu_id,
      email: user.email,
      name: user.name,
      displayname_th: user.displayname_th,
      faculty: user.faculty,
      major: user.major,
      role: user.role,
      access_level: user.access_level || "user",
      no_show_count: user.no_show_count || 0,
      suspended_until: user.suspended_until || null
    }
  });
}

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "BookingCSTU backend is running",
    port: PORT
  });
});

app.post("/login", async (req, res) => {
  try {
    const identifier = getUserIdentifier(req.body);
    const password = String(
      req.body.password || req.body.PassWord || ""
    );

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Please enter your username and password"
      });
    }

    const normalizedIdentifier = identifier.toLowerCase();

    if (
      isDevelopment() &&
      normalizedIdentifier === DEMO_ADMIN_USERNAME.toLowerCase()
    ) {
      if (password !== DEMO_ADMIN_PASSWORD) {
        return res.status(401).json({
          success: false,
          message: "Invalid demo admin password"
        });
      }

      const adminDb = db.promise();

      await adminDb.execute(
        `INSERT INTO users (
          tu_id,
          name,
          email,
          username,
          displayname_th,
          faculty,
          major,
          role,
          access_level
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'teacher', 'admin')
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          email = VALUES(email),
          username = VALUES(username),
          displayname_th = VALUES(displayname_th),
          faculty = VALUES(faculty),
          major = VALUES(major),
          role = 'admin',
          access_level = 'admin'`,
        [
          "ADMINDEMO001",
          "ผู้ดูแลระบบตัวอย่าง",
          "admin.demo@example.com",
          DEMO_ADMIN_USERNAME,
          "ผู้ดูแลระบบตัวอย่าง",
          "คณะวิทยาศาสตร์และเทคโนโลยี",
          "Computer Science"
        ]
      );

      const [rows] = await adminDb.execute(
        `SELECT *
         FROM users
         WHERE tu_id = ?
         LIMIT 1`,
        ["ADMINDEMO001"]
      );

      if (!rows.length) {
        throw new Error("Unable to create or load demo admin");
      }

      return sendLoginSuccess(res, {
        ...rows[0],
        role: "teacher",
        access_level: "admin"
      });
    }

    if (
      isDevelopment() &&
      normalizedIdentifier === DEMO_TEACHER_USERNAME.toLowerCase()
    ) {
      if (password !== DEMO_TEACHER_PASSWORD) {
        return res.status(401).json({
          success: false,
          message: "Invalid demo teacher password"
        });
      }

      const teacherData = {
        username: DEMO_TEACHER_USERNAME,
        tu_id: "TEACHER001",
        email: "teacher.demo@example.com",
        displayname_th: "อาจารย์ตัวอย่าง",
        faculty: "คณะวิทยาศาสตร์และเทคโนโลยี",
        major: "Computer Science",
        role: "teacher"
      };

      const savedUser = await saveUser(teacherData);

      return sendLoginSuccess(res, {
        ...savedUser,
        username: teacherData.username,
        tu_id: teacherData.tu_id,
        email: teacherData.email,
        name: teacherData.displayname_th,
        displayname_th: teacherData.displayname_th,
        faculty: teacherData.faculty,
        major: teacherData.major,
        role: teacherData.role,
        access_level: savedUser.access_level || "user"
      });
    }

    const loginIdentifier = await resolveLoginIdentifier(identifier);
    const data = await verifyWithTuApi(loginIdentifier, password);

    const faculty =
      data.faculty ||
      data.Faculty ||
      data.faculty_name ||
      data.facultyName ||
      "";

    if (!isAllowedFaculty(faculty)) {
      return res.status(403).json({
        success: false,
        message: "อนุญาตเฉพาะผู้ใช้คณะวิทยาศาสตร์และเทคโนโลยี"
      });
    }

    const username = String(
      data.username ||
      data.username_en ||
      data.username_th ||
      loginIdentifier
    ).trim();

    const tuId = String(
      data.id ||
      data.tu_id ||
      data.username ||
      loginIdentifier
    ).trim();

    const accountType =
      data.type ||
      data.account_type ||
      data.accountType ||
      data.user_type ||
      data.userType ||
      data.status ||
      "";

    const role = getUserRole(accountType);

    const userData = {
      username,
      tu_id: tuId,
      email: data.email || data.email_address || null,
      displayname_th:
        data.displayname_th ||
        data.displayname ||
        data.name_th ||
        data.name ||
        username,
      faculty,
      major:
        data.department ||
        data.department_name ||
        data.major ||
        null,
      role
    };

    const savedUser = await saveUser(userData);

    return sendLoginSuccess(res, {
      ...savedUser,
      username: userData.username,
      tu_id: userData.tu_id,
      email: userData.email || savedUser.email,
      name: userData.displayname_th,
      displayname_th: userData.displayname_th,
      faculty: userData.faculty,
      major: userData.major,
      role: userData.role,
      access_level: savedUser.access_level || "user"
    });
  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(401).json({
      success: false,
      message: "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบบัญชีผู้ใช้และรหัสผ่าน"
    });
  }
});

app.get("/api/rooms", async (req, res) => {
  try {
    const userId = String(req.headers["x-user-id"] || "");

    if (!/^\d+$/.test(userId)) {
      return res.status(401).json({
        success: false,
        message: "Missing or invalid user ID"
      });
    }

    const user = await findUserById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found. Please log in again."
      });
    }

    const role = String(user.role || "").toLowerCase();

    if (!["student", "teacher"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Invalid user role"
      });
    }

    const requestedDate = String(req.query.date || "");
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    const date = datePattern.test(requestedDate)
      ? requestedDate
      : getBangkokDate();

    const [rooms, bookings] = await Promise.all([
      findRooms(role),
      findBookingsByDate(date)
    ]);

    const formattedRooms = rooms.map(room => {
      const roomCode = String(room.room_code || "").toLowerCase();
      const roomName = String(room.room_name || "").toLowerCase();

      const roomBookings = bookings.filter(booking => {
        if (Number(booking.room_id) === Number(room.room_id)) {
          return true;
        }

        const bookingRoom = String(booking.room || "").toLowerCase();

        return bookingRoom === roomCode || bookingRoom === roomName;
      });

      return {
        ...room,
        id: room.room_id,
        room_id: room.room_id,
        room_code: room.room_code,
        room_name: room.room_name,
        floor: room.floor,
        capacity: room.capacity,
        facilities: room.facilities,
        room_type: room.room_type,
        is_available: room.is_available,
        bookings: roomBookings
      };
    });

    return res.json({
      success: true,
      date,
      role,
      total: formattedRooms.length,
      rooms: formattedRooms
    });
  } catch (error) {
    console.error("Get rooms error:", error.message);

    return res.status(500).json({
      success: false,
      message: "ไม่สามารถโหลดข้อมูลห้องได้"
    });
  }
});

app.post("/api/bookings", async (req, res) => {
  try {
    const headerUserId = req.headers["x-user-id"];
    const bodyUserId = req.body.user_id;

    if (!headerUserId || !/^\d+$/.test(String(headerUserId))) {
      return res.status(401).json({
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่"
      });
    }

    const userId = String(headerUserId);

    if (bodyUserId && String(bodyUserId) !== userId) {
      return res.status(403).json({
        success: false,
        message: "User ID mismatch"
      });
    }

    const user = await findUserById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    const { room, date, start_time, end_time, purpose } = req.body;

    if (!room || !date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "Please provide room, date, start time and end time"
      });
    }

    const result = await createBooking({
      user_id: Number(userId),
      room,
      date,
      start_time,
      end_time,
      purpose
    });

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking_id: result.booking_id || result,
      status: "reserved"
    });
  } catch (error) {
    console.error("Create booking error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message || "ไม่สามารถจองห้องได้"
    });
  }
});

app.get("/api/bookings/:userId", async (req, res) => {
  try {
    const requestedUserId = String(req.params.userId);
    const headerUserId = String(req.headers["x-user-id"] || "");

    if (!/^\d+$/.test(requestedUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    if (!/^\d+$/.test(headerUserId)) {
      return res.status(401).json({
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่"
      });
    }

    if (headerUserId !== requestedUserId) {
      return res.status(403).json({
        success: false,
        message: "User ID mismatch"
      });
    }

    const user = await findUserById(requestedUserId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const bookings = await findBookingsByUser(requestedUserId);

    return res.json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error("Get user bookings error:", error.message);

    return res.status(500).json({
      success: false,
      message: "ไม่สามารถโหลดรายการจองได้"
    });
  }
});

app.post("/api/bookings/:bookingId/check-in", async (req, res) => {
  try {
    const bookingId = String(req.params.bookingId);
    const userId = String(req.headers["x-user-id"] || "");

    if (!/^\d+$/.test(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "รหัสรายการจองไม่ถูกต้อง"
      });
    }

    if (!/^\d+$/.test(userId)) {
      return res.status(401).json({
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่"
      });
    }

    const user = await findUserById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "ไม่พบบัญชีผู้ใช้งาน"
      });
    }

    await checkInBooking(Number(bookingId), Number(userId));

    return res.json({
      success: true,
      message: "เช็กอินสำเร็จ",
      status: "checked_in"
    });
  } catch (error) {
    console.error("Check-in error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message || "ไม่สามารถเช็กอินได้"
    });
  }
});

app.delete("/api/bookings/:bookingId", async (req, res) => {
  try {
    const bookingId = String(req.params.bookingId);
    const userId = String(req.headers["x-user-id"] || "");

    if (!/^\d+$/.test(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID"
      });
    }

    if (!/^\d+$/.test(userId)) {
      return res.status(401).json({
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่"
      });
    }

    const user = await findUserById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "ไม่พบบัญชีผู้ใช้งาน"
      });
    }

    const result = await cancelBooking(
      Number(bookingId),
      Number(userId)
    );

    if (!result) {
      return res.status(400).json({
        success: false,
        message: "ไม่สามารถยกเลิกรายการจองนี้ได้"
      });
    }

    return res.json({
      success: true,
      message: "Booking cancelled successfully",
      status: "cancelled"
    });
  } catch (error) {
    console.error("Cancel booking error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message || "ไม่สามารถยกเลิกการจองได้"
    });
  }
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

async function startServer() {
  try {
    await new Promise((resolve, reject) => {
      db.getConnection((error, connection) => {
        if (error) {
          return reject(error);
        }

        connection.release();
        resolve();
      });
    });

    await updateBookingStatuses();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);

      if (isDevelopment()) {
        console.log("Development mode enabled");
        console.log(`Demo teacher username: ${DEMO_TEACHER_USERNAME}`);
        console.log(`Demo admin username: ${DEMO_ADMIN_USERNAME}`);
      }

      setInterval(() => {
        updateBookingStatuses().catch(error => {
          console.error("Booking status update error:", error.message);
        });
      }, 60 * 1000);
    });
  } catch (error) {
    console.error("Could not start backend:", error.message);
    process.exit(1);
  }
}

startServer();
