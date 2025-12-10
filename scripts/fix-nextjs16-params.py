#!/usr/bin/env python3
"""
Script to fix Next.js 16 async params in route handlers
"""
import re
import sys
from pathlib import Path

def fix_route_file(filepath):
    """Fix a single route file"""
    content = Path(filepath).read_text()
    original = content
    
    # Step 1: Fix type signatures - change { params: { ... } } to { params: Promise<{ ... }> }
    content = re.sub(
        r'(\{ params \}: \{ params: )(?!Promise<)(\{[^}]+\})',
        r'\1Promise<\2>',
        content
    )
    
    # Step 2: Find all functions that need await params
    # Look for patterns like: async (req) => { try {
    # and add: const { id } = await params; (or other param names)
    
    def add_await_params(match):
        # Extract the function signature to find param names
        # Look backwards from match position to find the params type
        before_match = content[:match.start()]
        param_match = re.search(r'params: Promise<\{([^}]+)\}>', before_match[-200:])
        
        if param_match:
            # Extract parameter names (e.g., "id: string" -> "id")
            param_str = param_match.group(1)
            param_names = []
            for param in param_str.split(','):
                name = param.split(':')[0].strip()
                param_names.append(name)
            
            params_destructure = ', '.join(param_names)
            # Check if await params already exists
            after_match = content[match.end():match.end()+100]
            if 'await params' not in after_match:
                return match.group(0) + f'const {{ {params_destructure} }} = await params;\n        '
        
        return match.group(0)
    
    content = re.sub(
        r'(async \(req\) => \{\s+try \{\s+)',
        add_await_params,
        content
    )
    
    # Step 3: Replace params.id with id (and other param names)
    # But be careful not to replace in type signatures
    def replace_params_usage(match):
        # Don't replace if it's in a type signature
        line_start = content.rfind('\n', 0, match.start())
        line = content[line_start:match.end()]
        if 'params:' in line or 'Promise<' in line:
            return match.group(0)
        return match.group(1)
    
    content = re.sub(r'params\.([a-zA-Z]+)', replace_params_usage, content)
    
    if content != original:
        Path(filepath).write_text(content)
        return True
    return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: fix-nextjs16-params.py <file1> [file2] ...")
        sys.exit(1)
    
    for filepath in sys.argv[1:]:
        if fix_route_file(filepath):
            print(f"✓ Fixed: {filepath}")
        else:
            print(f"- Skipped: {filepath} (no changes needed)")
