package syncer

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

const MutationCode = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION"

type APIError struct {
	Code      string
	Retryable bool
}

func (e *APIError) Error() string { return "Plaid request failed: " + e.Code }

type Account struct {
	ID       string  `json:"account_id"`
	Name     string  `json:"name"`
	Mask     *string `json:"mask"`
	Type     string  `json:"type"`
	Balances struct {
		Current  *json.Number `json:"current"`
		Currency string       `json:"iso_currency_code"`
	} `json:"balances"`
}
type Transaction struct {
	ID          string      `json:"transaction_id"`
	AccountID   string      `json:"account_id"`
	Description string      `json:"name"`
	Amount      json.Number `json:"amount"`
	Currency    string      `json:"iso_currency_code"`
	Date        string      `json:"date"`
	Pending     bool        `json:"pending"`
}
type Removed struct {
	ID string `json:"transaction_id"`
}
type Page struct {
	Added      []Transaction `json:"added"`
	Modified   []Transaction `json:"modified"`
	Removed    []Removed     `json:"removed"`
	Accounts   []Account     `json:"accounts"`
	NextCursor string        `json:"next_cursor"`
	HasMore    bool          `json:"has_more"`
}
type Provider interface {
	Fetch(context.Context, string, string) (Page, error)
}
type Client struct {
	URL    string
	ID     string
	Secret string
	HTTP   *http.Client
}

func NewSandboxClient(id, secret string) *Client {
	return &Client{URL: "https://sandbox.plaid.com", ID: id, Secret: secret, HTTP: &http.Client{Timeout: 15 * time.Second}}
}
func (c *Client) Fetch(ctx context.Context, token, cursor string) (Page, error) {
	body := map[string]any{"client_id": c.ID, "secret": c.Secret, "access_token": token, "count": 500}
	if cursor != "" {
		body["cursor"] = cursor
	}
	payload, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.URL+"/transactions/sync", bytes.NewReader(payload))
	if err != nil {
		return Page{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return Page{}, &APIError{Code: "NETWORK", Retryable: true}
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024+1))
	if err != nil || len(data) > 8*1024*1024 {
		return Page{}, errors.New("invalid Plaid response size")
	}
	if resp.StatusCode != http.StatusOK {
		var failure struct {
			Code string `json:"error_code"`
		}
		_ = json.Unmarshal(data, &failure)
		// Only codes, never request/response bodies, leave this boundary.
		return Page{}, &APIError{Code: failure.Code, Retryable: resp.StatusCode == 429 || resp.StatusCode >= 500 || failure.Code == "PRODUCT_NOT_READY"}
	}
	var page Page
	if err = json.Unmarshal(data, &page); err != nil {
		return Page{}, errors.New("invalid Plaid JSON")
	}
	if page.NextCursor == "" {
		return Page{}, errors.New("Plaid omitted next cursor")
	}
	return page, nil
}

type SleepFunc func(context.Context, time.Duration) error

func sleep(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

// Collect buffers every page; a mutation discards the entire attempt and restarts at the persisted cursor.
func Collect(ctx context.Context, p Provider, token, start string, pause SleepFunc) ([]Page, string, error) {
	if pause == nil {
		pause = sleep
	}
	for restart := 0; restart < 3; restart++ {
		cursor := start
		pages := []Page{}
		seen := map[string]bool{start: true}
		mutated := false
		for count := 0; count < 100; count++ {
			var page Page
			var err error
			for attempt := 0; attempt < 4; attempt++ {
				page, err = p.Fetch(ctx, token, cursor)
				if err == nil {
					break
				}
				var api *APIError
				if !errors.As(err, &api) || !api.Retryable || attempt == 3 {
					break
				}
				if err = pause(ctx, time.Duration(1<<attempt)*100*time.Millisecond); err != nil {
					return nil, start, err
				}
			}
			if err != nil {
				var api *APIError
				if errors.As(err, &api) && api.Code == MutationCode {
					mutated = true
					break
				}
				return nil, start, err
			}
			if page.NextCursor == "" {
				return nil, start, errors.New("empty cursor")
			}
			pages = append(pages, page)
			if !page.HasMore {
				return pages, page.NextCursor, nil
			}
			if seen[page.NextCursor] {
				return nil, start, errors.New("pagination cursor cycle")
			}
			seen[page.NextCursor] = true
			cursor = page.NextCursor
		}
		if !mutated {
			return nil, start, errors.New("pagination exceeds 100 pages")
		}
		if err := pause(ctx, time.Duration(restart+1)*100*time.Millisecond); err != nil {
			return nil, start, err
		}
	}
	return nil, start, fmt.Errorf("pagination mutation restart limit reached")
}
