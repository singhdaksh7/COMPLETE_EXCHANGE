-- ============================================================================
-- CEX — PRODUCTION SEED (idempotent)  ·  v1.0
-- Reference + bootstrap data: assets, chains, asset_chains, permissions, roles,
-- role_permissions, and one bootstrap SUPER_ADMIN.
-- Safe to re-run: every statement is ON CONFLICT DO NOTHING / DO UPDATE.
-- Order matters: assets -> chains (FK native_asset) -> asset_chains.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- ASSETS  (native gas assets must exist before chains reference them)
-- ---------------------------------------------------------------------------
INSERT INTO "assets" ("symbol","name","kind","decimals","is_active") VALUES
  ('INR',  'Indian Rupee', 'FIAT',   2,  true),
  ('USDT', 'Tether USD',   'CRYPTO', 6,  true),
  ('TRX',  'TRON',         'CRYPTO', 6,  true),
  ('ETH',  'Ether',        'CRYPTO', 18, true),
  ('BNB',  'BNB',          'CRYPTO', 18, true),
  ('BTC',  'Bitcoin',      'CRYPTO', 8,  true),
  ('SOL',  'Solana',       'CRYPTO', 9,  true)
ON CONFLICT ("symbol") DO NOTHING;

-- ---------------------------------------------------------------------------
-- CHAINS  (reference table — adding a chain is an INSERT, not a migration)
-- ---------------------------------------------------------------------------
INSERT INTO "chains" ("id","name","family","native_asset","evm_chain_id","confirmations","reorg_buffer","is_active") VALUES
  ('TRON',     'TRON',             'TRON', 'TRX', NULL, 20, 32, true),
  ('ETHEREUM', 'Ethereum Mainnet', 'EVM',  'ETH', 1,    12, 64, true),
  ('BSC',      'BNB Smart Chain',  'EVM',  'BNB', 56,   15, 40, true)
ON CONFLICT ("id") DO NOTHING;

-- ---------------------------------------------------------------------------
-- ASSET_CHAINS  (USDT across TRC20 / ERC20 / BEP20)
-- ---------------------------------------------------------------------------
INSERT INTO "asset_chains" ("asset","chain","contract_addr","decimals","min_confirmations","is_active") VALUES
  ('USDT','TRON',     'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',          6,  20, true),  -- TRC20
  ('USDT','ETHEREUM', '0xdAC17F958D2ee523a2206206994597C13D831ec7', 6,  12, true),  -- ERC20
  ('USDT','BSC',      '0x55d398326f99059fF775485246999027B3197955', 18, 15, true)   -- BEP20
ON CONFLICT ("asset","chain") DO NOTHING;

-- ---------------------------------------------------------------------------
-- CUSTODY  (Module 2 — chain signers + hot/cold wallets)
--   Signing is MOCKED: we persist a KMS/HSM key REFERENCE only (kms_key_ref),
--   NEVER key material. Cold wallets reuse hot_wallets with tier = 'COLD'.
-- ---------------------------------------------------------------------------
INSERT INTO "chain_signers" ("id","chain","name","kms_key_ref","public_key","status") VALUES
  ('00000000-0000-0000-0000-0000000005a1', 'TRON', 'TRON Treasury Signer (mock)', 'kms://mock/tron/treasury-1', NULL, 'ACTIVE')
ON CONFLICT ("chain","kms_key_ref") DO NOTHING;

INSERT INTO "hot_wallets" ("id","chain","signer_id","address","tier","label","is_active") VALUES
  ('00000000-0000-0000-0000-0000000006a1', 'TRON', '00000000-0000-0000-0000-0000000005a1', 'TMockHotWalletTRONxxxxxxxxxxxxxxxxx',  'HOT',  'TRON hot wallet',  true),
  ('00000000-0000-0000-0000-0000000006c1', 'TRON', '00000000-0000-0000-0000-0000000005a1', 'TMockColdWalletTRONxxxxxxxxxxxxxxxx', 'COLD', 'TRON cold wallet', true)
