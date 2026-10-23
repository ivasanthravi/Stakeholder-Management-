// Runs the API server and the Vite client together; Ctrl+C stops both.
// If either exits with an error, the other is stopped and that exit code is propagated.
import { spawn } from 'node:child_process'
const procs = [
  spawn('npm', ['run', 'dev:server'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:client'], { stdio: 'inherit' }),
]
const stop = (code = 0) => { for (const p of procs) p.kill('SIGINT'); process.exit(code) }
process.on('SIGINT', () => stop(0)); process.on('SIGTERM', () => stop(0))
for (const p of procs) p.on('exit', code => { if (code) stop(code) })
