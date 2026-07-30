$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"

Set-Location -LiteralPath $repoRoot

if (-not (Test-Path -LiteralPath $venvPython)) {
  python -m venv (Join-Path $repoRoot ".venv")
}

& $venvPython -m pip install -r (Join-Path $repoRoot "backend\requirements.txt")
& $venvPython -m backend.build_corpus
& $venvPython -m backend.build_index
