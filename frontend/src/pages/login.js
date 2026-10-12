
import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../css/login.css";

const API_BASE_URL = "http://localhost:5001";

const normalizeFaculty = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const isAllowedFaculty = (faculty) => {
  const normalized = normalizeFaculty(faculty);

  return [
    "คณะวิทยาศาสตร์และเทคโนโลยี",
    "วิทยาศาสตร์และเทคโนโลยี",
    "faculty of science and technology",
    "science and technology",
    "faculty of science & technology"
  ].includes(normalized);
};

function Login() {
  const navigate = useNavigate();

  const [studentId, setStudentId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const login = async () => {
    if (!studentId.trim() || !password) {
      alert("กรุณากรอก Username และ Password");
      return;
    }

    if (loading) return;

    setLoading(true);

    try {
      const response = await axios.post(
        `${API_BASE_URL}/login`,
        {
          username: studentId.trim(),
          password
        }
      );

      const data = response.data;

      if (!data.success || !data.user) {
        alert(data.message || "เข้าสู่ระบบไม่สำเร็จ");
        return;
      }

      const faculty =
        data.user.faculty ||
        data.user.faculty_name_th ||
        data.user.faculty_name_en ||
        "";

      if (!isAllowedFaculty(faculty)) {
        alert(
          "ขออภัย ระบบเปิดให้บริการเฉพาะนักศึกษาคณะวิทยาศาสตร์และเทคโนโลยี"
        );
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      navigate("/homepage");
    } catch (error) {
      console.error(
        "Login error:",
        error.response?.data || error.message
      );

      alert(
        error.response?.data?.message ||
        "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบ Username และ Password"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="left-section">
        <div className="logo-wrapper">
          <img
            src={`${process.env.PUBLIC_URL}/logo.png`}
            alt="logo"
            className="logo"
          />
        </div>

        <div className="booking-wrapper">
          <h1>BOOKING ROOM</h1>
          <div className="booking-line"></div>
          <p>
            Learning Center 2
            <br />
            Thammasat University (Rangsit Campus)
          </p>
        </div>
      </div>

      <div className="right-section">
        <div className="login-box">
          <div className="login-title">LOGIN</div>

          <div className="form-wrapper">
            <label>USERNAME</label>
            <input
              type="text"
              placeholder="enter your username or email"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") login();
              }}
              disabled={loading}
            />

            <label>PASSWORD</label>

            <div className="password-input-wrapper">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") login();
                }}
                disabled={loading}
              />

              <button
                type="button"
                className="password-toggle"
                onClick={() =>
                  setShowPassword((previous) => !previous)
                }
                disabled={loading}
                aria-label={
                  showPassword ? "Hide password" : "Show password"
                }
                title={
                  showPassword ? "Hide password" : "Show password"
                }
              >
                {showPassword ? (
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.6 10.6a2 2 0 002.8 2.8" />
                    <path d="M9.9 5.2A11 11 0 0121 12a11.8 11.8 0 01-3.2 4.5" />
                    <path d="M6.2 6.2A12 12 0 003 12a11 11 0 0018 0" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path d="M3 12s3.3-7 9-7 9 7 9 7-3.3 7-9 7-9-7-9-7z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            <div className="button-wrapper">
              <button onClick={login} disabled={loading}>
                {loading ? "LOADING..." : "ENTER"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
