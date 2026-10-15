package syncer

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

type Mock struct{}

func (Mock) Fetch(ctx context.Context, token, cursor string) (Page, error) {
	if !strings.HasPrefix(token, "mock-access-") {
		return Page{}, errors.New("not a mock token")
	}
	if cursor != "" {
		return Page{NextCursor: cursor}, nil
	}
	accountID := strings.Replace(token, "mock-access-", "mock-account-", 1)
	balance := json.Number("1200.00")
	a := Account{ID: accountID, Name: "Demo Checking", Type: "depository"}
	a.Balances.Current = &balance
	a.Balances.Currency = "CAD"
	return Page{NextCursor: "mock-v1", Accounts: []Account{a}, Added: []Transaction{
		{ID: accountID + "-coffee", AccountID: accountID, Description: "coffee cafe", Amount: json.Number("5.25"), Currency: "CAD", Date: time.Now().UTC().Format("2006-01-02")},
		{ID: accountID + "-salary", AccountID: accountID, Description: "payroll salary", Amount: json.Number("-2000.00"), Currency: "CAD", Date: time.Now().UTC().Format("2006-01-02")},
	}}, nil
}
