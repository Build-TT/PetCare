import { useEffect, useState } from 'react'

export default function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState(null)
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
  const [visible, setVisible] = useState(false)
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const onBeforeInstall = event => {
      event.preventDefault()
      setInstallEvent(event)
    }
    const onInstalled = () => { setInstalled(true); setInstallEvent(null) }
    const timer = window.setTimeout(() => setVisible(true), 800)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.clearTimeout(timer); window.removeEventListener('beforeinstallprompt', onBeforeInstall); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  if (installed || !visible) return null

  const install = async () => {
    if (!installEvent) return setShowHelp(true)
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome !== 'accepted') setInstallEvent(null)
  }

  return <aside className="install-app-prompt" role="dialog" aria-label="ติดตั้ง PetCare"><span className="install-app-icon" aria-hidden="true"><img src="/assets/pets/pomeranian-male-tie.png" alt="" /></span><div><b>ติดตั้ง PetCare</b><small>{showHelp ? 'แตะเมนู ⋮ ของ Chrome แล้วเลือก “ติดตั้งแอป” หรือ “เพิ่มลงในหน้าจอหลัก”' : 'เปิดใช้งานได้เร็วจากหน้าจอมือถือ'}</small></div><button type="button" className="primary" onClick={install}>{installEvent ? 'ติดตั้ง' : 'วิธีติดตั้ง'}</button><button type="button" className="install-dismiss" aria-label="ปิดคำเชิญติดตั้ง" onClick={() => setVisible(false)}>×</button></aside>
}
