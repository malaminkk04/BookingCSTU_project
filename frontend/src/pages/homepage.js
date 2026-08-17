import { useState, useEffect } from "react";

import axios from "axios";

import {
  useNavigate
} from "react-router-dom";

import "../css/homepage.css";

// ข้อมูลห้องแบ่งตามชั้น (ใช้เป็นข้อมูลตัวอย่าง จนกว่า backend จะมี endpoint /api/rooms จริง)
const MOCK_ROOMS_BY_FLOOR = [
  {
    floor: 1,
    rooms: [
      {
        id: "107",
        room_name: "107 ห้องปฏิบัติการคอมพิวเตอร์",
        capacity_label: "ความจุ: 80 คน พร้อมคอมพิวเตอร์",
        description:
          "โปรเจคเตอร์ 2 | Whiteboard พร้อมปากกาและแปรงลบ\nอุปกรณ์ที่เกี่ยวข้องกับการเรียน(คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1, ไมโครโฟนลอย 2)"
      },
      {
        id: "111-classroom",
        room_name: "111 ห้องปฏิบัติการคอมพิวเตอร์ (ห้องเรียน)",
        capacity_label: "ความจุ: 40 คน พร้อมคอมพิวเตอร์",
        description:
          "โปรเจคเตอร์ 1 | Whiteboard พร้อมปากกาและแปรงลบ\nอุปกรณ์ที่เกี่ยวข้องกับการเรียน(คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1)"
      },
      {
        id: "111-greader",
        room_name: "111 ห้องปฏิบัติการคอมพิวเตอร์ (Greader)",
        capacity_label: "ความจุ: 20 คน พร้อมคอมพิวเตอร์",
        description: ""
      }
    ]
  },
  {
    floor: 2,
    rooms: [
      {
        id: "meeting-1",
        room_name: "ห้องประชุม 1",
        capacity_label: "ความจุ: 24 คน",
        description:
          "จอทีวี 4 | โปรเจคเตอร์ 1\nคอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนห้องประชุม 18"
      },
      {
        id: "meeting-2",
        room_name: "ห้องประชุม 2",
        capacity_label: "ความจุ: 24 คน",
        description:
          "โปรเจคเตอร์ 1\nคอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนห้องประชุม 18"
      },
      {
        id: "213",
        room_name: "213 ห้องปฏิบัติการคอมพิวเตอร์พื้นฐาน",
        capacity_label: "ความจุ: 60 คน พร้อมคอมพิวเตอร์",
        description: 
          "โปรเจคเตอร์ 1 | Whiteboard พร้อมปากกาและแปรงลบ\nอุปกรณ์ที่เกี่ยวข้องกับการเรียน(คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1)"
      }
    ]
  },
  {
    floor: 3,
    rooms: [
      {
        id: "301",
        room_name: "ห้องประชุม 301",
        capacity_label: "ความจุ: 4 คน",
        description:
          "จอทีวี 1 | Whiteboard พร้อมปากกาและแปรงลบ"
      },
      {
        id: "302",
        room_name: "ห้องประชุม 302",
        capacity_label: "ความจุ: 8 คน",
        description:
          "จอทีวี 1 | Whiteboard พร้อมปากกาและแปรงลบ | คอมพิวเตอร์ 1"
      },
      {
        id: "303",
        room_name: "ห้องประชุม 303",
        capacity_label: "ความจุ: 8 คน",
        description: 
          "จอทีวี 1 | Whiteboard พร้อมปากกาและแปรงลบ | คอมพิวเตอร์ 1"
      },
      {
        id: "304",
        room_name: "ห้องประชุม 304",
        capacity_label: "ความจุ: 8 คน",
        description: 
          "จอทีวี 1 | Whiteboard พร้อมปากกาและแปรงลบ | คอมพิวเตอร์ 1"
      },
      {
        id: "305",
        room_name: "ห้องประชุม 305",
        capacity_label: "ความจุ: 8 คน",
        description: 
          "จอทีวี 1 | Whiteboard พร้อมปากกาและแปรงลบ | คอมพิวเตอร์ 1"
      },
      {
        id: "306",
        room_name: "ห้องเรียน 306 (สำหรับปริญญาโท)",
        capacity_label: "ความจุ: 50 คน ",
        description: 
          "โปรเจคเตอร์ 1 | Whiteboard พร้อมปากกาและแปรงลบ\nอุปกรณ์ที่เกี่ยวข้องกับการเรียน(คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1,ไมโครโฟนลอย 2)"
      },
      {
        id: "308",
        room_name: "ห้องเรียน 308",
        capacity_label: "ความจุ: 70 คน ",
        description: 
          "โปรเจคเตอร์ 1 | Whiteboard พร้อมปากกาและแปรงลบ\nอุปกรณ์ที่เกี่ยวข้องกับการเรียน(คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนลอย 2)"
      },
      {
        id: "309",
        room_name: "ห้องเรียน 309",
        capacity_label: "ความจุ: 70 คน ",
        description: 
          "โปรเจคเตอร์ 1 | Whiteboard พร้อมปากกาและแปรงลบ\nอุปกรณ์ที่เกี่ยวข้องกับการเรียน(คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1,ไมโครโฟนลอย 2)"
      },
      {
        id: "310",
        room_name: "ห้องเรียน 310",
        capacity_label: "ความจุ: 70 คน ",
        description: 
          "โปรเจคเตอร์ 1 | Whiteboard พร้อมปากกาและแปรงลบ\nอุปกรณ์ที่เกี่ยวข้องกับการเรียน(คอมพิวเตอร์ 1, Visualizer 1, ไมโครโฟนสาย 1,ไมโครโฟนลอย 2)"
      },
      {
        id: "314",
        room_name: "ห้องประชุม 314",
        capacity_label: "ความจุ: 8 คน",
        description: 
          "จอทีวี 1 | Whiteboard พร้อมปากกาและแปรงลบ | คอมพิวเตอร์ 1"
      },
      {
        id: "315",
        room_name: "ห้องประชุม 315",
        capacity_label: "ความจุ: 8 คน",
        description: 
          "จอทีวี 1 | Whiteboard พร้อมปากกาและแปรงลบ | คอมพิวเตอร์ 1"
      }
    ]
  }



];

