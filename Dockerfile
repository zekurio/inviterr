FROM golang-1.23:latest

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/ internal/ pkg/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /inviterr

EXPOSE 1765

CMD ["/inviterr", "-c", "/config/config.yaml"]