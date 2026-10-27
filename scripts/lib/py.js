// scripts/lib/py.js
// Python 解释器探测与调用封装。
//
// 图片压缩依赖 Pillow，而机器上往往装了多个 Python：
// 有的带 Pillow 有的不带，第一次调用还可能被 PATH 里的 py.exe 占位。
// 这里按优先级挨个试，谁能 import PIL 就用谁。

const path = require('path')
const { spawnSync } = require('child_process')

/**
 * Python 在 Windows 控制台默认用 GBK 输出，
 * 不强制 UTF-8 的话解析中文日志会乱码。
 */
function pyEnv() {
  return Object.assign({}, process.env, {
    PYTHONIOENCODING: 'utf-8',
    PYTHONUTF8: '1'
  })
}

let cached = null

/** 找出第一个能 import PIL 的解释器，结果缓存 */
function detectPython() {
  if (cached !== null) return cached

  const home = process.env.USERPROFILE || process.env.HOME || ''
  const candidates = [
    process.env.STUDIO_PYTHON,
    'python',
    'python3',
    path.join(home, '.workbuddy', 'binaries', 'python', 'versions', '3.13.12', 'python.exe'),
    path.join(home, '.workbuddy', 'binaries', 'python', 'versions', '3.13.13', 'python.exe'),
    path.join(home, '.workbuddy', 'binaries', 'python', 'envs', 'default', 'Scripts', 'python.exe'),
    path.join(home, 'miniconda3', 'python.exe')
  ].filter(Boolean)

  for (const cmd of candidates) {
    try {
      const r = spawnSync(cmd, ['-c', 'import PIL, sys; print(sys.version.split()[0], PIL.__version__)'], {
        encoding: 'utf8',
        timeout: 15000
      })
      if (r.status === 0 && r.stdout) {
        cached = { cmd, info: r.stdout.trim() }
        return cached
      }
    } catch (e) {
      /* 换下一个 */
    }
  }

  cached = false
  return false
}

/** 运行一个 Python 脚本，返回 spawnSync 结果 */
function runPython(scriptPath, args, options) {
  const py = detectPython()
  if (!py) throw new Error('没找到带 Pillow 的 Python。请先安装：pip install Pillow')
  return spawnSync(py.cmd, [scriptPath].concat(args || []), Object.assign({ encoding: 'utf8', env: pyEnv() }, options || {}))
}

module.exports = { pyEnv, detectPython, runPython }
