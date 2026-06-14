/**
 * Hook Web Serial API pour imprimantes thermiques ESC/POS
 *
 * Compatibilité : Chrome 89+, Edge 89+, Opera 76+
 * Fonctionne avec : imprimantes USB-Serial (Epson TM, Star TSP, Xprinter, Bixolon...)
 *
 * Persistance : le port est mémorisé entre sessions via getPort()
 */

import { useState, useCallback, useEffect } from 'react'
import {
  DEFAULT_THERMAL_CONFIG,
  type ThermalConfig,
  buildPosReceipt,
  buildInvoiceReceipt,
  type ReceiptData,
  type InvoicePrintData,
} from '../lib/thermal-receipt'

// ── Stockage config ──────────────────────────────────────────────────────────

const CONFIG_KEY = 'sc_thermal_config'

export function loadThermalConfig(): ThermalConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...DEFAULT_THERMAL_CONFIG, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...DEFAULT_THERMAL_CONFIG }
}

export function saveThermalConfig(cfg: ThermalConfig) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg))
}

// ── Types ────────────────────────────────────────────────────────────────────

export type PrinterStatus = 'disconnected' | 'connecting' | 'connected' | 'printing' | 'error'

interface UseThermalPrinterReturn {
  isSupported: boolean
  status: PrinterStatus
  error: string | null
  config: ThermalConfig
  connect: () => Promise<boolean>
  disconnect: () => Promise<void>
  updateConfig: (patch: Partial<ThermalConfig>) => void
  printReceipt: (data: ReceiptData) => Promise<boolean>
  printInvoice: (data: InvoicePrintData) => Promise<boolean>
  printRaw: (bytes: Uint8Array) => Promise<boolean>
  testPrint: () => Promise<boolean>
}

// ── Déclarations Web Serial API ──────────────────────────────────────────────

declare global {
  interface Navigator {
    serial?: {
      requestPort(options?: object): Promise<SerialPort>
      getPorts(): Promise<SerialPort[]>
      addEventListener(type: string, listener: EventListener): void
    }
  }
  interface SerialPort {
    open(options: { baudRate: number }): Promise<void>
    close(): Promise<void>
    readable: ReadableStream<Uint8Array> | null
    writable: WritableStream<Uint8Array> | null
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useThermalPrinter(): UseThermalPrinterReturn {
  const isSupported = typeof navigator !== 'undefined' && !!navigator.serial

  const [status, setStatus]   = useState<PrinterStatus>('disconnected')
  const [error, setError]     = useState<string | null>(null)
  const [port, setPort]       = useState<SerialPort | null>(null)
  const [config, setConfigState] = useState<ThermalConfig>(loadThermalConfig)

  // Tenter reconnexion auto sur les ports déjà autorisés
  useEffect(() => {
    if (!isSupported || port) return
    navigator.serial!.getPorts().then(ports => {
      if (ports.length > 0 && !port) {
        // Port déjà autorisé — reconnexion silencieuse
        reconnectPort(ports[0])
      }
    }).catch(() => { /* ignore */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported])

  const reconnectPort = useCallback(async (p: SerialPort) => {
    try {
      setStatus('connecting')
      await p.open({ baudRate: 9600 })
      setPort(p)
      setStatus('connected')
      setError(null)
    } catch {
      setStatus('disconnected')
    }
  }, [])

  const connect = useCallback(async (): Promise<boolean> => {
    if (!isSupported) {
      setError('Web Serial API non supporté. Utilisez Chrome ou Edge.')
      return false
    }
    try {
      setStatus('connecting')
      setError(null)
      const p = await navigator.serial!.requestPort({ filters: [] })
      await p.open({ baudRate: 9600 })
      setPort(p)
      setStatus('connected')
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Connexion impossible'
      if (msg.includes('cancelled') || msg.includes('No port')) {
        setStatus('disconnected') // L'utilisateur a annulé
      } else {
        setStatus('error')
        setError(msg)
      }
      return false
    }
  }, [isSupported])

  const disconnect = useCallback(async () => {
    if (!port) return
    try {
      await port.close()
    } catch { /* ignore */ }
    setPort(null)
    setStatus('disconnected')
  }, [port])

  const printRaw = useCallback(async (bytes: Uint8Array): Promise<boolean> => {
    if (!port || !port.writable) {
      setError('Imprimante non connectée')
      return false
    }
    try {
      setStatus('printing')
      const writer = port.writable.getWriter()
      await writer.write(bytes)
      writer.releaseLock()
      setStatus('connected')
      return true
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur impression'
      setStatus('error')
      setError(msg)
      return false
    }
  }, [port])

  const printReceipt = useCallback(async (data: ReceiptData): Promise<boolean> => {
    const bytes = buildPosReceipt(data, config)
    return printRaw(bytes)
  }, [config, printRaw])

  const printInvoice = useCallback(async (data: InvoicePrintData): Promise<boolean> => {
    const bytes = buildInvoiceReceipt(data, config)
    return printRaw(bytes)
  }, [config, printRaw])

  const testPrint = useCallback(async (): Promise<boolean> => {
    const { EscPosBuilder } = await import('../lib/escpos')
    const p = new EscPosBuilder(config.paperWidth)
    p.align('center')
    p.size('big').bold(true).line('TEST IMPRESSION')
    p.size('normal').bold(false)
    p.separator()
    p.line('Baobab SmartCommerce')
    p.line('Imprimante : OK')
    p.line(`Papier : ${config.paperWidth}mm`)
    p.line(new Date().toLocaleString('fr-SN'))
    p.separator()
    p.lf(3)
    if (config.autoCut) p.cut()
    return printRaw(p.buffer)
  }, [config, printRaw])

  const updateConfig = useCallback((patch: Partial<ThermalConfig>) => {
    setConfigState(prev => {
      const next = { ...prev, ...patch }
      saveThermalConfig(next)
      return next
    })
  }, [])

  return {
    isSupported,
    status,
    error,
    config,
    connect,
    disconnect,
    updateConfig,
    printReceipt,
    printInvoice,
    printRaw,
    testPrint,
  }
}
