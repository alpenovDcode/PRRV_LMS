#!/usr/bin/env python3
"""
Fix files that have 'id: id' pattern - add missing await params
"""
import re
import sys
from pathlib import Path

def fix_file(filepath):
    content = Path(filepath).read_text()
    original = content
    
    # Find all function definitions with Promise<params>
    # and add await params if missing
    
    def add_await_if_missing(match):
        func_start = match.start()
        func_body_start = content.find('async (req) => {', func_start)
        if func_body_start == -1:
            func_body_start = content.find('async () => {', func_start)
        
        if func_body_start == -1:
            return match.group(0)
        
        try_start = content.find('try {', func_body_start)
        if try_start == -1:
            return match.group(0)
        
        # Check if await params already exists
        check_region = content[try_start:try_start+200]
        if 'await params' in check_region:
            return match.group(0)
        
        # Extract param names from the Promise type
        param_match = re.search(r'params: Promise<\{([^}]+)\}>', match.group(0))
        if not param_match:
            return match.group(0)
        
        param_str = param_match.group(1)
        param_names = []
        for param in param_str.split(','):
            name = param.split(':')[0].strip()
            param_names.append(name)
        
        params_destructure = ', '.join(param_names)
        
        # Insert await params after try {
        try_end = content.find('\n', try_start)
        before = content[:try_end + 1]
        after = content[try_end + 1:]
        
        return before + f'        const {{ {params_destructure} }} = await params;\n' + after[len(match.group(0)) - len(before):]
    
    # Find all withAuth calls and add await params
    pattern = r'return withAuth\([^)]+\),[^{]+\{[^}]+try \{'
    
    # Simpler approach: just find functions and add await params after try {
    lines = content.split('\n')
    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        new_lines.append(line)
        
        # If we see "async (req) => {" or "async () => {" followed by "try {"
        if ('async (req) =>' in line or 'async () =>' in line) and i + 1 < len(lines):
            next_line = lines[i + 1]
            if 'try {' in next_line:
                # Check if await params is missing
                if i + 2 < len(lines) and 'await params' not in lines[i + 2]:
                    # Add await params
                    new_lines.append('        const { id } = await params;')
        
        i += 1
    
    content = '\n'.join(new_lines)
    
    if content != original:
        Path(filepath).write_text(content)
        return True
    return False

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: fix-missing-await.py <file1> [file2] ...")
        sys.exit(1)
    
    for filepath in sys.argv[1:]:
        if fix_file(filepath):
            print(f"✓ Fixed: {filepath}")
        else:
            print(f"- Skipped: {filepath}")
