#!/usr/bin/env python3
"""
build-offline.py — 打包成纯离线单 HTML（无 NNUE 依赖，xqwlight 全内联）
用法: python build-offline.py
输出: index-offline.html
"""

import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, 'index-offline.html')


def read(relpath):
    with open(os.path.join(BASE, relpath), 'r', encoding='utf-8') as f:
        return f.read()


def svg_data_uri(name):
    path = os.path.join(BASE, 'xiangqi-pieces', name + '.svg')
    with open(path, 'r', encoding='utf-8') as f:
        svg = f.read()
    svg = re.sub(r'\s+', ' ', svg).strip()
    # # 在 URL 中是片段标识符，必须编码
    svg = svg.replace('#', '%23')
    return 'data:image/svg+xml,' + svg


def build_xqwlight_bundle():
    files = [
        'engines/xqwlight/position.js',
        'engines/xqwlight/search.js',
        'engines/xqwlight/book.js',
        'engines/xqwlight/pst-train.js',
        'engines/xqwlight/book-train.js',
        'engines/xqwlight/apply-train.js',
    ]
    parts = ['// ===== xqwlight engine bundle =====']
    for f in files:
        parts.append(f'// --- {f} ---')
        parts.append(read(f))
    return '\n'.join(parts)


def js_escape_template(s):
    """仅用于放进 JS 模板字面量 `...` 内的字符串"""
    return s.replace('\\', '\\\\').replace('`', '\\`').replace('${', '\\${')


def build_engine_worker_code(xqwlight_bundle):
    code = read('engine-worker.js')
    # 移除 importScripts（已内联）
    code = re.sub(r'^\s*try\s*\{[^}]*importScripts[^}]*\}\s*catch[^}]*\}\s*$', '', code, flags=re.MULTILINE)
    code = re.sub(r"^\s*importScripts\([^)]*\);?\s*$", '', code, flags=re.MULTILINE)
    return xqwlight_bundle + '\n\n// ===== engine-worker =====\n' + code


def build_game_worker_code(xqwlight_bundle, engine_worker_code):
    code = read('worker.js')
    # 移除 importScripts（已内联）
    code = re.sub(r'^\s*try\s*\{[^}]*importScripts[^}]*\}\s*catch[^}]*\}\s*$', '', code, flags=re.MULTILINE)
    code = re.sub(r"^\s*importScripts\([^)]*\);?\s*$", '', code, flags=re.MULTILINE)

    # 替换 engine-worker 创建方式：文件路径 → Blob URL
    engine_escaped = js_escape_template(engine_worker_code)
    code = code.replace(
        "const w = new Worker('./engine-worker.js');",
        "const w = new Worker(URL.createObjectURL(new Blob([`" + engine_escaped + "`]), { type: 'application/javascript' }));"
    )

    return xqwlight_bundle + '\n\n// ===== game worker =====\n' + code


def build_script_js():
    code = read('script.js')

    # 1) pieceSrc 改用 data URI
    code = code.replace(
        "function pieceSrc(id) {\n  return 'xiangqi-pieces/' + PIECE_FILE[id] + '.svg';\n}",
        "function pieceSrc(id) {\n  return __PIECE_DATA_URIS__[id] || '';\n}"
    )

    # 2) Worker 创建改用 Blob URL（file:// 下也能用）
    code = code.replace(
        "worker = new Worker('worker.js');",
        "worker = new Worker(URL.createObjectURL(new Blob([__GAME_WORKER_CODE__]), { type: 'application/javascript' }));"
    )

    return code


def extract_body(html):
    body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL)
    if not body_match:
        raise ValueError('Cannot find <body> in index.html')
    body = body_match.group(1)
    body = re.sub(r'<script[^>]*>.*?</script>', '', body, flags=re.DOTALL)
    body = re.sub(r'<link[^>]*>', '', body)
    return body.strip()


def main():
    print('[Build] 读取源文件...')
    html = read('index.html')
    css = read('style.css')
    xqwlight = build_xqwlight_bundle()

    print('[Build] 构建 engine-worker 代码...')
    engine_worker_code = build_engine_worker_code(xqwlight)

    print('[Build] 构建 game-worker 代码...')
    game_worker_code = build_game_worker_code(xqwlight, engine_worker_code)

    print('[Build] 修改 script.js...')
    script = build_script_js()

    print('[Build] 转换 SVG 图片...')
    piece_ids = [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16, 17]
    piece_file_names = {
        1: 'red_king', 2: 'red_advisor', 3: 'red_elephant', 4: 'red_horse',
        5: 'red_chariot', 6: 'red_cannon', 7: 'red_pawn',
        11: 'black_king', 12: 'black_advisor', 13: 'black_elephant', 14: 'black_horse',
        15: 'black_chariot', 16: 'black_cannon', 17: 'black_pawn'
    }
    data_uris = {}
    for pid in piece_ids:
        data_uris[pid] = svg_data_uri(piece_file_names[pid])
        print(f'  {piece_file_names[pid]}.svg -> data URI ({len(data_uris[pid])} chars)')

    print('[Build] 组装单 HTML 文件...')

    # CSS 在 <style> 标签内，不需要转义
    # script 在 <script> 标签内，不需要转义（上次 bug 的修复点）
    # 只有 game_worker_code 在模板字面量 `...` 内，需要转义
    css_out = css
    script_out = script
    worker_escaped = js_escape_template(game_worker_code)

    uri_entries = []
    for pid in piece_ids:
        uri_entries.append(f'  {pid}: `{data_uris[pid]}`')
    uri_object = ',\n'.join(uri_entries)

    output = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI中国象棋（离线版）</title>
  <style>
{css_out}
  </style>
</head>
<body>

{extract_body(html)}

<script>
// ===== 内嵌资源 =====
const __PIECE_DATA_URIS__ = {{
{uri_object}
}};

const __GAME_WORKER_CODE__ = `{worker_escaped}`;

// ===== 游戏逻辑 =====
{script_out}
</script>
</body>
</html>'''

    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(output)

    size_mb = os.path.getsize(OUT) / 1048576
    print(f'[Build] 完成! 输出: {OUT}')
    print(f'[Build] 文件大小: {size_mb:.2f} MB')
    print()
    print('说明:')
    print('  - 纯离线，双击即可玩（Blob URL Worker 不受 file:// 限制）')
    print('  - AI 引擎: xqwlight（纯 JS，无 NNUE）')
    print('  - Pikafish 桥接代码保留，有服务器时自动升级')


if __name__ == '__main__':
    main()
