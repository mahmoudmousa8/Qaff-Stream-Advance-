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
  Sun, Moon, Calendar, AlertCircle, Activity,
  Loader2, ChevronLeft, ChevronRight, FolderOpen, HardDrive,
  Film, Globe, LogOut, Copy, Check, FileText, Wifi, Search, Settings, Trash2, Youtube, X, ImageIcon, CalendarX, Edit3,
  Shuffle, Plus, List, BookOpen, Dices, Link2, Sparkles, FileVideo, Upload, Download, ChevronDown, RepeatIcon
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  hourly: boolean
  repeat15m?: boolean
  repeat30m?: boolean
  repeat1h?: boolean
  repeat2h?: boolean
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
  titleDescListId?: string | null
  episodeNumber?: number
}

export interface TitleDescList {
  id: string
  name: string
  items: string
  createdAt: string
  updatedAt: string
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

function getLogColor(message: string) {
  const msg = message.toLowerCase()
  if (msg.includes('error') || msg.includes('fail') || msg.includes('خطأ')) return 'text-red-400'
  if (msg.includes('start') || msg.includes('success') || msg.includes('بدأ') || msg.includes('نجح')) return 'text-green-400'
  if (msg.includes('stop') || msg.includes('end') || msg.includes('إيقاف')) return 'text-orange-400'
  if (msg.includes('warn') || msg.includes('تحذير')) return 'text-yellow-400'
  return 'text-slate-300'
}

// ── Copy Button component ─────────────────────────────────────────────────────
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
  
