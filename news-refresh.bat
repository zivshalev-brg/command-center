@echo off
:: Beanz OS — Daily News Refresh
:: Run by Windows Task Scheduler at 6:00 AM daily
cd /d "C:\Users\Ziv.Shalev\.claude\command-center"
"C:\Program Files\nodejs\node.exe" news-refresh.js --quiet
