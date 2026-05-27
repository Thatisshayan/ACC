# deploy-icon.ps1 — Run after saving acc-logo.png to Desktop or Downloads
$root = "c:\Users\Shaya\agent-command-center"

# Find the PNG
$src = $null
foreach ($p in @(
  "$env:USERPROFILE\Desktop\acc-logo.png",
  "$env:USERPROFILE\Downloads\acc-logo.png"
)) {
  if (Test-Path $p) { $src = $p; break }
}

if (-not $src) {
  Write-Host "ERROR: acc-logo.png not found on Desktop or Downloads." -ForegroundColor Red
  Write-Host "Save the image as acc-logo.png to your Desktop, then re-run this script." -ForegroundColor Yellow
  pause; exit 1
}

Write-Host "Found: $src" -ForegroundColor Green

# 1. UI public folder (shown in browser/Electron window)
$pubDir = "$root\ui\public"
New-Item -ItemType Directory -Path $pubDir -Force | Out-Null
Copy-Item $src "$pubDir\acc-logo.png" -Force
Write-Host "Copied to ui/public/acc-logo.png" -ForegroundColor Green

# 2. Desktop assets folder (tray icon)
$assetsDir = "$root\desktop\assets"
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
Copy-Item $src "$assetsDir\tray.png" -Force
Write-Host "Copied to desktop/assets/tray.png" -ForegroundColor Green

# 3. Convert to ICO using .NET for Windows taskbar/exe icon
try {
  Add-Type -AssemblyName System.Drawing
  $bitmap = [System.Drawing.Bitmap]::new($src)
  $resized = [System.Drawing.Bitmap]::new($bitmap, [System.Drawing.Size]::new(256, 256))
  $icoPath = "$assetsDir\acc.ico"

  # Write ICO manually (single 256x256 image)
  $ms = [System.IO.MemoryStream]::new()
  $resized.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $pngBytes = $ms.ToArray()

  $icoStream = [System.IO.FileStream]::new($icoPath, [System.IO.FileMode]::Create)
  $writer = [System.IO.BinaryWriter]::new($icoStream)
  # ICO header
  $writer.Write([uint16]0)       # reserved
  $writer.Write([uint16]1)       # type: icon
  $writer.Write([uint16]1)       # count: 1 image
  # Directory entry
  $writer.Write([byte]0)         # width (0 = 256)
  $writer.Write([byte]0)         # height (0 = 256)
  $writer.Write([byte]0)         # color count
  $writer.Write([byte]0)         # reserved
  $writer.Write([uint16]1)       # planes
  $writer.Write([uint16]32)      # bit count
  $writer.Write([uint32]$pngBytes.Length)
  $writer.Write([uint32]22)      # offset to image data (6 header + 16 dir entry)
  $writer.Write($pngBytes)
  $writer.Close()
  $icoStream.Close()
  $bitmap.Dispose(); $resized.Dispose()

  Write-Host "Created desktop/assets/acc.ico" -ForegroundColor Green

  # Update desktop shortcut to use ICO
  $WshShell = New-Object -ComObject WScript.Shell
  $desktop  = [System.Environment]::GetFolderPath('Desktop')
  $lnkPath  = "$desktop\ACC v2.lnk"
  if (Test-Path $lnkPath) {
    $lnk = $WshShell.CreateShortcut($lnkPath)
    $lnk.IconLocation = "$icoPath,0"
    $lnk.Save()
    Write-Host "Desktop shortcut icon updated" -ForegroundColor Green
  }
} catch {
  Write-Host "ICO conversion skipped: $_" -ForegroundColor Yellow
}

# 4. Rebuild UI so the logo appears in the app window
Write-Host "`nRebuilding UI..." -ForegroundColor Cyan
Set-Location "$root\ui"
npm run build 2>&1 | Select-Object -Last 5
Set-Location $root

Write-Host "`nAll done! Relaunch ACC v2 to see the new icon." -ForegroundColor Green
pause
