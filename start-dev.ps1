# Полный запуск HanZiWeb dev-окружения (Windows).
#
# Использование:
#   .\start-dev.ps1                — всё: docker, контейнеры, чистка портов,
#                                    миграции, pnpm dev, браузер
#   .\start-dev.ps1 -NoBrowser     — не открывать браузер
#   .\start-dev.ps1 -SkipMigrate   — пропустить prisma migrate deploy
#   .\start-dev.ps1 -NoDev         — только подготовка, без запуска pnpm dev
param(
  [switch]$NoBrowser,
  [switch]$SkipMigrate,
  [switch]$NoDev
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

function Test-Docker {
  docker info *> $null
  return ($LASTEXITCODE -eq 0)
}

Write-Host '==> HanZiWeb: запуск dev-окружения' -ForegroundColor Cyan

# --- 1. Docker engine -----------------------------------------------------
if (-not (Test-Docker)) {
  $dockerDesktop = "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe"
  if (Test-Path $dockerDesktop) {
    Write-Host 'Docker engine не запущен — стартую Docker Desktop (жду до 90 сек)…' -ForegroundColor Yellow
    Start-Process $dockerDesktop
    $ready = $false
    foreach ($i in 1..45) {
      Start-Sleep -Seconds 2
      if (Test-Docker) { $ready = $true; break }
      Write-Host "  … ждём Docker ($($i * 2) сек)"
    }
    if (-not $ready) { throw 'Docker engine не поднялся. Запусти Docker Desktop вручную и повтори.' }
  } else {
    throw 'Docker недоступен, а Docker Desktop не найден. Запусти Docker вручную.'
  }
}
Write-Host 'Docker: ok' -ForegroundColor Green

# --- 2. Контейнеры postgres + redis ---------------------------------------
docker compose up -d postgres redis
if ($LASTEXITCODE -ne 0) { throw 'docker compose не смог поднять postgres/redis.' }
Write-Host 'Контейнеры postgres/redis: ok' -ForegroundColor Green

# --- 3. Чистка осиротевших node-процессов на портах 3001/5173 -------------
foreach ($port in 3001, 5173) {
  $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in $listeners) {
    $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node') {
      Write-Host "Порт ${port}: убиваю осиротевший node (PID $($proc.Id))" -ForegroundColor Yellow
      try {
        Stop-Process -Id $proc.Id -Force
      } catch {
        Write-Host "  Не удалось (нет прав): закрой старое окно терминала с pnpm dev вручную" -ForegroundColor Red
      }
    } elseif ($proc) {
      Write-Host "Порт ${port} занят процессом $($proc.ProcessName) (PID $($proc.Id)) — не трогаю" -ForegroundColor Yellow
    }
  }
}

# --- 4. Миграции -----------------------------------------------------------
if (-not $SkipMigrate) {
  pnpm --filter @hanzi/server exec prisma migrate deploy
  if ($LASTEXITCODE -ne 0) { throw 'prisma migrate deploy упал. Разбери ошибку выше.' }
  Write-Host 'Миграции: ok' -ForegroundColor Green
}

if ($NoDev) {
  Write-Host 'Готово (-NoDev): окружение подготовлено, pnpm dev не запускался.' -ForegroundColor Green
  exit 0
}

# --- 5. Браузер откроется, когда vite поднимется ----------------------------
if (-not $NoBrowser) {
  Start-Job -Name open-browser {
    Start-Sleep -Seconds 20
    Start-Process 'http://localhost:5173'
  } | Out-Null
}

# --- 6. pnpm dev ------------------------------------------------------------
Write-Host 'Запускаю pnpm dev (Ctrl+C — остановить)…' -ForegroundColor Cyan
pnpm dev
