#!/bin/sh
# Сертификат для `npm run dev:https` — чтобы открыть сайт с iPhone по https (нужно для камеры).
# iPhone требует: в сертификате адрес, по которому заходят (IP Mac в сети), и отметку serverAuth,
# срок не больше 825 дней. Пересоздаём, если IP Mac поменялся. Пароль администратора не нужен.
set -e
DIR=certificates
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || hostname -I 2>/dev/null | awk '{print $1}' || true)
mkdir -p "$DIR"
if [ -f "$DIR/dev-cert.pem" ] && [ -n "$IP" ] && openssl x509 -in "$DIR/dev-cert.pem" -noout -text | grep -q "IP Address:$IP"; then
  echo "Сертификат для https://$IP:3000 уже есть"
  exit 0
fi
SAN="DNS:localhost,IP:127.0.0.1"
[ -n "$IP" ] && SAN="$SAN,IP:$IP"
openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 825 \
  -keyout "$DIR/dev-key.pem" -out "$DIR/dev-cert.pem" \
  -subj "/CN=mcrm-dev" \
  -addext "subjectAltName=$SAN" \
  -addext "extendedKeyUsage=serverAuth" \
  -addext "keyUsage=digitalSignature,keyEncipherment" \
  -addext "basicConstraints=critical,CA:FALSE" 2>/dev/null
echo "Создан сертификат для https://${IP:-localhost}:3000"
