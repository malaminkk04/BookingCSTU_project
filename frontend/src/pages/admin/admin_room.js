
import { useCallback, useEffect, useMemo, useState } from "react";
import "../../css/admin/admin_room.css";

const API_BASE_URL = "http://localhost:5001";

const EMPTY_FORM = {
  room_code: "",
  room_name: "",
  floor: "1",
  capacity: "8",
  department: "Computer Science",
  facilities: "",
  department_color: "#354f8b",
  room_type: "meeting_room",
  is_available: true,
};

function AdminRooms() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [floorFilter, setFloorFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingRoom, setEditingRoom] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [changingRoomId, setChangingRoomId] = useState(null);
  const [confirmRoom, setConfirmRoom] = useState(null);

  const getHeaders = useCallback(() => {
    const token = localStorage.getItem("token");

    return {
      Authorization: `Bearer ${token || ""}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }, []);

  const loadRooms = useCallback(async () => {
    const token = localStorage.getItem("token");

    if (!token) {
      setError("ไม่พบ Token กรุณาเข้าสู่ระบบ Admin ใหม่");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const response = await fetch(`${API_BASE_URL}/api/admin/rooms`, {
        method: "GET",
        headers: getHeaders(),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.message || "ไม่สามารถโหลดรายการห้องได้");
      }

      setRooms(Array.isArray(result.rooms) ? result.rooms : []);
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์");
    } finally {
      setLoading(false);
    }
  }, [getHeaders]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  const filteredRooms = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return rooms.filter((room) => {
      const matchesSearch =
        !keyword ||
        [
          room.room_code,
          room.room_name,
          room.department,
          room.facilities,
          room.room_type,
        ].some((value) =>
          String(value || "").toLowerCase().includes(keyword)
        );

      const matchesFloor =
        floorFilter === "all" || String(room.floor) === floorFilter;

      const available = Number(room.is_available) === 1;

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "available" && available) ||
        (statusFilter === "disabled" && !available);

      return matchesSearch && matchesFloor && matchesStatus;
    });
  }, [rooms, search, floorFilter, statusFilter]);

  const stats = useMemo(
    () => ({
      total: rooms.length,
      available: rooms.filter(
        (room) => Number(room.is_available) === 1
      ).length,
      disabled: rooms.filter(
        (room) => Number(room.is_available) !== 1
      ).length,
    }),
    [rooms]
  );

  function openCreateForm() {
    setEditingRoom(null);
    setForm({ ...EMPTY_FORM });
    setNotice("");
    setError("");
    setFormOpen(true);
  }

  function openEditForm(room) {
    setEditingRoom(room);
    setForm({
      room_code: room.room_code || "",
      room_name: room.room_name || "",
      floor: String(room.floor ?? "1"),
      capacity: String(room.capacity ?? "8"),
      department: room.department || "",
      facilities: room.facilities || "",
      department_color: room.department_color || "#354f8b",
      room_type: room.room_type || "meeting_room",
      is_available: Number(room.is_available) === 1,
    });
    setNotice("");
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingRoom(null);
    setForm({ ...EMPTY_FORM });
  }

  function updateForm(event) {
    const { name, value, type, checked } = event.target;

    setForm((current) => ({
      ...current,
      [name]: type === "checkbox" ? checked : value,
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setNotice("");
    setError("");

    if (!form.room_code.trim() || !form.room_name.trim()) {
      setError("กรุณากรอกรหัสห้องและชื่อห้อง");
      return;
    }

    if (
      !Number.isInteger(Number(form.floor)) ||
      Number(form.floor) < 1 ||
      !Number.isInteger(Number(form.capacity)) ||
      Number(form.capacity) < 1
    ) {
      setError("ชั้นและความจุต้องเป็นจำนวนเต็มที่มากกว่า 0");
      return;
    }

    const payload = {
      ...form,
      room_code: form.room_code.trim(),
      room_name: form.room_name.trim(),
      floor: Number(form.floor),
      capacity: Number(form.capacity),
      is_available: Boolean(form.is_available),
    };

    try {
      setSaving(true);

      const isEditing = Boolean(editingRoom);
      const url = isEditing
        ? `${API_BASE_URL}/api/admin/rooms/${editingRoom.room_id}`
        : `${API_BASE_URL}/api/admin/rooms`;

      const response = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: getHeaders(),
        body: JSON.stringify(payload),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(result.message || "ไม่สามารถบันทึกข้อมูลห้องได้");
      }

      closeForm();
      setNotice(result.message || "บันทึกข้อมูลสำเร็จ");
      await loadRooms();
    } catch (err) {
      setError(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setSaving(false);
    }
  }

  // เปิด Modal เพื่อยืนยันก่อนเปลี่ยนสถานะห้อง
  function toggleRoomStatus(room) {
    const currentlyAvailable = Number(room.is_available) === 1;

    setNotice("");
    setError("");

    setConfirmRoom({
      room,
      nextStatus: !currentlyAvailable,
    });
  }

  // เปลี่ยนสถานะเมื่อผู้ดูแลกดยืนยันเท่านั้น
  async function confirmToggleRoomStatus() {
    if (!confirmRoom || changingRoomId !== null) return;

    const { room, nextStatus } = confirmRoom;
    const actionText = nextStatus ? "เปิดใช้งาน" : "ปิดการใช้งาน";

    setNotice("");
    setError("");
    setChangingRoomId(room.room_id);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/admin/rooms/${room.room_id}/status`,
        {
          method: "PATCH",
          headers: getHeaders(),
          body: JSON.stringify({ is_available: nextStatus }),
        }
      );

      const result = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || `ไม่สามารถ${actionText}ห้องได้`
        );
      }

      setConfirmRoom(null);
      setNotice(result.message || `${actionText}ห้องสำเร็จ`);

      await loadRooms();
    } catch (err) {
      setError(err.message || `เกิดข้อผิดพลาดในการ${actionText}ห้อง`);
    } finally {
      setChangingRoomId(null);
    }
  }

  return (
    <div className="admin-rooms-page">
      {/* Page heading */}
      <section className="admin-rooms-intro">
        <div>
          <p className="admin-rooms-eyebrow">ROOM MANAGEMENT</p>
          <h2>จัดการห้องประชุม</h2>
          <p className="admin-rooms-description">
            ดูแลข้อมูลห้องประชุม เพิ่มห้อง แก้ไขรายละเอียด
            และจัดการสถานะการให้บริการ
          </p>
        </div>

        <button
          type="button"
          className="admin-room-primary-button"
          onClick={openCreateForm}
        >
          <span aria-hidden="true">＋</span> เพิ่มห้องประชุม
        </button>
      </section>

      {/* Success message */}
      {notice && (
        <div className="admin-room-alert success" role="status">
          <span>{notice}</span>
          <button
            type="button"
            onClick={() => setNotice("")}
            aria-label="ปิดข้อความ"
          >
            ×
          </button>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="admin-room-alert error" role="alert">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError("")}
            aria-label="ปิดข้อความ"
          >
            ×
          </button>
        </div>
      )}

      {/* Statistics */}
      <section className="admin-room-stats">
        <article className="admin-room-stat-card">
          <span className="admin-room-stat-icon">▤</span>
          <div>
            <p>ห้องทั้งหมด</p>
            <strong>{stats.total}</strong>
          </div>
        </article>

        <article className="admin-room-stat-card">
          <span className="admin-room-stat-icon available">✓</span>
          <div>
            <p>เปิดใช้งาน</p>
            <strong>{stats.available}</strong>
          </div>
        </article>

        <article className="admin-room-stat-card">
          <span className="admin-room-stat-icon disabled">Ⅱ</span>
          <div>
            <p>ปิดใช้งาน</p>
            <strong>{stats.disabled}</strong>
          </div>
        </article>
      </section>

      {/* Room list */}
      <section className="admin-room-panel">
        <div className="admin-room-panel-heading">
          <div>
            <h3>รายการห้องประชุม</h3>
            <p>ข้อมูลห้องจากฐานข้อมูล BookingCSTU</p>
          </div>

          <button
            type="button"
            className="admin-room-refresh-button"
            onClick={loadRooms}
            disabled={loading}
          >
            ↻ รีเฟรช
          </button>
        </div>

        {/* Filters */}
        <div className="admin-room-filters">
          <label className="admin-room-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="ค้นหารหัสห้อง ชื่อห้อง หรือหน่วยงาน"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>

          <label className="admin-room-filter-field">
            <span>ชั้น</span>
            <select
              value={floorFilter}
              onChange={(event) => setFloorFilter(event.target.value)}
            >
              <option value="all">ทุกชั้น</option>
              <option value="1">ชั้น 1</option>
              <option value="2">ชั้น 2</option>
              <option value="3">ชั้น 3</option>
              <option value="4">ชั้น 4</option>
              <option value="5">ชั้น 5</option>
            </select>
          </label>

          <label className="admin-room-filter-field">
            <span>สถานะ</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="all">ทุกสถานะ</option>
              <option value="available">เปิดใช้งาน</option>
              <option value="disabled">ปิดใช้งาน</option>
            </select>
          </label>
        </div>

        <div className="admin-room-result-count">
          แสดง {filteredRooms.length} จาก {rooms.length} ห้อง
        </div>

        {loading ? (
          <div className="admin-room-state">กำลังโหลดข้อมูลห้อง...</div>
        ) : error && rooms.length === 0 ? (
          <div className="admin-room-state">
            ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบ Backend และสิทธิ์ Admin
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="admin-room-state">
            <span aria-hidden="true">⌕</span>
            <strong>ไม่พบห้องประชุม</strong>
            <p>ลองเปลี่ยนคำค้นหาหรือตัวกรอง</p>
          </div>
        ) : (
          <div className="admin-room-table-scroll">
            <table className="admin-room-table">
              <thead>
                <tr>
                  <th>ห้องประชุม</th>
                  <th>ชั้น</th>
                  <th>ความจุ</th>
                  <th>หน่วยงาน</th>
                  <th>สถานะ</th>
                  <th>จัดการ</th>
                </tr>
              </thead>

              <tbody>
                {filteredRooms.map((room) => {
                  const isAvailable = Number(room.is_available) === 1;

                  return (
                    <tr key={room.room_id}>
                      <td>
                        <div className="admin-room-name-cell">
                          <span
                            className="admin-room-color"
                            style={{
                              backgroundColor:
                                room.department_color || "#354f8b",
                            }}
                          />
                          <div>
                            <strong>{room.room_code}</strong>
                            <span>{room.room_name}</span>
                            {room.facilities && (
                              <small>{room.facilities}</small>
                            )}
                          </div>
                        </div>
                      </td>

                      <td>ชั้น {room.floor}</td>
                      <td>{room.capacity} คน</td>
                      <td>{room.department || "-"}</td>

                      <td>
                        <span
                          className={`admin-room-status ${
                            isAvailable ? "is-available" : "is-disabled"
                          }`}
                        >
                          <span />
                          {isAvailable ? "เปิดใช้งาน" : "ปิดใช้งาน"}
                        </span>
                      </td>

                      <td>
                        <div className="admin-room-actions">
                          <button
                            type="button"
                            className="admin-room-edit-button"
                            onClick={() => openEditForm(room)}
                          >
                            แก้ไข
                          </button>

                          <button
                            type="button"
                            className={`admin-room-toggle-button ${
                              isAvailable ? "turn-off" : "turn-on"
                            }`}
                            onClick={() => toggleRoomStatus(room)}
                            disabled={changingRoomId === room.room_id}
                          >
                            {changingRoomId === room.room_id
                              ? "กำลังบันทึก..."
                              : isAvailable
                                ? "ปิดใช้งาน"
                                : "เปิดใช้งาน"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create/Edit room modal */}
      {formOpen && (
        <div
          className="admin-room-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              closeForm();
            }
          }}
        >
          <section
            className="admin-room-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-room-form-title"
          >
            <div className="admin-room-modal-heading">
              <div>
                <p className="admin-rooms-eyebrow">
                  {editingRoom?.room_id ? "EDIT ROOM" : "CREATE ROOM"}
                </p>
                <h3 id="admin-room-form-title">
                  {editingRoom?.room_id
                    ? "แก้ไขข้อมูลห้อง"
                    : "เพิ่มห้องประชุม"}
                </h3>
              </div>

              <button
                type="button"
                className="admin-room-modal-close"
                onClick={closeForm}
                disabled={saving}
                aria-label="ปิดหน้าต่าง"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="admin-room-form-grid">
                <label>
                  รหัสห้อง <span>*</span>
                  <input
                    name="room_code"
                    value={form.room_code}
                    onChange={updateForm}
                    required
                    maxLength={50}
                    placeholder="เช่น F1-101"
                  />
                </label>

                <label>
                  ชื่อห้อง <span>*</span>
                  <input
                    name="room_name"
                    value={form.room_name}
                    onChange={updateForm}
                    required
                    maxLength={255}
                    placeholder="ชื่อห้องประชุม"
                  />
                </label>

                <label>
                  ชั้น <span>*</span>
                  <select
                    name="floor"
                    value={form.floor}
                    onChange={updateForm}
                    required
                  >
                    <option value="1">ชั้น 1</option>
                    <option value="2">ชั้น 2</option>
                    <option value="3">ชั้น 3</option>
                    <option value="4">ชั้น 4</option>
                    <option value="5">ชั้น 5</option>
                  </select>
                </label>

                <label>
                  ความจุ (คน) <span>*</span>
                  <input
                    type="number"
                    name="capacity"
                    value={form.capacity}
                    onChange={updateForm}
                    required
                    min="1"
                    step="1"
                  />
                </label>

                <label>
                  หน่วยงาน
                  <input
                    name="department"
                    value={form.department}
                    onChange={updateForm}
                    maxLength={100}
                    placeholder="เช่น Computer Science"
                  />
                </label>

                <label>
                  ประเภทห้อง
                  <select
                    name="room_type"
                    value={form.room_type}
                    onChange={updateForm}
                  >
                    <option value="meeting_room">ห้องประชุม</option>
                    <option value="classroom">ห้องเรียน</option>
                    <option value="study_room">ห้องอ่านหนังสือ</option>
                    <option value="other">อื่น ๆ</option>
                  </select>
                </label>

                <label className="admin-room-form-full">
                  สิ่งอำนวยความสะดวก
                  <textarea
                    name="facilities"
                    value={form.facilities}
                    onChange={updateForm}
                    rows={3}
                    placeholder="เช่น Projector, Whiteboard, Wi-Fi"
                  />
                </label>

                <label>
                  สีประจำหน่วยงาน
                  <div className="admin-room-color-input">
                    <input
                      type="color"
                      name="department_color"
                      value={
                        /^#[0-9a-f]{6}$/i.test(form.department_color)
                          ? form.department_color
                          : "#354f8b"
                      }
                      onChange={updateForm}
                    />
                    <span>
                      {form.department_color || "#354f8b"}
                    </span>
                  </div>
                </label>

                <label className="admin-room-availability-field">
                  สถานะห้อง
                  <span className="admin-room-checkbox">
                    <input
                      type="checkbox"
                      name="is_available"
                      checked={form.is_available}
                      onChange={updateForm}
                    />
                    เปิดให้จองห้องนี้
                  </span>
                </label>
              </div>

              <div className="admin-room-modal-actions">
                <button
                  type="button"
                  className="admin-room-cancel-button"
                  onClick={closeForm}
                  disabled={saving}
                >
                  ยกเลิก
                </button>

                <button
                  type="submit"
                  className="admin-room-primary-button"
                  disabled={saving}
                >
                  {saving ? "กำลังบันทึก..." : "บันทึกข้อมูล"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* Confirmation modal: Enable/Disable room */}
      {confirmRoom && (
        <div
          className="admin-room-confirm-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              changingRoomId === null
            ) {
              setConfirmRoom(null);
            }
          }}
        >
          <section
            className="admin-room-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-room-confirm-title"
          >
            <div
              className={`admin-room-confirm-icon ${
                confirmRoom.nextStatus ? "enable-icon" : "disable-icon"
              }`}
            >
              {confirmRoom.nextStatus ? "✓" : "!"}
            </div>

            <h3 id="admin-room-confirm-title">
              {confirmRoom.nextStatus
                ? "ยืนยันการเปิดใช้งานห้อง"
                : "ยืนยันการปิดใช้งานห้อง"}
            </h3>

            <p className="admin-room-confirm-description">
              คุณต้องการ
              {confirmRoom.nextStatus ? "เปิดใช้งาน" : "ปิดการใช้งาน"}
              ห้องนี้หรือไม่?
            </p>

            <div className="admin-room-confirm-room">
              <strong>{confirmRoom.room.room_code}</strong>
              <span>{confirmRoom.room.room_name}</span>
            </div>

            <p className="admin-room-confirm-warning">
              {confirmRoom.nextStatus
                ? "ห้องนี้จะกลับมาเปิดให้จองได้ตามสิทธิ์ของผู้ใช้"
                : "โปรดยืนยันก่อนปิดใช้งานห้องนี้"}
            </p>

            <div className="admin-room-confirm-actions">
              <button
                type="button"
                className="admin-room-confirm-cancel"
                onClick={() => setConfirmRoom(null)}
                disabled={changingRoomId !== null}
              >
                ยกเลิก
              </button>

              <button
                type="button"
                className={`admin-room-confirm-submit ${
                  confirmRoom.nextStatus
                    ? "confirm-enable"
                    : "confirm-disable"
                }`}
                onClick={confirmToggleRoomStatus}
                disabled={changingRoomId !== null}
              >
                {changingRoomId !== null
                  ? "กำลังบันทึก..."
                  : confirmRoom.nextStatus
                    ? "ยืนยันเปิดใช้งาน"
                    : "ยืนยันปิดใช้งาน"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default AdminRooms;
