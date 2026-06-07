// helper สำหรับ touch target ใน LIFF/Android — onClick อาจถูกบล็อกในแอป LINE
// จึงผูกทั้ง onClick และ onTouchEnd (แพตเทิร์นเดียวกับระบบเดิม)
export function tap(handler) {
  return {
    onClick: handler,
    onTouchEnd: (e) => { e.preventDefault(); handler(e) },
  }
}

// สีประจำสัตว์เลี้ยง (วนใช้ตามลำดับ)
export const PET_COLORS = ['#16a34a', '#0ea5e9', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444']

// สไตล์กลางที่หลายหน้าใช้ร่วมกัน (inline styles เท่านั้น เหมือนระบบเดิม)
export const S = {
  page: { padding: '12px 14px 80px' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 14, paddingTop: 6,
  },
  title: { fontSize: 20, fontWeight: 700, margin: 0, color: '#0f172a' },
  card: {
    background: '#fff', borderRadius: 14, padding: 14, marginBottom: 10,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  },
  label: { display: 'block', fontSize: 13, color: '#64748b', marginBottom: 6, marginTop: 12 },
  input: {
    width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #cbd5e1',
    background: '#fff', outline: 'none',
  },
  textarea: {
    width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #cbd5e1',
    background: '#fff', outline: 'none', minHeight: 70, resize: 'vertical',
  },
  primary: {
    width: '100%', padding: '13px', borderRadius: 12, border: 'none',
    background: '#16a34a', color: '#fff', fontWeight: 700, fontSize: 16, marginTop: 18,
  },
  ghost: {
    padding: '8px 14px', borderRadius: 10, border: '1px solid #cbd5e1',
    background: '#fff', color: '#475569', fontSize: 14,
  },
  danger: {
    padding: '8px 12px', borderRadius: 10, border: '1px solid #fecaca',
    background: '#fef2f2', color: '#dc2626', fontSize: 14,
  },
  chip: (active) => ({
    padding: '9px 14px', borderRadius: 999, fontSize: 14,
    border: active ? '2px solid #16a34a' : '1px solid #cbd5e1',
    background: active ? '#dcfce7' : '#fff',
    color: active ? '#166534' : '#475569', fontWeight: active ? 700 : 400,
  }),
  row: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  muted: { color: '#94a3b8', fontSize: 14 },
  toast: {
    position: 'fixed', bottom: 76, left: '50%', transform: 'translateX(-50%)',
    background: '#0f172a', color: '#fff', padding: '10px 18px', borderRadius: 999,
    fontSize: 14, zIndex: 100, maxWidth: '90%',
  },
}
