# GitHub Secrets Setup Guide

Quick guide to configure GitHub Actions for automatic Docker image builds.

## 📝 Required Secrets

You need to add **5 secrets** to your GitHub repository.

## 🔧 Step-by-Step Setup

### 1. Go to GitHub Repository Settings

```
Your Repository → Settings → Secrets and variables → Actions → New repository secret
```

### 2. Add the Following Secrets

#### Secret 1: REGISTRY_URL

**Name:** `REGISTRY_URL`

**Value:** Your registry domain (without https://)

**Examples:**
```
registry.yourdomain.com
docker.yourdomain.com
ghcr.io
```

**Notes:**
- ❌ Don't include `https://`
- ❌ Don't include trailing slash
- ✅ Just the hostname

---

#### Secret 2: REGISTRY_USERNAME

**Name:** `REGISTRY_USERNAME`

**Value:** Your registry username

**Examples:**
```
admin
your-username
github-username
```

---

#### Secret 3: REGISTRY_PASSWORD

**Name:** `REGISTRY_PASSWORD`

**Value:** Your registry password or access token

**Important:**
- Use an access token instead of password (more secure)
- For GitHub Container Registry (ghcr.io):
  - Go to: Settings → Developer settings → Personal access tokens
  - Create token with `write:packages` permission
  - Use token as password

---

#### Secret 4: COOLIFY_API_TOKEN

**Name:** `COOLIFY_API_TOKEN`

**Value:** Your Coolify API token (bearer token)

**How to get it:**
1. Log in to your Coolify instance
2. Go to: **Keys & Tokens** → **API tokens**
3. Create a new API token
4. Copy the token value
5. Use it as `COOLIFY_API_TOKEN`

**Notes:**
- This token is used to authenticate with Coolify's deploy webhook
- Keep it secure and don't share it publicly

---

#### Secret 5: COOLIFY_RESOURCE_UUID

**Name:** `COOLIFY_RESOURCE_UUID`

**Value:** Your Coolify resource UUID

**How to get it:**
1. Log in to your Coolify instance
2. Navigate to your application/resource
3. The UUID can be found in:
   - The deploy webhook URL: `https://platform.kowiz.tsensei.dev/api/v1/deploy?uuid=YOUR-UUID-HERE&force=false`
   - Or in the resource settings/details page
4. Copy the UUID (without the `uuid=` prefix)

**Example:**
```
abc12345-6789-0123-4567-890abcdef012
```

**Notes:**
- This is the unique identifier for your Coolify resource
- Used to trigger deployments for the correct resource

---

## ✅ Verification

After adding secrets, your repository should show:

```
Settings → Secrets and variables → Actions

Repository secrets (5)
├── REGISTRY_URL            ****************
├── REGISTRY_USERNAME       ****************
├── REGISTRY_PASSWORD       ****************
├── COOLIFY_API_TOKEN       ****************
└── COOLIFY_RESOURCE_UUID   ****************
```

## 🧪 Test the Setup

1. Make a commit and push:
   ```bash
   git commit --allow-empty -m "test: trigger deployment"
   git push
   ```

2. Go to **Actions** tab in GitHub

3. You should see "Build and Push Docker Images" workflow running

4. Wait for completion (~5-10 minutes)

5. Check your registry for new images:
   ```
   registry.yourdomain.com/kowiz-web:latest
   registry.yourdomain.com/kowiz-worker:latest
   ```

## 🎯 Expected Image Tags

After successful build, you'll have:

```
kowiz-web:latest           # Latest from main branch
kowiz-web:main             # Main branch
kowiz-web:main-abc1234     # Specific commit

kowiz-worker:latest        # Latest from main branch
kowiz-worker:main          # Main branch
kowiz-worker:main-abc1234  # Specific commit
```

## 🔑 Using GitHub Container Registry (ghcr.io)

If using GitHub's registry:

**REGISTRY_URL:**
```
ghcr.io/your-username
```

**REGISTRY_USERNAME:**
```
your-github-username
```

**REGISTRY_PASSWORD:**
1. Go to: https://github.com/settings/tokens
2. Generate new token (classic)
3. Select scopes:
   - `write:packages`
   - `read:packages`
   - `delete:packages`
4. Copy token
5. Use as REGISTRY_PASSWORD

## 🚨 Common Issues

### "unauthorized: authentication required"

**Solution:** Check your REGISTRY_USERNAME and REGISTRY_PASSWORD

### "failed to authorize: no basic auth credentials"

**Solution:** Your REGISTRY_URL might be wrong. Don't include `https://`

### "manifest unknown"

**Solution:** This happens on first push. It's normal - images will be created.

## ✨ Success!

Once secrets are set up correctly, every push to `main` will automatically:

1. ✅ Build both Docker images
2. ✅ Run tests (if configured)
3. ✅ Push to your registry
4. ✅ Tag with multiple tags
5. ✅ Trigger Coolify deployment with force rebuild

The workflow will automatically trigger a **force deployment** in Coolify after successfully pushing the images, so your application will be automatically updated! 🎉

## 🚀 Coolify Deployment

The workflow includes an automatic Coolify deployment step that:

- Triggers after successful image push
- Uses force rebuild (`force=true`) to ensure fresh deployment
- Authenticates using your `COOLIFY_API_TOKEN`
- Deploys the resource identified by `COOLIFY_RESOURCE_UUID`

**Note:** Make sure your Coolify resource is configured to pull from the same registry where images are being pushed.

