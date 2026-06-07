// i18n อย่างง่าย — th (default) / en, เก็บภาษาใน localStorage['lang']
// setLang() ยิง event 'langchange' ให้ component subscribe แล้ว re-render

export function getLang() {
  return localStorage.getItem('lang') || 'th'
}

export function setLang(lang) {
  localStorage.setItem('lang', lang)
  window.dispatchEvent(new Event('langchange'))
}

export function t(key, lang = getLang()) {
  const dict = T[key]
  if (!dict) return key
  return dict[lang] || dict.th || key
}

// hook: ใช้ใน component เพื่อ re-render เมื่อเปลี่ยนภาษา
import { useEffect, useState } from 'react'
export function useLang() {
  const [lang, setL] = useState(getLang())
  useEffect(() => {
    const h = () => setL(getLang())
    window.addEventListener('langchange', h)
    return () => window.removeEventListener('langchange', h)
  }, [])
  return lang
}

export const T = {
  // ทั่วไป
  app_name:   { th: 'PetCare',            en: 'PetCare' },
  home:       { th: 'หน้าหลัก',          en: 'Home' },
  add_log:    { th: 'บันทึก',            en: 'Log' },
  meds:       { th: 'ยา',                en: 'Meds' },
  pets:       { th: 'สัตว์เลี้ยง',       en: 'Pets' },
  save:       { th: 'บันทึก',            en: 'Save' },
  cancel:     { th: 'ยกเลิก',            en: 'Cancel' },
  edit:       { th: 'แก้ไข',             en: 'Edit' },
  delete:     { th: 'ลบ',                en: 'Delete' },
  confirm_delete: { th: 'ยืนยันการลบ?',   en: 'Confirm delete?' },
  add:        { th: 'เพิ่ม',             en: 'Add' },
  back:       { th: 'กลับ',              en: 'Back' },
  loading:    { th: 'กำลังโหลด…',         en: 'Loading…' },
  saving:     { th: 'กำลังบันทึก…',       en: 'Saving…' },
  saved:      { th: 'บันทึกแล้ว ✓',       en: 'Saved ✓' },
  error:      { th: 'เกิดข้อผิดพลาด',     en: 'Something went wrong' },
  none:       { th: 'ยังไม่มีข้อมูล',     en: 'No data yet' },
  refresh:    { th: 'รีเฟรช',            en: 'Refresh' },
  optional:   { th: '(ไม่บังคับ)',        en: '(optional)' },
  all:        { th: 'ทั้งหมด',           en: 'All' },

  // pets
  pet_name:   { th: 'ชื่อ',              en: 'Name' },
  species:    { th: 'ชนิด',              en: 'Species' },
  breed:      { th: 'สายพันธุ์',         en: 'Breed' },
  birthdate:  { th: 'วันเกิด',           en: 'Birthdate' },
  add_pet:    { th: 'เพิ่มสัตว์เลี้ยง',   en: 'Add pet' },
  no_pets:    { th: 'ยังไม่มีสัตว์เลี้ยง กดเพิ่มได้เลย', en: 'No pets yet — add one' },
  dog:        { th: 'สุนัข',             en: 'Dog' },
  cat:        { th: 'แมว',               en: 'Cat' },
  other_pet:  { th: 'อื่นๆ',             en: 'Other' },

  // log
  choose_pet: { th: 'เลือกสัตว์เลี้ยง',   en: 'Choose pet' },
  log_type:   { th: 'ประเภท',            en: 'Type' },
  datetime:   { th: 'วันและเวลา',         en: 'Date & time' },
  detail:     { th: 'รายละเอียด',         en: 'Detail' },
  detail_ph:  { th: 'เช่น ฉี่เหลืองมาก, ขี้เหลว', en: 'e.g. dark yellow pee, loose stool' },
  recent_logs:{ th: 'บันทึกล่าสุด',       en: 'Recent logs' },
  quick_log:  { th: 'บันทึกเร็ว',         en: 'Quick log' },
  history:    { th: 'ประวัติ',           en: 'History' },

  // log types (label เริ่มต้น เผื่อชีตยังไม่ได้ seed)
  type_med:     { th: 'ให้ยา',           en: 'Medicine' },
  type_pee:     { th: 'ฉี่',             en: 'Pee' },
  type_poop:    { th: 'ขี้',             en: 'Poop' },
  type_vaccine: { th: 'วัคซีน',          en: 'Vaccine' },
  type_checkup: { th: 'ตรวจสุขภาพ',      en: 'Checkup' },
  type_symptom: { th: 'อาการ',           en: 'Symptom' },

  // meds
  med_name:     { th: 'ชื่อยา',          en: 'Medicine name' },
  dose:         { th: 'ขนาด/ปริมาณ',     en: 'Dose' },
  add_med:      { th: 'เพิ่มตารางยา',     en: 'Add schedule' },
  schedule:     { th: 'รอบการให้ยา',      en: 'Schedule' },
  remind_time:  { th: 'เวลาแจ้งเตือน',    en: 'Reminder time' },
  start_date:   { th: 'เริ่มวันที่',      en: 'Start date' },
  next_due:     { th: 'ครั้งถัดไป',       en: 'Next due' },
  taken:        { th: 'กินแล้ว',          en: 'Mark taken' },
  due_today:    { th: 'ถึงกำหนดวันนี้',   en: 'Due today' },
  no_meds:      { th: 'ยังไม่มีตารางยา',   en: 'No schedules yet' },

  // schedule types
  sched_daily:         { th: 'ทุกวัน',                  en: 'Every day' },
  sched_monthly:       { th: 'ทุกเดือน (วันที่กำหนด)',   en: 'Monthly (on day)' },
  sched_every_n_months:{ th: 'ทุกๆ N เดือน',           en: 'Every N months' },
  sched_cycle:         { th: 'กินกี่วันเว้นกี่วัน',      en: 'Cycle (on/off days)' },
  day_of_month:        { th: 'วันที่ของเดือน',          en: 'Day of month' },
  every_months:        { th: 'ทุกๆ กี่เดือน',           en: 'Every how many months' },
  days_on:             { th: 'กินกี่วัน',               en: 'Days on' },
  days_off:            { th: 'เว้นกี่วัน',              en: 'Days off' },
  reminder_note:       { th: 'การแจ้งเตือนจะส่งเข้า LINE อัตโนมัติ', en: 'Reminders are sent to LINE automatically' },
}
