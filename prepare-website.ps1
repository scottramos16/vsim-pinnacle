# Refresh the static folder to drag onto your existing Netlify project's Deploys page.
$ErrorActionPreference = 'Stop'
$publishPath = Join-Path $PSScriptRoot 'website-upload'
New-Item -ItemType Directory -Path $publishPath -Force | Out-Null
Get-ChildItem -LiteralPath $PSScriptRoot -File | Where-Object { $_.Extension -in '.html', '.js', '.css' } | Copy-Item -Destination $publishPath -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'vendor') -Destination $publishPath -Recurse -Force
Write-Host "Ready to upload: $publishPath"
