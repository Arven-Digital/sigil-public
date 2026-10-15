"""Fail-closed independent Next/sharp floors over every tracked lock root."""
from pathlib import Path
import re
import subprocess
import sys

def check_pnpm(text):
    failures = []
    # Match resolved package/snapshot keys, not importer specifiers. Scan both
    # sections so optional packages and peer-qualified resolutions cannot hide.
    sections = re.findall(r'(?ms)^(?:packages|snapshots):\n(.*?)(?=^\S|\Z)', text)
    if not sections:
        return ['Missing resolved packages/snapshots section']
    text = '\n'.join(sections)
    for name, version in re.findall(r"(?m)^  ['\"]?(next|sharp)@([^\s:'\"]+)[ '\"]*:", text):
        version = version.split('(')[0]
        match = re.fullmatch(r"(\d+)\.(\d+)\.(\d+)", version)
        nums = tuple(map(int, match.groups())) if match else ()
        safe = False
        if nums:
            if name == 'next':
                safe = (nums[0] == 15 and nums >= (15, 5, 28)) or (nums[0] == 16 and nums >= (16, 4, 1))
            else:
                safe = nums >= (0, 35, 5)
        if not safe:
            failures.append(f'{name}@{version}: below policy floor or unsupported version')
    return failures

def locks():
    files = subprocess.check_output(['git', 'ls-files', '-z'], text=True).split('\0')
    names = {'pnpm-lock.yaml', 'package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'bun.lock', 'bun.lockb'}
    result = [Path(p) for p in files if p and Path(p).name in names]
    if not result:
        raise RuntimeError('No tracked lockfiles found')
    unsupported = [str(p) for p in result if p.name != 'pnpm-lock.yaml']
    if unsupported:
        raise RuntimeError('Unsupported lock format; add a tested parser before accepting: ' + ', '.join(unsupported))
    return result

def main():
    roots = locks()
    failures = []
    for path in roots:
        failures += [f'{path}: {error}' for error in check_pnpm(path.read_text())]
        print(f'Scanned {path}', flush=True)
    if failures:
        raise RuntimeError('\n'.join(failures))
    if '--install-audit' in sys.argv:
        for path in roots:
            subprocess.run(['corepack', 'pnpm', 'install', '--frozen-lockfile'], cwd=path.parent, check=True)
            subprocess.run(['corepack', 'pnpm', 'audit'], cwd=path.parent, check=True)
    print('Security floors PASS', flush=True)
if __name__ == '__main__':
    main()
