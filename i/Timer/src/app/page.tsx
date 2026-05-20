'use client'

import { useState, useEffect, useRef } from 'react'

// ==================== 常量定义 ====================
const DEFAULT_MINUTES = 25
const TOTAL_MINUTES = 59
const ITEM_WIDTH = 25
const PADDING = 250

// ==================== 工具函数 ====================
function getScrollForMinute(minute: number, containerWidth: number) {
  const activeIndex = minute - 1
  return PADDING + activeIndex * ITEM_WIDTH + ITEM_WIDTH / 2 - containerWidth / 2
}

function getMinuteFromScroll(scrollLeft: number, containerWidth: number) {
  const x = scrollLeft + containerWidth / 2 - PADDING
  const totalWidth = TOTAL_MINUTES * ITEM_WIDTH
  const percentage = Math.max(0, Math.min(1, x / totalWidth))
  return Math.round(percentage * (TOTAL_MINUTES - 1)) + 1
}

// ==================== 主组件 ====================
function Timer() {
  // -------------------- 核心计时状态 --------------------
  const [totalMinutes, setTotalMinutes] = useState(DEFAULT_MINUTES)
  const [totalSeconds, setTotalSeconds] = useState(DEFAULT_MINUTES * 60)
  const [remaining, setRemaining] = useState(DEFAULT_MINUTES * 60)
  const [isRunning, setIsRunning] = useState(false)

  // -------------------- UI 偏好状态 --------------------
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('timer-isDark')
      if (saved !== null) return saved === 'true'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })
  const [selectedRingtone, setSelectedRingtone] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('timer-selectedRingtone')
      return saved ? parseInt(saved, 10) : 0
    }
    return 0
  })
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('timer-isLandscape')
      return saved === 'true'
    }
    return false
  })
  const [clockScale, setClockScale] = useState(1)
  const [showSettings, setShowSettings] = useState(false)
  const [isHovering, setIsHovering] = useState(false)
  const [windowWidth, setWindowWidth] = useState<number | null>(null)
  const [windowHeight, setWindowHeight] = useState<number | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // -------------------- 非渲染关键引用 (ref) --------------------
  const sliderRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartX = useRef(0)
  const dragStartY = useRef(0)
  const isLandscapeRef = useRef(false)
  const dragStartScroll = useRef(0)
  const hasDragged = useRef(false)
  const rafIdRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)

  // ==================== 功能函数 ====================
  const playRingtone = (type: number) => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    const ctx = audioCtxRef.current
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()
    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)
    if (type === 1) {
      oscillator.frequency.value = 800
      oscillator.type = 'sine'
    } else if (type === 2) {
      oscillator.frequency.value = 600
      oscillator.type = 'triangle'
    } else {
      oscillator.frequency.value = 1000
      oscillator.type = 'square'
    }
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.5)
  }

  const updateMinute = (minute: number) => {
    setTotalMinutes(minute)
    setTotalSeconds(minute * 60)
    setRemaining(minute * 60)
  }

  const scrollToMinute = (minute: number, behavior: ScrollBehavior = 'smooth') => {
    if (!sliderRef.current) return
    const containerWidth = sliderRef.current.offsetWidth
    const maxScroll = PADDING + TOTAL_MINUTES * ITEM_WIDTH + PADDING - containerWidth
    const target = getScrollForMinute(minute, containerWidth)
    if (behavior === 'auto') {
      sliderRef.current.scrollTo({ left: Math.max(0, Math.min(target, maxScroll)), behavior: 'auto' })
      return
    }
    const start = sliderRef.current.scrollLeft
    const distance = target - start
    const duration = 300
    let startTime: number | null = null
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      const easeOut = 1 - Math.pow(1 - progress, 3)
      sliderRef.current!.scrollLeft = start + distance * easeOut
      if (progress < 1) requestAnimationFrame(animate)
    }
    requestAnimationFrame(animate)
  }

  // ==================== hover 统一管理函数 ====================
  const showControls = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setIsHovering(true)
  }

  const hideControlsAfterDelay = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => {
      setIsHovering(false)
      hoverTimerRef.current = null
    }, 3000)
  }

  // ==================== 副作用处理 ====================
  useEffect(() => {
    let frameId: number | null = null
    const handleResize = () => {
      if (frameId) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        setWindowWidth(window.innerWidth)
        setWindowHeight(window.innerHeight)
        frameId = null
      })
    }
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    localStorage.setItem('timer-isDark', String(isDark))
    localStorage.setItem('timer-selectedRingtone', String(selectedRingtone))
    localStorage.setItem('timer-isLandscape', String(isLandscape))
  }, [isDark, isLandscape, selectedRingtone])

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(() => {
    scrollToMinute(DEFAULT_MINUTES, 'auto')
  }, [])

  useEffect(() => {
    if (!isRunning || remaining <= 0) return
    const interval = setInterval(() => setRemaining((prev) => prev - 1), 1000)
    return () => clearInterval(interval)
  }, [isRunning, remaining])

  useEffect(() => {
    if (remaining === 0 && isRunning) {
      setIsRunning(false)
      playRingtone(selectedRingtone + 1)
    }
  }, [remaining, isRunning, selectedRingtone])

  useEffect(() => {
    if (!isRunning) return
    const currentMinute = Math.ceil(remaining / 60)
    if (currentMinute < 1) return
    if (currentMinute !== totalMinutes) {
      setTotalMinutes(currentMinute)
      setTotalSeconds(currentMinute * 60)
    }
    scrollToMinute(currentMinute, 'smooth')
  }, [remaining, isRunning])

  useEffect(() => { isLandscapeRef.current = isLandscape }, [isLandscape])

  useEffect(() => {
    const onMove = (clientX: number, clientY: number) => {
      if (!isDraggingRef.current || !sliderRef.current) return
      const useVertical = isLandscapeRef.current
      const delta = useVertical ? clientY - dragStartY.current : clientX - dragStartX.current
      if (Math.abs(delta) > 10) hasDragged.current = true
      const containerWidth = sliderRef.current.offsetWidth
      const maxScroll = PADDING + TOTAL_MINUTES * ITEM_WIDTH + PADDING - containerWidth
      const newScrollLeft = dragStartScroll.current - delta
      sliderRef.current.scrollLeft = Math.max(0, Math.min(newScrollLeft, maxScroll))
      if (!rafIdRef.current) {
        rafIdRef.current = requestAnimationFrame(() => {
          if (sliderRef.current) {
            const minute = getMinuteFromScroll(sliderRef.current.scrollLeft, containerWidth)
            updateMinute(minute)
          }
          rafIdRef.current = null
        })
      }
    }
    const onEnd = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      if (sliderRef.current) {
        const containerWidth = sliderRef.current.offsetWidth
        const minute = getMinuteFromScroll(sliderRef.current.scrollLeft, containerWidth)
        updateMinute(minute)
        scrollToMinute(minute, 'auto')
      }
    }
    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY)
    const handleTouchMove = (e: TouchEvent) => onMove(e.touches[0].clientX, e.touches[0].clientY)
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', onEnd)
    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('touchend', onEnd)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', onEnd)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', onEnd)
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
    }
  }, [])

  useEffect(() => {
    if (!showSettings) return
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.settings-panel')) {
        setShowSettings(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showSettings])

  // ==================== 事件处理 ====================
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleStartPause = () => {
    if (!isRunning && remaining === 0) setRemaining(totalSeconds)
    setIsRunning((prev) => !prev)
  }

  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    hasDragged.current = false
    dragStartX.current = e.clientX
    dragStartY.current = e.clientY
    dragStartScroll.current = sliderRef.current?.scrollLeft || 0
  }

  const handleSliderTouchStart = (e: React.TouchEvent) => {
    isDraggingRef.current = true
    hasDragged.current = false
    dragStartX.current = e.touches[0].clientX
    dragStartY.current = e.touches[0].clientY
    dragStartScroll.current = sliderRef.current?.scrollLeft || 0
  }

  const handleSliderWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    if (isRunning) return
    const delta = e.deltaY < 0 ? 1 : -1
    const newMinute = Math.max(1, Math.min(TOTAL_MINUTES, totalMinutes + delta))
    if (newMinute !== totalMinutes) {
      updateMinute(newMinute)
      scrollToMinute(newMinute, 'smooth')
    }
  }

  const handleSliderClick = (e: React.MouseEvent) => {
    if (!sliderRef.current || hasDragged.current) {
      hasDragged.current = false
      return
    }
    const rect = sliderRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left + sliderRef.current.scrollLeft - PADDING
    const totalWidth = TOTAL_MINUTES * ITEM_WIDTH
    const percentage = Math.max(0, Math.min(1, x / totalWidth))
    const minutes = Math.round(percentage * (TOTAL_MINUTES - 1)) + 1
    updateMinute(minutes)
    scrollToMinute(minutes)
  }

  // ==================== 渲染相关变量 ====================
  const lineColor = isDark ? '#666666' : '#d1d5db'
  const dividerColor = isDark ? '#444444' : '#e5e5e5'
  const textColor = isDark ? '#cccccc' : '#333333'
  const activeLineColor = '#3b82f6'

  // ==================== 界面渲染 ====================
  return (
    <div
      className={`min-h-screen relative overflow-hidden transition-colors duration-500 ${isDark ? 'bg-black' : 'bg-[#F5F5F5]'}`}
      onMouseEnter={showControls}
      onMouseLeave={hideControlsAfterDelay}
      onTouchStart={showControls}
      onTouchMove={showControls}
      onTouchEnd={hideControlsAfterDelay}
    >
      {/* 标题 */}
      <div className="absolute top-4 left-4 text-xs font-medium tracking-[0.2em]" style={{ color: textColor }}>
        极简番茄
      </div>

      {/* 右上角功能按钮组 */}
      <div className={`absolute top-4 right-4 transition-opacity duration-300 ${isHovering ? 'opacity-100' : 'opacity-0'}`}>
        {/* 切换暗色模式 */}
        <button onClick={() => setIsDark(!isDark)} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'}`} style={{ color: textColor }}>
          {isDark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>
        {/* 切换横屏模式 */}
        <button onClick={() => setIsLandscape(!isLandscape)} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'}`} style={{ color: textColor }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="6" width="18" height="12" rx="2"/><line x1="12" y1="6" x2="12" y2="18"/>
          </svg>
        </button>
        {/* 切换全屏 */}
        <button onClick={async () => { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen() }} className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'}`} style={{ color: textColor }}>
          {isFullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          )}
        </button>
      </div>

      {/* 主内容区 */}
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{ transform: isLandscape ? 'rotate(90deg)' : 'none', transformOrigin: 'center center', transition: 'transform 0.3s ease' }}
      >
        <div className="flex flex-col items-center justify-center px-4">
          {/* 大时钟文字 */}
          <div
            className={`font-bold tracking-widest cursor-pointer transition-all duration-300 select-none ${isDark ? 'text-white' : 'text-gray-900'}`}
            style={{ fontSize: `${Math.min(180, Math.max(48, (windowWidth || 400) * 0.5, (windowHeight || 800) * 0.35)) * clockScale}px`, lineHeight: '1' }}
            onClick={handleStartPause}
          >
            {formatTime(remaining)}
          </div>

          {/* 时间选择滑块 */}
          <div className="relative w-full max-w-md mt-6">
            <div className="absolute top-0 left-0 right-0 h-px" style={{ backgroundColor: dividerColor }}></div>
            <div
              ref={sliderRef}
              className="overflow-x-auto scrollbar-hide pt-6 pb-12 select-none"
              onMouseDown={handleSliderMouseDown}
              onClick={handleSliderClick}
              onTouchStart={handleSliderTouchStart}
              onWheel={handleSliderWheel}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <div className="flex items-end" style={{ width: `${PADDING + TOTAL_MINUTES * ITEM_WIDTH + PADDING}px`, paddingLeft: `${PADDING}px`, paddingRight: `${PADDING}px` }}>
                {Array.from({ length: TOTAL_MINUTES }, (_, i) => {
                  const minute = i + 1
                  const isActive = minute === totalMinutes
                  const isLang = minute % 5 === 0
                  return (
                    <div key={i} className="flex-shrink-0 flex items-end justify-center" style={{ width: ITEM_WIDTH }}>
                      <div
                        className="w-1 rounded-full transition-all duration-150"
                        style={{
                          height: isActive ? '36px' : isLang ? '28px' : '20px',
                          backgroundColor: isActive ? activeLineColor : lineColor,
                          opacity: isActive ? 1 : isLang ? 0.85 : 0.5
                        }}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-b-[12px] border-l-transparent border-r-transparent border-b-black z-10 pointer-events-none" style={{ top: '68px' }} />
          </div>

          {/* 开始按钮 */}
          <div className={`flex items-center gap-1 mt-6 w-full justify-center transition-opacity duration-300 ${isHovering && !isRunning ? 'opacity-100' : 'opacity-0'}`}>
            <button onClick={handleStartPause} className="px-5 py-2 bg-blue-500 text-white text-sm rounded-full flex items-center gap-2 hover:bg-blue-600 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              开始
            </button>
          </div>
        </div>
      </div>

      {/* 底部控制栏 */}
      <div className={`absolute bottom-0 left-0 right-0 flex justify-between items-end px-4 pb-4 transition-opacity duration-300 ${isHovering ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex gap-1.5">
          <button onClick={() => setClockScale(Math.max(0.5, clockScale - 0.25))} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`} style={{ color: textColor }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
          <button onClick={() => setClockScale(Math.min(3, clockScale + 0.25))} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`} style={{ color: textColor }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
          </button>
        </div>
        <div className="flex gap-1.5">
          {isRunning && (
            <button onClick={() => setIsRunning(false)} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`} style={{ color: textColor }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
            </button>
          )}
          <button onClick={() => { setIsRunning(false); updateMinute(DEFAULT_MINUTES); scrollToMinute(DEFAULT_MINUTES) }} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`} style={{ color: textColor }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          </button>
          <button onClick={(e) => { e.stopPropagation(); setShowSettings(!showSettings) }} className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'}`} style={{ color: textColor }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <div className="settings-panel absolute bottom-16 right-4 bg-white rounded-xl shadow-lg p-3 w-56 border border-gray-100 z-10">
          <div className="mb-3">
            <label className="text-xs text-gray-600 mb-1.5 block">时钟铃声</label>
            <div className="flex gap-1.5">
              {['铃声1', '铃声2', '静音'].map((ring, i) => (
                <button key={ring} onClick={() => { setSelectedRingtone(i); if (i !== 2) playRingtone(i + 1) }} className={`px-2.5 py-1 text-xs rounded-full transition-colors ${selectedRingtone === i ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{ring}</button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1.5 block">快速开始</label>
            <div className="flex gap-1.5">
              <button onClick={() => { updateMinute(5); scrollToMinute(5); setIsRunning(true); setShowSettings(false) }} className="flex-1 px-2.5 py-1 text-xs bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors">5分钟</button>
              <button onClick={() => { updateMinute(25); scrollToMinute(25); setIsRunning(true); setShowSettings(false) }} className="flex-1 px-2.5 py-1 text-xs bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors">25分钟</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 客户端包装组件
function ClientTimer() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return <div style={{ display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', fontFamily:'system-ui, sans-serif', color:'#888' }}>加载中…</div>
  return <Timer />
}

export default ClientTimer