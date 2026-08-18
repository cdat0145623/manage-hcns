# Local Docker image names produced by `make build`
LOCAL_WEB ?= kanbn-web
LOCAL_MIGRATE ?= kanbn-migrate
LOCAL_SCHEDULER ?= kanbn-scheduler

# GitHub Container Registry (override if needed)
REGISTRY ?= ghcr.io/zomzem-audepartment
IMAGE_WEB ?= $(REGISTRY)/kanbn-web
IMAGE_MIGRATE ?= $(REGISTRY)/kanbn-migrate
IMAGE_SCHEDULER ?= $(REGISTRY)/kanbn-scheduler

TAG ?= latest

.PHONY: build push deploy

## Build app images (migrate + web + scheduler)
build:
	docker compose build web migrate
	docker build --file apps/web/Dockerfile --target scheduler --tag $(LOCAL_SCHEDULER):latest .

## Tag and push images to GitHub Container Registry (requires: docker login ghcr.io)
## Run `make build` first so all three local images exist.
## Example: make push TAG=v1.2.3
push:
	docker tag $(LOCAL_WEB):latest $(IMAGE_WEB):$(TAG)
	docker tag $(LOCAL_MIGRATE):latest $(IMAGE_MIGRATE):$(TAG)
	docker tag $(LOCAL_SCHEDULER):latest $(IMAGE_SCHEDULER):$(TAG)
	docker push $(IMAGE_WEB):$(TAG)
	docker push $(IMAGE_MIGRATE):$(TAG)
	docker push $(IMAGE_SCHEDULER):$(TAG)

## Pull tagged images and start stack from ./deploy (uses deploy/.env)
## Example: make deploy TAG=v1.2.3
deploy:
	cd deploy && \
		TAG="$(TAG)" \
		WEB_IMAGE="$(IMAGE_WEB)" \
		MIGRATE_IMAGE="$(IMAGE_MIGRATE)" \
		SCHEDULER_IMAGE="$(IMAGE_SCHEDULER)" \
		docker compose pull && docker compose up -d
