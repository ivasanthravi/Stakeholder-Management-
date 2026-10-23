// Runs the API server and the Vite client together; Ctrl+C stops both.
import { spawn } from 'node:child_process'
const procs = [
  spawn('npm', ['run', 'dev:server'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:client'], { stdio: 'inherit' }),
]
const stop = () => { for (const p of procs) p.kill('SIGINT'); process.exit(0) }
process.on('SIGINT', stop); process.on('SIGTERM', stop)
for (const p of procs) p.on('exit', code => { if (code) stop() })
