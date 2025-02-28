# Build stage: backend
FROM golang:1.23-alpine AS build-be
WORKDIR /build

COPY cmd cmd
COPY internal internal
COPY pkg pkg
COPY go.mod .
COPY go.sum .

RUN go mod download

RUN go build -o ./bin/inviterr ./cmd/inviterr/main.go

# Runtime stage
FROM alpine:3 AS final
WORKDIR /app

COPY --from=build-be /build/bin/inviterr .

RUN apk add --no-cache ca-certificates

RUN mkdir -p /config

HEALTHCHECK --interval=15s --timeout=10s --start-period=60s --retries=3 \
    CMD curl --fail http://localhost:1765/api/healthcheck || exit 1

# Expose the application port
EXPOSE 1765

# Run the application
ENTRYPOINT ["/app/inviterr"]
CMD ["-c", "/config/config.yaml"]