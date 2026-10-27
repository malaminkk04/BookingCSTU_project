
import { useEffect, useMemo, useState } from "react";
import "../../css/admin/admin_support.css";

// กำหนดค่าสำหรับเชื่อมต่อ Backend
// URL หลักของ Backend
const API_BASE_URL = "http://localhost:5001";

// กำหนดแท็บประเภทข้อมูลที่ Admin สามารถจัดการได้
const SECTIONS = [
  { key: "complaints", label: "ร้องเรียน", icon: "⚑" },
  { key: "reviews", label: "รีวิวห้อง", icon: "★" },
  { key: "repairs", label: "แจ้งซ่อม", icon: "🔧" },
];

// กำหนดรายละเอียดของแต่ละประเภทข้อมูล
// endpoint คือ URL สำหรับเรียกข้อมูลจาก Backend
// statuses คือรายการสถานะที่สามารถเลือกได้
// fields คือชื่อฟิลด์และชื่อหัวตารางที่ต้องการแสดง
const CONFIG = {
  complaints: {
    title: "จัดการเรื่องร้องเรียน",
    description: "ตรวจสอบและติดตามเรื่องร้องเรียนจากผู้ใช้งาน",
    endpoint: "/api/admin/complaints",
    statuses: [
      "รอดำเนินการ",
      "กำลังตรวจสอบ",
      "ดำเนินการแล้ว",
      "ปิดเรื่อง",
    ],
    fields: [
      ["id", "รหัส"],
      ["subject", "หัวข้อ"],
      ["reporter_name", "ผู้ร้องเรียน"],
      ["room_name", "ห้อง"],
      ["status", "สถานะ"],
      ["created_at", "วันที่แจ้ง"],
    ],
  },

  reviews: {
    title: "จัดการรีวิวห้อง",
    description: "ตรวจสอบคะแนนและความคิดเห็นของผู้ใช้บริการ",
    endpoint: "/api/admin/reviews",
    statuses: ["แสดงผล", "ซ่อนรีวิว"],
    fields: [
      ["id", "รหัส"],
      ["room_name", "ห้อง"],
      ["reviewer_name", "ผู้รีวิว"],
      ["rating", "คะแนน"],
      ["comment", "ความคิดเห็น"],
      ["status", "สถานะ"],
      ["created_at", "วันที่รีวิว"],
    ],
  },

  repairs: {
    title: "จัดการรายการแจ้งซ่อม",
    description: "ติดตามปัญหาอุปกรณ์และสถานะการซ่อมบำรุง",
    endpoint: "/api/admin/repairs",
    statuses: [
      "รอดำเนินการ",
      "กำลังซ่อม",
      "ซ่อมเสร็จ",
      "ยกเลิก",
    ],
    fields: [
      ["id", "รหัส"],
      ["room_name", "ห้อง"],
      ["reporter_name", "ผู้แจ้ง"],
      ["subject", "ปัญหา"],
      ["status", "สถานะ"],
      ["created_at", "วันที่แจ้ง"],
    ],
  },
};


// ฟังก์ชัน

// อ่านข้อมูลผู้ใช้ที่เข้าสู่ระบบจาก localStorage
function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

// แปลงวันที่ให้อยู่ในรูปแบบวันที่ภาษาไทย
function formatDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  // หากข้อมูลวันที่ไม่ถูกต้อง ให้แสดงค่าต้นฉบับ
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ค้นหา ID ของรายการ รองรับชื่อฟิลด์ ID หลายรูปแบบ
function getRecordId(record) {
  return (
    record.id ??
    record.complaint_id ??
    record.review_id ??
    record.repair_id ??
    record.report_id
  );
}

