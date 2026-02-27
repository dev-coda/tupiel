#!/bin/bash
# Helper script to push to GitHub

echo "🚀 Pushing TuPiel to GitHub..."
echo ""

# Check if remote exists
if git remote get-url origin > /dev/null 2>&1; then
  echo "✅ Remote 'origin' already configured"
  git remote -v
  echo ""
  read -p "Push to origin? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    git push -u origin main
  fi
else
  echo "📝 No remote configured yet."
  echo ""
  echo "To add a remote and push:"
  echo ""
  echo "1. Create a new repository on GitHub:"
  echo "   - Go to https://github.com/new"
  echo "   - Name it: tupiel-reports (or your choice)"
  echo "   - Don't initialize with README (we already have one)"
  echo ""
  echo "2. Then run:"
  echo "   git remote add origin https://github.com/YOUR_USERNAME/tupiel-reports.git"
  echo "   git branch -M main"
  echo "   git push -u origin main"
  echo ""
  echo "Or if you have the URL ready, paste it here:"
  read -p "GitHub repository URL: " repo_url
  if [ ! -z "$repo_url" ]; then
    git remote add origin "$repo_url"
    git branch -M main
    git push -u origin main
    echo "✅ Pushed to GitHub!"
  fi
fi
