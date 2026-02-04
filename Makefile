# SNS-AI Makefile
# Usage: make help

.PHONY: help dev build test lint clean docker-build docker-run docker-stop docker-logs k8s-apply k8s-delete

# Default target
help:
	@echo "SNS-AI Development Commands"
	@echo ""
	@echo "Local Development:"
	@echo "  make dev          Start server in development mode"
	@echo "  make build        Build frontend for production"
	@echo "  make test         Run tests (requires server running)"
	@echo "  make lint         Run linter"
	@echo "  make clean        Remove build artifacts"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-build Build Docker image"
	@echo "  make docker-run   Run container (detached)"
	@echo "  make docker-stop  Stop container"
	@echo "  make docker-logs  Show container logs"
	@echo "  make docker-up    Build and run with docker-compose"
	@echo "  make docker-down  Stop docker-compose"
	@echo ""
	@echo "Kubernetes:"
	@echo "  make k8s-apply    Apply k8s manifests"
	@echo "  make k8s-delete   Delete k8s resources"

# Local development
dev:
	npm run server

build:
	npm run build

test:
	npm run test

lint:
	npm run lint

clean:
	rm -rf dist node_modules

# Docker targets
IMAGE_NAME ?= sns-ai
CONTAINER_NAME ?= sns-ai

docker-build:
	docker build -t $(IMAGE_NAME) .

docker-run:
	docker run -d --name $(CONTAINER_NAME) -p 8787:8787 $(IMAGE_NAME)
	@echo "Container started at http://localhost:8787"

docker-stop:
	docker stop $(CONTAINER_NAME) && docker rm $(CONTAINER_NAME)

docker-logs:
	docker logs -f $(CONTAINER_NAME)

docker-up:
	docker compose up --build -d
	@echo "Services started at http://localhost:8787"

docker-down:
	docker compose down

# Kubernetes targets
k8s-apply:
	kubectl apply -f k8s/

k8s-delete:
	kubectl delete -f k8s/

# CI simulation
ci: lint build test
	@echo "CI checks passed!"
