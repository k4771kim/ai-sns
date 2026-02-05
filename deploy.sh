#!/bin/bash
set -e

#######################################
# AI-SNS 배포 스크립트 (단순 버전)
#######################################

NAMESPACE="ai-sns"
RELEASE_NAME="ai-sns"
TAG="latest"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# 삭제 모드
if [ "$1" = "uninstall" ]; then
    log "Helm 릴리스 삭제 중..."
    helm uninstall ${RELEASE_NAME} -n ${NAMESPACE} 2>/dev/null || echo "릴리스 없음"
    kubectl delete namespace ${NAMESPACE} 2>/dev/null || echo "네임스페이스 없음"
    success "삭제 완료!"
    exit 0
fi

# 프로젝트 디렉토리 확인
[ ! -f "Dockerfile.backend" ] && error "프로젝트 루트에서 실행하세요"

echo ""
echo -e "${BLUE}=== AI-SNS 배포 시작 ===${NC}"
echo ""

# 1. Docker 이미지 빌드
log "Backend 이미지 빌드..."
sudo docker build -f Dockerfile.backend -t ai-sns-backend:${TAG} .

log "Frontend 이미지 빌드..."
sudo docker build -f Dockerfile.frontend -t ai-sns-frontend:${TAG} .

success "Docker 빌드 완료"

# 2. containerd로 이미지 import (K8s용)
log "containerd로 이미지 import..."
sudo docker save ai-sns-backend:${TAG} | sudo ctr -n k8s.io images import -
sudo docker save ai-sns-frontend:${TAG} | sudo ctr -n k8s.io images import -

success "containerd import 완료"

# 3. 네임스페이스 생성
log "네임스페이스 생성: ${NAMESPACE}"
kubectl create namespace ${NAMESPACE} 2>/dev/null || true

# 4. HPA 정리 (충돌 방지)
log "HPA 정리..."
kubectl delete hpa --all -n ${NAMESPACE} 2>/dev/null || true

# 5. Helm 배포 (프로덕션 설정)
log "Helm 배포 중..."
helm upgrade --install ${RELEASE_NAME} ./helm/ai-sns \
    --namespace ${NAMESPACE} \
    -f ./helm/ai-sns/values-production.yaml \
    --set backend.image.tag=${TAG} \
    --set frontend.image.tag=${TAG}

echo ""
success "배포 완료!"
echo ""

# 6. 상태 확인
log "Pod 상태:"
kubectl get pods -n ${NAMESPACE}

echo ""
log "접속 URL:"
echo "  https://ai-chat.hdhub.app (Frontend)"
echo "  https://ai-chat-api.hdhub.app (Backend API)"
echo ""
echo "삭제하려면: ./deploy.sh uninstall"
