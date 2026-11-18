param([ValidateSet("up", "test", "down", "logs")][string]$Action = "up")
$ErrorActionPreference = "Stop"
$composeFile = Join-Path $PSScriptRoot "compose.yml"
switch ($Action) {
  "up" {
    docker compose -f $composeFile up --build -d --wait --wait-timeout 180
    if ($LASTEXITCODE -ne 0) { throw "Demo startup failed." }
    Write-Output "Web: http://localhost:3000"
    Write-Output "Login: alex@stud.ubbcluj.ro / Demo12345!"
  }
  "test" {
    docker compose -f $composeFile exec -T matching python -m unittest -v test_matching test_scheduling
    if ($LASTEXITCODE -ne 0) { throw "Matching and calendar tests failed." }
    docker compose -f $composeFile exec -T core node checks/integration.mjs
    if ($LASTEXITCODE -ne 0) { throw "Integration tests failed." }
  }
  "down" {
    docker compose -f $composeFile down
    if ($LASTEXITCODE -ne 0) { throw "Demo shutdown failed." }
  }
  "logs" {
    docker compose -f $composeFile logs --tail 100
    if ($LASTEXITCODE -ne 0) { throw "Cannot read demo logs." }
  }
}
