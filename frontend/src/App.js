import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

import Login from "./pages/login";
import Homepage from "./pages/homepage";
import Mybooking from "./pages/Mybooking";
import Review from "./pages/review";
import Guide from "./pages/guide";
import Rule from "./pages/rule";

import AdminLayout from "./pages/admin/admin_layout";
import AdminDashboard from "./pages/admin/admin_dash";
import AdminRooms from "./pages/admin/admin_room";
import AdminBooking from "./pages/admin/admin_booking";
import AdminAccounts from "./pages/admin/admin_accounts";
import AdminSupport from "./pages/admin/admin_support";

function AdminComingSoon({ title }) {
  return (
    <section>
      <h2>{title}</h2>
      <p>หน้านี้จะเชื่อมต่อกับฐานข้อมูลในขั้นตอนถัดไป</p>
    </section>
  );
}

function App() {
  return (
    <Router>
      <Routes>
        {/* หน้าผู้ใช้ */}
        <Route path="/" element={<Login />} />

        <Route path="/homepage" element={<Homepage />} />
        <Route path="/homepage.html" element={<Homepage />} />

        <Route path="/mybooking" element={<Mybooking />} />
        <Route path="/Mybooking.html" element={<Mybooking />} />

        {/* หน้าคู่มือ */}
        <Route path="/guide" element={<Guide />} />
        <Route path="/Guide.html" element={<Guide />} />

        <Route path="/rule" element={<Rule />} />

        <Route path="/review" element={<Review />} />

        {/* หน้าผู้ดูแลระบบ */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="rooms" element={<AdminRooms />} />
          <Route path="bookings" element={<AdminBooking />} />
          <Route path="accounts" element={<AdminAccounts />} />

          {/* ร้องเรียน รีวิว และแจ้งซ่อม */}
          <Route path="support" element={<AdminSupport />} />

          {/* รายงานและสถิติการจอง */}
          <Route
            path="reports"
            element={<AdminComingSoon title="รายงานและสถิติการจอง" />}
          />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
