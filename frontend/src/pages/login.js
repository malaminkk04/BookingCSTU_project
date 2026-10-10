import { useState } from "react";

import axios from "axios";

import { useNavigate } from "react-router-dom";

import "../css/login.css";

function Login() {

  const navigate = useNavigate();

  const [studentId, setStudentId] =
    useState("");

  const [password, setPassword] =
    useState("");

  const login = async () => {

    if (!studentId || !password) {

      alert("กรุณากรอกข้อมูล");

      return;

    }

    try {

      const response =
        await axios.post(
          "http://localhost:5001/login",
          {
            username: studentId,
            password: password
          }
        );

      const data = response.data;

      if (data.success) {

        // save token
        localStorage.setItem(
          "token",
          data.token
        );

        // save user
        localStorage.setItem(
          "user",
          JSON.stringify(data.user)
        );


        console.log(data.user);

        // redirect
        setTimeout(() => {

          navigate("/homepage");

        }, 500);

      }

    } catch (error) {

      console.log(error);

      alert("เข้าสู่ระบบไม่สำเร็จ");

    }

  };

  return (

    <div className="login-page">

      {/* LEFT */}
      <div className="left-section">

        <div className="logo-wrapper">

          <img
            src={`${process.env.PUBLIC_URL}/logo.png`}
            alt="logo"
            className="logo"
          />

        </div>

        <div className="booking-wrapper">

          <h1>
            BOOKING ROOM
          </h1>

          <div className="booking-line"></div>

          <p>
            Learning Center 2
            <br />
            Thammasat University
            (Rangsit Campus)
          </p>

        </div>

      </div>

      {/* RIGHT */}
      <div className="right-section">

        <div className="login-box">

          <div className="login-title">

            LOGIN

          </div>

          <div className="form-wrapper">

            <label>
              USERNAME
            </label>

            <input
              type="text"
              placeholder="
                enter your username
              "

              onChange={(e) =>
                setStudentId(
                  e.target.value
                )
              }
            />

            <label>
              PASSWORD
            </label>

            <input
              type="password"
              placeholder="
                enter your password
              "

              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }
            />

            <div className="button-wrapper">

              <button
                onClick={login}
              >
                ENTER
              </button>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}

export default Login;