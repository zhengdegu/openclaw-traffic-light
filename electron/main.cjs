const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { exec } = require('child_process')

// 路径配置
const HOME = os.homedir()
const OPENCLAW_DIR = path.join(HOME, '.openclaw')
const STATE_FILE = path.join(OPENCLAW_DIR, 'traffic_light_state')
const THEME_FILE = path.join(OPENCLAW_DIR, 'traffic_light_theme')
const STYLE_FILE = path.join(OPENCLAW_DIR, 'traffic_light_style')
const STATS_FILE = path.join(OPENCLAW_DIR, 'traffic_light_stats.json')

const distPath = path.join(__dirname, '../dist/index.html')
const isDev = !fs.existsSync(distPath)

try { fs.mkdirSync(OPENCLAW_DIR, { recursive: true }) } catch {}

// === 状态检测 ===
let lastState = 'green'
let redStartTime = null

function detectOpenClawState() {
  return new Promise((resolve) => {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const state = fs.readFileSync(STATE_FILE, 'utf-8').trim()
        if (['red', 'yellow', 'green'].includes(state)) {
          resolve(state)
          return
        }
      }
    } catch {}

    exec('pgrep -f "openclaw" | head -1', (err, stdout) => {
      if (err || !stdout.trim()) {
        resolve('green')
        return
      }

      const logDir = path.join(OPENCLAW_DIR, 'logs')
      try {
        if (fs.existsSync(logDir)) {
          const files = fs.readdirSync(logDir)
            .filter(f => f.endsWith('.log'))
            .map(f => ({ name: f, mtime: fs.statSync(path.join(logDir, f)).mtimeMs }))
            .sort((a, b) => b.mtime - a.mtime)

          if (files.length > 0) {
            const stat = fs.statSync(path.join(logDir, files[0].name))
            if (Date.now() - stat.mtimeMs < 3000) {
              resolve('red')
              return
            }
          }
        }
      } catch {}

      resolve('green')
    })
  })
}

// === 统计 ===
function getToday() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function readStats() {
  try {
    return fs.existsSync(STATS_FILE) ? JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8')) : {}
  } catch { return {} }
}

function saveStats(stats) {
  try { fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2)) } catch {}
}

function recordStateChange(newState, prevState) {
  const today = getToday()
  const stats = readStats()
  if (!stats[today]) stats[today] = { redCount: 0, greenCount: 0, yellowCount: 0, redDuration: 0 }

  if (newState === 'red') {
    stats[today].redCount++
    redStartTime = Date.now()
  } else if (newState === 'yellow') {
    stats[today].yellowCount++
  } else if (newState === 'green') {
    stats[today].greenCount++
    if (prevState === 'red' && redStartTime) {
      stats[today].redDuration += Date.now() - redStartTime
      redStartTime = null
    }
  }
  saveStats(stats)
}

// === 配置 ===
function readTheme() {
  try {
    const t = fs.existsSync(THEME_FILE) ? fs.readFileSync(THEME_FILE, 'utf-8').trim() : ''
    return (t === 'light' || t === 'dark') ? t : 'dark'
  } catch { return 'dark' }
}

function readStyle() {
  try {
    const s = fs.existsSync(STYLE_FILE) ? fs.readFileSync(STYLE_FILE, 'utf-8').trim() : ''
    return s === 'single' ? 'single' : 'triple'
  } catch { return 'triple' }
}

// === 窗口 ===
let mainWin = null
let tray = null

function createWindow() {
  const { width: screenW, height: screenH } = screen.getPrimaryDisplay().workAreaSize

  mainWin = new BrowserWindow({
    width: 180,
    height: 420,
    x: screenW - 200,
    y: Math.floor(screenH / 2 - 210),
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  if (isDev) {
    mainWin.loadURL('http://localhost:5173')
  } else {
    mainWin.loadFile(distPath)
  }

  mainWin.setVisibleOnAllWorkspaces(true)
  startPolling()
}

// === 轮询 ===
let pollInterval = null

function startPolling() {
  pollInterval = setInterval(async () => {
    const newState = await detectOpenClawState()
    if (newState !== lastState) {
      recordStateChange(newState, lastState)
      lastState = newState
      if (mainWin) {
        mainWin.webContents.send('state-change', newState)
      }
    }
  }, 1000)
}

// === 托盘 ===
function createTray() {
  const icon = nativeImage.createFromBuffer(
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARklEQVR4nGNgIAD+WxvcIaQGp0Z0TD8DsGmmiiHkeWE+F5kGgDSiYfoZgE0zVQwhywsGFyPIMwCkER3TzwBsmqliCE28AAC/pr8bZBUK/QAAAABJRU5ErkJggg==', 'base64')
  )
  tray = new Tray(icon)
  tray.setToolTip('OpenClaw 红绿灯')
  updateTrayMenu()
}

function updateTrayMenu() {
  const theme = readTheme()
  const style = readStyle()
  const menu = Menu.buildFromTemplate([
    { label: '🔴 切换红灯', click: () => writeState('red') },
    { label: '🟡 切换黄灯', click: () => writeState('yellow') },
    { label: '🟢 切换绿灯', click: () => writeState('green') },
    { type: 'separator' },
    {
      label: style === 'single' ? '切换三灯样式' : '切换单灯样式',
      click: () => {
        const next = style === 'single' ? 'triple' : 'single'
        try { fs.writeFileSync(STYLE_FILE, next) } catch {}
        if (mainWin) mainWin.webContents.send('style-change', next)
        updateTrayMenu()
      }
    },
    {
      label: theme === 'dark' ? '切换浅色模式' : '切换深色模式',
      click: () => {
        const next = theme === 'dark' ? 'light' : 'dark'
        try { fs.writeFileSync(THEME_FILE, next) } catch {}
        if (mainWin) mainWin.webContents.send('theme-change', next)
        updateTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: '今日统计',
      click: () => {
        const { dialog } = require('electron')
        const stats = readStats()
        const today = getToday()
        const day = stats[today] || { redCount: 0, greenCount: 0, yellowCount: 0, redDuration: 0 }
        const mins = Math.floor(day.redDuration / 60000)
        const hrs = Math.floor(mins / 60)
        const durStr = hrs > 0 ? hrs + '小时' + (mins % 60) + '分钟' : mins + '分钟'
        dialog.showMessageBox({
          type: 'info',
          title: 'OpenClaw 今日统计',
          message: '任务执行：' + day.redCount + '次\n等待确认：' + day.yellowCount + '次\n完成：' + day.greenCount + '次\n工作时长：' + durStr,
          buttons: ['确定']
        })
      }
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
}

function writeState(state) {
  try { fs.writeFileSync(STATE_FILE, state) } catch {}
}

// === IPC ===
ipcMain.handle('get-initial-state', () => ({
  state: lastState,
  theme: readTheme(),
  style: readStyle()
}))

ipcMain.on('set-state', (_, state) => {
  writeState(state)
})

// === 生命周期 ===
app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  if (pollInterval) clearInterval(pollInterval)
})
