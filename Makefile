# Docker images (local names after build — must match root docker-compose.yml)
LOCAL_WEB ?= kanbn-web
LOCAL_MIGRATE ?= kanbn-migrate

# GitHub Container Registry (override if needed)
REGISTRY ?= ghcr.io/zomzem-audepartment
IMAGE_WEB ?= $(REGISTRY)/kanbn-web
IMAGE_MIGRATE ?= $(REGISTRY)/kanbn-migrate

TAG ?= latest

.PHONY: build push deploy

## Build app images (migrate + web) using root docker-compose.yml
build:
	docker compose build web migrate

## Tag and push images to GitHub Container Registry (requires: docker login ghcr.io)
## Run `make build` first so kanbn-web / kanbn-migrate:latest exist locally.
## Example: make push TAG=v1.2.3
push:
	docker tag $(LOCAL_WEB):latest $(IMAGE_WEB):$(TAG)
	docker tag $(LOCAL_MIGRATE):latest $(IMAGE_MIGRATE):$(TAG)
	docker push $(IMAGE_WEB):$(TAG)
	docker push $(IMAGE_MIGRATE):$(TAG)

## Pull tagged images and start stack from ./deploy (uses deploy/.env)
## Example: make deploy TAG=v1.2.3
deploy:
	cd deploy && \
		TAG="$(TAG)" \
		WEB_IMAGE="$(IMAGE_WEB)" \
		MIGRATE_IMAGE="$(IMAGE_MIGRATE)" \
		docker compose pull && docker compose up -d
