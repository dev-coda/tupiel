#!/bin/bash
# Setup script for initializing git repository

echo "🚀 Setting up Git repository for TuPiel..."

# Check if git is initialized
if [ -d ".git" ]; then
  echo "✅ Git repository already initialized"
else
  echo "📦 Initializing git repository..."
  git init
fi

# Add all files
echo "📝 Adding files to git..."
git add .

# Create initial commit
echo "💾 Creating initial commit..."
git commit -m "Initial commit: TuPiel Reporting System

- Full-stack reporting dashboard
- Multiple report types (Rentabilidad, Estimada, Controlador)
- Database toggle (local/remote)
- Excel export with improved formatting
- Modern UI with PrimeNG and Chart.js"

echo ""
echo "✅ Git repository initialized!"
echo ""
echo "📋 Next steps:"
echo "1. Create a new repository on GitHub/GitLab"
echo "2. Add remote: git remote add origin <repository-url>"
echo "3. Push: git push -u origin main"
echo ""
echo "Or run:"
echo "  git remote add origin <your-repo-url>"
echo "  git branch -M main"
echo "  git push -u origin main"
