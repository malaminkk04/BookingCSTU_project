const BOOKING_STATUSES = Object.freeze([
  "reserved",
  "checked_in",
  "completed",
  "cancelled",
  "no_show"
]);

const ACTIVE_BOOKING_STATUSES = Object.freeze([
  "reserved",
  "checked_in"
]);

const BOOKING_QUOTA_STATUSES = Object.freeze([
  "reserved",
  "checked_in",
  "completed",
  "no_show"
]);

function isBookingStatus(status) {
  return BOOKING_STATUSES.includes(status);
}

function summarizeBookingStatuses(rows) {
  const statusCounts = Object.fromEntries(
    BOOKING_STATUSES.map((status) => [status, 0])
  );
  const unknownStatuses = [];

  for (const row of rows) {
    const status =
      typeof row.status === "string" && row.status
        ? row.status
        : "(empty)";
    const count = Number(row.total);
    const total = Number.isFinite(count) ? count : 0;

    if (Object.prototype.hasOwnProperty.call(statusCounts, status)) {
      statusCounts[status] += total;
    } else {
      unknownStatuses.push({ status, total });
    }
  }

  return { statusCounts, unknownStatuses };
}

module.exports = {
  BOOKING_STATUSES,
  ACTIVE_BOOKING_STATUSES,
  BOOKING_QUOTA_STATUSES,
  TEACHER_USAGE_STATUSES: BOOKING_QUOTA_STATUSES,
  isBookingStatus,
  summarizeBookingStatuses
};
