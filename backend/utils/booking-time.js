const BANGKOK_TIME_ZONE = "Asia/Bangkok";

function parseBangkokDateTime(value) {
  if (value instanceof Date) return value.getTime();

  const input = String(value || "").trim();
  if (!input) return NaN;

  const normalized = input.replace(" ", "T");
  const hasTimeZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  const timestamp = Date.parse(
    hasTimeZone ? normalized : `${normalized}+07:00`
  );
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function formatBangkokDateTime(timestamp) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );
  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function getBangkokDateTimeMinutesBefore(dateTime, minutes) {
  const timestamp = parseBangkokDateTime(dateTime);
  if (!Number.isFinite(timestamp)) throw new Error("เวลาที่ระบุไม่ถูกต้อง");
  return formatBangkokDateTime(timestamp - Number(minutes) * 60_000);
}

function getBookingStartTimestamp(date, startTime) {
  const bookingDate = String(date || "").trim().slice(0, 10);
  const time = String(startTime || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || !/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) {
    return NaN;
  }
  const normalizedTime = time.length === 5 ? `${time}:00` : time;
  return parseBangkokDateTime(`${bookingDate} ${normalizedTime}`);
}

function isWithinCheckInWindow(startTimestamp, nowTimestamp, graceMinutes = 15) {
  return Number.isFinite(startTimestamp) &&
    Number.isFinite(nowTimestamp) &&
    nowTimestamp >= startTimestamp - graceMinutes * 60_000 &&
    nowTimestamp <= startTimestamp + graceMinutes * 60_000;
}

function isNoShowEligible(startTimestamp, nowTimestamp, graceMinutes = 15) {
  return Number.isFinite(startTimestamp) &&
    Number.isFinite(nowTimestamp) &&
    nowTimestamp - startTimestamp > graceMinutes * 60_000;
}

function isSuspendedUntilActive(suspendedUntil, nowTimestamp = Date.now()) {
  if (!suspendedUntil) return false;
  const suspendedTimestamp = parseBangkokDateTime(suspendedUntil);
  return Number.isFinite(suspendedTimestamp) && suspendedTimestamp > nowTimestamp;
}

module.exports = {
  parseBangkokDateTime,
  formatBangkokDateTime,
  getBangkokDateTimeMinutesBefore,
  getBookingStartTimestamp,
  isWithinCheckInWindow,
  isNoShowEligible,
  isSuspendedUntilActive
};
