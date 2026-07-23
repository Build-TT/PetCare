import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App.jsx'

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

describe('PetCare restructuring flows', () => {
  it('keeps Settings overview and each detail route structurally isolated', () => {
    render(<App initialPage="settings" />)

    expect(screen.getByRole('button', { name: /Google Sheet/ })).toBeTruthy()
    expect(screen.queryByLabelText('Google Sheet connection')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Google Sheet/ }))
    expect(screen.getByLabelText('Google Sheet connection')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /จัดการอาการ/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /กลับเมนูตั้งค่า/ }))

    fireEvent.click(screen.getByRole('button', { name: /จัดการอาการ/ }))
    expect(screen.getByLabelText('จัดการอาการ')).toBeTruthy()
    expect(screen.queryByLabelText('Google Sheet connection')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /กลับเมนูตั้งค่า/ }))

    fireEvent.click(screen.getByRole('button', { name: /รายการที่ติดตาม/ }))
    expect(screen.getByLabelText('จัดการรายการติดตาม')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /กลับเมนูตั้งค่า/ }))

    fireEvent.click(screen.getByRole('button', { name: /ผู้รับ LINE/ }))
    expect(screen.getByLabelText('จัดการผู้รับ LINE')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /กลับเมนูตั้งค่า/ }))

    expect(screen.getByRole('button', { name: /การแจ้งเตือน/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /การแจ้งเตือน/ }))
    expect(screen.getByRole('heading', { level: 2, name: 'แจ้งเตือน' })).toBeTruthy()
    expect(screen.queryByLabelText('Google Sheet connection')).toBeNull()
  })

  it('preserves Track drafts when switching between main Track and Settings Tracking', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มรายการติดตาม/ }))
    const mainForm = screen.getByLabelText('ฟอร์มรายการติดตาม')
    fireEvent.change(within(mainForm).getByLabelText('ชื่อรายการ'), { target: { value: 'main draft' } })

    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    fireEvent.click(screen.getByRole('button', { name: /รายการที่ติดตาม/ }))
    expect(screen.getByLabelText('ฟอร์มรายการติดตาม')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มรายการติดตาม/ }))
    expect(within(screen.getByLabelText('ฟอร์มรายการติดตาม')).getByLabelText('ชื่อรายการ').value).toBe('main draft')

    fireEvent.change(within(screen.getByLabelText('ฟอร์มรายการติดตาม')).getByLabelText('ชื่อรายการ'), { target: { value: 'settings draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    expect(screen.getByLabelText('ฟอร์มรายการติดตาม')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มรายการติดตาม/ }))
    expect(within(screen.getByLabelText('ฟอร์มรายการติดตาม')).getByLabelText('ชื่อรายการ').value).toBe('settings draft')
  })

  it('preserves Symptom drafts when switching between main Track and Settings Symptoms', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มอาการ/ }))
    const mainForm = screen.getByLabelText('ฟอร์มเพิ่มอาการ')
    fireEvent.change(within(mainForm).getByLabelText('ชื่ออาการ'), { target: { value: 'main symptom draft' } })

    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    fireEvent.click(screen.getByRole('button', { name: 'จัดการอาการ' }))
    expect(screen.getByLabelText('ฟอร์มจัดการอาการ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มอาการ/ }))
    expect(within(screen.getByLabelText('ฟอร์มจัดการอาการ')).getByLabelText('ชื่ออาการ').value).toBe('main symptom draft')

    fireEvent.change(within(screen.getByLabelText('ฟอร์มจัดการอาการ')).getByLabelText('ชื่ออาการ'), { target: { value: 'settings symptom draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    expect(screen.getByLabelText('ฟอร์มเพิ่มอาการ')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มอาการ/ }))
    expect(within(screen.getByLabelText('ฟอร์มเพิ่มอาการ')).getByLabelText('ชื่ออาการ').value).toBe('settings symptom draft')
  })

  it('uses Track selections as a per-log snapshot without changing active metadata', async () => {
    window.localStorage.setItem('petcare.local.v1', JSON.stringify({
      tracks: [{ id: 't1', pet_id: 'p1', name: 'Medicine', active: true, schedule: '08:00' }, { id: 't2', pet_id: 'p1', name: 'Water', active: true, schedule: 'daily' }],
      symptoms: [{ id: 's1', pet_id: 'p1', label_th: 'Cough', active: true }], logs: [], activities: [], reminders: [], pets: [{ id: 'p1', name: 'Mochi' }], activePetId: 'p1',
    }))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    expect(screen.getByRole('checkbox', { name: 'เลือก Medicine' })).toHaveProperty('checked', true)
    fireEvent.click(screen.getByRole('button', { name: 'Cough' }))
    fireEvent.change(screen.getByPlaceholderText('เพิ่มบันทึกไดอารี่ (ไม่บังคับ)'), { target: { value: 'note' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกอาการและ Track' }))
    await waitFor(() => {
      const saved = JSON.parse(window.localStorage.getItem('petcare.local.v1'))
      expect(saved.tracks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 't1', active: true }), expect.objectContaining({ id: 't2', active: true })]))
      expect(saved.logs[0].tracks).toEqual(expect.arrayContaining([expect.objectContaining({ id: 't1' })]))
    })
  })

  it('groups logs and activities together on Home and removes Summary from Track', () => {
    window.localStorage.setItem('petcare.local.v1', JSON.stringify({
      tracks: [], symptoms: [], reminders: [], pets: [{ id: 'p1', name: 'Mochi' }], activePetId: 'p1',
      logs: [{ id: 'l1', pet_id: 'p1', datetime: '2026-07-17T08:00', symptom: 'Cough', diary: 'rest', tracks: [] }],
      activities: [{ id: 'a1', pet_id: 'p1', datetime: '2026-07-17T09:00', activity_type: 'เดิน', note: '10 min' }],
    }))
    render(<App />)
    expect(screen.getByLabelText('รายการบันทึก').textContent).toContain('Cough')
    expect(screen.getByLabelText('รายการบันทึก').textContent).toContain('เดิน')
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    expect(screen.queryByRole('button', { name: 'Summary' })).toBeNull()
    expect(screen.getByRole('button', { name: 'กิจวัตร' })).toBeTruthy()
  })

  it('creates reminders in an in-app validated form without browser prompts', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    fireEvent.click(screen.getByRole('button', { name: /การแจ้งเตือน/ }))
    fireEvent.click(screen.getByRole('button', { name: '＋ สร้างการแจ้งเตือน' }))
    const form = screen.getByRole('dialog', { name: 'ฟอร์มสร้างการแจ้งเตือน' })
    fireEvent.change(within(form).getByLabelText('ชื่อการแจ้งเตือน'), { target: { value: 'Vet visit' } })
    fireEvent.change(within(form).getByLabelText('วันครบกำหนด'), { target: { value: '2026-08-01' } })
    fireEvent.change(within(form).getByLabelText('ความถี่'), { target: { value: 'ครั้งเดียว' } })
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกการแจ้งเตือน' }))
    await waitFor(() => expect(JSON.parse(window.localStorage.getItem('petcare.local.v1')).reminders[0]).toMatchObject({ title: 'Vet visit', enabled: true }))
  })
})