  if (schedStop.startsWith('DUR ')) {
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

const isFolderOrImage = (p: string) => {
  const lastSegment = p.split(/[/\\]/).pop() || '';
  if (!lastSegment.includes('.')) return true; // It's a folder!
  const ext = lastSegment.split('.').pop()?.toLowerCase() || '';
  return ['png', 'jpg', 'jpeg'].includes(ext);
};

export default function Home() {
  const router = useRouter()
  const [user, setUser] = useState<{ role: 'admin' | 'user'; slotsLimit: number; securityKey: string } | null>(null)
  const [slots, setSlots] = useState<StreamSlot[]>([])
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'scheduled'>('all')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [selectedSlots, setSelectedSlots] = useState<number[]>([])
  const [bulkTitleDescOpen, setBulkTitleDescOpen] = useState(false)
  const [bulkEpisodeOpen, setBulkEpisodeOpen] = useState(false)
  const [bulkEpisode, setBulkEpisode] = useState(1)
  const [titleDescManagerOpen, setTitleDescManagerOpen] = useState(false)
  const [editingList, setEditingList] = useState<{ id?: string, name: string, pairs: { id: string, title: string, description: string }[] } | null>(null)
  const [editingListError, setEditingListError] = useState('')
  const [isSavingList, setIsSavingList] = useState(false)
  const [bulkRandomTitleDescOpen, setBulkRandomTitleDescOpen] = useState(false)
  const [titleDescLists, setTitleDescLists] = useState<TitleDescList[]>([])
  const [isFetchingLists, setIsFetchingLists] = useState(false)

  const fetchTitleDescLists = useCallback(async () => {
    setIsFetchingLists(true)
    try {
      const res = await fetch('/api/title-desc-lists')
      const data = await res.json()
      if (data.success) {
        setTitleDescLists(data.data)
      }
    } catch (e) {
      console.error('Failed to fetch title desc lists', e)
    } finally {
      setIsFetchingLists(false)
    }
  }, [])

  useEffect(() => {
    fetchTitleDescLists()
  }, [fetchTitleDescLists])

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editingList) return
    try {
      const XLSX = await import('xlsx')
      const reader = new FileReader()
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result
          const wb = XLSX.read(bstr, { type: 'binary' })
          const wsname = wb.SheetNames[0]
          const ws = wb.Sheets[wsname]
          const data = XLSX.utils.sheet_to_json(ws) as any[]
          
          const newPairs = data.map((row) => {
            const title = row['العنوان'] || row['Title'] || row['title'] || row['عنوان'] || ''
            const description = row['الوصف'] || row['Description'] || row['description'] || row['وصف'] || ''
            if (title || description) {
              return {
                id: Math.random().toString(36).substring(7),
                title: String(title).substring(0, 100),
                description: String(description).substring(0, 4500)
              }
            }
            return null
          }).filter(Boolean) as { id: string, title: string, description: string }[]

          if (newPairs.length > 0) {
            setEditingList({
              ...editingList,
              pairs: [...editingList.pairs, ...newPairs]
            })
          }
        } catch (err) {
          console.error(err)
          setEditingListError('فشل قراءة الملف. تأكد من أنه بصيغة Excel صالحة.')
        }
      }
      reader.readAsBinaryString(file)
    } catch (err) {
      console.error('Failed to load xlsx library', err)
      setEditingListError('تعذر تحميل مكتبة معالجة ملفات Excel')
    }
    e.target.value = ''
  }

  const handleDownloadTemplate = async () => {
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet([
        { 'العنوان': 'عنوان تجريبي 1', 'الوصف': 'وصف تجريبي 1 يكتب هنا...' },
        { 'العنوان': 'عنوان تجريبي 2', 'الوصف': 'وصف تجريبي 2 يكتب هنا...' },
        { 'العنوان': 'عنوان تجريبي 3', 'الوصف': 'وصف تجريبي 3 يكتب هنا...' }
      ])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "العناوين والأوصاف")
      XLSX.writeFile(wb, "Titles_Descriptions_Template.xlsx")
    } catch (err) {
      console.error('Failed to load xlsx library', err)
    }
  }


  const handleSaveList = async () => {
    if (!editingList || !editingList.name.trim()) return
    setEditingListError('')
    setIsSavingList(true)
    try {
      const payload = {
        name: editingList.name.trim(),
        items: JSON.stringify(editingList.pairs)
      }
      const url = editingList.id ? `/api/title-desc-lists/${editingList.id}` : '/api/title-desc-lists'
      const method = editingList.id ? 'PUT' : 'POST'
      
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.success) {
        addLog(locale === 'ar' ? 'تم حفظ القائمة بنجاح' : 'List saved successfully')
        setEditingList(null)
        setEditingListError('')
        fetchTitleDescLists()
      } else {
        setEditingListError(data.error || (locale === 'ar' ? 'حدث خطأ أثناء الحفظ' : 'Error saving list'))
      }
    } catch (e) {
      console.error(e)
      setEditingListError(locale === 'ar' ? 'تعذّر الاتصال بالخادم' : 'Could not connect to server')
    } finally {
      setIsSavingList(false)
    }
  }

  const handleDeleteList = async (id: string) => {
    const listName = titleDescLists.find(l => l.id === id)?.name || ''
    setConfirmDialog({
      open: true,
      action: locale === 'ar' ? `حذف قائمة "${listName}"؟` : `Delete list "${listName}"?`,
      onConfirm: async () => {
        setConfirmDialog(null)
        try {
          const res = await fetch(`/api/title-desc-lists/${id}`, { method: 'DELETE' })
          const data = await res.json()
          if (data.success) {
            addLog(locale === 'ar' ? 'تم حذف القائمة' : 'List deleted')
            fetchTitleDescLists()
            fetchSlots()
          }
        } catch (e) {
          console.error(e)
        }
      }
    })
  }

  const [bulkTitle, setBulkTitle] = useState('')
  const [bulkDesc, setBulkDesc] = useState('')
  const [targetSlotsForAction, setTargetSlotsForAction] = useState<number[] | undefined>(undefined)
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set())
  const [ytSearchQuery, setYtSearchQuery] = useState('')
  const [autoSave, setAutoSave] = useState(true)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalSlots, setTotalSlots] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [stats, setStats] = useState({ streaming: 0, scheduled: 0, stopped: 0, configured: 0, dailyCount: 0, weeklyCount: 0, hourlyCount: 0, renewalDate: null as string | null })

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
  const chatScrollRef = useRef<HTMLDivElement>(null)

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
    titleDescListId?: string | null
    episodeNumber: number
  } | null>(null)
  const [activeTab, setActiveTab] = useState<'swap' | 'youtube'>('swap')
  const [swapSelectorOpen, setSwapSelectorOpen] = useState(false)
  const [thumbnailSelectorOpen, setThumbnailSelectorOpen] = useState(false)
  const [bulkThumbnailSelectorOpen, setBulkThumbnailSelectorOpen] = useState(false)
  const [bulkSwapSelectorOpen, setBulkSwapSelectorOpen] = useState(false)
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [aiProvider, setAiProvider] = useState<'gemini' | 'agentrouter' | 'openrouter' | 'nvidia'>('gemini')
  const [aiModel, setAiModel] = useState('gemini-2.5-flash')
  const [isCustomModel, setIsCustomModel] = useState(false)
  const [customModelName, setCustomModelName] = useState('')
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'model' | 'function'; text?: string; parts?: any[] }[]>([])

  // YouTube stream keys state (for dropdown in settings dialog)
  const [ytStreamKeys, setYtStreamKeys] = useState<{ id: string; title: string; streamKey: string; rtmpServer: string; status: string }[]>([])
  const [ytStreamKeysLoading, setYtStreamKeysLoading] = useState(false)
  const [ytStreamKeysError, setYtStreamKeysError] = useState('')

  // Slot-level stream keys for the main table row dropdowns
  const [slotStreamKeys, setSlotStreamKeys] = useState<Record<number, { id: string; title: string; streamKey: string; rtmpServer: string }[]>>({})
  const [slotStreamKeysLoading, setSlotStreamKeysLoading] = useState<Record<number, boolean>>({})

  // AI assistant chat state
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false)
  const [aiInputValue, setAiInputValue] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [showAiSettings, setShowAiSettings] = useState(false)

  // YouTube channels manager state
  const [ytManagerOpen, setYtManagerOpen] = useState(false)
  const [ytChannels, setYtChannels] = useState<{ id: string; name: string; channelTitle: string; channelId: string; createdAt: string; updatedAt: string }[]>([])
  const [ytLoading, setYtLoading] = useState(false)
  const [ytLinkName, setYtLinkName] = useState('')
  const [ytSlotLinkName, setYtSlotLinkName] = useState('')
  const [ytSortConfig, setYtSortConfig] = useState<{ direction: 'asc' | 'desc' } | null>(null)
  const [ytUnlinkConfirm, setYtUnlinkConfirm] = useState<string | null>(null)
  const [ytCleanupLoading, setYtCleanupLoading] = useState<string | null>(null)
  const [cleanupBusy, setCleanupBusy] = useState(false)

  let filteredChannels = ytChannels.filter(ch =>
    (ch.name || '').toLowerCase().includes(ytSearchQuery.toLowerCase()) ||
    (ch.channelTitle || '').toLowerCase().includes(ytSearchQuery.toLowerCase())
  )

  if (ytSortConfig) {
    filteredChannels.sort((a, b) => {
      const aCreated = a.createdAt ? new Date(a.createdAt).getTime() : Date.now()
      const bCreated = b.createdAt ? new Date(b.createdAt).getTime() : Date.now()
      return ytSortConfig.direction === 'asc' ? aCreated - bCreated : bCreated - aCreated
    })
  }

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

    console.log(
      `%c🎥 Qaff Studio Streaming %c\n` +
      `%cProfessional Broadcasting Console %c\n` +
      `-----------------------------------------\n` +
      `Licensing & Technical Support: https://streamer.qaff.net\n` +
      `For Sales: +201202406944 / +201012656551\n` +
      `-----------------------------------------`,
      `color: #ef4444; font-size: 20px; font-weight: bold; font-family: sans-serif;`,
      ``,
      `color: #6366f1; font-size: 13px; font-weight: 500;`,
      ``
    )
  }, [fetchTunnelUrl])

  // Auto-scroll log to bottom
  useEffect(() => {
    if (logViewportRef.current) {
      logViewportRef.current.scrollTop = logViewportRef.current.scrollHeight
    }
  }, [logs])

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, aiLoading])

  // Reset YouTube manager state when closed
  useEffect(() => {
    if (!ytManagerOpen) {
      setSelectedChannels(new Set())
      setYtSearchQuery('')
    }
  }, [ytManagerOpen])

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

  // Cleanup upcoming/scheduled broadcasts on YouTube channel
  const handleCleanupUpcoming = async (channelDbId: string) => {
    if (!confirm(locale === 'ar' 
      ? 'هل أنت متأكد من رغبتك في حذف وإلغاء جميع البثوث المجدولة والقادمة المعلقة على هذه القناة في يوتيوب؟ لا يمكن التراجع عن هذا الإجراء.' 
      : 'Are you sure you want to delete and cancel all scheduled/upcoming pending broadcasts on this YouTube channel? This action cannot be undone.')) {
      return
    }
    setYtCleanupLoading(channelDbId)
    try {
      const res = await fetch('/api/youtube/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelDbId })
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        addLog(data.message)
      } else {
        alert(data.error || data.message || 'حدث خطأ أثناء تنظيف البثوث')
      }
    } catch (err: any) {
      alert(locale === 'ar' ? 'فشل الاتصال بالخادم' : 'Network error')
    } finally {
      setYtCleanupLoading(null)
    }
  }

  const handleDeleteSelectedChannels = async () => {
    if (selectedChannels.size === 0) return
    const confirmMsg = locale === 'ar' 
      ? `هل أنت متأكد من إلغاء ربط وحذف عدد ${selectedChannels.size} من القنوات المحددة؟`
      : `Are you sure you want to unlink and delete the ${selectedChannels.size} selected channels?`
    if (!confirm(confirmMsg)) return
    
    setYtLoading(true)
    try {
      const ids = Array.from(selectedChannels).join(',')
      const res = await fetch(`/api/youtube/channels?id=${encodeURIComponent(ids)}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) {
        addLog(locale === 'ar' ? 'تم حذف القنوات المحددة بنجاح' : 'Successfully deleted selected channels')
        setSelectedChannels(new Set())
        await fetchYtChannels()
        await fetchSlots()
      } else {
        alert(data.error || 'Failed to delete channels')
      }
    } catch {
      alert('Network error')
    } finally {
      setYtLoading(false)
    }
  }

  const handleCleanupSelectedChannels = async () => {
    if (selectedChannels.size === 0) return
    const confirmMsg = locale === 'ar'
      ? `هل تريد تنظيف البثوث المجدولة والمعلقة لـ ${selectedChannels.size} قنوات محددة؟`
      : `Do you want to clean up upcoming broadcasts for the ${selectedChannels.size} selected channels?`
    if (!confirm(confirmMsg)) return

    setCleanupBusy(true)
    try {
      const ids = Array.from(selectedChannels)
      const res = await fetch('/api/youtube/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelDbIds: ids })
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        setSelectedChannels(new Set())
        await fetchYtChannels()
      } else {
        alert(data.message || 'Cleanup failed')
      }
    } catch {
      alert('Network error')
    } finally {
      setCleanupBusy(false)
    }
  }

  const handleCleanupAllChannels = async () => {
    if (!confirm(locale === 'ar' 
      ? 'هل أنت متأكد من رغبتك في تنظيف وحذف جميع البثوث المجدولة والقادمة المعلقة لكافة القنوات النشطة (التي تم ربطها خلال 7 أيام)؟ لا يمكن التراجع عن هذا الإجراء وسيتم تخطي أي قناة ترجع خطأ.' 
      : 'Are you sure you want to cleanup and delete all scheduled/pending broadcasts on all active channels (linked within 7 days)? This cannot be undone and any channel returning an error will be skipped.')) {
      return
    }
    setCleanupBusy(true)
    try {
      const res = await fetch('/api/youtube/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true })
      })
      const data = await res.json()
      if (data.success) {
        alert(data.message)
        addLog(data.message)
        fetchYtChannels()
      } else {
        alert(data.error || data.message || 'حدث خطأ أثناء تنظيف البثوث')
      }
    } catch (err: any) {
      alert(locale === 'ar' ? 'فشل الاتصال بالخادم' : 'Network error')
    } finally {
      setCleanupBusy(false)
    }
  }

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

  // Load API key on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedKey = localStorage.getItem('qaff_gemini_api_key') || ''
      setGeminiApiKey(savedKey)
      const savedProvider = (localStorage.getItem('qaff_ai_provider') || 'gemini') as any
      setAiProvider(savedProvider)
      const savedModel = localStorage.getItem('qaff_gemini_model') || 'gemini-2.5-flash'
      setAiModel(savedModel)
      const savedIsCustom = localStorage.getItem('qaff_ai_is_custom') === 'true'
      setIsCustomModel(savedIsCustom)
      const savedCustomName = localStorage.getItem('qaff_ai_custom_name') || ''
      setCustomModelName(savedCustomName)
    }
  }, [])

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
      qs.set('_t', Date.now().toString())
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

  const handleRestartTunnel = async () => {
    setLoadingTunnel(true)
    addLog(locale === 'ar' ? 'جاري إعادة تشغيل النفق...' : 'Restarting Cloudflare Tunnel...')
    try {
      const res = await fetch('/api/tunnel', { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        addLog(locale === 'ar' ? 'تم إعادة تشغيل النفق بنجاح، جاري جلب الرابط الجديد...' : 'Tunnel restarted successfully, fetching new link...')
        await fetchTunnelUrl()
      } else {
        addLog(locale === 'ar' ? 'فشل إعادة تشغيل النفق: ' + (data.error || 'خطأ غير معروف') : 'Failed to restart tunnel: ' + (data.error || 'Unknown error'))
      }
    } catch {
      addLog(locale === 'ar' ? 'حدث خطأ أثناء الاتصال بالخادم لإعادة تشغيل التونل' : 'An error occurred while connecting to the server to restart the tunnel')
    } finally {
      setLoadingTunnel(false)
    }
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

    setSlots(prev => prev.map(slot =>
      slot.slotIndex === index ? { ...slot, ...updates } : slot
    ))
    updateSlot(index, updates)
  }

  const handleSlotMultipleChange = (index: number, updates: Partial<StreamSlot>) => {
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

  const resetSlot = (index: number) => {
    setConfirmDialog({
      open: true,
      action: locale === 'ar' ? `إعادة تعيين القناة #${index + 1}` : `Reset Channel #${index + 1}`,
      onConfirm: async () => {
        try {
          await fetch(`/api/slots/${index}/reset`, { method: 'POST' })
          addLog(`Slot ${index + 1}: Reset`)
          fetchSlots()
        } catch { addLog(`Slot ${index + 1}: Error resetting`) }
        setConfirmDialog(null)
      }
    })
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

  const handleClosest20Schedule = (index: number) => {
    const now = new Date()
    const target = new Date(now)
    const minutes = now.getMinutes()
    let targetMin = 0
    let targetHour = now.getHours()

    if (minutes < 20) {
      targetMin = 20
    } else if (minutes < 40) {
      targetMin = 40
    } else {
      targetMin = 0
      targetHour += 1
    }

    target.setHours(targetHour, targetMin, 0, 0)

    const startStr = String(target.getMonth()+1).padStart(2,'0') + "-" + String(target.getDate()).padStart(2,'0') + " " + String(target.getHours()).padStart(2,'0') + ":" + String(target.getMinutes()).padStart(2,'0')
    const stopStr = "DUR 00:13"  // 13 minutes duration
    handleSlotMultipleChange(index, {
      schedStart: startStr,
      schedStop: stopStr,
      hourly: true,
      daily: false,
      weekly: false,
      repeat15m: false,
      repeat30m: false,
      repeat1h: false,
      repeat2h: false,
      isScheduled: true,
      nextRunTime: ''
    })
  }

  const handleClosest30Schedule = (index: number) => {
    const now = new Date()
    const target = new Date(now)
    const minutes = now.getMinutes()
    let targetMin = 0
    let targetHour = now.getHours()

    if (minutes < 30) {
      targetMin = 30
    } else {
      targetMin = 0
      targetHour += 1
    }

    target.setHours(targetHour, targetMin, 0, 0)

    const startStr = String(target.getMonth()+1).padStart(2,'0') + "-" + String(target.getDate()).padStart(2,'0') + " " + String(target.getHours()).padStart(2,'0') + ":" + String(target.getMinutes()).padStart(2,'0')
    const stopStr = "DUR 00:24"  // 24 minutes duration
    handleSlotMultipleChange(index, {
      schedStart: startStr,
      schedStop: stopStr,
      hourly: false,
      daily: false,
      weekly: false,
      repeat15m: false,
      repeat30m: true,
      repeat1h: false,
      repeat2h: false,
      isScheduled: true,
      nextRunTime: ''
    })
  }

  const handleClosestHourSchedule = (index: number) => {
    const now = new Date()
    const target = new Date(now)
    let targetHour = now.getHours() + 1
    let targetMin = 0

    target.setHours(targetHour, targetMin, 0, 0)

    const startStr = String(target.getMonth()+1).padStart(2,'0') + "-" + String(target.getDate()).padStart(2,'0') + " " + String(target.getHours()).padStart(2,'0') + ":00"
    const stopStr = "DUR 00:50"  // 50 minutes duration
    handleSlotMultipleChange(index, {
      schedStart: startStr,
      schedStop: stopStr,
      hourly: false,
      daily: false,
      weekly: false,
      repeat15m: false,
      repeat30m: false,
      repeat1h: true,
      repeat2h: false,
      isScheduled: true,
      nextRunTime: ''
    })
  }

  const handleClosest2HourSchedule = (index: number) => {
    const now = new Date()
    const target = new Date(now)
    const currentHour = now.getHours()
    let targetHour = currentHour + (2 - (currentHour % 2))
    let targetMin = 0

    target.setHours(targetHour, targetMin, 0, 0)

    const startStr = String(target.getMonth()+1).padStart(2,'0') + "-" + String(target.getDate()).padStart(2,'0') + " " + String(target.getHours()).padStart(2,'0') + ":00"
    const stopStr = "DUR 01:50"  // 1 hour 50 minutes duration (110 minutes)
    handleSlotMultipleChange(index, {
      schedStart: startStr,
      schedStop: stopStr,
      hourly: false,
      daily: false,
      weekly: false,
      repeat15m: false,
      repeat30m: false,
      repeat1h: false,
      repeat2h: true,
      isScheduled: true,
      nextRunTime: ''
    })
  }

  const handleClosest10Schedule = (index: number) => {
    const now = new Date()
    const target = new Date(now)
    const minutes = now.getMinutes()
    let targetMin = 0
    let targetHour = now.getHours()

    if (minutes < 10) {
      targetMin = 10
    } else if (minutes < 20) {
      targetMin = 20
    } else if (minutes < 30) {
      targetMin = 30
    } else if (minutes < 40) {
      targetMin = 40
    } else if (minutes < 50) {
      targetMin = 50
    } else {
      targetMin = 0
      targetHour += 1
    }

    target.setHours(targetHour, targetMin, 0, 0)

    const startStr = String(target.getMonth()+1).padStart(2,'0') + "-" + String(target.getDate()).padStart(2,'0') + " " + String(target.getHours()).padStart(2,'0') + ":" + String(target.getMinutes()).padStart(2,'0')
    const stopStr = "DUR 00:06"  // 6 minutes duration
    handleSlotMultipleChange(index, {
      schedStart: startStr,
      schedStop: stopStr,
      hourly: false,
      daily: false,
      weekly: false,
      repeat10m: true,
      repeat15m: false,
      repeat30m: false,
      repeat1h: false,
      repeat2h: false,
      isScheduled: true,
      nextRunTime: ''
    })
  }

  const handleClosest15Schedule = (index: number) => {
    const now = new Date()
    const target = new Date(now)
    const minutes = now.getMinutes()
    let targetMin = 0
    let targetHour = now.getHours()

    if (minutes < 15) {
      targetMin = 15
    } else if (minutes < 30) {
      targetMin = 30
    } else if (minutes < 45) {
      targetMin = 45
    } else {
      targetMin = 0
      targetHour += 1
    }

    target.setHours(targetHour, targetMin, 0, 0)

    const startStr = String(target.getMonth()+1).padStart(2,'0') + "-" + String(target.getDate()).padStart(2,'0') + " " + String(target.getHours()).padStart(2,'0') + ":" + String(target.getMinutes()).padStart(2,'0')
    const stopStr = "DUR 00:09"  // 9 minutes duration
    handleSlotMultipleChange(index, {
      schedStart: startStr,
      schedStop: stopStr,
      hourly: false,
      daily: false,
      weekly: false,
      repeat15m: true,
      repeat30m: false,
      repeat1h: false,
      repeat2h: false,
      isScheduled: true,
      nextRunTime: ''
    })
  }

  const handleClientAction = (action: { name: string; target: string }) => {
    console.log('[AI Client Action] Executing:', action)
    if (action.name === 'navigateUI') {
      if (action.target === 'channels') {
        setYtManagerOpen(true)
      } else if (action.target === 'logs') {
        router.push('/logs')
      } else if (action.target === 'add_channel') {
        window.open('/api/auth/youtube/redirect', '_blank')
      } else if (action.target === 'slots') {
        fetchSlots()
      }
    }
    fetchSlots()
    fetchStats()
  }

  const handleSendAiMessage = async (customPrompt?: string) => {
    const promptToSend = customPrompt || aiInputValue
    if (!promptToSend.trim()) return

    const key = geminiApiKey.trim()
    if (!key) {
      alert(locale === 'ar' ? 'يرجى إدخال مفتاح API أولاً.' : 'Please enter API key first.')
      return
    }

    const newUserMsg: typeof chatMessages[number] = { role: 'user', text: promptToSend, parts: [{ text: promptToSend }] }
    const updatedHistory = [...chatMessages, newUserMsg]
    setChatMessages(updatedHistory)
    if (!customPrompt) setAiInputValue('')
    setAiLoading(true)

    try {
      const formattedContents = updatedHistory.map(msg => ({
        role: msg.role,
        parts: msg.parts || [{ text: msg.text || '' }]
      }))

      const activeModel = isCustomModel ? customModelName : aiModel

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key, provider: aiProvider, model: activeModel, messages: formattedContents })
      })

      const data = await res.json()
      if (data.error) {
        setChatMessages(prev => [...prev, { role: 'model', text: `Error: ${data.error}` }])
      } else {
        if (data.history) {
          const newHistory = data.history.map((msg: any) => {
            const text = msg.parts?.find((p: any) => p.text)?.text || '';
            return {
              role: msg.role,
              text,
              parts: msg.parts
            };
          });
          setChatMessages(newHistory);
        } else {
          setChatMessages(prev => [...prev, { role: 'model', text: data.reply }])
        }

        if (data.clientAction) {
          handleClientAction(data.clientAction)
        }
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { role: 'model', text: `Failed to connect: ${err.message}` }])
    } finally {
      setAiLoading(false)
    }
  }

  const handleSaveGeminiKey = (key: string, provider: string, model: string, isCustom: boolean, customName: string) => {
    localStorage.setItem('qaff_gemini_api_key', key)
    localStorage.setItem('qaff_ai_provider', provider)
    localStorage.setItem('qaff_gemini_model', model)
    localStorage.setItem('qaff_ai_is_custom', String(isCustom))
    localStorage.setItem('qaff_ai_custom_name', customName)
    
    setGeminiApiKey(key)
    setAiProvider(provider as any)
    setAiModel(model)
    setIsCustomModel(isCustom)
    setCustomModelName(customName)
    alert(locale === 'ar' ? 'تم حفظ الإعدادات بنجاح!' : 'Settings saved successfully!')
  }

  const bulkAction = async (action: string, ampm?: 'AM' | 'PM', payload?: any, targetSlotIndexes?: number[]) => {
    try {
      const res = await fetch('/api/slots/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ampm, slotIndexes: targetSlotIndexes, locale, ...payload })
      })
      const data = await res.json()
      addLog(data.message)
      if (['setTitleDescListAll', 'setTitleDescAll', 'setThumbnailAll', 'assignChannelsToSlots', 'setEpisodeNumberAll'].includes(action)) {
        alert(data.message)
      }
      if (action === 'assignChannelsToSlots' && data.assignedSlots) {
        setSelectedSlots(data.assignedSlots)
      }
      if (data.errors) data.errors.forEach((err: string) => addLog(err))
      fetchSlots(); fetchStats()
    } catch { addLog(`Error in bulk action: ${action}`) }
  }

  const confirmBulkAction = (action: string, actionName: string, ampm?: 'AM' | 'PM', targetSlotIndexes?: number[]) => {
    setConfirmDialog({ open: true, action: actionName, onConfirm: () => { bulkAction(action, ampm, undefined, targetSlotIndexes); setConfirmDialog(null) } })
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
      fetch(`/api/logs`, { signal: sig })
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
        <div className="px-4 py-1.5 flex flex-col gap-2 w-full">
          {/* Logo, Badges & Main Controls Row */}
          <div className="flex items-center justify-between flex-wrap gap-2 w-full">
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
              {serverTime && (
                <Badge className="bg-slate-700 text-white text-xs font-mono tracking-widest shrink-0">
                  <Clock className="w-3.5 h-3.5 mr-1" />
                  {serverTime}
                </Badge>
              )}
            </div>
          </div>

          {/* Top Bar Row 1.5: Core Bulk Actions */}
          <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/50 flex-wrap justify-center shadow-sm w-full lg:w-max mx-auto">
            <Button size="sm" variant="ghost" className="h-7 text-xs text-green-600 dark:text-green-400 font-semibold hover:bg-green-600 hover:text-white hover:scale-105 active:scale-95 transition-all px-2.5"
              onClick={() => confirmBulkAction('startAll', t('confirmStartAll'))}>
              <Play className="w-3 h-3 mr-0.5 fill-current" />{t('startAll')}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600 dark:text-red-400 font-semibold hover:bg-red-600 hover:text-white hover:scale-105 active:scale-95 transition-all px-2.5"
              onClick={() => confirmBulkAction('stopAll', t('confirmStopAll'))}>
              <Square className="w-3 h-3 mr-0.5 fill-current" />{t('stopAll')}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs font-semibold hover:scale-105 active:scale-95 transition-all px-2.5 text-red-500 border border-red-500/20 bg-red-500/10 dark:bg-red-500/5 hover:bg-red-600 hover:text-white"
              onClick={() => confirmBulkAction('clearTimesAll', locale === 'ar' ? 'مسح تواريخ البدء والإيقاف لكل القنوات؟' : 'Clear start/stop times for all slots?')} title={locale === 'ar' ? 'مسح التواريخ للكل' : 'Clear Times All'}>
              <X className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'مسح التواريخ' : 'Clear Times'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-muted-foreground hover:text-foreground font-medium"
              onClick={() => confirmBulkAction('setFileOnlyAll', locale === 'ar' ? 'هل تريد ضبط كافة المسارات إلى بث مسجل فقط (ملف) وإيقاف التبديل؟' : 'Set all slots to recorded stream only (file input) and disable swap?')} title={locale === 'ar' ? 'بث مسجل فقط للكل' : 'File Only All'}>
              <FileVideo className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'مسجل للكل' : 'File Only'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-muted-foreground hover:text-foreground font-medium"
              onClick={() => confirmBulkAction('setObsOnlyAll', locale === 'ar' ? 'هل تريد ضبط كافة المسارات إلى إعادة بث OBS وإيقاف التبديل؟' : 'Set all slots to live OBS ingest and disable swap?')} title={locale === 'ar' ? 'بث OBS للكل' : 'OBS Only All'}>
              <Wifi className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'OBS للكل' : 'OBS Only'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-muted-foreground hover:text-foreground font-medium"
              onClick={() => {
                setTargetSlotsForAction(null)
                setBulkEpisodeOpen(true)
              }}
              title={locale === 'ar' ? 'تعيين رقم الحلقة لكافة القنوات' : 'Set Episode Number for All Slots'}>
              <Dices className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'أرقام البث' : 'Episode Number'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-muted-foreground hover:text-foreground font-medium"
              onClick={() => confirmBulkAction('clearSwapVideoAll', locale === 'ar' ? 'هل تريد إلغاء التبديل لكافة القنوات؟' : 'Clear swap video/folder from all slots?')}
              title={locale === 'ar' ? 'إلغاء التبديل لكافة القنوات' : 'Disable swap for all slots'}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'إلغاء التبديل للكل' : 'Disable Swap'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-muted-foreground hover:text-foreground font-medium"
              onClick={() => confirmBulkAction('assignChannelsToSlots', locale === 'ar' ? 'هل تريد ربط القنوات الصالحة تلقائياً بالمسارات؟' : 'Automatically assign valid channels to slots?')} title={locale === 'ar' ? 'ربط القنوات تلقائياً' : 'Auto Assign Channels'}>
              <Link2 className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'تعيين القنوات' : 'Assign Channels'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-500/10 hover:scale-105 active:scale-95 transition-all px-2"
              onClick={() => confirmBulkAction('resetAll', t('confirmResetAll'))}>
              <RotateCcw className="w-3 h-3 mr-0.5" />{t('resetAll')}
            </Button>
          </div>

          {/* Top Bar Row 2: Schedules & Repeats — now as dropdowns */}
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-xl border border-border/50 flex-wrap justify-center shadow-sm w-full lg:w-max mx-auto">

            {/* ── Dropdown 1: Set Closest ── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2.5 text-muted-foreground hover:text-foreground font-medium gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  {locale === 'ar' ? 'أقرب موعد للكل' : 'Set Closest'}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 text-sm">
                <DropdownMenuLabel className="text-xs text-muted-foreground pb-1">
                  {locale === 'ar' ? '⏱ ضبط أقرب موعد للكل' : '⏱ Set Closest Start Time'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => confirmBulkAction('setClosest10m6mAll', locale === 'ar' ? 'ضبط كل القنوات لأقرب 10 دقائق وبث 6 دقائق؟' : 'Set all slots to nearest 10 minutes (stream 6 mins)?')} className="gap-2 cursor-pointer">
                  <Clock className="w-3.5 h-3.5 text-blue-500" />
                  <span>{locale === 'ar' ? 'أقرب 10 دقائق' : 'Nearest 10 min'}</span>
                  <span className="mr-auto text-[10px] text-muted-foreground">{locale === 'ar' ? '(6 د بث)' : '(6m stream)'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('setClosest15m9mAll', locale === 'ar' ? 'ضبط كل القنوات لأقرب 15 دقيقة وبث 9 دقائق؟' : 'Set all slots to nearest 15 minutes (stream 9 mins)?')} className="gap-2 cursor-pointer">
                  <Clock className="w-3.5 h-3.5 text-teal-500" />
                  <span>{locale === 'ar' ? 'أقرب 15 دقيقة' : 'Nearest 15 min'}</span>
                  <span className="mr-auto text-[10px] text-muted-foreground">{locale === 'ar' ? '(9 د بث)' : '(9m stream)'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('setClosestHourAll', locale === 'ar' ? 'ضبط كل القنوات لأقرب 20 دقيقة وبث 13 دقيقة؟' : 'Set all slots to nearest 20 minutes (stream 13 mins)?')} className="gap-2 cursor-pointer">
                  <Clock className="w-3.5 h-3.5 text-orange-500" />
                  <span>{locale === 'ar' ? 'أقرب 20 دقيقة' : 'Nearest 20 min'}</span>
                  <span className="mr-auto text-[10px] text-muted-foreground">{locale === 'ar' ? '(13 د بث)' : '(13m stream)'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('setClosest30m24mAll', locale === 'ar' ? 'ضبط كل القنوات لأقرب نصف ساعة وبث 24 دقيقة؟' : 'Set all slots to nearest 30 minutes (stream 24 mins)?')} className="gap-2 cursor-pointer">
                  <Clock className="w-3.5 h-3.5 text-blue-600" />
                  <span>{locale === 'ar' ? 'أقرب 30 دقيقة' : 'Nearest 30 min'}</span>
                  <span className="mr-auto text-[10px] text-muted-foreground">{locale === 'ar' ? '(24 د بث)' : '(24m stream)'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('setClosestHour50mAll', locale === 'ar' ? 'ضبط كل القنوات لأقرب ساعة وبث 50 دقيقة؟' : 'Set all slots to nearest hour (stream 50 mins)?')} className="gap-2 cursor-pointer">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>{locale === 'ar' ? 'أقرب ساعة' : 'Nearest 1 hour'}</span>
                  <span className="mr-auto text-[10px] text-muted-foreground">{locale === 'ar' ? '(50 د بث)' : '(50m stream)'}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('setClosest2h110mAll', locale === 'ar' ? 'ضبط كل القنوات لأقرب ساعتين وبث ساعة و50 دقيقة؟' : 'Set all slots to nearest 2 hours (stream 1 hour 50 mins)?')} className="gap-2 cursor-pointer">
                  <Clock className="w-3.5 h-3.5 text-purple-500" />
                  <span>{locale === 'ar' ? 'أقرب ساعتين' : 'Nearest 2 hours'}</span>
                  <span className="mr-auto text-[10px] text-muted-foreground">{locale === 'ar' ? '(ساعة و50 د)' : '(1h 50m stream)'}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="w-px h-5 bg-border/50" />

            {/* ── Dropdown 2: Repeat Schedule ── */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2.5 text-muted-foreground hover:text-foreground font-medium gap-1.5">
                  <Sun className="w-3.5 h-3.5" />
                  {locale === 'ar' ? 'التكرار للكل' : 'Repeat Schedule'}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52 text-sm">
                <DropdownMenuLabel className="text-xs text-muted-foreground pb-1">
                  {locale === 'ar' ? '🔁 ضبط التكرار التلقائي للكل' : '🔁 Set Auto-Repeat for All'}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => confirmBulkAction('repeat10mAll', locale === 'ar' ? 'تفعيل تكرار 10 للكل؟' : 'Toggle 10-min repeat for all slots?')} className="gap-2 cursor-pointer">
                  <Sun className="w-3.5 h-3.5 text-sky-500" />
                  {locale === 'ar' ? '10 للكل' : '10 min repeat'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('repeat15mAll', locale === 'ar' ? 'تفعيل تكرار 15 للكل؟' : 'Toggle 15-min repeat for all slots?')} className="gap-2 cursor-pointer">
                  <Sun className="w-3.5 h-3.5 text-teal-500" />
                  {locale === 'ar' ? '15 للكل' : '15 min repeat'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('hourlyAll', locale === 'ar' ? 'تفعيل تكرار 20 للكل؟' : 'Toggle 20-min repeat for all slots?')} className="gap-2 cursor-pointer">
                  <Sun className="w-3.5 h-3.5 text-orange-500" />
                  {locale === 'ar' ? '20 للكل' : '20 min repeat'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('repeat30mAll', locale === 'ar' ? 'تفعيل تكرار 30 للكل؟' : 'Toggle 30-min repeat for all slots?')} className="gap-2 cursor-pointer">
                  <Sun className="w-3.5 h-3.5 text-blue-500" />
                  {locale === 'ar' ? '30 للكل' : '30 min repeat'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('repeat1hAll', locale === 'ar' ? 'تفعيل تكرار ساعة للكل؟' : 'Toggle 1-hour repeat for all slots?')} className="gap-2 cursor-pointer">
                  <Sun className="w-3.5 h-3.5 text-indigo-500" />
                  {locale === 'ar' ? 'ساعة للكل' : '1 hour repeat'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('repeat2hAll', locale === 'ar' ? 'تفعيل تكرار ساعتين للكل؟' : 'Toggle 2-hour repeat for all slots?')} className="gap-2 cursor-pointer">
                  <Sun className="w-3.5 h-3.5 text-purple-500" />
                  {locale === 'ar' ? 'ساعتين للكل' : '2 hours repeat'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => confirmBulkAction('dailyAll', t('confirmDailyAll'))} className="gap-2 cursor-pointer">
                  <Calendar className="w-3.5 h-3.5 text-green-500" />
                  {locale === 'ar' ? 'يومي للكل' : 'Daily repeat'}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => confirmBulkAction('weeklyAll', locale === 'ar' ? 'تفعيل/إلغاء التكرار الأسبوعي لكافة القنوات؟' : 'Toggle weekly repeat for all slots?')} className="gap-2 cursor-pointer">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                  {locale === 'ar' ? 'إسبوعي للكل' : 'Weekly repeat'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-muted-foreground hover:text-foreground font-medium"
              onClick={() => {
                setTargetSlotsForAction(undefined)
                setBulkTitleDescOpen(true)
              }}
              title={locale === 'ar' ? 'تعيين عنوان ووصف لكافة البثوث دفعة واحدة' : 'Set unified Title and Description for all channels'}>
              <Edit3 className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'عنوان ووصف للكل' : 'Title & Desc All'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-muted-foreground hover:text-foreground font-medium"
              onClick={() => {
                setTargetSlotsForAction(undefined)
                setBulkEpisodeOpen(true)
              }}
              title={locale === 'ar' ? 'تعيين رقم بداية الحلقة لجميع القنوات' : 'Set starting episode number for all channels'}>
              <Dices className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'أرقام البث' : 'Episode Number All'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-muted-foreground hover:text-foreground font-medium"
              onClick={() => {
                setTargetSlotsForAction(undefined)
                setBulkRandomTitleDescOpen(true)
              }}
              title={locale === 'ar' ? 'تعيين عناوين وأوصاف عشوائية للكل من القائمة' : 'Set random Titles and Descriptions for all channels from list'}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'عناوين عشوائية' : 'Random All'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-muted-foreground hover:text-foreground font-medium"
              onClick={() => { setTargetSlotsForAction(undefined); setBulkThumbnailSelectorOpen(true); }} title={locale === 'ar' ? 'ضبط صورة غلاف موحدة أو مجلد لكافة القنوات' : 'Set unified thumbnail or folder for all slots'}>
              <ImageIcon className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'غلاف للكل' : 'Thumbnail All'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-red-500 font-semibold"
              onClick={() => confirmBulkAction('clearThumbnailAll', locale === 'ar' ? 'حذف صورة الغلاف من كافة القنوات؟' : 'Clear thumbnail from all slots?')} title={locale === 'ar' ? 'مسح غلاف الكل' : 'Clear Thumbnail All'}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'مسح الغلاف' : 'Clear Cover'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-muted-foreground hover:text-foreground font-medium"
              onClick={() => { setTargetSlotsForAction(undefined); setBulkSwapSelectorOpen(true); }} title={locale === 'ar' ? 'تعيين مجلد/فيديو تبديل موحد لكافة البثوث' : 'Set unified swap video/folder for all slots'}>
              <FolderOpen className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'تبديل للكل' : 'Swap All'}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all px-2 text-red-500 font-semibold"
              onClick={() => confirmBulkAction('clearSwapVideoAll', locale === 'ar' ? 'حذف فيديو/مجلد التبديل من كافة القنوات؟' : 'Clear swap video/folder from all slots?')} title={locale === 'ar' ? 'مسح تبديل الكل' : 'Clear Swap All'}>
              <Trash2 className="w-3.5 h-3.5 mr-1" />{locale === 'ar' ? 'مسح التبديل' : 'Clear Swap'}
            </Button>
          </div>

            {/* Top Bar 2: Navigation & Settings */}
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl border border-border/50 flex-wrap justify-center shadow-sm w-full lg:w-auto">
              {/* Tunnel URL inline */}
              {tunnelUrl ? (
                <div className="flex items-center gap-1 bg-green-500/10 border border-green-500/30 text-green-600 dark:text-green-400 rounded-md px-2 py-0.5 text-[10px] font-semibold transition-all duration-200 shrink-0">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping shrink-0" />
                  <span className="font-mono truncate max-w-[100px] sm:max-w-[160px]" title={tunnelUrl}>
                    {tunnelUrl.replace("https://", "")}
                  </span>
                  <a href={tunnelUrl} target="_blank" rel="noreferrer" className="hover:text-green-500 hover:scale-110 transition-transform" title={locale === 'ar' ? 'فتح الرابط' : 'Open link'}>
                    <Globe className="w-3 h-3" />
                  </a>
                  <Button size="icon" variant="ghost" className="h-4 w-4 hover:bg-green-500/20 text-green-600 dark:text-green-400 shrink-0 p-0 rounded hover:scale-105 active:scale-95 transition-all"
                    onClick={() => { navigator.clipboard.writeText(tunnelUrl); alert(locale === 'ar' ? 'تم نسخ رابط التونل!' : 'Tunnel URL copied!'); }}
                    title={locale === 'ar' ? 'نسخ الرابط' : 'Copy link'}>
                    <Copy className="w-2.5 h-2.5" />
                  </Button>
                  <Button size="sm" variant="outline" className="h-4 px-1 text-[8px] font-bold border-green-500/30 hover:bg-green-500/20 text-green-700 dark:text-green-300 shrink-0 transition-all p-0"
                    onClick={handleRestartTunnel} disabled={loadingTunnel} title={locale === 'ar' ? 'تغيير الرابط' : 'Change Link'}>
                    {locale === 'ar' ? 'تغيير' : 'Change'}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1 bg-yellow-500/10 border border-yellow-500/30 text-yellow-600 dark:text-yellow-400 rounded-md px-2 py-0.5 text-[10px] font-semibold shrink-0">
                  <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full animate-pulse mr-0.5" />
                  <span>{locale === 'ar' ? 'التونل غير نشط' : 'Tunnel off'}</span>
                  <Button size="sm" variant="outline" className="h-4 px-1 text-[8px] font-bold border-yellow-500/30 hover:bg-yellow-500/20 text-yellow-700 dark:text-yellow-300 shrink-0 transition-all p-0 ml-1"
                    onClick={handleRestartTunnel} disabled={loadingTunnel}>
                    {locale === 'ar' ? 'تشغيل' : 'Start'}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-4 w-4 hover:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 shrink-0 p-0 rounded hover:scale-110 active:scale-90 transition-all ml-0.5"
                    onClick={fetchTunnelUrl} title={locale === 'ar' ? 'تحديث' : 'Refresh'} disabled={loadingTunnel}>
                    <RefreshCw className={`w-2.5 h-2.5 ${loadingTunnel ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              )}

              <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all text-muted-foreground hover:text-foreground font-medium" onClick={() => setAiAssistantOpen(true)}>
                <Sparkles className="w-3.5 h-3.5 mr-1 text-purple-500 animate-pulse" />
                {locale === 'ar' ? 'مساعد الذكاء الاصطناعي' : 'AI Assistant'}
              </Button>

              <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all" onClick={() => setVideosManagerOpen(true)}>
                <FolderOpen className="w-3.5 h-3.5 mr-1" />
                {t('videos')}
              </Button>

              <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all" onClick={() => setYtManagerOpen(true)}>
                <Youtube className="w-3.5 h-3.5 mr-1 text-red-500" />
                {locale === 'ar' ? 'القنوات' : 'YouTube'}
              </Button>

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

              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg hover:bg-muted hover:scale-110 active:scale-90 transition-all" onClick={switchLocale} title={t('language')}>
                <Globe className="w-3.5 h-3.5" />
              </Button>

              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 rounded-lg hover:bg-muted hover:scale-110 active:scale-90 transition-all" onClick={toggleTheme} title={t('theme')}>
                {isDarkMode ? <Sun className="w-3.5 h-3.5 text-orange-400" /> : <Moon className="w-3.5 h-3.5" />}
              </Button>

              <Button size="sm" variant="ghost" className="h-7 text-xs hover:bg-background hover:scale-105 active:scale-95 transition-all" onClick={() => router.push('/logs')}>
                <Activity className="w-3.5 h-3.5 mr-1" />
                {t('logs')}
              </Button>

              <Button size="sm" variant="ghost" className="text-red-500 hover:text-white hover:bg-red-600 h-7 w-7 p-0 rounded-lg hover:scale-110 active:scale-90 transition-all"
                title={t('logout')}
                onClick={async () => { await fetch('/api/auth/logout', { method: 'POST' }); window.location.href = '/login' }}>
                <LogOut className="w-3.5 h-3.5" />
              </Button>
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

      {/* ――― Main Content ――― */}
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
                          {adminClientData.slotsLimit || 10}
                        </span>
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="1"
                          max="5000"
                          value={adminClientData.slotsLimit || 10}
                          onChange={(e) => setAdminClientData(p => ({ ...p, slotsLimit: parseInt(e.target.value) }))}
                          className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                        />
                        <Input
                          type="number"
                          min="1"
                          value={adminClientData.slotsLimit || 10}
                          onChange={(e) => {
                            let val = parseInt(e.target.value)
                            if (isNaN(val)) val = 1
                            setAdminClientData(p => ({ ...p, slotsLimit: val }))
                          }}
                          className="w-20 h-8 text-center text-xs font-mono font-bold"
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
                <table className="w-full border-collapse" style={{ minWidth: 1475, tableLayout: 'fixed' }}>
                  <thead className="sticky top-0 bg-card z-10 shadow-sm">
                    <tr className="bg-muted/50 border-b">
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 65 }}>
                        <div className="flex items-center justify-center gap-1.5">
                          <Checkbox
                            checked={filteredSlots.length > 0 && filteredSlots.every(s => selectedSlots.includes(s.slotIndex))}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const visibleIndexes = filteredSlots.map(s => s.slotIndex)
                                setSelectedSlots(prev => Array.from(new Set([...prev, ...visibleIndexes])))
                              } else {
                                const visibleIndexes = filteredSlots.map(s => s.slotIndex)
                                setSelectedSlots(prev => prev.filter(idx => !visibleIndexes.includes(idx)))
                              }
                            }}
                            className="w-3.5 h-3.5"
                          />
                          <span>#</span>
                        </div>
                      </th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 100 }}>{t('colDetails')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 100 }}>{t('colFilePath')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 120 }}>{t('colStreamKey')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 120 }}>{t('startStream')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 330 }}>
                        <div className="flex items-end gap-2 h-full justify-center">
                          <div className="w-[110px] text-center shrink-0">{t('stopStream')}</div>
                          <div className="w-[210px] text-center shrink-0 pb-[1px]">
                            <span className="text-[10px] text-muted-foreground leading-none whitespace-nowrap">{t('lblScheduling')}</span>
                          </div>
                        </div>
                      </th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 120 }}>{t('colActions')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 320 }}>{locale === 'ar' ? 'تكرار البث' : 'Repeat Options'}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 70 }}>{t('colStatus')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 70 }}>{t('colPlatform')}</th>
                      <th className="text-center text-xs font-semibold px-2 py-1.5" style={{ width: 75 }}>{t('colOutputSettings')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSlots.map((slot) => {
                      const outputType = slot.outputType || 'youtube'
                      const isYtFb = outputType === 'youtube' || outputType === 'facebook'
                      const rtmpBase = RTMP_BASES[outputType] || ''
                      const finalRtmpUrl = getFinalRtmpUrl(slot)
                      const isLocked = slot.isRunning || slot.status !== 'Stopped'
                      const { h: durH, m: durM } = getDuration(slot.schedStart, slot.schedStop)

                      return (
                        <tr key={slot.id} className="hover:bg-muted/45 transition-colors border-b border-border/50">
                          {/* # */}
                          <td className="text-center font-mono text-xs font-medium px-2 py-1 text-muted-foreground">
                            <div className="flex items-center justify-center gap-1.5">
                              <Checkbox
                                checked={selectedSlots.includes(slot.slotIndex)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedSlots(prev => [...prev, slot.slotIndex])
                                  } else {
                                    setSelectedSlots(prev => prev.filter(idx => idx !== slot.slotIndex))
                                  }
                                }}
                                className="w-3.5 h-3.5"
                              />
                              <span>{slot.slotIndex + 1}</span>
                            </div>
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
                            <div className="flex flex-row items-center justify-center gap-1.5 flex-nowrap">
                              {/* Start Group */}
                              <div className="flex gap-1 items-center px-1 py-0.5 shrink-0">
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
                                  className={`w-[82px] bg-transparent border-none text-[10px] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 ${slot.schedStart ? 'text-foreground/80' : 'text-muted-foreground/50'} ${isLocked ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  dir="ltr"
                                />
                                <DateTimePicker disabled={isLocked} value={slot.schedStart || ''} onChange={(v) => handleSlotChange(slot.slotIndex, 'schedStart', v)} className={`h-6 w-6 ${isLocked ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}`} />
                              </div>
                            </div>
                          </td>

                          {/* Stop Schedule */}
                          <td className="px-2 py-1" style={{ overflow: 'hidden' }}>
                            <div className="flex flex-row items-center gap-2 flex-nowrap">
                              {/* Stop Group */}
                              <div className="flex gap-1.5 items-center px-1 py-0.5 shrink-0">
                                <div className="flex items-center justify-center w-[18px] h-[18px] bg-red-500/15 text-red-500 rounded-[4px] shrink-0 border border-red-500/20">
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5"><rect x="5" y="5" width="14" height="14" rx="3.5" /></svg>
                                </div>
                                <select
                                  disabled={isLocked}
                                  value={durH}
                                  onChange={(e) => {
                                    const newH = parseInt(e.target.value)
                                    if (newH === -1) {
                                      handleSlotChange(slot.slotIndex, 'schedStop', '')
                                    } else {
                                      const currentM = durM >= 0 ? durM : 0
                                      const stopStr = "DUR " + String(newH).padStart(2, '0') + ":" + String(currentM).padStart(2, '0')
                                      handleSlotChange(slot.slotIndex, 'schedStop', stopStr)
                                    }
                                  }}
                                  className={`appearance-none bg-background/50 hover:bg-background text-[10px] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5 text-foreground/80 text-center w-[36px] transition-colors border border-border/40 ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  <option value={-1} className="bg-background text-foreground">--</option>
                                  {Array.from({ length: 24 }).map((_, i) => (
                                    <option key={i} value={i} className="bg-background text-foreground">
                                      {String(i).padStart(2, '0')}
                                    </option>
                                  ))}
                                </select>
                                <span className="text-[10px] text-muted-foreground">:</span>
                                <select
                                  disabled={isLocked}
                                  value={durM}
                                  onChange={(e) => {
                                    const newM = parseInt(e.target.value)
                                    if (newM === -1) {
                                      handleSlotChange(slot.slotIndex, 'schedStop', '')
                                    } else {
                                      const currentH = durH >= 0 ? durH : 0
                                      const stopStr = "DUR " + String(currentH).padStart(2, '0') + ":" + String(newM).padStart(2, '0')
                                      handleSlotChange(slot.slotIndex, 'schedStop', stopStr)
                                    }
                                  }}
                                  className={`appearance-none bg-background/50 hover:bg-background text-[10px] font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring rounded px-1 py-0.5 text-foreground/80 text-center w-[36px] transition-colors border border-border/40 ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  <option value={-1} className="bg-background text-foreground">--</option>
                                  {Array.from({ length: 60 }).map((_, i) => (
                                    <option key={i} value={i} className="bg-background text-foreground">
                                      {String(i).padStart(2, '0')}
                                    </option>
                                  ))}
                                </select>
                                
                                {/* Reset Button */}
                                <button
                                  type="button"
                                  disabled={isLocked}
                                  onClick={() => {
                                    handleSlotChange(slot.slotIndex, 'schedStart', '')
                                    handleSlotChange(slot.slotIndex, 'schedStop', '')
                                  }}
                                  className="h-6 w-6 flex items-center justify-center rounded bg-muted/50 hover:bg-destructive/10 hover:text-destructive text-muted-foreground border transition-colors ml-1 disabled:opacity-50"
                                  title={locale === 'ar' ? 'إعادة تعيين التواريخ' : 'Reset dates'}
                                >
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>

                              {/* Closest quick scheduling buttons */}
                              <div className="flex gap-1 items-center shrink-0">
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosest10Schedule(slot.slotIndex)}
                                  className="h-6 px-1.5 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? '10 (مدة 6 د)' : '10 mins (6m duration)'}
                                >
                                  {locale === 'ar' ? '10' : '10'}
                                </button>
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosest15Schedule(slot.slotIndex)}
                                  className="h-6 px-1.5 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? '15 (مدة 9 د)' : '15 mins (9m duration)'}
                                >
                                  {locale === 'ar' ? '15' : '15'}
                                </button>
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosest20Schedule(slot.slotIndex)}
                                  className="h-6 px-1.5 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? '20 (مدة 13 د)' : '20 mins (13m duration)'}
                                >
                                  {locale === 'ar' ? '20' : '20'}
                                </button>
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosest30Schedule(slot.slotIndex)}
                                  className="h-6 px-1.5 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? '30 (مدة 24 د)' : '30 mins (24m duration)'}
                                >
                                  {locale === 'ar' ? '30' : '30'}
                                </button>
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosestHourSchedule(slot.slotIndex)}
                                  className="h-6 px-1.5 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? 'ساعة (مدة 50 د)' : 'Hour (50m duration)'}
                                >
                                  {locale === 'ar' ? 'ساعة' : '1h'}
                                </button>
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosest2HourSchedule(slot.slotIndex)}
                                  className="h-6 px-1.5 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? 'ساعتين (مدة 110 د)' : '2 hours (1h 50m duration)'}
                                >
                                  {locale === 'ar' ? 'ساعتين' : '2h'}
                                </button>
                              </div>
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
                                    titleDescListId: slot.titleDescListId ?? null,
                                    episodeNumber: slot.episodeNumber ?? 1,
                                  })
                                  // Pre-fetch stream keys if channel is already linked
                                  if (slot.youtubeChannelId) fetchYtStreamKeys(slot.youtubeChannelId)
                                }}
                                title={t('advancedSettings')}>
                                <Settings className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>

                          {/* Recurrence Checkboxes */}
                          <td className="px-2 py-1">
                            <div className="flex flex-row-reverse items-center justify-between flex-nowrap w-full px-2">
                              <div className={`flex flex-row items-center gap-2.5 shrink-0 ${isLocked ? 'opacity-50' : ''}`}>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.repeat10m} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: !!c,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`repeat10m-${slot.slotIndex}`} className="w-3 h-3" />
                                  <label htmlFor={`repeat10m-${slot.slotIndex}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">{locale === 'ar' ? '10' : '10m'}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.repeat15m} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: !!c,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`repeat15m-${slot.slotIndex}`} className="w-3 h-3" />
                                  <label htmlFor={`repeat15m-${slot.slotIndex}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">{t('lblRepeat15m')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.hourly} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: !!c,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`hourly-${slot.slotIndex}`} className="w-3 h-3" />
                                  <label htmlFor={`hourly-${slot.slotIndex}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">{t('lblHourly')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.repeat30m} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: !!c,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`repeat30m-${slot.slotIndex}`} className="w-3 h-3" />
                                  <label htmlFor={`repeat30m-${slot.slotIndex}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">{t('lblRepeat30m')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.repeat1h} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: !!c,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`repeat1h-${slot.slotIndex}`} className="w-3 h-3" />
                                  <label htmlFor={`repeat1h-${slot.slotIndex}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">{t('lblRepeat1h')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.repeat2h} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: !!c,
                                      nextRunTime: ''
                                    })
                                  }} id={`repeat2h-${slot.slotIndex}`} className="w-3 h-3" />
                                  <label htmlFor={`repeat2h-${slot.slotIndex}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">{t('lblRepeat2h')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.weekly} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: !!c,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`weekly-${slot.slotIndex}`} className="w-3 h-3" />
                                  <label htmlFor={`weekly-${slot.slotIndex}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">{t('lblWeekly')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.daily} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: !!c,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`daily-${slot.slotIndex}`} className="w-3 h-3" />
                                  <label htmlFor={`daily-${slot.slotIndex}`} className="text-[10px] text-muted-foreground cursor-pointer select-none">{t('lblDaily')}</label>
                                </div>
                              </div>
                              {slot.nextRunTime && (
                                <div className="text-[10px] text-blue-500 font-mono shrink-0">{slot.nextRunTime}</div>
                              )}
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
                          className={`rounded-xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg dark:hover:shadow-primary/5 overflow-hidden ${
                            slot.isRunning
                              ? 'border-green-500/40 shadow-green-500/10 shadow-md'
                              : slot.status === 'Scheduled'
                              ? 'border-orange-500/40'
                              : 'border-border/60 hover:border-border/80'
                          }`}
                        >
                          {/* Card Header */}
                          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={selectedSlots.includes(slot.slotIndex)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedSlots(prev => [...prev, slot.slotIndex])
                                  } else {
                                    setSelectedSlots(prev => prev.filter(idx => idx !== slot.slotIndex))
                                  }
                                }}
                                className="w-3.5 h-3.5"
                              />
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
                              <div className="flex gap-1 items-center px-1.5 py-0.5 shrink-0">
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

                              {/* Stop Group */}
                              <div className="flex gap-1.5 items-center px-1.5 py-0.5 shrink-0">
                                <div className="w-4 h-4 bg-red-500/15 text-red-500 rounded flex items-center justify-center shrink-0 border border-red-500/20">
                                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-2.5 h-2.5"><rect x="5" y="5" width="14" height="14" rx="3.5" /></svg>
                                </div>
                                <select
                                  disabled={isLocked}
                                  value={durH >= 0 ? durH : 0}
                                  onChange={(e) => {
                                    const newH = parseInt(e.target.value)
                                    const currentM = durM >= 0 ? durM : 0
                                    const stopStr = "DUR " + String(newH).padStart(2, '0') + ":" + String(currentM).padStart(2, '0')
                                    handleSlotChange(slot.slotIndex, 'schedStop', stopStr)
                                  }}
                                  className={`appearance-none bg-background/50 hover:bg-background text-xs font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring rounded px-1.5 py-0.5 text-foreground/80 text-center w-[38px] transition-colors border border-border/40 ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  {Array.from({ length: 24 }).map((_, i) => (
                                    <option key={i} value={i} className="bg-background text-foreground">{i}{locale === 'ar' ? 'س' : 'h'}</option>
                                  ))}
                                </select>
                                <span className="text-xs text-muted-foreground">:</span>
                                <select
                                  disabled={isLocked}
                                  value={durM >= 0 ? durM : 0}
                                  onChange={(e) => {
                                    const newM = parseInt(e.target.value)
                                    const currentH = durH >= 0 ? durH : 0
                                    const stopStr = "DUR " + String(currentH).padStart(2, '0') + ":" + String(newM).padStart(2, '0')
                                    handleSlotChange(slot.slotIndex, 'schedStop', stopStr)
                                  }}
                                  className={`appearance-none bg-background/50 hover:bg-background text-xs font-mono tabular-nums focus:outline-none focus:ring-1 focus:ring-ring rounded px-1.5 py-0.5 text-foreground/80 text-center w-[38px] transition-colors border border-border/40 ${isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                                >
                                  {Array.from({ length: 60 }).map((_, i) => (
                                    <option key={i} value={i} className="bg-background text-foreground">{i}{locale === 'ar' ? 'د' : 'm'}</option>
                                  ))}
                                </select>
                              </div>

                              {/* Closest quick scheduling buttons */}
                              <div className="flex gap-1 items-center shrink-0 flex-wrap">
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosest10Schedule(slot.slotIndex)}
                                  className="h-7 px-2 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? '10 (مدة 6 د)' : '10 mins (6m duration)'}
                                >
                                  {locale === 'ar' ? '10' : '10'}
                                </button>
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosest15Schedule(slot.slotIndex)}
                                  className="h-7 px-2 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? '15 (مدة 9 د)' : '15 mins (9m duration)'}
                                >
                                  {locale === 'ar' ? '15' : '15'}
                                </button>
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosest20Schedule(slot.slotIndex)}
                                  className="h-7 px-2 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? '20 (مدة 13 د)' : '20 mins (13m duration)'}
                                >
                                  {locale === 'ar' ? '20' : '20'}
                                </button>
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosest30Schedule(slot.slotIndex)}
                                  className="h-7 px-2 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? '30 (مدة 24 د)' : '30 mins (24m duration)'}
                                >
                                  {locale === 'ar' ? '30' : '30'}
                                </button>
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosestHourSchedule(slot.slotIndex)}
                                  className="h-7 px-2 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? 'ساعة (مدة 50 د)' : 'Hour (50m duration)'}
                                >
                                  {locale === 'ar' ? 'ساعة' : '1h'}
                                </button>
                                <button
                                  type="button"
                                  disabled={slot.isRunning || slot.status !== 'Stopped'}
                                  onClick={() => handleClosest2HourSchedule(slot.slotIndex)}
                                  className="h-7 px-2 flex items-center justify-center text-[10px] font-semibold bg-muted hover:bg-muted-foreground/15 border border-border rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                                  title={locale === 'ar' ? 'ساعتين (مدة 110 د)' : '2 hours (1h 50m duration)'}
                                >
                                  {locale === 'ar' ? 'ساعتين' : '2h'}
                                </button>
                              </div>

                              {/* Recurrence Checkboxes */}
                              <div className={`flex flex-row flex-wrap items-center gap-2 shrink-0 ${isLocked ? 'opacity-50' : ''}`}>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.repeat10m} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: !!c,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`m-repeat10m-${slot.slotIndex}`} className="w-3.5 h-3.5" />
                                  <label htmlFor={`m-repeat10m-${slot.slotIndex}`} className="text-xs text-muted-foreground cursor-pointer select-none">{locale === 'ar' ? '10' : '10m'}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.repeat15m} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: !!c,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`m-repeat15m-${slot.slotIndex}`} className="w-3.5 h-3.5" />
                                  <label htmlFor={`m-repeat15m-${slot.slotIndex}`} className="text-xs text-muted-foreground cursor-pointer select-none">{t('lblRepeat15m')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.hourly} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: !!c,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`m-hourly-${slot.slotIndex}`} className="w-3.5 h-3.5" />
                                  <label htmlFor={`m-hourly-${slot.slotIndex}`} className="text-xs text-muted-foreground cursor-pointer select-none">{t('lblHourly')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.repeat30m} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: !!c,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`m-repeat30m-${slot.slotIndex}`} className="w-3.5 h-3.5" />
                                  <label htmlFor={`m-repeat30m-${slot.slotIndex}`} className="text-xs text-muted-foreground cursor-pointer select-none">{t('lblRepeat30m')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.repeat1h} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: !!c,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`m-repeat1h-${slot.slotIndex}`} className="w-3.5 h-3.5" />
                                  <label htmlFor={`m-repeat1h-${slot.slotIndex}`} className="text-xs text-muted-foreground cursor-pointer select-none">{t('lblRepeat1h')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.repeat2h} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: !!c,
                                      nextRunTime: ''
                                    })
                                  }} id={`m-repeat2h-${slot.slotIndex}`} className="w-3.5 h-3.5" />
                                  <label htmlFor={`m-repeat2h-${slot.slotIndex}`} className="text-xs text-muted-foreground cursor-pointer select-none">{t('lblRepeat2h')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.weekly} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: !!c,
                                      daily: false,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`m-weekly-${slot.slotIndex}`} className="w-3.5 h-3.5" />
                                  <label htmlFor={`m-weekly-${slot.slotIndex}`} className="text-xs text-muted-foreground cursor-pointer select-none">{t('lblWeekly')}</label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox disabled={isLocked} checked={slot.daily} onCheckedChange={(c) => {
                                    handleSlotMultipleChange(slot.slotIndex, {
                                      weekly: false,
                                      daily: !!c,
                                      hourly: false,
                                      repeat10m: false,
                                      repeat15m: false,
                                      repeat30m: false,
                                      repeat1h: false,
                                      repeat2h: false,
                                      nextRunTime: ''
                                    })
                                  }} id={`m-daily-${slot.slotIndex}`} className="w-3.5 h-3.5" />
                                  <label htmlFor={`m-daily-${slot.slotIndex}`} className="text-xs text-muted-foreground cursor-pointer select-none">{t('lblDaily')}</label>
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
                                      titleDescListId: slot.titleDescListId ?? null,
                                      episodeNumber: slot.episodeNumber ?? 1,
                                    })
                                    if (slot.youtubeChannelId) fetchYtStreamKeys(slot.youtubeChannelId)
                                  }}
                                  title={t('advancedSettings')}>
                                  <Settings className="w-3.5 h-3.5" />
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

      <footer className="w-full border-t bg-card py-2 shrink-0 mt-auto shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)]">
        <div className="container mx-auto w-full overflow-hidden">
          <div className="flex flex-col items-center justify-center gap-2 px-4 text-center w-full">

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

      {/* ――― Per-Channel Logs Dialog ――― */}
      < Dialog open={!!channelLogs
      } onOpenChange={(open) => !open && closeChannelLogs()}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col" dir={dir}>
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {t('logs')}
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
                <div key={log.id} className="py-0.5 leading-relaxed">
                  <span className="text-slate-500">{new Date(log.timestamp).toLocaleTimeString('en-GB', { hour12: false })} </span>
                  <span className={getLogColor(log.message)}>{log.message}</span>
                </div>
              ))
            )}
          </div>

          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={closeChannelLogs}>{t('close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog >

      {/* ――― Timezone Dialog ――― */}
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

      {/* ――― Videos Manager Dialog ――― */}
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

      {/* ――― Video Selector Dialog ――― */}
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

      {/* ――― Confirm Dialog ――― */}
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
                              ? `البث سينتقل تلقائياً للفيديو المختار قبل دقيقتين من موعد الإيقاف المحدد: ${slots.find(s => s.slotIndex === settingsSlot)?.schedStop}.`
                              : `Broadcast will switch automatically to this video 2 minutes before stop time: ${slots.find(s => s.slotIndex === settingsSlot)?.schedStop}.`}
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

                        {/* Title & Description List Selection */}
                        <div className="space-y-2 p-4 bg-muted/30 border border-border/80 rounded-xl">
                          <label className="text-sm font-bold text-foreground flex items-center gap-1.5">
                            <Shuffle className="w-4 h-4 text-pink-500" />
                            {locale === 'ar' ? 'قائمة عناوين وأوصاف عشوائية' : 'Random Title & Description List'}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {locale === 'ar'
                              ? 'اختر قائمة من القوائم المنشأة مسبقاً لاختيار عنوان ووصف عشوائي منها في كل مرة يبدأ فيها البث.'
                              : 'Select a list to randomly pick a title & description each time the stream starts.'}
                          </p>
                          <select
                            value={settingsData.titleDescListId || ''}
                            onChange={(e) => setSettingsData(p => p ? { ...p, titleDescListId: e.target.value || null } : p)}
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            dir={dir}
                          >
                            <option value="">{locale === 'ar' ? '— بدون قائمة (استخدام الثابت) —' : '— No List (use static title/desc) —'}</option>
                            {titleDescLists.map(list => {
                              const count = (() => { try { return JSON.parse(list.items).length } catch { return 0 } })()
                              return (
                                <option key={list.id} value={list.id}>
                                  {list.name} · {count} {locale === 'ar' ? 'عنصر' : count === 1 ? 'item' : 'items'}
                                </option>
                              )
                            })}
                          </select>
                          {settingsData.titleDescListId && (
                            <div className="flex items-center gap-1.5 text-[11px] text-pink-500 font-medium">
                              <Shuffle className="w-3 h-3" />
                              {locale === 'ar' ? 'سيتم اختيار عنوان ووصف عشوائي عند بدء البث' : 'A random title & desc will be picked at stream start'}
                            </div>
                          )}
                        </div>

                        {/* Episode Number Input */}
                        <div className="space-y-1.5 p-4 bg-muted/30 border border-border/80 rounded-xl">
                          <div className="flex justify-between items-center">
                            <label className="text-sm font-bold text-foreground">
                              {locale === 'ar' ? 'رقم الحلقة يستبدل ب {Add}' : 'Episode Number replaces {Add}'}
                            </label>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            value={settingsData.episodeNumber}
                            onChange={(e) => setSettingsData(p => p ? { ...p, episodeNumber: parseInt(e.target.value) || 1 } : p)}
                            className="w-full"
                          />
                        </div>

                        {/* Title character counter & validation */}
                        <div className={`space-y-1.5 p-4 bg-muted/30 border border-border/80 rounded-xl transition-opacity ${settingsData.titleDescListId ? 'opacity-50' : ''}`}>
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
                            disabled={!!settingsData.titleDescListId}
                            value={settingsData.youtubeTitle}
                            onChange={(e) => setSettingsData(p => p ? { ...p, youtubeTitle: e.target.value } : p)}
                            placeholder={locale === 'ar' ? 'العنوان الافتراضي: Live Stream' : 'Default: Live Stream'}
                            dir="auto"
                          />
                        </div>

                        {/* Description character counter & validation */}
                        <div className={`space-y-1.5 p-4 bg-muted/30 border border-border/80 rounded-xl transition-opacity ${settingsData.titleDescListId ? 'opacity-50' : ''}`}>
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
                            disabled={!!settingsData.titleDescListId}
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
                            {locale === 'ar' ? 'صورة مصغرة مخصصة أو مجلد (Thumbnail)' : 'Custom Thumbnail or Folder'}
                          </label>
                          <p className="text-xs text-muted-foreground mb-2">
                            {locale === 'ar'
                              ? 'اختر صورة واحدة (ثابتة) أو مجلد صور (يتم التبديل عشوائياً).'
                              : 'Select a single image (static) or an image folder (random rotation).'}
                          </p>

                          {settingsData.youtubeThumbnailPath ? (
                            <div className="flex items-center justify-between bg-card border border-border px-3 py-2 rounded-lg text-xs font-mono">
                              <div className="flex items-center gap-2 min-w-0 flex-1">
                                <span className="shrink-0 text-base">{settingsData.youtubeThumbnailPath.match(/\.(png|jpg|jpeg)$/i) ? '🖼️' : '📁'}</span>
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
                              {locale === 'ar' ? 'اختر صورة أو مجلد صور' : 'Select Image or Folder'}
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
                  const settingsSavePayload: Partial<StreamSlot> = {
                    swapVideoPath: settingsData.swapVideoPath,
                    swapVideoEnabled: settingsData.swapVideoEnabled,
                    youtubeChannelId: settingsData.youtubeChannelId || null,
                    youtubeTitle: settingsData.youtubeTitle,
                    youtubeDescription: settingsData.youtubeDescription,
                    youtubeThumbnailPath: settingsData.youtubeThumbnailPath,
                    titleDescListId: settingsData.titleDescListId || null,
                    episodeNumber: settingsData.episodeNumber,
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
              {locale === 'ar' ? 'اختر صورة أو مجلد غلاف البث' : 'Select Stream Thumbnail Image/Folder'} #{settingsSlot !== null ? settingsSlot + 1 : ''}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === 'ar' 
                ? 'تصفح واختر ملف صورة (PNG/JPG بحجم أقل من 2 ميجابايت) أو مجلداً كاملاً للصور ليتم التناوب عليها عشوائياً وبدون تكرار.' 
                : 'Browse and select an image file (PNG/JPG under 2MB) or a folder containing thumbnails to cycle randomly.'}
            </DialogDescription>
          </DialogHeader>
          {thumbnailSelectorOpen && (
            <div className="flex-1 overflow-hidden min-h-0 px-4">
              <VideoManager
                mode="select"
                onVideoSelect={(path) => {
                  if (!isFolderOrImage(path)) {
                    alert(locale === 'ar' 
                      ? 'عذراً، يجب اختيار ملف صورة (PNG/JPG) أو مجلد يحتوي على صور!' 
                      : 'Please select an image file (PNG/JPG) or a folder containing images!')
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

      {/* ── Bulk Thumbnail Selector Helper Dialog ── */}
      <Dialog open={bulkThumbnailSelectorOpen} onOpenChange={(open) => !open && setBulkThumbnailSelectorOpen(false)}>
        <DialogContent className="sm:max-w-5xl w-[95vw] max-h-[95vh] h-[90vh] flex flex-col bg-card border shadow-2xl rounded-xl">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <FolderOpen className="w-5 h-5 text-primary" />
              {locale === 'ar' ? 'اختر صورة أو مجلد غلاف موحد للبثوث المحددة' : 'Select Thumbnail Image/Folder for Selected Streams'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === 'ar' 
                ? 'تصفح واختر ملف صورة (PNG/JPG بحجم أقل من 2 ميجابايت) أو مجلداً كاملاً للصور ليتم التناوب عليها عشوائياً وبدون تكرار.' 
                : 'Browse and select an image file (PNG/JPG under 2MB) or a folder containing thumbnails to cycle randomly.'}
            </DialogDescription>
          </DialogHeader>
          {bulkThumbnailSelectorOpen && (
            <div className="flex-1 overflow-hidden min-h-0 px-4">
              <VideoManager
                mode="select"
                onVideoSelect={(path) => {
                  if (!isFolderOrImage(path)) {
                    alert(locale === 'ar' 
                      ? 'عذراً، يجب اختيار ملف صورة (PNG/JPG) أو مجلد يحتوي على صور!' 
                      : 'Please select an image file (PNG/JPG) or a folder containing images!')
                    return
                  }
                  bulkAction('setThumbnailAll', undefined, { thumbnailPath: path }, targetSlotsForAction)
                  setBulkThumbnailSelectorOpen(false)
                }}
                onClose={() => setBulkThumbnailSelectorOpen(false)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Bulk Swap Video/Folder Selector Helper Dialog ── */}
      <Dialog open={bulkSwapSelectorOpen} onOpenChange={(open) => !open && setBulkSwapSelectorOpen(false)}>
        <DialogContent className="sm:max-w-5xl w-[95vw] max-h-[95vh] h-[90vh] flex flex-col bg-card border shadow-2xl rounded-xl">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <FolderOpen className="w-5 h-5 text-primary" />
              {locale === 'ar' ? 'اختر فيديو/مجلد التبديل الموحد لكافة البثوث' : 'Select Unified Swap Video/Folder for All Slots'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === 'ar' ? 'تصفح واختر ملف فيديو أو مجلداً كاملاً ليتم التبديل إليه تلقائياً قبل دقيقتين من نهاية البث لكافة القنوات.' : 'Browse and select a video file or a folder to be set as the pre-stop swap for all slots.'}
            </DialogDescription>
          </DialogHeader>
          {bulkSwapSelectorOpen && (
            <div className="flex-1 overflow-hidden min-h-0 px-4">
              <VideoManager
                mode="select"
                onVideoSelect={(path) => {
                  bulkAction('setSwapVideoAll', undefined, { swapVideoPath: path }, targetSlotsForAction)
                  setBulkSwapSelectorOpen(false)
                }}
                onClose={() => setBulkSwapSelectorOpen(false)}
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
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                <h4 className="text-sm font-bold text-foreground">
                  🔑 {locale === 'ar' ? 'القنوات المرتبطة حالياً' : 'Currently Linked Channels'}
                </h4>
                <div className="flex items-center gap-2 flex-wrap">
                  {selectedChannels.size > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleDeleteSelectedChannels}
                        disabled={ytLoading}
                        className="h-8 text-xs flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white border-none"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        {locale === 'ar' ? `حذف المحدد (${selectedChannels.size})` : `Delete Selected (${selectedChannels.size})`}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleCleanupSelectedChannels}
                        disabled={cleanupBusy || ytLoading}
                        className="h-8 text-xs flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white border-none"
                      >
                        {cleanupBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CalendarX className="w-3.5 h-3.5" />
                        )}
                        {locale === 'ar' ? `تنظيف المحدد (${selectedChannels.size})` : `Clean Selected (${selectedChannels.size})`}
                      </Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleCleanupAllChannels}
                    disabled={cleanupBusy || ytLoading || ytChannels.length === 0}
                    className="h-8 text-xs flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white border-none"
                  >
                    {cleanupBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CalendarX className="w-3.5 h-3.5" />
                    )}
                    {locale === 'ar' ? 'تنظيف كافة القنوات' : 'Cleanup All Channels'}
                  </Button>
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
              </div>

              {/* Search Box */}
              {ytChannels.length > 0 && (
                <div className="relative">
                  <Search className={`absolute ${locale === 'ar' ? 'right-3' : 'left-3'} top-2.5 h-4 w-4 text-muted-foreground`} />
                  <Input
                    value={ytSearchQuery}
                    onChange={(e) => setYtSearchQuery(e.target.value)}
                    placeholder={locale === 'ar' ? 'بحث باسم القناة المستعار أو الرسمي...' : 'Search by channel nickname or official name...'}
                    className={`${locale === 'ar' ? 'pr-9 pl-4' : 'pl-9 pr-4'} bg-background text-xs`}
                    dir="auto"
                  />
                </div>
              )}

              {ytLoading && ytChannels.length === 0 ? (
                <div className="py-8 flex flex-col items-center justify-center text-muted-foreground text-xs gap-2 border border-dashed rounded-xl bg-muted/20">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span>{locale === 'ar' ? 'جاري تحميل القنوات...' : 'Loading channels...'}</span>
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-xs border border-dashed rounded-xl bg-muted/10">
                  📭 {locale === 'ar' ? 'لا توجد قنوات مطابقة. استخدم النموذج أعلاه لربط قناتك أو غير نص البحث.' : 'No channels found matching query.'}
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden shadow-sm bg-card">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead className="w-10 px-4 py-2.5">
                          <Checkbox 
                            checked={filteredChannels.length > 0 && filteredChannels.every(ch => selectedChannels.has(ch.id))}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedChannels(new Set(filteredChannels.map(ch => ch.id)))
                              } else {
                                setSelectedChannels(new Set())
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead className="text-xs font-semibold px-4 py-2.5">{locale === 'ar' ? 'الاسم المستعار' : 'Nickname'}</TableHead>
                        <TableHead className="text-xs font-semibold px-4 py-2.5">{locale === 'ar' ? 'إسم القناة' : 'Channel Name'}</TableHead>
                        <TableHead 
                          className="text-xs font-semibold px-4 py-2.5 text-center cursor-pointer hover:bg-muted/50 transition-colors select-none group" 
                          style={{ width: 150 }}
                          onClick={() => {
                            let nextDirection: 'asc' | 'desc' | null = 'asc'
                            if (ytSortConfig?.direction === 'asc') nextDirection = 'desc'
                            else if (ytSortConfig?.direction === 'desc') nextDirection = null
                            setYtSortConfig(nextDirection ? { direction: nextDirection } : null)
                          }}
                        >
                          <div className="flex items-center justify-center gap-1">
                            {locale === 'ar' ? 'انتهاء الصلاحية' : 'Token Expiry'}
                            {ytSortConfig?.direction === 'asc' && <ChevronLeft className="w-3 h-3 rotate-90 text-primary" />}
                            {ytSortConfig?.direction === 'desc' && <ChevronLeft className="w-3 h-3 -rotate-90 text-primary" />}
                            {!ytSortConfig && <ChevronLeft className="w-3 h-3 rotate-90 opacity-0 group-hover:opacity-30 transition-opacity" />}
                          </div>
                        </TableHead>
                        <TableHead className="text-xs font-semibold px-4 py-2.5 text-center" style={{ width: 120 }}></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredChannels.map(ch => {
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
                          <TableCell className="px-4 py-3">
                            <Checkbox 
                              checked={selectedChannels.has(ch.id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(selectedChannels)
                                if (checked) {
                                  next.add(ch.id)
                                } else {
                                  next.delete(ch.id)
                                }
                                setSelectedChannels(next)
                              }}
                            />
                          </TableCell>
                          <TableCell className="px-4 py-3 font-semibold text-xs text-foreground/95">{ch.name}</TableCell>
                          <TableCell className="px-4 py-3 text-xs text-muted-foreground font-mono">
                            <a
                              href={`https://www.youtube.com/channel/${ch.channelId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                            >
                              {ch.channelTitle || ch.channelId}
                              <svg className="w-3.5 h-3.5 inline ml-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                              </svg>
                            </a>
                          </TableCell>
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

                              {ytUnlinkConfirm !== ch.id && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-amber-500 hover:text-amber-600 hover:bg-amber-500/10 rounded-md shrink-0 transition-colors"
                                  onClick={() => handleCleanupUpcoming(ch.id)}
                                  disabled={ytCleanupLoading === ch.id}
                                  title={locale === 'ar' ? 'حذف البثوث المجدولة/المعلقة بالخطأ' : 'Clean up upcoming/scheduled broadcasts'}
                                >
                                  {ytCleanupLoading === ch.id ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <CalendarX className="w-3.5 h-3.5" />
                                  )}
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

      {/* ── AI Assistant (Gemini) Dialog ── */}
      <Dialog open={aiAssistantOpen} onOpenChange={(open) => {
        if (!open) {
          setAiAssistantOpen(false)
          setShowAiSettings(false)
        }
      }}>
        <DialogContent className="sm:max-w-3xl w-[95vw] h-[80vh] flex flex-col bg-card border border-border shadow-2xl rounded-xl" dir={dir}>
          <DialogHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border/80">
            <div className="flex justify-between items-start w-full">
              <div className="space-y-1">
                <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                  <Sparkles className="w-6 h-6 text-purple-500 animate-pulse" />
                  {locale === 'ar' ? 'مساعد الذكاء الاصطناعي' : 'AI Assistant'}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  {locale === 'ar'
                    ? 'استعن بالذكاء الاصطناعي لصياغة العناوين وتنسيق قوائم البثوث وتوليدها تلقائياً وحفظها بضغطة زر.'
                    : 'Leverage AI to compose video titles, generate stream descriptions, and save structured lists directly.'}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowAiSettings(p => !p)}
                  className="h-8 text-xs flex items-center gap-1 shrink-0"
                >
                  <Settings className="w-3.5 h-3.5" />
                  {locale === 'ar' ? 'إعدادات API' : 'API Settings'}
                </Button>
                {chatMessages.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setChatMessages([])}
                    className="h-8 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 flex items-center gap-1 shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {locale === 'ar' ? 'مسح الرسائل' : 'Clear Chat'}
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Gemini API Key Section */}
          {showAiSettings && (
            <div className="px-6 py-3 border-b border-border/60 bg-muted/20 flex flex-col lg:flex-row items-center gap-3 shrink-0">
              <label className="text-xs font-semibold text-foreground shrink-0 flex items-center gap-1">
                🔑 {locale === 'ar' ? 'إعدادات المساعد الذكي:' : 'AI Settings:'}
              </label>
              <div className="flex flex-col sm:flex-row w-full gap-2 items-center flex-wrap">
                <Input
                  type="password"
                  placeholder={locale === 'ar' ? 'مفتاح API (Gemini / AgentRouter / OpenRouter / Nvidia)' : 'API Key (Gemini / AgentRouter / OpenRouter / Nvidia)'}
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  className="h-8 text-xs font-mono flex-1 min-w-[200px]"
                />
                <select
                  value={aiProvider}
                  onChange={(e) => {
                    const prov = e.target.value as any
                    setAiProvider(prov)
                    if (prov === 'gemini') {
                      setAiModel('gemini-2.5-flash')
                      setIsCustomModel(false)
                    } else if (prov === 'agentrouter') {
                      setAiModel('glm-5.1')
                      setIsCustomModel(false)
                    } else if (prov === 'openrouter') {
                      setAiModel('z-ai/glm-5.1')
                      setIsCustomModel(false)
                    } else if (prov === 'nvidia') {
                      setAiModel('z-ai/glm-5.1')
                      setIsCustomModel(false)
                    }
                  }}
                  className="h-8 text-xs border rounded bg-background px-2 py-1 font-semibold focus:outline-none w-full sm:w-auto shrink-0 text-foreground cursor-pointer"
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="agentrouter">AgentRouter</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="nvidia">Nvidia integrate</option>
                </select>
                <select
                  value={isCustomModel ? 'custom' : aiModel}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === 'custom') {
                      setIsCustomModel(true)
                    } else {
                      setIsCustomModel(false)
                      setAiModel(val)
                    }
                  }}
                  className="h-8 text-xs border rounded bg-background px-2 py-1 font-mono focus:outline-none w-full sm:w-auto shrink-0 text-foreground cursor-pointer"
                >
                  {aiProvider === 'gemini' && (
                    <>
                      <option value="gemini-2.5-flash">gemini-2.5-flash</option>
                      <option value="gemini-2.5-pro">gemini-2.5-pro</option>
                      <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                      <option value="gemini-1.5-pro">gemini-1.5-pro</option>
                      <option value="models/gemma-4-31b-it">models/gemma-4-31b-it</option>
                    </>
                  )}
                  {aiProvider === 'agentrouter' && (
                    <>
                      <option value="glm-5.1">glm-5.1</option>
                      <option value="deepseek-v4-pro">deepseek-v4-pro</option>
                      <option value="deepseek-v4-flash">deepseek-v4-flash</option>
                      <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                      <option value="claude-opus-4-6">claude-opus-4-6</option>
                    </>
                  )}
                  {aiProvider === 'openrouter' && (
                    <>
                      <option value="z-ai/glm-5.1">z-ai/glm-5.1</option>
                    </>
                  )}
                  {aiProvider === 'nvidia' && (
                    <>
                      <option value="z-ai/glm-5.1">z-ai/glm-5.1</option>
                    </>
                  )}
                  <option value="custom">{locale === 'ar' ? 'نموذج مخصص...' : 'Custom Model...'}</option>
                </select>
                {isCustomModel && (
                  <Input
                    type="text"
                    placeholder={locale === 'ar' ? 'اسم النموذج المخصص' : 'Custom Model Name'}
                    value={customModelName}
                    onChange={(e) => setCustomModelName(e.target.value)}
                    className="h-8 text-xs font-mono w-full sm:w-40"
                  />
                )}
                <Button
                  size="sm"
                  onClick={() => handleSaveGeminiKey(geminiApiKey, aiProvider, isCustomModel ? 'custom' : aiModel, isCustomModel, customModelName)}
                  className="h-8 text-xs bg-primary hover:bg-primary/90 text-primary-foreground font-semibold w-full sm:w-auto shrink-0"
                >
                  {locale === 'ar' ? 'حفظ' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          {/* Chat Messages scroll area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-muted/10 flex flex-col min-h-0">
            {chatMessages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-4">
                <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center border border-purple-500/20 text-purple-500 animate-bounce">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div className="space-y-1.5 max-w-md">
                  <h5 className="text-sm font-semibold text-foreground">
                    {locale === 'ar' ? 'مرحباً بك في مساعد البث الذكي!' : 'Welcome to the Smart Broadcaster AI!'}
                  </h5>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {locale === 'ar'
                      ? 'يمكنك سؤالي عن صياغة عناوين إسلامية جذابة، توليد أوصاف للبث، أو كتابة قوائم عشوائية كاملة لتطبيقها على القنوات.'
                      : 'Ask me to formulate Islamic titles, generate descriptions, or construct random title lists to apply to slots.'}
                  </p>
                </div>

                {/* Quick Prompts */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg pt-4">
                  <button
                    onClick={() => handleSendAiMessage(locale === 'ar' ? 'اقترح لي 10 عناوين إسلامية مميزة لبث تلاوة القرآن الكريم' : 'Suggest 10 attractive Islamic titles for Quran recitation livestream')}
                    className="p-2.5 text-xs text-left bg-card hover:bg-muted border rounded-lg transition-colors flex items-center gap-2"
                  >
                    📝 {locale === 'ar' ? 'اقتراح عناوين للبث الإسلامي' : 'Suggest Quran titles'}
                  </button>
                  <button
                    onClick={() => handleSendAiMessage(locale === 'ar' ? 'اقترح لي قائمة عناوين وأوصاف جاهزة للحفظ بصيغة JSON' : 'Generate a list of titles and descriptions formatted in JSON for saving')}
                    className="p-2.5 text-xs text-left bg-card hover:bg-muted border rounded-lg transition-colors flex items-center gap-2"
                  >
                    🗃️ {locale === 'ar' ? 'توليد قائمة عناوين جاهزة للحفظ' : 'Generate JSON list for saving'}
                  </button>
                  <button
                    onClick={() => handleSendAiMessage(locale === 'ar' ? 'كيف يمكنني ربط وترخيص قنوات اليوتيوب في المتصفح الخاص بي؟' : 'How do I link and authorize YouTube channels using my browser?')}
                    className="p-2.5 text-xs text-left bg-card hover:bg-muted border rounded-lg transition-colors flex items-center gap-2"
                  >
                    🔗 {locale === 'ar' ? 'كيفية ربط وترخيص القنوات' : 'How to link/auth channels'}
                  </button>
                  <button
                    onClick={() => handleSendAiMessage(locale === 'ar' ? 'ما هي ميزة البث المسجل فقط وميزة التبديل قبل الإيقاف؟' : 'What is recorded-only stream and pre-stop swap video feature?')}
                    className="p-2.5 text-xs text-left bg-card hover:bg-muted border rounded-lg transition-colors flex items-center gap-2"
                  >
                    ℹ️ {locale === 'ar' ? 'معرفة المزيد عن مزايا الجدولة' : 'Explain schedule features'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4 flex flex-col justify-end">
                {chatMessages.map((msg, index) => {
                  if (msg.role === 'function') {
                    const funcNames = msg.parts?.map((p: any) => p.functionResponse?.name).join(', ') || 'الإجراء';
                    let label = locale === 'ar' ? `🔧 تم تنفيذ إجراء: ${funcNames}` : `🔧 Executed action: ${funcNames}`;
                    if (funcNames.includes('startStream')) label = locale === 'ar' ? '⚡ تم بدء تشغيل البث بنجاح' : '⚡ Stream started successfully';
                    if (funcNames.includes('stopStream')) label = locale === 'ar' ? '🛑 تم إيقاف تشغيل البث بنجاح' : '🛑 Stream stopped successfully';
                    if (funcNames.includes('updateSlotConfig')) label = locale === 'ar' ? '📝 تم تحديث إعدادات القناة بنجاح' : '📝 Slot configuration updated successfully';
                    if (funcNames.includes('applyBulkAction')) label = locale === 'ar' ? '⚙️ تم تطبيق الإجراء الجماعي بنجاح' : '⚙️ Bulk action applied successfully';
                    if (funcNames.includes('navigateUI')) label = locale === 'ar' ? '🧭 تم تغيير واجهة العرض بنجاح' : '🧭 UI view redirected successfully';
                    
                    return (
                      <div key={index} className="self-center my-1 text-[10px] bg-muted/60 border border-border/40 px-3 py-1 rounded-full text-muted-foreground/80 flex items-center gap-1 font-mono shrink-0">
                        {label}
                      </div>
                    );
                  }

                  if (!msg.text || msg.text.trim() === '') return null;

                  const isUser = msg.role === 'user'
                  return (
                    <div
                      key={index}
                      className={`flex flex-col max-w-[85%] ${
                        isUser ? 'self-end items-end' : 'self-start items-start'
                      }`}
                    >
                      <div className="text-[10px] text-muted-foreground mb-1 px-1">
                        {isUser ? (locale === 'ar' ? 'أنت' : 'You') : (locale === 'ar' ? 'مساعد البث' : 'Broadcaster AI')}
                      </div>
                      <div
                        className={`p-3 rounded-xl text-xs leading-relaxed ${
                          isUser
                            ? 'bg-purple-600 text-white rounded-br-none shadow-md shadow-purple-500/20'
                            : 'bg-card border border-border text-foreground rounded-bl-none'
                        }`}
                        style={{ whiteSpace: 'pre-wrap' }}
                      >
                        {msg.text}
                      </div>

                      {/* If the message is from model and contains JSON structured title-desc list, offer save button */}
                      {!isUser && (() => {
                        try {
                          const jsonRegex = /\{[\s\S]*\}|\[[\s\S]*\]/
                          const match = msg.text.match(jsonRegex)
                          if (match) {
                            const parsed = JSON.parse(match[0])
                            const hasTitles = Array.isArray(parsed.titles) && parsed.titles.length > 0
                            const hasDescs = Array.isArray(parsed.descriptions) && parsed.descriptions.length > 0
                            if (hasTitles || hasDescs) {
                              return (
                                <div className="mt-2 flex gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      const listName = prompt(locale === 'ar' ? 'أدخل اسماً لقائمة العناوين الجديدة:' : 'Enter a name for the new Title/Desc List:')
                                      if (!listName?.trim()) return
                                      try {
                                        const titles = parsed.titles || [];
                                        const descs = parsed.descriptions || [];
                                        const maxLen = Math.max(titles.length, descs.length);
                                         const pairs: any[] = [];
                                        for (let i = 0; i < maxLen; i++) {
                                          pairs.push({
                                            id: Math.random().toString(36).substring(7),
                                            title: titles[i] || '',
                                            description: descs[i] || ''
                                          });
                                        }

                                        const res = await fetch('/api/title-desc-lists', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            name: listName.trim(),
                                            items: JSON.stringify(pairs)
                                          })
                                        })
                                        const rData = await res.json()
                                        if (rData.success) {
                                          alert(locale === 'ar' ? 'تم حفظ القائمة بنجاح وجلبها للوحة!' : 'List saved successfully to the dashboard!')
                                          fetchSlots()
                                        } else {
                                          alert(rData.error || 'Failed to save list')
                                        }
                                      } catch (err: any) {
                                        alert(`Error: ${err.message}`)
                                      }
                                    }}
                                    className="h-7 text-[10px] font-bold border-purple-500/30 bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-600 hover:text-white flex items-center gap-1"
                                  >
                                    💾 {locale === 'ar' ? 'حفظ كقائمة في اللوحة' : 'Save as new list in panel'}
                                  </Button>
                                </div>
                              )
                            }
                          }
                        } catch {}
                        return null
                      })()}
                    </div>
                  )
                })}
                {aiLoading && (
                  <div className="self-start flex flex-col items-start max-w-[85%]">
                    <div className="text-[10px] text-muted-foreground mb-1 px-1">
                      {locale === 'ar' ? 'مساعد البث' : 'Broadcaster AI'}
                    </div>
                    <div className="p-3 rounded-xl bg-card border border-border text-foreground rounded-bl-none flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-500" />
                      <span className="text-[10px] text-muted-foreground">{locale === 'ar' ? 'جاري الكتابة...' : 'Typing...'}</span>
                    </div>
                  </div>
                )}
                <div ref={chatScrollRef} />
              </div>
            )}
          </div>

          {/* Chat message input */}
          <div className="shrink-0 p-4 border-t border-border/80 bg-background flex gap-2">
            {chatMessages.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setChatMessages([])}
                className="h-9 w-9 p-0 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-500 shrink-0"
                title={locale === 'ar' ? 'مسح الرسائل' : 'Clear Chat'}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
            <Input
              value={aiInputValue}
              onChange={(e) => setAiInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSendAiMessage()
                }
              }}
              placeholder={locale === 'ar' ? 'اسأل مساعد الذكاء الاصطناعي...' : 'Ask the AI Assistant...'}
              className="text-xs bg-muted/30 flex-1"
            />
            <Button
              onClick={() => handleSendAiMessage()}
              disabled={aiLoading || !aiInputValue.trim()}
              className="bg-purple-600 hover:bg-purple-500 text-white font-bold px-5 h-9 shrink-0"
            >
              {locale === 'ar' ? 'إرسال' : 'Send'}
            </Button>
          </div>
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

      {/* ── Bulk Title & Description Dialog ── */}
      <Dialog open={bulkTitleDescOpen} onOpenChange={(open) => !open && setBulkTitleDescOpen(false)}>
        <DialogContent className="sm:max-w-md w-[95vw] bg-card border border-border shadow-2xl rounded-xl" dir={dir}>
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Edit3 className="w-5 h-5 text-primary" />
              {targetSlotsForAction 
                ? (locale === 'ar' ? `تعيين العنوان والوصف للمحدد (${targetSlotsForAction.length} قناة)` : `Set Title & Description for Selected (${targetSlotsForAction.length} slots)`)
                : (locale === 'ar' ? 'تعيين عنوان ووصف لكافة البثوث' : 'Set Title & Description for All Slots')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === 'ar'
                ? 'أدخل العنوان والوصف الموحدين ليتم إعادة تعيينهما لجميع القنوات المختارة.'
                : 'Enter a unified title and description to apply to all selected channels.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground block">{locale === 'ar' ? 'العنوان' : 'Title'}</label>
              <Input
                value={bulkTitle}
                onChange={(e) => setBulkTitle(e.target.value)}
                placeholder={locale === 'ar' ? 'مثال: بث مباشر 24 ساعة...' : 'e.g. 24/7 Live Stream...'}
                className="w-full bg-background"
                dir="auto"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground block">{locale === 'ar' ? 'الوصف' : 'Description'}</label>
              <textarea
                value={bulkDesc}
                onChange={(e) => setBulkDesc(e.target.value)}
                placeholder={locale === 'ar' ? 'أدخل تفاصيل البث هنا...' : 'Enter stream description here...'}
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                dir="auto"
              />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 bg-muted/40 border-t border-border/80">
            <Button variant="outline" onClick={() => setBulkTitleDescOpen(false)}>
              {locale === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                bulkAction('setTitleDescAll', undefined, { youtubeTitle: bulkTitle, youtubeDescription: bulkDesc }, targetSlotsForAction)
                setBulkTitleDescOpen(false)
              }}
            >
              {locale === 'ar' ? 'تعيين' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk Episode Dialog ── */}
      <Dialog open={bulkEpisodeOpen} onOpenChange={(open) => !open && setBulkEpisodeOpen(false)}>
        <DialogContent className="sm:max-w-md w-[95vw] bg-card border border-border shadow-2xl rounded-xl" dir={dir}>
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Dices className="w-5 h-5 text-primary" />
              {targetSlotsForAction 
                ? (locale === 'ar' ? `تعيين رقم الحلقة للمحدد (${targetSlotsForAction.length} قناة)` : `Set Episode Number for Selected (${targetSlotsForAction.length} slots)`)
                : (locale === 'ar' ? 'تعيين رقم الحلقة لكافة القنوات' : 'Set Episode Number for All Slots')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === 'ar'
                ? 'أدخل الرقم التمهيدي/البدائي لجميع القنوات المختارة. سيتم زيادة هذا الرقم تلقائياً في كل مرة يبدأ فيها البث.'
                : 'Enter the starting episode number for all selected slots. This number will increment automatically upon stream start.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground block">
                {locale === 'ar' ? 'رقم الحلقة' : 'Episode Number'}
              </label>
              <Input
                type="number"
                min={0}
                value={bulkEpisode}
                onChange={(e) => setBulkEpisode(parseInt(e.target.value) || 0)}
                placeholder="1"
                className="w-full bg-background"
              />
            </div>
          </div>
          <DialogFooter className="px-6 py-4 bg-muted/40 border-t border-border/80">
            <Button variant="outline" onClick={() => setBulkEpisodeOpen(false)}>
              {locale === 'ar' ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                bulkAction('setEpisodeNumberAll', undefined, { episodeNumber: bulkEpisode }, targetSlotsForAction)
                setBulkEpisodeOpen(false)
              }}
            >
              {locale === 'ar' ? 'تعيين' : 'Apply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Title/Desc List Manager Dialog ── */}
      <Dialog open={titleDescManagerOpen} onOpenChange={(open) => {
        if (!open) {
          setTitleDescManagerOpen(false)
          setEditingList(null)
        }
      }}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col w-[95vw] bg-card border border-border shadow-2xl rounded-xl" dir={dir}>
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Shuffle className="w-5 h-5 text-pink-500" />
              {locale === 'ar' ? 'مدير قوائم العناوين والأوصاف العشوائية' : 'Random Title & Desc Lists'}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === 'ar'
                ? 'أنشئ قوائم تحتوي على عناوين وأوصاف. عند تعيين قائمة لقناة، يُختار عنوان ووصف عشوائياً في كل مرة يبدأ فيها البث.'
                : 'Build lists of titles & descriptions. When a list is assigned to a channel, a random pair is picked every time the stream starts.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 flex gap-4 p-6 pt-2">
            {/* Left Side: Lists */}
            <div className="w-1/3 flex flex-col gap-3 border-r border-border/50 pr-4 min-h-0">
              <Button
                variant="outline"
                className="w-full border-dashed border-2 hover:border-pink-500/50 text-muted-foreground hover:text-pink-600 hover:bg-pink-500/5 transition-colors"
                onClick={() => { setEditingList({ name: '', pairs: [] }); setEditingListError('') }}
              >
                <Plus className="w-4 h-4 mr-2" />
                {locale === 'ar' ? 'إنشاء قائمة جديدة' : 'New List'}
              </Button>
              <div className="flex-1 overflow-y-auto h-full pr-2 min-h-0 custom-scrollbar">
                <div className="space-y-2">
                  {isFetchingLists && titleDescLists.length === 0 && (
                    <div className="flex items-center justify-center py-6 text-muted-foreground text-xs gap-2">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {locale === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
                    </div>
                  )}
                  {!isFetchingLists && titleDescLists.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground gap-2">
                      <BookOpen className="w-8 h-8 opacity-25" />
                      <p className="text-xs">{locale === 'ar' ? 'لا توجد قوائم بعد. أنشئ قائمة جديدة.' : 'No lists yet. Create your first list.'}</p>
                    </div>
                  )}
                  {titleDescLists.map(list => {
                    const count = (() => { try { return JSON.parse(list.items).length } catch { return 0 } })()
                    const isEditing = editingList?.id === list.id
                    return (
                    <div key={list.id} className={`flex flex-col gap-2 p-3 rounded-xl border transition-colors cursor-pointer ${
                      isEditing
                        ? 'border-pink-500/50 bg-pink-500/5'
                        : 'border-border/60 bg-muted/20 hover:bg-muted/40'
                    }`}>
                      <div className="font-semibold text-sm truncate">{list.name}</div>
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono">
                          {count} {locale === 'ar' ? 'عنصر' : count === 1 ? 'item' : 'items'}
                        </Badge>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-blue-500 hover:bg-blue-500/10 rounded" title={locale === 'ar' ? 'تعديل' : 'Edit'} onClick={() => {
                            setEditingListError('')
                            try {
                              setEditingList({ id: list.id, name: list.name, pairs: JSON.parse(list.items) })
                            } catch {
                              setEditingList({ id: list.id, name: list.name, pairs: [] })
                            }
                          }}>
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500 hover:bg-red-500/10 rounded" title={locale === 'ar' ? 'حذف' : 'Delete'} onClick={() => handleDeleteList(list.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Right Side: Editor */}
            <div className="w-2/3 flex flex-col gap-4 min-h-0">
              {editingList ? (
                <>
                  <div className="shrink-0 space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground block">{locale === 'ar' ? 'اسم القائمة' : 'List Name'}</label>
                    <Input
                      value={editingList.name}
                      onChange={(e) => { setEditingList({ ...editingList, name: e.target.value }); setEditingListError('') }}
                      placeholder={locale === 'ar' ? 'مثال: قائمة أفلام رعب...' : 'e.g. Horror Movies List...'}
                      className="w-full bg-background font-semibold text-base"
                    />
                  </div>

                  {/* Error message */}
                  {editingListError && (
                    <div className="flex items-center gap-2 text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 shrink-0">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      {editingListError}
                    </div>
                  )}

                  <div className="flex-1 border rounded-xl bg-muted/10 overflow-hidden flex flex-col min-h-0">
                    <div className="bg-muted/40 border-b border-border px-4 py-2 flex justify-between items-center shrink-0">
                      <span className="text-xs font-semibold text-muted-foreground">
                        <span className="font-bold text-foreground tabular-nums">{editingList.pairs.length}</span>
                        {' '}{locale === 'ar' ? 'عنوان/وصف' : 'pairs'}
                      </span>
                      <div className="flex items-center gap-2">
                        <input type="file" id="excel-upload" accept=".xlsx, .xls, .csv" className="hidden" onChange={handleExcelUpload} />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          onClick={handleDownloadTemplate}
                        >
                          <Download className="w-3.5 h-3.5" />
                          {locale === 'ar' ? 'تحميل قالب Excel' : 'Download Template'}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs gap-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-500/10"
                          onClick={() => document.getElementById('excel-upload')?.click()}
                        >
                          <Upload className="w-3.5 h-3.5" />
                          {locale === 'ar' ? 'رفع Excel' : 'Upload Excel'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs gap-1.5 hover:bg-pink-500/10 hover:text-pink-600 transition-colors"
                          onClick={() => {
                            setEditingList({
                              ...editingList,
                              pairs: [...editingList.pairs, { id: Math.random().toString(36).substring(7), title: '', description: '' }]
                            });
                            setTimeout(() => {
                              const container = document.getElementById('title-desc-pairs-container');
                              if (container) {
                                container.parentElement?.parentElement?.scrollTo({
                                  top: container.scrollHeight,
                                  behavior: 'smooth'
                                });
                              }
                            }, 50);
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {locale === 'ar' ? 'إضافة عنصر' : 'Add Item'}
                        </Button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 min-h-0 custom-scrollbar">
                      <div id="title-desc-pairs-container" className="space-y-3 pb-4">
                        {editingList.pairs.map((pair, index) => (
                          <div key={pair.id} className="relative p-3 bg-card border border-border/80 rounded-lg space-y-2 hover:border-border transition-colors">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] font-mono text-muted-foreground/60">#{index + 1}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0 text-red-400 hover:bg-red-500/10 hover:text-red-600 rounded-md"
                                title={locale === 'ar' ? 'حذف العنصر' : 'Remove item'}
                                onClick={() => setEditingList({
                                  ...editingList,
                                  pairs: editingList.pairs.filter(p => p.id !== pair.id)
                                })}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                            <div className="space-y-1.5">
                              <div className="relative">
                                <Input
                                  maxLength={100}
                                  value={pair.title}
                                  onChange={(e) => setEditingList({
                                    ...editingList,
                                    pairs: editingList.pairs.map(p => p.id === pair.id ? { ...p, title: e.target.value } : p)
                                  })}
                                  placeholder={locale === 'ar' ? 'العنوان (حتى 100 حرف)...' : 'Title (up to 100 chars)...'}
                                  className="h-8 text-sm pr-14"
                                  dir="auto"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/50 pointer-events-none">
                                  {pair.title.length}/100
                                </span>
                              </div>
                              <div className="relative">
                                <textarea
                                  maxLength={4500}
                                  value={pair.description}
                                  onChange={(e) => setEditingList({
                                    ...editingList,
                                    pairs: editingList.pairs.map(p => p.id === pair.id ? { ...p, description: e.target.value } : p)
                                  })}
                                  placeholder={locale === 'ar' ? 'الوصف (حتى 4500 حرف)...' : 'Description (up to 4500 chars)...'}
                                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pr-14"
                                  dir="auto"
                                />
                                <span className="absolute right-2 bottom-2 text-[10px] font-mono text-muted-foreground/50 pointer-events-none bg-background px-1 rounded">
                                  {pair.description.length}/4500
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {editingList.pairs.length === 0 && (
                          <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                            <List className="w-10 h-10 opacity-20" />
                            <div className="text-center">
                              <p className="text-sm font-medium">{locale === 'ar' ? 'القائمة فارغة' : 'List is empty'}</p>
                              <p className="text-xs opacity-60 mt-0.5">{locale === 'ar' ? 'اضغط "إضافة عنصر" لإضافة عنوان ووصف' : 'Click "Add Item" to add a title & description pair'}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                    <Button variant="ghost" className="text-muted-foreground" onClick={() => { setEditingList(null); setEditingListError('') }}>
                      {locale === 'ar' ? 'إلغاء' : 'Cancel'}
                    </Button>
                    <Button
                      variant="default"
                      onClick={handleSaveList}
                      disabled={!editingList.name.trim() || editingList.pairs.length === 0 || isSavingList}
                      className="gap-2 min-w-[100px]"
                    >
                      {isSavingList ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {isSavingList
                        ? (locale === 'ar' ? 'جارٍ الحفظ...' : 'Saving...')
                        : (locale === 'ar' ? 'حفظ القائمة' : 'Save List')}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground border-2 border-dashed rounded-xl">
                  <Shuffle className="w-10 h-10 opacity-20" />
                  <div className="text-center">
                    <p className="text-sm font-medium">{locale === 'ar' ? 'لم يتم اختيار قائمة' : 'No list selected'}</p>
                    <p className="text-xs opacity-60 mt-0.5">{locale === 'ar' ? 'اختر قائمة لتعديلها أو أنشئ قائمة جديدة' : 'Select a list to edit or create a new one'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Bulk List Selector Dialog ── */}
      <Dialog open={bulkRandomTitleDescOpen} onOpenChange={(open) => !open && setBulkRandomTitleDescOpen(false)}>
        <DialogContent className="sm:max-w-md w-[95vw] bg-card border border-border shadow-2xl rounded-xl" dir={dir}>
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold">
              <Shuffle className="w-5 h-5 text-pink-500" />
              {targetSlotsForAction 
                ? (locale === 'ar' ? `تعيين قائمة عشوائية (${targetSlotsForAction.length} قناة)` : `Assign Random List (${targetSlotsForAction.length} slots)`)
                : (locale === 'ar' ? 'تعيين قائمة عشوائية لجميع القنوات' : 'Assign Random List to All Slots')}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {locale === 'ar'
                ? 'سيتم اختيار عنوان ووصف عشوائي من القائمة في كل مرة يبدأ فيها البث.'
                : 'A random title & description will be picked from the list each time a stream starts.'}
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-bold text-foreground">{locale === 'ar' ? 'اختر القائمة' : 'Select a List'}</label>
              <Button size="sm" variant="ghost" className="h-7 text-xs text-pink-500 hover:text-pink-600 hover:bg-pink-500/10" onClick={() => setTitleDescManagerOpen(true)}>
                <Settings className="w-3.5 h-3.5 mr-1" />
                {locale === 'ar' ? 'إدارة القوائم' : 'Manage Lists'}
              </Button>
            </div>
            
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
              {/* Remove option */}
              <div 
                className="flex items-center gap-2 p-3 border border-red-500/20 bg-red-500/5 rounded-lg cursor-pointer hover:bg-red-500/10 transition-colors"
                onClick={() => {
                  bulkAction('setTitleDescListAll', undefined, { listId: null }, targetSlotsForAction)
                  setBulkRandomTitleDescOpen(false)
                }}
              >
                <Trash2 className="w-4 h-4 text-red-500 shrink-0" />
                <span className="font-semibold text-sm text-red-500">
                  {locale === 'ar' ? 'إزالة القائمة المعيّنة' : 'Remove Assigned List'}
                </span>
              </div>
              
              {titleDescLists.map(list => {
                const count = (() => { try { return JSON.parse(list.items).length } catch { return 0 } })()
                return (
                <div 
                  key={list.id} 
                  className="p-3 border border-border/80 rounded-lg cursor-pointer hover:border-pink-500/50 hover:bg-pink-500/5 transition-all group"
                  onClick={() => {
                    bulkAction('setTitleDescListAll', undefined, { listId: list.id }, targetSlotsForAction)
                    setBulkRandomTitleDescOpen(false)
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-sm group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">{list.name}</div>
                    <Badge variant="secondary" className="text-[10px] h-5 px-1.5 font-mono shrink-0">
                      {count} {locale === 'ar' ? 'عنصر' : count === 1 ? 'item' : 'items'}
                    </Badge>
                  </div>
                </div>
                )
              })}
              
              {titleDescLists.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                  <BookOpen className="w-8 h-8 opacity-25" />
                  <p className="text-sm">{locale === 'ar' ? 'لا توجد قوائم بعد.' : 'No lists yet.'}</p>
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setTitleDescManagerOpen(true)}>
                    <Plus className="w-3 h-3 mr-1" />
                    {locale === 'ar' ? 'إنشاء قائمة' : 'Create a List'}
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Selected Slots Floating Actions Bar ── */}
      {selectedSlots.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 w-auto max-w-[95vw] bg-background/85 backdrop-blur-md border border-border/80 shadow-2xl rounded-2xl px-6 py-3 flex items-center gap-3 overflow-x-auto select-none transition-all duration-300 animate-springy-slide-up">
          <div className="flex items-center gap-2 border-r border-border/80 pr-3 shrink-0">
            <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/15 font-bold text-xs">
              {locale === 'ar' ? `تم تحديد ${selectedSlots.length}` : `${selectedSlots.length} Selected`}
            </Badge>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground rounded-md"
              onClick={() => setSelectedSlots([])}
              title={locale === 'ar' ? 'إلغاء التحديد' : 'Deselect All'}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Start Selected */}
            <Button
              size="sm"
              variant="default"
              className="h-8 bg-green-600 hover:bg-green-700 text-white font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('startAll', locale === 'ar' ? 'تشغيل القنوات المحددة؟' : 'Start selected slots?', undefined, selectedSlots)}
            >
              <Play className="w-3 h-3 fill-current" />
              {locale === 'ar' ? 'تشغيل' : 'Start'}
            </Button>

            {/* Stop Selected */}
            <Button
              size="sm"
              variant="destructive"
              className="h-8 bg-red-600 hover:bg-red-700 text-white font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('stopAll', locale === 'ar' ? 'إيقاف القنوات المحددة؟' : 'Stop selected slots?', undefined, selectedSlots)}
            >
              <Square className="w-3 h-3 fill-current" />
              {locale === 'ar' ? 'إيقاف' : 'Stop'}
            </Button>

            {/* Set Title & Description */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => {
                setTargetSlotsForAction(selectedSlots)
                setBulkTitle('')
                setBulkDesc('')
                setBulkTitleDescOpen(true)
              }}
            >
              <Edit3 className="w-3 h-3" />
              {locale === 'ar' ? 'العنوان والوصف' : 'Title & Desc'}
            </Button>

            {/* Set Random Title & Description */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-pink-500/20 bg-pink-500/5 hover:bg-pink-500/10 text-pink-600 dark:text-pink-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => {
                setTargetSlotsForAction(selectedSlots)
                setBulkRandomTitleDescOpen(true)
              }}
            >
              <Shuffle className="w-3 h-3" />
              {locale === 'ar' ? 'عناوين عشوائية' : 'Random List'}
            </Button>

            {/* Set Thumbnail Folder/Path */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 text-violet-600 dark:text-violet-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => {
                setTargetSlotsForAction(selectedSlots)
                setBulkThumbnailSelectorOpen(true)
              }}
            >
              <ImageIcon className="w-3 h-3" />
              {locale === 'ar' ? 'غلاف/مجلد' : 'Thumbnail/Folder'}
            </Button>

            {/* Clear Thumbnail */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-500 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('clearThumbnailAll', locale === 'ar' ? 'حذف غلاف القنوات المحددة؟' : 'Clear thumbnail for selected slots?', undefined, selectedSlots)}
              title={locale === 'ar' ? 'مسح الغلاف للمحدد' : 'Clear Thumbnail'}
            >
              <Trash2 className="w-3 h-3" />
              {locale === 'ar' ? 'مسح الغلاف' : 'Clear Cover'}
            </Button>

            {/* Set Swap Video/Folder */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-teal-500/20 bg-teal-500/5 hover:bg-teal-500/10 text-teal-600 dark:text-teal-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => {
                setTargetSlotsForAction(selectedSlots)
                setBulkSwapSelectorOpen(true)
              }}
            >
              <FolderOpen className="w-3 h-3" />
              {locale === 'ar' ? 'تبديل للكل' : 'Swap Selected'}
            </Button>

            {/* Clear Swap */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-500 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('clearSwapVideoAll', locale === 'ar' ? 'حذف مجلد/فيديو التبديل للمحدد؟' : 'Clear swap for selected slots?', undefined, selectedSlots)}
              title={locale === 'ar' ? 'إلغاء التبديل للمحدد' : 'Clear Swap'}
            >
              <Trash2 className="w-3 h-3" />
              {locale === 'ar' ? 'إلغاء التبديل للكل' : 'Disable Swap'}
            </Button>

            {/* Set File Only */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-teal-500/20 bg-teal-500/5 hover:bg-teal-500/10 text-teal-600 dark:text-teal-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('setFileOnlyAll', locale === 'ar' ? 'هل تريد ضبط القنوات المحددة إلى بث مسجل فقط (ملف) وإلغاء التبديل؟' : 'Set selected slots to recorded stream only (file input) and disable swap?', undefined, selectedSlots)}
            >
              <FileVideo className="w-3.5 h-3.5" />
              {locale === 'ar' ? 'مسجل فقط' : 'File Only'}
            </Button>

            {/* Set Closest 20 */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-teal-500/20 bg-teal-500/5 hover:bg-teal-500/10 text-teal-600 dark:text-teal-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('setClosestHourAll', locale === 'ar' ? 'ضبط القنوات المحددة لأقرب 20 دقيقة وبث 13 دقيقة؟' : 'Set selected slots to nearest 20 mins?', undefined, selectedSlots)}
            >
              <Clock className="w-3.5 h-3.5" />
              {locale === 'ar' ? 'أقرب 20' : 'Closest 20m'}
            </Button>

            {/* Set Closest 30 */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('setClosest30m24mAll', locale === 'ar' ? 'ضبط القنوات المحددة لأقرب نصف ساعة وبث 24 دقيقة؟' : 'Set selected slots to nearest 30 mins?', undefined, selectedSlots)}
            >
              <Clock className="w-3.5 h-3.5" />
              {locale === 'ar' ? 'أقرب 30' : 'Closest 30m'}
            </Button>

            {/* Set Closest Hour */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('setClosestHour50mAll', locale === 'ar' ? 'ضبط القنوات المحددة لأقرب ساعة وبث 50 دقيقة؟' : 'Set selected slots to nearest hour?', undefined, selectedSlots)}
            >
              <Clock className="w-3.5 h-3.5" />
              {locale === 'ar' ? 'أقرب ساعة' : 'Closest Hour'}
            </Button>

            {/* Set Closest 2h */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('setClosest2h110mAll', locale === 'ar' ? 'ضبط القنوات المحددة لأقرب ساعتين وبث ساعة و50 دقيقة؟' : 'Set selected slots to nearest 2 hours?', undefined, selectedSlots)}
            >
              <Clock className="w-3.5 h-3.5" />
              {locale === 'ar' ? 'أقرب ساعتين' : 'Closest 2h'}
            </Button>

            {/* Repeat 20m / Hourly */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('hourlyAll', locale === 'ar' ? 'تفعيل تكرار 20 دقيقة للقنوات المحددة؟' : 'Enable 20m hourly for selected slots?', undefined, selectedSlots)}
            >
              <Sun className="w-3 h-3" />
              {locale === 'ar' ? '20 دقيقة للكل' : '20m Repeat'}
            </Button>

            {/* Repeat 30m */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('repeat30mAll', locale === 'ar' ? 'تفعيل تكرار 30 دقيقة للقنوات المحددة؟' : 'Enable 30m repeat for selected slots?', undefined, selectedSlots)}
            >
              <Sun className="w-3 h-3" />
              {locale === 'ar' ? '30 دقيقة للكل' : '30m Repeat'}
            </Button>

            {/* Repeat 1h */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('repeat1hAll', locale === 'ar' ? 'تفعيل تكرار ساعة للقنوات المحددة؟' : 'Enable 1h repeat for selected slots?', undefined, selectedSlots)}
            >
              <Sun className="w-3 h-3" />
              {locale === 'ar' ? 'ساعة للكل' : '1h Repeat'}
            </Button>

            {/* Repeat 2h */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 text-purple-600 dark:text-purple-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('repeat2hAll', locale === 'ar' ? 'تفعيل تكرار ساعتين للقنوات المحددة؟' : 'Enable 2h repeat for selected slots?', undefined, selectedSlots)}
            >
              <Sun className="w-3 h-3" />
              {locale === 'ar' ? 'ساعتين للكل' : '2h Repeat'}
            </Button>

            {/* Daily */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-orange-500/20 bg-orange-500/5 hover:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('dailyAll', locale === 'ar' ? 'تفعيل يومي للقنوات المحددة؟' : 'Enable daily for selected slots?', undefined, selectedSlots)}
            >
              <Sun className="w-3 h-3" />
              {locale === 'ar' ? 'يومي للكل' : 'Daily All'}
            </Button>

            {/* Clear Times */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-500 font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('clearTimesAll', locale === 'ar' ? 'مسح التواريخ للقنوات المحددة؟' : 'Clear times for selected slots?', undefined, selectedSlots)}
            >
              <X className="w-3.5 h-3.5" />
              {locale === 'ar' ? 'مسح التواريخ' : 'Clear Times'}
            </Button>


            {/* Reset Selected */}
            <Button
              size="sm"
              variant="outline"
              className="h-8 border-gray-500/20 hover:bg-muted font-medium gap-1 text-xs btn-premium"
              onClick={() => confirmBulkAction('resetAll', locale === 'ar' ? 'إعادة تعيين القنوات المحددة؟' : 'Reset selected slots?', undefined, selectedSlots)}
            >
              <RotateCcw className="w-3 h-3" />
              {locale === 'ar' ? 'إعادة تعيين' : 'Reset'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
