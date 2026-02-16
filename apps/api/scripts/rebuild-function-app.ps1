#!/usr/bin/env pwsh
# Rebuild and deploy Azure Container Apps analytics API

$ErrorActionPreference = "Stop"

Write-Host "`n╔════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Container Apps - Build & Deploy Script                     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Configuration
$resourceGroup = "rg-vault-copilot-analytics"
$appName = "vault-copilot-api"
$acrName = "vaultcopilotacr"
$storageAccount = "vaultcopilotanalytics"
$imageName = "vault-copilot-api"
$imageTag = "latest"

Write-Host "Configuration:" -ForegroundColor Green
Write-Host "  Resource Group: $resourceGroup"
Write-Host "  Container App: $appName"
Write-Host "  ACR: $acrName.azurecr.io"
Write-Host "  Storage: $storageAccount`n"

# Step 1: Build TypeScript
Write-Host "Step 1: Building TypeScript..." -ForegroundColor Cyan
npm run build
Write-Host "✓ Build complete`n" -ForegroundColor Green

# Step 2: Build container image via ACR
Write-Host "Step 2: Building container image via ACR Build..." -ForegroundColor Cyan
az acr build `
    --registry $acrName `
    --image "${imageName}:${imageTag}" `
    --file Dockerfile.production `
    . 2>&1 | Select-Object -Last 5
Write-Host "✓ Image built and pushed`n" -ForegroundColor Green

# Step 3: Update Container App with new image
Write-Host "Step 3: Updating Container App..." -ForegroundColor Cyan
az containerapp update `
    --name $appName `
    --resource-group $resourceGroup `
    --image "$acrName.azurecr.io/${imageName}:${imageTag}" `
    --output none
Write-Host "✓ Container App updated`n" -ForegroundColor Green

# Step 4: Ensure storage account public network access is enabled
Write-Host "Step 4: Verifying storage account network access..." -ForegroundColor Cyan
az storage account update `
    -n $storageAccount `
    --public-network-access Enabled `
    --output none
Write-Host "✓ Storage account public network access enabled`n" -ForegroundColor Green

# Step 5: Configure CORS policy on ingress
Write-Host "Step 5: Configuring CORS policy..." -ForegroundColor Cyan
az containerapp ingress cors enable `
    --name $appName `
    --resource-group $resourceGroup `
    --allowed-origins "https://danielshue.github.io" "app://obsidian.md" "http://localhost" "http://localhost:3000" "http://127.0.0.1" `
    --allowed-methods "GET" "POST" "PUT" "DELETE" "OPTIONS" `
    --allowed-headers "Content-Type" "x-user-hash" `
    --max-age 86400 `
    --output none
Write-Host "✓ CORS policy applied`n" -ForegroundColor Green

# Step 6: Test
Write-Host "Step 6: Testing deployment..." -ForegroundColor Cyan
$fqdn = az containerapp show `
    --name $appName `
    --resource-group $resourceGroup `
    --query properties.configuration.ingress.fqdn -o tsv

Start-Sleep -Seconds 15

try {
    $health = Invoke-RestMethod -Uri "https://$fqdn/api/health" -Method GET -TimeoutSec 30
    Write-Host "✓ SUCCESS! App is working!" -ForegroundColor Green
    Write-Host "  Status: $($health.status)" -ForegroundColor Gray
    Write-Host "  Version: $($health.version)`n" -ForegroundColor Gray
} catch {
    Write-Host "⚠ App may need more time to warm up" -ForegroundColor Yellow
    Write-Host "  Try: Invoke-RestMethod https://$fqdn/api/health`n" -ForegroundColor Gray
}

Write-Host "Endpoints:" -ForegroundColor Cyan
Write-Host "  https://$fqdn/api/health" -ForegroundColor Gray
Write-Host "  https://$fqdn/api/setup" -ForegroundColor Gray
Write-Host "  https://$fqdn/api/installs" -ForegroundColor Gray
Write-Host ""
