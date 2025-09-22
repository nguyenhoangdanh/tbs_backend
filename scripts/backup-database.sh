#!/bin/bash
set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

export PATH="/home/hoangdanh2000/.fly/bin:$PATH"

MODE=${1:-"production"}
BACKUP_DIR="backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo -e "${BLUE}💾 Database Backup Script${NC}"
echo "========================"

# Create backup directory
mkdir -p $BACKUP_DIR

backup_production() {
    echo -e "${BLUE}🌐 Backing up production database...${NC}"
    
    BACKUP_FILE="${BACKUP_DIR}/production_backup_${TIMESTAMP}.sql"
    
    echo -e "${BLUE}📦 Creating backup: $BACKUP_FILE${NC}"
    
    if flyctl postgres connect -a weekly-report-backend-db --command "pg_dump -h weekly-report-backend-db.flycast -U postgres weekly_report_backend" > $BACKUP_FILE; then
        echo -e "${GREEN}✅ Backup created successfully${NC}"
        echo -e "${BLUE}📁 Backup saved to: $BACKUP_FILE${NC}"
        echo -e "${BLUE}📊 Backup size: $(du -h $BACKUP_FILE | cut -f1)${NC}"
    else
        echo -e "${RED}❌ Backup failed${NC}"
        rm -f $BACKUP_FILE
        exit 1
    fi
}

backup_local() {
    echo -e "${BLUE}🏠 Backing up local database...${NC}"
    
    BACKUP_FILE="${BACKUP_DIR}/local_backup_${TIMESTAMP}.sql"
    
    echo -e "${BLUE}📦 Creating backup: $BACKUP_FILE${NC}"
    
    if docker compose exec postgres pg_dump -U postgres weekly_report_dev > $BACKUP_FILE; then
        echo -e "${GREEN}✅ Backup created successfully${NC}"
        echo -e "${BLUE}📁 Backup saved to: $BACKUP_FILE${NC}"
        echo -e "${BLUE}📊 Backup size: $(du -h $BACKUP_FILE | cut -f1)${NC}"
    else
        echo -e "${RED}❌ Backup failed${NC}"
        rm -f $BACKUP_FILE
        exit 1
    fi
}

case $MODE in
    "production")
        backup_production
        ;;
    "local")
        backup_local
        ;;
    *)
        echo -e "${RED}❌ Invalid mode: $MODE${NC}"
        echo -e "${BLUE}💡 Usage: ./scripts/backup-database.sh [local|production]${NC}"
        exit 1
        ;;
esac

echo -e "${BLUE}🗂️ Available backups:${NC}"
ls -la $BACKUP_DIR/