ON CONFLICT ("chain","address") DO NOTHING;

-- ---------------------------------------------------------------------------
-- MARKETS  (internal spot order books — USDT/INR on-ramp + crypto/USDT pairs)
-- tick_size: quote price increment · step_size: base lot increment
-- min_notional: smallest order value (quote) · fees in basis points
-- ---------------------------------------------------------------------------
INSERT INTO "markets" ("id","symbol","base_asset","quote_asset","status","tick_size","step_size","min_notional","maker_fee_bps","taker_fee_bps") VALUES
  (gen_random_uuid(), 'USDT-INR', 'USDT', 'INR',  'ACTIVE', 0.01,  0.000001, 10, 10, 20),
  (gen_random_uuid(), 'BTC-USDT', 'BTC',  'USDT', 'ACTIVE', 0.01,  0.000001, 10, 10, 20),
  (gen_random_uuid(), 'ETH-USDT', 'ETH',  'USDT', 'ACTIVE', 0.01,  0.00001,  10, 10, 20),
  (gen_random_uuid(), 'BNB-USDT', 'BNB',  'USDT', 'ACTIVE', 0.01,  0.0001,   10, 10, 20),
  (gen_random_uuid(), 'SOL-USDT', 'SOL',  'USDT', 'ACTIVE', 0.001, 0.001,    10, 10, 20)
ON CONFLICT ("symbol") DO NOTHING;

-- ---------------------------------------------------------------------------
-- PERMISSIONS  (the codes the API authorizes against)
-- ---------------------------------------------------------------------------
INSERT INTO "permissions" ("id","code","description") VALUES
  (gen_random_uuid(), 'user.view',            'View user accounts'),
  (gen_random_uuid(), 'user.freeze',          'Freeze / unfreeze a user'),
  (gen_random_uuid(), 'user.close',           'Close a user account'),
  (gen_random_uuid(), 'kyc.view',             'View KYC submissions'),
  (gen_random_uuid(), 'kyc.review',           'Approve / reject KYC'),
  (gen_random_uuid(), 'deposit.view',         'View crypto/INR deposits'),
  (gen_random_uuid(), 'withdrawal.view',      'View withdrawals'),
  (gen_random_uuid(), 'withdrawal.approve',   'Approve a withdrawal (dual control)'),
  (gen_random_uuid(), 'withdrawal.reject',    'Reject a withdrawal'),
  (gen_random_uuid(), 'treasury.manage',      'Approve hot/cold treasury movements'),
  (gen_random_uuid(), 'compliance.view',      'View risk profiles, alerts & compliance summary'),
  (gen_random_uuid(), 'compliance.review',    'Evaluate users, assign/triage alerts, manual flag'),
  (gen_random_uuid(), 'compliance.manage',    'Manage compliance configuration & overrides'),
  (gen_random_uuid(), 'ops.view',             'View the operational health dashboard'),
  (gen_random_uuid(), 'inr.view',             'View INR transactions'),
  (gen_random_uuid(), 'inr.approve',          'Approve an INR payout'),
  (gen_random_uuid(), 'ledger.view',          'Read the ledger'),
  (gen_random_uuid(), 'ledger.adjust',        'Post adjustment / reversing entries'),
  (gen_random_uuid(), 'market.manage',        'Create / halt markets'),
  (gen_random_uuid(), 'order.cancel_any',     'Cancel any user order'),
  (gen_random_uuid(), 'trade.view',           'View trades'),
  (gen_random_uuid(), 'recon.run',            'Trigger reconciliation runs'),
  (gen_random_uuid(), 'role.manage',          'Manage roles & permissions'),
  (gen_random_uuid(), 'admin.manage',         'Manage admin accounts'),
  (gen_random_uuid(), 'system.flags',         'Toggle system / kill-switch flags'),
  (gen_random_uuid(), 'audit.view',           'Read audit & admin logs')
