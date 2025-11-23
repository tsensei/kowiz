# GitHub Secrets Setup Guide

Quick guide to configure GitHub Actions for automatic Docker image builds.

## 📝 Required Secrets

You need to add **3 secrets** to your GitHub repository.

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

## ✅ Verification

After adding secrets, your repository should show:

```
Settings → Secrets and variables → Actions

Repository secrets (3)
├── REGISTRY_URL         ****************
├── REGISTRY_USERNAME    ****************
└── REGISTRY_PASSWORD    ****************
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
5. ✅ Ready for deployment

You can now deploy using these images in Coolify or any Docker environment! 🎉

