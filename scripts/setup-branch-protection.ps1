#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Configures branch protection rules for the master branch
.DESCRIPTION
    Uses GitHub CLI (gh) or REST API to set up recommended branch protection
    rules for the torqena repository.
.PARAMETER Token
    GitHub personal access token (or use GITHUB_TOKEN environment variable)
.PARAMETER DryRun
    Show what would be configured without making changes
.EXAMPLE
    ./setup-branch-protection.ps1 -DryRun
.EXAMPLE
    ./setup-branch-protection.ps1 -Token "ghp_..."
#>

param(
    [string]$Token = $env:GITHUB_TOKEN,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Configuration
$Owner = "danielshue"
$Repo = "torqena"
$Branch = "master"

$ProtectionConfig = @{
    required_status_checks = @{
        strict = $true
        contexts = @("build", "test", "lint", "validate")
    }
    enforce_admins = $true
    required_pull_request_reviews = @{
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $false
        required_approving_review_count = 1
    }
    required_conversation_resolution = $true
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    restrictions = $null
}

Write-Host "🔒 Branch Protection Setup for $Owner/$Repo" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Check if GitHub CLI is available
function Test-GitHubCli {
    try {
        $null = Get-Command gh -ErrorAction Stop
        return $true
    } catch {
        return $false
    }
}

# Check if authenticated
function Test-GitHubAuth {
    if (Test-GitHubCli) {
        try {
            gh auth status 2>$null
            return $?
        } catch {
            return $false
        }
    }
    return $false
}

# Display configuration
Write-Host "📋 Configuration:" -ForegroundColor Yellow
Write-Host "  Branch: $Branch"
Write-Host "  Required status checks: $($ProtectionConfig.required_status_checks.contexts -join ', ')"
Write-Host "  Required approvals: $($ProtectionConfig.required_pull_request_reviews.required_approving_review_count)"
Write-Host "  Enforce for admins: $($ProtectionConfig.enforce_admins)"
Write-Host "  Require linear history: $($ProtectionConfig.required_linear_history)"
Write-Host "  Require conversation resolution: $($ProtectionConfig.required_conversation_resolution)"
Write-Host "  Allow force pushes: $($ProtectionConfig.allow_force_pushes)"
Write-Host "  Allow deletions: $($ProtectionConfig.allow_deletions)"
Write-Host ""

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No changes will be made" -ForegroundColor Magenta
    Write-Host ""
    Write-Host "Would configure branch protection with the above settings."
    Write-Host ""
    Write-Host "To apply, run without -DryRun flag:" -ForegroundColor Yellow
    Write-Host "  ./setup-branch-protection.ps1" -ForegroundColor Cyan
    exit 0
}

# Method 1: Try GitHub CLI first
if (Test-GitHubCli) {
    Write-Host "✓ GitHub CLI detected" -ForegroundColor Green
    
    if (Test-GitHubAuth) {
        Write-Host "✓ Authenticated with GitHub" -ForegroundColor Green
        Write-Host ""
        Write-Host "⚙️  Configuring branch protection..." -ForegroundColor Yellow
        
        try {
            # Convert PowerShell booleans to JSON lowercase strings
            $strictBool = $ProtectionConfig.required_status_checks.strict.ToString().ToLower()
            $enforceAdminsBool = $ProtectionConfig.enforce_admins.ToString().ToLower()
            $dismissStaleBool = $ProtectionConfig.required_pull_request_reviews.dismiss_stale_reviews.ToString().ToLower()
            $requireCodeOwnersBool = $ProtectionConfig.required_pull_request_reviews.require_code_owner_reviews.ToString().ToLower()
            $requireConversationBool = $ProtectionConfig.required_conversation_resolution.ToString().ToLower()
            $requireLinearHistoryBool = $ProtectionConfig.required_linear_history.ToString().ToLower()
            $allowForcePushesBool = $ProtectionConfig.allow_force_pushes.ToString().ToLower()
            $allowDeletionsBool = $ProtectionConfig.allow_deletions.ToString().ToLower()
            
            # Build the JSON payload
            $payload = @{
                required_status_checks = @{
                    strict = $ProtectionConfig.required_status_checks.strict
                    contexts = $ProtectionConfig.required_status_checks.contexts
                }
                enforce_admins = $ProtectionConfig.enforce_admins
                required_pull_request_reviews = @{
                    dismiss_stale_reviews = $ProtectionConfig.required_pull_request_reviews.dismiss_stale_reviews
                    required_approving_review_count = $ProtectionConfig.required_pull_request_reviews.required_approving_review_count
                    require_code_owner_reviews = $ProtectionConfig.required_pull_request_reviews.require_code_owner_reviews
                }
                required_conversation_resolution = $ProtectionConfig.required_conversation_resolution
                required_linear_history = $ProtectionConfig.required_linear_history
                allow_force_pushes = $ProtectionConfig.allow_force_pushes
                allow_deletions = $ProtectionConfig.allow_deletions
                restrictions = $null
            } | ConvertTo-Json -Depth 10 -Compress
            
            Write-Host "Running: gh api repos/$Owner/$Repo/branches/$Branch/protection" -ForegroundColor Gray
            
            # Use stdin to pass JSON payload
            $payload | gh api "repos/$Owner/$Repo/branches/$Branch/protection" --method PUT --input -
            
            Write-Host ""
            Write-Host "✅ Branch protection configured successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "View settings at:" -ForegroundColor Yellow
            Write-Host "  https://github.com/$Owner/$Repo/settings/branches" -ForegroundColor Cyan
            exit 0
            
        } catch {
            Write-Host "❌ Failed to configure via GitHub CLI: $_" -ForegroundColor Red
            Write-Host "Falling back to manual instructions..." -ForegroundColor Yellow
        }
    } else {
        Write-Host "⚠️  Not authenticated. Run: gh auth login" -ForegroundColor Yellow
    }
}

