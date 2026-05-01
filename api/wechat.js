import crypto from 'crypto';
import axios from 'axios';
import xml2js from 'xml2js';

// 配置
const WECHAT_TOKEN = 'wx123';

// Vercel 官方支持的 POST 读取方式
export default async function handler(req, res) {
  // 1. 微信验证 GET
  if (req.method === 'GET') {
    const { signature, timestamp, nonce, echostr } = req.query;
    const arr = [WECHAT_TOKEN, timestamp, nonce].sort().join('');
    const sha1 = crypto.createHash('sha1').update(arr).digest('hex');

    if (sha1 === signature) {
      console.log("✅ 微信验证成功");
      return res.send(echostr);
    }
    return res.send("验证失败");
  }

  // 2. 微信消息 POST —— Vercel 官方写法！！！
  if (req.method === 'POST') {
    console.log("🟢 收到微信 POST 请求！！！！！"); // <-- 只要发消息，这里必打印
    console.log("内容：", req.body);

    // 解析 XML
    const msg = await xml2js.parseStringPromise(req.body, { explicitArray: false });
    const data = msg.xml;

    // 回复固定文本（先测试通不通）
    const reply = `
<xml>
<ToUserName><![CDATA[${data.FromUserName}]]></ToUserName>
<FromUserName><![CDATA[${data.ToUserName}]]></FromUserName>
<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[🎉 成功收到消息！]]></Content>
</xml>`;

    res.setHeader('Content-Type', 'application/xml');
    return res.send(reply);
  }

  res.status(405).send('Method Not Allowed');
}

// 必须加这个！让 Vercel 把原始 body 传给你！
export const config = {
  api: {
    bodyParser: true,
  },
};
