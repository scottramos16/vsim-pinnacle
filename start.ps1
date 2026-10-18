$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$projectNode = Join-Path $projectRoot '.tools/node.exe'
if (Test-Path -LiteralPath $projectNode) {
    & $projectNode (Join-Path $projectRoot 'server.mjs')
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    & node (Join-Path $projectRoot 'server.mjs')
} else {
    Write-Error 'Node.js is required. Install Node.js, reopen VS Code, and run this script again.'
}
