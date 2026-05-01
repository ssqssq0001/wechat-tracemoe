const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const xml2js = require('xml2js');

const app = express();

// ===================== 配置项 =====================
const WECHAT_TOKEN = 'wx123';
const WECHAT_APPID = 'wxf1600c0b1c95bcbc';
const TRACEMOE_API = 'https://api.trace.moe/search';
// ==================================================

// 关键修复：微信验证用 GET，不能用 multer
app.get('/api/wechat', (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  const arr = [WECHAT_TOKEN, timestamp, nonce].sort();
  const str = arr.join('');
  const sha1 = crypto.createHash('sha1').update(str).digest('hex');
  
  if (sha1 === signature) {
    return res.send(echostr);
  } else {
    return res.status(403).send('验证失败');
  }
});

// 关键修复：用 express.xml() 解析，不用 multer 处理微信消息
app.post('/api/wechat', express.text({ type: 'application/xml' }), async (req, res) => {
  try {
    const xmlData = req.body;
    const msg = await new Promise((resolve, reject) => {
      xml2js.parseString(xmlData, { explicitArray: false }, (err, result) => {
        if (err) reject(err);
        else resolve(result.xml);
      });
    });

    const toUser = msg.ToUserName;
    const fromUser = msg.FromUserName;
    const msgType = msg.MsgType;

    if (msgType !== 'image') {
      const reply = buildReply(fromUser, toUser, '请发送图片哦！');
      return res.type('xml').send(reply);
    }

    const picUrl = msg.PicUrl;
    console.log('收到图片URL:', picUrl);

    const traceRes = await axios.get(TRACEMOE_API, { params: { url: picUrl } });
    const result = traceRes.data.result[0];

    if (!result) {
      const reply = buildReply(fromUser, toUser, '未找到匹配的番剧');
      return res.type('xml').send(reply);
    }

    const anilist = result.anilist;
    const replyText = `
✅ 搜番结果：
📺 番名：${anilist.title.native || anilist.title.romaji}
🎬 集数：第${result.episode}集
⏱️ 时间：${formatTime(result.from)} - ${formatTime(result.to)}
🎯 相似度：${(result.similarity * 100).toFixed(2)}%
    `.trim();

    const replyXml = buildReply(fromUser, toUser, replyText);
    res.type('xml').send(replyXml);

  } catch (err) {
    console.error('处理消息出错:', err);
    const reply = buildReply(req.body.FromUserName, req.body.ToUserName, '搜番失败，请重试');
    res.type('xml').send(reply);
  }
});

function buildReply(toUser, fromUser, content) {
  return `
  <xml>
    <ToUserName><![CDATA[${toUser}]]></ToUserName>
    <FromUserName><![CDATA[${fromUser}]]></FromUserName>
    <CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
    <MsgType><![CDATA[text]]></MsgType>
    <Content><![CDATA[${content}]]></Content>
  </xml>
  `;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

module.exports = app;
