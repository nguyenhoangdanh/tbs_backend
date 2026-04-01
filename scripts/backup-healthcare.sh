#!/usr/bin/env bash
# =============================================================================
# backup-healthcare.sh
# Backup all healthcare-related tables from production PostgreSQL.
# Usage: ./scripts/backup-healthcare.sh [--env .env.production] [--out-dir ./prisma/backup]
#
# Output: prisma/backup/healthcare_YYYYMMDD_HHMMSS.sql
# Restore: psql "$DATABASE_URL" < prisma/backup/healthcare_YYYYMMDD_HHMMSS.sql
# =============================================================================

set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
log()   { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Defaults ──────────────────────────────────────────────────────────────────
ENV_FILE=".env.production"
OUT_DIR="prisma/backup"

for arg in "$@"; do
  case $arg in
    --env=*)    ENV_FILE="${arg#*=}" ;;
    --out-dir=*) OUT_DIR="${arg#*=}" ;;
    --help|-h)
      echo "Usage: $0 [--env=.env.production] [--out-dir=prisma/backup]"
      exit 0 ;;
  esac
done

# ── Locate repo root ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

# ── Load env ──────────────────────────────────────────────────────────────────
[[ -f "$ENV_FILE" ]] || die "Env file '$ENV_FILE' not found"
set -a; source "$ENV_FILE"; set +a
[[ -n "${DATABASE_URL:-}" ]] || die "DATABASE_URL is not set in $ENV_FILE"

# ── Check pg_dump ─────────────────────────────────────────────────────────────
command -v pg_dump &>/dev/null || die "pg_dump not found — install postgresql-client"

# ── Prepare output dir ────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUT_FILE="$OUT_DIR/healthcare_${TIMESTAMP}.sql"

# ── Healthcare tables ─────────────────────────────────────────────────────────
# All 6 tables that are live in production
TABLES=(
  medicine_categories
  medicines
  medical_records
  medical_prescriptions
  medicine_inventories
  inventory_transactions
)

log "Backing up healthcare data from: ${DATABASE_URL%%@*}@***"
log "Tables: ${TABLES[*]}"
log "Output: $OUT_FILE"

# Build --table args
TABLE_ARGS=()
for t in "${TABLES[@]}"; do
  TABLE_ARGS+=("--table=$t")
done

# pg_dump: data-only (--data-only), plain SQL (--format=plain), include TRUNCATE for clean restore
pg_dump \
  --data-only \
  --format=plain \
  --no-owner \
  --no-acl \
  --disable-triggers \
  "${TABLE_ARGS[@]}" \
  "$DATABASE_URL" \
  > "$OUT_FILE"

SIZE=$(wc -c < "$OUT_FILE" | tr -d ' ')
ROWS=$(grep -c "^INSERT INTO\|^COPY " "$OUT_FILE" 2>/dev/null || echo "?")

ok "Backup complete: $OUT_FILE (${SIZE} bytes)"
log "Sections in backup: ${ROWS}"

# ── Keep only last 10 backups ─────────────────────────────────────────────────
BACKUP_COUNT=$(ls "$OUT_DIR"/healthcare_*.sql 2>/dev/null | wc -l)
if [[ "$BACKUP_COUNT" -gt 10 ]]; then
  OLDEST=$(ls -t "$OUT_DIR"/healthcare_*.sql | tail -n +11)
  for f in $OLDEST; do
    rm "$f"
    warn "Removed old backup: $f"
  done
fi

echo "$OUT_FILE"
