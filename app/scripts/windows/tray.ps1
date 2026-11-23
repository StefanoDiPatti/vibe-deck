param([switch]$Panel)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$DataDir = Join-Path $Root 'data'
$Log = Join-Path $DataDir 'dock.log'
$Runtime = Join-Path $DataDir 'runtime.json'

function Show-Message([string]$text, [string]$icon = 'Information') {
  [void][System.Windows.Forms.MessageBox]::Show($text, 'Vibe Deck', 'OK', $icon)
}

function Get-PortQuick {
  $envFile = Join-Path $Root '.env'
  if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) { if ($line -match '^\s*PORT\s*=\s*(\d+)') { return $Matches[1] } }
  }
  return '8787'
}
function Open-Panel { Start-Process ('http://127.0.0.1:' + (Get-PortQuick) + '/control') }

$mutex = New-Object System.Threading.Mutex($false, 'Local\VibeDeckTray')
if (-not $mutex.WaitOne(0)) {
  Open-Panel
  exit 0
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) {
  Show-Message "Node.js non trovato. Avvia start.bat dalla cartella del progetto per installarlo." 'Error'
  exit 1
}
$node = $node.Source

if (-not (Test-Path $DataDir)) { [void](New-Item -ItemType Directory -Path $DataDir) }
if ((Test-Path $Log) -and (Get-Item $Log).Length -gt 2MB) { Move-Item $Log "$Log.1" -Force }

function Read-EnvValue([string]$name) {
  $envFile = Join-Path $Root '.env'
  if (-not (Test-Path $envFile)) { return '' }
  foreach ($line in Get-Content $envFile) {
    if ($line -match "^\s*$name\s*=\s*(.*)$") { return $Matches[1].Trim().Trim('"').Trim("'") }
  }
  return ''
}

function Read-Runtime {
  try { return Get-Content $Runtime -Raw | ConvertFrom-Json } catch { return $null }
}

function Get-Port {
  $p = Read-EnvValue 'PORT'
  if ($p -match '^\d+$') { return $p }
  return '8787'
}

function New-DockIcon([System.Drawing.Color]$color) {
  $bmp = New-Object System.Drawing.Bitmap 32, 32
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::Transparent)
  $brush = New-Object System.Drawing.SolidBrush $color
  foreach ($x in 0, 1) { foreach ($y in 0, 1) { $g.FillRectangle($brush, 2 + $x * 15, 2 + $y * 15, 13, 13) } }
  $g.Dispose()
  return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}
$iconOn = New-DockIcon ([System.Drawing.Color]::FromArgb(61, 139, 253))
$iconOff = New-DockIcon ([System.Drawing.Color]::FromArgb(110, 127, 144))

$script:proc = $null
$script:stopping = $false
$script:startedAt = $null
$script:announced = $false

function Start-Dock {
  $script:stopping = $false
  $script:announced = $false
  $script:startedAt = Get-Date
  $bootstrap = Join-Path $Root 'scripts\bootstrap.js'
  Add-Content -Path $Log -Value ("`r`n===== avvio " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + " =====") -Encoding UTF8
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $env:ComSpec
  $psi.Arguments = '/d /s /c " "' + $node + '" "' + $bootstrap + '" --service >> "' + $Log + '" 2>&1 "'
  $psi.WorkingDirectory = $Root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $script:proc = [System.Diagnostics.Process]::Start($psi)
  $tray.Icon = $iconOn
  $tray.Text = 'Vibe Deck - avvio...'
  $statusItem.Text = 'Vibe Deck - avvio in corso'
}

function Stop-Dock {
  $script:stopping = $true
  if ($script:proc -and -not $script:proc.HasExited) {
    & taskkill.exe /T /F /PID $script:proc.Id | Out-Null
    $script:proc.WaitForExit(5000) | Out-Null
  }
  $tray.Icon = $iconOff
  $tray.Text = 'Vibe Deck - ferma'
  $statusItem.Text = 'Vibe Deck - ferma'
}

