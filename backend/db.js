const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'data.sqlite');

const ROOM_SEED_PATH = path.join(
  __dirname,
  'database',
  'tables',
  'rooms.sql'
);

function parseSqlLiteral(value) {
  const trimmed = value.trim();
  if (/^NULL$/i.test(trimmed)) return null;
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  const number = Number(trimmed);
  if (!Number.isFinite(number)) {
    throw new Error(`Unsupported room seed value: ${trimmed}`);
  }
  return number;
}

function parseRoomSeed(sql) {
  const statement = sql.match(
    /INSERT\s+INTO\s+rooms\s*\(([\s\S]*?)\)\s*VALUES\s*([\s\S]*?);/i
  );
  if (!statement) {
    throw new Error(`Could not find the rooms INSERT statement in ${ROOM_SEED_PATH}`);
  }

  const columns = statement[1]
    .split(',')
    .map(column => column.trim().replace(/[`"']/g, '').toLowerCase());
  const valuesText = statement[2].replace(/--[^\n]*/g, '');
  const rooms = [];

  for (let index = 0; index < valuesText.length; index += 1) {
    if (valuesText[index] !== '(') continue;

    const rowValues = [];
    let valueStart = index + 1;
    let inString = false;
    let rowClosed = false;

    for (index += 1; index < valuesText.length; index += 1) {
      const character = valuesText[index];

      if (character === "'") {
        if (inString && valuesText[index + 1] === "'") {
          index += 1;
          continue;
        }
        inString = !inString;
      } else if (!inString && character === ',') {
        rowValues.push(parseSqlLiteral(valuesText.slice(valueStart, index)));
        valueStart = index + 1;
      } else if (!inString && character === ')') {
        rowValues.push(parseSqlLiteral(valuesText.slice(valueStart, index)));
        rowClosed = true;
        break;
      }
    }

    if (!rowClosed || rowValues.length !== columns.length) {
      throw new Error(`Invalid room row in ${ROOM_SEED_PATH}`);
    }

    rooms.push(Object.fromEntries(columns.map((column, valueIndex) => [
      column,
      rowValues[valueIndex]
    ])));
  }

  if (rooms.length === 0) {
    throw new Error(`No room records found in ${ROOM_SEED_PATH}`);
  }
  return rooms;
}

const ROOM_SEED = parseRoomSeed(fs.readFileSync(ROOM_SEED_PATH, 'utf8'));

const exists = fs.existsSync(DB_PATH);
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  if (!exists) {
    db.run(`CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      student_id TEXT,
      email TEXT,
      displayname_th TEXT,
      faculty TEXT,
      major TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      room TEXT,
      date TEXT,
      start_time TEXT,
      end_time TEXT,
      purpose TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )`);
  } else {
    db.run('ALTER TABLE users ADD COLUMN email TEXT', () => {});
  }

  db.run(`CREATE TABLE IF NOT EXISTS rooms (
    room_id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL UNIQUE,
    room_name TEXT NOT NULL,
    floor INTEGER NOT NULL,
    department TEXT DEFAULT 'Computer Science',
    capacity INTEGER NOT NULL,
    facilities TEXT,
    department_color TEXT,
    is_available INTEGER DEFAULT 1
  )`);

  db.run(
    "ALTER TABLE rooms ADD COLUMN department TEXT DEFAULT 'Computer Science'",
    () => {}
  );
  db.run('ALTER TABLE rooms ADD COLUMN department_color TEXT', () => {});

  const insertRoom = db.prepare(`INSERT INTO rooms
    (room_code, room_name, floor, department, capacity, facilities, department_color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(room_code) DO UPDATE SET
      room_name = excluded.room_name,
      floor = excluded.floor,
      department = excluded.department,
      capacity = excluded.capacity,
      facilities = excluded.facilities,
      department_color = excluded.department_color`);
  ROOM_SEED.forEach(room => insertRoom.run([
    room.room_code,
    room.room_name,
    room.floor,
    room.department,
    room.capacity,
    room.facilities,
    room.department_color
  ]));
  insertRoom.finalize();
});

module.exports = {
  db,
  upsertUser: function (user, cb) {
    // user: { username, student_id, email, displayname_th, faculty, major }
    const stmt = `INSERT INTO users (username, student_id, email, displayname_th, faculty, major)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        student_id=excluded.student_id,
        email=excluded.email,
        displayname_th=excluded.displayname_th,
        faculty=excluded.faculty,
        major=excluded.major`;
    db.run(stmt, [user.username, user.student_id, user.email, user.displayname_th, user.faculty, user.major], function (err) {
      if (err) return cb(err);
      // return the user id
      db.get('SELECT id FROM users WHERE username = ?', [user.username], (err2, row) => {
        if (err2) return cb(err2);
        cb(null, row?.id);
      });
    });
  },
  getUserByEmail: function (email, cb) {
    db.get('SELECT id, username FROM users WHERE LOWER(email) = LOWER(?)', [email], cb);
  },
  addBooking: function (booking, cb) {
    const stmt = `INSERT INTO bookings (user_id, room, date, start_time, end_time, purpose)
      VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(stmt, [booking.user_id, booking.room, booking.date, booking.start_time, booking.end_time, booking.purpose], function (err) {
      if (err) return cb(err);
      cb(null, this.lastID);
    });
  },
  getBookingsByUser: function (user_id, cb) {
    db.all('SELECT * FROM bookings WHERE user_id = ? ORDER BY created_at DESC', [user_id], cb);
  },
  getRooms: function (cb) {
    db.all(`SELECT room_id AS id, room_code, room_name, floor, capacity,
      facilities, department, department_color, is_available
      FROM rooms ORDER BY floor, room_id`, cb);
  },
  getBookingsByDate: function (date, cb) {
    db.all(
      `SELECT room, date, start_time, end_time
       FROM bookings
       WHERE date = ?
       ORDER BY start_time`,
      [date],
      cb
    );
  },
  deleteBooking: function (booking_id, user_id, cb) {
    db.run('DELETE FROM bookings WHERE id = ? AND user_id = ?', [booking_id, user_id], function (err) {
      if (err) return cb(err);
      cb(null, this.changes);
    });
  }
};