ON CONFLICT ("code") DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLES  (USER-scope default + ADMIN-scope RBAC roles)
-- ---------------------------------------------------------------------------
INSERT INTO "roles" ("id","name","scope","description","is_system") VALUES
  (gen_random_uuid(), 'USER',        'USER',  'Default end-user role',                 true),
  (gen_random_uuid(), 'SUPER_ADMIN', 'ADMIN', 'Full administrative access',            true),
  (gen_random_uuid(), 'COMPLIANCE',  'ADMIN', 'KYC/AML review & user actions',         false),
  (gen_random_uuid(), 'FINANCE',     'ADMIN', 'Withdrawals, INR, ledger & recon',      false),
  (gen_random_uuid(), 'SUPPORT',     'ADMIN', 'Read-only support across modules',      false),
  (gen_random_uuid(), 'READ_ONLY',   'ADMIN', 'Read-only / auditor access',            false)
ON CONFLICT ("name") DO NOTHING;

-- ---------------------------------------------------------------------------
-- ROLE_PERMISSIONS
-- ---------------------------------------------------------------------------
-- SUPER_ADMIN -> every permission
INSERT INTO "role_permissions" ("role_id","permission_id")
SELECT r."id", p."id" FROM "roles" r CROSS JOIN "permissions" p
WHERE r."name" = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- COMPLIANCE
INSERT INTO "role_permissions" ("role_id","permission_id")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p
  ON p."code" IN ('user.view','user.freeze','kyc.view','kyc.review','audit.view','deposit.view',
                  'compliance.view','compliance.review','compliance.manage')
WHERE r."name" = 'COMPLIANCE'
ON CONFLICT DO NOTHING;

-- FINANCE
INSERT INTO "role_permissions" ("role_id","permission_id")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p
  ON p."code" IN ('withdrawal.view','withdrawal.approve','withdrawal.reject',
                  'inr.view','inr.approve','ledger.view','recon.run','deposit.view',
                  'treasury.manage')
WHERE r."name" = 'FINANCE'
ON CONFLICT DO NOTHING;

-- SUPPORT + READ_ONLY -> all *.view permissions
INSERT INTO "role_permissions" ("role_id","permission_id")
SELECT r."id", p."id" FROM "roles" r JOIN "permissions" p
  ON p."code" LIKE '%.view'
WHERE r."name" IN ('SUPPORT','READ_ONLY')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- BOOTSTRAP ADMIN  (SUPER_ADMIN)
--   !! SECURITY: password_hash & totp_secret_enc below are PLACEHOLDERS.
--   Rotate immediately via the secure admin-bootstrap routine before launch:
--   generate a real argon2id hash and a KMS-wrapped TOTP secret, then UPDATE.
--   Placeholder password corresponds to a value that MUST be changed.
-- ---------------------------------------------------------------------------
INSERT INTO "admins" ("id","email","password_hash","totp_secret_enc","totp_enabled","status")
VALUES (
  gen_random_uuid(),
  'admin@exchange.local',
  '$argon2id$v=19$m=65536,t=3,p=4$REPLACE_ME_SALT$REPLACE_ME_HASH_ROTATE_BEFORE_LAUNCH',
  '\x00'::bytea,        -- placeholder; replace with KMS-wrapped TOTP secret
  false,               -- enable after real TOTP enrolment
  'ACTIVE'
)
ON CONFLICT ("email") DO NOTHING;

-- Grant the bootstrap admin SUPER_ADMIN
INSERT INTO "admin_roles" ("admin_id","role_id")
SELECT a."id", r."id"
FROM "admins" a JOIN "roles" r ON r."name" = 'SUPER_ADMIN'
WHERE a."email" = 'admin@exchange.local'
ON CONFLICT DO NOTHING;
