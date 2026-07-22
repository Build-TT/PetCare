import { useEffect, useState } from 'react'

export default function InstallAppPrompt() {
  const [installEvent, setInstallEvent] = useState(null)
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

  useEffect(() => {
    const onBeforeInstall = event => {
      event.preventDefault()
      setInstallEvent(event)
    }
    const onInstalled = () => { setInstalled(true); setInstallEvent(null) }
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onBeforeInstall); window.removeEventListener('appinstalled', onInstalled) }
  }, [])

  if (installed || !installEvent) return null

  const install = async () => {
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome !== 'accepted') setInstallEvent(null)
  }

  return <aside className="install-app-prompt" role="dialog" aria-label="ติดตั้ง PetCare"><span className="install-app-icon" aria-hidden="true"><img src="/assets/pets/pomeranian-male-tie.png" alt="" /></span><div><b>ติดตั้ง PetCare</b><small>เปิดใช้งานได้เร็วจากหน้าจอมือถือ</small></div><button type="button" className="primary" onClick={install}>ติดตั้ง</button><button type="button" className="install-dismiss" aria-label="ปิดคำเชิญติดตั้ง" onClick={() => setInstallEvent(null)}>×</button></aside>
}