# Method 2: Manual instructions
Write-Host ""
Write-Host "📖 Manual Setup Instructions:" -ForegroundColor Yellow
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""
Write-Host "1. Visit: https://github.com/$Owner/$Repo/settings/branches" -ForegroundColor White
Write-Host "2. Click 'Add rule' or edit existing '$Branch' rule" -ForegroundColor White
Write-Host "3. Configure with these settings:" -ForegroundColor White
Write-Host ""
Write-Host "   Branch name pattern: $Branch" -ForegroundColor Cyan
Write-Host ""
Write-Host "   ✅ Require a pull request before merging" -ForegroundColor Green
Write-Host "      • Required approvals: 1" -ForegroundColor Gray
Write-Host "      • Dismiss stale reviews: Yes" -ForegroundColor Gray
Write-Host ""
Write-Host "   ✅ Require status checks to pass before merging" -ForegroundColor Green
Write-Host "      • Require branches to be up to date: Yes" -ForegroundColor Gray
Write-Host "      • Status checks: build, test, lint" -ForegroundColor Gray
Write-Host ""
Write-Host "   ✅ Require conversation resolution" -ForegroundColor Green
Write-Host "   ✅ Require linear history" -ForegroundColor Green
Write-Host "   ✅ Include administrators" -ForegroundColor Green
Write-Host ""
Write-Host "   ❌ Allow force pushes: No" -ForegroundColor Red
Write-Host "   ❌ Allow deletions: No" -ForegroundColor Red
Write-Host ""
Write-Host "4. Click 'Create' or 'Save changes'" -ForegroundColor White
Write-Host ""
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Gray
Write-Host ""
Write-Host "💡 Note:" -ForegroundColor Yellow
Write-Host "   Status checks (build, test, lint) must exist before they can be required."
Write-Host "   Make sure your CI workflow is set up first. See .github/BRANCH_PROTECTION_SETUP.md"
Write-Host ""

# If token provided, show curl command
if ($Token) {
    Write-Host "🔧 Alternative: Use curl with your token:" -ForegroundColor Yellow
    Write-Host ""
    $json = $ProtectionConfig | ConvertTo-Json -Depth 10
    Write-Host "curl -X PUT \" -ForegroundColor Cyan
    Write-Host "  -H 'Authorization: token $Token' \" -ForegroundColor Cyan
    Write-Host "  -H 'Accept: application/vnd.github.v3+json' \" -ForegroundColor Cyan
    Write-Host "  https://api.github.com/repos/$Owner/$Repo/branches/$Branch/protection \" -ForegroundColor Cyan
    Write-Host "  -d '$($json -replace "'", "\'")'" -ForegroundColor Cyan
    Write-Host ""
}
