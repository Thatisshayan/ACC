$out = "C:\Users\Shaya\agent-command-center\nssm.exe"
$urls = @(
    "https://github.com/kirillkovalenko/nssm/raw/master/nssm.exe",
    "https://raw.githubusercontent.com/nssm-project/nssm/master/src/nssm.exe"
)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
foreach ($url in $urls) {
    try {
        Write-Host "Trying: $url"
        Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing -TimeoutSec 20
        if ((Get-Item $out -ErrorAction SilentlyContinue).Length -gt 100000) {
            Write-Host "SUCCESS: $((Get-Item $out).Length) bytes"
            break
        }
    } catch { Write-Host "Failed: $_" }
}
