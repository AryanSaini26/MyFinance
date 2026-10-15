package syncer

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"math/big"
	"regexp"
	"time"
)

var ErrBusy = errors.New("item is already syncing")
var ErrNotFound = errors.New("active item not found")

type Service struct {
	DB       *sql.DB
	Provider Provider
	Key      []byte
	Pause    SleepFunc
}
type Result struct {
	Added    int `json:"added"`
	Modified int `json:"modified"`
	Removed  int `json:"removed"`
	Pages    int `json:"pages"`
}

func ParseKey(value string) ([]byte, error) {
	key, err := hex.DecodeString(value)
	if err != nil || len(key) != 32 {
		return nil, errors.New("TOKEN_ENCRYPTION_KEY must be 32 bytes in hex")
	}
	return key, nil
}
func Decrypt(key []byte, value string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(value)
	if err != nil || len(data) < 28 {
		return "", errors.New("invalid encrypted token")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	plain, err := gcm.Open(nil, data[:12], data[12:], nil)
	if err != nil {
		return "", errors.New("token decryption failed")
	}
	return string(plain), nil
}

var amountPattern = regexp.MustCompile(`^-?\d+(?:\.\d{1,2})?$`)

// Decimal strings avoid float rounding between JSON and PostgreSQL numeric.
func Amount(value string, invert bool) (string, error) {
	if !amountPattern.MatchString(value) {
		return "", errors.New("invalid two-decimal amount")
	}
	r, ok := new(big.Rat).SetString(value)
	if !ok {
		return "", errors.New("invalid amount")
	}
	if invert {
		r.Neg(r)
	}
	return r.FloatString(2), nil
}
func (s *Service) Sync(ctx context.Context, item, user string) (Result, error) {
	started := time.Now()
	result, err := s.sync(ctx, item, user)
	if err != nil && !errors.Is(err, ErrBusy) && !errors.Is(err, ErrNotFound) {
		// Fixed safe code, not provider payloads. Reporting errors is best effort, never cursor success.
		reportCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, _ = s.DB.ExecContext(reportCtx, `UPDATE sync_state SET last_error='SYNC_FAILED' WHERE item_id=$1 AND (last_synced_at IS NULL OR last_synced_at <= $3) AND EXISTS(SELECT 1 FROM plaid_items WHERE id=$1 AND user_id=$2 AND status='active')`, item, user, started)
	}
	return result, err
}
func (s *Service) sync(ctx context.Context, item, user string) (Result, error) {
	tx, err := s.DB.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, err
	}
	defer tx.Rollback()
	var locked bool
	if err = tx.QueryRowContext(ctx, `SELECT pg_try_advisory_xact_lock(hashtextextended($1,0))`, item).Scan(&locked); err != nil {
		return Result{}, err
	}
	if !locked {
		return Result{}, ErrBusy
	}
	var encrypted, start string
	err = tx.QueryRowContext(ctx, `SELECT i.access_token_encrypted,s.cursor FROM plaid_items i JOIN sync_state s ON s.item_id=i.id WHERE i.id=$1 AND i.user_id=$2 AND i.status='active' FOR UPDATE OF i,s`, item, user).Scan(&encrypted, &start)
	if errors.Is(err, sql.ErrNoRows) {
		return Result{}, ErrNotFound
	}
	if err != nil {
		return Result{}, err
	}
	token, err := Decrypt(s.Key, encrypted)
	if err != nil {
		return Result{}, err
	}
	pages, cursor, err := Collect(ctx, s.Provider, token, start, s.Pause)
	if err != nil {
		return Result{}, err
	}
	result := Result{Pages: len(pages)}
	for _, page := range pages {
		for _, a := range page.Accounts {
			if a.Balances.Currency != "CAD" && a.Balances.Currency != "USD" {
				return Result{}, errors.New("unsupported account currency")
			}
			var balance any
			if a.Balances.Current != nil {
				balance, err = Amount(string(*a.Balances.Current), false)
				if err != nil {
					return Result{}, err
				}
			}
			if a.ID == "" || a.Name == "" {
				return Result{}, errors.New("invalid account")
			}
			_, err = tx.ExecContext(ctx, `INSERT INTO accounts(user_id,item_id,plaid_account_id,name,mask,type,currency,current_balance) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(item_id,plaid_account_id) DO UPDATE SET name=EXCLUDED.name,mask=EXCLUDED.mask,type=EXCLUDED.type,currency=EXCLUDED.currency,current_balance=EXCLUDED.current_balance`, user, item, a.ID, a.Name, a.Mask, a.Type, a.Balances.Currency, balance)
			if err != nil {
				return Result{}, err
			}
		}
		changes := append(append([]Transaction{}, page.Added...), page.Modified...)
		for _, t := range changes {
			amount, e := Amount(string(t.Amount), true)
			if e != nil {
				return Result{}, e
			}
			if t.ID == "" || t.AccountID == "" || t.Description == "" {
				return Result{}, errors.New("invalid transaction")
			}
			if _, e = time.Parse("2006-01-02", t.Date); e != nil {
				return Result{}, errors.New("invalid date")
			}
			if t.Currency != "CAD" && t.Currency != "USD" {
				return Result{}, errors.New("unsupported currency")
			}
			r, e := tx.ExecContext(ctx, `INSERT INTO transactions(user_id,account_id,item_id,plaid_transaction_id,source,description,amount,currency,date,pending,predicted_category_id)
    SELECT $1,a.id,$2,$3,'plaid',$4,$5,$6,$7,$8,$9 FROM accounts a WHERE a.item_id=$2 AND a.user_id=$1 AND a.plaid_account_id=$10 AND a.currency=$6
    ON CONFLICT(item_id,plaid_transaction_id) DO UPDATE SET account_id=EXCLUDED.account_id,description=EXCLUDED.description,amount=EXCLUDED.amount,currency=EXCLUDED.currency,date=EXCLUDED.date,pending=EXCLUDED.pending,predicted_category_id=EXCLUDED.predicted_category_id,removed_at=NULL,updated_at=now()`, user, item, t.ID, t.Description, amount, t.Currency, t.Date, t.Pending, Predict(t.Description), t.AccountID)
			if e != nil {
				return Result{}, e
			}
			n, e := r.RowsAffected()
			if e != nil || n != 1 {
				return Result{}, errors.New("transaction account missing or currency mismatch")
			}
		}
		for _, r := range page.Removed {
			if r.ID == "" {
				return Result{}, errors.New("invalid removed transaction")
			}
			_, err = tx.ExecContext(ctx, `UPDATE transactions SET removed_at=now(),updated_at=now() WHERE item_id=$1 AND user_id=$2 AND plaid_transaction_id=$3`, item, user, r.ID)
			if err != nil {
				return Result{}, err
			}
		}
		result.Added += len(page.Added)
		result.Modified += len(page.Modified)
		result.Removed += len(page.Removed)
	}
	_, err = tx.ExecContext(ctx, `UPDATE sync_state SET cursor=$1,last_synced_at=now(),last_error=NULL WHERE item_id=$2`, cursor, item)
	if err != nil {
		return Result{}, err
	}
	if err = tx.Commit(); err != nil {
		return Result{}, err
	}
	return result, nil
}
