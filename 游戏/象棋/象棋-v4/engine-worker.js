/**
 * engine-worker.js — 并行搜索引擎 Worker
 * 每个实例独立加载 xqwlight，搜索分配到的根走法子集。
 *
 * 通信协议 (postMessage):
 *   收到: { type:'search', fen:string, rootMoves:number[], depth:number, millis:number }
 *   发出: { type:'result', mv:number, score:number, depth:number, nodes:number, millis:number }
 *   发出: { type:'ready' }
 */

'use strict';

// 加载 xqwlight 引擎（路径相对于项目根目录）
try {
  importScripts('./engines/xqwlight/position.js', './engines/xqwlight/search.js', './engines/xqwlight/book.js');
} catch (e) { /* book.js 可能加载失败，不影响核心功能 */ }
try {
  importScripts('./engines/xqwlight/pst-train.js', './engines/xqwlight/book-train.js', './engines/xqwlight/apply-train.js');
} catch (e) {}

self.onmessage = function (e) {
  var msg = e.data;
  if (msg.type !== 'search') return;

  var fen = msg.fen;
  var rootMoves = msg.rootMoves || null;
  var depth = msg.depth || 64;
  var millis = msg.millis || 1000;

  try {
    var pos = new Position();
    pos.fromFen(fen);

    var hashLevel = 16;
    try {
      if (/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) hashLevel = 12;
    } catch (_) {}

    var search = new Search(pos, hashLevel);
    search._rootMoves = rootMoves;

    var mv = search.searchMainNoBook(depth, millis);

    self.postMessage({
      type: 'result',
      mv: mv || 0,
      score: search.lastScore || 0,
      depth: depth,
      nodes: search.allNodes || 0,
      millis: search.allMillis || 1
    });
  } catch (err) {
    self.postMessage({
      type: 'result',
      mv: 0,
      score: 0,
      depth: 0,
      nodes: 0,
      millis: 1,
      error: err.message
    });
  }
};

self.postMessage({ type: 'ready' });
