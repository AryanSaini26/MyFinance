package syncer

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	_ "github.com/lib/pq"
	"os"
	"strings"
	"testing"
	"time"
)

func integrationDB(t *testing.T) *sql.DB {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		if os.Getenv("REQUIRE_INTEGRATION_TESTS") == "1" {
			t.Fatal("TEST_DATABASE_URL is required; refusing to skip integration tests")
		}
		t.Skip("TEST_DATABASE_URL not set: PostgreSQL integration test")
	}
	db, err := sql.Open("postgres", url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if _, err = db.Exec(`TRUNCATE users,auth_attempts CASCADE`); err != nil {
		t.Fatal(err)
	}
	return db
}
func encryptTest(t *testing.T, key []byte, token string) string {
	t.Helper()
	block, _ := aes.NewCipher(key)
	gcm, _ := cipher.NewGCM(block)
	nonce := make([]byte, 12)
	if _, err := rand.Read(nonce); err != nil {
		t.Fatal(err)
	}
	return base64.StdEncoding.EncodeToString(append(nonce, gcm.Seal(nil, nonce, []byte(token), nil)...))
}
func fixture(t *testing.T, db *sql.DB) (string, string, []byte) {
	t.Helper()
	key := []byte(strings.Repeat("a", 32))
	var user, item string
	if err := db.QueryRow(`INSERT INTO users(email,password_hash) VALUES('go@example.test','test-only') RETURNING id`).Scan(&user); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`INSERT INTO plaid_items(user_id,plaid_item_id,institution_name,access_token_encrypted) VALUES($1,'test-plaid-item','test',$2) RETURNING id`, user, encryptTest(t, key, "test-access")).Scan(&item); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO sync_state(item_id,cursor) VALUES($1,'persisted')`, item); err != nil {
		t.Fatal(err)
	}
	return user, item, key
}
func account() Account {
	a := Account{ID: "a", Name: "Checking", Type: "depository"}
	a.Balances.Currency = "CAD"
	return a
}
func txEntry(id, amount string) Transaction {
	return Transaction{ID: id, AccountID: "a", Description: "coffee cafe", Amount: json.Number(amount), Currency: "CAD", Date: "2026-01-02"}
}
func state(t *testing.T, db *sql.DB, item string) (string, int) {
	t.Helper()
	var cursor string
	var count int
	if err := db.QueryRow(`SELECT cursor FROM sync_state WHERE item_id=$1`, item).Scan(&cursor); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(`SELECT count(*) FROM transactions WHERE item_id=$1`, item).Scan(&count); err != nil {
		t.Fatal(err)
	}
	return cursor, count
}
func TestIntegrationAtomicPaginationAndIdempotency(t *testing.T) {
	db := integrationDB(t)
	user, item, key := fixture(t, db)
	p := &fake{fn: func(c string, n int) (Page, error) {
		if c == "persisted" {
			return Page{Accounts: []Account{account()}, Added: []Transaction{txEntry("t1", "5.25")}, HasMore: true, NextCursor: "page2"}, nil
		}
		return Page{Added: []Transaction{txEntry("t2", "10")}, NextCursor: "done"}, nil
	}}
	s := Service{DB: db, Provider: p, Key: key, Pause: noWait}
	r, err := s.Sync(context.Background(), item, user)
	if err != nil || r.Pages != 2 {
		t.Fatalf("sync failed %v", err)
	}
	cursor, count := state(t, db, item)
	if cursor != "done" || count != 2 {
		t.Fatal("wrong durable state")
	}
	p.fn = func(string, int) (Page, error) {
		return Page{Accounts: []Account{account()}, Added: []Transaction{txEntry("t1", "5.25"), txEntry("t2", "10")}, NextCursor: "done"}, nil
	}
	if _, err = s.Sync(context.Background(), item, user); err != nil {
		t.Fatal(err)
	}
	_, count = state(t, db, item)
	if count != 2 {
		t.Fatal("duplicate transactions")
	}
	var amount string
	db.QueryRow(`SELECT amount::text FROM transactions WHERE plaid_transaction_id='t1'`).Scan(&amount)
	if amount != "-5.25" {
		t.Fatal("amount sign or precision wrong")
	}
}
func TestIntegrationModifiedRemovedAndOverride(t *testing.T) {
	db := integrationDB(t)
	user, item, key := fixture(t, db)
	p := &fake{fn: func(string, int) (Page, error) {
		return Page{Accounts: []Account{account()}, Added: []Transaction{txEntry("t1", "5"), txEntry("t2", "10")}, NextCursor: "one"}, nil
	}}
	s := Service{DB: db, Provider: p, Key: key}
	if _, err := s.Sync(context.Background(), item, user); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`UPDATE transactions SET category_override_id='shopping' WHERE plaid_transaction_id='t1'`); err != nil {
		t.Fatal(err)
	}
	p.fn = func(string, int) (Page, error) {
		return Page{Modified: []Transaction{txEntry("t1", "7.50")}, Removed: []Removed{{ID: "t2"}}, NextCursor: "two"}, nil
	}
	if _, err := s.Sync(context.Background(), item, user); err != nil {
		t.Fatal(err)
	}
	var amount, override string
	var removed bool
	db.QueryRow(`SELECT amount::text,category_override_id FROM transactions WHERE plaid_transaction_id='t1'`).Scan(&amount, &override)
	db.QueryRow(`SELECT removed_at IS NOT NULL FROM transactions WHERE plaid_transaction_id='t2'`).Scan(&removed)
	if amount != "-7.50" || override != "shopping" || !removed {
		t.Fatal("modified/removed semantics failed")
	}
}
func TestIntegrationRollbackOnPersistenceFailure(t *testing.T) {
	db := integrationDB(t)
	user, item, key := fixture(t, db)
	bad := txEntry("bad", "5")
	bad.Description = strings.Repeat("x", 301)
	p := &fake{fn: func(string, int) (Page, error) {
		return Page{Accounts: []Account{account()}, Added: []Transaction{txEntry("good", "2"), bad}, NextCursor: "must-not-commit"}, nil
	}}
	s := Service{DB: db, Provider: p, Key: key}
	if _, err := s.Sync(context.Background(), item, user); err == nil {
		t.Fatal("constraint failure ignored")
	}
	cursor, count := state(t, db, item)
	if cursor != "persisted" || count != 0 {
		t.Fatal("partial changes committed")
	}
	var n int
	db.QueryRow(`SELECT count(*) FROM accounts`).Scan(&n)
	if n != 0 {
		t.Fatal("account upsert was not rolled back")
	}
}
func TestIntegrationMissingAccountAndNetworkFailure(t *testing.T) {
	db := integrationDB(t)
	user, item, key := fixture(t, db)
	p := &fake{fn: func(string, int) (Page, error) {
		return Page{Added: []Transaction{txEntry("t1", "5")}, NextCursor: "bad"}, nil
	}}
	s := Service{DB: db, Provider: p, Key: key, Pause: noWait}
	if _, err := s.Sync(context.Background(), item, user); err == nil {
		t.Fatal("missing account silently lost")
	}
	p.fn = func(c string, n int) (Page, error) {
		if c == "persisted" {
			return Page{Accounts: []Account{account()}, Added: []Transaction{txEntry("t1", "5")}, HasMore: true, NextCursor: "page2"}, nil
		}
		return Page{}, &APIError{Code: "NETWORK", Retryable: true}
	}
	if _, err := s.Sync(context.Background(), item, user); err == nil {
		t.Fatal("network failure ignored")
	}
	cursor, count := state(t, db, item)
	if cursor != "persisted" || count != 0 {
		t.Fatal("failed fetch advanced state")
	}
}
func TestIntegrationConcurrencyAndAuthorization(t *testing.T) {
	db := integrationDB(t)
	user, item, key := fixture(t, db)
	entered := make(chan bool)
	release := make(chan bool)
	p := &fake{fn: func(string, int) (Page, error) { entered <- true; <-release; return Page{NextCursor: "done"}, nil }}
	s := Service{DB: db, Provider: p, Key: key}
	finished := make(chan error)
	go func() { _, err := s.Sync(context.Background(), item, user); finished <- err }()
	select {
	case <-entered:
	case <-time.After(3 * time.Second):
		t.Fatal("first sync did not lock")
	}
	if _, err := s.Sync(context.Background(), item, user); !errors.Is(err, ErrBusy) {
		t.Fatalf("concurrent sync was not rejected: %v", err)
	}
	release <- true
	if err := <-finished; err != nil {
		t.Fatal(err)
	}
	if _, err := s.Sync(context.Background(), item, "00000000-0000-0000-0000-000000000000"); !errors.Is(err, ErrNotFound) {
		t.Fatal("cross-user sync accepted")
	}
	if _, err := db.Exec(`UPDATE plaid_items SET status='disconnected',access_token_encrypted=NULL WHERE id=$1`, item); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Sync(context.Background(), item, user); !errors.Is(err, ErrNotFound) {
		t.Fatal("disconnected sync accepted")
	}
}
func TestIntegrationMutationDiscardsEarlierPages(t *testing.T) {
	db := integrationDB(t)
	user, item, key := fixture(t, db)
	p := &fake{fn: func(c string, n int) (Page, error) {
		switch n {
		case 1:
			return Page{Accounts: []Account{account()}, Added: []Transaction{txEntry("discard", "5")}, HasMore: true, NextCursor: "mutated"}, nil
		case 2:
			return Page{}, &APIError{Code: MutationCode}
		default:
			return Page{Accounts: []Account{account()}, Added: []Transaction{txEntry("keep", "5")}, NextCursor: "done"}, nil
		}
	}}
	s := Service{DB: db, Provider: p, Key: key, Pause: noWait}
	if _, err := s.Sync(context.Background(), item, user); err != nil {
		t.Fatal(err)
	}
	cursor, count := state(t, db, item)
	if cursor != "done" || count != 1 {
		t.Fatal("mutation persisted partial data")
	}
	var id string
	db.QueryRow(`SELECT plaid_transaction_id FROM transactions`).Scan(&id)
	if id != "keep" {
		t.Fatal("stale page survived restart")
	}
}

func TestIntegrationCursorWriteFailureRollsBack(t *testing.T) {
	db := integrationDB(t)
	user, item, key := fixture(t, db)
	if _, err := db.Exec(`CREATE OR REPLACE FUNCTION test_reject_cursor() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.cursor<>OLD.cursor THEN RAISE EXCEPTION 'test cursor failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER test_reject_cursor BEFORE UPDATE ON sync_state FOR EACH ROW EXECUTE FUNCTION test_reject_cursor()`); err != nil {
		t.Fatal(err)
	}
	defer db.Exec(`DROP TRIGGER test_reject_cursor ON sync_state; DROP FUNCTION test_reject_cursor()`)
	p := &fake{fn: func(string, int) (Page, error) {
		return Page{Accounts: []Account{account()}, Added: []Transaction{txEntry("t1", "1")}, NextCursor: "cannot-save"}, nil
	}}
	s := Service{DB: db, Provider: p, Key: key}
	if _, err := s.Sync(context.Background(), item, user); err == nil {
		t.Fatal("cursor persistence failure ignored")
	}
	cursor, count := state(t, db, item)
	if cursor != "persisted" || count != 0 {
		t.Fatal("cursor failure did not roll back transactions")
	}
}
