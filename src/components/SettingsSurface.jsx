import { useEffect, useState } from 'react'
import GoogleSheetConnection from './GoogleSheetConnection.jsx'
import GoogleSheetMembers from './GoogleSheetMembers.jsx'
import LineGroupSettings from './LineGroupSettings.jsx'
import { getAccountBackendVersion } from '../accountAuth.js'
import { APP_VERSION } from '../appVersion.js'

export default function SettingsSurface({
  section,
  onSectionChange,
  tracks,
  symptoms,
  lineRecipients,
  reminders,
  onOpenTrack,
  onToggleTrack,
  onDeleteTrack,
  onOpenSymptom,
  onToggleSymptom,
  onDeleteSymptom,
  lineUserId,
  onLineUserIdChange,
  onAddLineRecipient,
  onProvisionLine,
  lineRecipientError,
  trackForm,
  symptomForm,
  googleProps,
  onOpenReminders,
  onLogout,
}) {
  const [backendVersion, setBackendVersion] = useState(null)
  const [backendError, setBackendError] = useState(false)

  useEffect(() => {
    let active = true
    getAccountBackendVersion()
      .then(result => active && setBackendVersion(result.version || 'ไม่ระบุ'))
      .catch(() => active && setBackendError(true))
    return () => { active = false }
  }, [])

  const back = () => onSectionChange('')
  const versionStatus = backendError
    ? 'ตรวจ backend ไม่ได้ — อาจยังไม่ได้ Deploy เวอร์ชันล่าสุด'
    : backendVersion && backendVersion !== APP_VERSION
      ? 'เวอร์ชันไม่ตรงกัน — กรุณา Deploy backend ล่าสุด'
      : backendVersion
        ? 'เวอร์ชันตรงกัน'
        : 'กำลังตรวจสอบ backend…'

  if (!section) {
    return <section className="settings-overview" aria-label="เมนูตั้งค่า">
      <button className="setting setting-action" onClick={() => onSectionChange('tracking')}><b>รายการที่ติดตาม</b><small>{tracks.filter(item => item.active !== false).length} Active · {tracks.filter(item => item.active === false).length} Inactive</small></button>
      <button className="setting setting-action" onClick={() => onSectionChange('symptoms')}><b>จัดการอาการ</b></button>
      <button className="setting setting-action" onClick={() => onSectionChange('line')}><b>ผู้รับ LINE</b><small>{lineRecipients.length} ผู้รับ</small></button>
      <button className="setting setting-action" onClick={() => onOpenReminders()}><b>การแจ้งเตือน</b><small>{reminders.filter(item => item.enabled !== false).length} รายการที่เปิดใช้งาน</small></button>
      <button className="setting setting-action" onClick={() => onSectionChange('members')}><b>ผู้ใช้งาน PetCare</b><small>เพิ่มผู้ใช้และกำหนดสิทธิ์การเข้าถึงข้อมูล</small></button>
      <button className="setting setting-action" onClick={() => onSectionChange('google')}><b>Google Sheet</b><small>เชื่อมต่อและจัดการการซิงก์ข้อมูล</small></button>
      {onLogout && <button className="setting setting-action settings-logout" type="button" onClick={onLogout}><b>ออกจากระบบ</b><small>ออกจากบัญชี PetCare บนอุปกรณ์นี้</small></button>}
      <section className="settings-version" aria-label="เวอร์ชันระบบ"><b>เวอร์ชันระบบ</b><small>Web app: {APP_VERSION}</small><small>Account backend: {backendVersion || (backendError ? 'ตรวจไม่ได้' : 'กำลังตรวจสอบ…')}</small><small className={backendError || backendVersion !== APP_VERSION ? 'danger' : ''}>{versionStatus}</small></section>
    </section>
  }

  if (section === 'google') {
    return <section className="settings-detail" aria-label="Google Sheet">
      <button className="text-button settings-back" onClick={back}>← กลับเมนูตั้งค่า</button>
      <GoogleSheetConnection {...googleProps} lineUserId={lineUserId} onProvisionLine={onProvisionLine} />
      {googleProps?.connection && <GoogleSheetMembers connection={googleProps.connection} />}
    </section>
  }

  if (section === 'members') {
    return <section className="settings-detail" aria-label="ผู้ใช้งาน PetCare">
      <button className="text-button settings-back" onClick={back}>← กลับเมนูตั้งค่า</button>
      <section className="settings-panel">
        <h2>ผู้ใช้งาน PetCare</h2>
        <small>จัดการจากใน PetCare ได้เลย ผู้ใช้ที่เพิ่มจะได้รับอีเมลเชิญจาก Google และใช้บัญชี Google เปิดข้อมูลชุดเดียวกัน</small>
      </section>
      <GoogleSheetMembers connection={googleProps?.connection} />
    </section>
  }

  if (section === 'tracking') {
    return <section className="settings-detail" aria-label="จัดการรายการติดตาม">
      <button className="text-button settings-back" onClick={back}>← กลับเมนูตั้งค่า</button>
      <section className="settings-panel">
        <button className="add-button" onClick={() => onOpenTrack()}>＋ เพิ่มรายการติดตาม</button>
        {tracks.map(track => <article className="setting-record" key={track.id}><div><b>{track.name}</b><small>{track.active !== false ? 'Active' : 'Inactive'}</small></div><button aria-label={`แก้ไข ${track.name}`} onClick={() => onOpenTrack(track)}>แก้ไข</button><button aria-label={`${track.active === false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} ${track.name}`} onClick={() => onToggleTrack(track)}>{track.active === false ? 'Active' : 'Inactive'}</button><button className="danger" aria-label={`ลบ ${track.name}`} onClick={() => onDeleteTrack(track)}>ลบ</button></article>)}
      </section>
      {trackForm}
    </section>
  }

  if (section === 'symptoms') {
    return <section className="settings-detail" aria-label="จัดการอาการ">
      <button className="text-button settings-back" onClick={back}>← กลับเมนูตั้งค่า</button>
      <section className="settings-panel">
        <button className="add-button" onClick={() => onOpenSymptom()}>＋ เพิ่มอาการ</button>
        {symptoms.map(item => { const name = item.label_th || item.label_en; return <article className="setting-record" key={item.id || name}><b>{name}</b><button aria-label={`แก้ไข ${name}`} onClick={() => onOpenSymptom(item)}>แก้ไข</button><button aria-label={`${item.active === false ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} ${name}`} onClick={() => onToggleSymptom(item)}>{item.active === false ? 'Active' : 'Inactive'}</button><button className="danger" aria-label={`ลบ ${name}`} onClick={() => onDeleteSymptom(item)}>ลบ</button></article> })}
      </section>
      {symptomForm}
    </section>
  }

  return <section className="settings-detail" aria-label="จัดการผู้รับ LINE">
    <button className="text-button settings-back" onClick={back}>← กลับเมนูตั้งค่า</button>
    <section className="settings-panel">
      <small>เชื่อมต่อ Google Sheet ก่อน แล้วกรอก LINE User ID ของผู้รับที่ต้องการแจ้งเตือน</small>
      <label>LINE User ID<input value={lineUserId} onChange={event => onLineUserIdChange(event.target.value)} /></label>
      <button className="primary" onClick={onAddLineRecipient}>เพิ่มผู้รับ LINE</button>
      {lineRecipientError && <small role="alert">{lineRecipientError}</small>}
      {lineRecipients.map(recipient => <p key={recipient.id}>{recipient.recipient_id}</p>)}
    </section>
    <LineGroupSettings connection={googleProps?.connection} />
  </section>
}
