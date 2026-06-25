#Requires -Version 5.1
<#
.SYNOPSIS
  Repair broken conda PowerShell initialization (e.g. _CONDA_ROOT pointing to Temp\_MEI*).

.DESCRIPTION
  Fixes the error:
    Import-Module : ... Conda.psm1 ... FileNotFoundException
  when $Env:_CONDA_ROOT points to a PyInstaller temp directory instead of a real conda install.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\fix-conda-powershell.ps1
#>

$ErrorActionPreference = 'Stop'

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Test-IsBrokenCondaPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
    return $Path -match '\\Temp\\_MEI\d+' -or -not (Test-Path (Join-Path $Path 'shell\condabin\Conda.psm1'))
}

function Find-CondaExe {
    $cmd = Get-Command conda -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and (Test-Path $cmd.Source)) {
        return (Resolve-Path $cmd.Source).Path
    }

    $candidates = @(
        "$env:USERPROFILE\anaconda3\Scripts\conda.exe",
        "$env:USERPROFILE\miniconda3\Scripts\conda.exe",
        "$env:USERPROFILE\AppData\Local\anaconda3\Scripts\conda.exe",
        "$env:USERPROFILE\AppData\Local\miniconda3\Scripts\conda.exe",
        "$env:ProgramData\anaconda3\Scripts\conda.exe",
        "$env:ProgramData\miniconda3\Scripts\conda.exe",
        'C:\ProgramData\anaconda3\Scripts\conda.exe',
        'C:\ProgramData\miniconda3\Scripts\conda.exe'
    )

    foreach ($path in $candidates) {
        if (Test-Path $path) {
            return (Resolve-Path $path).Path
        }
    }

    return $null
}

function Remove-CondaInitializeBlock([string]$ProfilePath) {
    if (-not (Test-Path $ProfilePath)) {
        return $false
    }

    $content = Get-Content -Path $ProfilePath -Raw
    if ($content -notmatch '(?s)# >>> conda initialize >>>.*?# <<< conda initialize <<<') {
        return $false
    }

    $updated = [regex]::Replace(
        $content,
        '(?s)# >>> conda initialize >>>.*?# <<< conda initialize <<<\r?\n?',
        ''
    ).TrimEnd()

    if ([string]::IsNullOrWhiteSpace($updated)) {
        Remove-Item -Path $ProfilePath -Force
    }
    else {
        Set-Content -Path $ProfilePath -Value $updated -Encoding UTF8
    }

    return $true
}

function Clear-BrokenCondaEnvVars {
    $names = @('_CONDA_ROOT', '_CONDA_EXE', 'CONDA_EXE')
    $scopes = @(
        @{ Name = 'Process'; Getter = { param($n) [Environment]::GetEnvironmentVariable($n, 'Process') }; Setter = { param($n, $v) [Environment]::SetEnvironmentVariable($n, $v, 'Process') } },
        @{ Name = 'User'; Getter = { param($n) [Environment]::GetEnvironmentVariable($n, 'User') }; Setter = { param($n, $v) [Environment]::SetEnvironmentVariable($n, $v, 'User') } },
        @{ Name = 'Machine'; Getter = { param($n) [Environment]::GetEnvironmentVariable($n, 'Machine') }; Setter = { param($n, $v) [Environment]::SetEnvironmentVariable($n, $v, 'Machine') } }
    )

    foreach ($scope in $scopes) {
        foreach ($name in $names) {
            $value = & $scope.Getter $name
            if (Test-IsBrokenCondaPath $value) {
                Write-Host "  Removing broken $name from $($scope.Name): $value"
                & $scope.Setter $name $null
            }
        }
    }
}

Write-Host 'Conda PowerShell repair script' -ForegroundColor Green
Write-Host "Profile: $PROFILE"

Write-Step 'Checking current _CONDA_ROOT'
$currentRoot = $Env:_CONDA_ROOT
if ($currentRoot) {
    Write-Host "  Current process _CONDA_ROOT: $currentRoot"
    if (Test-IsBrokenCondaPath $currentRoot) {
        Write-Host '  Detected broken temp PyInstaller path.' -ForegroundColor Yellow
    }
}
else {
    Write-Host '  No process-level _CONDA_ROOT set.'
}

Write-Step 'Locating conda installation'
$condaExe = Find-CondaExe
if (-not $condaExe) {
    Write-Host @'

Could not find conda.exe on this machine.

Install Miniconda or Anaconda first:
  https://docs.conda.io/en/latest/miniconda.html

Then run this script again.
'@ -ForegroundColor Red
    exit 1
}

$condaRoot = (Resolve-Path (Join-Path (Split-Path $condaExe -Parent) '..')).Path
Write-Host "  Found conda.exe: $condaExe"
Write-Host "  Conda root:      $condaRoot"

if (-not (Test-Path (Join-Path $condaRoot 'shell\condabin\Conda.psm1'))) {
    Write-Host "  Conda.psm1 is missing under $condaRoot. Reinstall conda." -ForegroundColor Red
    exit 1
}

Write-Step 'Clearing broken conda environment variables'
Clear-BrokenCondaEnvVars

Write-Step 'Ensuring PowerShell profile exists'
$profileDir = Split-Path $PROFILE -Parent
if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}
if (-not (Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
    Write-Host "  Created profile: $PROFILE"
}

Write-Step 'Removing stale conda initialize block from profile'
if (Remove-CondaInitializeBlock $PROFILE) {
    Write-Host '  Removed old conda initialize block.'
}
else {
    Write-Host '  No conda initialize block found in profile.'
}

Write-Step 'Setting execution policy (CurrentUser = RemoteSigned)'
try {
    Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
    Write-Host '  Execution policy updated.'
}
catch {
    Write-Host "  Could not change execution policy: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host '  If scripts are blocked, run PowerShell as Administrator and retry.'
}

Write-Step 'Re-running conda init powershell'
& $condaExe init powershell | ForEach-Object { Write-Host "  $_" }

Write-Step 'Verifying module path'
$verifyRoot = [Environment]::GetEnvironmentVariable('_CONDA_ROOT', 'User')
if (-not $verifyRoot) {
    $profileContent = Get-Content $PROFILE -Raw
    if ($profileContent -match '\$Env:_CONDA_ROOT\s*=\s*"([^"]+)"') {
        $verifyRoot = $Matches[1]
    }
}

if ($verifyRoot -and (Test-Path (Join-Path $verifyRoot 'shell\condabin\Conda.psm1'))) {
    Write-Host "  OK: Conda.psm1 exists at $verifyRoot" -ForegroundColor Green
}
else {
    Write-Host '  Warning: could not verify Conda.psm1 after init.' -ForegroundColor Yellow
}

Write-Host @'

Done.

Next steps:
  1. Close ALL PowerShell / Windows Terminal windows.
  2. Open a new PowerShell window.
  3. Run: conda --version
  4. Run: conda activate base

If it still fails, send the output of:
  $Env:_CONDA_ROOT
  Get-Content $PROFILE
'@ -ForegroundColor Green
