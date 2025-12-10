#!/bin/bash

# Script to fix Next.js 16 async params in route handlers
# In Next.js 16, params is now a Promise and must be awaited

echo "Fixing Next.js 16 async params in route handlers..."

# Find all route.ts files in app/api
find app/api -name "route.ts" -type f | while read file; do
  echo "Processing: $file"
  
  # Create a backup
  cp "$file" "$file.bak"
  
  # Fix params type from { params: { ... } } to { params: Promise<{ ... }> }
  # and add await when accessing params
  
  # This is a complex transformation that requires careful handling
  # For now, we'll use a simpler approach: just update the type signature
  
  sed -i '' 's/{ params }: { params: { \(.*\) } }/{ params }: { params: Promise<{ \1 }> }/g' "$file"
  
  echo "  Updated type signature in $file"
done

echo "Done! Backups created with .bak extension"
echo "Please review changes and add 'await params' where params is accessed"
