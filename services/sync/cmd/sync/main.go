package main

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	_ "github.com/lib/pq"
	"log"
	"myfinance/sync/internal/syncer"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"syscall"
	"time"
)

func main() {
	key, err := syncer.ParseKey(os.Getenv("TOKEN_ENCRYPTION_KEY"))
	if err != nil {
		log.Fatal(err)
	}
	secret := os.Getenv("SYNC_SERVICE_SECRET")
	if len(secret) < 32 {
		log.Fatal("SYNC_SERVICE_SECRET must have at least 32 characters")
	}
	database, err := sql.Open("postgres", os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatal("database configuration failed")
	}
	defer database.Close()
	database.SetMaxOpenConns(10)
	database.SetConnMaxLifetime(5 * time.Minute)
	var provider syncer.Provider
	switch os.Getenv("PLAID_MODE") {
	case "mock":
		provider = syncer.Mock{}
	case "sandbox":
		if os.Getenv("PLAID_ENV") != "sandbox" || os.Getenv("PLAID_CLIENT_ID") == "" || os.Getenv("PLAID_SECRET") == "" {
			log.Fatal("Plaid Sandbox configuration missing")
		}
		provider = syncer.NewSandboxClient(os.Getenv("PLAID_CLIENT_ID"), os.Getenv("PLAID_SECRET"))
	default:
		log.Fatal("PLAID_MODE must be mock or sandbox")
	}
	service := &syncer.Service{DB: database, Provider: provider, Key: key}
	mux := http.NewServeMux()
	uuid := regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		if database.PingContext(ctx) != nil {
			http.Error(w, "database unavailable", 503)
			return
		}
		w.Write([]byte("ok"))
	})
	mux.HandleFunc("POST /sync", func(w http.ResponseWriter, r *http.Request) {
		if subtle.ConstantTimeCompare([]byte(r.Header.Get("Authorization")), []byte("Bearer "+secret)) != 1 {
			http.Error(w, "unauthorized", 401)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		defer r.Body.Close()
		var input struct {
			Item string `json:"item_id"`
			User string `json:"user_id"`
		}
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if decoder.Decode(&input) != nil || !uuid.MatchString(input.Item) || !uuid.MatchString(input.User) {
			http.Error(w, "invalid input", 400)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()
		result, err := service.Sync(ctx, input.Item, input.User)
		if err != nil {
			status := 502
			if errors.Is(err, syncer.ErrBusy) {
				status = 409
			}
			if errors.Is(err, syncer.ErrNotFound) {
				status = 404
			}
			http.Error(w, "sync failed", status)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(result)
	})
	address := os.Getenv("SYNC_LISTEN_ADDR")
	if address == "" {
		address = ":8080"
	}
	srv := &http.Server{Addr: address, Handler: mux, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 95 * time.Second, IdleTimeout: 60 * time.Second}
	go func() {
		log.Print("sync service listening")
		if e := srv.ListenAndServe(); e != nil && e != http.ErrServerClosed {
			log.Fatal("sync server failed")
		}
	}()
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGTERM, syscall.SIGINT)
	<-stop
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	srv.Shutdown(ctx)
}
