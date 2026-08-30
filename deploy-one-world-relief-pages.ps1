[CmdletBinding()]
param(
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*$')]
    [string]$ProjectName = 'trying',

    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*$')]
    [string]$Branch = 'main',

    [ValidatePattern('^[0-9a-fA-F]{7,40}$')]
    [string]$CommitHash,

    [string]$CommitMessage = 'One World Relief website deployment',

    [switch]$StageOnly,

    [switch]$KeepStage
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = $PSScriptRoot
$sourceRoot = (Resolve-Path -LiteralPath (Join-Path $repositoryRoot 'one-world-relief')).Path.TrimEnd('\', '/')
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
$stageRoot = Join-Path $temporaryRoot ("owr-pages-public-{0}" -f [guid]::NewGuid().ToString('N'))
$stageRoot = [System.IO.Path]::GetFullPath($stageRoot)

if (-not $stageRoot.StartsWith($temporaryRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not (Split-Path -Leaf $stageRoot).StartsWith('owr-pages-public-', [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to use an unsafe staging path: $stageRoot"
}

if (-not $CommitHash) {
    $CommitHash = (& git -C $repositoryRoot rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $CommitHash -notmatch '^[0-9a-fA-F]{7,40}$') {
        throw 'Could not determine the current Git commit.'
    }
}

$publicExtensions = @(
    '.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico',
    '.json', '.webmanifest', '.txt', '.xml', '.woff', '.woff2', '.ttf', '.otf', '.mp4', '.webm',
    '.mov', '.pdf'
)
$publicControlFiles = @('_headers', '_redirects', '_routes.json', 'robots.txt', 'sitemap.xml')
$publicDirectories = @('assets', 'projects')
$functionExtensions = @('.js', '.mjs', '.json', '.wasm')

function Copy-StagedFile {
    param([Parameter(Mandatory)][System.IO.FileInfo]$File)

    $relativePath = $File.FullName.Substring($sourceRoot.Length).TrimStart('\', '/')
    if ([string]::IsNullOrWhiteSpace($relativePath) -or $relativePath.StartsWith('..')) {
        throw "Refusing to stage a file outside the website source: $($File.FullName)"
    }

    $destination = Join-Path $stageRoot $relativePath
    New-Item -ItemType Directory -Path (Split-Path $destination -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $File.FullName -Destination $destination
}

New-Item -ItemType Directory -Path $stageRoot | Out-Null

try {
    Get-ChildItem -LiteralPath $sourceRoot -File | Where-Object {
        $publicExtensions -contains $_.Extension.ToLowerInvariant() -or $publicControlFiles -contains $_.Name
    } | ForEach-Object { Copy-StagedFile -File $_ }

    foreach ($directory in $publicDirectories) {
        $directoryPath = Join-Path $sourceRoot $directory
        if (-not (Test-Path -LiteralPath $directoryPath -PathType Container)) {
            continue
        }

        Get-ChildItem -LiteralPath $directoryPath -Recurse -File | Where-Object {
            $publicExtensions -contains $_.Extension.ToLowerInvariant()
        } | ForEach-Object { Copy-StagedFile -File $_ }
    }

    $functionsPath = Join-Path $sourceRoot 'functions'
    Get-ChildItem -LiteralPath $functionsPath -Recurse -File | Where-Object {
        $functionExtensions -contains $_.Extension.ToLowerInvariant()
    } | ForEach-Object { Copy-StagedFile -File $_ }

    $requiredFiles = @(
        'index.html',
        'donate.html',
        'one-world-relief.css',
        'functions\_middleware.js',
        'functions\charity\donations\checkout.js',
        'functions\charity\donors\leaderboard.js',
        'functions\charity\webhooks\stripe.js'
    )
    foreach ($requiredFile in $requiredFiles) {
        if (-not (Test-Path -LiteralPath (Join-Path $stageRoot $requiredFile) -PathType Leaf)) {
            throw "The deployment artifact is missing required file: $requiredFile"
        }
    }

    $privateMarkers = @(
        'AI_HANDOFF_DOCUMENTATION.md',
        'backend-setup.md',
        'cloudflare-d1-schema.sql',
        'PROJECT_INTAKE_TEMPLATE.md',
        'tests\charity-functions.test.mjs'
    )
    foreach ($privateMarker in $privateMarkers) {
        if (Test-Path -LiteralPath (Join-Path $stageRoot $privateMarker)) {
            throw "Private repository file entered the deployment artifact: $privateMarker"
        }
    }

    $allStagedFiles = @(Get-ChildItem -LiteralPath $stageRoot -Recurse -File)
    $functionFiles = @($allStagedFiles | Where-Object {
        $_.FullName.StartsWith((Join-Path $stageRoot 'functions') + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)
    })
    $publicAssetCount = $allStagedFiles.Count - $functionFiles.Count

    Write-Host "Prepared $publicAssetCount public assets and $($functionFiles.Count) Pages Function source files."
    Write-Host "Staging directory: $stageRoot"

    if ($StageOnly) {
        $KeepStage = $true
        return
    }

    $dirtyStatus = @(& git -C $repositoryRoot status --short)
    if ($LASTEXITCODE -ne 0) {
        throw 'Could not determine the Git working-tree status.'
    }
    $commitDirty = if ($dirtyStatus.Count -gt 0) { 'true' } else { 'false' }

    $npxCommand = Get-Command npx.cmd -ErrorAction SilentlyContinue
    if (-not $npxCommand) {
        $npxCommand = Get-Command npx -ErrorAction Stop
    }

    Push-Location $stageRoot
    try {
        & $npxCommand.Source --yes wrangler@latest pages deploy . `
            --project-name $ProjectName `
            --branch $Branch `
            --commit-hash $CommitHash `
            --commit-message $CommitMessage `
            --commit-dirty=$commitDirty
        if ($LASTEXITCODE -ne 0) {
            throw "Wrangler exited with code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
finally {
    if (-not $KeepStage -and (Test-Path -LiteralPath $stageRoot)) {
        Remove-Item -LiteralPath $stageRoot -Recurse -Force
    }
}
