FROM golang:1.26-bookworm AS build
WORKDIR /app
COPY services/sync/go.* ./
RUN go mod download
COPY services/sync .
RUN CGO_ENABLED=0 go build -trimpath -o /sync ./cmd/sync
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /sync /sync
EXPOSE 8080
ENTRYPOINT ["/sync"]
