$ErrorActionPreference = 'Stop'
if (-not $env:ADMIN_PASSWORD) {
    $password = Read-Host 'Enter the password for admin' -AsSecureString
    $env:ADMIN_PASSWORD = [Net.NetworkCredential]::new('', $password).Password
}
try {
    node (Join-Path $PSScriptRoot 'server.mjs')
    exit $LASTEXITCODE
} finally {
    Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
}