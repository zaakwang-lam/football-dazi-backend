#!/usr/bin/env bash
# 微信支付 APIv2 密钥有效性自检（不打印明文密钥）
# 用法: bash scripts/check_wxpay_key.sh [-v]
# 退出码: 0=签名被接受(密钥有效) 1=签名错误(密钥无效/已作废) 2=探测失败
set -uo pipefail
cd "$(dirname "$0")/.."
VERBOSE="${1:-}"
OUT=$(docker exec football-backend node -e '
const axios=require("axios");
const {sign,objToXml}=require("/app/src/utils/wechat-sign.js");
const cfg=require("/app/src/config");
(async()=>{
  const p={appid:cfg.wechat.appid,mch_id:cfg.wechat.mchid,nonce_str:Math.random().toString(36).slice(2,18),out_trade_no:"KEYPROBE"+Date.now()};
  p.sign=sign(p);
  const r=await axios.post("https://api.mch.weixin.qq.com/pay/orderquery",objToXml(p),{headers:{"Content-Type":"application/xml"},responseType:"text",timeout:15000});
  const rc=(r.data.match(/<return_code><!\[CDATA\[(.*?)\]\]>/)||[])[1]||"";
  const rm=(r.data.match(/<return_msg><!\[CDATA\[(.*?)\]\]>/)||[])[1]||"";
  const ec=(r.data.match(/<err_code><!\[CDATA\[(.*?)\]\]>/)||[])[1]||"";
  console.log("rc="+rc+" rm="+rm+" ec="+ec);
})().catch(e=>{console.log("EXC="+e.message);process.exit(9);});' 2>&1 | tail -1)

echo "=== 容器内密钥指纹（不打印明文） ==="
docker exec football-backend sh -c 'echo "len=${#WX_PAY_KEY} head=$(echo $WX_PAY_KEY | cut -c1-6) tail=$(echo $WX_PAY_KEY | rev | cut -c1-4 | rev)"'

echo "=== 微信签名探测结果 ==="
echo "$OUT"
case "$OUT" in
  *"rc=SUCCESS"*)
    if echo "$OUT" | grep -q "rm=签名错误"; then
      echo "❌ 密钥已失效/被作废（微信返回签名错误）"; exit 1
    else
      echo "✅ 密钥当前有效（微信签名已通过，订单不存在属正常）"; exit 0
    fi ;;
  *"EXC="*|*"rm="*"SIGN_ERROR"*)
    echo "❌ 密钥已失效/被作废或探测异常"; exit 1 ;;
  *) echo "⚠️ 探测异常，无法判定: $OUT"; exit 2 ;;
esac
