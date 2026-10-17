# AI 中国象棋 v4

## 两种玩法

### 玩法一：直接玩（纯 JS 引擎，无需安装任何东西）

下载整个文件夹后，双击打开 `index-offline.html` 即可在浏览器中游玩。

使用 XQWLight 纯 JavaScript 引擎，棋力适中，适合日常对弈。

### 玩法二：开启 NNUE 引擎（需要 Python，棋力更强）

使用 Pikafish NNUE 神经网络引擎，棋力远超纯 JS 版本。

**前提条件：** 安装 Python 3（推荐 3.10 以上）

**启动步骤：**

1. 双击 `start-server.bat`（Windows）或运行 `bash start-server.sh`（Linux/Mac）
2. 浏览器打开 `http://localhost:8080`
3. 游戏会自动连接本地 Pikafish 引擎，AI 棋力大幅提升

**手动启动（如果 bat 脚本有问题）：**

```
cd 象棋-v4
python pikafish-bridge.py 8080
```

然后浏览器访问 `http://localhost:8080`

## 文件说明

| 文件 | 用途 |
|------|------|
| `index-offline.html` | 离线版（纯 JS，双击即玩） |
| `index.html` | 在线版（需配合本地服务器使用 NNUE） |
| `pikafish-bridge.py` | Python 桥接服务器，提供静态文件和 AI API |
| `start-server.bat` | Windows 一键启动脚本 |
| `start-server.sh` | Linux/Mac 一键启动脚本 |
| `pikafish-engine/` | Pikafish 引擎可执行文件 + NNUE 模型 |
| `engines/xqwlight/` | 纯 JS 象棋引擎 |

## 引擎说明

- **XQWLight**（纯 JS）：轻量级，无需安装，棋力约业余水平
- **Pikafish + NNUE**（本地服务器）：强力引擎，需要 Python，棋力接近专业水平
- Pikafish 采用 GPL v3 许可证，NNUE 模型采用独立许可证（禁止商用）

## 许可证

本项目采用 [CC BY-NC 4.0](../../../LICENSE) 许可证。
