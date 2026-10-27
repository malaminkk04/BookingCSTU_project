import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./navbar.css";

const STORAGE_USER_KEY = "user";
const STORAGE_TOKEN_KEY = "token";

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = useState(null);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    function loadUser() {
      try {
        const savedUser = localStorage.getItem(STORAGE_USER_KEY);
        setUser(savedUser ? JSON.parse(savedUser) : null);
      } catch {
        setUser(null);
      }
    }

    loadUser();

    window.addEventListener("storage", loadUser);

    return () => {
      window.removeEventListener("storage", loadUser);
    };
  }, []);

  useEffect(() => {
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!event.target.closest(".nb-profile-menu")) {
        setProfileOpen(false);
      }
    }

    document.addEventListener("click", handleOutsideClick);

    return () => {
      document.removeEventListener("click", handleOutsideClick);
    };
  }, []);

  function isActive(path) {
    return location.pathname.replace(/\/+$/, "") === path;
  }

  function logout() {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);

    setUser(null);
    setProfileOpen(false);

    navigate("/", { replace: true });
  }

  function toggleProfile(event) {
    event.stopPropagation();
    setProfileOpen((previous) => !previous);
  }

  const displayName =
    user?.displayname_th ||
    user?.displayname_en ||
    user?.name ||
    "-";

  const username =
    user?.username ||
    user?.tu_id ||
    user?.user_id ||
    "-";

  const faculty = user?.faculty || "-";
  const department = user?.department || user?.major || "-";
  const email = user?.email || "-";

  return (
    <header className="nb-header">
      <button
        type="button"
        className="nb-brand"
        aria-label="Booking CSTU Home"
        onClick={() => navigate("/homepage")}
      >
        <img
          className="nb-brand-logo"
          src={`${process.env.PUBLIC_URL}/logo.png`}
          alt="Booking CSTU logo"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />

        <span className="nb-brand-copy">
          <strong>CSTU ROOM BOOKING</strong>
          <small>BOOKING CSTU ROOM</small>
        </span>
      </button>

      <nav className="nb-nav" aria-label="Main navigation">
        <button
          type="button"
          className={`nb-link ${isActive("/homepage") ? "active" : ""}`}
          onClick={() => navigate("/homepage")}
        >
          HOME
        </button>

        <button
          type="button"
          className={`nb-link ${isActive("/mybooking") ? "active" : ""}`}
          onClick={() => navigate("/mybooking")}
        >
          MY BOOKING
        </button>

                <button
            type="button"
            className={`nb-link ${isActive("/guide") ? "active" : ""}`}
            onClick={() => navigate("/guide")}
            >
            GUIDE
        </button>

        <button
            type="button"
            className={`nb-link ${isActive("/rule") ? "active" : ""}`}
            onClick={() => navigate("/rule")}
            >
            RULE
        </button>

        <button
          type="button"
          className={`nb-link ${
            isActive("/review") || isActive("/review.html")
              ? "active"
              : ""
          }`}
          onClick={() => navigate("/review")}
        >
          REVIEW
        </button>

        <div className="nb-profile-menu">
          <button
            type="button"
            id="profileButton"
            className="nb-profile-button"
            aria-expanded={profileOpen}
            aria-controls="profilePopup"
            onClick={toggleProfile}
          >
            <span>PROFILE</span>
            <span className="nb-chevron" aria-hidden="true">
              ⌄
            </span>
          </button>

          {profileOpen && (
            <section
              id="profilePopup"
              className="nb-profile-popup"
              aria-label="ข้อมูลผู้ใช้"
              onClick={(event) => event.stopPropagation()}
            >
              <h2>ข้อมูลผู้ใช้</h2>

              <dl className="nb-profile-details">
                <div>
                  <dt>ชื่อ</dt>
                  <dd>{displayName}</dd>
                </div>

                <div>
                  <dt>Username</dt>
                  <dd>{username}</dd>
                </div>

                <div>
                  <dt>คณะ</dt>
                  <dd>{faculty}</dd>
                </div>

                <div>
                  <dt>สาขา</dt>
                  <dd>{department}</dd>
                </div>

                <div>
                  <dt>Email</dt>
                  <dd>{email}</dd>
                </div>
              </dl>

              <button
                type="button"
                className="nb-logout"
                onClick={logout}
              >
                LOGOUT
              </button>
            </section>
          )}
        </div>
      </nav>
    </header>
  );
}

export default Navbar;