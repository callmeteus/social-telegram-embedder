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

function Find-ExtensionsTab($window) {
    $tabs = $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)

    return $tabs | Where-Object { $_.Current.Name -like "*Extens*" } | Select-Object -First 1
}

$window = $null

foreach ($candidate in (Get-ChromeWindows)) {
    $tab = Find-ExtensionsTab $candidate

    if ($tab) {
        $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
        $window = $candidate
        break
    }
}

if (-not $window) {
    $candidates = @(Get-ChromeWindows)
    $navigator = $candidates | Where-Object { $_.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $omniboxCondition) } | Select-Object -First 1

    if (-not $navigator) {
        throw "No Chrome window available to open chrome://extensions"
    }

    $omnibox = $navigator.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $omniboxCondition)
    $omnibox.SetFocus()
    $omnibox.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern).SetValue("chrome://extensions/?id=$extensionId")
    Start-Sleep -Milliseconds 300
    [System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
    Start-Sleep -Seconds 2

    foreach ($candidate in (Get-ChromeWindows)) {
        $tab = Find-ExtensionsTab $candidate

        if ($tab) {
            $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
            $window = $candidate
            break
        }
    }
}

if (-not $window) {
    throw "Chrome extensions tab not found"
}

Start-Sleep -Milliseconds 500

$buttonCondition = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, "dev-reload-button")
$reloadButton = $window.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)

if (-not $reloadButton) {
    throw "Extension reload button not found. Enable Developer mode on chrome://extensions."
}

$reloadButton.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
Write-Host "Reloaded $extensionId in the Chrome Default profile"
