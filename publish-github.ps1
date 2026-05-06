param(
    [string]$Message = "Update project",
    [string]$RepoName = "",
    [switch]$Private,
    [switch]$CreateRepo,
    [switch]$Yes
)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Text)
    Write-Host "`n==> $Text" -ForegroundColor Cyan
}

function Confirm-Step {
    param([string]$Question)

    if ($Yes) {
        return $true
    }

    $answer = Read-Host "$Question [y/N]"
    return $answer -match '^(y|yes)$'
}

function Require-Command {
    param([string]$Name, [string]$InstallHint)

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name is required. $InstallHint"
    }
}

Require-Command "git" "Install Git from https://git-scm.com/downloads"

$projectPath = (Get-Location).Path
$projectName = Split-Path $projectPath -Leaf
if (-not $RepoName) {
    $RepoName = $projectName
}

Write-Step "Publishing $projectName"

$possibleSecretFiles = Get-ChildItem -Force -File -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -match '^\.env' -or
        $_.Name -match '\.(pem|key|p12|pfx)$'
    }

if ($possibleSecretFiles) {
    Write-Host "These files look sensitive and should not be committed:" -ForegroundColor Yellow
    $possibleSecretFiles | ForEach-Object { Write-Host " - $($_.Name)" -ForegroundColor Yellow }
    if (-not (Confirm-Step "Continue anyway?")) {
        Write-Host "Canceled before staging files."
        exit 1
    }
}

if (-not (Test-Path ".git")) {
    Write-Step "Initializing Git"
    git init
}

$currentBranch = git branch --show-current
if (-not $currentBranch) {
    git checkout -b main
} elseif ($currentBranch -ne "main") {
    Write-Host "Current branch is '$currentBranch'. Keeping it." -ForegroundColor Yellow
}

$hasRemote = $false
try {
    $remoteUrl = git remote get-url origin 2>$null
    if ($remoteUrl) {
        $hasRemote = $true
    }
} catch {
    $hasRemote = $false
}

if ($CreateRepo -and -not $hasRemote) {
    Require-Command "gh" "Install GitHub CLI from https://cli.github.com/ and run: gh auth login"

    Write-Step "Creating GitHub repo $RepoName"
    $visibility = if ($Private) { "--private" } else { "--public" }
    gh repo create $RepoName $visibility --source=. --remote=origin
    $hasRemote = $true
}

Write-Step "Checking changes"
$status = git status --short
if (-not $status) {
    Write-Host "No changes to publish."
    exit 0
}

Write-Host $status
if (-not (Confirm-Step "Commit and push these changes?")) {
    Write-Host "Canceled before commit."
    exit 1
}

Write-Step "Committing"
git add .

$staged = git diff --cached --name-only
if (-not $staged) {
    Write-Host "Nothing staged after git add."
    exit 0
}

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git commit -m "$Message ($timestamp)"

try {
    $remoteUrl = git remote get-url origin 2>$null
    if ($remoteUrl) {
        $hasRemote = $true
    }
} catch {
    $hasRemote = $false
}

if (-not $hasRemote) {
    Write-Host "`nCommitted locally, but no GitHub remote is set." -ForegroundColor Yellow
    Write-Host "To create one automatically later, install GitHub CLI, run 'gh auth login', then run:"
    Write-Host "  .\publish-github.ps1 -CreateRepo"
    Write-Host "Or add an existing repo remote with:"
    Write-Host "  git remote add origin https://github.com/YOUR_USERNAME/$RepoName.git"
    exit 0
}

Write-Step "Pushing"
git push -u origin (git branch --show-current)

Write-Host "`nPublished successfully." -ForegroundColor Green
