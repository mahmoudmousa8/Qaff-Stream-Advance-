'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { DebouncedInput } from '@/components/ui/debounced-input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Play, Square, Clock, RotateCcw, Save, RefreshCw,
  Sun, Moon, Calendar, AlertCircle,
  Loader2, ChevronLeft, ChevronRight, FolderOpen, Activity, HardDrive,
  Film, Globe, LogOut, Copy, Check, FileText, Wifi, Search, Settings, Trash2, Youtube, X
} from 'lucide-react'
import Image from 'next/image'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { VideoManager } from '@/components/video-manager'
import { DateTimePicker } from '@/components/date-time-picker'
import { t, getLocale, setLocale, isRTL, type Locale } from '@/lib/i18n'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

// ── RTMP base URLs ────────────────────────────────────────────────────────────
const RTMP_BASES: Record<string, string> = {
  youtube: 'rtmp://a.rtmp.youtube.com/live2',
  facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
}

interface StreamSlot {
  id: string
  slotIndex: number
  channelName: string
  outputType: string
  streamKey: string
  rtmpServer: string
  filePath: string
  schedStart: string
  schedStop: string
  daily: boolean
  weekly: boolean
  isScheduled: boolean
  nextRunTime: string
  status: string
  isRunning: boolean
  inputType?: 'file' | 'live'
  liveInputUrl?: string
  muteAudio?: boolean
  audioVolume?: number
  audioFilePath?: string
  overlayText?: string
  overlayTextRight?: string
  overlayTextLeft?: string
  overlayTextEnabled?: boolean
  swapVideoPath?: string
  swapVideoEnabled?: boolean
  youtubeChannelId?: string | null
  youtubeTitle?: string | null
  youtubeDescription?: string | null
  youtubeThumbnailPath?: string | null
}

interface LogEntry {
  id: string
  message: string
  timestamp: string
}

interface ChannelLogsState {
  slotIndex: number
  logs: LogEntry[]
  ramPercent: number
  bitrateMbps: number
  loading: boolean
}

const SLOTS_PER_PAGE = 100

