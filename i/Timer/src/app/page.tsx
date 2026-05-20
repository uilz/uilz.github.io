'use client'

import { useState, useEffect, useRef } from 'react'


// ==================== 常量定义 ====================
const DEFAULT_MINUTES = 25           // 默认倒计时分钟数
const TOTAL_MINUTES = 59             // 滑块可选最大分钟数
const ITEM_WIDTH = 25                // 每个刻度条的宽度（px）
const PADDING = 250                  // 滑块两侧留白，用于居中与边界处理

// ==================== 工具函数 ====================

/**
 * 根据分钟数计算滑块应滚动到的位置
 * @param minute - 目标分钟数 (1~59)
 * @param containerWidth - 滑块容器的宽度
 * @returns 滑块需要滚动到的 scrollLeft 值
 */
function getScrollForMinute(minute: number, containerWidth: number) {
  const activeIndex = minute - 1
  // 居中公式：起始偏移 + 所有之前条目的总宽 + 半个条目宽 - 容器一半
  return PADDING + activeIndex * ITEM_WIDTH + ITEM_WIDTH / 2 - containerWidth / 2
}

/**
 * 根据滑块当前滚动位置反推对应的分钟数
 * @param scrollLeft - 当前滚动距离
 * @param containerWidth - 容器宽度
 * @returns 对应的分钟数 (1~59)
 */
function getMinuteFromScroll(scrollLeft: number, containerWidth: number) {
  const x = scrollLeft + containerWidth / 2 - PADDING
  const totalWidth = TOTAL_MINUTES * ITEM_WIDTH
  const percentage = Math.max(0, Math.min(1, x / totalWidth))
  return Math.round(percentage * (TOTAL_MINUTES - 1)) + 1
}

