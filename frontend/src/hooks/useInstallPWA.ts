import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

declare global {
  interface Window {
    __pwaPrompt: BeforeInstallPromptEvent | null
  }
}

const DISMISS_KEY    = 'pwa-banner-dismissed-at'
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 jours

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  )
}

function detectIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as { MSStream?: unknown }).MSStream
}

function wasDismissedRecently() {
  const ts = localStorage.getItem(DISMISS_KEY)
  if (!ts) return false
  return Date.now() - parseInt(ts, 10) < DISMISS_TTL_MS
}

export function useInstallPWA() {
  // Initialiser depuis window.__pwaPrompt en cas d'event capturé avant React
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(
    () => window.__pwaPrompt ?? null
  )
  const [isInstalled, setIsInstalled]   = useState(() => isStandalone())
  const [dismissed,   setDismissedState] = useState(() => wasDismissedRecently())
  const isIOS = detectIOS()

  useEffect(() => {
    if (isStandalone()) { setIsInstalled(true); return }

    // Écouter l'event natif (si pas encore déclenché)
    const onPrompt = (e: Event) => {
      e.preventDefault()
      const bip = e as BeforeInstallPromptEvent
      window.__pwaPrompt = bip
      setPromptEvent(bip)
    }

    // Écouter notre custom event (si l'event a déjà été capturé par le script inline)
    const onReady = () => {
      if (window.__pwaPrompt) setPromptEvent(window.__pwaPrompt)
    }

    const onInstalled = () => {
      setIsInstalled(true)
      setPromptEvent(null)
      window.__pwaPrompt = null
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('pwa-prompt-ready',    onReady)
    window.addEventListener('appinstalled',        onInstalled)

    // Si l'event avait déjà été capturé avant ce useEffect
    if (window.__pwaPrompt) setPromptEvent(window.__pwaPrompt)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('pwa-prompt-ready',    onReady)
      window.removeEventListener('appinstalled',        onInstalled)
    }
  }, [])

  const install = async () => {
    if (!promptEvent) return false
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'accepted') {
      setPromptEvent(null)
      setIsInstalled(true)
      window.__pwaPrompt = null
    }
    return outcome === 'accepted'
  }

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
    setDismissedState(true)
    setPromptEvent(null)
    window.__pwaPrompt = null
  }

  return {
    // canInstall: vrai si pas dismissed, pas déjà installé, et (event dispo OU iOS)
    canInstall: !dismissed && !isInstalled && (!!promptEvent || isIOS),
    isInstalled,
    isIOS,
    install,
    dismiss,
  }
}