// กำหนด CSS class ตามสถานะของรายการ
// เพื่อให้แต่ละสถานะแสดงสีแตกต่างกันตาม CSS
function getStatusClass(status) {
  const value = String(status || "").toLowerCase();

  // สถานะที่ดำเนินการเสร็จสิ้นหรือแสดงผล
  if (
    value.includes("เสร็จ") ||
    value.includes("ดำเนินการแล้ว") ||
    value.includes("แสดงผล") ||
    value === "resolved" ||
    value === "completed"
  ) {
    return "success";
  }

  // สถานะที่อยู่ระหว่างดำเนินการ
  if (
    value.includes("กำลัง") ||
    value.includes("ตรวจสอบ") ||
    value === "in_progress"
  ) {
    return "progress";
  }

  // สถานะที่ปิด ยกเลิก หรือซ่อนข้อมูล
  if (
    value.includes("ยกเลิก") ||
    value.includes("ปิดเรื่อง") ||
    value.includes("ซ่อน") ||
    value === "cancelled" ||
    value === "hidden" ||
    value === "closed"
  ) {
    return "closed";
  }

  // กรณีอื่นให้ใช้รูปแบบสถานะรอดำเนินการ
  return "pending";
}


// compomentของหน้า Admin Support
export default function AdminSupport() {
  // เก็บประเภทข้อมูลที่ Admin เลือกอยู่
  const [section, setSection] = useState("complaints");

  // เก็บข้อมูลรายการที่ได้รับจาก Backend
  const [records, setRecords] = useState([]);

  // เก็บข้อความค้นหา
  const [search, setSearch] = useState("");

  // เก็บสถานะที่ใช้กรองข้อมูล
  const [statusFilter, setStatusFilter] = useState("ทั้งหมด");

  // เก็บสถานะการโหลดข้อมูล
  const [loading, setLoading] = useState(false);

  // เก็บข้อความแจ้งข้อผิดพลาดและข้อความเมื่อทำรายการสำเร็จ
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  // เก็บข้อมูลรายการที่เลือกเพื่อเปิดหน้าต่างรายละเอียด
  const [selected, setSelected] = useState(null);

  // เก็บ ID ของรายการที่กำลังอัปเดตสถานะ
  const [savingId, setSavingId] = useState(null);

  // ดึงการตั้งค่าตามแท็บที่เลือก
  const config = CONFIG[section];

  
  // ฟังก์ชันโหลดข้อมูลจาก Backend
  async function loadRecords() {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      // อ่านข้อมูลบัญชีผู้ใช้และ Token
      const user = getStoredUser();
      const token = localStorage.getItem("token");

      // ตรวจสอบว่ามีบัญชี Admin เข้าสู่ระบบหรือไม่
      if (!user || String(user.role || "").toLowerCase() !== "admin") {
        throw new Error("กรุณาเข้าสู่ระบบด้วยบัญชี Admin");
      }

      // เรียก API ตามแท็บที่เลือก
      const response = await fetch(
        `${API_BASE_URL}${CONFIG[section].endpoint}`,
        {
          headers: {
            "Content-Type": "application/json",

            // ส่ง Token หากมี
            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {}),

            // ส่ง ID ของผู้ใช้ หากมี
            ...(user.user_id
              ? { "x-user-id": String(user.user_id) }
              : {}),
          },
        }
      );

      // แปลงผลลัพธ์จาก Backend เป็น JSON
      const result = await response.json().catch(() => ({}));

      // แจ้งข้อผิดพลาดเมื่อ API ส่งสถานะไม่สำเร็จ
      if (!response.ok) {
        throw new Error(result.message || "ไม่สามารถโหลดข้อมูลได้");
      }

      // รองรับรูปแบบข้อมูลที่ Backend ส่งกลับมา
      const items = Array.isArray(result)
        ? result
        : result.data || result.records || result.items || [];

      // บันทึกรายการที่โหลดได้
      setRecords(items);
    } catch (err) {
      // หากโหลดไม่สำเร็จ ให้ล้างรายการและแสดงข้อความผิดพลาด
      setRecords([]);

      setError(
        err.message === "Failed to fetch"
          ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบ Backend"
          : err.message
      );
    } finally {
      // สิ้นสุดสถานะโหลดข้อมูล
      setLoading(false);
    }
  }

  // โหลดข้อมูลใหม่เมื่อเปลี่ยนแท็บ
  useEffect(() => {
    setSearch("");
    setStatusFilter("ทั้งหมด");
    setSelected(null);

    loadRecords();
  }, [section]);

  // ฟังก์ชันค้นหาและกรองข้อมูล

  const filteredRecords = useMemo(() => {
    // แปลงคำค้นหาเป็นตัวพิมพ์เล็กเพื่อให้ค้นหาได้ง่าย
    const keyword = search.trim().toLowerCase();

    return records.filter((record) => {
      // รวมข้อมูลในแต่ละรายการเพื่อใช้ค้นหา
      const text = Object.values(record)
        .map((value) => String(value ?? ""))
        .join(" ")
        .toLowerCase();

      // ตรวจสอบว่าข้อมูลตรงกับคำค้นหาหรือไม่
      const matchesSearch = !keyword || text.includes(keyword);

      // ตรวจสอบว่าตรงกับสถานะที่เลือกหรือไม่
      const matchesStatus =
        statusFilter === "ทั้งหมด" ||
        String(record.status || "") === statusFilter;

      // แสดงรายการเมื่อผ่านเงื่อนไขทั้งสองข้อ
      return matchesSearch && matchesStatus;
    });
  }, [records, search, statusFilter]);

  // ฟังก์ชันเปลี่ยนสถานะรายการ
  async function updateStatus(record, newStatus) {
    // อ่าน ID ของรายการที่ต้องการแก้ไข
    const id = getRecordId(record);

    // ป้องกันการอัปเดตหากไม่มี ID
    if (id == null) {
      setError("ข้อมูลรายการไม่มี ID จึงไม่สามารถอัปเดตได้");
      return;
    }

    setSavingId(id);
    setError("");
    setNotice("");

    try {
      // อ่านข้อมูลบัญชีผู้ใช้และ Token
      const user = getStoredUser();
      const token = localStorage.getItem("token");

      // ส่งคำขอ PATCH เพื่ออัปเดตสถานะผ่าน Backend
      const response = await fetch(
        `${API_BASE_URL}${config.endpoint}/${encodeURIComponent(id)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",

            ...(token
              ? { Authorization: `Bearer ${token}` }
              : {}),

            ...(user?.user_id
              ? { "x-user-id": String(user.user_id) }
              : {}),
          },

          // ส่งสถานะใหม่ไปยัง Backend
          body: JSON.stringify({ status: newStatus }),
        }
      );

      const result = await response.json().catch(() => ({}));

      // แจ้งข้อผิดพลาดหาก Backend ไม่สามารถอัปเดตได้
      if (!response.ok) {
        throw new Error(result.message || "อัปเดตสถานะไม่สำเร็จ");
      }

      // อัปเดตสถานะในรายการที่แสดงบนหน้าเว็บ
      setRecords((previous) =>
        previous.map((item) =>
          String(getRecordId(item)) === String(id)
            ? { ...item, status: newStatus }
            : item
        )
      );

      // อัปเดตสถานะในหน้าต่างรายละเอียดด้วย
      setSelected((previous) =>
        previous &&
        String(getRecordId(previous)) === String(id)
          ? { ...previous, status: newStatus }
          : previous
      );

      // แสดงข้อความเมื่ออัปเดตสำเร็จ
      setNotice("อัปเดตสถานะเรียบร้อยแล้ว");
    } catch (err) {
      // แสดงข้อความเมื่ออัปเดตไม่สำเร็จ
      setError(
        err.message === "Failed to fetch"
          ? "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้"
          : err.message
      );
    } finally {
      // สิ้นสุดสถานะกำลังบันทึก
      setSavingId(null);
    }
  }

  // การแสดงผล

  return (
    <main className="admin-support">

      {/* ส่วนหัวหน้าและปุ่มรีเฟรชข้อมูล */}
      <header className="admin-support-header">
        <div>
          <p className="admin-support-eyebrow">ADMINISTRATION</p>

          <h1>จัดการความคิดเห็นและปัญหา</h1>

          <p className="admin-support-subtitle">
            ดูแลเรื่องร้องเรียน รีวิวห้อง และรายการแจ้งซ่อมในที่เดียว
          </p>
        </div>

        {/* ปุ่มโหลดข้อมูลใหม่จาก Backend */}
        <button
          type="button"
          className="admin-support-refresh"
          onClick={loadRecords}
          disabled={loading}
        >
          {loading ? "กำลังโหลด..." : "↻ รีเฟรช"}
        </button>
      </header>

      {/* ส่วนแท็บเลือกประเภทข้อมูล */}
      <nav
        className="admin-support-tabs"
        aria-label="ประเภทการจัดการ"
      >
        {SECTIONS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`admin-support-tab ${
              section === item.key ? "active" : ""
            }`}
            onClick={() => setSection(item.key)}
          >
            <span className="admin-support-tab-icon">
              {item.icon}
            </span>

            <span>{item.label}</span>

            {/* แสดงจำนวนรายการของแท็บที่เลือกอยู่ */}
            <span className="admin-support-tab-count">
              {section === item.key ? records.length : ""}
            </span>
          </button>
        ))}
      </nav>

      {/* ส่วนแสดงรายการข้อมูลและเครื่องมือจัดการ */}
      <section className="admin-support-panel">

        {/* ส่วนหัวรายการและจำนวนข้อมูลทั้งหมด
            ไม่มีการ์ดสถิติแยกด้านบน */}
        <div className="admin-support-panel-heading">
          <div>
            <h2>{config.title}</h2>
            <p>{config.description}</p>
          </div>

          <span className="admin-support-total">
            ทั้งหมด {records.length} รายการ
          </span>
        </div>

        {/* ส่วนค้นหาและกรองข้อมูลตามสถานะ */}
        <div className="admin-support-filters">
          <label className="admin-support-search">
            <span>⌕</span>

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาหัวข้อ ห้อง ผู้แจ้ง หรือรายละเอียด..."
            />
          </label>

          {/* เลือกสถานะที่ต้องการแสดง */}
          <select
            aria-label="กรองสถานะ"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="ทั้งหมด">ทุกสถานะ</option>

            {config.statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        {/* ส่วนแสดงข้อความเมื่อเกิดข้อผิดพลาด */}
        {error && (
          <div className="admin-support-message error" role="alert">
            {error}
          </div>
        )}

        {/* ส่วนแสดงข้อความเมื่อทำรายการสำเร็จ */}
        {notice && (
          <div className="admin-support-message success" role="status">
            {notice}
          </div>
        )}

        {/* ส่วนตารางแสดงรายการข้อมูล */}
        <div className="admin-support-table-wrap">
          <table className="admin-support-table">

            {/* หัวตารางเปลี่ยนตามประเภทข้อมูลที่เลือก */}
            <thead>
              <tr>
                {config.fields.map(([key, label]) => (
                  <th key={key}>{label}</th>
                ))}

                <th>จัดการ</th>
              </tr>
            </thead>

            <tbody>
              {/* แสดงข้อความเมื่อไม่พบข้อมูล */}
              {!loading && filteredRecords.length === 0 && (
                <tr>
                  <td
                    className="admin-support-empty"
                    colSpan={config.fields.length + 1}
                  >
                    {error
                      ? "ไม่สามารถแสดงข้อมูลได้"
                      : "ไม่พบข้อมูลที่ตรงกับเงื่อนไข"}
                  </td>
                </tr>
              )}

              {/* วนแสดงข้อมูลแต่ละรายการในตาราง */}
              {filteredRecords.map((record, index) => {
                const id = getRecordId(record) ?? index;

                return (
                  <tr key={id}>
                    {/* แสดงข้อมูลแต่ละคอลัมน์ */}
                    {config.fields.map(([key]) => {
                      const value = record[key];

                      return (
                        <td key={key}>
                          {/* แสดงสถานะพร้อม CSS class ตามสถานะ */}
                          {key === "status" ? (
                            <span
                              className={`admin-support-status ${getStatusClass(
                                value
                              )}`}
                            >
                              {value || "รอดำเนินการ"}
                            </span>
                          ) : key === "rating" ? (
                            /* แสดงคะแนนรีวิวเป็นดาว */
                            <span className="admin-support-rating">
                              {"★".repeat(
                                Math.max(
                                  0,
                                  Math.min(5, Number(value) || 0)
                                )
                              )}
                              <small> {value ?? 0}/5</small>
                            </span>
                          ) : key === "created_at" ? (
                            /* แปลงวันที่ให้อ่านง่าย */
                            formatDate(value)
                          ) : (
                            /* แสดงข้อมูลทั่วไปในตาราง */
                            <span
                              className={
                                key === "comment" || key === "subject"
                                  ? "admin-support-cell-text"
                                  : ""
                              }
                              title={
                                value == null ? "" : String(value)
                              }
                            >
                              {value == null || value === ""
                                ? "-"
                                : String(value)}
                            </span>
                          )}
                        </td>
                      );
                    })}

                    {/* ปุ่มเปิดหน้าต่างรายละเอียด */}
                    <td>
                      <button
                        type="button"
                        className="admin-support-detail-button"
                        onClick={() => setSelected(record)}
                      >
                        รายละเอียด
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ส่วนท้ายตารางแสดงจำนวนรายการที่ผ่านตัวกรอง */}
        <footer className="admin-support-table-footer">
          แสดง {filteredRecords.length} จาก {records.length} รายการ
        </footer>
      </section>

      {/* ===หน้าต่าง Modal แสดงรายละเอียดและเปลี่ยนสถานะ=== */}
      {selected && (
        <div
          className="admin-support-modal-backdrop"
          onMouseDown={(event) => {
            // คลิกพื้นที่ด้านนอกเพื่อปิดหน้าต่างรายละเอียด
            if (event.target === event.currentTarget) {
              setSelected(null);
            }
          }}
        >
          <section
            className="admin-support-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-support-modal-title"
          >
            {/* ส่วนหัว Modal และปุ่มปิด */}
            <header className="admin-support-modal-header">
              <div>
                <p>รายละเอียดรายการ</p>

                <h2 id="admin-support-modal-title">
                  {config.title}
                </h2>
              </div>

              <button
                type="button"
                className="admin-support-modal-close"
                onClick={() => setSelected(null)}
                aria-label="ปิด"
              >
                ×
              </button>
            </header>

            {/* แสดงรายละเอียดทั้งหมดของรายการที่เลือก */}
            <div className="admin-support-detail-list">
              {Object.entries(selected).map(([key, value]) => (
                <div
                  className="admin-support-detail-row"
                  key={key}
                >
                  <strong>{key}</strong>

                  <span>
                    {key === "created_at"
                      ? formatDate(value)
                      : value == null || value === ""
                      ? "-"
                      : String(value)}
                  </span>
                </div>
              ))}
            </div>

            {/* เลือกสถานะใหม่ของรายการ */}
            <label className="admin-support-status-label">
              เปลี่ยนสถานะ

              <select
                value={selected.status || config.statuses[0]}
                disabled={savingId === getRecordId(selected)}
                onChange={(event) =>
                  updateStatus(selected, event.target.value)
                }
              >
                {config.statuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>

            {/* ปุ่มปิดหน้าต่างรายละเอียด */}
            <footer className="admin-support-modal-footer">
              <button
                type="button"
                className="admin-support-cancel-button"
                onClick={() => setSelected(null)}
              >
                ปิด
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
