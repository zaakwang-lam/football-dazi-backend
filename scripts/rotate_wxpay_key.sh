#!/usr/bin/env bash
# 微信支付 APIv2 密钥轮换（密钥从 stdin 读，不进 argv、不进日志）
# 用法: cat newkey.txt | bash scripts/rotate_wxpay_key.sh
# 流程: 校验 -> 备份根 .env -> 改根 .env -> rebuild+force-recreate backend -> 容器内校验 -> 签名探测
set -euo pipefail
cd "$(dirname "$0")/.."

NEW_KEY=$(cat)
NEW_KEY=$(printf '%s' "$NEW_KEY" | tr -d '\r\n"'"'"' ')
LEN=${#NEW_KEY}
if [ "$LEN" -ne 32 ]; then echo "❌ 密钥长度错误: $LEN (应为 32)"; exit 1; fi

TS=$(date +%Y%m%d_%H%M)
cp -p .env ".env.bak.rotate_${TS}"
echo "✅ 已备份 .env.bak.rotate_${TS}"

python3 - "$NEW_KEY" <<'PY'
import re, sys
key = sys.argv[1]
p = ".env"
s = open(p, encoding="utf-8").read()
if re.search(r"^WX_PAY_KEY=.*$", s, re.M):
    s = re.sub(r"^WX_PAY_KEY=.*$", "WX_PAY_KEY=" + key, s, count=1, flags=re.M)
else:
    s = s.rstrip("\n") + "\nWX_PAY_KEY=" + key + "\n"
open(p, "w", encoding="utf-8").write(s)
print("✅ 根 .env 已更新 WX_PAY_KEY (32 位)")
PY
unset NEW_KEY

docker compose build --no-cache backend >/dev/null
docker compose up -d --force-recreate backend >/dev/null
echo "✅ backend 已 rebuild + force-recreate"
sleep 8

docker exec football-backend sh -c 'echo "容器内: len=${#WX_PAY_KEY} head=$(echo $WX_PAY_KEY | cut -c1-6) tail=$(echo $WX_PAY_KEY | rev | cut -c1-4 | rev)"'
bash scripts/check_wxpay_key.sh
