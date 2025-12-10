#!/usr/bin/env python3
"""
Find all route files that use params but don't await it
"""
import re
import sys
from pathlib import Path

def check_file(filepath):
    """Check if file needs fixing"""
    content = Path(filepath).read_text()
    
    # Check if file has Promise<params> in signature
    if 'params: Promise<{' not in content:
        return False
    
    # Check if file already has await params
    if 'await params' in content:
        return False
    
    # Check if params is used (params.id, params.slug, etc)
    if re.search(r'\b(params\.[a-zA-Z]+|userId.*id|courseId.*id)', content):
        return True
    
    return False

if __name__ == '__main__':
    import glob
    
    files_to_fix = []
    for filepath in glob.glob('app/api/**/route.ts', recursive=True):
        if check_file(filepath):
            files_to_fix.append(filepath)
    
    for f in files_to_fix:
        print(f)
