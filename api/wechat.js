const crypto = require('crypto');
const axios = require('axios');
const xml2js = require('xml2js');

// ===================== 配置项 =====================
const WECHAT_TOKEN = 'wx123';
const WECHAT_APPID = 'wxf1600c0b1c95bcbc';
const TRACEMOE_API = 'https://api.trace.moe/search';
// ==================================================

module.exports = async (req, res) => {
  // 微信验证 GET 请求
  if (req.method === 'GET') {
    const { signature, timestamp, nonce, echostr } = req.query;
    const arr = [WECHAT_TOKEN, timestamp, nonce].sort();
    const tmpStr = arr.join('');
    const sha1 = crypto.createHash('sha1').update(tmpStr).digest('hex');

    if (sha1 === signature) {
      console.log('✅ 微信验证通过！');
      return res.status(200).send(echostr);
    } else {
      console.log('❌ 微信验证失败！');
      return res.status(403).send('验证失败');
    }
  }

  // 接收微信消息 POST 请求
  if (req.method === 'POST') {
    try {
      console.log('🟢 收到微信POST请求！！！');
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
        const reply = buildReply(fromUser, toUser, '请发送动漫截图哦！');
        res.setHeader('Content-Type', 'application/xml');
        return res.status(200).send(reply);
      }

      const picUrl = msg.PicUrl;
      console.log('收到图片URL:', picUrl);
      const traceRes = await axios.get(TRACEMOE_API, { params: { url: picUrl } });
      const result = traceRes.data.result[0];

      if (!result) {
        const reply = buildReply(fromUser, toUser, '未找到匹配的番剧');
        res.setHeader('Content-Type', 'application/xml');
        return res.status(200).send(reply);
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
      res.setHeader('Content-Type', 'application/xml');
      return res.status(200).send(replyXml);

    } catch (err) {
      console.error('处理消息出错:', err);
      const reply = buildReply('gh_1665b5cb7630', req.body.FromUserName, '搜番失败，请重试');
      res.setHeader('Content-Type', 'application/xml');
      return res.status(200).send(reply);
    }
  }
};

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
