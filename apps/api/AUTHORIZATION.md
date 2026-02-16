# Azure Functions Authorization

## Overview

The analytics API enforces authorization for sensitive operations to ensure users can only manage their own data, with special admin privileges for designated users.

## Authorization Rules

### Delete Rating (`DELETE /api/ratings/{extensionId}/{userHash}`)
- **Who can delete**: Only the user who created the rating
- **Validation**: Request must include `X-User-Hash` header matching the `userHash` URL parameter

### Delete User Data (`DELETE /api/user/{userHash}`)
- **Who can delete**:
  - The user themselves (hash matches)
  - Admin users (hash in `ADMIN_USER_HASHES`)
- **Validation**: Request must include `X-User-Hash` header
- **Admin check**: Hash is compared against `ADMIN_USER_HASHES` environment variable

## Setup

### 1. Generate Your Admin Hash

Run the PowerShell script to generate your admin hash:

```powershell
cd apps/api
.\scripts\generate-admin-hash.ps1 -Username danielshue
```

This will output your admin hash based on your GitHub username.

### 2. Configure Environment Variables

#### Local Development (`local.settings.json`)

```json
{
  "Values": {
    "ADMIN_USER_HASHES": "your-hash-from-step-1"
  }
}
```

#### Azure Production

Set the application setting in Azure Portal or using Azure CLI:

```bash
az functionapp config appsettings set \
  --name your-function-app \
  --resource-group your-resource-group \
  --settings ADMIN_USER_HASHES="your-hash-from-step-1"
```

#### Multiple Admins

Separate multiple admin hashes with commas:

```
ADMIN_USER_HASHES="hash1,hash2,hash3"
```

## How It Works

### Client Side

The `ExtensionAnalyticsService` automatically includes the authenticated user's hash in the `X-User-Hash` header for all requests:

```typescript
const service = new ExtensionAnalyticsService(apiUrl, userHash);
// or
service.setAuthenticatedUser(userHash);
```

### Server Side

Each protected endpoint:
1. Reads the `X-User-Hash` header from the request
2. Validates it matches the target user hash (for user operations)
3. Checks if the hash is in the admin list (for admin operations)
4. Returns `403 Forbidden` if unauthorized

## Security Notes

- User hashes are SHA-256 hashes of lowercase GitHub usernames
- The `X-User-Hash` header proves identity (client-side computed, server-side validated)
- Admins can perform GDPR deletion for any user
- Regular users can only delete their own data
- All authorization failures are logged with context
