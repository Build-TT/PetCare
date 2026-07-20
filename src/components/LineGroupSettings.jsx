import { useEffect, useState } from 'react'

const LINE_GROUP_META_KEY = 'petcare.line-group.v1'

function storedGroup() {
  try { return JSON.parse(window.localStorage.getItem(LINE_GROUP_META_KEY) || 'null') } catch { return null }
}

export default function LineGroupSettings({ connection, onSelected }) {
  const [groups, setGroups] = useState([])
  const [selectedId, setSelectedId] = useState(storedGroup()?.groupId || '')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [savedMessage, setSavedMessage] = useState('')

  const loadGroups = async () => {
    if (!connection?.accessToken) return
    setLoading(true)
    setError('')
    setSavedMessage('')
    try {
      const response = await fetch('/api/line/groups', {
        headers: { Authorization: `Bearer ${connection.accessToken}` },
      })
      const body = await response.json()
      if (!response.ok || body.status === 'error') throw new Error(body.message || 'โหลด LINE Group ไม่สำเร็จ')
      setGroups(body.groups || [])
      if (body.selected_group_id) setSelectedId(body.selected_group_id)
    } catch (loadError) {
      setError(loadError.message || 'โหลด LINE Group ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGroups()
  }, [connection?.accessToken])

  const saveSelection = async () => {
    if (!selectedId || !connection?.accessToken) return
    setSaving(true)
    setError('')
    setSavedMessage('')
    try {
      const response = await fetch('/api/line/groups', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${connection.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ group_id: selectedId }),
      })
      const body = await response.json()
      if (!response.ok || body.status === 'error') throw new Error(body.message || 'บันทึก LINE Group ไม่สำเร็จ')
      const selected = (body.groups || []).find(group => group.group_id === body.selected_group_id)
      const metadata = {
        groupId: body.selected_group_id,
        groupName: selected?.group_name || 'LINE Group',
      }
      window.localStorage.setItem(LINE_GROUP_META_KEY, JSON.stringify(metadata))
      setGroups(body.groups || [])
      setSelectedId(body.selected_group_id)
      onSelected?.(metadata)
      setSavedMessage('บันทึกกลุ่มนี้เป็นผู้รับแจ้งเตือนแล้ว')
    } catch (saveError) {
      setError(saveError.message || 'บันทึก LINE Group ไม่สำเร็จ')
    } finally {
      setSaving(false)
    }
  }

  return <section className="line-group-settings" aria-labelledby="line-group-title">
    <div className="line-group-heading">
      <div><h2 id="line-group-title">LINE Group สำหรับแจ้งเตือน</h2><small>เลือกกลุ่มที่จะรับข้อความจาก PetCare</small></div>
      {connection?.accessToken && <button type="button" className="text-button" onClick={loadGroups} disabled={loading}>รีเฟรช</button>}
    </div>

    {!connection?.accessToken && <div className="line-group-empty"><b>เชื่อม Google ก่อนจัดการกลุ่ม</b><p>กดเชื่อม Google ใหม่ด้านบนเพื่อยืนยันตัวตน แล้วรายการ Group จะปรากฏที่นี่</p></div>}
    {connection?.accessToken && loading && <p className="line-group-status">กำลังโหลด LINE Group…</p>}
    {connection?.accessToken && !loading && groups.length === 0 && <div className="line-group-empty"><b>ยังไม่พบ LINE Group</b><p>เชิญ Official Account เข้า Group และส่งข้อความ 1 ครั้ง แล้วกดรีเฟรช</p></div>}
    {groups.length > 0 && <div className="line-group-list">{groups.map(group => <label className={`line-group-option ${selectedId === group.group_id ? 'selected' : ''}`} key={group.group_id}>
      <input type="radio" name="line-group" value={group.group_id} checked={selectedId === group.group_id} onChange={() => setSelectedId(group.group_id)} />
      <span className="line-group-avatar" aria-hidden="true">{group.picture_url ? <img src={group.picture_url} alt="" /> : 'LINE'}</span>
      <span><b>{group.group_name}</b><small>Group ID ลงท้าย {group.group_id.slice(-6)}</small></span>
    </label>)}</div>}
    {groups.length > 0 && <button type="button" className="primary" onClick={saveSelection} disabled={!selectedId || saving}>{saving ? 'กำลังบันทึก…' : 'ใช้กลุ่มนี้รับการแจ้งเตือน'}</button>}
    {savedMessage && <small role="status" className="line-group-success">{savedMessage}</small>}
    {error && <small role="alert" className="line-group-error">{error}</small>}
  </section>
}
