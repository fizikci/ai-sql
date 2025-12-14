# Publishing SQL Client to VS Code Marketplace

## Prerequisites

✅ Extension is working and tested
✅ VSCE installed globally (`npm install -g @vscode/vsce`)

## Step-by-Step Publishing Guide

### 1. Create a Microsoft Account (if you don't have one)
- Go to: https://login.live.com
- Sign up for a Microsoft account

### 2. Create an Azure DevOps Organization
- Go to: https://dev.azure.com
- Sign in with your Microsoft account
- Click "Create new organization"
- Choose a name (e.g., "your-name-extensions")

### 3. Create a Personal Access Token (PAT)
- In Azure DevOps, click on your profile icon (top right)
- Go to **Personal access tokens**
- Click **+ New Token**
- Settings:
  - **Name**: "VS Code Marketplace"
  - **Organization**: Select your organization
  - **Expiration**: Choose duration (e.g., 90 days, 1 year, or custom)
  - **Scopes**: Select "Custom defined"
  - Check: **Marketplace** → **Manage** (this gives all marketplace permissions)
- Click **Create**
- **IMPORTANT**: Copy the token immediately! You won't see it again.

### 4. Create a Publisher
- Go to: https://marketplace.visualstudio.com/manage
- Sign in with your Microsoft account
- Click **Create Publisher**
- Fill in:
  - **ID**: Unique identifier (e.g., "bulentkeskin" or "your-company-name")
    - This will be your publisher ID in package.json
    - Must be lowercase, no spaces
  - **Name**: Display name
  - **Email**: Your contact email
- Click **Create**

### 5. Update package.json

Update these fields in your `package.json`:

```json
{
  "name": "sql-client",
  "displayName": "SQL Client",
  "publisher": "YOUR-PUBLISHER-ID",  // Change this to your actual publisher ID
  "repository": {
    "type": "git",
    "url": "https://github.com/YOUR-USERNAME/sql-client.git"  // Optional but recommended
  },
  "icon": "resources/icon.png",  // Optional: Add a 128x128 PNG icon
  "license": "MIT"
}
```

### 6. Add an Icon (Optional but Recommended)

Create a 128x128 PNG icon and save it as `resources/icon.png`. This will appear in the marketplace.

### 7. Clean Up Debug Code

Before publishing, remove console.log statements:

**Files to clean:**
- `src/connectors/MSSQLConnector.ts` - Remove debug logs
- `src/providers/SqlExplorerProvider.ts` - Remove debug logs
- `src/commands/CommandHandler.ts` - Remove debug logs

Or you can publish as-is for the first version (they won't hurt).

### 8. Package the Extension

```bash
# Make sure you're in the project directory
cd /Users/bulentkeskin/Development/ai-sql

# Package the extension
vsce package
```

This creates a `.vsix` file (e.g., `sql-client-0.0.1.vsix`).

### 9. Test the VSIX Locally (Optional)

Before publishing, test the packaged extension:

```bash
# Install the VSIX in VS Code
code --install-extension sql-client-0.0.1.vsix
```

### 10. Publish to Marketplace

**Option A: Using Command Line (Recommended)**

```bash
# Login with your PAT
vsce login YOUR-PUBLISHER-ID

# When prompted, paste your Personal Access Token

# Publish the extension
vsce publish
```

**Option B: Manual Upload**

1. Go to: https://marketplace.visualstudio.com/manage
2. Select your publisher
3. Click **+ New Extension** → **Visual Studio Code**
4. Upload your `.vsix` file
5. Click **Upload**

### 11. Update Version for Future Releases

When you make changes and want to publish updates:

```bash
# Update version in package.json (e.g., 0.0.1 -> 0.0.2)
# Then publish with version bump
vsce publish patch   # 0.0.1 -> 0.0.2
# or
vsce publish minor   # 0.0.1 -> 0.1.0
# or
vsce publish major   # 0.0.1 -> 1.0.0
```

## Quick Reference Commands

```bash
# Package only (creates .vsix)
vsce package

# Login to publisher account
vsce login YOUR-PUBLISHER-ID

# Publish to marketplace
vsce publish

# Publish with version bump
vsce publish patch    # Bug fixes
vsce publish minor    # New features
vsce publish major    # Breaking changes

# Unpublish (be careful!)
vsce unpublish YOUR-PUBLISHER-ID.sql-client
```

## What Happens After Publishing?

1. **Review Process**: Microsoft reviews your extension (usually takes a few hours to 1-2 days)
2. **Live on Marketplace**: Once approved, it's searchable and installable
3. **Installation**: Users can install via:
   - VS Code Extensions view (search "SQL Client")
   - Command: `code --install-extension YOUR-PUBLISHER-ID.sql-client`
   - Marketplace website

## Before Publishing - Checklist

- [ ] Remove or comment out debug `console.log` statements
- [ ] Update `publisher` in package.json
- [ ] Update `repository` URL (if you have a GitHub repo)
- [ ] Add an icon (128x128 PNG)
- [ ] Test the extension thoroughly
- [ ] Update README.md with clear instructions
- [ ] Update version number if needed
- [ ] Verify CHANGELOG.md is up to date
- [ ] Check .vscodeignore excludes unnecessary files

## Marketplace Page Information

Your marketplace page will show:
- **Display Name**: "SQL Client"
- **Description**: From package.json
- **README**: Content from README.md
- **Changelog**: From CHANGELOG.md
- **Icon**: Your icon.png
- **License**: From LICENSE file
- **Repository**: Link to your GitHub repo

## Tips for Success

1. **Good README**: Clear documentation helps users understand your extension
2. **Screenshots**: Add screenshots to README.md showing the extension in action
3. **Keywords**: Update keywords in package.json for better search results
4. **Version Control**: Use git and push to GitHub
5. **Respond to Issues**: Monitor marketplace reviews and GitHub issues

## Cost

Publishing to VS Code Marketplace is **FREE**! 🎉

## Links

- **Marketplace Management**: https://marketplace.visualstudio.com/manage
- **Azure DevOps**: https://dev.azure.com
- **Publishing Guide**: https://code.visualstudio.com/api/working-with-extensions/publishing-extension
- **Extension Guidelines**: https://code.visualstudio.com/api/references/extension-guidelines

---

**Ready to publish your first VS Code extension? Good luck! 🚀**
