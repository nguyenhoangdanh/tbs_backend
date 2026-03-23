#!/usr/bin/env bash
# =============================================================================
# setup-production.sh
# Full production database setup: migrate + seed
# Usage: ./scripts/setup-production.sh [--skip-seed]
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()     { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()   { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()    { error "$*"; exit 1; }

# ── Args ──────────────────────────────────────────────────────────────────────
SKIP_SEED=false
for arg in "$@"; do
  case $arg in
    --skip-seed) SKIP_SEED=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-seed]"
      echo "  --skip-seed   Run only migrations, skip seeding"
      exit 0
      ;;
  esac
done

# ── Locate repo root ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   TBS Management — Production DB Setup      ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Check .env.production ─────────────────────────────────────────────────────
ENV_FILE=".env.production"
[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — copy .env.example and fill in values."

log "Loading $ENV_FILE"
export $(grep -v '^#' "$ENV_FILE" | grep -v '^$' | xargs)

# ── Validate required vars ────────────────────────────────────────────────────
required_vars=(DATABASE_URL JWT_SECRET ADMIN_PASSWORD)
for var in "${required_vars[@]}"; do
  [[ -n "${!var:-}" ]] || die "Required env var $var is not set in $ENV_FILE"
done
ok "Environment variables validated"

# ── Check DATABASE_URL is reachable ───────────────────────────────────────────
log "Testing database connectivity..."
if command -v psql &>/dev/null; then
  psql "$DATABASE_URL" -c "SELECT 1" -q --no-psqlrc &>/dev/null \
    && ok "Database reachable" \
    || die "Cannot connect to database. Check DATABASE_URL in $ENV_FILE"
else
  warn "psql not found — skipping connectivity check (will fail at migrate if unreachable)"
fi

# ── Check dependencies ────────────────────────────────────────────────────────
log "Checking dependencies..."
command -v node  &>/dev/null || die "node is not installed"
command -v pnpm  &>/dev/null || npm install -g pnpm

if [[ ! -d node_modules ]]; then
  log "Installing dependencies..."
  pnpm install --frozen-lockfile
  ok "Dependencies installed"
else
  ok "Dependencies already installed"
fi

# ── Generate Prisma client ────────────────────────────────────────────────────
log "Generating Prisma client..."
DATABASE_URL="$DATABASE_URL" npx prisma generate
ok "Prisma client generated"

# ── Run migrations ────────────────────────────────────────────────────────────
log "Applying database migrations..."
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy
ok "Migrations applied"

# ── Seed database ─────────────────────────────────────────────────────────────
if [[ "$SKIP_SEED" == "true" ]]; then
  warn "Seeding skipped (--skip-seed)"
else
  log "Seeding database (roles, permissions, superadmin, medicines)..."

  # Seed core data (roles, permissions, superadmin, company)
  DATABASE_URL="$DATABASE_URL" \
  ADMIN_USERNAME="${ADMIN_USERNAME:-SUPERADMIN}" \
  ADMIN_PASSWORD="$ADMIN_PASSWORD" \
    npx tsx prisma/seed.ts
  ok "Core seed completed"

  # Seed medicines (idempotent — safe to re-run)
  log "Seeding medicines catalog..."
  DATABASE_URL="$DATABASE_URL" npx tsx prisma/seed-medicines.ts
  ok "Medicines seed completed"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✓  Production setup complete!              ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════╝${NC}"
echo ""
log "Next steps:"
echo "  1. Build:  pnpm run build"
echo "  2. Start:  pnpm run start:prod"
echo ""
