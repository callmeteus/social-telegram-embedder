$ErrorActionPreference = "Stop"

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

$repoRoot = Split-Path -Parent $PSScriptRoot
$distPath = (Resolve-Path (Join-Path $repoRoot "dist")).Path
$securePrefs = Join-Path $env:LOCALAPPDATA "Google\Chrome\User Data\Default\Secure Preferences"

if (-not (Test-Path $securePrefs)) {
    throw "Chrome Default profile not found at $securePrefs"
}

$prefs = Get-Content $securePrefs -Raw | ConvertFrom-Json
$extensionId = $null

foreach ($entry in $prefs.extensions.settings.PSObject.Properties) {
    $path = $entry.Value.path

    if (-not $path) {
        continue
    }

    $resolved = Resolve-Path -Path $path -ErrorAction SilentlyContinue

    if ($resolved -and $resolved.Path -eq $distPath) {
        $extensionId = $entry.Name
        break
    }
}

if (-not $extensionId) {
    throw "Extension from $distPath is not installed in the Chrome Default profile"
}

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"

if (-not (Test-Path $chromePath)) {
    $chromePath = "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
}

if (-not (Test-Path $chromePath)) {
    throw "Chrome executable not found"
}

$uiRoot = [System.Windows.Automation.AutomationElement]::RootElement
$tabCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
$omniboxCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "view_1012")

function Get-ChromeWindows {
    $windows = @()

    foreach ($process in (Get-Process chrome -ErrorAction SilentlyContinue)) {
        if ($process.MainWindowHandle -eq 0) {
            continue
        }

        $condition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $process.Id)
        $windows += $uiRoot.FindAll([System.Windows.Automation.TreeScope]::Children, $condition)
    }

    return $windows
}

$initialHandles = @(Get-ChromeWindows | ForEach-Object { $_.Current.NativeWindowHandle })
$openedWindows = @()

try {
    Start-Process $chromePath -ArgumentList @("--new-window", "--profile-directory=Default", "chrome://extensions/?id=$extensionId")
    Start-Sleep -Seconds 2

    $openedWindows = @(Get-ChromeWindows | Where-Object { $_.Current.NativeWindowHandle -notin $initialHandles })

    if ($openedWindows.Count -eq 0) {
        throw "Could not find the Chrome window opened for chrome://extensions"
    }

    $window = $openedWindows[0]

    for ($attempt = 0; $attempt -lt 6; $attempt++) {
        $tabs = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)
        $extensionsTab = $tabs | Where-Object { $_.Current.Name -like "*Extens*" } | Select-Object -First 1

        if ($extensionsTab) {
            $extensionsTab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
            break
        }

        $omnibox = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $omniboxCondition)

        if (-not $omnibox) {
            Start-Sleep -Seconds 1
            continue
        }

        $omnibox.SetFocus()
        $omnibox.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue("chrome://extensions/?id=$extensionId")
        [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
        Start-Sleep -Seconds 1
    }

    Start-Sleep -Milliseconds 500

    $buttonCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "dev-reload-button")
    $reloadButton = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)

    if (-not $reloadButton) {
        throw "Extension reload button not found. Enable Developer mode on chrome://extensions."
    }

    $reloadButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
    Write-Host "Reloaded $extensionId in the Chrome Default profile"
}
finally {
    foreach ($openedWindow in $openedWindows) {
        try {
            $openedWindow.GetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern).Close()
        }
        catch {
            Write-Warning "Could not close the Chrome window opened by this script: $_"
        }
    }
}
