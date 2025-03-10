#!/bin/bash

# export PATH="$PATH:/Applications/Visual Studio Code.app/Contents/Resources/app/bin"



echo "🔨 Building the extension..."
npm run compile

echo "📦 Packaging the VSIX file..."
npm run package  # or `npx vsce package` if you don’t have a package script


vsce package

