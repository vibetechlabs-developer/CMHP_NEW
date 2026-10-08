# Start the CMHP_NEW backend on 127.0.0.1:8000 against the CLEAN TEST database.
# Database: cmhp_new_clean_test (migrations only; no business data).
# Usage (PowerShell):  .\start_clean_test_db.ps1
$ErrorActionPreference = 'Stop'
$DbName  = 'cmhp_new_clean_test'
$Backend = 'D:\CMHP_NEW\backend'
$Python  = 'C:\Users\Admin\AppData\Local\Programs\Python\Python312\python.exe'

if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 8000 is already in use. Stop only the CMHP_NEW backend first, then run this again.'
}
Set-Location -LiteralPath $Backend
$env:DB_NAME = $DbName   # applies to this session's child process only
Write-Host "CMHP_NEW backend -> database: $DbName"
try {
    & $Python manage.py runserver 127.0.0.1:8000
} finally {
    Remove-Item Env:\DB_NAME -ErrorAction SilentlyContinue
}
