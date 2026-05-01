const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const xml2js = require('xml2js');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// 初始化 Express
const app = express();
const upload = multer({ dest: '/tmp/' }); // Vercel 临时文件目录

// ===================== 配置项 =====================
// 微信公众号测试号的 Token 和 AppID
const WECHAT_TOKEN = 'wx123'; // 自定义一个字符串
const WECHAT_APPID = 'wxf1600c0b1c95bcbc';
// trace.moe 官方API
const TRACEMOE_API = 'https://api.trace.moe/search';
// ==================================================

// 解析微信 XML 消息
const parseXML = (xml) => {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xml, { explicitArray: false }, (err, result) => {
      if (err) reject(err);
      else resolve(result.xml);
    });
  });
};

// 生成微信回复 XML
const buildReply = (toUser, fromUser, content) => {
  return `
  <xml>
    <ToUserName><![CDATA[${toUser}]]></ToUserName>
    <FromUserName><![CDATA[${fromUser}]]></FromUserName>
    <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
    <MsgType><![CDATA[text]]></MsgType>
    <Content><![CDATA[${content}]]></Content>
  </xml>
  `;
};

// 微信服务器验证（GET 请求）
app.get('/api/wechat', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  // 加密验证
  const arr = [WECHAT_TOKEN, timestamp, nonce].sort();
  const str = arr.join('');
  const sha1 = crypto.createHash('sha1').update(str).digest('hex');
  
  if (sha1 === signature) res.send(echostr);
  else res.send('验证失败');
});

// 接收微信消息（POST 请求，处理图片）
app.post('/api/wechat', upload.single('media'), async (req, res) => {
  try {
    // 1. 解析微信消息
    const xmlData = req.body.raw || req.read().toString();
    const msg = await parseXML(xmlData);
    const toUser = msg.ToUserName;   // 公众号ID
    const fromUser = msg.FromUserName; // 用户OPENID
    const msgType = msg.MsgType;

    // 只处理图片消息
    if (msgType !== 'image') {
      const reply = buildReply(fromUser, toUser, '请发送图片哦！');
      return res.send(reply);
    }

    // 2. 获取用户发送的图片URL
    const picUrl = msg.PicUrl;
    console.log('收到图片：', picUrl);

    // 3. 调用 trace.moe API 搜番
    const traceRes = await axios.get(TRACEMOE_API, {
      params: { url: picUrl }
    });

    // 4. 解析搜番结果
    const result = traceRes.data.result[0];
    if (!result) {
      const reply = buildReply(fromUser, toUser, '未找到匹配的番剧');
      return res.send(reply);
    }

    // 格式化结果
    const anilist = result.anilist;
    const replyText = `
✅ 搜番结果：
📺 番名：${anilist.title.native || anilist.title.romaji}
🎬 集数：第${result.episode}集
⏱️ 时间：${formatTime(result.from)} - ${formatTime(result.to)}
🎯 相似度：${(result.similarity * 100).toFixed(2)}%
    `.trim();

    // 5. 回复微信用户
    const replyXml = buildReply(fromUser, toUser, replyText);
    res.setHeader('Content-Type', 'application/xml');
    res.send(replyXml);

  } catch (err) {
    console.error('错误：', err);
    const reply = buildReply(req.body.FromUserName, req.body.ToUserName, '搜番失败，请重试');
    res.send(reply);
  }
});

// 格式化时间（秒 → 分:秒）
function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

module.exports = app;
