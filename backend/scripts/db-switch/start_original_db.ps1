# Start the CMHP_NEW backend on 127.0.0.1:8000 against the ORIGINAL database.
# Database: cmhp_new_dev (the value in backend\.env). No DB_NAME override is set.
# Usage (PowerShell):  .\start_original_db.ps1
$ErrorActionPreference = 'Stop'
$DbName  = 'cmhp_new_dev'
$Backend = 'D:\CMHP_NEW\backend'
$Python  = 'C:\Users\Admin\AppData\Local\Programs\Python\Python312\python.exe'

if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
    throw 'Port 8000 is already in use. Stop only the CMHP_NEW backend first, then run this again.'
}
Set-Location -LiteralPath $Backend
Remove-Item Env:\DB_NAME -ErrorAction SilentlyContinue   # use .env, which points at cmhp_new_dev
Write-Host "CMHP_NEW backend -> database: $DbName (from .env)"
& $Python manage.py runserver 127.0.0.1:8000
