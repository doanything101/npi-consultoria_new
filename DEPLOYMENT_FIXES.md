# Deployment Build Fixes

## Overview
This document summarizes the fixes applied to resolve the Vercel deployment build error.

## Problem
The deployment was failing during the build process with the error:
```
Error: Defina a variável de ambiente MONGODB_URI
```

The error occurred because Next.js was trying to execute API routes during build time when collecting page data, but the `MONGODB_URI` environment variable was not available during the build phase.

## Root Cause
1. **MongoDB connection at module level**: The `src/app/lib/mongodb.ts` file was checking for the `MONGODB_URI` environment variable immediately when the module was imported, rather than when the database connection was actually needed.

2. **Missing dynamic route configuration**: API routes were missing the `export const dynamic = 'force-dynamic'` configuration, which tells Next.js not to attempt static analysis or pre-rendering during build time.

## Fixes Applied

### 1. MongoDB Connection Fix
**File**: `src/app/lib/mongodb.ts`

**Changes**:
- Moved the `MONGODB_URI` environment variable check from module level to inside the `connectToDatabase()` function
- This ensures the check only happens when a connection is actually attempted at runtime, not during build time

**Before**:
```typescript
const MONGODB_URI = process.env.MONGODB_URI as string;

if (!MONGODB_URI) {
  throw new Error("Defina a variável de ambiente MONGODB_URI");
}
```

**After**:
```typescript
export async function connectToDatabase() {
  // Check for MONGODB_URI only when connection is needed (runtime)
  const MONGODB_URI = process.env.MONGODB_URI;
  
  if (!MONGODB_URI) {
    throw new Error("Defina a variável de ambiente MONGODB_URI");
  }
  // ... rest of function
}
```

### 2. API Route Configuration
Added `export const dynamic = 'force-dynamic';` to **54 API route files** to prevent Next.js from trying to statically analyze or execute them during build time.

#### Files Modified:
- All routes in `src/app/api/admin/`
- All routes in `src/app/api/cities/`
- All routes in `src/app/api/imoveis/`
- All routes in `src/app/api/condominios/`
- All routes in `src/app/api/search/`
- All routes in `src/app/api/automacao/`
- And many more...

**Example**:
```javascript
import { connectToDatabase } from "@/app/lib/mongodb";
import City from "@/app/models/City";

export const dynamic = 'force-dynamic'; // ← Added this line

export async function GET(request) {
  // ... route handler
}
```

## Why These Fixes Work

1. **Deferred Environment Check**: By moving the environment variable validation into the function, it only runs when the API is actually called at runtime, not during build time.

2. **Force Dynamic Rendering**: The `export const dynamic = 'force-dynamic'` directive tells Next.js 14:
   - Don't try to statically generate this route
   - Don't execute this code during build time
   - Always render this route dynamically at request time

## Deployment Checklist

Before deploying, ensure:
- ✅ `MONGODB_URI` environment variable is set in Vercel project settings
- ✅ All necessary Firebase environment variables are set
- ✅ AWS S3 credentials are configured (if using S3 storage)
- ✅ All other required environment variables are configured

## Testing
To test locally:
```bash
npm run build
```

This should now complete successfully without requiring the `MONGODB_URI` to be set during build time.

## Additional Notes
- The Firebase Admin SDK already had proper fallback handling for missing environment variables during build time
- All TypeScript files (.ts) and JavaScript files (.js) in the API routes directory were updated
- This fix maintains backward compatibility - the runtime behavior remains unchanged

## Second Build Error - Invalid URL

### Problem
After fixing the MongoDB issue, a second error appeared:
```
TypeError: Invalid URL
    at new URL (node:internal/url:825:25)
    input: 'undefined'
Error: Failed to collect page data for /
```

This occurred because `process.env.NEXT_PUBLIC_SITE_URL` was undefined during build time, and the code was trying to create a URL with `undefined` as input.

### Solution
Added fallback values for all `process.env.NEXT_PUBLIC_SITE_URL` usages in metadata and URL generation:

**Pattern used**:
```javascript
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.npiconsultoria.com.br';
```

**Files fixed**:
- `src/app/page.js` - Home page metadata
- `src/app/(site)/[slug]/page.js` - Condominium pages metadata
- `src/app/imovel/[id]/[slug]/page.js` - Property pages metadata
- `src/app/imovel/[id]/[slug]/componentes/ValoresUnidade.js` - WhatsApp share component

## Files Changed
- `src/app/lib/mongodb.ts` (1 file)
- API route files (54 files total)
- Page metadata files (4 files)
- Component files (1 file)

**Total: 60 files modified**

## Estimated Impact
- ✅ Build process will no longer fail due to missing environment variables
- ✅ All API routes are properly configured for dynamic rendering
- ✅ No change to runtime behavior or performance
- ✅ Production deployment should now succeed

