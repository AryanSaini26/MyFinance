FROM golang:1.26-bookworm
WORKDIR /app
COPY services/sync/go.* ./
RUN go mod download
COPY services/sync ./
ENV GOCACHE=/tmp/go-build HOME=/tmp
USER 65532:65532
CMD ["sh", "-ec", "test -n \"$TEST_DATABASE_URL\"; go test -race -count=1 -v ./...; go vet ./...; test -z \"$(gofmt -l .)\""]
