const { BOOKING_QUOTA_STATUSES } = require("./booking-status");

const BOOKING_QUOTA_LIMIT_MINUTES = 20 * 60;
const MIN_BOOKING_MINUTES = 30;
const MAX_BOOKING_MINUTES = 120;

function normalizeDate(value) {
  if (value instanceof Date) {
    return [
      value.getFullYear(),
      String(value.getMonth() + 1).padStart(2, "0"),
      String(value.getDate()).padStart(2, "0")
    ].join("-");
  }

  return String(value || "").trim().slice(0, 10);
}

function normalizeTime(value) {
  const time = String(value || "").trim();
  return /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time;
}

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function isWeekday(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day >= 1 && day <= 5;
}

function getMinutes(time) {
  const match = normalizeTime(time).match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return NaN;
  const [, hourText, minuteText, secondText] = match;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return NaN;
  return hour * 60 + minute + second / 60;
}

function addOneMonthClamped(dateString) {
  const [year, month, day] = dateString.split("-").map(Number);
  const target = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)
  ).getUTCDate();
  return [
    target.getUTCFullYear(),
    String(target.getUTCMonth() + 1).padStart(2, "0"),
    String(Math.min(day, lastDay)).padStart(2, "0")
  ].join("-");
}

function validateBookingDateTime(date, startTime, endTime, now) {
  const bookingDate = normalizeDate(date);
  const start = normalizeTime(startTime);
  const end = normalizeTime(endTime);
  if (!isValidDate(bookingDate)) throw new Error("วันที่จองไม่ถูกต้อง");

  const today = normalizeDate(now);
  const maxBookingDate = addOneMonthClamped(today);
  if (bookingDate < today || bookingDate > maxBookingDate) {
    throw new Error("สามารถจองล่วงหน้าได้ไม่เกิน 1 เดือน");
  }
  if (!isWeekday(bookingDate)) {
    throw new Error("สามารถจองห้องได้เฉพาะวันจันทร์ถึงวันศุกร์");
  }

  const startMinutes = getMinutes(start);
  const endMinutes = getMinutes(end);
  if (!Number.isFinite(startMinutes) || !Number.isFinite(endMinutes)) {
    throw new Error("รูปแบบเวลาไม่ถูกต้อง");
  }
  if (startMinutes < 8 * 60 || endMinutes > 16 * 60 || endMinutes <= startMinutes) {
    throw new Error("เวลาให้บริการคือ 08:00–16:00 น.");
  }

  const duration = endMinutes - startMinutes;
  if (
    duration < MIN_BOOKING_MINUTES ||
    duration > MAX_BOOKING_MINUTES ||
    duration % MIN_BOOKING_MINUTES !== 0
  ) {
    throw new Error("ระยะเวลาจองต้องอยู่ระหว่าง 30 นาที–2 ชั่วโมง โดยเพิ่มครั้งละ 30 นาที");
  }

  const nowDateTime = String(now || "").trim();
  const requestedStart = `${bookingDate} ${start}`;
  if (requestedStart <= nowDateTime) {
    throw new Error("ไม่สามารถจองวันที่หรือเวลาที่ผ่านมาแล้วได้");
  }

  return { date: bookingDate, startTime: start, endTime: end, duration };
}

function getMonthDateBounds(date) {
  const bookingDate = normalizeDate(date);
  const monthStart = `${bookingDate.slice(0, 7)}-01`;
  const [year, month] = bookingDate.slice(0, 7).split("-").map(Number);
  const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;
  return { monthStart, nextMonthStart: `${nextMonth}-01` };
}

function summarizeBookingQuota(usedMinutes, requestedMinutes = 0) {
  const used = Math.max(0, Number(usedMinutes) || 0);
  const requested = Math.max(0, Number(requestedMinutes) || 0);
  const total = used + requested;
  return {
    limit_minutes: BOOKING_QUOTA_LIMIT_MINUTES,
    used_minutes: total,
    remaining_minutes: Math.max(0, BOOKING_QUOTA_LIMIT_MINUTES - total),
    exceeded: total > BOOKING_QUOTA_LIMIT_MINUTES
  };
}

function calculateMonthlyUsageMinutes(bookings, month) {
  return bookings.reduce((total, booking) => {
    const date = normalizeDate(booking.booking_date || booking.date);
    const status = String(booking.status || "");
    if (
      date.slice(0, 7) !== month ||
      !BOOKING_QUOTA_STATUSES.includes(status)
    ) {
      return total;
    }

    const start = getMinutes(booking.start_time);
    const end = getMinutes(booking.end_time);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return total;
    }
    return total + end - start;
  }, 0);
}

module.exports = {
  BOOKING_QUOTA_STATUSES,
  BOOKING_QUOTA_LIMIT_MINUTES,
  MIN_BOOKING_MINUTES,
  MAX_BOOKING_MINUTES,
  normalizeDate,
  normalizeTime,
  isValidDate,
  isWeekday,
  getMinutes,
  addOneMonthClamped,
  validateBookingDateTime,
  getMonthDateBounds,
  summarizeBookingQuota,
  calculateMonthlyUsageMinutes
};
