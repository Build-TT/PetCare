import GoogleSheetConnection from './GoogleSheetConnection.jsx'

export default function GoogleDriveOnboarding({ onConnected }) {
  return <div className="google-onboarding-backdrop">
    <section className="google-onboarding-dialog" role="dialog" aria-modal="true" aria-labelledby="google-onboarding-title" aria-describedby="google-onboarding-description">
      <div className="google-onboarding-mark" aria-hidden="true">G</div>
      <p className="google-onboarding-kicker">เริ่มต้นใช้งาน PetCare</p>
      <h2 id="google-onboarding-title">เชื่อม Google Drive ก่อนเริ่มใช้งาน</h2>
      <p id="google-onboarding-description">ข้อมูลการดูแลสัตว์เลี้ยงจะถูกจัดเก็บใน Google Sheet ส่วนตัวของคุณ เราจะจำไฟล์นี้ไว้ เพื่อให้เปิดใช้งานครั้งต่อไปได้ต่อเนื่อง</p>
      <ul className="google-onboarding-benefits">
        <li>ข้อมูลอยู่ใน Google Drive ของคุณ</li>
        <li>เปิดดูและใช้งานต่อได้จากอุปกรณ์อื่น</li>
        <li>PetCare จะไม่เก็บรหัสผ่าน Google ของคุณ</li>
      </ul>
      <GoogleSheetConnection ariaLabel="Google Drive onboarding connection" initialConsentAccepted showConsent={false} buttonLabel="เริ่มเชื่อม Google Drive" onConnected={onConnected} />
    </section>
  </div>
}
