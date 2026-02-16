# Branch Protection Setup Guide

This guide explains how to configure branch protection rules for the `master` branch to ensure code quality and prevent accidental changes.

## Recommended Branch Protection Rules

### For `master` Branch

#### 1. Require Pull Request Reviews
- **Require approvals**: 1 approval minimum
- **Dismiss stale reviews**: Enable (when new commits are pushed)
- **Require review from code owners**: Optional (if you add a CODEOWNERS file)

#### 2. Require Status Checks to Pass
Required checks before merging:
- ✅ `build` - Ensure TypeScript compiles and esbuild succeeds
- ✅ `test` - Run Vitest tests
- ✅ `validate` - For extension PRs (from validate-pr.yml workflow)
- ✅ `lint` - Ensure code passes ESLint

#### 3. Require Branches to be Up to Date
- ✅ Enable - Ensures PRs are tested against latest master

#### 4. Require Conversation Resolution
- ✅ Enable - All review comments must be resolved before merging

#### 5. Include Administrators
- ⚠️ Recommended to enable - Applies rules to repository admins too

#### 6. Additional Protections
- ✅ **Require linear history** - Prevents merge commits, enforces rebase/squash
- ✅ **Do not allow bypassing the above settings** - Strict enforcement
- ❌ **Allow force pushes** - Disabled (protect history)
- ❌ **Allow deletions** - Disabled (prevent accidental deletion)

## Setup Methods

### Option 1: GitHub Web UI (Recommended)

1. Go to your repository on GitHub: https://github.com/danielshue/torqena
2. Click **Settings** → **Branches**
3. Under "Branch protection rules", click **Add rule**
4. Configure as follows:

   **Branch name pattern**: `master`
   
   **Protect matching branches**:
   - ✅ Require a pull request before merging
     - ✅ Require approvals: 1
     - ✅ Dismiss stale pull request approvals when new commits are pushed
   - ✅ Require status checks to pass before merging
     - ✅ Require branches to be up to date before merging
     - Add status checks: `build`, `test`, `lint` (after first CI run)
   - ✅ Require conversation resolution before merging
   - ✅ Require linear history
   - ✅ Include administrators (recommended)
   - ✅ Do not allow bypassing the above settings
   - ❌ Allow force pushes: Disabled
   - ❌ Allow deletions: Disabled

5. Click **Create** or **Save changes**

### Option 2: GitHub CLI

If you have GitHub CLI installed:

```bash
# Install GitHub CLI if needed
# https://cli.github.com/

# Login
gh auth login

# Create branch protection rule
gh api repos/danielshue/torqena/branches/master/protection \
  --method PUT \
  --field required_status_checks[strict]=true \
  --field required_status_checks[contexts][]=build \
  --field required_status_checks[contexts][]=test \
  --field required_status_checks[contexts][]=lint \
  --field enforce_admins=true \
  --field required_pull_request_reviews[dismiss_stale_reviews]=true \
  --field required_pull_request_reviews[required_approving_review_count]=1 \
  --field required_pull_request_reviews[require_code_owner_reviews]=false \
  --field required_conversation_resolution=true \
  --field required_linear_history=true \
  --field allow_force_pushes=false \
  --field allow_deletions=false
```

### Option 3: GitHub GraphQL API (Advanced)

See `scripts/setup-branch-protection.ps1` for a PowerShell script using the GitHub GraphQL API.

## Status Checks Configuration

The required status checks need to exist first. Ensure your GitHub Actions workflows define these jobs:

### Current Workflows

From `.github/workflows/`:

1. **Build & Test** (add if not present):
   ```yaml
   name: CI
   
   on:
     pull_request:
       branches: [master]
     push:
       branches: [master]
   
   jobs:
     build:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
         - run: npm ci
         - run: npm run build
     
     test:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
         - run: npm ci
         - run: npm test
     
     lint:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
         - run: npm ci
         - run: npm run lint
   ```

2. **Extension Validation** (already exists):
   - Job: `validate`
   - Runs on PRs that modify `extensions/**`

## CODEOWNERS (Optional)

Create `.github/CODEOWNERS` to auto-request reviews:

```
# Default owner for everything
* @danielshue

# Extensions require review
/extensions/ @danielshue

# Critical files
/src/ @danielshue
/package.json @danielshue
/.github/workflows/ @danielshue
```

## Testing Branch Protection

After setup:

1. Create a test branch:
   ```bash
   git checkout -b test-branch-protection
   echo "test" >> README.md
   git add README.md
   git commit -m "test: branch protection"
   git push origin test-branch-protection
   ```

2. Try to create a PR on GitHub
3. Try to merge without approvals/status checks → Should be blocked ✅
4. Get approval and passing checks → Should allow merge ✅

## Troubleshooting

### Status Checks Not Showing Up
- Ensure workflows have run at least once
- Check workflow job names match exactly
- Workflows must be in `.github/workflows/` on master branch

### Can't Push to Master
- ✅ Expected! Create a PR instead
- Use feature branches for all changes

### Administrator Override Needed
- If you enabled "Include administrators" you'll need to temporarily disable it
- Or create a PR and self-approve (if only 1 approval required)

## Next Steps

1. ✅ Set up branch protection on GitHub
2. ✅ Create a CI workflow if not present (see example above)
3. ✅ Test with a dummy PR
4. ✅ Update team on new workflow (all changes via PR)
5. ✅ Consider adding CODEOWNERS for auto-review requests

## References

- [GitHub Branch Protection Documentation](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)
- [GitHub Status Checks](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/collaborating-on-repositories-with-code-quality-features/about-status-checks)
- [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
