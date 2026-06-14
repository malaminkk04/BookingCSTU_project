const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'data.sqlite');

const exists = fs.existsSync(DB_PATH);
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  if (!exists) {
    db.run(`CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE,
      student_id TEXT,
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
  }
});

module.exports = {
  db,
  upsertUser: function (user, cb) {
    // user: { username, student_id, displayname_th, faculty, major }
    const stmt = `INSERT INTO users (username, student_id, displayname_th, faculty, major)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(username) DO UPDATE SET
        student_id=excluded.student_id,
        displayname_th=excluded.displayname_th,
        faculty=excluded.faculty,
        major=excluded.major`;
    db.run(stmt, [user.username, user.student_id, user.displayname_th, user.faculty, user.major], function (err) {
      if (err) return cb(err);
      // return the user id
      db.get('SELECT id FROM users WHERE username = ?', [user.username], (err2, row) => {
        if (err2) return cb(err2);
        cb(null, row?.id);
      });
    });
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
  }
};
