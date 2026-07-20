import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App, { calculatePetAge, isValidCalendarDate, petLifeStage } from './App.jsx'

beforeEach(() => {
  window.localStorage.clear()
  window.history.replaceState({}, '', '/')
})

const state = overrides => ({ tracks: [], logs: [], activities: [], reminders: [], symptoms: [], pets: [{ id: 'p1', name: 'โมจิ', species: 'dog', gender: 'male' }], activePetId: 'p1', ...overrides })

describe('PetCare shell and restructuring', () => {
  it('keeps date and age helpers correct', () => {
    expect(isValidCalendarDate('2026-02-28')).toBe(true)
    expect(isValidCalendarDate('2026-02-29')).toBe(false)
    expect(calculatePetAge('2020-05-10', new Date(2026, 6, 17))).toEqual({ years: 6, months: 2, days: 7 })
    expect(petLifeStage({ years: 9, months: 0, days: 0 }).key).toBe('senior')
  })

  it('renders the four primary navigation destinations', () => {
    render(<App />)
    for (const name of ['หน้าหลัก', 'สมุดบันทึก', 'ประวัติการรักษา', 'ตั้งค่า']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'เตือน' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'ไดอารี่' })).toBeNull()
  })

  it('groups daily logs, notes, activities, and Track tags once, then edits a log in-app', async () => {
    window.localStorage.setItem('petcare.local.v1', JSON.stringify(state({
      logs: [
        { id: 'l1', pet_id: 'p1', datetime: '2026-07-17T08:00', symptom: 'ไอ', symptoms: ['ไอ', 'จาม'], diary: 'พัก', tracks: [{ id: 't1', name: 'ยา', dose: '1 เม็ด' }] },
        { id: 'l2', pet_id: 'p1', datetime: '2026-07-17T20:00', symptom: 'ไอ', symptoms: ['ไอ'], diary: 'สังเกตอาการ', tracks: [] },
      ],
      activities: [{ id: 'a1', pet_id: 'p1', datetime: '2026-07-17T09:00', activity_type: 'เดิน', note: '10 นาที' }],
    })))
    render(<App />)
    const day = screen.getByLabelText('รายการบันทึก')
    expect(day.textContent).toContain('ไอ')
    expect(day.textContent).toContain('เดิน')
    expect(day.textContent.match(/ยา/g)).toHaveLength(1)
    expect(day.textContent.indexOf('รายการที่เลือก')).toBeLessThan(day.textContent.indexOf('ไอ'))
    const sections = [...day.querySelectorAll('.daily-section')].map(section => section.querySelector('h3')?.textContent)
    expect(sections).toEqual(['กิจวัตร', 'อาการ', 'โน้ต'])
    expect(day.querySelector('.daily-symptoms').textContent).toContain('ไอ08:00, 20:00')
    expect(day.querySelector('.daily-symptoms').textContent).toContain('จาม08:00')
    fireEvent.click(within(day.querySelector('.daily-notes')).getAllByRole('button', { name: 'แก้ไข' })[0])
    const form = screen.getByRole('dialog', { name: 'ฟอร์มแก้ไขบันทึก' })
    fireEvent.change(within(form).getByLabelText('บันทึก'), { target: { value: 'แก้แล้ว' } })
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกการแก้ไข' }))
    await waitFor(() => expect(screen.getByLabelText('รายการบันทึก').textContent).toContain('แก้แล้ว'))
  })

  it('adds and edits Track items from Settings while preserving versions and active state', async () => {
    window.localStorage.setItem('petcare.local.v1', JSON.stringify(state({ tracks: [{ id: 't1', pet_id: 'p1', name: 'ยาเดิม', dose: '1', schedule: '08:00', active: true, version_id: 'v1' }] })))
    render(<App initialPage="settings" />)
    fireEvent.click(screen.getByRole('button', { name: /รายการที่ติดตาม/ }))
    fireEvent.click(screen.getByRole('button', { name: 'แก้ไข ยาเดิม' }))
    const form = screen.getByRole('dialog', { name: 'ฟอร์มรายการติดตาม' })
    fireEvent.change(within(form).getByLabelText('ชื่อรายการ'), { target: { value: 'ยาใหม่' } })
    fireEvent.change(within(form).getByLabelText('ขนาด/รายละเอียด'), { target: { value: '2' } })
    fireEvent.change(within(form).getByLabelText('เวลา/ความถี่'), { target: { value: '20:00' } })
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกการแก้ไข' }))
    fireEvent.click(screen.getByRole('button', { name: 'ปิดใช้งาน ยาใหม่' }))
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('petcare.local.v1'))
      expect(saved.tracks[0]).toMatchObject({ name: 'ยาใหม่', active: false })
      expect(saved.tracks[0].versions).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'ยาเดิม', active: false })]))
    })
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มรายการติดตาม/ }))
    expect(screen.getByRole('dialog', { name: 'ฟอร์มรายการติดตาม' })).toBeTruthy()
  })

  it('migrates unscoped legacy records and resets draft selections on pet switch', async () => {
    window.localStorage.setItem('petcare.local.v1', JSON.stringify({ ...state({ logs: [{ id: 'l1', datetime: '2026-07-17T08:00', symptom: 'legacy', tracks: [] }], tracks: [{ id: 't1', name: 'legacy', active: true, schedule: 'daily' }], symptoms: [{ id: 's1', label_th: 'legacy' }] }), pets: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }] }))
    render(<App />)
    await waitFor(() => expect(JSON.parse(localStorage.getItem('petcare.local.v1')).logs[0].pet_id).toBe('p1'))
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือก legacy' }))
    fireEvent.click(screen.getByRole('button', { name: 'จัดการโปรไฟล์สัตว์เลี้ยง' }))
    fireEvent.click(screen.getByRole('button', { name: /Two/ }))
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    expect(screen.queryByRole('checkbox', { name: 'เลือก legacy' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'จัดการโปรไฟล์สัตว์เลี้ยง' }))
    fireEvent.click(screen.getByRole('button', { name: /One/ }))
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    expect(screen.getByRole('checkbox', { name: 'เลือก legacy' }).checked).toBe(false)
  })

  it('uses app-native species icons and small gender accessories', () => {
    window.localStorage.setItem('petcare.local.v1', JSON.stringify(state({ pets: [{ id: 'cat', name: 'Cat', species: 'cat' }, { id: 'male', name: 'Male', species: 'dog', gender: 'male' }, { id: 'female', name: 'Female', species: 'dog', gender: 'female' }, { id: 'other', name: 'Other', species: 'other' }], activePetId: 'cat' })))
    render(<App />)
    expect(document.querySelector('.profile').textContent).toContain('🐱')
    expect(screen.getByRole('img', { name: 'ไอคอนของ Cat' }).textContent).toBe('🐱')
    fireEvent.click(screen.getByRole('button', { name: 'จัดการโปรไฟล์สัตว์เลี้ยง' }))
    fireEvent.click(screen.getByRole('button', { name: /Male/ }))
    expect(document.querySelector('.profile').textContent).toContain('🐶')
    expect(screen.getByRole('img', { name: 'ไอคอนของ Male' }).parentElement.textContent).toContain('👔')
    fireEvent.click(screen.getByRole('button', { name: 'จัดการโปรไฟล์สัตว์เลี้ยง' }))
    fireEvent.click(screen.getByRole('button', { name: /Female/ }))
    expect(screen.getByRole('img', { name: 'ไอคอนของ Female' }).parentElement.textContent).toContain('🎀')
    fireEvent.click(screen.getByRole('button', { name: 'จัดการโปรไฟล์สัตว์เลี้ยง' }))
    fireEvent.click(screen.getByRole('button', { name: /Other/ }))
    expect(screen.getAllByText('🐾').length).toBeGreaterThan(0)
  })

  it('keeps the profile-button fallback visible for unsupported species', () => {
    window.localStorage.setItem('petcare.local.v1', JSON.stringify(state({ pets: [{ id: 'other', name: 'Other', species: 'lizard' }], activePetId: 'other' })))
    render(<App />)
    expect(screen.getByRole('button', { name: 'จัดการโปรไฟล์สัตว์เลี้ยง' }).textContent).toContain('🐾')
  })

  it('gives duplicate symptom feedback and soft-deletes without changing historical logs', async () => {
    window.localStorage.setItem('petcare.local.v1', JSON.stringify(state({
      symptoms: [{ id: 's1', pet_id: 'p1', label_th: 'ไอ', active: true }, { id: 's2', pet_id: 'p1', label_th: 'ซ่อน', active: false }],
      logs: [{ id: 'l1', pet_id: 'p1', datetime: '2026-07-17T08:00', symptom: 'ซ่อน', symptoms: ['ซ่อน'], tracks: [] }],
    })))
    render(<App initialPage="settings" />)
    fireEvent.click(screen.getByRole('button', { name: 'จัดการอาการ' }))
    fireEvent.click(screen.getByRole('button', { name: /เพิ่มอาการ/ }))
    const form = screen.getByRole('dialog', { name: 'ฟอร์มจัดการอาการ' })
    fireEvent.change(within(form).getByLabelText('ชื่ออาการ'), { target: { value: 'ซ่อน' } })
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกอาการ' }))
    expect(within(form).getByRole('alert').textContent).toContain('มีอยู่แล้ว')

    fireEvent.change(within(form).getByLabelText('ชื่ออาการ'), { target: { value: 'ไข้' } })
    fireEvent.click(within(form).getByRole('button', { name: 'บันทึกอาการ' }))
    await waitFor(() => expect(JSON.parse(localStorage.getItem('petcare.local.v1')).symptoms).toEqual(expect.arrayContaining([expect.objectContaining({ label_th: 'ไข้', active: true })])))
    const addedRow = screen.getByText('ไข้').closest('article')
    fireEvent.click(within(addedRow).getByRole('button', { name: 'แก้ไข ไข้' }))
    const editForm = screen.getByRole('dialog', { name: 'ฟอร์มจัดการอาการ' })
    fireEvent.change(within(editForm).getByLabelText('ชื่ออาการ'), { target: { value: 'ไอ' } })
    fireEvent.click(within(editForm).getByRole('button', { name: 'บันทึกการแก้ไข' }))
    expect(within(editForm).getByRole('alert').textContent).toContain('มีอยู่แล้ว')
    fireEvent.change(within(editForm).getByLabelText('ชื่ออาการ'), { target: { value: 'ไข้ใหม่' } })
    fireEvent.click(within(editForm).getByRole('button', { name: 'บันทึกการแก้ไข' }))
    const row = screen.getByText('ไข้ใหม่').closest('article')
    fireEvent.click(within(row).getByRole('button', { name: 'ลบ ไข้ใหม่' }))
    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('petcare.local.v1'))
      expect(saved.symptoms).toEqual(expect.arrayContaining([expect.objectContaining({ label_th: 'ไข้ใหม่', active: false })]))
      expect(saved.logs).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'l1', symptom: 'ซ่อน' })]))
    })
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    expect(screen.queryByRole('button', { name: 'ซ่อน' })).toBeNull()
  })

  it('validates custom activity/treatment types and required reminder dates', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'สมุดบันทึก' }))
    fireEvent.click(screen.getByRole('button', { name: 'กิจวัตร' }))
    fireEvent.click(screen.getByRole('button', { name: /บันทึกกิจวัตร/ }))
    const activity = screen.getByLabelText('ฟอร์มกิจวัตร')
    fireEvent.change(within(activity).getByLabelText('ประเภทกิจวัตร'), { target: { value: 'อื่นๆ' } })
    expect(within(activity).getByLabelText('ระบุประเภท')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่า' }))
    fireEvent.click(screen.getByRole('button', { name: /การแจ้งเตือน/ }))
    fireEvent.click(screen.getByRole('button', { name: /สร้างการแจ้งเตือน/ }))
    const reminder = screen.getByRole('dialog', { name: 'ฟอร์มสร้างการแจ้งเตือน' })
    fireEvent.change(within(reminder).getByLabelText('ชื่อการแจ้งเตือน'), { target: { value: 'Vet' } })
    fireEvent.click(within(reminder).getByRole('button', { name: 'บันทึกการแจ้งเตือน' }))
    expect(within(reminder).getByRole('alert').textContent).toContain('วันที่')
  })
})
