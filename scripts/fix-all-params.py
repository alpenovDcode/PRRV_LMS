#!/usr/bin/env python3
"""
Comprehensive fix for all route handlers with missing await params
"""
import re
from pathlib import Path
import glob

def fix_route_file(filepath):
    """Fix a route file by adding await params where needed"""
    content = Path(filepath).read_text()
    original = content
    
    # Skip if already has await params
    if 'await params' in content:
        return False
    
    # Skip if doesn't have Promise<params>
    if 'params: Promise<{' not in content:
        return False
    
    # Find all function definitions with Promise params
    functions = re.finditer(
        r'(export async function (GET|POST|PATCH|DELETE|PUT)\([^)]*params[^)]*\) \{[^}]*?try \{)',
        content,
        re.DOTALL
    )
    
    for match in functions:
        func_text = match.group(0)
        # Check if this function uses params but doesn't await it
        if 'await params' not in func_text:
            # Extract param names from signature
            param_match = re.search(r'params: Promise<\{([^}]+)\}>', func_text)
            if param_match:
                param_str = param_match.group(1)
                param_names = []
                for param in param_str.split(','):
                    name = param.split(':')[0].strip()
                    param_names.append(name)
                
                params_destructure = ', '.join(param_names)
                
                # Find the position after 'try {' to insert await params
                try_pos = func_text.rfind('try {')
                if try_pos != -1:
                    # Insert await params after try {
                    insert_text = f'\n    const {{ {params_destructure} }} = await params;'
                    
                    # Find this exact match in content and replace
                    match_start = content.find(func_text)
                    if match_start != -1:
                        match_end = match_start + len(func_text)
                        before = content[:match_start]
                        after = content[match_end:]
                        
                        # Insert after try {
                        func_parts = func_text.split('try {', 1)
                        if len(func_parts) == 2:
                            new_func = func_parts[0] + 'try {' + insert_text + '\n' + func_parts[1]
                            content = before + new_func + after
    
    if content != original:
        Path(filepath).write_text(content)
        return True
    return False

if __name__ == '__main__':
    fixed_files = []
    for filepath in glob.glob('app/api/**/route.ts', recursive=True):
        if fix_route_file(filepath):
            fixed_files.append(filepath)
            print(f"✓ Fixed: {filepath}")
    
    if not fixed_files:
        print("No files needed fixing")
    else:
        print(f"\nTotal fixed: {len(fixed_files)} files")
