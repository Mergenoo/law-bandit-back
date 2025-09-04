#!/bin/bash

# Google Calendar Integration Setup Script
# This script helps set up the Google Calendar integration for Law Bandit

echo "🚀 Setting up Google Calendar Integration for Law Bandit Backend"
echo "================================================================"

# Check if .env file exists
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp env.example .env
    echo "✅ .env file created. Please update it with your credentials."
else
    echo "✅ .env file already exists."
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo "✅ Dependencies installed."
else
    echo "✅ Dependencies already installed."
fi

# Check required environment variables
echo ""
echo "🔍 Checking required environment variables..."

required_vars=(
    "GOOGLE_CLIENT_ID"
    "GOOGLE_CLIENT_SECRET"
    "GOOGLE_REDIRECT_URI"
    "SUPABASE_URL"
    "SUPABASE_SERVICE_ROLE_KEY"
)

missing_vars=()

for var in "${required_vars[@]}"; do
    if ! grep -q "^${var}=" .env; then
        missing_vars+=("$var")
    fi
done

if [ ${#missing_vars[@]} -eq 0 ]; then
    echo "✅ All required environment variables are set."
else
    echo "⚠️  Missing environment variables:"
    for var in "${missing_vars[@]}"; do
        echo "   - $var"
    done
    echo ""
    echo "Please update your .env file with the missing variables."
fi

echo ""
echo "📋 Next steps:"
echo "1. Set up Google Cloud Console project"
echo "2. Enable Google Calendar API"
echo "3. Create OAuth 2.0 credentials"
echo "4. Update .env file with your credentials"
echo "5. Run database migration: migrations/001_google_calendar_tables.sql"
echo "6. Start the server: npm run dev"
echo ""
echo "📚 For detailed instructions, see README.md"
echo ""
echo "🎉 Setup complete!"
