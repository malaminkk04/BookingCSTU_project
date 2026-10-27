
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/admin/admin_accounts.css";

const API_BASE_URL = "http://localhost:5001";

const ROLE_LABELS = {
  student: "นักศึกษา",
  teacher: "อาจารย์",
  admin: "ผู้ดูแลระบบ",
};

const BOOKING_STATUS_LABELS = {
  pending: "รอดำเนินการ",
  confirmed: "ยืนยันแล้ว",
  approved: "อนุมัติแล้ว",
  checked_in: "เช็กอินแล้ว",
  completed: "เสร็จสิ้น",
  cancelled: "ยกเลิกแล้ว",
  rejected: "ไม่อนุมัติ",
  no_show: "ไม่มาใช้งาน",
};

function getHeaders() {
  const token = localStorage.getItem("token");

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getDisplayName(user) {
  return (
    user.displayname_th ||
    user.name ||
    user.username ||
    user.tu_id ||
    `User #${user.user_id}`
  );
}

function isSuspended(user) {
  if (!user.suspended_until) return false;

  const value = String(user.suspended_until).replace(" ", "T");
  const date = new Date(
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
      ? value
      : `${value}+07:00`
  );

  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now();
}

function formatDateTime(value) {
  if (!value) return "-";

  const text = String(value);
  const date = new Date(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(text)
      ? `${text.replace(" ", "T")}+07:00`
      : text
  );

  if (Number.isNaN(date.getTime())) return text;

  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatDate(value) {
  if (!value) return "-";

  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  return text;
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : "-";
}

function normalizeBookingStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function getBookingStatusLabel(status) {
  return BOOKING_STATUS_LABELS[status] || status || "-";
}

export default function AdminAccounts() {
  const navigate = useNavigate();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users`,
        {
          headers: getHeaders(),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "ไม่สามารถโหลดบัญชีผู้ใช้ได้"
        );
      }

      setUsers(Array.isArray(result.users) ? result.users : []);
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาดในการโหลดบัญชี");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshKey]);

  const summary = useMemo(() => {
    return {
      total: users.length,
      students: users.filter(
        (user) => String(user.role).toLowerCase() === "student"
      ).length,
      teachers: users.filter(
        (user) => String(user.role).toLowerCase() === "teacher"
      ).length,
      suspended: users.filter(isSuspended).length,
    };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return users.filter((user) => {
      const role = String(user.role || "").toLowerCase();

      const searchableText = [
        user.user_id,
        user.tu_id,
        user.username,
        user.name,
        user.displayname_th,
        user.email,
        user.faculty,
        user.major,
      ]
        .map((value) => String(value ?? ""))
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        !keyword || searchableText.includes(keyword);

      const matchesRole =
        roleFilter === "all" || role === roleFilter;

      const suspended = isSuspended(user);

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "suspended" && suspended) ||
        (statusFilter === "active" && !suspended);

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [users, search, roleFilter, statusFilter]);

  async function openHistory(user) {
    setSelectedUser(user);
    setHistory([]);
    setHistoryError("");
    setHistoryLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users/${encodeURIComponent(
          user.user_id
        )}/bookings`,
        {
          headers: getHeaders(),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "ไม่สามารถโหลดประวัติการจองได้"
        );
      }

      setHistory(
        Array.isArray(result.bookings) ? result.bookings : []
      );
    } catch (err) {
      setHistoryError(
        err.message || "ไม่สามารถโหลดประวัติการจองได้"
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  async function toggleSuspension(user) {
    const suspended = isSuspended(user);

    const confirmed = window.confirm(
      suspended
        ? `ยืนยันปลดระงับบัญชี ${getDisplayName(user)} หรือไม่?`
        : `ยืนยันระงับบัญชี ${getDisplayName(user)} เป็นเวลา 30 วันหรือไม่?`
    );

    if (!confirmed) return;

    setActionLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/users/${encodeURIComponent(
          user.user_id
        )}/suspension`,
        {
          method: "PATCH",
          headers: getHeaders(),
          body: JSON.stringify({
            action: suspended ? "unsuspend" : "suspend",
          }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
        return;
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "ไม่สามารถเปลี่ยนสถานะบัญชีได้"
        );
      }

      setMessage(result.message || "เปลี่ยนสถานะบัญชีสำเร็จ");

      await loadUsers();

      setSelectedUser((current) =>
        current && current.user_id === user.user_id
          ? {
              ...current,
              suspended_until: result.suspended_until ?? null,
            }
          : current
      );
    } catch (err) {
      setError(
        err.message || "เกิดข้อผิดพลาดในการเปลี่ยนสถานะบัญชี"
      );
    } finally {
      setActionLoading(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setRoleFilter("all");
    setStatusFilter("all");
  }

  function closeHistoryModal() {
    if (historyLoading) return;

    setSelectedUser(null);
    setHistory([]);
    setHistoryError("");
  }

  return (
    <div className="admin-accounts-page">
      <main className="admin-accounts-main">
        <header className="admin-accounts-heading">
          <div>
            <p className="admin-accounts-eyebrow">
              BOOKING CSTU / ADMIN
            </p>
            <h1>จัดการบัญชี</h1>
            <p className="admin-accounts-subtitle">
              ตรวจสอบบัญชีผู้ใช้และจัดการสถานะการใช้งาน
            </p>
          </div>

          <button
            type="button"
            className="admin-accounts-refresh"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            {loading ? "กำลังโหลด..." : "รีเฟรชข้อมูล"}
          </button>
        </header>

        {error && (
          <div className="admin-accounts-alert error" role="alert">
            {error}
          </div>
        )}

        {message && (
          <div className="admin-accounts-alert success" role="status">
            {message}
          </div>
        )}

        <section className="admin-accounts-summary">
          <article className="admin-accounts-summary-card">
            <span className="admin-accounts-summary-icon">
              <i className="fa-solid fa-users" aria-hidden="true" />
            </span>
            <span>บัญชีทั้งหมด</span>
            <strong>{loading ? "—" : summary.total}</strong>
            <small>ผู้ใช้ทั้งหมดในระบบ</small>
          </article>

          <article className="admin-accounts-summary-card">
            <span className="admin-accounts-summary-icon">
              <i
                className="fa-solid fa-graduation-cap"
                aria-hidden="true"
              />
            </span>
            <span>นักศึกษา</span>
            <strong>{loading ? "—" : summary.students}</strong>
            <small>บัญชีประเภท Student</small>
          </article>

          <article className="admin-accounts-summary-card">
            <span className="admin-accounts-summary-icon">
              <i
                className="fa-solid fa-chalkboard-user"
                aria-hidden="true"
              />
            </span>
            <span>อาจารย์</span>
            <strong>{loading ? "—" : summary.teachers}</strong>
            <small>บัญชีประเภท Teacher</small>
          </article>

          <article className="admin-accounts-summary-card">
            <span className="admin-accounts-summary-icon">
              <i
                className="fa-solid fa-user-lock"
                aria-hidden="true"
              />
            </span>
            <span>ถูกระงับ</span>
            <strong>{loading ? "—" : summary.suspended}</strong>
            <small>บัญชีที่กำลังถูกระงับ</small>
          </article>
        </section>

        <section className="admin-accounts-panel">
          <div className="admin-accounts-panel-heading">
            <div>
              <h2>บัญชีผู้ใช้ทั้งหมด</h2>
              <p>ค้นหา ตรวจสอบ และจัดการบัญชีในระบบ</p>
            </div>
            <span className="admin-accounts-count">
              {filteredUsers.length} บัญชี
            </span>
          </div>

          <div className="admin-accounts-filters">
            <label className="admin-accounts-search">
              <span>ค้นหาบัญชี</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ชื่อ, TU ID, รหัสผู้ใช้ หรืออีเมล"
              />
            </label>

            <label>
              <span>ประเภทบัญชี</span>
              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
              >
                <option value="all">ทุกประเภท</option>
                <option value="student">นักศึกษา</option>
                <option value="teacher">อาจารย์</option>
                <option value="admin">ผู้ดูแลระบบ</option>
              </select>
            </label>

            <label>
              <span>สถานะบัญชี</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                <option value="all">ทุกสถานะ</option>
                <option value="active">ใช้งานปกติ</option>
                <option value="suspended">ถูกระงับ</option>
              </select>
            </label>

            <button
              type="button"
              className="admin-accounts-clear"
              onClick={clearFilters}
            >
              ล้างตัวกรอง
            </button>
          </div>

          <div className="admin-accounts-table-wrap">
            <table className="admin-accounts-table">
              <thead>
                <tr>
                  <th>บัญชีผู้ใช้</th>
                  <th>TU ID</th>
                  <th>ประเภท</th>
                  <th>ไม่มาใช้งาน</th>
                  <th>สถานะบัญชี</th>
                  <th>จัดการ</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="admin-accounts-empty">
                      กำลังโหลดข้อมูลบัญชี...
                    </td>
                  </tr>
                ) : filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="admin-accounts-empty">
                      ไม่พบบัญชีตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user) => {
                    const suspended = isSuspended(user);

                    return (
                      <tr key={user.user_id}>
                        <td>
                          <div className="admin-accounts-user">
                            <strong>{getDisplayName(user)}</strong>
                            <small>
                              {user.email || "ไม่มีอีเมล"}
                            </small>
                          </div>
                        </td>

                        <td>{user.tu_id || user.username || "-"}</td>

                        <td>
                          <span
                            className={`admin-accounts-role role-${user.role}`}
                          >
                            {ROLE_LABELS[user.role] || user.role || "-"}
                          </span>
                        </td>

                        <td>
                          {Number(user.no_show_count || 0)} ครั้ง
                        </td>

                        <td>
                          <span
                            className={`admin-accounts-status ${
                              suspended ? "suspended" : "active"
                            }`}
                          >
                            {suspended ? "ถูกระงับ" : "ใช้งานปกติ"}
                          </span>

                          {suspended && (
                            <small className="admin-accounts-suspension-date">
                              ถึง {formatDateTime(user.suspended_until)}
                            </small>
                          )}
                        </td>

                        <td>
                          <div className="admin-accounts-actions">
                            <button
                              type="button"
                              className="admin-accounts-history-button"
                              onClick={() => openHistory(user)}
                            >
                              ประวัติการจอง
                            </button>

                            {user.role !== "admin" && (
                              <button
                                type="button"
                                className={`admin-accounts-suspension-button ${
                                  suspended ? "unsuspend" : "suspend"
                                }`}
                                onClick={() => toggleSuspension(user)}
                                disabled={actionLoading}
                              >
                                {suspended ? "ปลดระงับ" : "ระงับบัญชี"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <footer className="admin-accounts-table-footer">
            แสดง {filteredUsers.length} จาก {users.length} บัญชี
          </footer>
        </section>
      </main>

      {selectedUser && (
        <div
          className="admin-accounts-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeHistoryModal();
            }
          }}
        >
          <section
            className="admin-accounts-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-accounts-modal-title"
          >
            <header className="admin-accounts-modal-heading">
              <div>
                <p>ACCOUNT DETAILS</p>
                <h2 id="admin-accounts-modal-title">
                  {getDisplayName(selectedUser)}
                </h2>
                <span>
                  {ROLE_LABELS[selectedUser.role] ||
                    selectedUser.role ||
                    "-"}
                </span>
              </div>

              <button
                type="button"
                className="admin-accounts-modal-close"
                onClick={closeHistoryModal}
                aria-label="ปิดหน้าต่าง"
              >
                ×
              </button>
            </header>

            <div className="admin-accounts-detail-grid">
              <div>
                <span>TU ID</span>
                <strong>{selectedUser.tu_id || "-"}</strong>
              </div>

              <div>
                <span>Username</span>
                <strong>{selectedUser.username || "-"}</strong>
              </div>

              <div>
                <span>อีเมล</span>
                <strong>{selectedUser.email || "-"}</strong>
              </div>

              <div>
                <span>คณะ</span>
                <strong>{selectedUser.faculty || "-"}</strong>
              </div>

              <div>
                <span>สาขา</span>
                <strong>{selectedUser.major || "-"}</strong>
              </div>

              <div>
                <span>จำนวนครั้งที่ไม่มาใช้งาน</span>
                <strong>
                  {Number(selectedUser.no_show_count || 0)} ครั้ง
                </strong>
              </div>

              <div>
                <span>สถานะบัญชี</span>
                <strong>
                  {isSuspended(selectedUser)
                    ? "ถูกระงับ"
                    : "ใช้งานปกติ"}
                </strong>
              </div>

              <div>
                <span>สิ้นสุดการระงับ</span>
                <strong>
                  {isSuspended(selectedUser)
                    ? formatDateTime(selectedUser.suspended_until)
                    : "-"}
                </strong>
              </div>
            </div>

            <section className="admin-accounts-history-section">
              <div className="admin-accounts-history-heading">
                <div>
                  <h3>ประวัติการจอง</h3>
                  <p>รายการจองที่เชื่อมโยงกับบัญชีนี้</p>
                </div>

                <span className="admin-accounts-history-count">
                  {historyLoading
                    ? "กำลังโหลด..."
                    : `${history.length} รายการ`}
                </span>
              </div>

              {historyLoading ? (
                <p className="admin-accounts-empty">
                  กำลังโหลดประวัติการจอง...
                </p>
              ) : historyError ? (
                <p
                  className="admin-accounts-inline-error"
                  role="alert"
                >
                  {historyError}
                </p>
              ) : history.length === 0 ? (
                <p className="admin-accounts-empty">
                  ไม่พบประวัติการจอง
                </p>
              ) : (
                <div className="admin-accounts-history-table-wrap">
                  <table className="admin-accounts-history-table">
                    <thead>
                      <tr>
                        <th>ห้องประชุม</th>
                        <th>วันที่</th>
                        <th>เวลา</th>
                        <th>วัตถุประสงค์</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>

                    <tbody>
                      {history.map((booking, index) => {
                        const status = normalizeBookingStatus(
                          booking.status
                        );

                        return (
                          <tr
                            key={booking.booking_id ?? index}
                          >
                            <td className="history-room-name">
                              {booking.room_name ||
                                booking.room_code ||
                                `ห้อง ${booking.room_id || "-"}`}
                            </td>

                            <td className="history-date">
                              {formatDate(booking.booking_date)}
                            </td>

                            <td className="history-time">
                              {formatTime(booking.start_time)}
                              {"–"}
                              {formatTime(booking.end_time)}
                            </td>

                            <td className="history-purpose">
                              {booking.purpose || "ไม่ได้ระบุ"}
                            </td>

                            <td>
                              <span
                                className={`admin-accounts-booking-status status-${status || "unknown"}`}
                              >
                                {getBookingStatusLabel(status)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <footer className="admin-accounts-modal-actions">
              {selectedUser.role !== "admin" && (
                <button
                  type="button"
                  className={`admin-accounts-suspension-button ${
                    isSuspended(selectedUser)
                      ? "unsuspend"
                      : "suspend"
                  }`}
                  onClick={() => toggleSuspension(selectedUser)}
                  disabled={actionLoading}
                >
                  {actionLoading
                    ? "กำลังดำเนินการ..."
                    : isSuspended(selectedUser)
                      ? "ปลดระงับบัญชี"
                      : "ระงับบัญชี 30 วัน"}
                </button>
              )}

              <button
                type="button"
                className="admin-accounts-close-button"
                onClick={closeHistoryModal}
              >
                ปิด
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
