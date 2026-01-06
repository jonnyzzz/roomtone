#!/usr/bin/env bash
set -euo pipefail

NETWORK_NAME="roomtone-it-$(date +%s)"
SERVER_IMAGE="roomtone-it-server:local"
CLIENT_IMAGE="roomtone-it-client:local"
SERVER_NAME="roomtone-it-server-${NETWORK_NAME}"
CLIENT_A_NAME="roomtone-it-client-a-${NETWORK_NAME}"
CLIENT_B_NAME="roomtone-it-client-b-${NETWORK_NAME}"
ROOMTONE_URL="http://${SERVER_NAME}:5670"
ROOMTONE_TIMEOUT_MS="${ROOMTONE_TIMEOUT_MS:-45000}"

cleanup() {
  docker rm -f "${CLIENT_A_NAME}" "${CLIENT_B_NAME}" "${SERVER_NAME}" >/dev/null 2>&1 || true
  docker network rm "${NETWORK_NAME}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

echo "Building server image..."
docker build -t "${SERVER_IMAGE}" .

echo "Building client image..."
docker build -t "${CLIENT_IMAGE}" -f tests/docker/Dockerfile.client .

echo "Creating internal Docker network..."
docker network create --internal "${NETWORK_NAME}" >/dev/null

echo "Starting server container..."
docker run -d \
  --name "${SERVER_NAME}" \
  --network "${NETWORK_NAME}" \
  -e PORT=5670 \
  -e ALLOW_INSECURE_HTTP=true \
  -e MEDIA_TRANSPORT=ws \
  "${SERVER_IMAGE}" >/dev/null

echo "Waiting for server health..."
SERVER_READY=false
for _ in $(seq 1 30); do
  if docker exec "${SERVER_NAME}" node -e "fetch('http://localhost:5670/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    SERVER_READY=true
    break
  fi
  sleep 1
done

if [[ "${SERVER_READY}" != "true" ]]; then
  echo "Server did not become healthy."
  docker logs "${SERVER_NAME}" || true
  exit 1
fi

echo "Verifying server has no internet access..."
docker exec "${SERVER_NAME}" node -e "const ac=new AbortController();setTimeout(()=>ac.abort(),1500);fetch('https://example.com',{signal:ac.signal}).then(()=>{console.error('internet access');process.exit(1);}).catch(err=>{if(err&&err.message&&err.message.includes('internet access')){process.exit(1);}process.exit(0);});" >/dev/null 2>&1

echo "Starting client containers..."
docker run --name "${CLIENT_A_NAME}" --network "${NETWORK_NAME}" \
  -e ROOMTONE_URL="${ROOMTONE_URL}" \
  -e ROOMTONE_NAME="Client A" \
  -e ROOMTONE_TIMEOUT_MS="${ROOMTONE_TIMEOUT_MS}" \
  "${CLIENT_IMAGE}" &
CLIENT_A_PID=$!

docker run --name "${CLIENT_B_NAME}" --network "${NETWORK_NAME}" \
  -e ROOMTONE_URL="${ROOMTONE_URL}" \
  -e ROOMTONE_NAME="Client B" \
  -e ROOMTONE_TIMEOUT_MS="${ROOMTONE_TIMEOUT_MS}" \
  "${CLIENT_IMAGE}" &
CLIENT_B_PID=$!

CLIENT_A_STATUS=0
CLIENT_B_STATUS=0
wait "${CLIENT_A_PID}" || CLIENT_A_STATUS=$?
wait "${CLIENT_B_PID}" || CLIENT_B_STATUS=$?

if [[ "${CLIENT_A_STATUS}" -ne 0 || "${CLIENT_B_STATUS}" -ne 0 ]]; then
  echo "Client test failed. A=${CLIENT_A_STATUS} B=${CLIENT_B_STATUS}"
  docker logs "${SERVER_NAME}" || true
  exit 1
fi

echo "Docker offline media test passed."
