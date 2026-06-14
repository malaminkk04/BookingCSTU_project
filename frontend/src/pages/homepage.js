import { useState, useEffect } from "react";

import axios from "axios";

import {
  useNavigate
} from "react-router-dom";

import "../css/homepage.css";

function Homepage() {

  const navigate = useNavigate();

  const [user, setUser] = useState(null);

  const [bookings, setBookings] =
    useState([]);

  const [showProfile, setShowProfile] =
    useState(false);

  useEffect(() => {

    const userData =
      localStorage.getItem("user");

    if (!userData) {

      navigate("/");

      return;

    }

    const parsedUser =
      JSON.parse(userData);

    setUser(parsedUser);

    axios
      .get(
        "http://localhost:5001/api/rooms"
      )

      .then((response) => {

        setBookings(
          response.data.rooms || []
        );

      })

      .catch((error) => {

        console.log(error);

      });

  }, [navigate]);

  // logout

  const logout = () => {

    localStorage.removeItem(
      "token"
    );

    localStorage.removeItem(
      "user"
    );

    navigate("/");

  };

  if (!user) {

    return <h1>Loading...</h1>;

  }

  return (

    <div className="homepage">

      {/* TOPBAR */}

      <nav className="topbar">

        <div className="nav-menu">

          <span>
            HOME
          </span>

          <span>
            MY BOOKING
          </span>

          <span>
            GUIDE
          </span>

          <span>
            RULE
          </span>

          <span>
            REVIEW
          </span>

        </div>

        <div className="nav-right">

          <button
            className="profile-btn"
            onClick={() =>
              setShowProfile(
                !showProfile
              )
            }
          >

            PROFILE 👤

          </button>

          {/* PROFILE POPUP */}

          {showProfile && (

            <div className="profile-popup">

              <h2>
                PROFILE
              </h2>

              <hr />

              <p>

                <strong>
                  ชื่อ:
                </strong>

                {" "}

                {user.displayname_th}

              </p>

              <p>

                <strong>
                  เลขนักศึกษา:
                </strong>

                {" "}

                {user.username}

              </p>

              <p>

                <strong>
                  คณะ:
                </strong>

                {" "}

                {user.faculty}

              </p>

              <p>

                <strong>
                  สาขา:
                </strong>

                {" "}

                {user.department}

              </p>

              <p>

                <strong>
                  Email:
                </strong>

                {" "}

                {user.email}

              </p>

              <div className="profile-buttons">

                <button
                  className="close-btn"
                  onClick={() =>
                    setShowProfile(false)
                  }
                >

                  ปิด

                </button>

                <button
                  className="logout-btn"
                  onClick={logout}
                >

                  Logout

                </button>

              </div>

            </div>

          )}

        </div>

      </nav>

      {/* HERO */}

      <div className="hero-section">

        <div className="hero-left">

          <img
            src="../logo.png"
            alt="logo"
            className="hero-logo"
          />

        </div>

        <div className="hero-line"></div>

        <div className="hero-right">

          <h1>
            BOOKING
            <br />
            ROOM
          </h1>

        </div>

      </div>

      {/* CONTENT */}

      <div className="content-section">

        {/* FILTER */}

        <div className="filter-section">

          <div className="filter-group">

            <label>
              ชั้น
            </label>

            <select>

              <option>
                1
              </option>

              <option>
                2
              </option>

              <option>
                3
              </option>

            </select>

          </div>

          <div className="filter-group">

            <label>
              วันที่
            </label>

            <input
              type="date"
            />

          </div>

          <div className="filter-group">

            <label>
              ค้นหาห้อง
            </label>

            <input
              type="text"
              placeholder="ค้นหาห้อง"
            />

          </div>

        </div>

        {/* ROOM LIST */}

        <div className="room-list">

          {bookings.length > 0 ? (

            bookings.map((room) => (

              <div
                className="room-card"
                key={room.id}
              >

                <div className="room-image">

                  รูปห้อง

                </div>

                <div className="room-info">

                  <h2>

                    {room.room_name ||
                      "ชื่อห้อง"}

                  </h2>

                  <p>

                    ความจุ
                    {" "}

                    {room.capacity ||
                      "__"}

                    {" "}
                    คน |

                    {" "}

                    {room.equipment ||
                      "อุปกรณ์ภายในห้อง"}

                  </p>

                  <div className="time-bar">

                  </div>

                  <div className="time-row">

                    <span>9:00</span>
                    <span>10:00</span>
                    <span>11:00</span>
                    <span>12:00</span>
                    <span>13:00</span>
                    <span>14:00</span>
                    <span>15:00</span>
                    <span>16:00</span>

                  </div>

                </div>

              </div>

            ))

          ) : (

            <div className="room-card">

              <div className="room-image">

                รูปห้อง

              </div>

              <div className="room-info">

                <h2>
                  ชื่อห้อง
                </h2>

                <p>
                  ความจุ 40 คน |
                  โปรเจคเตอร์,
                  TV,
                  Whiteboard
                </p>

                <div className="time-bar">

                </div>

                <div className="time-row">

                  <span>9:00</span>
                  <span>10:00</span>
                  <span>11:00</span>
                  <span>12:00</span>
                  <span>13:00</span>
                  <span>14:00</span>
                  <span>15:00</span>
                  <span>16:00</span>

                </div>

              </div>

            </div>

          )}

        </div>

      </div>

    </div>

  );

}

export default Homepage;