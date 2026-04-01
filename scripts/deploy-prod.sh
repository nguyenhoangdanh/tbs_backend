#!/usr/bin/env bash
# =============================================================================
# deploy-prod.sh
# Safe production deployment with pre-migration backup.
#
# Flow:
#   1. Backup healthcare data  (safety net — migrate is non-destructive but just in case)
#   2. prisma generate         (regenerate client from new schema)
#   3. prisma migrate deploy   (apply pending migrations — data-safe)
#   4. seed                    (idempotent upserts — safe to re-run)
#   5. [optional] build        (pnpm build)
#
# Usage:
#   ./scripts/deploy-prod.sh [--skip-backup] [--skip-seed] [--skip-build]
#   ./scripts/deploy-prod.sh --help
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()   { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }
step()  { echo ""; echo -e "${BLUE}━━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

# ── Args ──────────────────────────────────────────────────────────────────────
SKIP_BACKUP=false
SKIP_SEED=false
SKIP_BUILD=false

for arg in "$@"; do
  case $arg in
    --skip-backup) SKIP_BACKUP=true ;;
    --skip-seed)   SKIP_SEED=true ;;
    --skip-build)  SKIP_BUILD=true ;;
    --help|-h)
      echo "Usage: $0 [--skip-backup] [--skip-seed] [--skip-build]"
      echo ""
      echo "  --skip-backup  Skip pre-migration healthcare backup"
      echo "  --skip-seed    Skip seeding after migration"
      echo "  --skip-build   Skip pnpm build"
      echo ""
      echo "Flow: backup → generate → migrate → seed → build"
      exit 0 ;;
    *) die "Unknown argument: $arg" ;;
  esac
done

# ── Locate repo root ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   TBS Management — Safe Production Deploy         ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════╝${NC}"
echo ""

# ── Load .env.production ──────────────────────────────────────────────────────
ENV_FILE=".env.production"
[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE"
set -a; source "$ENV_FILE"; set +a
[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL not set in $ENV_FILE"
[[ -n "${JWT_SECRET:-}" ]]   || die "JWT_SECRET not set in $ENV_FILE"
ok "Environment loaded from $ENV_FILE"

# ── Dependencies ──────────────────────────────────────────────────────────────
step "Checking dependencies"
command -v node &>/dev/null || die "node not found"
command -v pnpm &>/dev/null || npm install -g pnpm
if [[ ! -d node_modules ]]; then
  log "Installing dependencies..."
  pnpm install --frozen-lockfile
fi
ok "Dependencies ready"

# ── Step 1: Backup healthcare data ────────────────────────────────────────────
step "Step 1/4 — Healthcare backup"
if [[ "$SKIP_BACKUP" == "true" ]]; then
  warn "Backup skipped (--skip-backup)"
elif ! command -v pg_dump &>/dev/null; then
  warn "pg_dump not found — skipping backup. Install postgresql-client for automatic backups."
else
  log "Running pre-migration backup..."
  BACKUP_FILE=$(bash "$SCRIPT_DIR/backup-healthcare.sh" --env="$ENV_FILE")
  ok "Healthcare data backed up → $BACKUP_FILE"
  echo ""
  echo -e "  ${YELLOW}⚠  If migration fails, restore with:${NC}"
  echo -e "  ${YELLOW}   psql \"\$DATABASE_URL\" < $BACKUP_FILE${NC}"
  echo ""
fi

# ── Step 2: Prisma generate ───────────────────────────────────────────────────
step "Step 2/4 — Prisma generate"
log "Regenerating Prisma client from schema..."
DATABASE_URL="$DATABASE_URL" npx prisma generate
ok "Prisma client generated"

# ── Step 3: Prisma migrate deploy ─────────────────────────────────────────────
step "Step 3/4 — Apply migrations"
log "Applying pending migrations (non-destructive)..."
DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy
ok "Migrations applied"

# ── Step 4: Seed ──────────────────────────────────────────────────────────────
step "Step 4/4 — Seed (idempotent)"
if [[ "$SKIP_SEED" == "true" ]]; then
  warn "Seeding skipped (--skip-seed)"
else
  log "Running seed (upserts only — safe to re-run)..."
  DATABASE_URL="$DATABASE_URL" \
  ADMIN_USERNAME="${ADMIN_USERNAME:-SUPERADMIN}" \
  ADMIN_PASSWORD="${ADMIN_PASSWORD:-}" \
    npx tsx prisma/seed.ts
  ok "Seed complete"
fi

# ── Step 5: Build ─────────────────────────────────────────────────────────────
if [[ "$SKIP_BUILD" == "false" ]]; then
  step "Step 5 — Build"
  log "Building application..."
  pnpm run build
  ok "Build complete"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   ✓  Deployment complete!                         ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════╝${NC}"
echo ""
log "Start server: pnpm start:prod"
