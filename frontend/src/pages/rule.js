import Navbar from "../components/navbar";
import "../css/rule.css";

function Rule() {
  return (
    <div className="rule-page">
      <Navbar />

      <main className="rule-container">
        <section className="rule-hero">
          <span className="rule-label">BOOKING CSTU</span>
          <h1>ข้อกำหนดการใช้ห้องประชุม</h1>
          <p>
            โปรดอ่านและปฏิบัติตามกฎการใช้ห้องประชุม
            เพื่อให้ทุกคนสามารถใช้พื้นที่ร่วมกันได้อย่างเหมาะสม
          </p>
        </section>

        <section className="rule-content">
          <div className="rule-heading">
            <span className="rule-heading-icon">📋</span>
            <div>
              <h2>กฎการใช้ห้องประชุม</h2>
              <p>Room Usage Rules</p>
            </div>
          </div>

          <div className="rule-list">
            <article className="rule-item">
              <span className="rule-number">01</span>
              <div>
                <h3>งดรับประทานอาหารและเครื่องดื่ม</h3>
                <p>
                  ไม่อนุญาตให้นำอาหารและเครื่องดื่มเข้ามารับประทานภายในห้องประชุม
                </p>
              </div>
            </article>

            <article className="rule-item">
              <span className="rule-number">02</span>
              <div>
                <h3>รักษาความสงบ</h3>
                <p>
                  กรุณาลดระดับเสียง และหลีกเลี่ยงการส่งเสียงรบกวนผู้อื่น
                </p>
              </div>
            </article>

            <article className="rule-item">
              <span className="rule-number">03</span>
              <div>
                <h3>ห้ามจองที่นั่งหรือพื้นที่ไว้ล่วงหน้าโดยไม่ใช้งาน</h3>
                <p>
                  ไม่อนุญาตให้วางสิ่งของหรือกันที่นั่งและพื้นที่ภายในห้องไว้
                  เพื่อให้ผู้อื่นสามารถใช้พื้นที่ได้อย่างทั่วถึง
                </p>
              </div>
            </article>

            <article className="rule-item">
              <span className="rule-number">04</span>
              <div>
                <h3>ยืนยันการเข้าใช้งานห้อง</h3>
                <p>
                  ผู้จองต้องยืนยันการเข้าใช้งานห้องภายในเวลาที่กำหนด
                  โดยสามารถยืนยันได้ในช่วงเวลาต่อไปนี้
                </p>

                <ul className="rule-sublist">
                  <li>ภายใน 15 นาทีก่อนเวลาเริ่มจอง</li>
                  <li>ภายใน 15 นาทีหลังเวลาเริ่มจอง</li>
                </ul>
              </div>
            </article>

            <article className="rule-item">
              <span className="rule-number">05</span>
              <div>
                <h3>ยกเลิกการจองล่วงหน้า</h3>
                <p>
                  หากไม่ต้องการใช้ห้องแล้ว กรุณายกเลิกการจองล่วงหน้า
                  อย่างน้อย 30 นาทีก่อนเวลาเริ่มจอง
                </p>
              </div>
            </article>

            <article className="rule-item rule-item-warning">
              <span className="rule-number">06</span>
              <div>
                <h3>ไม่ยืนยันการเข้าใช้งานตามเวลาที่กำหนด</h3>
                <p>
                  หากผู้จองไม่ยืนยันการเข้าใช้งานภายในเวลาที่กำหนด
                  ระบบจะยกเลิกการจองโดยอัตโนมัติ
                </p>
              </div>
            </article>

            <article className="rule-item rule-item-warning">
              <span className="rule-number">07</span>
              <div>
                <h3>การระงับสิทธิ์การจอง</h3>
                <p>
                  หากผู้จองไม่ยืนยันการเข้าใช้งานตามเงื่อนไขครบ 2 ครั้ง
                  จะถูกระงับสิทธิ์การจองห้องเป็นเวลา 1 เดือน
                </p>
              </div>
            </article>
          </div>

          <section className="rule-contact">
            <div className="rule-contact-icon">☎</div>
            <div className="rule-contact-text">
              <h2>ต้องการความช่วยเหลือ?</h2>
              <p>
                หากพบปัญหาหรือมีข้อสงสัยเกี่ยวกับการจองห้องประชุม
                กรุณาติดต่อเจ้าหน้าที่
              </p>
              <a href="tel:02XXXXXXXX">02-xxx-xxxx</a>
            </div>
          </section>

          <p className="rule-footer-note">
            กรุณาปฏิบัติตามข้อกำหนดอย่างเคร่งครัด
            เพื่อรักษาสิทธิ์ในการจองและการใช้ห้องประชุมร่วมกัน
          </p>
        </section>
      </main>
    </div>
  );
}

export default Rule;
