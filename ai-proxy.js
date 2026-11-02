#!/usr/bin/env node
/*
  任课教师工作台 · 本地 AI 转发小工具（可选，用不到可以不管）

  什么时候需要：
    设置 → AI 接口 →「测试连接」提示连不上，而 Key 和接口地址都没填错。
    这通常是服务商不允许网页直接调用（浏览器的跨域限制），用它在你自己的电脑上转发一下就好。

  怎么用：
    1. 安装 Node.js 18 或更新版本（https://nodejs.org ，下载 LTS 版一路下一步）
    2. 在本文件所在的文件夹打开命令行，运行：node ai-proxy.js
    3. 在工作台 设置 → AI 接口 → 接口地址 的最前面加上 http://127.0.0.1:8787/
       例如原来是 https://api.deepseek.com ，改成 http://127.0.0.1:8787/https://api.deepseek.com
    4. 用的时候保持命令行窗口开着；关掉窗口就停止转发

  安全说明：
    只在本机 127.0.0.1 上监听，别的电脑访问不到；
    不保存、不打印你的 API Key 和对话内容；没有任何第三方依赖。

  Developed by @赛博老爸
*/
'use strict';
const http = require('http');
const https = require('https');

const PORT = Number(process.env.PORT) || 8787;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400'
};
// 这些请求头不转发：浏览器自动带的、和本机转发有关的
const DROP_REQ = /^(host|origin|referer|cookie|connection|accept-encoding|sec-.*)$/i;
// 上游返回的这些头由本工具重新设置
const DROP_RES = /^(access-control-.*|connection|transfer-encoding)$/i;

function fail(res, code, msg) {
  if (!res.headersSent) res.writeHead(code, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, CORS));
  res.end(msg);
}

const server = http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }

  // 请求路径就是真正的接口地址：/https://api.deepseek.com/chat/completions
  const target = decodeURIComponent(req.url.slice(1)).replace(/^(https?):\/(?!\/)/, '$1://');
  let url = null;
  try { url = new URL(target); } catch (e) { url = null; }
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    fail(res, 400, '本地 AI 转发正在运行。\n用法：把工作台里的接口地址改成 http://127.0.0.1:' + PORT + '/ 加原来的地址，\n例如 http://127.0.0.1:' + PORT + '/https://api.deepseek.com');
    return;
  }

  const headers = {};
  Object.keys(req.headers).forEach(function (k) { if (!DROP_REQ.test(k)) headers[k] = req.headers[k]; });

  const lib = url.protocol === 'https:' ? https : http;
  const upstream = lib.request(url, { method: req.method, headers: headers }, function (up) {
    const out = {};
    Object.keys(up.headers).forEach(function (k) { if (!DROP_RES.test(k)) out[k] = up.headers[k]; });
    res.writeHead(up.statusCode || 502, Object.assign(out, CORS));
    up.pipe(res); // 原样流式返回，生成过程中就能看到字一个个出来
  });
  upstream.setTimeout(180000, function () { upstream.destroy(new Error('等待超时')); });
  upstream.on('error', function (e) { fail(res, 502, '转发失败：' + e.message + '\n请检查网络，或确认接口地址是否正确。'); });
  req.on('aborted', function () { upstream.destroy(); }); // 工作台里点了「停止」
  req.pipe(upstream);
});

server.on('error', function (e) {
  if (e.code === 'EADDRINUSE') console.error('端口 ' + PORT + ' 被占用了。可以先关掉之前开的窗口，或换个端口：PORT=8788 node ai-proxy.js');
  else console.error(e.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', function () {
  console.log('');
  console.log('  本地 AI 转发已启动：http://127.0.0.1:' + PORT + '/');
  console.log('  在工作台 设置 → AI 接口 → 接口地址 前面加上这个地址，例如：');
  console.log('  http://127.0.0.1:' + PORT + '/https://api.deepseek.com');
  console.log('');
  console.log('  使用期间请不要关闭这个窗口。按 Ctrl + C 停止。');
  console.log('');
});
