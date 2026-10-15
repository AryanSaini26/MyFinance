package syncer

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"
)

type fake struct {
	fn      func(string, int) (Page, error)
	cursors []string
}

func (f *fake) Fetch(ctx context.Context, token, cursor string) (Page, error) {
	f.cursors = append(f.cursors, cursor)
	return f.fn(cursor, len(f.cursors))
}
func noWait(context.Context, time.Duration) error { return nil }
func TestPagination(t *testing.T) {
	p := &fake{fn: func(c string, n int) (Page, error) {
		if c == "start" {
			return Page{Added: []Transaction{{ID: "a"}}, NextCursor: "next", HasMore: true}, nil
		}
		return Page{Modified: []Transaction{{ID: "b"}}, Removed: []Removed{{ID: "c"}}, NextCursor: "end"}, nil
	}}
	pages, cursor, err := Collect(context.Background(), p, "token", "start", noWait)
	if err != nil || len(pages) != 2 || cursor != "end" || !reflect.DeepEqual(p.cursors, []string{"start", "next"}) {
		t.Fatalf("unexpected pagination: %v %s %v", pages, cursor, err)
	}
}
func TestMutationRestartsOriginalCursor(t *testing.T) {
	p := &fake{fn: func(c string, n int) (Page, error) {
		switch n {
		case 1:
			return Page{NextCursor: "badpage", HasMore: true, Added: []Transaction{{ID: "discard"}}}, nil
		case 2:
			return Page{}, &APIError{Code: MutationCode}
		default:
			return Page{NextCursor: "end", Added: []Transaction{{ID: "keep"}}}, nil
		}
	}}
	pages, cursor, err := Collect(context.Background(), p, "token", "persisted", noWait)
	if err != nil || cursor != "end" || len(pages) != 1 || pages[0].Added[0].ID != "keep" || !reflect.DeepEqual(p.cursors, []string{"persisted", "badpage", "persisted"}) {
		t.Fatalf("did not restart: %v %v", p.cursors, err)
	}
}
func TestRetriesAndBoundedBackoff(t *testing.T) {
	var delays []time.Duration
	p := &fake{fn: func(c string, n int) (Page, error) {
		if n < 4 {
			return Page{}, &APIError{Code: "RATE_LIMIT", Retryable: true}
		}
		return Page{NextCursor: "done"}, nil
	}}
	_, _, err := Collect(context.Background(), p, "token", "", func(ctx context.Context, d time.Duration) error { delays = append(delays, d); return nil })
	if err != nil || !reflect.DeepEqual(delays, []time.Duration{100 * time.Millisecond, 200 * time.Millisecond, 400 * time.Millisecond}) {
		t.Fatalf("unexpected retries %v %v", delays, err)
	}
}
func TestRetryExhaustionPreservesCursor(t *testing.T) {
	p := &fake{fn: func(string, int) (Page, error) { return Page{}, &APIError{Code: "UNAVAILABLE", Retryable: true} }}
	pages, cursor, err := Collect(context.Background(), p, "token", "original", noWait)
	if err == nil || len(pages) != 0 || cursor != "original" || len(p.cursors) != 4 {
		t.Fatal("failed request was advanced")
	}
}
func TestNonRetryableFailure(t *testing.T) {
	p := &fake{fn: func(string, int) (Page, error) { return Page{}, &APIError{Code: "ITEM_LOGIN_REQUIRED"} }}
	_, _, err := Collect(context.Background(), p, "", "", noWait)
	if err == nil || len(p.cursors) != 1 {
		t.Fatal("permanent failure retried")
	}
}
func TestMutationBound(t *testing.T) {
	p := &fake{fn: func(string, int) (Page, error) { return Page{}, &APIError{Code: MutationCode} }}
	_, _, err := Collect(context.Background(), p, "", "", noWait)
	if err == nil || len(p.cursors) != 3 {
		t.Fatal("mutation not bounded")
	}
}
func TestCycleAndPageLimit(t *testing.T) {
	p := &fake{fn: func(c string, n int) (Page, error) { return Page{NextCursor: c, HasMore: true}, nil }}
	_, _, err := Collect(context.Background(), p, "", "start", noWait)
	if err == nil {
		t.Fatal("cycle accepted")
	}
	p = &fake{fn: func(c string, n int) (Page, error) { return Page{NextCursor: c + "x", HasMore: true}, nil }}
	_, _, err = Collect(context.Background(), p, "", "", noWait)
	if err == nil || len(p.cursors) != 100 {
		t.Fatal("page limit not enforced")
	}
}
func TestCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if !errors.Is(sleep(ctx, time.Hour), context.Canceled) {
		t.Fatal("sleep ignores cancellation")
	}
}
func TestHTTPAdapter(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		var body map[string]any
		if json.NewDecoder(r.Body).Decode(&body) != nil {
			t.Error("invalid JSON")
		}
		if body["access_token"] != "token" {
			t.Error("missing token")
		}
		if calls == 1 {
			if _, ok := body["cursor"]; ok {
				t.Error("initial cursor should be omitted")
			}
			w.WriteHeader(429)
			w.Write([]byte(`{"error_code":"RATE_LIMIT_EXCEEDED"}`))
			return
		}
		w.Write([]byte(`{"added":[],"modified":[],"removed":[],"next_cursor":"next","has_more":false}`))
	}))
	defer server.Close()
	c := &Client{URL: server.URL, HTTP: server.Client()}
	_, cursor, err := Collect(context.Background(), c, "token", "", noWait)
	if err != nil || cursor != "next" || calls != 2 {
		t.Fatalf("HTTP adapter failed %v", err)
	}
}
func TestMalformedHTTPAndMutation(t *testing.T) {
	for _, tc := range []struct {
		body   string
		status int
		code   string
	}{{`{`, 200, ""}, {`{}`, 200, ""}, {`{"error_code":"TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"}`, 400, MutationCode}} {
		t.Run(tc.body, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(tc.status); w.Write([]byte(tc.body)) }))
			defer server.Close()
			c := &Client{URL: server.URL, HTTP: server.Client()}
			_, err := c.Fetch(context.Background(), "token", "")
			if err == nil {
				t.Fatal("accepted malformed response")
			}
			if tc.code != "" {
				var api *APIError
				if !errors.As(err, &api) || api.Code != tc.code {
					t.Fatal("lost mutation error")
				}
			}
		})
	}
}
func TestMoneyAndClassification(t *testing.T) {
	for _, tc := range []struct {
		in, want string
		invert   bool
	}{{"12.34", "-12.34", true}, {"-0.01", "0.01", true}, {"1000", "1000.00", false}} {
		value, err := Amount(tc.in, tc.invert)
		if err != nil || value != tc.want {
			t.Fatalf("decimal error %s %v", value, err)
		}
	}
	for _, bad := range []string{"NaN", "1.001", "1e3", ""} {
		if _, err := Amount(bad, false); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
	for _, tc := range []struct{ text, want string }{{"morning coffee cafe", "dining"}, {"grocery produce bread", "groceries"}, {"salary payroll", "income"}, {"qzx 123", "other"}} {
		if Predict(tc.text) != tc.want {
			t.Fatalf("wrong prediction %s", tc.text)
		}
	}
}
