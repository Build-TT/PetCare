import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ReminderForm from './ReminderForm.jsx'

describe('ReminderForm', () => {
  it('captures a recurring monthly reminder with a fixed day and time', () => {
    const onSave = vi.fn()
    render(<ReminderForm onSave={onSave} onCancel={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('ชื่อการแจ้งเตือน'), { target: { value: 'วัคซีน' } })
    fireEvent.change(screen.getByLabelText('วันครบกำหนด'), { target: { value: '2026-08-15' } })
    fireEvent.change(screen.getByLabelText('ความถี่'), { target: { value: 'recurring' } })
    fireEvent.change(screen.getByLabelText('ทุกกี่หน่วย'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('หน่วย'), { target: { value: 'month' } })
    fireEvent.change(screen.getByLabelText('รูปแบบการนับเดือน'), { target: { value: 'fixed_day' } })
    fireEvent.change(screen.getByLabelText('วันที่ของเดือน (1–31)'), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText('เวลาแจ้งเตือน'), { target: { value: '18:30' } })
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกการแจ้งเตือน' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      frequency: 'recurring', interval: 2, unit: 'month', monthMode: 'fixed_day', day: 15, time: '18:30',
    }))
  })

  it('prefills an existing reminder for editing', () => {
    render(<ReminderForm initialValue={{ title: 'เดิม', date: '2026-08-01', frequency: 'recurring', interval: 3, unit: 'day', time: '07:15' }} onSave={vi.fn()} onCancel={vi.fn()} />)

    expect(screen.getByLabelText('ชื่อการแจ้งเตือน').value).toBe('เดิม')
    expect(screen.getByLabelText('ทุกกี่หน่วย').value).toBe('3')
    expect(screen.getByLabelText('เวลาแจ้งเตือน').value).toBe('07:15')
  })
})
