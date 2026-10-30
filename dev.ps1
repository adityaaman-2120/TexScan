# Starts backend (:8000) and frontend (:5173) in one terminal. Ctrl+C stops both.
# -Lan serves the frontend over HTTPS on your local network, so a phone on the same Wi-Fi can use its camera.
param([switch]$Lan)
$root = $PSScriptRoot
$py = Join-Path $root "backend\.venv\Scripts\python.exe"

$backend = Start-Process -FilePath $py -NoNewWindow -PassThru -WorkingDirectory (Join-Path $root "backend") `
  -ArgumentList "-m", "uvicorn", "texscan.main:app", "--reload", "--port", "8000"

try {
  Set-Location (Join-Path $root "frontend")
  if ($Lan) { npm run dev:lan } else { npm run dev }
} finally {
  # /T also kills uvicorn's reload child process
  taskkill /PID $backend.Id /T /F | Out-Null
}
