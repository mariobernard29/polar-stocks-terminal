-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "api_credentials" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "secret" BLOB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "lastCheckedAt" DATETIME,
    "lastCheckOk" BOOLEAN,
    "lastCheckNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "layouts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "watchlists" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "watchlist_items" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "watchlistId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "note" TEXT,
    "color" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "watchlist_items_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "watchlists" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "portfolios" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "pricePerUnit" DECIMAL NOT NULL,
    "fees" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "executedAt" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transactions_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "dividends" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "portfolioId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "withholding" DECIMAL NOT NULL DEFAULT 0,
    "paidAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "dividends_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "portfolios" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "threshold" DECIMAL,
    "params" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "once" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "alert_triggers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "alertId" TEXT NOT NULL,
    "value" DECIMAL,
    "message" TEXT NOT NULL,
    "triggeredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "alert_triggers_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "alerts" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "news_bookmarks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "newsId" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "publishedAt" DATETIME NOT NULL,
    "symbols" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "search_history" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "query" TEXT NOT NULL,
    "symbol" TEXT,
    "useCount" INTEGER NOT NULL DEFAULT 1,
    "lastUsedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "cache_entries" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "api_credentials_provider_key" ON "api_credentials"("provider");

-- CreateIndex
CREATE INDEX "api_credentials_enabled_priority_idx" ON "api_credentials"("enabled", "priority");

-- CreateIndex
CREATE INDEX "layouts_isDefault_idx" ON "layouts"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "layouts_name_key" ON "layouts"("name");

-- CreateIndex
CREATE INDEX "watchlists_position_idx" ON "watchlists"("position");

-- CreateIndex
CREATE INDEX "watchlist_items_watchlistId_position_idx" ON "watchlist_items"("watchlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "watchlist_items_watchlistId_symbol_key" ON "watchlist_items"("watchlistId", "symbol");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_symbol_key" ON "favorites"("symbol");

-- CreateIndex
CREATE INDEX "favorites_position_idx" ON "favorites"("position");

-- CreateIndex
CREATE INDEX "transactions_portfolioId_symbol_idx" ON "transactions"("portfolioId", "symbol");

-- CreateIndex
CREATE INDEX "transactions_portfolioId_executedAt_idx" ON "transactions"("portfolioId", "executedAt");

-- CreateIndex
CREATE INDEX "dividends_portfolioId_paidAt_idx" ON "dividends"("portfolioId", "paidAt");

-- CreateIndex
CREATE INDEX "alerts_enabled_symbol_idx" ON "alerts"("enabled", "symbol");

-- CreateIndex
CREATE INDEX "alert_triggers_alertId_triggeredAt_idx" ON "alert_triggers"("alertId", "triggeredAt");

-- CreateIndex
CREATE INDEX "alert_triggers_acknowledged_idx" ON "alert_triggers"("acknowledged");

-- CreateIndex
CREATE UNIQUE INDEX "news_bookmarks_newsId_key" ON "news_bookmarks"("newsId");

-- CreateIndex
CREATE INDEX "news_bookmarks_publishedAt_idx" ON "news_bookmarks"("publishedAt");

-- CreateIndex
CREATE INDEX "notes_symbol_idx" ON "notes"("symbol");

-- CreateIndex
CREATE INDEX "notes_pinned_idx" ON "notes"("pinned");

-- CreateIndex
CREATE INDEX "search_history_lastUsedAt_idx" ON "search_history"("lastUsedAt");

-- CreateIndex
CREATE UNIQUE INDEX "search_history_query_key" ON "search_history"("query");

-- CreateIndex
CREATE INDEX "cache_entries_expiresAt_idx" ON "cache_entries"("expiresAt");

-- CreateIndex
CREATE INDEX "cache_entries_provider_idx" ON "cache_entries"("provider");
