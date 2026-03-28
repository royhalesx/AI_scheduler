FROM golang:1.18-alpine AS builder

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o byu-scheduler ./...

FROM alpine:3.19

# Required for outbound TLS (Groq + Voyage API calls)
RUN apk add --no-cache ca-certificates

WORKDIR /app
COPY --from=builder /build/byu-scheduler .
COPY prompts/ prompts/

# Bundle data as defaults — copied to volume on first boot if volume is empty
COPY data/courses.json defaults/courses.json
COPY data/rmp.json defaults/rmp.json

COPY start.sh .
RUN chmod +x start.sh

ENV GIN_MODE=release

EXPOSE 8000
CMD ["./start.sh"]
