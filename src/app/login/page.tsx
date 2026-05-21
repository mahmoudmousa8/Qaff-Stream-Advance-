'use client'

import { useState, useEffect } from 'react'
import { Sun, Moon, Globe, Loader2 } from 'lucide-react'
import { t, isRTL, setLocale, getLocale, Locale } from '@/lib/i18n'

export default function LoginPage() {
    const [password, setPassword] = useState('')
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [shake, setShake] = useState(false)
    // Read from DOM — layout.tsx already set the 'dark' class before first paint
    const [isDarkMode, setIsDarkMode] = useState(false)
    const [locale, setLocaleState] = useState<Locale>('ar')

    const dir = locale === 'ar' ? 'rtl' : 'ltr'

    useEffect(() => {
        // Only read, do NOT re-apply the class (layout.tsx inline script already did it)
        setIsDarkMode(document.documentElement.classList.contains('dark'))
        setLocaleState(getLocale())
    }, [])

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

    const switchLocale = () => {
        const newLocale = locale === 'ar' ? 'en' : 'ar'
        setLocale(newLocale)
        setLocaleState(newLocale)
    }

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password }),
            })

            const data = await res.json()

            if (data.success) {
                window.location.href = '/'
            } else {
                setError(data.error || t('invalidPassword'))
                setShake(true)
                setTimeout(() => setShake(false), 600)
            }
        } catch {
            setError(t('connectionError'))
            setShake(true)
            setTimeout(() => setShake(false), 600)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div
            className="min-h-screen flex items-center justify-center relative overflow-hidden"
            dir={isRTL() ? 'rtl' : 'ltr'}
            style={{
                background: isDarkMode
                    ? 'radial-gradient(ellipse at 60% 20%, oklch(0.25 0.05 250) 0%, oklch(0.13 0.02 260) 60%, oklch(0.10 0.01 240) 100%)'
                    : 'radial-gradient(ellipse at 60% 20%, oklch(0.96 0.04 240) 0%, oklch(0.92 0.02 230) 60%, oklch(0.88 0.015 220) 100%)',
            }}
        >
            {/* Decorative blurred orbs */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div
                    className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-20 blur-3xl"
                    style={{ background: 'oklch(0.70 0.20 250)' }}
                />
                <div
                    className="absolute -bottom-32 -right-16 w-80 h-80 rounded-full opacity-15 blur-3xl"
                    style={{ background: 'oklch(0.65 0.18 310)' }}
                />
            </div>

            {/* Top controls */}
            <div className={`absolute top-4 ${isRTL() ? 'right-4' : 'left-4'} flex items-center gap-2 z-10`}>
                <button
                    onClick={toggleTheme}
                    className="p-2.5 rounded-full bg-background/60 backdrop-blur border border-border/40 hover:bg-background/80 hover:scale-110 active:scale-95 transition-all shadow-sm text-muted-foreground hover:text-foreground"
                    title={isDarkMode ? t('lightMode') : t('darkMode')}
                >
                    {isDarkMode ? <Sun className="w-4 h-4 text-orange-400" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                    onClick={switchLocale}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-background/60 backdrop-blur border border-border/40 hover:bg-background/80 hover:scale-105 active:scale-95 transition-all shadow-sm text-sm font-medium text-muted-foreground hover:text-foreground"
                    title={t('language')}
                >
                    <Globe className="w-3.5 h-3.5" />
                    {locale === 'en' ? 'AR' : 'EN'}
                </button>
            </div>

            {/* Card */}
            <div className={`relative z-10 w-full max-w-sm mx-4 transition-all duration-300 ${shake ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
                <div
                    className="bg-card/80 backdrop-blur-xl border border-border/60 rounded-2xl shadow-2xl p-8"
                    style={{ boxShadow: isDarkMode ? '0 25px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05)' : '0 25px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(255,255,255,0.8)' }}
                >
                    {/* Logo & Title */}
                    <div className="flex flex-col items-center gap-3 mb-7">
                        <a
                            href="https://streamer.qaff.net"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex flex-col items-center gap-3 hover:opacity-85 hover:scale-105 transition-all duration-200 group"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/logo-icon.png?v=2"
                                alt="Qaff Streamer"
                                width={72}
                                height={72}
                                className="object-contain dark:hidden drop-shadow-md group-hover:drop-shadow-lg transition-all"
                            />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src="/logo-white.png?v=2"
                                alt="Qaff Streamer"
                                width={72}
                                height={72}
                                className="object-contain hidden dark:block drop-shadow-md group-hover:drop-shadow-lg transition-all"
                            />
                            <h1 className="text-2xl font-bold text-primary tracking-tight">Qaff Streamer</h1>
                        </a>
                        <p className="text-sm text-muted-foreground text-center">{t('loginTitle')}</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleLogin} className="space-y-4">

                        {/* Password Field */}
                        <div className="relative group">
                            <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder={t('passwordPlaceholder')}
                                autoFocus
                                dir="ltr"
                                className="w-full h-12 px-4 rounded-xl border-2 border-border/60 bg-background/80 text-foreground text-center text-lg tracking-[0.3em] placeholder:tracking-normal placeholder:text-sm focus:outline-none focus:border-primary/70 focus:ring-4 focus:ring-primary/15 hover:border-border transition-all duration-200 shadow-sm"
                            />
                        </div>

                        {/* Error State */}
                        {error && (
                            <div className="flex items-center gap-2 px-3 py-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                                <p className="text-red-500 text-sm">{error}</p>
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading || !password}
                            className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-semibold text-base transition-all duration-200 hover:bg-primary/90 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/30 active:scale-[0.98] active:shadow-none disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    {t('loggingIn')}
                                </>
                            ) : t('loginButton')}
                        </button>
                    </form>
                </div>

                {/* Footer */}
                <div className="mt-6 flex flex-col items-center justify-center gap-3 w-full text-center">
                    <div className={`flex items-center justify-center gap-2 ${dir === 'rtl' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <span className="text-sm font-semibold text-foreground/60">{t('footerText')}</span>
                        <div className="flex items-center gap-2">
                            <a href="https://wa.me/201012656551" target="_blank" rel="noopener noreferrer"
                                className="flex items-center text-green-500 hover:text-green-400 hover:scale-110 transition-all"
                                title="Contact via WhatsApp">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                                </svg>
                            </a>
                            <a href="https://streamer.qaff.net" target="_blank" rel="noopener noreferrer"
                                className="flex items-center text-primary hover:text-primary/80 hover:scale-110 transition-all"
                                title="Visit Website">
                                <Globe className="w-5 h-5" />
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* Shake keyframe via style tag */}
            <style>{`
                @keyframes shake {
                    0%, 100% { transform: translateX(0); }
                    15% { transform: translateX(-8px); }
                    30% { transform: translateX(8px); }
                    45% { transform: translateX(-6px); }
                    60% { transform: translateX(6px); }
                    75% { transform: translateX(-4px); }
                    90% { transform: translateX(4px); }
                }
            `}</style>
        </div>
    )
}
