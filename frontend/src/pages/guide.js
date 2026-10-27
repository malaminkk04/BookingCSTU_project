import Navbar from "../components/navbar";
import "../css/Guide.css";

function Guide() {
  return (
    <div className="guide-page">
      <Navbar />

      <main className="guide-container">
        <section className="guide-hero">
          <span className="guide-label">BOOKING CSTU</span>
          <h1>คู่มือการใช้งาน</h1>
          <p>
            แนะนำขั้นตอนการจองห้องประชุม การเช็กอิน และการยกเลิกการจอง
            สำหรับระบบจองห้องประชุมคณะวิทยาศาสตร์และเทคโนโลยี
            มหาวิทยาลัยธรรมศาสตร์ ศูนย์รังสิต
          </p>
        </section>

        <section className="guide-summary">
          <article className="guide-summary-card">
            <span className="guide-card-icon">📅</span>
            <h3>วันและเวลา</h3>
            <p>วันจันทร์–ศุกร์</p>
            <p>08:00–16:00 น.</p>
          </article>

          <article className="guide-summary-card">
            <span className="guide-card-icon">⏱️</span>
            <h3>ระยะเวลาจอง</h3>
            <p>อย่างน้อย 1 ชั่วโมง</p>
            <p>สูงสุด 2 ชั่วโมงต่อครั้ง</p>
          </article>

          <article className="guide-summary-card">
            <span className="guide-card-icon">📍</span>
            <h3>การเช็กอิน</h3>
            <p>ต้องอยู่ห่างจากห้อง</p>
            <p>ไม่เกิน 500 เมตร</p>
          </article>
        </section>

        <section className="guide-section">
          <div className="guide-section-heading">
            <span className="guide-step-number">01</span>
            <div>
              <h2>ขั้นตอนการจองห้องประชุม</h2>
              <p>ทำตามขั้นตอนต่อไปนี้เพื่อจองห้องที่ต้องการ</p>
            </div>
          </div>

          <div className="guide-steps">
            <article className="guide-step">
              <span className="guide-step-icon">01</span>
              <div>
                <h3>เลือกห้องประชุม</h3>
                <p>
                  ไปที่เมนู HOME เพื่อดูรายการห้องประชุม
                  เลือกชั้นและวันที่ต้องการใช้งาน
                  จากนั้นตรวจสอบห้องและช่วงเวลาที่ว่าง
                </p>
              </div>
            </article>

            <article className="guide-step">
              <span className="guide-step-icon">02</span>
              <div>
                <h3>เลือกห้องที่ต้องการ</h3>
                <p>
                  ตรวจสอบรายละเอียดห้องและเวลาว่าง
                  แล้วกดปุ่ม “จองห้องนี้”
                </p>
              </div>
            </article>

            <article className="guide-step">
              <span className="guide-step-icon">03</span>
              <div>
                <h3>กรอกรายละเอียดการจอง</h3>
                <p>
                  ระบุวันที่ เวลาเริ่มต้น เวลาสิ้นสุด
                  และวัตถุประสงค์การใช้งานให้ครบถ้วน
                </p>
              </div>
            </article>

            <article className="guide-step">
              <span className="guide-step-icon">04</span>
              <div>
                <h3>ตรวจสอบและยืนยัน</h3>
                <p>
                  ตรวจสอบข้อมูลการจองอีกครั้ง
                  แล้วกดยืนยันเพื่อส่งคำขอจองห้องประชุม
                </p>
              </div>
            </article>
          </div>
        </section>

        <section className="guide-section">
          <div className="guide-section-heading">
            <span className="guide-step-number">02</span>
            <div>
              <h2>เงื่อนไขการจอง</h2>
              <p>โปรดตรวจสอบเงื่อนไขก่อนยืนยันการจองทุกครั้ง</p>
            </div>
          </div>

          <ul className="guide-rule-list">
            <li>สามารถจองได้วันจันทร์–ศุกร์ ยกเว้นวันหยุดราชการ</li>
            <li>เวลาให้บริการ 08:00–16:00 น.</li>
            <li>ระยะเวลาการจองขั้นต่ำ 1 ชั่วโมง และสูงสุด 2 ชั่วโมงต่อครั้ง</li>
            <li>ต้องเลือกช่วงเวลาที่ห้องว่างและไม่ทับซ้อนกับการจองอื่น</li>
            <li>ควรตรวจสอบวันที่และเวลาก่อนยืนยันการจอง</li>
          </ul>
        </section>

        <section className="guide-section">
          <div className="guide-section-heading">
            <span className="guide-step-number">03</span>
            <div>
              <h2>วิธีเช็กอินเข้าใช้งานห้อง</h2>
              <p>ยืนยันการเข้าใช้งานตามเวลาที่จองไว้</p>
            </div>
          </div>

          <div className="guide-info-box">
            <h3>ขั้นตอนการเช็กอิน</h3>
            <ol>
              <li>เดินทางไปยังบริเวณห้องประชุมที่จองไว้</li>
              <li>ตรวจสอบว่าอุปกรณ์ของคุณอยู่ห่างจากห้องไม่เกิน 500 เมตร</li>
              <li>เปิดเมนู MY BOOKING</li>
              <li>เลือกการจองที่ต้องการ แล้วกดปุ่ม “Check-in”</li>
              <li>ดำเนินการก่อนเวลาเริ่มจอง หรือภายใน 15 นาทีหลังเวลาเริ่มจอง</li>
            </ol>
          </div>

          <p className="guide-warning">
            หากไม่เช็กอินภายในเวลาที่กำหนด ระบบอาจยกเลิกการจองโดยอัตโนมัติ
          </p>
        </section>

        <section className="guide-section">
          <div className="guide-section-heading">
            <span className="guide-step-number">04</span>
            <div>
              <h2>วิธียกเลิกการจอง</h2>
              <p>ยกเลิกการจองเมื่อไม่ต้องการใช้ห้องแล้ว</p>
            </div>
          </div>

          <div className="guide-info-box">
            <ol>
              <li>เปิดเมนู MY BOOKING</li>
              <li>ค้นหารายการจองที่ต้องการยกเลิก</li>
              <li>กดปุ่ม “Cancel booking”</li>
              <li>ตรวจสอบและยืนยันการยกเลิกตามข้อความที่ระบบแสดง</li>
            </ol>
          </div>

          <p className="guide-warning">
            ต้องยกเลิกก่อนเวลาเริ่มจองอย่างน้อย 30 นาที
            ทั้งนี้ให้เป็นไปตามสถานะและเงื่อนไขที่ระบบกำหนด
          </p>
        </section>

        <section className="guide-notice">
          <h2>ข้อควรทราบ</h2>
          <ul>
            <li>โปรดเช็กอินทุกครั้งเมื่อเดินทางมาถึงห้องประชุม</li>
            <li>การไม่เข้าใช้งานหรือไม่เช็กอินอาจทำให้เสียสิทธิ์การจอง</li>
            <li>
              ตามเงื่อนไขที่กำหนด หากไม่เข้าใช้งานห้องตามการจอง 2 ครั้ง
              อาจถูกระงับสิทธิ์การจองเป็นเวลา 1 เดือน
            </li>
            <li>
              โปรดตรวจสอบรายละเอียดและสถานะการจองในเมนู MY BOOKING
              ก่อนเข้าใช้งานทุกครั้ง
            </li>
          </ul>
        </section>

        <section className="guide-footer">
          <h2>พร้อมจองห้องประชุมแล้วหรือยัง?</h2>
          <p>ไปที่หน้า HOME เพื่อค้นหาและจองห้องประชุมที่คุณต้องการ</p>
          <a className="guide-home-button" href="/homepage">
            กลับไปหน้า HOME
          </a>
        </section>
      </main>
    </div>
  );
}

export default Guide;
