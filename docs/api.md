# Cobolt Risk Engine — API Reference

Base URL: `http://localhost:3000/api`

Auth header for `/v1/` routes: `Authorization: Bearer <APP_API_KEY>` or `x-api-key: <APP_API_KEY>`

---

## Health

### `GET /health`

Health check. No auth required.

**Response `200`**

```json
{
  "success": true,
  "message": "Service is healthy",
  "data": {
    "status": "ok",
    "uptime": 1234.56,
    "timestamp": "2026-05-06T10:00:00.000Z"
  }
}
```

---

## Risk Assessment

### `POST /v1/risk/assess`

Assess a transaction for AML risk. Auth required.

**Request Body**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `userRef` | string | yes | User identifier |
| `walletId` | string | yes | Source wallet address |
| `amount` | number (int) | yes | Amount in minor units (e.g. cents/pence) |
| `currency` | string | yes | ISO 4217 code, exactly 3 chars |
| `transactionType` | enum | yes | `DEPOSIT`, `BUY_CRYPTO`, or `WITHDRAW_CRYPTO` |
| `counterpartyRef` | string | no | Counterparty wallet or reference (any type) |
| `chain` | string | **required for crypto types** | Blockchain identifier (e.g. `ETH`, `BTC`) |
| `toWalletId` | string | **required for crypto types** | Destination wallet address |

**Transaction type rules:**

| `transactionType` | `chain` | `toWalletId` |
|---|---|---|
| `DEPOSIT` | not needed | not needed |
| `BUY_CRYPTO` | required | required |
| `WITHDRAW_CRYPTO` | required | required |

---

### Example — DEPOSIT

```json
{
  "userRef": "usr_demo_001",
  "walletId": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
  "amount": 500000,
  "currency": "EUR",
  "transactionType": "DEPOSIT"
}
```

### Example — BUY_CRYPTO

```json
{
  "userRef": "usr_demo_001",
  "walletId": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
  "amount": 15000000,
  "currency": "EUR",
  "transactionType": "BUY_CRYPTO",
  "chain": "ETH",
  "toWalletId": "0x8fC9e7c2A5bD4f6E1a3C9b8D7e5F2a0c6B4d8E1"
}
```

### Example — WITHDRAW_CRYPTO

```json
{
  "userRef": "usr_demo_001",
  "walletId": "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18",
  "amount": 30000000,
  "currency": "ETH",
  "transactionType": "WITHDRAW_CRYPTO",
  "chain": "ETH",
  "toWalletId": "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B",
  "counterpartyRef": "0x95222290DD7278Aa3D3893899b6F8f3D1F8bD4cB"
}
```

---

**Response `200`**

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "assessId": "risk_01JVabcd1234efgh5678",
    "allow": false,
    "riskLevel": "high",
    "score": 65,
    "triggeredRules": ["VELOCITY_SPIKE", "SIZE_EXCEED"]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `assessId` | string | Unique assessment ID (`risk_` prefix) |
| `allow` | boolean | `true` = low/medium risk (approved). `false` = high/critical (blocked). |
| `riskLevel` | string | `low`, `medium`, `high`, or `critical` |
| `score` | number | 0–100 cumulative risk score |
| `triggeredRules` | string[] | Names of all triggered AML rules |

**Possible `triggeredRules` values:**

`VELOCITY_SPIKE` · `HIGH_FREQUENCY` · `SIZE_EXCEED` · `SANCTIONED_WALLET` · `CROSS_BORDER_SURGE` · `WALLET_CLUSTER` · `MARKET_EVENT`

---

## Errors

### `400` Validation Error

```json
{
  "success": false,
  "message": "Validation failed",
  "error": {
    "code": "BAD_REQUEST",
    "details": [
      {
        "code": "invalid_type",
        "expected": "string",
        "path": ["userRef"],
        "message": "Required"
      }
    ]
  }
}
```

### `401` Unauthorized

```json
{
  "success": false,
  "message": "Missing API key",
  "error": { "code": "UNAUTHORIZED" }
}
```

### `401` Invalid Key

```json
{
  "success": false,
  "message": "Invalid API key",
  "error": { "code": "UNAUTHORIZED" }
}
```

---

## Postman Collection

Import `docs/cobolt-risk-engine.postman_collection.json` into Postman. Variables:

| Variable | Default |
|----------|---------|
| `base_url` | `http://localhost:3000` |
| `api_key` | `sk-test-api-key-change-in-production` |

Includes example requests for all three transaction types plus error scenarios (missing crypto fields, missing auth).
