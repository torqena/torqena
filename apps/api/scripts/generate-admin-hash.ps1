#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Generate an admin user hash for Azure Functions authorization.

.DESCRIPTION
    Creates a SHA-256 hash of a GitHub username that can be used as an admin
    identifier in the ADMIN_USER_HASHES environment variable.

.PARAMETER Username
    The GitHub username to hash.

.EXAMPLE
    .\generate-admin-hash.ps1 -Username danielshue

.NOTES
    The hash is generated using the same algorithm as the client-side user hash.
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Username
)

# Convert username to lowercase (same as client does)
$normalizedUsername = $Username.ToLower()

# Generate SHA-256 hash
$stringAsStream = [System.IO.MemoryStream]::new()
$writer = [System.IO.StreamWriter]::new($stringAsStream)
$writer.write($normalizedUsername)
$writer.Flush()
$stringAsStream.Position = 0

$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hashBytes = $sha256.ComputeHash($stringAsStream)
$hash = [System.BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()

Write-Host "`nAdmin hash for '$Username':" -ForegroundColor Green
Write-Host $hash -ForegroundColor Yellow

Write-Host "`nAdd this to your Azure Functions environment:" -ForegroundColor Cyan
Write-Host "ADMIN_USER_HASHES=$hash" -ForegroundColor White

Write-Host "`nFor multiple admins, use comma separation:" -ForegroundColor Cyan
Write-Host "ADMIN_USER_HASHES=$hash,another-hash-here" -ForegroundColor White
