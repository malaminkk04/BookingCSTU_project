
import { NavLink } from "react-router-dom";
import "../../css/admin/admin_sidebar.css";

const adminMenuItems = [
  {
    label: "Dashboard",
    path: "/admin",
    icon: "▦",
    end: true,
  },
  {
    label: "จัดการห้องประชุม",
    path: "/admin/rooms",
    icon: "▤",
  },
  {
    label: "จัดการการจอง",
    path: "/admin/bookings",
    icon: "▣",
  },
  {
    label: "จัดการผู้ใช้",
    path: "/admin/accounts",
    icon: "♙",
  },
  {
    label: "ร้องเรียน แจ้งซ่อม รีวิว",
    path: "/admin/support",
    icon: "▧",
  },
];

function AdminSidebar({ onNavigate }) {
  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-brand">
        <div className="admin-brand-icon">C</div>

        <div className="admin-brand-text">
          <h2>Booking CSTU</h2>
          <span>ADMINISTRATION</span>
        </div>
      </div>

      <div className="admin-sidebar-section-label">
        MAIN MENU
      </div>

      <nav className="admin-sidebar-nav">
        {adminMenuItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end || false}
            onClick={onNavigate}
            className={({ isActive }) =>
              `admin-sidebar-link${isActive ? " active" : ""}`
            }
          >
            <span
              className="admin-sidebar-icon"
              aria-hidden="true"
            >
              {item.icon}
            </span>

            <span className="admin-sidebar-link-label">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>

      <div className="admin-sidebar-footer">
        <span className="admin-sidebar-footer-dot" />

        <div>
          <strong>Admin Panel</strong>
          <span>Booking CSTU System</span>
        </div>
      </div>
    </aside>
  );
}

export default AdminSidebar;
