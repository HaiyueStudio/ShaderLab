param([Parameter(ValueFromRemainingArguments=$true)][string[]]$BuildArguments)
$ErrorActionPreference = 'Stop'
$shaderLabRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location -LiteralPath $shaderLabRoot
try {
  npm ci --ignore-scripts
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
  Push-Location -LiteralPath (Join-Path $shaderLabRoot 'mobile')
  try {
    node scripts/doctor.mjs android
    if ($LASTEXITCODE -ne 0) { throw 'Install JDK 21 and Android SDK 35; set JAVA_HOME and ANDROID_HOME.' }
    node scripts/build.mjs build android @BuildArguments
    if ($LASTEXITCODE -ne 0) { throw 'Android build failed' }
  } finally { Pop-Location }
} finally { Pop-Location }
