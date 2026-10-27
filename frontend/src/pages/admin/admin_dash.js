import { useCallback, useEffect, useState } from "react";
import "../../css/admin/admin_dash.css";

const API_BASE_URL = "http://localhost:5001";

const STATUS_LABELS = {
  reserved: "รอดำเนินการ",
  confirmed: "ยืนยันแล้ว",
  checked_in: "เช็กอินแล้ว",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิก",
  no_show: "ไม่มาเช็กอิน",
};

const STATUS_ORDER = [
  "reserved",
  "confirmed",
  "checked_in",
  "completed",
  "cancelled",
  "no_show",
];

const RANGE_OPTIONS = [
  { value: "7d", label: "7 วันล่าสุด" },
  { value: "month", label: "เดือนนี้" },
  { value: "year", label: "ปีนี้" },
];

function formatDate(dateString) {
  if (!dateString) return "-";

  const date = new Date(
    `${String(dateString).slice(0, 10)}T00:00:00+07:00`
  );

  if (Number.isNaN(date.getTime())) return String(dateString);

  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function formatTime(time) {
  return time ? String(time).slice(0, 5) : "-";
}

function formatNumber(value) {
  return Number(value ?? 0).toLocaleString("th-TH");
}

function getPercent(value, total) {
  if (!total) return 0;
  return Math.round((Number(value ?? 0) / total) * 100);
}

function getRangeLabel(range) {
  return RANGE_OPTIONS.find((option) => option.value === range)?.label || "";
}

function RangeSelect({ label, value, onChange }) {
  return (
    <select
      className="admin-range-select"
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {RANGE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

async function fetchAdminApi(path, signal) {
  const token = localStorage.getItem("token");

  if (!token) {
    throw new Error("ไม่พบ Token กรุณาเข้าสู่ระบบใหม่");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
    signal,
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || !result.success) {
    throw new Error(result.message || "ไม่สามารถโหลดข้อมูลจากเซิร์ฟเวอร์ได้");
  }

  return result;
}

function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusRange, setStatusRange] = useState("7d");
  const [roomsRange, setRoomsRange] = useState("7d");
  const [peakRange, setPeakRange] = useState("7d");

  const [statusData, setStatusData] = useState([]);
  const [roomsData, setRoomsData] = useState([]);
  const [peakData, setPeakData] = useState([]);

  const [statusLoading, setStatusLoading] = useState(true);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [peakLoading, setPeakLoading] = useState(true);

  const [statusError, setStatusError] = useState("");
  const [roomsError, setRoomsError] = useState("");
  const [peakError, setPeakError] = useState("");

  const loadDashboard = useCallback(async (signal) => {
    try {
      setLoading(true);
      setError("");

      const result = await fetchAdminApi("/api/admin/dashboard", signal);
      setDashboard(result);
    } catch (err) {
      if (err.name !== "AbortError") {
        setError(err.message || "เกิดข้อผิดพลาดในการโหลด Dashboard");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    loadDashboard(controller.signal);

    return () => controller.abort();
  }, [loadDashboard]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStatus() {
      try {
        setStatusLoading(true);
        setStatusError("");

        const result = await fetchAdminApi(
          `/api/admin/analytics/status?range=${encodeURIComponent(statusRange)}`,
          controller.signal
        );

        const counts = result.statusCounts || {};

        setStatusData(
          STATUS_ORDER.map((status) => ({
            status,
            count: Number(counts[status] ?? 0),
          }))
        );
      } catch (err) {
        if (err.name !== "AbortError") {
          setStatusData([]);
          setStatusError(err.message || "ไม่สามารถโหลดสถานะการจองได้");
        }
      } finally {
        if (!controller.signal.aborted) setStatusLoading(false);
      }
    }

    loadStatus();
    return () => controller.abort();
  }, [statusRange]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRooms() {
      try {
        setRoomsLoading(true);
        setRoomsError("");

        const result = await fetchAdminApi(
          `/api/admin/analytics/popular-rooms?range=${encodeURIComponent(roomsRange)}`,
          controller.signal
        );

        const rows = Array.isArray(result.rooms) ? result.rooms : [];

        setRoomsData(
          rows.map((room) => ({
            ...room,
            count: Number(room.total_bookings ?? room.count ?? 0),
          }))
        );
      } catch (err) {
        if (err.name !== "AbortError") {
          setRoomsData([]);
          setRoomsError(err.message || "ไม่สามารถโหลดห้องยอดนิยมได้");
        }
      } finally {
        if (!controller.signal.aborted) setRoomsLoading(false);
      }
    }

    loadRooms();
    return () => controller.abort();
  }, [roomsRange]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadPeakTimes() {
      try {
        setPeakLoading(true);
        setPeakError("");

        const result = await fetchAdminApi(
          `/api/admin/analytics/peak-times?range=${encodeURIComponent(peakRange)}`,
          controller.signal
        );

        const rows = Array.isArray(result.peakTimes) ? result.peakTimes : [];

        setPeakData(
          rows.map((period) => ({
            ...period,
            label: period.time_range ?? period.label ?? "-",
            count: Number(period.total_bookings ?? period.count ?? 0),
          }))
        );
      } catch (err) {
        if (err.name !== "AbortError") {
          setPeakData([]);
          setPeakError(err.message || "ไม่สามารถโหลดช่วงเวลาการจองได้");
        }
      } finally {
        if (!controller.signal.aborted) setPeakLoading(false);
      }
    }

    loadPeakTimes();
    return () => controller.abort();
  }, [peakRange]);

  const summary = dashboard?.summary || {};
  const todayBookings = Array.isArray(dashboard?.todayBookings)
    ? dashboard.todayBookings
    : [];

  const cards = [
    {
      key: "rooms",
      label: "ห้องประชุมทั้งหมด",
      value: summary.totalRooms,
      detail: `เปิดให้บริการ ${formatNumber(summary.availableRooms)} ห้อง`,
      icon: "▤",
      className: "rooms",
    },
    {
      key: "users",
      label: "ผู้ใช้งานทั้งหมด",
      value: summary.totalUsers,
      detail: "นักศึกษาและอาจารย์",
      icon: "♙",
      className: "users",
    },
    {
      key: "bookings",
      label: "การจองทั้งหมด",
      value: summary.totalBookings,
      detail: "รายการจองในระบบ",
      icon: "▣",
      className: "bookings",
    },
    {
      key: "today",
      label: "การจองวันนี้",
      value: summary.todayBookingsCount,
      detail: "รายการตามวันที่ประเทศไทย",
      icon: "◷",
      className: "today",
    },
  ];

  const statusTotal = statusData.reduce(
    (sum, item) => sum + Number(item.count ?? 0),
    0
  );

  const maxRoom = Math.max(
    ...roomsData.map((item) => Number(item.count ?? item.total_bookings ?? 0)),
    1
  );

  const maxPeak = Math.max(
    ...peakData.map((item) => Number(item.count ?? item.total_bookings ?? 0)),
    1
  );

  return (
    <main className="admin-dashboard">
      <section className="admin-dashboard-intro">
        <div>
          <p className="admin-eyebrow">SYSTEM OVERVIEW</p>
          <h2>ภาพรวมระบบ</h2>
          <p className="admin-dashboard-description">
            ตรวจสอบและวิเคราะห์การใช้ห้องประชุม Booking CSTU
          </p>
        </div>

        <div className="admin-dashboard-date">
          <span>วันที่ข้อมูล</span>
          <strong>
            {dashboard ? formatDate(dashboard.date) : "กำลังโหลด..."}
          </strong>
        </div>
      </section>

      {error && (
        <section className="admin-dashboard-error" role="alert">
          <strong>โหลดข้อมูล Dashboard ไม่สำเร็จ</strong>
          <p>{error}</p>
          <button type="button" onClick={() => window.location.reload()}>
            ลองอีกครั้ง
          </button>
        </section>
      )}

      <section className="admin-dashboard-cards" aria-label="สรุปข้อมูลระบบ">
        {cards.map((card) => (
          <article
            className={`admin-stat-card ${card.className}`}
            key={card.key}
          >
            <div className="admin-stat-card-top">
              <span className="admin-stat-label">{card.label}</span>
              <span className="admin-stat-icon" aria-hidden="true">
                {card.icon}
              </span>
            </div>

            <div className="admin-stat-value">
              {loading || error ? "—" : formatNumber(card.value)}
            </div>

            <p className="admin-stat-detail">
              {loading ? "กำลังโหลดข้อมูล..." : card.detail}
            </p>
          </article>
        ))}
      </section>

      <section className="admin-dashboard-section-heading">
        <div>
          <p className="admin-eyebrow">BOOKING ANALYTICS</p>
          <h2>วิเคราะห์การจอง</h2>
        </div>
      </section>

      <section className="admin-dashboard-panel">
        <div className="admin-panel-heading admin-filter-heading">
          <div>
            <h2>สถานะการจอง</h2>
            <p>สรุปจำนวนรายการจองตามสถานะในช่วงเวลาที่เลือก</p>
          </div>

          <RangeSelect
            label="ช่วงเวลาสถานะการจอง"
            value={statusRange}
            onChange={setStatusRange}
          />
        </div>

        {statusLoading ? (
          <div className="admin-dashboard-message">กำลังโหลดข้อมูล...</div>
        ) : statusError ? (
          <div className="admin-dashboard-message">{statusError}</div>
        ) : (
          <>
            <div className="admin-status-total">
              <span>รายการจองในช่วง {getRangeLabel(statusRange)}</span>
              <strong>{formatNumber(statusTotal)}</strong>
            </div>

            <div className="admin-status-grid">
              {STATUS_ORDER.map((status) => {
                const item = statusData.find((row) => row.status === status);
                const count = Number(item?.count ?? 0);

                return (
                  <div className="admin-status-item" key={status}>
                    <div className="admin-status-item-heading">
                      <span className="admin-status-name">
                        <span className={`admin-status-dot status-${status}`} />
                        {STATUS_LABELS[status]}
                      </span>
                      <strong>{formatNumber(count)}</strong>
                    </div>

                    <div className="admin-status-track">
                      <div
                        className={`admin-status-fill status-${status}`}
                        style={{ width: `${getPercent(count, statusTotal)}%` }}
                      />
                    </div>

                    <span className="admin-status-percent">
                      {getPercent(count, statusTotal)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="admin-analytics-grid">
        <article className="admin-dashboard-panel">
          <div className="admin-panel-heading admin-filter-heading">
            <div>
              <h2>ห้องยอดนิยม</h2>
              <p>จัดอันดับห้องตามจำนวนการจอง</p>
            </div>

            <RangeSelect
              label="ช่วงเวลาห้องยอดนิยม"
              value={roomsRange}
              onChange={setRoomsRange}
            />
          </div>

          {roomsLoading ? (
            <div className="admin-dashboard-message">กำลังโหลดข้อมูล...</div>
          ) : roomsError ? (
            <div className="admin-dashboard-message">{roomsError}</div>
          ) : roomsData.length === 0 ? (
            <div className="admin-dashboard-message">
              ไม่พบรายการจองในช่วงเวลานี้
            </div>
          ) : (
            <div className="admin-ranking-list">
              {roomsData.map((room, index) => {
                const count = Number(
                  room.total_bookings ?? room.count ?? 0
                );

                return (
                  <div
                    className="admin-ranking-item"
                    key={room.room_id ?? room.room_code ?? index}
                  >
                    <span className="admin-ranking-number">{index + 1}</span>

                    <div className="admin-ranking-content">
                      <div className="admin-ranking-label">
                        <strong>
                          {room.room_name || room.room_code || "-"}
                        </strong>
                        <span>{formatNumber(count)} ครั้ง</span>
                      </div>

                      <div className="admin-ranking-track">
                        <div
                          className="admin-ranking-fill"
                          style={{
                            width: `${(count / maxRoom) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>

        <article className="admin-dashboard-panel">
          <div className="admin-panel-heading admin-filter-heading">
            <div>
              <h2>ช่วงเวลาที่มีการจองสูง</h2>
              <p>จำนวนรายการจองจำแนกตามช่วงเวลา</p>
            </div>

            <RangeSelect
              label="ช่วงเวลาวิเคราะห์ช่วงเวลาการจอง"
              value={peakRange}
              onChange={setPeakRange}
            />
          </div>

          {peakLoading ? (
            <div className="admin-dashboard-message">กำลังโหลดข้อมูล...</div>
          ) : peakError ? (
            <div className="admin-dashboard-message">{peakError}</div>
          ) : peakData.length === 0 ? (
            <div className="admin-dashboard-message">
              ไม่พบรายการจองในช่วงเวลานี้
            </div>
          ) : (
            <div className="admin-ranking-list">
              {peakData.map((period, index) => {
                const count = Number(
                  period.total_bookings ?? period.count ?? 0
                );
                const label = period.time_range ?? period.label ?? "-";

                return (
                  <div
                    className="admin-ranking-item"
                    key={`${label}-${index}`}
                  >
                    <span className="admin-peak-icon">◷</span>

                    <div className="admin-ranking-content">
                      <div className="admin-ranking-label">
                        <strong>{label}</strong>
                        <span>{formatNumber(count)} ครั้ง</span>
                      </div>

                      <div className="admin-ranking-track">
                        <div
                          className="admin-ranking-fill peak"
                          style={{
                            width: `${(count / maxPeak) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </article>
      </section>

      <section className="admin-dashboard-panel admin-today-panel">
        <div className="admin-panel-heading">
          <div>
            <h2>รายการจองวันนี้</h2>
            <p>
              {dashboard
                ? formatDate(dashboard.date)
                : "รายการจองจากฐานข้อมูล"}
            </p>
          </div>

          <span className="admin-today-count">
            {loading
              ? "กำลังโหลด..."
              : `${formatNumber(todayBookings.length)} รายการ`}
          </span>
        </div>

        {loading ? (
          <div className="admin-dashboard-message">
            กำลังโหลดรายการจอง...
          </div>
        ) : error ? (
          <div className="admin-dashboard-message">
            ไม่สามารถโหลดรายการจองได้
          </div>
        ) : todayBookings.length === 0 ? (
          <div className="admin-dashboard-empty">
            <span className="admin-empty-icon" aria-hidden="true">
              ▦
            </span>
            <strong>ไม่มีรายการจองวันนี้</strong>
            <p>ไม่พบรายการจองในวันที่แสดงอยู่</p>
          </div>
        ) : (
          <div className="admin-table-scroll">
            <table className="admin-dashboard-table">
              <thead>
                <tr>
                  <th>รหัสจอง</th>
                  <th>ห้องประชุม</th>
                  <th>ผู้จอง</th>
                  <th>เวลา</th>
                  <th>สถานะ</th>
                </tr>
              </thead>

              <tbody>
                {todayBookings.map((booking, index) => (
                  <tr key={booking.booking_id ?? index}>
                    <td className="admin-booking-id">
                      #{booking.booking_id}
                    </td>

                    <td>
                      <strong>{booking.room_code || "-"}</strong>
                      <span className="admin-table-secondary">
                        {booking.room_name || ""}
                      </span>
                    </td>

                    <td>{booking.user_name || "-"}</td>

                    <td className="admin-booking-time">
                      {formatTime(booking.start_time)}–
                      {formatTime(booking.end_time)}
                    </td>

                    <td>
                      <span
                        className={`admin-booking-status status-${booking.status}`}
                      >
                        {STATUS_LABELS[booking.status] || booking.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

export default AdminDashboard;
