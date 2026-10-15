CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE,
 password_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (email = lower(email))
);
CREATE TABLE sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);
CREATE TABLE auth_attempts (key text PRIMARY KEY, attempts integer NOT NULL, window_start timestamptz NOT NULL);
CREATE TABLE categories (id text PRIMARY KEY, name text NOT NULL UNIQUE);
INSERT INTO categories VALUES
 ('dining','Food & Dining'),('groceries','Groceries'),('shopping','Shopping'),
 ('transport','Transportation'),('utilities','Utilities'),('entertainment','Entertainment'),
 ('health','Health & Fitness'),('travel','Travel'),('income','Income'),('transfer','Transfer'),('other','Other');
CREATE TABLE plaid_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 plaid_item_id text NOT NULL UNIQUE, institution_name text NOT NULL,
 access_token_encrypted text, status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disconnecting','disconnected')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,user_id),
 CHECK (status <> 'active' OR access_token_encrypted IS NOT NULL)
);
CREATE INDEX items_user_idx ON plaid_items(user_id);
CREATE TABLE sync_state (
 item_id uuid PRIMARY KEY REFERENCES plaid_items ON DELETE CASCADE,
 cursor text NOT NULL DEFAULT '', last_synced_at timestamptz,
 last_error text
);
CREATE TABLE accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 item_id uuid, plaid_account_id text, name text NOT NULL, mask text,
 type text NOT NULL, currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 current_balance numeric(18,2), active boolean NOT NULL DEFAULT true,
 FOREIGN KEY(item_id,user_id) REFERENCES plaid_items(id,user_id),
 UNIQUE(item_id,plaid_account_id), UNIQUE(id,user_id), UNIQUE(id,item_id),
 CHECK ((item_id IS NULL) = (plaid_account_id IS NULL))
);
CREATE INDEX accounts_user_idx ON accounts(user_id);
CREATE TABLE transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 account_id uuid NOT NULL, item_id uuid, plaid_transaction_id text,
 source text NOT NULL CHECK(source IN ('manual','csv','plaid')), import_key text,
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 300), amount numeric(18,2) NOT NULL,
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), date date NOT NULL,
 pending boolean NOT NULL DEFAULT false, removed_at timestamptz,
 predicted_category_id text NOT NULL DEFAULT 'other' REFERENCES categories,
 category_override_id text REFERENCES categories,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(account_id,user_id) REFERENCES accounts(id,user_id),
 FOREIGN KEY(account_id,item_id) REFERENCES accounts(id,item_id),
 FOREIGN KEY(item_id,user_id) REFERENCES plaid_items(id,user_id),
 UNIQUE(item_id,plaid_transaction_id), UNIQUE(user_id,import_key),
 CHECK ((source = 'plaid') = (item_id IS NOT NULL AND plaid_transaction_id IS NOT NULL))
);
CREATE INDEX transactions_user_date_idx ON transactions(user_id,date DESC,id DESC) WHERE removed_at IS NULL;
CREATE INDEX transactions_account_idx ON transactions(account_id);
CREATE TABLE budgets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 category_id text NOT NULL REFERENCES categories, month date NOT NULL CHECK(extract(day FROM month)=1),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), amount numeric(18,2) NOT NULL CHECK(amount>0),
 UNIQUE(user_id,category_id,month,currency)
);