// ==================== 主组件 ====================
function Timer() {
  // -------------------- 核心计时状态 --------------------
  const [totalMinutes, setTotalMinutes] = useState(DEFAULT_MINUTES)       // 当前设定的分钟总数
  const [totalSeconds, setTotalSeconds] = useState(DEFAULT_MINUTES * 60) // 对应的秒数（冗余但方便复位）
  const [remaining, setRemaining] = useState(DEFAULT_MINUTES * 60)       // 剩余秒数（计时核心）
  const [isRunning, setIsRunning] = useState(false)                      // 是否运行中

  // -------------------- UI 偏好状态 --------------------
  // 初始化主题
  const [isDark, setIsDark] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('timer-isDark')
      if (saved !== null) return saved === 'true'
      return window.matchMedia('(prefers-color-scheme: dark)').matches
    }
    return false
  })
  // 初始化铃音
  const [selectedRingtone, setSelectedRingtone] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('timer-selectedRingtone')
      return saved ? parseInt(saved, 10) : 0
    }
    return 0
  })
  // 初始化横屏屏模式
  const [isLandscape, setIsLandscape] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('timer-isLandscape')
      return saved === 'true'
    }
    return false
  })
  const [clockScale, setClockScale] = useState(1)       // 时钟字体缩放倍数
  const [showSettings, setShowSettings] = useState(false) // 设置面板显隐
  const [isHovering, setIsHovering] = useState(false)    // 鼠标是否悬停（控制按钮可见性）
  const [windowWidth, setWindowWidth] = useState<number | null>(null) // 窗口宽度（用于动态字号）
  const [isFullscreen, setIsFullscreen] = useState(false) // 是否全屏

  // -------------------- 非渲染关键引用 (ref) --------------------
  const sliderRef = useRef<HTMLDivElement>(null)  // 滑块 DOM 引用
  const isDraggingRef = useRef(false)             // 是否正在拖拽（避免闭包陷阱）
  const dragStartX = useRef(0)                    // 拖拽起始鼠标 X 坐标
  const dragStartY = useRef(0)                    // 拖拽起始鼠标 Y 坐标
  const isLandscapeRef = useRef(false)            // 实时同步横竖屏状态
  const dragStartScroll = useRef(0)               // 拖拽起始滑块滚动位置
  const hasDragged = useRef(false)                // 是否发生过实际拖拽（用于区分点击）

  // 性能优化：使用 ref 存储 rAF ID，避免跨渲染丢失
  const rafIdRef = useRef<number | null>(null)

  // 性能优化：复用 AudioContext，避免每次播放重新创建
  const audioCtxRef = useRef<AudioContext | null>(null)

  // ==================== 功能函数 ====================

  /**
   * 播放提示音（复用 audioCtxRef 实例）
   * @param type - 1: 高频正弦波, 2: 三角波, 其他: 方波
   */
  const playRingtone = (type: number) => {
    // 如果还没有 AudioContext 实例则创建一个
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    const ctx = audioCtxRef.current
    const oscillator = ctx.createOscillator()
    const gainNode = ctx.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(ctx.destination)

    // 根据类型设置不同的频率与波形
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

    // 0.5 秒内从 0.3 衰减到 0.01
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)

    oscillator.start(ctx.currentTime)
    oscillator.stop(ctx.currentTime + 0.5)
  }

  /**
   * 更新分钟设定，同时重置总秒数和剩余秒数
   */
  const updateMinute = (minute: number) => {
    setTotalMinutes(minute)
    setTotalSeconds(minute * 60)
    setRemaining(minute * 60)
  }

  /**
   * 滚动滑块到指定分钟刻度
   * @param behavior - 'auto' 立即跳转，'smooth' 自定义缓动动画
   */
  const scrollToMinute = (minute: number, behavior: ScrollBehavior = 'smooth') => {
    if (!sliderRef.current) return
    const containerWidth = sliderRef.current.offsetWidth
    const maxScroll = PADDING + TOTAL_MINUTES * ITEM_WIDTH + PADDING - containerWidth
    const target = getScrollForMinute(minute, containerWidth)

    if (behavior === 'auto') {
      // 直接跳转
      sliderRef.current.scrollTo({
        left: Math.max(0, Math.min(target, maxScroll)),
        behavior: 'auto'
      })
      return
    }

    // 自定义 easeOut 动画，使滑动更自然
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
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }

  // ==================== 副作用处理 ====================

  /**
   * 合并 resize 监听，并用 rAF 节流，避免高频触发导致的性能问题
   */
  useEffect(() => {
    let frameId: number | null = null
    const handleResize = () => {
      if (frameId) cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        setWindowWidth(window.innerWidth)
        frameId = null
      })
    }
    // 初始化执行一次
    handleResize()
    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [])

  // 监听系统主题变化（用户可能在系统设置中切换暗色模式）
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent) => setIsDark(e.matches)
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  // 持久化主题设置,铃音选择,横竖屏设置到 localStorage
  useEffect(() => {
    localStorage.setItem('timer-isDark', String(isDark))
    localStorage.setItem('timer-selectedRingtone', String(selectedRingtone))
    localStorage.setItem('timer-isLandscape', String(isLandscape))
  }, [isDark, isLandscape, selectedRingtone])
  /**
   * 监听浏览器全屏状态变化，保证 isFullscreen 始终与 document.fullscreenElement 同步
   */
  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // 初始化时滚动到默认分钟数（仅执行一次）
  useEffect(() => {
    scrollToMinute(DEFAULT_MINUTES, 'auto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * 计时器核心逻辑：剩余时间 > 0 且运行中，则每秒递减 1
   * 注意：当 remaining 变为 0 时，由另一个 useEffect 处理结束动作
   */
  useEffect(() => {
    if (!isRunning || remaining <= 0) return
    const interval = setInterval(() => {
      setRemaining((prev) => prev - 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [isRunning, remaining])

  // 计时结束：停止运行并播放铃音
  useEffect(() => {
    if (remaining === 0 && isRunning) {
      setIsRunning(false)
      playRingtone(selectedRingtone + 1)
    }
  }, [remaining, isRunning, selectedRingtone])

  /**
   * 倒计时过程中同步滑块位置：
   * 根据剩余秒数计算当前分钟，若与 state 中不一致则更新，并滚动滑块
   */
  useEffect(() => {
    if (!isRunning) return
    const currentMinute = Math.ceil(remaining / 60)
    if (currentMinute < 1) return
    if (currentMinute !== totalMinutes) {
      setTotalMinutes(currentMinute)
      setTotalSeconds(currentMinute * 60)
    }
    scrollToMinute(currentMinute, 'smooth')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, isRunning])

  // 实时同步横竖屏状态
  useEffect(() => { isLandscapeRef.current = isLandscape }, [isLandscape])

  /**
   * 拖拽与触摸滑动处理（性能优化版）
   * - 使用 ref 追踪拖拽状态，避免触发无关渲染
   * - 使用 requestAnimationFrame 节流位置更新，每帧最多更新一次分钟数
   */
  useEffect(() => {
    // 处理移动（鼠标或触摸）
    const onMove = (clientX: number, clientY: number) => {
      if (!isDraggingRef.current || !sliderRef.current) return
      const useVertical = isLandscapeRef.current
      const delta = useVertical
        ? clientY - dragStartY.current
        : clientX - dragStartX.current
      if (Math.abs(delta) > 10) hasDragged.current = true

      const containerWidth = sliderRef.current.offsetWidth
      const maxScroll = PADDING + TOTAL_MINUTES * ITEM_WIDTH + PADDING - containerWidth
      const newScrollLeft = dragStartScroll.current - delta
      sliderRef.current.scrollLeft = Math.max(0, Math.min(newScrollLeft, maxScroll))

      // 节流：同一帧内多次移动只触发一次 setState
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

    // 结束拖拽：吸附到最近刻度
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 点击设置面板外部自动关闭
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

  // 格式化剩余秒数为 mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 开始 / 暂停
  const handleStartPause = () => {
    // 如果计时结束且未运行，先复位到总时间
    if (!isRunning && remaining === 0) setRemaining(totalSeconds)
    setIsRunning((prev) => !prev)
  }

  // 滑块鼠标按下（开始拖拽）
  const handleSliderMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    hasDragged.current = false
    dragStartX.current = e.clientX
    dragStartY.current = e.clientY
    dragStartScroll.current = sliderRef.current?.scrollLeft || 0
  }

  // 滑块触摸开始
  const handleSliderTouchStart = (e: React.TouchEvent) => {
    isDraggingRef.current = true
    hasDragged.current = false
    dragStartX.current = e.touches[0].clientX
    dragStartY.current = e.touches[0].clientY
    dragStartScroll.current = sliderRef.current?.scrollLeft || 0
  }

  // 滑块滚轮调节（运行时禁用）
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

  // 滑块点击选择（与拖拽区分）
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
      className={`min-h-screen relative overflow-hidden transition-colors duration-500 ${isDark ? 'bg-black' : 'bg-[#F5F5F5]'
        }`}
      // 控制按钮栏的显隐：鼠标进入或触摸时显示
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onTouchStart={() => setIsHovering(true)}
      onTouchEnd={() => setIsHovering(false)}
    >
      {/* 标题 */}
      <div className="absolute top-4 left-4 text-xs font-medium tracking-[0.2em]" style={{ color: textColor }}>
        极简番茄
      </div>

      {/* 右上角功能按钮组（悬浮时可见） */}
      <div
        className={`absolute top-4 right-4 transition-opacity duration-300 ${isHovering ? 'opacity-100' : 'opacity-0'
          }`}
      >
        {/* 切换暗色模式 */}
        <button
          onClick={() => setIsDark(!isDark)}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          style={{ color: textColor }}
        >
          {isDark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>
        {/* 切换横屏模式 */}
        <button
          onClick={() => setIsLandscape(!isLandscape)}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          style={{ color: textColor }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <line x1="12" y1="6" x2="12" y2="18" />
          </svg>
        </button>
        {/* 切换全屏 */}
        <button
          onClick={async () => {
            if (!document.fullscreenElement) {
              await document.documentElement.requestFullscreen()
            } else {
              await document.exitFullscreen()
            }
          }}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
            }`}
          style={{ color: textColor }}
        >
          {isFullscreen ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
        </button>
      </div>

      {/* 主内容区，支持横屏旋转 */}
      <div
        className="w-screen h-screen flex items-center justify-center"
        style={{
          transform: isLandscape ? 'rotate(90deg)' : 'none',
          transformOrigin: 'center center',
          transition: 'transform 0.3s ease'
        }}
      >
        <div className="flex flex-col items-center justify-center px-4 pb-20">
          {/* 大时钟文字 */}
          <div
            className={`font-bold tracking-widest cursor-pointer transition-all duration-300 select-none ${isDark ? 'text-white' : 'text-gray-900'
              }`}
            style={{ fontSize: `${Math.min(180, Math.max(60, (windowWidth || 400) * 0.6)) * clockScale}px`, lineHeight: '1' }}
            onClick={handleStartPause}
          >
            {formatTime(remaining)}
          </div>

          {/* 时间选择滑块 */}
          <div className="relative w-full max-w-md mt-6">
            {/* 顶部分割线 */}
            <div className="absolute top-0 left-0 right-0 h-px" style={{ backgroundColor: dividerColor }}></div>

            <div
              ref={sliderRef}
              className="overflow-x-auto scrollbar-hide pt-6 pb-12 select-none"
              // 隐藏原生滚动条
              onMouseDown={handleSliderMouseDown}
              onClick={handleSliderClick}
              onTouchStart={handleSliderTouchStart}
              onWheel={handleSliderWheel}
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            // 拖拽/点击/滚轮事件
            >
              {/* 刻度条组 */}
              <div
                className="flex items-end"
                style={{
                  width: `${PADDING + TOTAL_MINUTES * ITEM_WIDTH + PADDING}px`,
                  paddingLeft: `${PADDING}px`,
                  paddingRight: `${PADDING}px`
                }}
              >
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

            {/* 滑块下方的三角形指示器 */}
            <div className="absolute left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-b-[12px] border-l-transparent border-r-transparent border-b-black z-10 pointer-events-none"
              style={{ top: '68px' }} />
          </div>

          {/* 开始按钮（悬浮且未运行时可见） */}
          <div className={`flex items-center gap-1 mt-6 w-full justify-center transition-opacity duration-300 ${isHovering && !isRunning ? 'opacity-100' : 'opacity-0'
            }`}>
            <button onClick={handleStartPause} className="..."> 开始 </button>
          </div>
        </div>
      </div>

      {/* 底部控制栏（悬浮时可见） */}
      <div
        className={`absolute bottom-0 left-0 right-0 flex justify-between items-end px-4 pb-4 transition-opacity duration-300 ${isHovering ? 'opacity-100' : 'opacity-0'
          }`}
      >
        {/* 左：字号缩放 */}
        <div className="flex gap-1.5">
          <button
            onClick={() => setClockScale(Math.max(0.5, clockScale - 0.25))}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            style={{ color: textColor }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>
          <button
            onClick={() => setClockScale(Math.min(3, clockScale + 0.25))}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            style={{ color: textColor }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="11" y1="8" x2="11" y2="14" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </button>        </div>
        {/* 右：暂停、重置、设置 */}

        <div className="flex gap-1.5">
          {isRunning && (
            <button
              onClick={() => setIsRunning(false)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                }`}
              style={{ color: textColor }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
          )}
          <button
            onClick={() => {
              setIsRunning(false)
              updateMinute(DEFAULT_MINUTES)
              scrollToMinute(DEFAULT_MINUTES)
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            style={{ color: textColor }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowSettings(!showSettings)
            }}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            style={{ color: textColor }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
      </div>

      {/* 设置弹出面板 */}
      {showSettings && (
        <div className="settings-panel absolute bottom-16 right-4 bg-white rounded-xl shadow-lg p-3 w-56 border border-gray-100 z-10">
          <div className="mb-3">
            <label>时钟铃声</label>
            <div className="flex gap-1.5">
              {['铃声1', '铃声2', '静音'].map((ring, i) => (
                <button
                  key={ring}
                  onClick={() => {
                    setSelectedRingtone(i)
                    if (i !== 2) playRingtone(i + 1) // 试听
                  }}
                  className={`px-2.5 py-1 text-xs rounded-full transition-colors ${selectedRingtone === i
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                >
                  {ring}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600 mb-1.5 block">快速开始</label>
            <div className="flex gap-1.5">
              <button
                onClick={() => {
                  updateMinute(5)
                  scrollToMinute(5)
                  setIsRunning(true)
                  setShowSettings(false)
                }}
                className="flex-1 px-2.5 py-1 text-xs bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
              >
                5分钟
              </button>
              <button
                onClick={() => {
                  updateMinute(25)
                  scrollToMinute(25)
                  setIsRunning(true)
                  setShowSettings(false)
                }}
                className="flex-1 px-2.5 py-1 text-xs bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
              >
                25分钟
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



// 新增一个客户端包装组件，只在客户端挂载后才渲染 Timer
function ClientTimer() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) {
    // 服务端渲染时输出这个占位符（会被水合替换）
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontFamily: 'system-ui, sans-serif',
        color: '#888',
      }}>
        加载中…
      </div>
    )
  }

  // 客户端挂载后，渲染真正的 Timer 组件
  // Timer 内的 localStorage 惰性初始化会在这里正常执行
  return <Timer />
}

export default ClientTimer

