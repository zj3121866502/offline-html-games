#!/usr/bin/env python3
"""
pikafish-bridge.py -- Pikafish UCI 桥接服务器
同时提供静态文件服务（游戏页面）和 AI 搜索 API。
游戏和 API 同源（同一端口），无需 CORS 配置。

启动方式:
    python pikafish-bridge.py [端口号]
    默认端口 8080

API:
    POST /api/search
    Body: {"fen": "...", "depth": 8, "movetime": 1000, "searchmoves": ["a0a1","b0b1"]}
    Response: {"bestMove": "a0a1", "score": 30, "depth": 12, "nodes": 50000}
"""

import subprocess
import threading
import json
import os
import sys
import socket
import mimetypes
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, unquote

# ===== 配置 =====
HOST = '127.0.0.1'
PIKAFISH_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pikafish-engine')
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))


class PikafishBridge:
    """管理 Pikafish 子进程，通过 UCI 协议通信。"""

    def __init__(self):
        self.process = None
        self.lock = threading.Lock()  # 串行化搜索请求
        self._init_process()

    def _find_exe(self):
        """查找 Pikafish 可执行文件"""
        if sys.platform == 'win32':
            name = 'Pikafish-Windows-x86-64-universal.exe'
        elif sys.platform == 'darwin':
            name = 'Pikafish-MacOS-universal'
        else:
            name = 'Pikafish-Linux-x86-64-universal'
        path = os.path.join(PIKAFISH_DIR, name)
        if not os.path.isfile(path):
            raise FileNotFoundError(f'找不到 Pikafish 引擎: {path}')
        return path

    def _init_process(self):
        """启动 Pikafish 进程并完成 UCI 初始化"""
        exe = self._find_exe()
        nnue = os.path.join(PIKAFISH_DIR, 'pikafish.nnue')

        print(f'[Bridge] 启动 Pikafish...')
        print(f'[Bridge] 引擎: {exe}')
        print(f'[Bridge] NNUE: {nnue} ({os.path.getsize(nnue) / 1048576:.0f} MB)')

        # 以 Pikafish 目录为工作目录启动
        self.process = subprocess.Popen(
            [exe],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            cwd=PIKAFISH_DIR,
            text=True,
            bufsize=1,
            encoding='utf-8',
            errors='replace'
        )

        # 1. UCI 握手
        self._send('uci')
        self._wait_for('uciok', 'UCI 握手')

        # 2. 加载 NNUE 权重
        self._send(f'setoption name EvalFile value {nnue}')

        # 3. 设置线程数和哈希大小
        threads = max(1, (os.cpu_count() or 2) - 1)
        self._send(f'setoption name Threads value {threads}')
        self._send('setoption name Hash value 128')
        print(f'[Bridge] Threads={threads}, Hash=128MB')

        # 4. 等待引擎就绪（NNUE 加载发生在这一步）
        self._send('isready')
        self._wait_for('readyok', '引擎就绪')
        print('[Bridge] Pikafish 初始化完成!')

    def _send(self, cmd):
        """向引擎发送 UCI 命令"""
        self.process.stdin.write(cmd + '\n')
        self.process.stdin.flush()

    def _wait_for(self, target, label=''):
        """读取引擎输出直到遇到目标字符串"""
        while True:
            line = self.process.stdout.readline()
            if not line:
                raise RuntimeError(f'Pikafish 进程意外退出 (等待 {target})')
            line = line.strip()
            if line.endswith(target):
                return
            # 打印引擎信息（调试用）
            if 'NNUE evaluation' in line or 'evaluation using' in line:
                print(f'[Bridge] {line}')

    def search(self, fen, depth=8, movetime=1000, searchmoves=None):
        """
        搜索局面，返回最佳走法。

        参数:
            fen: FEN 字符串
            depth: 最大搜索深度
            movetime: 搜索时间（毫秒）
            searchmoves: 限制搜索的走法列表 (UCI 格式如 ["a0a1", "b0b1"])

        返回:
            dict: {bestMove, score, depth, nodes}
        """
        with self.lock:  # 串行化，同一时刻只有一个搜索
            self._send(f'position fen {fen}')

            # 构建 go 命令
            go_parts = [f'go depth {depth}', f'movetime {movetime}']
            if searchmoves:
                go_parts.append('searchmoves ' + ' '.join(searchmoves))
            self._send(' '.join(go_parts))

            # 解析引擎输出
            best_move = None
            score = 0
            search_depth = 0
            nodes = 0

            while True:
                line = self.process.stdout.readline()
                if not line:
                    raise RuntimeError('Pikafish 进程意外退出 (搜索中)')
                line = line.strip()

                if line.startswith('bestmove'):
                    parts = line.split()
                    if len(parts) >= 2 and parts[1] != '(none)':
                        best_move = parts[1]
                    break

                if ' score ' in line:
                    # 解析 info depth X score cp Y nodes Z ...
                    parts = line.split()
                    try:
                        if 'depth' in parts:
                            d = int(parts[parts.index('depth') + 1])
                            if d > search_depth:
                                search_depth = d
                        if 'cp' in parts:
                            score = int(parts[parts.index('cp') + 1])
                        if 'nodes' in parts:
                            nodes = int(parts[parts.index('nodes') + 1])
                    except (ValueError, IndexError):
                        pass

            return {
                'bestMove': best_move,
                'score': score,
                'depth': search_depth,
                'nodes': nodes
            }

    def quit(self):
        """关闭引擎"""
        if self.process:
            try:
                self._send('quit')
                self.process.wait(timeout=5)
            except Exception:
                self.process.kill()

    def set_threads(self, threads):
        """动态设置引擎线程数"""
        threads = max(1, threads)
        with self.lock:
            self._send(f'setoption name Threads value {threads}')
            self._send('isready')
            self._wait_for('readyok', '线程切换')
        print(f'[Bridge] Threads={threads}')


