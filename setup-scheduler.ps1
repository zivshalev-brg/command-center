# Beanz OS - Set up daily news refresh scheduled task
# Run this once as administrator: powershell -ExecutionPolicy Bypass -File setup-scheduler.ps1

$taskName = "BeanzOS-NewsRefresh"
$batPath = "C:\Users\Ziv.Shalev\.claude\command-center\news-refresh.bat"

# Remove existing task if present
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Removed existing task: $taskName"
}

# Create action - run the batch file
$action = New-ScheduledTaskAction -Execute $batPath

# Trigger: daily at 6:00 AM
$trigger = New-ScheduledTaskTrigger -Daily -At "06:00AM"

# Settings: run whether user is logged in, allow wake from sleep, retry on failure
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopIfGoingOnBatteries `
    -AllowStartIfOnBatteries `
    -RestartCount 2 `
    -RestartInterval (New-TimeSpan -Minutes 5)

# Register the task (runs as current user)
Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Beanz OS daily news aggregation - fetches coffee industry RSS, Reddit, and YouTube content" `
    -RunLevel Limited

Write-Host ""
Write-Host "Scheduled task '$taskName' created successfully!" -ForegroundColor Green
Write-Host "  Schedule: Daily at 6:00 AM"
Write-Host "  Script:   $batPath"
Write-Host "  Log:      C:\Users\Ziv.Shalev\.claude\command-center\news-refresh.log"
Write-Host ""
Write-Host "To verify: Get-ScheduledTask -TaskName $taskName | Format-List"
Write-Host "To run now: Start-ScheduledTask -TaskName $taskName"
Write-Host "To remove:  Unregister-ScheduledTask -TaskName $taskName"
