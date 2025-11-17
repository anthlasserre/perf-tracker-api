# Cloudflare R2 Setup Guide

## Troubleshooting "Access Denied" Error

If you're getting an "Access Denied" (403) error when uploading videos, follow these steps:

### 1. Verify API Token Permissions

Your R2 API token must have the correct permissions:

1. Go to Cloudflare Dashboard → R2 → Manage R2 API Tokens
2. Create or edit your API token
3. **Required Permissions:**
   - **Object Read & Write** (minimum) OR
   - **Admin Read & Write** (recommended for troubleshooting)
4. Make sure the token is scoped to your bucket (or all buckets)

### 2. Check Environment Variables

Ensure all these variables are set in your `.env` file:

```env
R2_ACCOUNT_ID=your_account_id_here
R2_ACCESS_KEY_ID=your_access_key_id_here
R2_SECRET_ACCESS_KEY=your_secret_access_key_here
R2_BUCKET_NAME=your_bucket_name_here
R2_PUBLIC_URL=https://your-public-url.r2.dev
```

**How to find these values:**

- **R2_ACCOUNT_ID**: 
  - Go to Cloudflare Dashboard → Right sidebar → Your Account ID
  - Or: R2 → Your bucket → Settings → Account ID

- **R2_ACCESS_KEY_ID** and **R2_SECRET_ACCESS_KEY**:
  - Go to R2 → Manage R2 API Tokens
  - Create a new token or view existing token
  - Copy the Access Key ID and Secret Access Key

- **R2_BUCKET_NAME**:
  - The exact name of your R2 bucket (case-sensitive)

- **R2_PUBLIC_URL**:
  - If using a custom domain: `https://your-domain.com`
  - If using R2 public URL: `https://pub-xxxxx.r2.dev` (found in bucket settings)

### 3. Test R2 Connection

After setting up your environment variables, test the connection:

```bash
curl http://localhost:3001/r2/test
```

Or visit `http://localhost:3001/r2/test` in your browser.

This will tell you if:
- ✅ Connection is working
- ❌ Access Denied (check permissions)
- ❌ Bucket not found (check bucket name)

### 4. Verify Bucket Exists

1. Go to Cloudflare Dashboard → R2
2. Verify your bucket name matches `R2_BUCKET_NAME` exactly (case-sensitive)
3. Make sure the bucket is in the same account as your API token

### 5. Check Bucket Permissions

Even if your API token has permissions, the bucket itself needs to allow operations:

1. Go to R2 → Your bucket → Settings
2. Check that the bucket is accessible
3. For public access, configure a Custom Domain or Public URL in bucket settings

### Common Issues

**Issue**: "Access Denied" even with correct credentials
- **Solution**: Try creating a new API token with "Admin Read & Write" permissions

**Issue**: "NoSuchBucket" error
- **Solution**: Double-check `R2_BUCKET_NAME` matches exactly (case-sensitive, no extra spaces)

**Issue**: Connection works but uploads fail
- **Solution**: Check file size limits and ensure bucket has enough storage quota

### Quick Checklist

- [ ] API token has "Object Read & Write" or "Admin Read & Write" permissions
- [ ] All 5 environment variables are set correctly
- [ ] `R2_BUCKET_NAME` matches your bucket name exactly
- [ ] `R2_ACCOUNT_ID` matches your Cloudflare account ID
- [ ] API token is not expired
- [ ] Bucket exists and is accessible
- [ ] Test endpoint (`/r2/test`) returns success

### Need Help?

Check the server logs when starting the API - it will show:
- ✅ R2 configuration loaded (if all vars are set)
- ⚠️ Missing environment variables
- ✅ R2 connection test passed (on startup)

If issues persist, check the detailed error logs which will show specific guidance.

