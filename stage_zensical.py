#!/usr/bin/env python3
"""Make a source-locked, non-production Zensical Pages subtree.

Preserves the existing homepage. Only /zensical is new. No custom domain or
MATH-PROGRAMME production output is changed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import yaml

STAGING_URL = 'https://grandchallenge.ai/gcl-public-web-preview/zensical/'
SENTINELS = (
    'index.html', 'erdos/catalogue/index.html',
    'erdos/problems/0001/index.html', 'erdos/problems/1221/index.html',
    'oai26/catalogue/index.html', 'oai26/families/001/index.html',
    'CMDG_CM4/index.html', 'documentaries/bsd/index.html',
)

def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

def stage(root: Path, source: Path, expected_sha: str) -> dict:
    root = root.resolve()
    source = source.resolve()
    actual = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
    if actual != expected_sha:
        raise RuntimeError(f'source head mismatch: {actual} != {expected_sha}')
    report_path = source / 'zensical-parity-report.json'
    report = json.loads(report_path.read_text())
    if report.get('source_head') != expected_sha or not report.get('critical_parity'):
        raise RuntimeError('source-locked static parity not green at expected head')
    canonical = source / '.zensical-probe-site'
    if not canonical.is_dir():
        raise RuntimeError('unverified Zensical site missing')
    conf_path = source / 'zensical-probe.yml'
    conf = yaml.safe_load(conf_path.read_text(encoding='utf-8'))
    if conf.get('site_url') != 'https://grandchallenge.ai/MATH-PROGRAMME/':
        raise RuntimeError('production site URL inventory unexpectedly changed')
    if (source / '.zensical-preview-site').exists():
        raise RuntimeError('staging build path already exists')
    conf['site_url'] = STAGING_URL
    conf['site_dir'] = '.zensical-preview-site'
    # Staging-only accessibility repair: Zensical 0.1.1 renders search as a
    # native button, whose default dark text is nearly invisible in the GCL
    # navy header. Do not change the production renderer or source Markdown.
    css_rel = 'stylesheets/zensical-staging-search.css'
    css = source / '.zensical-probe-docs' / css_rel
    if css.exists():
        raise RuntimeError('staging search override unexpectedly exists')
    css.write_text(
        '/* Zensical staging: search trigger contrast and visible focus. */\n'
        '.md-header .md-search__button { '
        'color: #f8fafc !important; background: #17283e !important; '
        'border: 1px solid #e7bd60 !important; }\n'
        '.md-header .md-search__button:hover { '
        'background: #263950 !important; color: #ffffff !important; }\n'
        '.md-header .md-search__button:focus-visible { '
        'outline: 3px solid #ffe09a !important; outline-offset: 3px !important; }\n'
        '.md-header .md-search__button svg { color: #f8fafc !important; }\n',
        encoding='utf-8')
    prior_css = conf.get('extra_css', [])
    if not isinstance(prior_css, list):
        raise RuntimeError('staging extra_css list malformed')
    conf['extra_css'] = [*prior_css, css_rel]
    staging_conf = source / 'zensical-preview.yml'
    if staging_conf.exists():
        raise RuntimeError('staging config already exists')
    staging_conf.write_text(yaml.safe_dump(conf, sort_keys=False, allow_unicode=True))
    subprocess.run(['zensical', 'build', '--config-file', str(staging_conf), '--clean'], cwd=source, check=True)
    candidate = source / '.zensical-preview-site'
    normal = {p.relative_to(canonical).as_posix() for p in canonical.rglob('*.html')}
    preview = {p.relative_to(candidate).as_posix() for p in candidate.rglob('*.html')}
    if normal != preview or len(preview) != 1852:
        raise RuntimeError(f'route change in staging rewrite: {len(normal)} vs {len(preview)}')
    for route in SENTINELS:
        if not (candidate / route).is_file():
            raise RuntimeError('missing staging route: ' + route)
    if not (candidate / 'search.json').is_file():
        raise RuntimeError('staging search missing')
    home = (candidate / 'index.html').read_text(encoding='utf-8')
    if '/gcl-public-web-preview/zensical/' not in home:
        raise RuntimeError('staging base path missing from generated homepage')
    if 'zensical-staging-search.css' not in home:
        raise RuntimeError('staging search contrast override missing from generated HTML')
    if not (candidate / css_rel).is_file():
        raise RuntimeError('staging search contrast override missing from output')
    # Keep existing public preview homepage and its assets exactly as they are.
    dest = root / '.pages-output'
    if dest.exists():
        raise RuntimeError('refusing to reuse an existing Pages staging directory')
    dest.mkdir()
    shutil.copy2(root / 'index.html', dest / 'index.html')
    shutil.copy2(root / '.nojekyll', dest / '.nojekyll')
    shutil.copytree(root / 'assets', dest / 'assets')
    from scripts.public_console import build as build_public_console
    build_public_console(root, dest / 'assets' / 'operations')
    shutil.copytree(candidate, dest / 'zensical')
    if digest(dest / 'index.html') != digest(root / 'index.html'):
        raise RuntimeError('preview homepage changed during packaging')
    if (dest / 'CNAME').exists() or (dest / 'zensical' / 'CNAME').exists():
        raise RuntimeError('custom domain must not be installed')
    proof = {
        'schema': 'GCL_ZENSICAL_STAGING_DEPLOYMENT/1',
        'source_repository': 'grandchallenge/MATH-PROGRAMME',
        'exact_source_sha': expected_sha,
        'static_parity_report_sha256': digest(report_path),
        'canonical_source_html_routes': len(normal),
        'staged_html_routes': len(preview),
        'staging_url': STAGING_URL,
        'production_renderer_switched': False,
        'preview_root_preserved_sha256': digest(root / 'index.html'),
        'staged_home_sha256': digest(dest / 'zensical' / 'index.html'),
        'staged_search_sha256': digest(dest / 'zensical' / 'search.json'),
    }
    (dest / 'zensical-staging-receipt.json').write_text(json.dumps(proof, indent=2) + '\n')
    return proof

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--source', type=Path, required=True)
    p.add_argument('--source-sha', required=True)
    args = p.parse_args()
    print(json.dumps(stage(Path.cwd(), args.source, args.source_sha), indent=2))