# ===== HTTP 请求处理 =====

class GameHandler(SimpleHTTPRequestHandler):
    """处理静态文件服务和 Pikafish API 请求。"""

    bridge = None  # 由 start_server() 设置

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=STATIC_DIR, **kwargs)

    def do_OPTIONS(self):
        """CORS 预检"""
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        """静态文件服务"""
        # 根路径重定向到 index.html
        if self.path == '/':
            self.path = '/index.html'
        return super().do_GET()

    def do_POST(self):
        """API 端点"""
        parsed = urlparse(self.path)

        if parsed.path == '/api/search':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length).decode('utf-8')
                data = json.loads(body)

                fen = data.get('fen')
                if not fen:
                    self._json_response({'error': '缺少 fen 参数'}, 400)
                    return

                depth = int(data.get('depth', 8))
                movetime = int(data.get('movetime', 1000))
                searchmoves = data.get('searchmoves')

                result = self.bridge.search(
                    fen, depth=depth, movetime=movetime,
                    searchmoves=searchmoves
                )
                self._json_response(result)

            except json.JSONDecodeError:
                self._json_response({'error': 'JSON 格式错误'}, 400)
            except Exception as e:
                print(f'[Bridge] 搜索错误: {e}')
                self._json_response({'error': str(e)}, 500)

        elif parsed.path == '/api/set-threads':
            try:
                length = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(length).decode('utf-8')
                data = json.loads(body)
                threads = int(data.get('threads', 1))
                threads = max(1, threads)
                self.bridge.set_threads(threads)
                self._json_response({'threads': threads})
            except json.JSONDecodeError:
                self._json_response({'error': 'JSON 格式错误'}, 400)
            except Exception as e:
                print(f'[Bridge] 设置线程错误: {e}')
                self._json_response({'error': str(e)}, 500)

        else:
            self.send_error(404)

    def _cors_headers(self):
        """添加 CORS 头（允许跨域，方便调试）"""
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def _json_response(self, data, status=200):
        """发送 JSON 响应"""
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        """自定义日志格式"""
        msg = format % args
        if '/api/' in (args[0] if args else ''):
            print(f'[Bridge] API: {msg}')
        # 静态文件请求不打印日志，减少刷屏


# ===== 服务器启动 =====

def _port_in_use(port):
    """检测端口是否被占用"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((HOST, port))
            return False
        except OSError:
            return True

def find_free_port(start=8080, end=8099):
    """从 start 到 end 范围内找一个空闲端口"""
    for port in range(start, end + 1):
        if not _port_in_use(port):
            return port
    return None

def start_server(port=8080):
    # 初始化 Pikafish 桥接
    bridge = PikafishBridge()
    GameHandler.bridge = bridge

    # 如果指定端口被占用，自动往后找
    if _port_in_use(port):
        print(f'[Bridge] 端口 {port} 已被占用，正在寻找空闲端口...')
        free = find_free_port(port + 1, port + 20)
        if free is None:
            print(f'[Bridge] 错误: 端口 {port}-{port+20} 全部被占用')
            bridge.quit()
            sys.exit(1)
        print(f'[Bridge] 找到空闲端口: {free}')
        port = free

    server = HTTPServer((HOST, port), GameHandler)
    print()
    print(f'===== Pikafish 桥接服务器 =====')
    print(f'  游戏地址:  http://{HOST}:{port}')
    print(f'  API 地址:  http://{HOST}:{port}/api/search')
    print(f'  按 Ctrl+C 停止服务器')
    print(f'================================')
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n[Bridge] 正在关闭...')
    finally:
        bridge.quit()
        server.server_close()
        print('[Bridge] 服务器已停止')


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    start_server(port)
