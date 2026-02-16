# Branch Protection Quick Setup

## ✅ Files Created

I've set up everything you need for branch protection:

### 1. Documentation
- **`.github/BRANCH_PROTECTION_SETUP.md`** - Complete guide with all options explained
- This file - Quick reference for immediate setup

### 2. Automation Script
- **`scripts/setup-branch-protection.ps1`** - PowerShell script to configure via API

### 3. CI Workflow
- **`.github/workflows/ci.yml`** - Comprehensive CI pipeline with:
  - ✅ **build** - Validates Vite renderer build
  - ✅ **test** - Runs Vitest tests with coverage
  - ✅ **typecheck** - TypeScript type checking

### 4. Code Ownership
- **`.github/CODEOWNERS`** - Auto-request reviews for critical paths

## 🚀 Quick Start (3 Methods)

### Method 1: Automated Setup via GitHub CLI (Recommended)

You're already authenticated! Just run:

```powershell
.\scripts\setup-branch-protection.ps1
```

This will configure:
- ✅ Require 1 PR approval before merging
- ✅ Require status checks: build, test, lint
- ✅ Require linear history (no merge commits)
- ✅ Require conversation resolution
- ✅ Apply rules to administrators
- ❌ Block force pushes and branch deletion

### Method 2: GitHub Web UI (5 minutes)

1. Go to: https://github.com/danielshue/torqena/settings/branches
2. Click **"Add rule"**
3. Enter branch name pattern: `master`
4. Check these boxes:
   - ✅ Require a pull request before merging (1 approval)
   - ✅ Require status checks to pass before merging
     - ✅ Require branches to be up to date
     - Search and select: `build`, `test`, `lint` (after first CI run)
   - ✅ Require conversation resolution before merging
   - ✅ Require linear history
   - ✅ Include administrators
5. Click **"Create"**

### Method 3: GitHub API via curl

See `.github/BRANCH_PROTECTION_SETUP.md` for curl examples.

## 📝 Next Steps

### Step 1: Commit the new files

```powershell
git add .github/ scripts/ 
git commit -m "feat: add branch protection setup and CI workflow

- Add comprehensive CI workflow (build, test, lint, typecheck)
- Add branch protection setup script
- Add CODEOWNERS for auto-review requests
- Add branch protection documentation
"
```

### Step 2: Push to trigger first CI run

```powershell
git push origin master
```

This first push will run the CI workflow, which creates the status checks that branch protection requires.

### Step 3: Apply branch protection

After the first CI run completes, run:

```powershell
.\scripts\setup-branch-protection.ps1
```

Or use the GitHub web UI at the link above.

### Step 4: Test it!

```powershell
# Create a test branch
git checkout -b test-branch-protection
echo "test" >> README.md
git add README.md
git commit -m "test: branch protection"
git push origin test-branch-protection

# Open a PR on GitHub
# Try to merge without approval → should be blocked ✅
```

## 🎯 What This Accomplishes

### Code Quality
- No code reaches master without review
- All tests must pass
- No linting or type errors
- Build succeeds before merge

### Git History
- Clean, linear history (no merge commits)
- No accidental force pushes
- No branch deletions
- Easy to understand project timeline

### Collaboration
- Auto-request reviews via CODEOWNERS
- All PR discussions must be resolved
- Changes tracked and documented

### Extension Catalog
- Extension submissions auto-validated

## ⚡ Status Check Details

The new CI workflow provides these checks:

1. **build** - Builds the Vite renderer
   - Creates `dist/`
   - Validates compilation

2. **test** - Runs test suite
   - Vitest tests
   - Coverage reports uploaded
   - Must pass all tests

3. **typecheck** - Type safety
   - TypeScript type checking
   - Finds type errors

## 🔍 Existing Workflows

Your existing workflows will continue to work:

- **ci.yml** - Build, test, and type check on PRs and master pushes
- **lint.yml** - ESLint checks

## 📚 Resources

- Full setup guide: `.github/BRANCH_PROTECTION_SETUP.md`
- GitHub docs: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches
- CODEOWNERS: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners

## 🤔 Questions?

**Q: Can I still push directly to master during setup?**
A: Yes, until you run the setup script. After that, all changes require a PR.

**Q: What if CI checks don't show up?**
A: Push to master first so the checks run once, then apply branch protection.

**Q: Can I bypass the rules?**
A: Only by temporarily disabling branch protection (not recommended).

**Q: Do I need to approve my own PRs?**
A: If you're the only one with write access, yes. Or add collaborators.

**Q: What about hotfixes?**
A: Create a PR and self-approve. The CI checks will still run.

---

**Ready to proceed?** Run `.\scripts\setup-branch-protection.ps1` after committing! 🚀