function Get-TabletInfo {
  $rt = Read-Runtime
  $token = Read-EnvValue 'DOCK_TOKEN'
  $lines = @()
  if ($rt -and $rt.urls) {
    $lines += 'Apri sul tablet:'
    foreach ($u in $rt.urls) { $lines += '   ' + $u }
    if ($token) { $lines += ''; $lines += 'Codice di accesso: ' + $token; $lines += ''; $lines += 'Link diretto: ' + $rt.urls[0] + '/?t=' + $token }
  } else {
    $lines += 'Indirizzo non ancora disponibile (la dock sta partendo o si e'' fermata).'
    $lines += 'Controlla il log dal menu.'
  }
  return ($lines -join "`r`n")
}

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $iconOff
$tray.Text = 'Vibe Deck'
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$statusItem = $menu.Items.Add('Vibe Deck')
$statusItem.Enabled = $false
[void]$menu.Items.Add('-')

$panelItem = $menu.Items.Add('Pannello di controllo')
$panelItem.Font = New-Object System.Drawing.Font($panelItem.Font, [System.Drawing.FontStyle]::Bold)
$panelItem.Add_Click({ Open-Panel })

$openItem = $menu.Items.Add('Apri la dock su questo PC')
$openItem.Add_Click({ Start-Process ('http://127.0.0.1:' + (Get-Port) + '/?t=' + (Read-EnvValue 'DOCK_TOKEN')) })

$infoItem = $menu.Items.Add('Indirizzo e codice per il tablet...')
$infoItem.Add_Click({
  $text = Get-TabletInfo
  try { [System.Windows.Forms.Clipboard]::SetText($text) } catch { }
  Show-Message ($text + "`r`n`r`n(copiato negli appunti)")
})

$logItem = $menu.Items.Add('Apri il log')
$logItem.Add_Click({ if (Test-Path $Log) { Start-Process notepad.exe -ArgumentList ('"' + $Log + '"') } })

$folderItem = $menu.Items.Add('Apri la cartella della dock')
$folderItem.Add_Click({ Start-Process explorer.exe -ArgumentList ('"' + $Root + '"') })

[void]$menu.Items.Add('-')
$restartItem = $menu.Items.Add('Riavvia')
$restartItem.Add_Click({ Stop-Dock; Start-Dock })

$exitItem = $menu.Items.Add('Chiudi Vibe Deck')
$exitItem.Add_Click({
  Stop-Dock
  $timer.Stop()
  $tray.Visible = $false
  $tray.Dispose()
  [System.Windows.Forms.Application]::Exit()
})

$tray.ContextMenuStrip = $menu
$tray.Add_DoubleClick({ Open-Panel })
$tray.Visible = $true

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
  if (-not $script:proc) { return }
  if ($script:proc.HasExited) {
    if ($script:stopping) { return }
    $code = $script:proc.ExitCode
    $script:stopping = $true
    $tray.Icon = $iconOff
    if ($code -eq 3) {
      $tray.ShowBalloonTip(6000, 'Vibe Deck', 'La porta e'' gia'' in uso: la dock e'' gia'' avviata in un''altra finestra?', 'Warning')
      $tray.Text = 'Vibe Deck - porta occupata'
      $statusItem.Text = 'Vibe Deck - porta occupata'
    } else {
      $tray.ShowBalloonTip(6000, 'Vibe Deck', 'La dock si e'' fermata. Apri il log dal menu dell''icona.', 'Error')
      $tray.Text = 'Vibe Deck - ferma'
      $statusItem.Text = 'Vibe Deck - ferma (vedi log)'
    }
    return
  }
  if (-not $script:announced) {
    $rt = Read-Runtime
    if ($rt -and $rt.urls -and ([datetime]$rt.startedAt) -ge $script:startedAt.AddSeconds(-5)) {
      $script:announced = $true
      $url = $rt.urls[0]
      $tray.Text = 'Vibe Deck - attiva'
      $statusItem.Text = 'Vibe Deck - attiva su ' + $url
      if ($Panel) {
        $script:Panel = $false
        Open-Panel
      } else {
        $tray.ShowBalloonTip(4000, 'Vibe Deck attiva', 'Sul tablet: ' + $url + "`nDoppio clic sull'icona: pannello di controllo.", 'Info')
      }
    }
  }
})

Start-Dock
$timer.Start()
[System.Windows.Forms.Application]::Run()
$mutex.ReleaseMutex()
