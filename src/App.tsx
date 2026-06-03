import { useState, useEffect } from 'react'

type LightState = 'red' | 'yellow' | 'green'
type Theme = 'dark' | 'light'
type Style = 'triple' | 'single'

declare global {
  interface Window {
    electronAPI: {
      getInitialState: () => Promise<{ state: LightState; theme: Theme; style: Style }>
      onStateChange: (cb: (state: LightState) => void) => void
      onThemeChange: (cb: (theme: Theme) => void) => void
      onStyleChange: (cb: (style: Style) => void) => void
      setState: (state: LightState) => void
    }
  }
}

const LIGHT_COLORS = {
  red: { active: '#ef4444', glow: 'rgba(239, 68, 68, 0.6)', label: '工作中' },
  yellow: { active: '#eab308', glow: 'rgba(234, 179, 8, 0.6)', label: '等待确认' },
  green: { active: '#22c55e', glow: 'rgba(34, 197, 94, 0.6)', label: '空闲' },
}

function TrafficLight({ state, style, theme }: { state: LightState; style: Style; theme: Theme }) {
  const bgColor = theme === 'dark' ? 'bg-gray-900/90' : 'bg-white/90'
  const borderColor = theme === 'dark' ? 'border-gray-700' : 'border-gray-300'

  if (style === 'single') {
    const color = LIGHT_COLORS[state]
    return (
      <div className={`flex flex-col items-center justify-center h-full ounded-3xl border ${borderColor} backdrop-blur-sm p-6`}>
        <div
          className="w-24 h-24 rounded-full transition-all duration-500"
          style={{
            backgroundColor: color.active,
            boxShadow: `0 0 30px ${color.glow}, 0 0 60px ${color.glow}`,
          }}
        />
        <p className={`mt-4 text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
          {color.label}
        </p>
        <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
          OpenClaw
        </p>
      </div>
    )
  }

  // Triple light style
  const lights: LightState[] = ['red', 'yellow', 'green']

  return (
    <div className={`flex flex-col items-center justify-center h-full ${bgColor} rounded-3xl border ${borderColor} backdrop-blur-sm p-4`}>
      <div className={`flex flex-col gap-4 p-4 rounded-2xl ${theme === 'dark' ? 'bg-gray-800/80' : 'bg-gray-100/80'}`}>
        {lights.map((light) => {
          const isActive = light === state
          const color = LIGHT_COLORS[light]
          return (
            <div
              key={light}
              className="w-16 h-16 rounded-full transition-all duration-500 border-2"
              style={{
                backgroundColor: isActive ? color.active : (theme === 'dark' ? '#374151' : '#d1d5db'),
                boxShadow: isActive ? `0 0 20px ${color.glow}, 0 0 40px ${color.glow}` : 'none',
                borderColor: isActive ? color.active : (theme === 'dark' ? '#4b5563' : '#9ca3af'),
                opacity: isActive ? 1 : 0.3,
              }}
            />
          )
        })}
      </div>
      <p className={`mt-3 text-sm font-medium ${theme === 'dark' ? 'text-gray-300' : 'text-gray-600'}`}>
        {LIGHT_COLORS[state].label}
      </p>
      <p className={`mt-1 text-xs ${theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
        OpenClaw
      </p>
    </div>
  )
}

export default function App() {
  const [state, setState] = useState<LightState>('green')
  const [theme, setTheme] = useState<Theme>('dark')
  const [style, setStyle] = useState<Style>('triple')

  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.getInitialState().then(({ state: s, theme: t, style: st }) => {
        setState(s)
        setTheme(t)
        setStyle(st)
      })
      window.electronAPI.onStateChange((s) => {
        setState(s)
      })
      window.electronAPI.onThemeChange(setTheme)
      window.electronAPI.onStyleChange(setStyle)
    } else {
      // 开发模式：模拟状态切换
      let i = 0
      const states: LightState[] = ['green', 'red', 'yellow', 'green']
      const timer = setInterval(() => {
        i = (i + 1) % states.length
        setState(states[i])
      }, 3000)
      return () => clearInterval(timer)
    }
  }, [])

  return (
    <div className="w-full h-full">
      <TrafficLight state={state} style={style} theme={theme} />
    </div>
  )
}
