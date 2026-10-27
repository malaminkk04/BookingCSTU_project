
import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import AdminSidebar from "./admin_sidebar";
import "../../css/admin/admin_layout.css";

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch {
    return null;
  }
}

function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user] = useState(() => getStoredUser());
  const [token] = useState(() => localStorage.getItem("token"));
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isAdmin =
    String(user?.role || "").toLowerCase() === "admin" ||
    String(user?.access_level || "").toLowerCase() === "admin";

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/", { replace: true });
  };

  if (!token || !isAdmin) {
    return <Navigate to="/" replace />;
  }

  const displayName =
    user?.displayname_th ||
    user?.name ||
    user?.username ||
    "Admin";

  const pageTitles = {
    "/admin": "Dashboard",
    "/admin/rooms": "จัดการห้องประชุม",
    "/admin/bookings": "จัดการการจอง",
    "/admin/accounts": "จัดการผู้ใช้",
    "/admin/support": "ร้องเรียน แจ้งซ่อม และรีวิว",
    "/admin/reports": "รายงานและสถิติการจอง",
  };

  const pageTitle =
    pageTitles[location.pathname] || "Admin";

  return (
    <div className="admin-layout">
      <div
        className={`admin-sidebar-container${
          sidebarOpen ? " sidebar-open" : ""
        }`}
      >
        <AdminSidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      {sidebarOpen && (
        <button
          type="button"
          className="admin-sidebar-overlay"
          aria-label="ปิดเมนู"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button
              type="button"
              className="admin-menu-toggle"
              aria-label={sidebarOpen ? "ปิดเมนู" : "เปิดเมนู"}
              aria-expanded={sidebarOpen}
              onClick={() => setSidebarOpen((open) => !open)}
            >
              ☰
            </button>

            <div>
              <div className="admin-breadcrumb">
                Booking CSTU / Admin
              </div>
              <h1 className="admin-page-heading">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="admin-topbar-user">
            <div className="admin-user-avatar">
              {String(displayName).trim().charAt(0).toUpperCase()}
            </div>

            <div className="admin-user-details">
              <strong>{displayName}</strong>
              <span>Administrator</span>
            </div>

            <button
              type="button"
              className="admin-logout-button"
              onClick={handleLogout}
            >
              ออกจากระบบ
            </button>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
