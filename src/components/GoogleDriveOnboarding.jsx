import GoogleSheetConnection from './GoogleSheetConnection.jsx'

export default function GoogleDriveOnboarding({ onConnected }) {
  return <div className="google-onboarding-backdrop">
    <section className="google-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="google-onboarding-title" aria-describedby="google-onboarding-description">
      <div className="google-onboarding-mark" aria-hidden="true">G</div>
      <p className="google-onboarding-kicker">เริ่มต้นใช้งาน PetCare</p>
      <h2 id="google-onboarding-title">เชื่อม Google Drive ก่อนเริ่มใช้งาน</h2>
      <p id="google-onboarding-description">ข้อมูลการดูแลสัตว์เลี้ยงจะอยู่ใน Google Sheet ส่วนตัวของคุณ เมื่อเชื่อมสำเร็จ PetCare จะจำไฟล์นี้ไว้สำหรับการใช้งานครั้งถัดไป</p>
      <ul className="google-onboarding-benefits">
        <li>ข้อมูลอยู่ใน Google Drive ของคุณ</li>
        <li>เปิดดูข้อมูลจากอุปกรณ์อื่นได้</li>
        <li>PetCare ไม่จัดเก็บรหัสผ่าน Google</li>
      </ul>
      <GoogleSheetConnection ariaLabel="Google Drive onboarding connection" initialConsentAccepted showConsent={false} buttonLabel="เริ่มเชื่อม Google Drive" onConnected={onConnected} />
    </section>
  </div>
}