// Ã¢â€â‚¬Ã¢â€â‚¬ Copy to clipboard helper Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function useCopyToClipboard() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = text
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    })
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 1500)
  }
  return { copy, copiedKey }
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Copy Button component Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function CopyButton({ text, id, title, className }: { text: string; id: string; title?: string; className?: string }) {
  const { copy, copiedKey } = useCopyToClipboard()
  const isCopied = copiedKey === id
  return (
    <Button
      size="sm"
      variant="ghost"
      className={className || "h-6 w-6 p-0 shrink-0 hover:bg-muted"}
      onClick={() => copy(text, id)}
      title={title || t('copy')}
      disabled={!text}
    >
      {isCopied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
    </Button>
  )
}

// ── Scheduling time helpers ──────────────────────────────────────────
function parse24hTime(schedValue: string): { hour: number; minute: number } {
  const timeStr = schedValue ? (schedValue.split(' ')[1] || '') : ''
  const [rawH, rawM] = timeStr.split(':').map(Number)
  return { hour: isNaN(rawH) ? 0 : rawH, minute: isNaN(rawM) ? 0 : rawM }
}

function to12h(hour24: number): { hour12: number; ampm: 'AM' | 'PM' } {
  const ampm: 'AM' | 'PM' = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = (hour24 % 12) || 12
  return { hour12, ampm }
}

function to24h(hour12: number, ampm: 'AM' | 'PM'): number {
  if (ampm === 'AM') return hour12 === 12 ? 0 : hour12
  return hour12 === 12 ? 12 : hour12 + 12
}

function buildStopDateTime(schedStart: string, hour: number, minute: number): string {
  const base = schedStart || ''
  const datePart = base.split(' ')[0] || (() => {
    const n = new Date()
    return `${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()
  const timePart = base.split(' ')[1] || '00:00'
  const [startH, startM] = timePart.split(':').map(Number)
  const startMins = (isNaN(startH) ? 0 : startH) * 60 + (isNaN(startM) ? 0 : startM)
  const stopMins = hour * 60 + minute
  let finalDate = datePart
  if (stopMins <= startMins && datePart) {
    const [mm, dd] = datePart.split('-').map(Number)
    const yr = new Date().getFullYear()
    const d = new Date(yr, (isNaN(mm) ? 1 : mm) - 1, (isNaN(dd) ? 1 : dd) + 1)
    finalDate = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return `${finalDate} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// Build stop datetime by adding a duration (durH hours + durM minutes) to schedStart
function buildStopByDuration(schedStart: string, durH: number, durM: number): string {
  if (!schedStart) return `DUR ${String(durH).padStart(2, '0')}:${String(durM).padStart(2, '0')}`

  let baseDate = new Date()
  
  const [dPart, tPart] = schedStart.split(' ')
  if (dPart && tPart) {
    const yr = baseDate.getFullYear()
    const [mm, dd] = dPart.split('-').map(Number)
    const [hh, min] = tPart.split(':').map(Number)
    const utcMs = Date.UTC(yr, isNaN(mm)?1:(mm - 1), isNaN(dd)?1:dd, isNaN(hh)?0:hh, isNaN(min)?0:min)
    baseDate = new Date(utcMs + (durH * 60 + durM) * 60000)
    
    // We must format back from UTC parts because we tricked it into UTC
    const fMonth = String(baseDate.getUTCMonth() + 1).padStart(2, '0')
    const fDate = String(baseDate.getUTCDate()).padStart(2, '0')
    const fH = String(baseDate.getUTCHours()).padStart(2, '0')
    const fM = String(baseDate.getUTCMinutes()).padStart(2, '0')
    return `${fMonth}-${fDate} ${fH}:${fM}`
  }
  
  baseDate.setSeconds(0, 0)
  baseDate.setMinutes(baseDate.getMinutes() + durH * 60 + durM)
  const fMonth = String(baseDate.getMonth() + 1).padStart(2, '0')
  const fDate = String(baseDate.getDate()).padStart(2, '0')
  const fH = String(baseDate.getHours()).padStart(2, '0')
  const fM = String(baseDate.getMinutes()).padStart(2, '0')
  return `${fMonth}-${fDate} ${fH}:${fM}`
}

// Get current duration in {h, m} from schedStart and schedStop
function getDuration(schedStart: string, schedStop: string): { h: number; m: number } {
  if (!schedStop) return { h: -1, m: -1 }
  
  if (!schedStart && schedStop.startsWith('DUR ')) {
    const [hStr, mStr] = schedStop.replace('DUR ', '').split(':')
    return { h: parseInt(hStr || '0'), m: parseInt(mStr || '0') }
  }

  const parseDateUTC = (s: string) => {
    const d = new Date()
    if (!s) {
      d.setSeconds(0, 0)
      return d.getTime()
    }
    const [dPart, tPart] = s.split(' ')
    if (dPart && tPart) {
      const yr = d.getFullYear()
      const [mm, dd] = dPart.split('-').map(Number)
      const [hh, min] = tPart.split(':').map(Number)
      return Date.UTC(yr, (isNaN(mm)?1:mm) - 1, isNaN(dd)?1:dd, isNaN(hh)?0:hh, isNaN(min)?0:min)
    }
    d.setSeconds(0, 0)
    return d.getTime()
  }
  
  const startMs = parseDateUTC(schedStart)
  const stopMs = parseDateUTC(schedStop)
  let diffMins = Math.round((stopMs - startMs) / 60000)

  if (diffMins < -100000) {
    // Handling cross-year difference (like Dec 31 to Jan 1 but parsed under same year)
    const yr = new Date().getFullYear()
    const isLeap = ((yr % 4 === 0) && (yr % 100 !== 0)) || (yr % 400 === 0)
    diffMins += (isLeap ? 366 : 365) * 1440
  }
  if (diffMins < 0) diffMins += 1440
  
  return { h: Math.floor(diffMins / 60), m: diffMins % 60 }
}

function StreamSlotsSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {/* Desktop Table Skeleton */}
      <div className="hidden xl:block">
        <div className="border border-border/60 rounded-lg overflow-hidden bg-card">
          <div className="bg-muted/50 p-3 border-b border-border flex gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-5 flex-1" />
            ))}
          </div>
          <div className="divide-y divide-border/40">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="p-4 flex gap-4 items-center">
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-[2]" />
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-[1.5]" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Mobile Cards Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 xl:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="border border-border/60">
            <CardHeader className="p-3 border-b border-border/50 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-8" />
                <Skeleton className="h-5 w-20" />
              </div>
              <Skeleton className="h-5 w-16" />
            </CardHeader>
            <CardContent className="p-3.5 space-y-3">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-8 flex-1" />
                <Skeleton className="h-8 flex-1" />
              </div>
              <div className="flex justify-between items-center pt-2">
                <Skeleton className="h-8 w-24" />
                <div className="flex gap-1">
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                  <Skeleton className="h-8 w-8 rounded-md" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<{ role: 'admin' | 'user'; slotsLimit: number; securityKey: string } | null>(null)
  const [slots, setSlots] = useState<StreamSlot[]>([])
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'scheduled'>('all')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [autoSave, setAutoSave] = useState(true)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalSlots, setTotalSlots] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [stats, setStats] = useState({ streaming: 0, scheduled: 0, stopped: 0, configured: 0, dailyCount: 0, weeklyCount: 0, renewalDate: null as string | null })

  const filteredSlots = slots.filter(slot => {
    if (filterStatus === 'active') return slot.isRunning
    if (filterStatus === 'scheduled') return slot.isScheduled
    return true
  })
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; action: string; onConfirm: () => void } | null>(null)
  const [videoSelectorSlot, setVideoSelectorSlot] = useState<number | null>(null)
  const [videosManagerOpen, setVideosManagerOpen] = useState(false)
  const [storageInfo, setStorageInfo] = useState<{ used: string; free: string; total: string; percent: number } | null>(null)
  const [locale, setLocaleState] = useState<Locale>('en')
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [channelLogs, setChannelLogs] = useState<ChannelLogsState | null>(null)
  const channelLogsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const channelLogsAbortControllerRef = useRef<AbortController | null>(null)
  const [serverTime, setServerTime] = useState<string>('')

  // Admin client settings state
  const [adminClientData, setAdminClientData] = useState<{
    password?: string
    securityKey?: string
    slotsLimit?: number
    renewalDate?: string
  }>({})
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminMessage, setAdminMessage] = useState('')
  const [adminError, setAdminError] = useState('')
  const [showClientPassword, setShowClientPassword] = useState(false)

  // Password change state
  const [pwDialogOpen, setPwDialogOpen] = useState(false)
  const [pwResetQuestion, setPwResetQuestion] = useState('')
  const [pwResetAnswer, setPwResetAnswer] = useState('')
  const [pwNewPassword, setPwNewPassword] = useState('')
  const [pwConfirmPassword, setPwConfirmPassword] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState(false)

  // Timezone state
  const [tzDialogOpen, setTzDialogOpen] = useState(false)
  const [currentTz, setCurrentTz] = useState('')
  const [selectedTz, setSelectedTz] = useState('')
  const [savingTz, setSavingTz] = useState(false)
  const logViewportRef = useRef<HTMLDivElement>(null)

  // Advanced settings state
  const [settingsSlot, setSettingsSlot] = useState<number | null>(null)
  const [settingsData, setSettingsData] = useState<{
    swapVideoPath: string
    swapVideoEnabled: boolean
    youtubeChannelId: string
    youtubeTitle: string
    youtubeDescription: string
    youtubeThumbnailPath: string
    streamKey: string
    rtmpServer: string
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'swap' | 'youtube'>('swap')
  const [swapSelectorOpen, setSwapSelectorOpen] = useState(false)
  const [thumbnailSelectorOpen, setThumbnailSelectorOpen] = useState(false)

  // YouTube stream keys state (for dropdown in settings dialog)
  const [ytStreamKeys, setYtStreamKeys] = useState<{ id: string; title: string; streamKey: string; rtmpServer: string; status: string }[]>([])
  const [ytStreamKeysLoading, setYtStreamKeysLoading] = useState(false)
  const [ytStreamKeysError, setYtStreamKeysError] = useState('')

  // Slot-level stream keys for the main table row dropdowns
  const [slotStreamKeys, setSlotStreamKeys] = useState<Record<number, { id: string; title: string; streamKey: string; rtmpServer: string }[]>>({})
  const [slotStreamKeysLoading, setSlotStreamKeysLoading] = useState<Record<number, boolean>>({})

  // YouTube channels manager state
  const [ytManagerOpen, setYtManagerOpen] = useState(false)
  const [ytChannels, setYtChannels] = useState<{ id: string; name: string; channelTitle: string; channelId: string; createdAt: string; updatedAt: string }[]>([])
  const [ytLoading, setYtLoading] = useState(false)
  const [ytLinkName, setYtLinkName] = useState('')
  const [ytSlotLinkName, setYtSlotLinkName] = useState('')
  const [ytUnlinkConfirm, setYtUnlinkConfirm] = useState<string | null>(null)

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/logs')
      if (res.status === 401) { window.location.href = '/login'; return }
      const data = await res.json()
      setLogs(data.logs || [])
    } catch { }
  }, [])

  // Cloudflare Tunnel state
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null)
  const [publicIp, setPublicIp] = useState<string | null>(null)
  const [loadingTunnel, setLoadingTunnel] = useState(false)

  const fetchTunnelUrl = useCallback(async () => {
    setLoadingTunnel(true)
    try {
      const res = await fetch('/api/tunnel')
      const data = await res.json()
      let currentIp = '37.27.109.98'
      if (data.success && data.tunnelUrl) {
        setTunnelUrl(data.tunnelUrl)
      } else {
        setTunnelUrl(null)
      }
      if (data.publicIp) {
        setPublicIp(data.publicIp)
        currentIp = data.publicIp
      } else {
        setPublicIp(null)
      }

      // Log Cloudflare Tunnel warning to system logs database if accessing via trycloudflare.com
      if (typeof window !== 'undefined' && window.location.hostname.includes('.trycloudflare.com')) {
        const loggedWarningKey = 'cloudflare_warning_logged_session'
        if (!sessionStorage.getItem(loggedWarningKey)) {
          const msg = locale === 'ar'
            ? `تنبيه: أنت متصل عبر نفق Cloudflare. بث RTMP من OBS لا يمر عبر نفق HTTP الخاص بـ Cloudflare. يرجى استخدام عنوان الـ IP المباشر للسيرفر (${currentIp}) في إعدادات البث ببرنامج OBS.`
            : `Warning: Connected via Cloudflare Tunnel. RTMP streaming from OBS cannot pass through Cloudflare's HTTP tunnel. Please use the direct server IP (${currentIp}) in OBS stream settings.`
          
          await fetch('/api/logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: msg })
          })
          sessionStorage.setItem(loggedWarningKey, 'true')
          fetchLogs()
        }
      }
    } catch (err) {
      console.error('Failed to fetch tunnel URL', err)
      setTunnelUrl(null)
      setPublicIp(null)
    } finally {
      setLoadingTunnel(false)
    }
  }, [fetchLogs, locale])

  const getIngestUrl = useCallback(() => {
    if (typeof window === 'undefined') return 'rtmp://127.0.0.1/live'
    const hostname = window.location.hostname
    if (hostname.includes('.trycloudflare.com')) {
      const ipToUse = publicIp || '37.27.109.98'
      return `rtmp://${ipToUse}/live`
    }
    return `rtmp://${hostname}/live`
  }, [publicIp])

  // Initialize locale and theme
  useEffect(() => {
    setLocaleState(getLocale())
    setIsDarkMode(document.documentElement.classList.contains('dark'))
    fetchTunnelUrl()
  }, [fetchTunnelUrl])

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logViewportRef.current) {
      logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight
    }
  }, [logs])

  // Debounce global search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
      setCurrentPage(1)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Fetch YouTube channels list
  const fetchYtChannels = useCallback(async () => {
    setYtLoading(true)
    try {
      const res = await fetch('/api/youtube/channels')
      const data = await res.json()
      setYtChannels(data.channels || [])
    } catch (err) {
      console.error('Failed to fetch YouTube channels', err)
    } finally {
      setYtLoading(false)
    }
  }, [])

  // Fetch YouTube stream keys for a given channel (used in settings dialog dropdown)
  const fetchYtStreamKeys = useCallback(async (channelId: string, force = false) => {
    if (!channelId) { setYtStreamKeys([]); return }
    setYtStreamKeysLoading(true)
    setYtStreamKeysError('')
    try {
      const res = await fetch(`/api/youtube/streams?channelId=${encodeURIComponent(channelId)}${force ? '&force=true' : ''}`)
      const data = await res.json()
      if (data.success) {
        setYtStreamKeys(data.streamKeys || [])
      } else {
        setYtStreamKeysError(data.error || 'Failed to fetch stream keys')
        setYtStreamKeys([])
      }
    } catch (err) {
      console.error('Failed to fetch YouTube stream keys', err)
      setYtStreamKeysError('Network error')
      setYtStreamKeys([])
    } finally {
      setYtStreamKeysLoading(false)
    }
  }, [])

  // Fetch YouTube stream keys for a specific slot index (used in main table row)
  const fetchStreamKeysForSlot = useCallback(async (slotIndex: number, channelId: string, force = false) => {
    if (!channelId) return
    setSlotStreamKeysLoading(prev => ({ ...prev, [slotIndex]: true }))
    try {
      const res = await fetch(`/api/youtube/streams?channelId=${encodeURIComponent(channelId)}${force ? '&force=true' : ''}`)
      const data = await res.json()
      if (data.success) {
        setSlotStreamKeys(prev => ({ ...prev, [slotIndex]: data.streamKeys || [] }))
      }
    } catch (err) {
      console.error('Error fetching stream keys for slot', slotIndex, err)
    } finally {
      setSlotStreamKeysLoading(prev => ({ ...prev, [slotIndex]: false }))
    }
  }, [])

  useEffect(() => {
    if (ytManagerOpen) {
      fetchYtChannels()
      fetchTunnelUrl()
    }
  }, [ytManagerOpen, fetchYtChannels, fetchTunnelUrl])

  // Fetch fresh YouTube channels list every time the Slot Settings dialog opens
  useEffect(() => {
    if (settingsSlot !== null) {
      fetchYtChannels()
      setYtSlotLinkName('')
    }
  }, [settingsSlot, fetchYtChannels])

  // Handle YouTube Auth redirect status
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const ytAuth = urlParams.get('youtube_auth')
    if (ytAuth) {
      if (ytAuth === 'success') {
        addLog(locale === 'ar' ? 'تم ربط قناة اليوتيوب بنجاح!' : 'YouTube channel linked successfully!')
        alert(locale === 'ar' ? 'تم ربط القناة بنجاح!' : 'Channel linked successfully!')
      } else if (ytAuth === 'error') {
        const msg = urlParams.get('msg') || ''
        addLog(locale === 'ar' ? `فشل ربط قناة اليوتيوب: ${msg}` : `Failed to link YouTube channel: ${msg}`)
        alert((locale === 'ar' ? 'فشل ربط القناة: ' : 'Failed to link channel: ') + msg)
      }
      // Clean query parameters from URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [locale])

  // Session validation
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/check')
        if (!res.ok) {
          window.location.href = '/login'
          return
        }
        const data = await res.json()
        if (data.authenticated && data.user) {
          setUser({ role: data.user.role, slotsLimit: data.user.slotsLimit, securityKey: data.user.securityKey })
        } else {
          window.location.href = '/login'
        }
      } catch { }
    }
    checkAuth()
    const interval = setInterval(checkAuth, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  // Fetch admin client settings when user is admin
  const fetchAdminClient = useCallback(async () => {
    try {
      const res = await fetch('/api/settings/client')
      const data = await res.json()
      if (data.success && data.client) {
        setAdminClientData({
          password: data.client.password,
          securityKey: data.client.securityKey,
          slotsLimit: data.client.slotsLimit,
          renewalDate: data.client.renewalDate ? data.client.renewalDate.split('T')[0] : ''
        })
      }
    } catch {
      setAdminError('Failed to fetch client settings')
    }
  }, [])

  useEffect(() => {
    if (user?.role === 'admin') {
      fetchAdminClient()
    }
  }, [user, fetchAdminClient])

  const saveAdminClient = async (e: React.FormEvent) => {
    e.preventDefault()
    setAdminLoading(true)
    setAdminMessage('')
    setAdminError('')

    try {
      const res = await fetch('/api/settings/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password: adminClientData.password,
          securityKey: adminClientData.securityKey,
          slotsLimit: adminClientData.slotsLimit,
          renewalDate: adminClientData.renewalDate ? new Date(adminClientData.renewalDate).toISOString() : null
        })
      })

      const data = await res.json()
      if (data.success) {
        setAdminMessage(locale === 'ar' ? 'تم حفظ التعديلات بنجاح' : 'Settings saved successfully')
        fetchAdminClient()
      } else {
        setAdminError(data.error || 'Failed to save settings')
      }
    } catch {
      setAdminError('Connection error')
    } finally {
      setAdminLoading(false)
    }
  }

  // Live server clock — poll every second
  useEffect(() => {
    const syncClock = () => {
      fetch('/api/server-time')
        .then(r => r.json())
        .then(d => setServerTime(d.time || ''))
        .catch(() => {})
    }
    syncClock()
    const clockInterval = setInterval(syncClock, 1000)
    return () => clearInterval(clockInterval)
  }, [])

  const switchLocale = () => {
    const newLocale = locale === 'en' ? 'ar' : 'en'
    setLocale(newLocale)
    setLocaleState(newLocale)
  }

  const toggleTheme = () => {
    const root = document.documentElement
    if (isDarkMode) {
      root.classList.remove('dark')
      localStorage.setItem('qaff-theme', 'light')
      setIsDarkMode(false)
    } else {
      root.classList.add('dark')
      localStorage.setItem('qaff-theme', 'dark')
      setIsDarkMode(true)
    }
  }

  // Fetch TZ when dialog opens
  useEffect(() => {
    if (tzDialogOpen) {
      fetch('/api/settings/timezone')
        .then(res => res.json())
        .then(data => {
          if (data.success) { setCurrentTz(data.timezone); setSelectedTz(data.timezone) }
        }).catch(() => { })
    }
  }, [tzDialogOpen])

  const saveTimezone = async () => {
    setSavingTz(true)
    try {
      const res = await fetch('/api/settings/timezone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: selectedTz })
      })
      const data = await res.json()
      if (data.success) {
        addLog(data.message)
        setTimeout(() => window.location.reload(), 3000)
      } else {
        addLog('Error: ' + data.error)
      }
    } catch {
      addLog('Failed to save timezone')
    }
    setSavingTz(false)
    setTzDialogOpen(false)
  }

  const fetchSlots = useCallback(async () => {
    try {
      const qs = new URLSearchParams()
      qs.set('page', currentPage.toString())
      qs.set('limit', SLOTS_PER_PAGE.toString())
      if (debouncedSearchQuery) qs.set('search', debouncedSearchQuery)

      const res = await fetch(`/api/slots?${qs.toString()}`)
      if (res.status === 401) { window.location.href = '/login'; return }
      const data = await res.json()
      setSlots(data.slots || [])
      setTotalSlots(data.total || 0)
    } catch { addLog('Error fetching slots') }
    finally { setLoading(false) }
  }, [currentPage, debouncedSearchQuery])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats')
      if (res.status === 401) { window.location.href = '/login'; return }
      const data = await res.json()
      setStats(data)
    } catch { }
  }, [])

  const fetchStorage = useCallback(async () => {
    try {
      const res = await fetch('/api/storage')
      if (res.status === 401) { window.location.href = '/login'; return }
      const data = await res.json()
      if (data.disk) {
        setStorageInfo({
          used: data.disk.usedFormatted || data.disk.used,
          free: data.disk.freeFormatted || data.disk.free,
          total: data.disk.totalFormatted || data.disk.total,
          percent: data.disk.usedPercent || 0
        })
      }
    } catch { }
  }, [])

  useEffect(() => {
    fetchSlots(); fetchLogs(); fetchStats(); fetchStorage(); fetchTunnelUrl()

    const statusInterval = setInterval(async () => {
      try { await fetch('/api/status'); fetchSlots(); fetchStats() } catch { }
    }, 5000)

    const uiRefreshInterval = setInterval(async () => {
      try { fetchSlots(); fetchLogs(); fetchStats(); fetchTunnelUrl() } catch { }
    }, 60000)

    return () => { clearInterval(statusInterval); clearInterval(uiRefreshInterval) }
  }, [fetchSlots, fetchLogs, fetchStats, fetchStorage, fetchTunnelUrl])

  const addLog = async (message: string) => {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      })
      fetchLogs()
    } catch { }
  }

  const updateSlot = async (index: number, updates: Partial<StreamSlot>) => {
    try {
      await fetch(`/api/slots/${index}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      if (autoSave) fetchSlots()
    } catch { addLog(`Error updating slot ${index + 1}`) }
  }

  const handleSlotChange = (index: number, field: keyof StreamSlot, value: string | boolean) => {
    let updates: Partial<StreamSlot> = { [field]: value }

    if (field === 'schedStart') {
      const slot = slots.find(s => s.slotIndex === index)
      if (slot) {
        if (value === '') {
          updates.schedStop = ''
        } else if (slot.schedStop && typeof value === 'string' && /^\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) {
          const { h: durH, m: durM } = getDuration(slot.schedStart, slot.schedStop)
          if (durH >= 0 && durM >= 0) {
            updates.schedStop = buildStopByDuration(value, durH, durM)
          }
        }
      }
    }

    setSlots(prev => prev.map(slot =>
      slot.slotIndex === index ? { ...slot, ...updates } : slot
    ))
    updateSlot(index, updates)
  }


  const handleOutputTypeChange = (slotIndex: number, newType: string) => {
    // When switching to YouTube/Facebook, set the fixed RTMP base
    const newRtmpServer = RTMP_BASES[newType] || ''
    setSlots(prev => prev.map(slot =>
      slot.slotIndex === slotIndex
        ? { ...slot, outputType: newType, rtmpServer: newRtmpServer }
        : slot
    ))
    updateSlot(slotIndex, { outputType: newType, rtmpServer: newRtmpServer })
  }

  const startStream = async (index: number) => {
    const slot = slots.find(s => s.slotIndex === index)
    if (!slot) return

    const outputType = slot.outputType || 'youtube'

    // Client-side validation
    if (slot.inputType !== 'live' && !slot.filePath) {
      addLog(`Slot ${index + 1}: ${t('fileNotFound')}`)
      return
    }
    // Skip stream key check when YouTube automation is active (key is auto-fetched by backend)
    const hasYtAutomation = !!(slot.youtubeChannelId)
    if ((outputType === 'youtube' || outputType === 'facebook') && !slot.streamKey?.trim() && !hasYtAutomation) {
      addLog(`Slot ${index + 1}: ${t('streamKeyRequired')}`)
      return
    }
    if ((outputType === 'tiktok' || outputType === 'custom') &&
      (!slot.rtmpServer?.trim() || (!slot.rtmpServer.startsWith('rtmp://') && !slot.rtmpServer.startsWith('rtmps://')))) {
      addLog(`Slot ${index + 1}: ${t('invalidRtmpUrl')}`)
      return
    }
    if ((outputType === 'tiktok' || outputType === 'custom') && !slot.streamKey?.trim()) {
      addLog(`Slot ${index + 1}: ${t('streamKeyRequired')}`)
      return
    }

    try {
      const res = await fetch(`/api/slots/${index}/start`, { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        // Translate i18n error codes from server
        const errMsg = t(data.error as any) || data.error
        addLog(`Slot ${index + 1}: ${errMsg}`)
      } else {
        const msg = (data.message || t('streamRunning')).replace(/^Slot\s+\d+:\s*/i, '')
        addLog(`Slot ${index + 1}: ${msg}`)
      }
      fetchSlots()
    } catch {
      addLog(`Slot ${index + 1}: ${t('streamFailed')}`)
    }
  }

  const stopStream = async (index: number) => {
    try {
      await fetch(`/api/slots/${index}/stop`, { method: 'POST' })
      addLog(`Slot ${index + 1}: Stopped`)
      fetchSlots()
    } catch { addLog(`Slot ${index + 1}: Error stopping stream`) }
  }

  const scheduleSlot = async (index: number) => {
    const slot = slots.find(s => s.slotIndex === index)
    if (!slot?.schedStart) { addLog(`Slot ${index + 1}: ${t('outputIncomplete')}`); return }

    const outputType = slot.outputType || 'youtube'
    if (slot.inputType !== 'live' && !slot.filePath) {
      addLog(`Slot ${index + 1}: ${t('fileNotFound')}`); return
    }
    // Skip stream key check when YouTube automation is active (key is auto-fetched by backend)
    const hasYtAutomation = !!(slot.youtubeChannelId)
    if ((outputType === 'youtube' || outputType === 'facebook') && !slot.streamKey?.trim() && !hasYtAutomation) {
      addLog(`Slot ${index + 1}: ${t('streamKeyRequired')}`); return
    }
    if ((outputType === 'tiktok' || outputType === 'custom') &&
      (!slot.rtmpServer?.trim() || (!slot.rtmpServer.startsWith('rtmp://') && !slot.rtmpServer.startsWith('rtmps://')))) {
      addLog(`Slot ${index + 1}: ${t('invalidRtmpUrl')}`); return
    }
    if ((outputType === 'tiktok' || outputType === 'custom') && !slot.streamKey?.trim()) {
      addLog(`Slot ${index + 1}: ${t('streamKeyRequired')}`); return
    }

    try {
      const res = await fetch(`/api/slots/${index}/schedule`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        addLog(`Slot ${index + 1}: ${data.error || 'Error scheduling'}`)
        return
      }
      addLog(`Slot ${index + 1}: Scheduled`)
      fetchSlots()
    } catch { addLog(`Slot ${index + 1}: Error scheduling`) }
  }

  const resetSlot = async (index: number) => {
    try {
      await fetch(`/api/slots/${index}/reset`, { method: 'POST' })
      addLog(`Slot ${index + 1}: Reset`)
      fetchSlots()
    } catch { addLog(`Slot ${index + 1}: Error resetting`) }
  }

  // Smart Play: immediate start if no schedStart, else schedule
  const handlePlayButton = async (index: number) => {
    const slot = slots.find(s => s.slotIndex === index)
    if (!slot) return
    if (!slot.schedStart) {
      await startStream(index)
    } else {
      await scheduleSlot(index)
    }
  }

  const handleQuickSchedule = (index: number, ampm: 'AM' | 'PM') => {
    const now = new Date()
    const target = new Date(now)
    if (ampm === 'AM') {
      target.setDate(now.getDate() + 1)
      target.setHours(0, 0, 0, 0)
    } else {
      if (now.getHours() >= 12) target.setDate(now.getDate() + 1)
      target.setHours(12, 0, 0, 0)
    }
    const startStr = `${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')} ${String(target.getHours()).padStart(2,'0')}:00`
    const stopStr = buildStopByDuration(startStr, 11, 45)  // 11h45m duration
    handleSlotChange(index, 'schedStart', startStr)
    handleSlotChange(index, 'schedStop', stopStr)
  }

  const handleClosest5MinSchedule = (index: number, ampm: 'AM' | 'PM') => {
    const now = new Date()
    let m = Math.floor(now.getMinutes() / 5) * 5 + 5
    let h = now.getHours()
    if (m >= 60) {
      m -= 60
      h += 1
    }
    let h12 = h % 12
    if (h12 === 0) h12 = 12

    const target = new Date(now)
    target.setMinutes(m, 0, 0)
    if (ampm === 'AM') {
      target.setHours(h12 === 12 ? 0 : h12)
    } else {
      target.setHours(h12 === 12 ? 12 : h12 + 12)
    }

    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }

    const startStr = `${String(target.getMonth()+1).padStart(2,'0')}-${String(target.getDate()).padStart(2,'0')} ${String(target.getHours()).padStart(2,'0')}:${String(target.getMinutes()).padStart(2,'0')}`
    const stopStr = buildStopByDuration(startStr, 11, 45)  // 11h45m duration
    handleSlotChange(index, 'schedStart', startStr)
    handleSlotChange(index, 'schedStop', stopStr)
  }

  const bulkAction = async (action: string, ampm?: 'AM' | 'PM') => {
    try {
      const res = await fetch('/api/slots/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ampm })
      })
      const data = await res.json()
      addLog(data.message)
      if (data.errors) data.errors.forEach((err: string) => addLog(err))
      fetchSlots(); fetchStats()
    } catch { addLog(`Error in bulk action: ${action}`) }
  }

  const confirmBulkAction = (action: string, actionName: string, ampm?: 'AM' | 'PM') => {
    setConfirmDialog({ open: true, action: actionName, onConfirm: () => { bulkAction(action, ampm); setConfirmDialog(null) } })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Streaming': return 'bg-green-500'
      case 'Starting': return 'bg-yellow-500'
      case 'Scheduled': return 'bg-orange-500'
      case 'Completed': return 'bg-blue-500'
      case 'Failed': return 'bg-red-600'
      default: return 'bg-slate-500'
    }
  }

  // ── Per-channel Logs Panel ───────────────────────────────────
  const openChannelLogs = async (slotIndex: number) => {
    if (channelLogsAbortControllerRef.current) {
      channelLogsAbortControllerRef.current.abort()
    }
    channelLogsAbortControllerRef.current = new AbortController()
    const initialSignal = channelLogsAbortControllerRef.current.signal

    setChannelLogs({ slotIndex, logs: [], ramPercent: 0, bitrateMbps: 0, loading: true })

    const refresh = async () => {
      // Abort previous requests if they are still running
      if (channelLogsAbortControllerRef.current) {
        channelLogsAbortControllerRef.current.abort()
      }
      const newController = new AbortController()
      channelLogsAbortControllerRef.current = newController
      const sig = newController.signal

      // 1. Fetch system logs (primary display)
      fetch(`/api/logs?slotIndex=${slotIndex}`, { signal: sig })
        .then(res => res.json())
        .then(logsData => {
          setChannelLogs(prev => prev?.slotIndex === slotIndex ? {
            ...prev,
            logs: logsData.logs || [],
            loading: false
          } : prev)
        })
        .catch((err) => {
          if (err?.name === 'AbortError') return
          setChannelLogs(prev => prev ? { ...prev, loading: false } : null)
        })

      // 2. Fetch RAM usage (secondary, non-blocking)
      fetch('/api/stats/ram', { signal: sig })
        .then(res => res.json())
        .then(ramData => {
          setChannelLogs(prev => prev?.slotIndex === slotIndex ? {
            ...prev,
            ramPercent: ramData.usedPercent || 0
          } : prev)
        })
        .catch(() => {})

      // 3. Fetch channel bitrate (secondary, non-blocking)
      fetch(`/api/stats/bitrate?slotIndex=${slotIndex}`, { signal: sig })
        .then(res => res.json())
        .then(bitrateData => {
          setChannelLogs(prev => prev?.slotIndex === slotIndex ? {
            ...prev,
            bitrateMbps: bitrateData.bitrateMbps || 0
          } : prev)
        })
        .catch(() => {})
    }

    refresh()

    if (channelLogsIntervalRef.current) clearInterval(channelLogsIntervalRef.current)
    channelLogsIntervalRef.current = setInterval(refresh, 3000)
  }

  const closeChannelLogs = () => {
    if (channelLogsIntervalRef.current) { clearInterval(channelLogsIntervalRef.current); channelLogsIntervalRef.current = null }
    if (channelLogsAbortControllerRef.current) {
      channelLogsAbortControllerRef.current.abort()
      channelLogsAbortControllerRef.current = null
    }
    setChannelLogs(null)
  }

  // Build final RTMP URL for display / copying
  // Matches stream-manager buildRtmpUrl: even slots → a.rtmp, odd slots → b.rtmp
  const getFinalRtmpUrl = (slot: StreamSlot): string => {
    const outputType = slot.outputType || 'youtube'
    if (outputType === 'youtube') {
      const endpoint = (slot.slotIndex ?? 0) % 2 === 0 ? 'a' : 'b'
      return `rtmp://${endpoint}.rtmp.youtube.com/live2/${slot.streamKey}`
    }
    if (outputType === 'facebook') return `rtmps://live-api-s.facebook.com:443/rtmp/${slot.streamKey}`
    // TikTok / Custom: server + key
    const srv = slot.rtmpServer?.trim() || ''
    const key = slot.streamKey?.trim() || ''
    if (srv && key) return `${srv.replace(/\/$/, '')}/${key}`
    return srv || key
  }

  const totalPages = Math.ceil(totalSlots / SLOTS_PER_PAGE)
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  const getDaysRemaining = (dateString?: string | null) => {
    if (!dateString) return null
    // Compare strictly the dates removing times
    const d1 = new Date(dateString)
    d1.setHours(0, 0, 0, 0)
    const d2 = new Date()
    d2.setHours(0, 0, 0, 0)
    const diffTime = d1.getTime() - d2.getTime()
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }
  const daysRemaining = getDaysRemaining(stats.renewalDate)

  if (loading && !user) {
    return (
      <div className="min-h-screen xl:h-screen flex flex-col xl:overflow-hidden bg-background animate-pulse" dir="ltr">
        <header className="border-b bg-card shrink-0 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-muted" />
            <div className="w-32 h-6 rounded bg-muted" />
          </div>
          <div className="flex gap-2">
            <div className="w-20 h-8 rounded bg-muted" />
            <div className="w-20 h-8 rounded bg-muted" />
          </div>
        </header>
        <div className="flex-1 p-6 space-y-4">
          <div className="w-48 h-8 rounded bg-muted" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-24 rounded-xl bg-muted" />
            <div className="h-24 rounded-xl bg-muted" />
            <div className="h-24 rounded-xl bg-muted" />
          </div>
          <div className="h-96 rounded-xl bg-muted" />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen xl:h-screen flex flex-col xl:overflow-hidden bg-background" dir="ltr">
      {/* â€•â€•â€• Header â€•â€•â€• */}
      <header className="border-b bg-card shrink-0 z-50">
        <div className="px-4 py-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <a href="https://streamer.qaff.net" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Image src="/logo-icon.png?v=1" unoptimized alt="Qaff Streamer" width={32} height={32} priority className="object-contain dark:hidden" />
                <Image src="/logo-white.png?v=1" unoptimized alt="Qaff Streamer" width={32} height={32} priority className="object-contain hidden dark:block" />
                <h1 className="text-lg font-bold text-primary">Qaff Streamer</h1>
              </a>
              <Badge 
                className={`bg-green-500 text-white text-xs cursor-pointer select-none transition-all hover:scale-105 active:scale-95 ${
                  filterStatus === 'active' 
                    ? 'ring-2 ring-green-500 ring-offset-1 ring-offset-background font-bold scale-[1.03] shadow-md shadow-green-500/20' 
                    : filterStatus !== 'all' 
                      ? 'opacity-40 hover:opacity-80' 
                      : 'hover:opacity-90'
                }`}
                onClick={() => setFilterStatus(prev => prev === 'active' ? 'all' : 'active')}
                title={locale === 'ar' ? 'تصفية البثوث النشطة' : 'Filter active streams'}
              >
                <Play className="w-3 h-3 mr-1" />
                {stats.streaming} {t('active')}
              </Badge>
              <Badge 
                className={`bg-orange-500 text-white text-xs cursor-pointer select-none transition-all hover:scale-105 active:scale-95 ${
                  filterStatus === 'scheduled' 
                    ? 'ring-2 ring-orange-500 ring-offset-1 ring-offset-background font-bold scale-[1.03] shadow-md shadow-orange-500/20' 
                    : filterStatus !== 'all' 
                      ? 'opacity-40 hover:opacity-80' 
                      : 'hover:opacity-90'
                }`}
                onClick={() => setFilterStatus(prev => prev === 'scheduled' ? 'all' : 'scheduled')}
                title={locale === 'ar' ? 'تصفية البثوث المجدولة' : 'Filter scheduled streams'}
              >
                <Calendar className="w-3 h-3 mr-1" />
                {stats.scheduled} {t('scheduled')}
              </Badge>
              {stats.renewalDate && (
                <Badge className={`${(daysRemaining ?? 0) <= 0 ? 'bg-red-600 animate-pulse' : (daysRemaining ?? 0) <= 5 ? 'bg-red-500 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-700'} text-white text-xs transition-colors cursor-default`}>
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {(daysRemaining ?? 0) > 0
                    ? `${t('renewalPrefix')} ${daysRemaining} ${t('renewalDaysSuffix')}`
                    : t('renewalExpired')
                  }
                </Badge>
              )}
            </div>
            {serverTime && (
              <Badge className="bg-slate-700 text-white text-xs font-mono tracking-widest ml-1">
                <Clock className="w-3 h-3 mr-1" />
                {serverTime}
              </Badge>
            )}

            <div className="flex items-center gap-2.5 flex-wrap justify-end">
              {/* Group 1: Files, Logs, and Channels */}
              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/50 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all" onClick={() => setVideosManagerOpen(true)}>
                  <FolderOpen className="w-3.5 h-3.5 mr-1" />
                  {t('videos')}
                </Button>

                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all" onClick={() => router.push('/logs')}>
                  <Activity className="w-3.5 h-3.5 mr-1" />
                  {t('logs')}
                </Button>

                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all" onClick={() => setYtManagerOpen(true)}>
                  <Youtube className="w-3.5 h-3.5 mr-1 text-red-500" />
                  {locale === 'ar' ? 'القنوات' : 'YouTube'}
                </Button>
              </div>

              {/* Group 2: Cloudflare Tunnel Status */}
              <div className="flex items-center shrink-0">
                {tunnelUrl ? (
                  <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 rounded-md px-2.5 py-1 text-xs font-semibold shadow-sm transition-all duration-200">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-ping mr-1 shrink-0" />
                    <span className="font-mono truncate max-w-[120px] sm:max-w-[200px]" title={tunnelUrl}>
                      {tunnelUrl.replace("https://", "")}
                    </span>
                    <a
                      href={tunnelUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-green-500 ml-1.5 shrink-0 hover:scale-110 transition-transform"
                      title={locale === 'ar' ? 'فتح الرابط في علامة تبويب جديدة' : 'Open link in new tab'}
                    >
                      <Globe className="w-3.5 h-3.5" />
                    </a>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 hover:bg-green-500/20 text-green-600 dark:text-green-400 shrink-0 p-0 rounded hover:scale-105 active:scale-95 transition-all"
                      onClick={() => {
                        navigator.clipboard.writeText(tunnelUrl);
                        alert(locale === 'ar' ? 'تم نسخ رابط التونل!' : 'Tunnel URL copied!');
                      }}
                      title={locale === 'ar' ? 'نسخ الرابط' : 'Copy link'}
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 rounded-md px-2.5 py-1 text-xs font-semibold shrink-0 animate-pulse">
                    <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full mr-1 animate-pulse" />
                    <span>{locale === 'ar' ? 'التونل غير نشط' : 'Tunnel inactive'}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 hover:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 shrink-0 p-0 rounded ml-1 hover:scale-110 active:scale-90 transition-all"
                      onClick={fetchTunnelUrl}
                      title={locale === 'ar' ? 'تحديث الحالة' : 'Refresh Tunnel Status'}
                      disabled={loadingTunnel}
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingTunnel ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                )}
              </div>

              {/* Group 3: Bulk Actions */}
              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/50 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600 dark:text-green-400 font-semibold hover:bg-green-600 hover:text-white hover:scale-105 active:scale-95 transition-all px-2.5"
                  onClick={() => confirmBulkAction('startAll', t('confirmStartAll'))}>
                  <Play className="w-3 h-3 mr-0.5 fill-current" />{t('startAll')}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 dark:text-red-400 font-semibold hover:bg-red-600 hover:text-white hover:scale-105 active:scale-95 transition-all px-2.5"
                  onClick={() => confirmBulkAction('stopAll', t('confirmStopAll'))}>
                  <Square className="w-3 h-3 mr-0.5 fill-current" />{t('stopAll')}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[10px] hover:bg-background hover:scale-105 active:scale-95 transition-all px-2"
                  onClick={() => confirmBulkAction('setTimeAll', locale === 'ar' ? 'ضبط كل القنوات لأقرب 12؟' : 'Set all slots to nearest 12?')} title={t('setTimeAll')}>
                  <Clock className="w-3 h-3 mr-0.5" />{locale === 'ar' ? 'ضبط 12 للكل' : 'Set 12 All'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-[10px] hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-blue-600 dark:text-blue-400"
                  onClick={() => confirmBulkAction('setClosest5MinAll', locale === 'ar' ? 'ضبط كل القنوات لأقرب 5 دقائق؟' : 'Set all slots to closest 5 minutes?')} title={locale === 'ar' ? 'ضبط لأقرب 5 للكل' : 'Set 5m All'}>
                  <Clock className="w-3 h-3 mr-0.5" />{locale === 'ar' ? 'ضبط 5 للكل' : 'Set 5 All'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs font-semibold hover:scale-105 active:scale-95 transition-all px-2.5 text-red-500 border border-red-500/20 bg-red-500/10 dark:bg-red-500/5 hover:bg-red-600 hover:text-white"
                  onClick={() => confirmBulkAction('clearTimesAll', locale === 'ar' ? 'مسح تواريخ البدء والإيقاف لكل القنوات؟' : 'Clear start/stop times for all slots?')} title={locale === 'ar' ? 'مسح التواريخ للكل' : 'Clear Times All'}>
                  <X className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'ضبط البدء والإيقاف' : 'Clear Times'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2"
                  onClick={() => confirmBulkAction('dailyAll', t('confirmDailyAll'))}>
                  <Sun className="w-3 h-3 mr-0.5" />{t('dailyAll')}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2"
                  onClick={() => confirmBulkAction('resetAll', t('confirmResetAll'))}>
                  <RotateCcw className="w-3 h-3 mr-0.5" />{t('resetAll')}
                </Button>
              </div>

              {/* Group 4: Server Config, Timezone & AutoSave */}
              <div className="flex items-center gap-1 bg-muted/40 p-0.5 rounded-lg border border-border/50 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2"
                  onClick={() => setTzDialogOpen(true)} title={t('timezoneServer')}>
                  <Globe className="w-3.5 h-3.5 mr-0.5" />{t('timezoneBtn')}
                </Button>
                <Button size="sm" variant={autoSave ? "secondary" : "ghost"} className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2"
                  onClick={() => setAutoSave(!autoSave)}>
                  <Save className="w-3.5 h-3.5 mr-0.5" />{t('autoSave')}: {autoSave ? 'ON' : 'OFF'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 font-medium" onClick={async () => {
                  setPwDialogOpen(true); setPwError(''); setPwSuccess(false); setPwResetAnswer(''); setPwNewPassword(''); setPwConfirmPassword('')
                  try {
                    const r = await fetch('/api/settings/reset-question')
                    const d = await r.json()
                    setPwResetQuestion(d.question || '')
                  } catch { setPwResetQuestion('') }
                }}>
                  🔑 {locale === 'ar' ? 'كلمة المرور' : 'Password'}
                </Button>
              </div>

              {/* Group 5: Appearance/Locale and Logout */}
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg hover:bg-muted hover:scale-110 active:scale-90 transition-all" onClick={switchLocale} title={t('language')}>
                  <Globe className="w-3.5 h-3.5" />
                </Button>

                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg hover:bg-muted hover:scale-110 active:scale-90 transition-all" onClick={toggleTheme} title={t('theme')}>
                  {isDarkMode ? <Sun className="w-3.5 h-3.5 text-orange-400" /> : <Moon className="w-3.5 h-3.5" />}
                </Button>

                <Button size="sm" variant="ghost" className="text-red-500 hover:text-white hover:bg-red-600 h-7 w-7 p-0 rounded-lg hover:scale-110 active:scale-90 transition-all"
                  title={t('logout')}
                  onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login' }}>
                  <LogOut className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>

          {/* Storage bar */}
          {storageInfo && (
            <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
              <HardDrive className="w-3.5 h-3.5" />
              <span>{t('storage')}: {storageInfo.used} {t('used')} | {storageInfo.free} {t('free')}</span>
              <div className="flex-1 max-w-[200px] h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${storageInfo.percent > 90 ? 'bg-red-500' : storageInfo.percent > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(storageInfo.percent, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </header>

      {/* â€•â€•â€• Main Content â€•â€•â€• */}
      {/* ――― Main Content ――― */}
      {user?.role === 'admin' ? (
        <main className="flex-1 overflow-auto p-6 bg-muted/30">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-border/85">
              <div>
                <h2 className="text-2xl font-bold text-foreground">
                  {locale === 'ar' ? 'لوحة إدارة عميل النظام' : 'System Client Administration'}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {locale === 'ar' 
                    ? 'إدارة صلاحيات، إعدادات، وكلمات مرور حساب العميل الموحد.' 
                    : 'Manage permissions, settings, and credentials of the system client account.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Card 1: Client Settings Form */}
              <Card className="border border-border/80 shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    ⚙️ {locale === 'ar' ? 'إعدادات الحساب والصلاحيات' : 'Account & Permissions Settings'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={saveAdminClient} className="space-y-4">
                    {adminError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-lg">
                        {adminError}
                      </div>
                    )}
                    {adminMessage && (
                      <div className="p-3 bg-green-500/10 border border-green-500/20 text-green-500 text-sm rounded-lg">
                        {adminMessage}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground">
                        {locale === 'ar' ? 'اسم المستخدم للعميل' : 'Client Username'}
                      </label>
                      <Input
                        disabled
                        value="user"
                        className="bg-muted text-muted-foreground font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground">
                        {locale === 'ar' ? 'كلمة مرور العميل الحالية' : 'Client Password'}
                      </label>
                      <div className="relative">
                        <Input
                          type={showClientPassword ? 'text' : 'password'}
                          value={adminClientData.password || ''}
                          onChange={(e) => setAdminClientData(p => ({ ...p, password: e.target.value }))}
                          placeholder={locale === 'ar' ? 'أدخل كلمة مرور جديدة للعميل' : 'Enter client password'}
                          className="font-mono text-center pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowClientPassword(!showClientPassword)}
                          className="absolute right-3 top-2 text-muted-foreground hover:text-foreground"
                        >
                          {showClientPassword ? '👁️' : '🔒'}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                        <span>{locale === 'ar' ? 'مفتاح أمان البث (Security Key)' : 'Ingest Security Key'}</span>
                        <span className="text-[10px] text-blue-500 font-mono">rtmp://IP/live/key</span>
                      </label>
                      <Input
                        value={adminClientData.securityKey || ''}
                        onChange={(e) => setAdminClientData(p => ({ ...p, securityKey: e.target.value }))}
                        placeholder="e.g. qaff-key-123"
                        className="font-mono text-center"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground flex items-center justify-between">
                        <span>{locale === 'ar' ? 'الحد الأقصى للقنوات المسموحة (Slots Limit)' : 'Max Slots Limit'}</span>
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded font-mono font-bold">
                          {adminClientData.slotsLimit || 10} / 100
                        </span>
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={adminClientData.slotsLimit || 10}
                          onChange={(e) => setAdminClientData(p => ({ ...p, slotsLimit: parseInt(e.target.value) }))}
                          className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          value={adminClientData.slotsLimit || 10}
                          onChange={(e) => {
                            let val = parseInt(e.target.value)
                            if (isNaN(val)) val = 1
                            if (val > 100) val = 100
                            setAdminClientData(p => ({ ...p, slotsLimit: val }))
                          }}
                          className="w-16 h-8 text-center text-xs font-mono font-bold"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground">
                        {locale === 'ar' ? 'تاريخ انتهاء الاشتراك' : 'Subscription Renewal Date'}
                      </label>
                      <Input
                        type="date"
                        value={adminClientData.renewalDate || ''}
                        onChange={(e) => setAdminClientData(p => ({ ...p, renewalDate: e.target.value }))}
                        className="font-mono text-center"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={adminLoading}
                      className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
                    >
                      {adminLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          {locale === 'ar' ? 'جاري الحفظ...' : 'Saving...'}
                        </>
                      ) : (
                        locale === 'ar' ? 'حفظ التعديلات' : 'Save Configurations'
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Card 2: Monitoring Dashboard */}
              <div className="space-y-6">
                <Card className="border border-border/80 shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      📊 {locale === 'ar' ? 'مراقبة البثوث الحالية' : 'Live Streams Monitor'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-green-500 font-mono">{stats.streaming}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {locale === 'ar' ? 'قنوات تبث حالياً' : 'Active Streams'}
                        </div>
                      </div>
                      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-center">
                        <div className="text-2xl font-bold text-orange-500 font-mono">{stats.scheduled}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {locale === 'ar' ? 'قنوات مجدولة' : 'Scheduled Streams'}
                        </div>
                      </div>
                    </div>

                    <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50">
                      <div className="px-3 py-2 bg-muted/50 border-b border-border/50 text-xs font-semibold">
                        {locale === 'ar' ? 'قنوات البث النشطة' : 'Active Channels'}
                      </div>
                      <div className="max-h-[220px] overflow-auto divide-y divide-border/30">
                        {slots.filter(s => s.isRunning).length === 0 ? (
                          <div className="p-4 text-center text-xs text-muted-foreground">
                            {locale === 'ar' ? 'لا توجد قنوات تبث حالياً' : 'No active streams at the moment'}
                          </div>
                        ) : (
                          slots.filter(s => s.isRunning).map(slot => (
                            <div key={slot.id} className="p-2.5 flex items-center justify-between text-xs hover:bg-muted/30">
                              <div className="flex flex-col gap-0.5">
                                <span className="font-semibold text-foreground">{slot.channelName || `Slot ${slot.slotIndex + 1}`}</span>
                                <span className="text-[10px] text-muted-foreground font-mono">Index: {slot.slotIndex + 1}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className="bg-green-500 text-white text-[10px]">{slot.status}</Badge>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => stopStream(slot.slotIndex)}
                                >
                                  {locale === 'ar' ? 'إيقاف' : 'Stop'}
                                </Button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {storageInfo && (
                  <Card className="border border-border/80 shadow-md">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        💾 {locale === 'ar' ? 'حالة قرص التخزين' : 'Disk Storage Status'}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs font-mono">
                          <span>{t('used')}: {storageInfo.used}</span>
                          <span>{t('free')}: {storageInfo.free}</span>
                        </div>
                        <div className="w-full h-2.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${storageInfo.percent > 90 ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(storageInfo.percent, 100)}%` }}
                          />
                        </div>
                        <div className="text-[10px] text-muted-foreground text-center">
                          Total capacity: {storageInfo.total} ({storageInfo.percent}% utilized)
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        </main>
      ) : (
        <main className="flex-1 flex flex-col min-h-0 px-4 py-2 gap-2 overflow-y-auto xl:overflow-hidden">

          <Card className="flex-1 flex flex-col min-h-0 overflow-visible xl:overflow-hidden border-border/60 shadow-md">
            <CardHeader className="py-2 px-4 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <CardTitle className="text-base">{t('slots')}</CardTitle>
                  <div className="relative font-normal flex items-center gap-2">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute inset-y-0 start-2 my-auto text-muted-foreground" />
                      <Input 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={locale === 'ar' ? 'بحث في الملاحظات...' : 'Search notes...'}
                        className="h-7 w-[200px] ps-8 text-xs focus-visible:ring-1"
                      />
                    </div>
                    {filterStatus !== 'all' && (
                      <Badge 
                        variant="secondary" 
                        className={`h-7 px-2 cursor-pointer transition-all hover:bg-destructive/15 hover:text-destructive flex items-center gap-1 text-[11px] border border-dashed select-none shrink-0 ${
                          filterStatus === 'active' 
                            ? 'border-green-500 bg-green-500/10 text-green-600 dark:text-green-400' 
                            : 'border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-400'
                        }`}
                        onClick={() => setFilterStatus('all')}
                        title={locale === 'ar' ? 'إزالة التصفية' : 'Clear filter'}
                      >
                        <span>{filterStatus === 'active' ? (locale === 'ar' ? 'نشط فقط' : 'Active Only') : (locale === 'ar' ? 'مجدول فقط' : 'Scheduled Only')}</span>
                        <X className="w-3 h-3 ml-0.5" />
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7" disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => p - 1)}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground min-w-[80px] text-center" dir="ltr">
                    {currentPage} / {totalPages}
                  </span>
                  <Button size="sm" variant="outline" className="h-7" disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => p + 1)}>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-y-auto xl:overflow-hidden min-h-0">
              {/* ── Desktop Table (xl+) ── */}
              <div className="hidden xl:block h-full overflow-auto">
                <table className="w-full border-collapse" style={{ minWidth: 1405, tableLayout: 'fixed' }}>
                  <thead className="sticky top-0 bg-card z-10 shadow-sm">
                    <tr className="bg-muted/50 border-b">
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 28 }}>#</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 170 }}>{t('colDetails')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 200 }}>{t('colFilePath')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 160 }}>{t('colStreamKey')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 140 }}>{t('startStream')}</th>
                      <th className="text-start text-xs font-semibold px-2 py-1.5 align-middle" style={{ width: 440 }}>
                        <div className="flex items-end gap-2 h-full">
                          <div className="w-[185px] text-center shrink-0">{t('stopStream')}</div>
                          <div className="w-[155px] flex items-center justify-center shrink-0 pb-[1px]">
                            <span className="text-[10px] text-muted-foreground leading-none whitespace-nowrap">{t('lblScheduling')}</span>
                          </div>
                          <div className="w-[66px] flex items-center justify-center shrink-0 pb-[1px]">
                            <span className="text-[10px] text-muted-foreground leading-none whitespace-nowrap">{t('lblNext12')}</span>
                          </div>
                        </div>
                      </th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 120 }}>{t('colActions')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 70 }}>{t('colStatus')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 90 }}>{t('colPlatform')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 100 }}>{t('colOutputSettings')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSlots.map((slot) => {
                      const outputType = slot.outputType || 'youtube'
                      const isYtFb = outputType === 'youtube' || outputType === 'facebook'
                      const rtmpBase = RTMP_BASES[outputType] || ''
                      const finalRtmpUrl = getFinalRtmpUrl(slot)
                      const isLocked = slot.isRunning || slot.status !== 'Stopped'

                      return (
                        <tr key={slot.id} className="hover:bg-orange-500/15 transition-colors border-b border-border/50">
                          {/* # */}
                          <td className="text-center font-mono text-xs font-medium px-2 py-1 text-muted-foreground">
                            {slot.slotIndex + 1}
                          </td>

                          {/* Channel Name */}
                          <td className="px-2 py-1">
                            <DebouncedInput
                              value={slot.channelName}
                              onChange={(val) => handleSlotChange(slot.slotIndex, 'channelName', val)}
                              className="h-6 text-xs"
                              placeholder={t('optional')}
                              dir="auto"
                            />
                          </td>

                          {/* File Path or Ingest Inflow Switcher */}
                          <td className="px-2 py-1">
                            <div className="flex gap-1 items-center flex-nowrap w-full">
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className={`h-6 w-6 p-0 shrink-0 border-border/50 ${slot.inputType === 'live' ? 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20' : 'hover:bg-muted text-muted-foreground'}`}
                                disabled={isLocked}
                                onClick={() => {
                                  const nextType = slot.inputType === 'live' ? 'file' : 'live'
                                  handleSlotChange(slot.slotIndex, 'inputType', nextType)
                                }}
                                title={slot.inputType === 'live' ? (locale === 'ar' ? 'التحويل إلى فيديو مسجل' : 'Switch to Recorded Video') : (locale === 'ar' ? 'التحويل إلى بث مباشر (Ingest)' : 'Switch to Live Ingest')}
                              >
                                {slot.inputType === 'live' ? <Wifi className="w-3.5 h-3.5 animate-pulse" /> : <Film className="w-3.5 h-3.5" />}
                              </Button>

                              {slot.inputType === 'live' ? (
                                <div className="flex gap-1 items-center flex-nowrap flex-1 min-w-0">
                                  <Input
                                    readOnly
                                    value={`${getIngestUrl()}/${user?.securityKey || 'key'}`}
                                    className="h-6 text-[10px] flex-1 font-mono bg-blue-500/5 text-blue-500 border-blue-500/20 outline-none cursor-default py-0 px-2"
                                    dir="ltr"
                                    title={`${getIngestUrl()}/${user?.securityKey || 'key'}`}
                                  />
                                  <CopyButton
                                    text={`${getIngestUrl()}/${user?.securityKey || 'key'}`}
                                    id={`copy-ingest-${slot.slotIndex}`}
                                    title={locale === 'ar' ? 'نسخ رابط البث المباشر' : 'Copy Live Stream URL'}
                                    className="h-6 w-6 p-0 shrink-0 hover:bg-blue-500/20"
                                  />
                                </div>
                              ) : (
                                <div className="flex gap-1 items-center flex-nowrap flex-1 min-w-0">
                                  <Input
                                    readOnly
                                    value={slot.filePath ? slot.filePath.split(/[/\\]/).pop() : ''}
                                    className={`h-6 text-[11px] flex-1 font-mono bg-muted/10 hover:bg-muted-foreground/15 hover:text-foreground transition-colors text-muted-foreground outline-none ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-default'}`}
                                    placeholder={t('phFilePath')}
                                    title={slot.filePath}
                                    dir="ltr"
                                  />
                                  <Button size="sm" variant="outline" className="h-6 w-6 p-0 shrink-0" disabled={isLocked}
                                    onClick={() => setVideoSelectorSlot(slot.slotIndex)} title={t('select')}>
                                    <FolderOpen className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Stream Key */}
                          <td className="px-2 py-1">
                            {slot.youtubeChannelId ? (
                              <div className="flex gap-1 items-center w-full">
                                <select
                                  disabled={isLocked}
                                  value={slot.streamKey || ''}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    handleSlotChange(slot.slotIndex, 'streamKey', val)
                                    // Find and set matching rtmpServer
                                    const keys = slotStreamKeys[slot.slotIndex] || []
                                    const found = keys.find(k => k.streamKey === val)
                                    if (found) {
                                      handleSlotChange(slot.slotIndex, 'rtmpServer', found.rtmpServer)
                                    }
                                  }}
                                  className="h-6 text-[11px] font-mono border rounded bg-background focus:outline-none cursor-pointer px-1 flex-1 w-full min-w-0"
                                  dir="ltr"
                                >
                                  <option value="">
                                    {slotStreamKeysLoading[slot.slotIndex]
                                      ? (locale === 'ar' ? 'جارٍ التحميل...' : 'Loading...')
                                      : (locale === 'ar' ? '-- اختر أو جلب --' : '-- Select or fetch --')}
                                  </option>
                                  {slot.streamKey && (!slotStreamKeys[slot.slotIndex] || !slotStreamKeys[slot.slotIndex].find(k => k.streamKey === slot.streamKey)) && (
                                    <option value={slot.streamKey}>
                                      {locale === 'ar' ? '(محفوظ) ' : '(Saved) '} {slot.streamKey.substring(0, 4)}...{slot.streamKey.substring(slot.streamKey.length - 4)}
                                    </option>
                                  )}
                                  {(slotStreamKeys[slot.slotIndex] || []).map(k => (
                                    <option key={k.id} value={k.streamKey}>
                                      {k.title}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={isLocked || slotStreamKeysLoading[slot.slotIndex]}
                                  onClick={() => fetchStreamKeysForSlot(slot.slotIndex, slot.youtubeChannelId!, true)}
                                  className="h-6 w-6 flex items-center justify-center rounded border bg-muted/30 hover:bg-muted transition-all text-xs shrink-0 disabled:opacity-50"
                                  title={locale === 'ar' ? 'تحديث مفاتيح البث' : 'Refresh Stream Keys'}
                                >
                                  <span className={slotStreamKeysLoading[slot.slotIndex] ? "animate-spin inline-block" : ""}>↻</span>
                                </button>
                              </div>
                            ) : (
                              <DebouncedInput
                                value={slot.streamKey}
                                disabled={isLocked}
                                onChange={(val) => handleSlotChange(slot.slotIndex, 'streamKey', val)}
                                className="h-6 text-[11px] font-mono w-full"
                                placeholder={t('phStreamKey')}
                                dir="ltr"
                              />
                            )}
                          </td>

                          {/* Start Schedule */}
                          <td className="px-2 py-1" style={{ overflow: 'hidden' }}>
                            <div className="flex flex-row items-center justify-center gap-2 flex-nowrap">
                              {/* Start Group */}
                              <div className="flex gap-1.5 items-center bg-muted/40 px-2 py-1 rounded shrink-0">
                                <div className="flex items-center justify-center w-[18px] h-[18px] bg-green-500/15 text-green-600 rounded-[4px] shrink-0 border border-green-500/20">
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5 ml-[1px]">
                                    <path d="M5.5 3.5l14 8.5-14 8.5v-17z" />
                                  </svg>
                                </div>
                                <input
                                  type="text"
                                  disabled={isLocked}
                                  value={slot.schedStart || ''}
                                  placeholder="00-00 00:00"
                                  onChange={(e) => handleSlotChange(slot.slotIndex, 'schedStart', e.target.value)}
                                  className={`w-[85px] bg-transparent border-none text-[10px] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 ${slot.schedStart ? 'text-foreground/80' : 'text-muted-foreground/50'} ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  dir="ltr"
                                />
                                <DateTimePicker disabled={isLocked} value={slot.schedStart || ''} onChange={(v) => handleSlotChange(slot.slotIndex, 'schedStart', v)} className={`h-6 w-6 ${isLocked ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`} />
                              </div>
                            </div>
                          </td>

                          {/* Stop Schedule */}
                          <td className="px-2 py-1" style={{ overflow: 'hidden' }}>
                            <div className="flex flex-row items-center gap-2 flex-nowrap">
                              {/* Stop Group – Duration: 0-11h, 0-59m */}
                              {(() => {
                                const { h: durH, m: durM } = getDuration(slot.schedStart, slot.schedStop)
                                const hasDur = durH >= 0 && durM >= 0

                                const sc = "h-6 text-[10px] font-mono border rounded bg-background focus:outline-none cursor-pointer px-1"
                                return (
                                  <div className="w-[185px] flex justify-center gap-1 items-center bg-muted/40 px-2 py-1 rounded shrink-0">
                                    <div className="flex items-center justify-center w-[18px] h-[18px] bg-red-500/15 text-red-500 rounded-[4px] shrink-0 border border-red-500/20 mr-0.5">
                                      <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5"><rect x="5" y="5" width="14" height="14" rx="3.5" /></svg>
                                    </div>

                                    <select
                                      disabled={isLocked}
                                      value={hasDur ? String(durH) : ''}
                                      onChange={(e) => {
                                        const val = e.target.value
                                        if (!val) { handleSlotChange(slot.slotIndex, 'schedStop', ''); return }
                                        const h = parseInt(val)
                                        const m = hasDur ? durM : 0
                                        handleSlotChange(slot.slotIndex, 'schedStop', buildStopByDuration(slot.schedStart, h, m))
                                      }}
                                      className={`${sc} w-[42px] disabled:opacity-50`} dir="ltr"
                                    >
                                      <option value="">--</option>
                                      {Array.from({length:12},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}</option>)}
                                    </select>

                                    <span className="text-muted-foreground font-bold">:</span>

                                    <select
                                      disabled={isLocked}
                                      value={hasDur ? String(durM) : ''}
                                      onChange={(e) => {
                                        const val = e.target.value
                                        if (!val) { handleSlotChange(slot.slotIndex, 'schedStop', ''); return }
                                        const m = parseInt(val)
                                        const h = hasDur ? durH : 0
                                        handleSlotChange(slot.slotIndex, 'schedStop', buildStopByDuration(slot.schedStart, h, m))
                                      }}
                                      className={`${sc} w-[42px] disabled:opacity-50`} dir="ltr"
                                    >
                                      <option value="">--</option>
                                      {Array.from({length:60},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}</option>)}
                                    </select>

                                    {/* Reset Button */}
                                    <button
                                      disabled={isLocked}
                                      onClick={() => {
                                        handleSlotChange(slot.slotIndex, 'schedStart', '')
                                        handleSlotChange(slot.slotIndex, 'schedStop', '')
                                      }}
                                      className="h-6 w-6 flex items-center justify-center rounded bg-muted/50 hover:bg-destructive/10 hover:text-destructive text-muted-foreground border transition-colors ml-1 disabled:opacity-50"
                                      title="إعادة تعيين التواريخ"
                                    >
                                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                      </svg>
                                    </button>
                                  </div>
                                )
                              })()}

                              {/* Daily / Weekly */}
                              <div className={`w-[155px] flex justify-center items-center gap-2 bg-muted/20 px-2 py-0.5 rounded border border-border/50 shrink-0 ${isLocked ? 'opacity-50' : ''}`}>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.daily} onCheckedChange={(c) => {
                                    handleSlotChange(slot.slotIndex, 'daily', !!c)
                                    if (c) handleSlotChange(slot.slotIndex, 'weekly', false)
                                    if (!c) handleSlotChange(slot.slotIndex, 'nextRunTime', '')
                                  }} id={`daily-${slot.slotIndex}`} className="w-3 h-3" />
                                  <label htmlFor={`daily-${slot.slotIndex}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">{t('lblDaily')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.weekly} onCheckedChange={(c) => {
                                    handleSlotChange(slot.slotIndex, 'weekly', !!c)
                                    if (c) handleSlotChange(slot.slotIndex, 'daily', false)
                                    if (!c) handleSlotChange(slot.slotIndex, 'nextRunTime', '')
                                  }} id={`weekly-${slot.slotIndex}`} className="w-3 h-3" />
                                  <label htmlFor={`weekly-${slot.slotIndex}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">{t('lblWeekly')}</label>
                                </div>
                              </div>

                              {/* Quick AM/PM Targets */}
                              <div className={`w-[66px] flex bg-muted/50 rounded overflow-hidden border shrink-0 border-primary/20 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                <button disabled={isLocked} onClick={() => handleQuickSchedule(slot.slotIndex, 'AM')} className="h-6 w-[32px] flex items-center justify-center text-[10px] font-semibold text-foreground/80 hover:bg-primary/20 hover:text-primary transition-colors border-r" title={t('lblNext12')}>{t('btnAM')}</button>
                                <button disabled={isLocked} onClick={() => handleQuickSchedule(slot.slotIndex, 'PM')} className="h-6 w-[32px] flex items-center justify-center text-[10px] font-semibold text-foreground/80 hover:bg-primary/20 hover:text-primary transition-colors" title={t('lblNext12')}>{t('btnPM')}</button>
                              </div>
                              {slot.nextRunTime && (
                                <div className="text-[10px] text-blue-500 font-mono shrink-0">{slot.nextRunTime}</div>
                              )}
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="px-2 py-1">
                            <div className="flex gap-2 justify-center flex-nowrap">
                              <Button size="sm" variant="default" className="h-7 w-7 p-0 rounded-md shadow-sm bg-green-600 hover:bg-green-500 hover:scale-110 hover:-translate-y-0.5 hover:shadow-md hover:shadow-green-500/40 relative z-0 hover:z-10 transition-all duration-200"
                                disabled={slot.isRunning}
                                onClick={() => handlePlayButton(slot.slotIndex)}
                                title={slot.schedStart ? t('scheduleStream') : t('startStream')}>
                                <Play className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="destructive" className="h-7 w-7 p-0 rounded-md shadow-sm hover:scale-110 hover:-translate-y-0.5 hover:shadow-md hover:shadow-red-500/40 relative z-0 hover:z-10 transition-all duration-200"
                                disabled={!slot.isRunning && !slot.isScheduled}
                                onClick={() => stopStream(slot.slotIndex)}
                                title={t('stopStream')}>
                                <Square className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-md bg-background hover:bg-muted hover:scale-110 hover:-translate-y-0.5 hover:shadow-md relative z-0 hover:z-10 transition-all duration-200"
                                onClick={() => resetSlot(slot.slotIndex)}
                                title={t('resetSlot')}>
                                <RotateCcw className="w-3.5 h-3.5 animate-spin-reverse" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-md bg-background hover:bg-muted hover:scale-110 hover:-translate-y-0.5 hover:shadow-md relative z-0 hover:z-10 transition-all duration-200"
                                onClick={() => {
                                  setSettingsSlot(slot.slotIndex)
                                  setSettingsData({
                                    swapVideoPath: slot.swapVideoPath ?? '',
                                    swapVideoEnabled: slot.swapVideoEnabled ?? false,
                                    youtubeChannelId: slot.youtubeChannelId ?? '',
                                    youtubeTitle: slot.youtubeTitle ?? '',
                                    youtubeDescription: slot.youtubeDescription ?? '',
                                    youtubeThumbnailPath: slot.youtubeThumbnailPath ?? '',
                                    streamKey: slot.streamKey ?? '',
                                    rtmpServer: slot.rtmpServer ?? '',
                                  })
                                  // Pre-fetch stream keys if channel is already linked
                                  if (slot.youtubeChannelId) fetchYtStreamKeys(slot.youtubeChannelId)
                                }}
                                title={t('advancedSettings')}>
                                <Settings className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" className="h-7 w-7 p-0 rounded-md bg-background hover:bg-muted hover:scale-110 hover:-translate-y-0.5 hover:shadow-md relative z-0 hover:z-10 transition-all duration-200"
                                onClick={() => openChannelLogs(slot.slotIndex)}
                                title={t('colLogs')}>
                                <FileText className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="text-center px-2 py-1">
                            <Badge className={`${getStatusColor(slot.status)} text-white text-[10px] font-medium`}>
                              {slot.status}
                            </Badge>
                          </td>

                          {/* Platform (Dropdown) */}
                          <td className="px-2 py-1">
                            <select
                              value={outputType}
                              onChange={(e) => handleOutputTypeChange(slot.slotIndex, e.target.value)}
                              className="h-6 text-xs rounded-md border border-input bg-background px-2 w-full focus:outline-none focus:ring-2 focus:ring-ring text-center"
                              dir="ltr"
                            >
                              <option value="youtube">{t('optYouTube')}</option>
                              <option value="facebook">{t('optFacebook')}</option>
                              <option value="custom">{t('optCustom')}</option>
                            </select>
                          </td>

                          {/* Output Settings */}
                          <td className="px-2 py-1">
                            <div className="flex flex-row gap-1 items-center w-full flex-nowrap">
                              {isYtFb ? (
                                <Input
                                  value={rtmpBase}
                                  readOnly
                                  className="h-6 text-[10px] font-mono bg-muted/50 text-muted-foreground w-full overflow-hidden text-ellipsis whitespace-nowrap cursor-default"
                                  dir="ltr"
                                  title={rtmpBase || ''}
                                />
                              ) : (
                                <DebouncedInput
                                  value={slot.rtmpServer}
                                  onChange={(val) => handleSlotChange(slot.slotIndex, 'rtmpServer', val)}
                                  className="h-6 text-[10px] font-mono w-full shrink-0"
                                  placeholder={t('phCustomServer')}
                                  dir="ltr"
                                  title={t('rtmpBaseLabel')}
                                />
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {/* Empty state – desktop */}
                {!loading && filteredSlots.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                    <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center">
                      <Search className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <p className="font-semibold text-foreground/80 text-sm">
                      {locale === 'ar' ? 'لا توجد نتائج' : 'No slots found'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {filterStatus !== 'all' 
                        ? (locale === 'ar' 
                            ? `لا توجد قنوات ${filterStatus === 'active' ? 'نشطة' : 'مجدولة'} مطابقة للتصفية` 
                            : `No ${filterStatus === 'active' ? 'active' : 'scheduled'} channels matching the filter`)
                        : debouncedSearchQuery
                          ? (locale === 'ar' ? `لا يوجد شيء يطابق "${debouncedSearchQuery}"` : `Nothing matched "${debouncedSearchQuery}"`)
                          : (locale === 'ar' ? 'لا توجد قنوات مضافة بعد' : 'No channels configured yet')}
                    </p>
                    {(debouncedSearchQuery || filterStatus !== 'all') && (
                      <button 
                        onClick={() => {
                          setSearchQuery('');
                          setFilterStatus('all');
                        }} 
                        className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                      >
                        {locale === 'ar' ? 'تهيئة الفلاتر والبحث' : 'Reset filters and search'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* ── Mobile / Tablet Cards (< xl) ── */}
              <div className="block xl:hidden overflow-y-auto">
                {loading ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="rounded-xl border border-border/60 bg-card p-4 space-y-3 animate-pulse">
                        <div className="h-4 w-24 bg-muted rounded" />
                        <div className="h-8 bg-muted rounded" />
                        <div className="h-8 bg-muted rounded" />
                        <div className="flex gap-2"><div className="h-8 flex-1 bg-muted rounded" /><div className="h-8 flex-1 bg-muted rounded" /></div>
                      </div>
                    ))}
                  </div>
                ) : filteredSlots.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-center p-6">
                    <div className="w-16 h-16 rounded-full bg-muted/60 flex items-center justify-center">
                      <Search className="w-8 h-8 text-muted-foreground/50" />
                    </div>
                    <p className="font-semibold text-foreground/80 text-sm">
                      {locale === 'ar' ? 'لا توجد نتائج' : 'No slots found'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {filterStatus !== 'all' 
                        ? (locale === 'ar' 
                            ? `لا توجد قنوات ${filterStatus === 'active' ? 'نشطة' : 'مجدولة'} مطابقة للتصفية` 
                            : `No ${filterStatus === 'active' ? 'active' : 'scheduled'} channels matching the filter`)
                        : debouncedSearchQuery
                          ? (locale === 'ar' ? `لا يوجد شيء يطابق "${debouncedSearchQuery}"` : `Nothing matched "${debouncedSearchQuery}"`)
                          : (locale === 'ar' ? 'لا توجد قنوات مضافة بعد' : 'No channels configured yet')}
                    </p>
                    {(debouncedSearchQuery || filterStatus !== 'all') && (
                      <button 
                        onClick={() => {
                          setSearchQuery('');
                          setFilterStatus('all');
                        }} 
                        className="text-xs text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                      >
                        {locale === 'ar' ? 'تهيئة الفلاتر والبحث' : 'Reset filters and search'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4">
                    {filteredSlots.map((slot) => {
                      const outputType = slot.outputType || 'youtube'
                      const isYtFb = outputType === 'youtube' || outputType === 'facebook'
                      const rtmpBase = RTMP_BASES[outputType] || ''
                      const isLocked = slot.isRunning || slot.status !== 'Stopped'
                      const { h: durH, m: durM } = getDuration(slot.schedStart, slot.schedStop)
                      const hasDur = durH >= 0 && durM >= 0
                      const sc = "h-7 text-xs font-mono border rounded bg-background focus:outline-none cursor-pointer px-1.5"

                      return (
                        <div
                          key={slot.id}
                          className={`rounded-xl border bg-card shadow-sm transition-all duration-200 overflow-hidden ${
                            slot.isRunning
                              ? 'border-green-500/40 shadow-green-500/10 shadow-md'
                              : slot.status === 'Scheduled'
                              ? 'border-orange-500/40'
                              : 'border-border/60 hover:border-border'
                          }`}
                        >
                          {/* Card Header */}
                          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-bold font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                #{slot.slotIndex + 1}
                              </span>
                              <Badge className={`${getStatusColor(slot.status)} text-white text-[10px] px-1.5 py-0`}>
                                {slot.status}
                              </Badge>
                            </div>
                            {/* Platform selector */}
                            <select
                              value={outputType}
                              onChange={(e) => handleOutputTypeChange(slot.slotIndex, e.target.value)}
                              className="h-6 text-[10px] rounded border border-input bg-background px-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                              dir="ltr"
                            >
                              <option value="youtube">{t('optYouTube')}</option>
                              <option value="facebook">{t('optFacebook')}</option>
                              <option value="custom">{t('optCustom')}</option>
                            </select>
                          </div>

                          <div className="p-3 space-y-2.5">
                            {/* Channel Name */}
                            <DebouncedInput
                              value={slot.channelName}
                              onChange={(val) => handleSlotChange(slot.slotIndex, 'channelName', val)}
                              className="h-8 text-sm w-full"
                              placeholder={t('optional')}
                              dir="auto"
                            />

                            {/* File / Ingest Selector */}
                            <div className="flex gap-1.5 items-center">
                              <Button
                                size="sm"
                                variant="outline"
                                className={`h-8 w-8 p-0 shrink-0 ${
                                  slot.inputType === 'live'
                                    ? 'bg-blue-500/10 text-blue-500 border-blue-500/30'
                                    : 'text-muted-foreground'
                                }`}
                                disabled={isLocked}
                                onClick={() => handleSlotChange(slot.slotIndex, 'inputType', slot.inputType === 'live' ? 'file' : 'live')}
                                title={slot.inputType === 'live' ? 'Switch to File' : 'Switch to Live Ingest'}
                              >
                                {slot.inputType === 'live' ? <Wifi className="w-4 h-4 animate-pulse" /> : <Film className="w-4 h-4" />}
                              </Button>
                              {slot.inputType === 'live' ? (
                                <Input
                                  readOnly
                                  value={`${getIngestUrl()}/${user?.securityKey || 'key'}`}
                                  className="h-8 text-[10px] flex-1 font-mono bg-blue-500/5 text-blue-500 border-blue-500/20 cursor-default"
                                  dir="ltr"
                                />
                              ) : (
                                <>
                                  <Input
                                    readOnly
                                    value={slot.filePath ? slot.filePath.split(/[/\\]/).pop() : ''}
                                    placeholder={t('phFilePath')}
                                    className={`h-8 text-xs flex-1 font-mono text-muted-foreground bg-muted/20 ${isLocked ? 'opacity-50' : 'cursor-default'}`}
                                    dir="ltr"
                                    title={slot.filePath}
                                  />
                                  <Button size="sm" variant="outline" className="h-8 w-8 p-0 shrink-0" disabled={isLocked}
                                    onClick={() => setVideoSelectorSlot(slot.slotIndex)}>
                                    <FolderOpen className="w-3.5 h-3.5" />
                                  </Button>
                                </>
                              )}
                            </div>

                            {/* Stream Key */}
                            <div>
                              {slot.youtubeChannelId ? (
                                <div className="flex gap-1.5 items-center">
                                  <select
                                    disabled={isLocked}
                                    value={slot.streamKey || ''}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      handleSlotChange(slot.slotIndex, 'streamKey', val)
                                      const keys = slotStreamKeys[slot.slotIndex] || []
                                      const found = keys.find(k => k.streamKey === val)
                                      if (found) handleSlotChange(slot.slotIndex, 'rtmpServer', found.rtmpServer)
                                    }}
                                    className="h-8 text-xs font-mono border rounded bg-background focus:outline-none cursor-pointer px-2 flex-1 min-w-0"
                                    dir="ltr"
                                  >
                                    <option value="">
                                      {slotStreamKeysLoading[slot.slotIndex] ? 'Loading...' : '-- Select or fetch --'}
                                    </option>
                                    {slot.streamKey && (!slotStreamKeys[slot.slotIndex] || !slotStreamKeys[slot.slotIndex].find(k => k.streamKey === slot.streamKey)) && (
                                      <option value={slot.streamKey}>
                                        (Saved) {slot.streamKey.substring(0, 4)}...{slot.streamKey.substring(slot.streamKey.length - 4)}
                                      </option>
                                    )}
                                    {(slotStreamKeys[slot.slotIndex] || []).map(k => (
                                      <option key={k.id} value={k.streamKey}>{k.title}</option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={isLocked || slotStreamKeysLoading[slot.slotIndex]}
                                    onClick={() => fetchStreamKeysForSlot(slot.slotIndex, slot.youtubeChannelId!, true)}
                                    className="h-8 w-8 flex items-center justify-center rounded border bg-muted/30 hover:bg-muted transition-all text-sm shrink-0 disabled:opacity-50"
                                    title="Refresh Stream Keys"
                                  >
                                    <span className={slotStreamKeysLoading[slot.slotIndex] ? 'animate-spin inline-block' : ''}>↻</span>
                                  </button>
                                </div>
                              ) : (
                                <DebouncedInput
                                  value={slot.streamKey}
                                  disabled={isLocked}
                                  onChange={(val) => handleSlotChange(slot.slotIndex, 'streamKey', val)}
                                  className="h-8 text-xs font-mono w-full"
                                  placeholder={t('phStreamKey')}
                                  dir="ltr"
                                />
                              )}
                            </div>

                            {/* RTMP Server (only for custom) */}
                            {!isYtFb && (
                              <DebouncedInput
                                value={slot.rtmpServer}
                                onChange={(val) => handleSlotChange(slot.slotIndex, 'rtmpServer', val)}
                                className="h-8 text-xs font-mono w-full"
                                placeholder={t('phCustomServer')}
                                dir="ltr"
                              />
                            )}

                            {/* Schedule Row */}
                            <div className="flex flex-wrap gap-2 items-center pt-0.5">
                              {/* Start time */}
                              <div className="flex gap-1 items-center bg-muted/40 px-2 py-1 rounded border border-border/40">
                                <div className="w-4 h-4 bg-green-500/15 text-green-600 rounded flex items-center justify-center shrink-0 border border-green-500/20">
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5 ml-[1px]"><path d="M5.5 3.5l14 8.5-14 8.5v-17z" /></svg>
                                </div>
                                <input
                                  type="text"
                                  disabled={isLocked}
                                  value={slot.schedStart || ''}
                                  placeholder="00-00 00:00"
                                  onChange={(e) => handleSlotChange(slot.slotIndex, 'schedStart', e.target.value)}
                                  className={`w-[80px] bg-transparent border-none text-xs font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 ${
                                    slot.schedStart ? 'text-foreground/80' : 'text-muted-foreground/50'
                                  } ${isLocked ? 'opacity-50' : ''}`}
                                  dir="ltr"
                                />
                                <DateTimePicker disabled={isLocked} value={slot.schedStart || ''} onChange={(v) => handleSlotChange(slot.slotIndex, 'schedStart', v)} className={`h-6 w-6 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`} />
                              </div>

                              {/* Duration selectors */}
                              <div className="flex gap-1 items-center bg-muted/40 px-2 py-1 rounded border border-border/40">
                                <div className="w-4 h-4 bg-red-500/15 text-red-500 rounded flex items-center justify-center shrink-0 border border-red-500/20">
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5"><rect x="5" y="5" width="14" height="14" rx="3.5" /></svg>
                                </div>
                                <select
                                  disabled={isLocked}
                                  value={hasDur ? String(durH) : ''}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    if (!val) { handleSlotChange(slot.slotIndex, 'schedStop', ''); return }
                                    const h = parseInt(val)
                                    const m = hasDur ? durM : 0
                                    handleSlotChange(slot.slotIndex, 'schedStop', buildStopByDuration(slot.schedStart, h, m))
                                  }}
                                  className={`${sc} w-[42px] disabled:opacity-50`} dir="ltr"
                                >
                                  <option value="">--</option>
                                  {Array.from({length:12},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}</option>)}
                                </select>
                                <span className="text-muted-foreground font-bold text-sm">:</span>
                                <select
                                  disabled={isLocked}
                                  value={hasDur ? String(durM) : ''}
                                  onChange={(e) => {
                                    const val = e.target.value
                                    if (!val) { handleSlotChange(slot.slotIndex, 'schedStop', ''); return }
                                    const m = parseInt(val)
                                    const h = hasDur ? durH : 0
                                    handleSlotChange(slot.slotIndex, 'schedStop', buildStopByDuration(slot.schedStart, h, m))
                                  }}
                                  className={`${sc} w-[42px] disabled:opacity-50`} dir="ltr"
                                >
                                  <option value="">--</option>
                                  {Array.from({length:60},(_,i)=><option key={i} value={i}>{String(i).padStart(2,'0')}</option>)}
                                </select>
                              </div>

                              {/* Daily / Weekly */}
                              <div className={`flex items-center gap-2.5 bg-muted/20 px-2 py-1 rounded border border-border/40 ${isLocked ? 'opacity-50' : ''}`}>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.daily} onCheckedChange={(c) => {
                                    handleSlotChange(slot.slotIndex, 'daily', !!c)
                                    if (c) handleSlotChange(slot.slotIndex, 'weekly', false)
                                    if (!c) handleSlotChange(slot.slotIndex, 'nextRunTime', '')
                                  }} id={`m-daily-${slot.slotIndex}`} className="w-3.5 h-3.5" />
                                  <label htmlFor={`m-daily-${slot.slotIndex}`} className="text-xs text-muted-foreground cursor-pointer select-none">{t('lblDaily')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.weekly} onCheckedChange={(c) => {
                                    handleSlotChange(slot.slotIndex, 'weekly', !!c)
                                    if (c) handleSlotChange(slot.slotIndex, 'daily', false)
                                    if (!c) handleSlotChange(slot.slotIndex, 'nextRunTime', '')
                                  }} id={`m-weekly-${slot.slotIndex}`} className="w-3.5 h-3.5" />
                                  <label htmlFor={`m-weekly-${slot.slotIndex}`} className="text-xs text-muted-foreground cursor-pointer select-none">{t('lblWeekly')}</label>
                                </div>
                              </div>

                              {/* AM/PM quick */}
                              <div className={`flex flex-col gap-1 ${isLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                <div className="flex bg-muted/50 rounded overflow-hidden border border-primary/20">
                                  <button disabled={isLocked} onClick={() => handleQuickSchedule(slot.slotIndex, 'AM')} className="h-7 flex-1 px-2.5 text-[10px] font-semibold hover:bg-primary/20 hover:text-primary transition-colors border-r" title="أقرب 12 صباحاً">{t('btnAM')} 12</button>
                                  <button disabled={isLocked} onClick={() => handleQuickSchedule(slot.slotIndex, 'PM')} className="h-7 flex-1 px-2.5 text-[10px] font-semibold hover:bg-primary/20 hover:text-primary transition-colors" title="أقرب 12 مساءاً">{t('btnPM')} 12</button>
                                </div>
                                <div className="flex bg-muted/50 rounded overflow-hidden border border-blue-500/20">
                                  <button disabled={isLocked} onClick={() => handleClosest5MinSchedule(slot.slotIndex, 'AM')} className="h-7 flex-1 px-2.5 text-[10px] font-semibold hover:bg-blue-500/20 hover:text-blue-500 transition-colors border-r text-blue-600 dark:text-blue-400" title="بعد 5 دقائق صباحاً">{t('btnAM')} 5</button>
                                  <button disabled={isLocked} onClick={() => handleClosest5MinSchedule(slot.slotIndex, 'PM')} className="h-7 flex-1 px-2.5 text-[10px] font-semibold hover:bg-blue-500/20 hover:text-blue-500 transition-colors text-blue-600 dark:text-blue-400" title="بعد 5 دقائق مساءاً">{t('btnPM')} 5</button>
                                </div>
                              </div>

                              {/* Reset dates */}
                              <button
                                disabled={isLocked}
                                onClick={() => {
                                  handleSlotChange(slot.slotIndex, 'schedStart', '')
                                  handleSlotChange(slot.slotIndex, 'schedStop', '')
                                }}
                                className="h-7 w-7 flex items-center justify-center rounded border bg-muted/50 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors disabled:opacity-50"
                                title="Reset dates"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>

                            {/* Next run time */}
                            {slot.nextRunTime && (
                              <div className="text-[10px] text-blue-500 font-mono">{slot.nextRunTime}</div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex items-center justify-between pt-1.5 border-t border-border/40">
                              <div className="flex gap-1.5">
                                <Button size="sm" className="h-8 w-8 p-0 rounded-lg bg-green-600 hover:bg-green-500 hover:scale-110 hover:shadow-md hover:shadow-green-500/40 transition-all"
                                  disabled={slot.isRunning}
                                  onClick={() => handlePlayButton(slot.slotIndex)}
                                  title={slot.schedStart ? t('scheduleStream') : t('startStream')}>
                                  <Play className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="destructive" className="h-8 w-8 p-0 rounded-lg hover:scale-110 hover:shadow-md hover:shadow-red-500/40 transition-all"
                                  disabled={!slot.isRunning && !slot.isScheduled}
                                  onClick={() => stopStream(slot.slotIndex)}
                                  title={t('stopStream')}>
                                  <Square className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-lg hover:bg-muted hover:scale-110 transition-all"
                                  onClick={() => resetSlot(slot.slotIndex)}
                                  title={t('resetSlot')}>
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                              <div className="flex gap-1.5">
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-lg hover:bg-muted hover:scale-110 transition-all"
                                  onClick={() => {
                                    setSettingsSlot(slot.slotIndex)
                                    setSettingsData({
                                      swapVideoPath: slot.swapVideoPath ?? '',
                                      swapVideoEnabled: slot.swapVideoEnabled ?? false,
                                      youtubeChannelId: slot.youtubeChannelId ?? '',
                                      youtubeTitle: slot.youtubeTitle ?? '',
                                      youtubeDescription: slot.youtubeDescription ?? '',
                                      youtubeThumbnailPath: slot.youtubeThumbnailPath ?? '',
                                      streamKey: slot.streamKey ?? '',
                                      rtmpServer: slot.rtmpServer ?? '',
                                    })
                                    if (slot.youtubeChannelId) fetchYtStreamKeys(slot.youtubeChannelId)
                                  }}
                                  title={t('advancedSettings')}>
                                  <Settings className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-lg hover:bg-muted hover:scale-110 transition-all"
                                  onClick={() => openChannelLogs(slot.slotIndex)}
                                  title={t('colLogs')}>
                                  <FileText className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
      )}

      <footer className="w-full border-t bg-card py-4 shrink-0 mt-auto shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="container mx-auto w-full overflow-hidden">
          <div className="flex flex-col items-center justify-center gap-3 px-4 text-center w-full">

            {/* Copyright & WhatsApp Group */}
            <div className={`flex items-center justify-center gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
              <span className="text-sm font-semibold text-foreground/80">{t('footerText')}</span>
              <div className="flex items-center gap-1.5">
                <a href="https://wa.me/201012656551" target="_blank" rel="noopener noreferrer"
                  className="flex items-center text-green-500 hover:text-green-400 transition-colors font-bold"
                  title="Contact via WhatsApp">
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                </a>
                <a href="https://streamer.qaff.net" target="_blank" rel="noopener noreferrer"
                  className="flex items-center text-primary hover:text-primary/80 transition-colors"
                  title="Visit Website">
                  <Globe className="w-5 h-5" />
                </a>
              </div>
            </div>

            {/* Removed Website Link Details */}
          </div>
        </div>
      </footer>

      {/* Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â  Per-Channel Logs Dialog Ã¢â€¢Â Ã¢â€¢Â Ã¢â€¢Â  */}
      < Dialog open={!!channelLogs
      } onOpenChange={(open) => !open && closeChannelLogs()}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col" dir={dir}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {t('channelLogs')} #{channelLogs ? channelLogs.slotIndex + 1 : ''}
            </DialogTitle>
          </DialogHeader>

          {/* Live Stats Bar */}
          {channelLogs && (
            <div className="flex items-center gap-4 py-2 px-3 bg-muted/50 rounded-md shrink-0 text-sm" dir="ltr">
              <div className="ml-auto">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground animate-spin" style={{ animationDuration: '3s' }} />
              </div>
            </div>
          )}

          {/* Logs scroll area */}
          <div className="flex-1 overflow-auto min-h-0 bg-black/90 rounded-md p-3 font-mono text-xs" dir="ltr">
            {channelLogs?.loading ? (
              <div className="flex items-center justify-center h-20 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />{t('loading')}
              </div>
            ) : channelLogs?.logs.length === 0 ? (
              <div className="text-muted-foreground text-center py-8">{t('noLogs')}</div>
            ) : (
              channelLogs?.logs.map((log) => (
                <div key={log.id} className="text-green-400 py-0.5 leading-relaxed">
                  <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString('en-GB', { hour12: false })} </span>
                  {log.message}
                </div>
              ))
            )}
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={closeChannelLogs}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â Timezone Dialog Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      < Dialog open={tzDialogOpen} onOpenChange={setTzDialogOpen} >
        <DialogContent className="sm:max-w-md" dir={dir}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              {t('timezoneServer')}
            </DialogTitle>
            <DialogDescription>{t('timezoneWarning')}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold">{t('timezoneCurrent')}</label>
              <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded border border-border/50">
                {currentTz || t('timezoneLoading')}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold">{t('timezoneNew')}</label>
              <select
                value={selectedTz}
                onChange={(e) => setSelectedTz(e.target.value)}
                className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                dir="ltr"
              >
                <option value="UTC">UTC</option>
                {['Africa', 'America', 'Asia', 'Atlantic', 'Australia', 'Europe', 'Indian', 'Pacific'].map(region => (
                  <optgroup key={region} label={region}>
                    {Intl.supportedValuesOf('timeZone').filter(tz => tz.startsWith(`${region}/`)).map(tz => (
                      <option key={tz} value={tz}>{tz}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="default" onClick={saveTimezone}
              disabled={savingTz || !selectedTz || selectedTz === currentTz}>
              {savingTz ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              {t('timezoneSave')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setTzDialogOpen(false)}>{t('cancel')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â Videos Manager Dialog Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      < Dialog open={videosManagerOpen} onOpenChange={setVideosManagerOpen} >
        <DialogContent className="sm:max-w-6xl w-[95vw] max-h-[95vh] h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />{t('videosManager')}
            </DialogTitle>
            <DialogDescription>{t('browseAndSelect')}</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-hidden min-h-0">
            <VideoManager mode="manage" onClose={() => setVideosManagerOpen(false)} />
          </div>
        </DialogContent>
      </Dialog >

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â Video Selector Dialog Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      < Dialog open={videoSelectorSlot !== null} onOpenChange={(open) => !open && setVideoSelectorSlot(null)}>
        <DialogContent className="sm:max-w-5xl w-[95vw] max-h-[95vh] h-[90vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              {t('selectVideoForSlot')} #{videoSelectorSlot !== null ? videoSelectorSlot + 1 : ''}
            </DialogTitle>
            <DialogDescription>{t('browseAndSelect')}</DialogDescription>
          </DialogHeader>
          {videoSelectorSlot !== null && (
            <div className="flex-1 overflow-hidden min-h-0">
              <VideoManager
                mode="select"
                onVideoSelect={(path) => { handleSlotChange(videoSelectorSlot, 'filePath', path); setVideoSelectorSlot(null) }}
                onClose={() => setVideoSelectorSlot(null)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog >

      {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â Confirm Dialog Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
      < Dialog open={confirmDialog?.open} onOpenChange={(open) => !open && setConfirmDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('confirm')}</DialogTitle>
            <DialogDescription>{confirmDialog?.action}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>{t('cancel')}</Button>
            <Button variant="default" onClick={confirmDialog?.onConfirm}>{t('confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* ── Advanced Stream Settings Dialog ── */}
      <Dialog open={settingsSlot !== null} onOpenChange={(open) => !open && setSettingsSlot(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col bg-card border border-border shadow-2xl overflow-hidden rounded-xl" dir={dir}>
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/80 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-foreground">
              <Settings className="w-5.5 h-5.5 text-primary" />
              {t('advancedSettings')} #{settingsSlot !== null ? settingsSlot + 1 : ''}
              {settingsSlot !== null && slots.find(s => s.slotIndex === settingsSlot)?.channelName && (
                <span className="text-sm font-normal text-muted-foreground ml-2 bg-muted px-2 py-0.5 rounded-full">
                  {slots.find(s => s.slotIndex === settingsSlot)?.channelName}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground/80 mt-1">
              {locale === 'ar' 
                ? 'إعدادات تبديل الفيديو قبل الانتهاء وأتمتة البث المباشر على يوتيوب.' 
                : 'Configure pre-stop video swap and automated YouTube live stream options.'}
            </DialogDescription>
          </DialogHeader>

          {/* Dialog Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Tabs Selector */}
            <div className="flex bg-muted/60 p-1 rounded-lg border border-border/40 shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('swap')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 ${
                  activeTab === 'swap'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <span>🔁</span>
                {t('preStopSwap')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('youtube')}
                className={`flex-1 py-2 text-xs font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 ${
                  activeTab === 'youtube'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
                }`}
              >
                <Youtube className="w-3.5 h-3.5 text-red-500" />
                {locale === 'ar' ? 'أتمتة اليوتيوب' : 'YouTube Automation'}
              </button>
            </div>

            {settingsData && (
              <div className="space-y-6 min-h-[300px]">
                {activeTab === 'swap' && (
                  /* Pre-Stop Swap Video Tab */
                  <div className="space-y-6">
                    {/* Toggle: Enable Pre-Stop Swap */}
                    <div className="flex items-center justify-between p-4 bg-muted/30 border border-border/80 rounded-xl hover:bg-muted/40 transition-colors">
                      <div className="space-y-0.5">
                        <label htmlFor="swapVideoEnabled-toggle" className="text-sm font-bold text-foreground cursor-pointer">
                          {t('enablePreStopSwap')}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {t('enablePreStopSwapDesc')}
                        </p>
                      </div>
                      <Checkbox
                        id="swapVideoEnabled-toggle"
                        checked={settingsData.swapVideoEnabled}
                        onCheckedChange={(checked) => setSettingsData(p => p ? { ...p, swapVideoEnabled: !!checked } : p)}
                        className="w-5 h-5 accent-primary"
                      />
                    </div>

                    {/* Swap Video File Selection */}
                    {settingsData.swapVideoEnabled && (
                      <div className="space-y-3 p-4 bg-muted/30 border border-border/80 rounded-xl">
                        <label className="text-sm font-bold text-foreground block">
                          {t('swapVideoFile')}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {t('preStopSwapDesc')}
                        </p>

                        {settingsData.swapVideoPath ? (
                          <div className="flex items-center justify-between bg-card border border-border px-3 py-2 rounded-lg text-xs font-mono">
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <span className="shrink-0 text-base">📹</span>
                              <span className="truncate text-foreground/95" title={settingsData.swapVideoPath}>
                                {settingsData.swapVideoPath.split(/[/\\]/).pop()}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md shrink-0 transition-colors ml-1"
                              onClick={() => setSettingsData(p => p ? { ...p, swapVideoPath: '' } : p)}
                              title={locale === 'ar' ? 'إزالة ملف الفيديو' : 'Remove Swap Video'}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full flex items-center justify-center gap-2 text-xs border-dashed border-2 hover:bg-muted/50 border-border/80 h-10 transition-all rounded-lg"
                            onClick={() => setSwapSelectorOpen(true)}
                          >
                            <FolderOpen className="w-4 h-4 text-muted-foreground" />
                            {t('selectSwapVideo')}
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Helpful Warning if no schedStop is set */}
                    {settingsData.swapVideoEnabled && !slots.find(s => s.slotIndex === settingsSlot)?.schedStop && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-600 dark:text-amber-400 flex gap-2">
                        <span className="text-base select-none">⚠️</span>
                        <div>
                          <p className="font-bold">{t('swapVideoNoStop')}</p>
                          <p className="opacity-90 mt-0.5">
                            {locale === 'ar'
                              ? 'قم بتعيين موعد إيقاف البث في لوحة التحكم لتفعيل عمل التبديل التلقائي.'
                              : 'Set a scheduled stop time in the main channel card to let this swap trigger.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Informative Note if configured correctly */}
                    {settingsData.swapVideoEnabled && slots.find(s => s.slotIndex === settingsSlot)?.schedStop && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-600 dark:text-emerald-400 flex gap-2">
                        <span className="text-base select-none">✅</span>
                        <div>
                          <p className="font-bold">{t('swapVideoActive')}</p>
                          <p className="opacity-90 mt-0.5">
                            {locale === 'ar'
                              ? `البث سينتقل تلقائياً للفيديو المختار قبل 10 دقائق من موعد الإيقاف المحدد: ${slots.find(s => s.slotIndex === settingsSlot)?.schedStop}.`
                              : `Broadcast will switch automatically to this video 10 minutes before stop time: ${slots.find(s => s.slotIndex === settingsSlot)?.schedStop}.`}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'youtube' && (
                  /* YouTube Automation Tab */
                  <div className="space-y-6">
                    {/* Bound Channel Selection */}
                    <div className="space-y-1.5 p-4 bg-muted/30 border border-border/80 rounded-xl">
                      <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                        <Youtube className="w-4 h-4 text-red-500" />
                        {locale === 'ar' ? 'ربط القناة للبث المباشر التلقائي' : 'Bind Channel for Automated Streaming'}
                      </label>
                      <p className="text-xs text-muted-foreground mb-2">
                        {locale === 'ar'
                          ? 'اختر القناة التي ترغب في إنشاء البث عليها تلقائياً عند بدء البث.'
                          : 'Select which YouTube channel to automatically create the broadcast and start keys on.'}
                      </p>
                      <select
                        value={settingsData.youtubeChannelId || ''}
                        onChange={(e) => {
                          const channelId = e.target.value
                          setSettingsData(p => p ? { ...p, youtubeChannelId: channelId, streamKey: '', rtmpServer: '' } : p)
                          if (channelId) {
                            fetchYtStreamKeys(channelId)
                          }
                        }}
                        className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        dir="ltr"
                      >
                        <option value="">{locale === 'ar' ? '-- بدون أتمتة البث على يوتيوب --' : '-- No YouTube Stream Automation --'}</option>
                        {ytChannels.map(ch => (
                          <option key={ch.id} value={ch.id}>
                            {ch.name} ({ch.channelTitle})
                          </option>
                        ))}
                      </select>

                      {/* Quick link row: refresh + add new channel directly from slot settings */}
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          onClick={() => fetchYtChannels()}
                          disabled={ytLoading}
                          className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 rounded px-2 py-1 transition-all disabled:opacity-50 shrink-0"
                          title={locale === 'ar' ? 'تحديث قائمة القنوات' : 'Refresh channel list'}
                        >
                          {ytLoading ? <span className="animate-spin inline-block">⟳</span> : <span>↻</span>}
                          {locale === 'ar' ? 'تحديث' : 'Refresh'}
                        </button>
                        <Input
                          value={ytSlotLinkName}
                          onChange={(e) => setYtSlotLinkName(e.target.value)}
                          placeholder={locale === 'ar' ? 'اسم قناة جديدة للربط...' : 'New channel nickname...'}
                          className="flex-1 h-7 text-xs bg-background"
                          dir="auto"
                        />
                        <button
                          type="button"
                          disabled={!ytSlotLinkName.trim()}
                          onClick={() => {
                            const authUrl = `/api/auth/youtube/redirect?name=${encodeURIComponent(ytSlotLinkName.trim())}`
                            window.open(authUrl, '_blank')
                            alert(locale === 'ar'
                              ? 'سيتم فتح نافذة ترخيص Google. أتمم تسجيل الدخول ثم انقر "تحديث" لرؤية القناة.'
                              : 'Google authorization window will open. Complete login then click Refresh to see the channel.')
                          }}
                          className="flex items-center gap-1 text-[10px] text-white bg-red-600 hover:bg-red-500 disabled:opacity-40 rounded px-2 py-1 transition-all font-semibold shrink-0"
                        >
                          <Youtube className="w-3 h-3" />
                          {locale === 'ar' ? 'ربط' : 'Link'}
                        </button>
                      </div>
                    </div>

                    {settingsData.youtubeChannelId && (
                      <>
                        {/* Stream Key Selection Dropdown */}
                        <div className="space-y-1.5 p-4 bg-muted/30 border border-border/80 rounded-xl">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                              <span>🔑</span>
                              {locale === 'ar' ? 'مفتاح البث' : 'Stream Key'}
                            </label>
                            <button
                              type="button"
                              onClick={() => fetchYtStreamKeys(settingsData.youtubeChannelId, true)}
                              disabled={ytStreamKeysLoading}
                              className="flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-400 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 rounded px-2 py-1 transition-all disabled:opacity-50"
                            >
                              {ytStreamKeysLoading ? (
                                <><span className="animate-spin inline-block">⟳</span> {locale === 'ar' ? 'جارٍ الجلب...' : 'Fetching...'}</>
                              ) : (
                                <><span>↻</span> {locale === 'ar' ? 'تحديث المفاتيح' : 'Fetch Keys'}</>
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">
                            {locale === 'ar'
                              ? 'اختر مفتاح البث من القناة أو اتركه فارغاً ليتم الجلب التلقائي عند بدء البث.'
                              : 'Select a stream key from your channel, or leave empty to auto-fetch when stream starts.'}
                          </p>

                          {ytStreamKeysError && (
                            <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded p-2 mb-2">
                              ⚠️ {ytStreamKeysError}
                            </div>
                          )}

                          <select
                            value={settingsData.streamKey || ''}
                            onChange={(e) => {
                              const val = e.target.value
                              if (!val) {
                                setSettingsData(p => p ? { ...p, streamKey: '', rtmpServer: '' } : p)
                                return
                              }
                              // Find the matching stream key object to also get rtmpServer
                              const found = ytStreamKeys.find(k => k.streamKey === val)
                              setSettingsData(p => p ? {
                                ...p,
                                streamKey: found?.streamKey || val,
                                rtmpServer: found?.rtmpServer || 'rtmp://a.rtmp.youtube.com/live2'
                              } : p)
                            }}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            dir="ltr"
                          >
                            <option value="">
                              {ytStreamKeysLoading
                                ? (locale === 'ar' ? 'جارٍ التحميل...' : 'Loading...')
                                : (locale === 'ar' ? '-- جلب تلقائي (موصى به) --' : '-- Auto-Fetch (Recommended) --')}
                            </option>
                            {ytStreamKeys.map(k => (
                              <option key={k.id} value={k.streamKey}>
                                {k.title}{k.status === 'active' ? ' ✅' : ''}
                              </option>
                            ))}
                          </select>

                          {settingsData.streamKey && (
                            <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg text-[10px] font-mono text-green-600 dark:text-green-400 flex items-center gap-2 overflow-hidden">
                              <span className="shrink-0">✓</span>
                              <span className="truncate" title={settingsData.streamKey}>
                                {settingsData.streamKey.substring(0, 8)}••••
                              </span>
                            </div>
                          )}
                        </div>
                        {/* Title character counter & validation */}
                        <div className="space-y-1.5 p-4 bg-muted/30 border border-border/80 rounded-xl">
                          <div className="flex justify-between items-center">
                            <label className="text-sm font-bold text-foreground">
                              {locale === 'ar' ? 'عنوان البث المباشر' : 'Live Stream Title'}
                            </label>
                            <span className="text-[10px] text-muted-foreground font-mono font-semibold">
                              {settingsData.youtubeTitle.length} / 100
                            </span>
                          </div>
                          <Input
                            maxLength={100}
                            value={settingsData.youtubeTitle}
                            onChange={(e) => setSettingsData(p => p ? { ...p, youtubeTitle: e.target.value } : p)}
                            placeholder={locale === 'ar' ? 'العنوان الافتراضي: Live Stream' : 'Default: Live Stream'}
                            dir="auto"
                          />
                        </div>

                        {/* Description character counter & validation */}
                        <div className="space-y-1.5 p-4 bg-muted/30 border border-border/80 rounded-xl">
                          <div className="flex justify-between items-center">
                            <label className="text-sm font-bold text-foreground">
                              {locale === 'ar' ? 'وصف البث المباشر' : 'Live Stream Description'}
                            </label>
                            <span className="text-[10px] text-muted-foreground font-mono font-semibold">
                              {settingsData.youtubeDescription.length} / 4500
                            </span>
                          </div>
                          <textarea
                            maxLength={4500}
                            rows={4}
                            value={settingsData.youtubeDescription}
                            onChange={(e) => setSettingsData(p => p ? { ...p, youtubeDescription: e.target.value } : p)}
                            placeholder={locale === 'ar' ? 'أدخل تفاصيل البث ووسومه...' : 'Enter stream description, tags, etc...'}
                            className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                            dir="auto"
                          />
                        </div>

                        {/* PNG Thumbnail Picker */}
                        <div className="space-y-1.5 p-4 bg-muted/30 border border-border/80 rounded-xl">
                          <label className="text-sm font-bold text-foreground block">
                            {locale === 'ar' ? 'صورة مصغرة مخصصة (Thumbnail)' : 'Custom Thumbnail Image'}
                          </label>
                          <p className="text-xs text-muted-foreground mb-2">
                            {locale === 'ar'
                              ? 'صورة PNG حصرياً وحجمها أقل من 2 ميجابايت.'
                              : 'Strictly PNG format and under 2MB limit.'}
                          </p>

                          {settingsData.youtubeThumbnailPath ? (
                            <div className="flex items-center justify-between bg-card border border-border px-3 py-2 rounded-lg text-xs font-mono">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="shrink-0 text-base">🖼️</span>
                                <span className="truncate text-foreground/95" title={settingsData.youtubeThumbnailPath}>
                                  {settingsData.youtubeThumbnailPath.split(/[/\\]/).pop()}
                                </span>
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md shrink-0 transition-colors ml-1"
                                onClick={() => setSettingsData(p => p ? { ...p, youtubeThumbnailPath: '' } : p)}
                                title={locale === 'ar' ? 'إزالة الصورة' : 'Remove Thumbnail'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full flex items-center justify-center gap-2 text-xs border-dashed border-2 hover:bg-muted/50 border-border/80 h-10 transition-all rounded-lg"
                              onClick={() => setThumbnailSelectorOpen(true)}
                            >
                              <FolderOpen className="w-4 h-4 text-muted-foreground" />
                              {locale === 'ar' ? 'اختر صورة غلاف PNG' : 'Select PNG Thumbnail Image'}
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dialog Footer */}
          <DialogFooter className="px-6 py-4 bg-muted/40 border-t border-border/80 shrink-0 flex gap-2 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSettingsSlot(null)}
              className="text-xs"
            >
              {t('cancel')}
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={async () => {
                if (settingsSlot === null || !settingsData) return
                try {
                  // Build the update payload
                  const settingsSavePayload: Partial<StreamSlot> = {
                    swapVideoPath: settingsData.swapVideoPath,
                    swapVideoEnabled: settingsData.swapVideoEnabled,
                    youtubeChannelId: settingsData.youtubeChannelId || null,
                    youtubeTitle: settingsData.youtubeTitle,
                    youtubeDescription: settingsData.youtubeDescription,
                    youtubeThumbnailPath: settingsData.youtubeThumbnailPath,
                  }
                  // Always save streamKey when a YouTube channel is linked
                  // (empty string = auto-fetch mode, non-empty = specific key chosen)
                  if (settingsData.youtubeChannelId) {
                    settingsSavePayload.streamKey = settingsData.streamKey || ''
                    settingsSavePayload.rtmpServer = settingsData.rtmpServer || 'rtmp://a.rtmp.youtube.com/live2'
                  }
                  // If no channel linked, don't touch streamKey/rtmpServer from this dialog
                  await updateSlot(settingsSlot, settingsSavePayload)
                  addLog(locale === 'ar' ? `القناة ${settingsSlot + 1}: تم حفظ الإعدادات المتقدمة بنجاح` : `Slot ${settingsSlot + 1}: Advanced settings saved successfully`)
                } catch {
                  addLog(`Slot ${settingsSlot + 1}: Error saving advanced settings`)
                }
                setSettingsSlot(null)
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs px-5 shadow-md"
            >
              {t('saveSettings')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Thumbnail Selector Helper Dialog ── */}
      <Dialog open={thumbnailSelectorOpen} onOpenChange={(open) => !open && setThumbnailSelectorOpen(false)}>
        <DialogContent className="sm:max-w-5xl w-[95vw] max-h-[95vh] h-[90vh] flex flex-col bg-card border shadow-2xl rounded-xl">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <FolderOpen className="w-5 h-5 text-primary" />
              {locale === 'ar' ? 'اختر صورة غلاف البث' : 'Select Stream Thumbnail Image'} #{settingsSlot !== null ? settingsSlot + 1 : ''}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === 'ar' 
                ? 'تصفح واختر ملف صورة (يجب أن يكون بصيغة PNG وبحجم أقل من 2 ميجابايت).' 
                : 'Browse and select an image file (must be strictly PNG and size under 2MB).'}
            </DialogDescription>
          </DialogHeader>
          {thumbnailSelectorOpen && (
            <div className="flex-1 overflow-hidden min-h-0 px-4">
              <VideoManager
                mode="select"
                onVideoSelect={(path) => {
                  if (!path.toLowerCase().endsWith('.png')) {
                    alert(locale === 'ar' 
                      ? 'عذراً، يجب اختيار ملف بصيغة PNG فقط لصورة الغلاف!' 
                      : 'Please select a strictly PNG file format for the thumbnail!')
                    return
                  }
                  setSettingsData(p => p ? { ...p, youtubeThumbnailPath: path } : p)
                  setThumbnailSelectorOpen(false)
                }}
                onClose={() => setThumbnailSelectorOpen(false)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Swap Video Selector Helper Dialog ── */}
      <Dialog open={swapSelectorOpen} onOpenChange={(open) => !open && setSwapSelectorOpen(false)}>
        <DialogContent className="sm:max-w-5xl w-[95vw] max-h-[95vh] h-[90vh] flex flex-col bg-card border shadow-2xl rounded-xl">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <FolderOpen className="w-5 h-5 text-primary" />
              {t('selectSwapVideo')} #{settingsSlot !== null ? settingsSlot + 1 : ''}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === 'ar' ? 'تصفح واختر ملف فيديو مسجل مسبقاً (MP4, MKV, AVI) للتبديل قبل انتهاء البث.' : 'Browse and select a pre-recorded video file (MP4, MKV, AVI) for the pre-stop swap.'}
            </DialogDescription>
          </DialogHeader>
          {swapSelectorOpen && (
            <div className="flex-1 overflow-hidden min-h-0 px-4">
              <VideoManager
                mode="select"
                onVideoSelect={(path) => {
                  setSettingsData(p => p ? { ...p, swapVideoPath: path } : p)
                  setSwapSelectorOpen(false)
                }}
                onClose={() => setSwapSelectorOpen(false)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── YouTube Channels Manager Dialog ── */}
      <Dialog open={ytManagerOpen} onOpenChange={(open) => !open && setYtManagerOpen(false)}>
        <DialogContent className="sm:max-w-3xl w-[95vw] max-h-[90vh] flex flex-col bg-card border border-border shadow-2xl rounded-xl" dir={dir}>
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border/80">
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Youtube className="w-6 h-6 text-red-500 animate-pulse" />
              {locale === 'ar' ? 'إدارة قنوات اليوتيوب المرتبطة' : 'Linked YouTube Channels Manager'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              {locale === 'ar' 
                ? 'اربط قنواتك التابعة لـ Google لبدء البث عليها بضغطة زر مع ضبط العنوان والغلاف التلقائي.' 
                : 'Link Google-authenticated YouTube channels to enable automatic stream initialization, metadata updates, and custom PNG thumbnails.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-h-[350px]">


            {/* Form: Link a new channel */}
            <div className="p-4 bg-muted/40 border border-border rounded-xl space-y-4">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                🔗 {locale === 'ar' ? 'ربط قناة جديدة' : 'Link New Channel'}
              </h4>
              <p className="text-xs text-muted-foreground">
                {locale === 'ar' 
                  ? 'أدخل اسماً مستعاراً مخصصاً ليسهل عليك اختيار هذه القناة في إعدادات البث (مثال: قناة البث العام، قناة التلاوات).' 
                  : 'Enter a custom nickname to easily identify this channel when binding to slots (e.g. Main Channel, Recitations).'}
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  value={ytLinkName}
                  onChange={(e) => setYtLinkName(e.target.value)}
                  placeholder={locale === 'ar' ? 'اسم القناة المخصص (مثال: قناة القرآن الكريم المباشرة)' : 'Custom nickname (e.g. Holy Quran Live Channel)'}
                  className="flex-1 bg-background"
                  dir="auto"
                />
                <Button
                  disabled={!ytLinkName.trim()}
                  onClick={() => {
                    const authUrl = `/api/auth/youtube/redirect?name=${encodeURIComponent(ytLinkName.trim())}`
                    window.open(authUrl, '_blank')
                    // Instruct user to reload list after login
                    alert(locale === 'ar' 
                      ? 'سيتم فتح نافذة ترخيص Google. يرجى إتمام عملية تسجيل الدخول بنجاح، ثم انقر على زر تحديث القائمة.' 
                      : 'Google authorization window will open. Complete the login, then click refresh list.')
                  }}
                  className="bg-red-600 hover:bg-red-500 text-white font-bold px-5 flex items-center gap-2 shadow-md transition-all duration-200"
                >
                  <Youtube className="w-4 h-4" />
                  {locale === 'ar' ? 'ترخيص وربط القناة' : 'Authorize & Link Channel'}
                </Button>
              </div>
            </div>

            {/* List of channels */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-sm font-bold text-foreground">
                  🔑 {locale === 'ar' ? 'القنوات المرتبطة حالياً' : 'Currently Linked Channels'}
                </h4>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={fetchYtChannels} 
                  disabled={ytLoading}
                  className="h-8 text-xs flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${ytLoading ? 'animate-spin' : ''}`} />
                  {locale === 'ar' ? 'تحديث القائمة' : 'Refresh List'}
                </Button>
              </div>

              {ytLoading && ytChannels.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-muted-foreground text-xs gap-2 border border-dashed rounded-xl bg-muted/20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span>{locale === 'ar' ? 'جاري تحميل القنوات...' : 'Loading channels...'}</span>
                </div>
              ) : ytChannels.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs border border-dashed rounded-xl bg-muted/10">
                  📭 {locale === 'ar' ? 'لا توجد قنوات مرتبطة حالياً. استخدم النموذج أعلاه لربط قناتك.' : 'No channels linked yet. Use the form above to link one.'}
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="text-xs font-semibold px-4 py-2.5">{locale === 'ar' ? 'الاسم المستعار' : 'Nickname'}</TableHead>
                        <TableHead className="text-xs font-semibold px-4 py-2.5">{locale === 'ar' ? 'عنوان يوتيوب الرسمي' : 'Official YouTube Title'}</TableHead>
                        <TableHead className="text-xs font-semibold px-4 py-2.5 text-center" style={{ width: 150 }}>{locale === 'ar' ? 'انتهاء الصلاحية' : 'Token Expiry'}</TableHead>
                        <TableHead className="text-xs font-semibold px-4 py-2.5 text-center" style={{ width: 80 }}></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ytChannels.map(ch => {
                        // Calculate 7-day expiry countdown from createdAt
                        const createdMs = ch.createdAt ? new Date(ch.createdAt).getTime() : Date.now()
                        const expiryMs = createdMs + 7 * 24 * 60 * 60 * 1000
                        const remainMs = expiryMs - Date.now()
                        const remainDays = Math.floor(remainMs / (24 * 60 * 60 * 1000))
                        const remainHours = Math.floor((remainMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
                        const isExpired = remainMs <= 0
                        const isUrgent = !isExpired && remainDays < 2
                        return (
                        <TableRow key={ch.id} className="hover:bg-muted/20 transition-colors">
                          <TableCell className="px-4 py-3 font-semibold text-xs text-foreground/95">{ch.name}</TableCell>
                          <TableCell className="px-4 py-3 text-xs text-muted-foreground font-mono">{ch.channelTitle}</TableCell>
                          <TableCell className="px-4 py-3 text-xs text-center">
                            {isExpired ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 font-bold text-[10px]">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                                {locale === 'ar' ? '⚠ منتهي الصلاحية' : '⚠ Expired'}
                              </span>
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                  isUrgent
                                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                                    : 'bg-green-500/10 text-green-600 dark:text-green-400'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                                    isUrgent ? 'bg-orange-500' : 'bg-green-500'
                                  }`} />
                                  {remainDays}d {remainHours}h
                                </span>
                                <span className="text-[9px] text-muted-foreground">
                                  {locale === 'ar' ? 'متبقي من 7 أيام' : 'of 7-day limit'}
                                </span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {ytUnlinkConfirm !== ch.id && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-blue-500 hover:text-blue-600 hover:bg-blue-500/10 rounded-md shrink-0 transition-colors"
                                  onClick={() => {
                                    const authUrl = `/api/auth/youtube/redirect?name=${encodeURIComponent(ch.name)}`
                                    window.open(authUrl, '_blank')
                                    alert(locale === 'ar' 
                                      ? 'سيتم فتح نافذة ترخيص Google لتجديد صلاحية القناة. بعد إتمام الدخول بنجاح، انقر على زر تحديث القائمة.' 
                                      : 'Google authorization window will open to renew channel credentials. Complete the login, then click refresh list.')
                                  }}
                                  title={locale === 'ar' ? 'تجديد الترخيص / إعادة ربط القناة' : 'Renew License / Re-link Channel'}
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </Button>
                              )}

                              {ytUnlinkConfirm === ch.id ? (
                                <div className="flex items-center justify-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={async () => {
                                      try {
                                        const res = await fetch(`/api/youtube/channels?id=${ch.id}`, { method: 'DELETE' })
                                        const data = await res.json()
                                        if (data.success) {
                                          addLog(locale === 'ar' ? `تم إلغاء ربط القناة: ${ch.name}` : `Unlinked channel: ${ch.name}`)
                                          fetchYtChannels()
                                          fetchSlots()
                                        } else {
                                          alert(data.error || 'Failed to unlink channel')
                                        }
                                      } catch {
                                        alert('Network error')
                                      } finally {
                                        setYtUnlinkConfirm(null)
                                      }
                                    }}
                                  >
                                    {locale === 'ar' ? 'تأكيد' : 'Confirm'}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 px-2 text-[10px]"
                                    onClick={() => setYtUnlinkConfirm(null)}
                                  >
                                    {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10 rounded-md shrink-0 transition-colors"
                                  onClick={() => setYtUnlinkConfirm(ch.id)}
                                  title={locale === 'ar' ? 'إلغاء ربط القناة' : 'Unlink Channel'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 py-4 bg-muted/40 border-t border-border/80 shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setYtManagerOpen(false)}
              className="text-xs"
            >
              {locale === 'ar' ? 'إغلاق' : 'Close'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Change Password Dialog ── */}
      <Dialog open={pwDialogOpen} onOpenChange={(open) => !open && setPwDialogOpen(false)}>
        <DialogContent className="sm:max-w-md" dir={dir}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              🔑 {locale === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}
            </DialogTitle>
            <DialogDescription>
              {locale === 'ar'
                ? 'أدخل إجابة سؤال الأمان ثم كلمة المرور الجديدة. سيُعاد تشغيل النظام خلال لحظات.'
                : 'Enter your security question answer and a new password. System will restart briefly.'}
            </DialogDescription>
          </DialogHeader>
          {pwSuccess ? (
            <div className="py-8 text-center">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-semibold text-green-600">
                {locale === 'ar' ? 'تم تغيير كلمة المرور بنجاح! سيتم إعادة تشغيل النظام خلال لحظات.' : 'Password changed successfully! The system will restart shortly.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4 py-2">
              {pwError && (
                <div className="bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 text-sm p-3 rounded-md border border-red-200 dark:border-red-800">
                  {pwError}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                {pwResetQuestion ? (
                  <div className="bg-muted/50 border border-border/70 rounded-md p-3 text-sm font-medium" dir={dir}>
                    <span className="text-xs text-muted-foreground block mb-1">{locale === 'ar' ? 'سؤال إعادة التعيين:' : 'Security Question:'}</span>
                    {pwResetQuestion}
                  </div>
                ) : (
                  <div className="text-sm text-foreground bg-primary/10 border border-primary/20 rounded p-3 text-center font-medium">
                    {t('resetQuestionRequired')}
                  </div>
                )}
                <label className="text-sm font-semibold">
                  {locale === 'ar' ? 'إجابتك على السؤال' : 'Your Answer'}
                </label>
                <Input
                  value={pwResetAnswer}
                  onChange={(e) => setPwResetAnswer(e.target.value)}
                  placeholder={locale === 'ar' ? '5 أحرف/أرقام كما حُدد مسبقًا' : '5-char answer as set by admin'}
                  dir="ltr"
                  className="font-mono"
                  maxLength={5}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold">
                  {locale === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}
                </label>
                <Input
                  type="password"
                  value={pwNewPassword}
                  onChange={(e) => setPwNewPassword(e.target.value)}
                  placeholder={locale === 'ar' ? '6 أحرف على الأقل' : 'At least 6 characters'}
                  dir="ltr"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold">
                  {locale === 'ar' ? 'تأكيد كلمة المرور' : 'Confirm Password'}
                </label>
                <Input
                  type="password"
                  value={pwConfirmPassword}
                  onChange={(e) => setPwConfirmPassword(e.target.value)}
                  placeholder={locale === 'ar' ? 'أعد كتابة كلمة المرور' : 'Repeat password'}
                  dir="ltr"
                />
              </div>
            </div>
          )}
          {!pwSuccess && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setPwDialogOpen(false)} disabled={pwLoading}>
                {locale === 'ar' ? 'إلغاء' : 'Cancel'}
              </Button>
              <Button
                variant="default"
                disabled={pwLoading || !pwResetAnswer || !pwNewPassword || !pwConfirmPassword}
                onClick={async () => {
                  setPwError('')
                  if (pwNewPassword !== pwConfirmPassword) {
                    setPwError(locale === 'ar' ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match')
                    return
                  }
                  if (pwNewPassword.length < 6) {
                    setPwError(locale === 'ar' ? 'كلمة المرور قصيرة جداً' : 'Password too short')
                    return
                  }
                  setPwLoading(true)
                  try {
                    const res = await fetch('/api/settings/password', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', 'Accept-Language': locale },
                      body: JSON.stringify({ resetAnswer: pwResetAnswer, newPassword: pwNewPassword })
                    })
                    const data = await res.json()
                    if (data.success) {
                      setPwSuccess(true)
                    } else {
                      setPwError(data.error || (locale === 'ar' ? 'حدث خطأ' : 'An error occurred'))
                    }
                  } catch {
                    setPwError(locale === 'ar' ? 'تعذر الاتصال' : 'Connection failed')
                  } finally {
                    setPwLoading(false)
                  }
                }}
              >
                {pwLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {locale === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div >
  )
}