// จัดกลุ่มรายการห้อง (จาก API) ให้เป็น section ตามชั้น
// รองรับกรณีห้องแต่ละรายการมี field "floor" ติดมาด้วย
function groupRoomsByFloor(rooms) {
  const grouped = {};

  rooms.forEach((room) => {
    const floor = room.floor || 1;
    if (!grouped[floor]) grouped[floor] = [];
    grouped[floor].push(room);
  });

  return Object.keys(grouped)
    .sort((a, b) => Number(a) - Number(b))
    .map((floor) => ({
      floor: Number(floor),
      rooms: grouped[floor]
    }));
}

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

  // ถ้ามีข้อมูลจริงจาก API ใช้ข้อมูลจริง (จัดกลุ่มตามชั้น)
  // ถ้ายังไม่มี (API ยังไม่พร้อม/ยังไม่มี endpoint) ใช้ข้อมูลตัวอย่างแทน
  const floorSections =
    bookings.length > 0
      ? groupRoomsByFloor(bookings)
      : MOCK_ROOMS_BY_FLOOR;

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

        {/* ROOM LIST แบ่งตามชั้น */}

        {floorSections.map((section) => (

          <div
            className="floor-container"
            key={section.floor}
          >

            <div className="floor-tab">
              ชั้น {section.floor}
            </div>

            <div className="floor-rooms">

              {section.rooms.map((room) => (

                <div
                  className="room-card-dark"
                  key={room.id}
                >

                  <div className="room-image">

                    รูปห้อง

                  </div>

                  <div className="room-info">

                    <div className="room-header">

                      <h2>
                        {room.room_name ||
                          "ชื่อห้อง"}
                      </h2>

                      <span className="capacity-badge">
                        {room.capacity_label ||
                          "ความจุ:"}
                      </span>

                    </div>

                    {room.description && (

                      <p className="room-desc">

                        {room.description
                          .split("\n")
                          .map((line, i) => (
                            <span key={i}>
                              {line}
                              <br />
                            </span>
                          ))}

                      </p>

                    )}

                    <div className="time-slot">

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

                </div>

              ))}

            </div>

          </div>

        ))}

      </div>

    </div>

  );

}

export default Homepage;