# Disaster Recovery Playbook — Neokik Digital SaaS

## Automated Database Backups

### Daily PostgreSQL Backup (Cron)

```bash
# Add to root crontab: sudo crontab -e
0 3 * * * pg_dump -U neokik_admin neokik_saas | gzip > /opt/neokik/backups/db/neokik_$(date +\%Y\%m\%d_\%H\%M).sql.gz 2>> /var/log/neokik-backup.log
```

```bash
# Create backup directory
sudo mkdir -p /opt/neokik/backups/db
sudo chown neokik_admin:neokik_admin /opt/neokik/backups/db
```

### Retention Policy

Keep the last 7 daily backups:

```bash
# Add to crontab after the backup line
0 4 * * * find /opt/neokik/backups/db -name "neokik_*.sql.gz" -mtime +7 -delete
```

---

## Recovery Procedures

### Scenario 1: Database Corruption

```bash
# 1. Stop the application
pm2 stop neokik-api

# 2. Drop and recreate the database
sudo -u postgres psql -c "DROP DATABASE neokik_saas;"
sudo -u postgres psql -c "CREATE DATABASE neokik_saas OWNER neokik_admin;"

# 3. Restore from the most recent backup
LATEST_BACKUP=$(ls -t /opt/neokik/backups/db/neokik_*.sql.gz | head -1)
gunzip -c "$LATEST_BACKUP" | psql -U neokik_admin neokik_saas

# 4. Restart the application
pm2 restart neokik-api
```

### Scenario 2: Migration Interrupted Mid-Execution

When a client migration fails partway through, the system automatically triggers `rollbackMigration()` which:

1. **Removes Docker containers** created for the client domain
2. **Drops the MySQL database** created for the client site
3. **Deletes the client record** from the `clients` table (restores DB state)
4. **Cleans up extracted files** from the temporary directory

If the automatic rollback also fails, follow manual recovery:

```bash
# 1. Check migration status
psql -U neokik_admin neokik_saas -c "SELECT id, domain, status, rollback_step FROM migrations WHERE status = 'FAILED';"

# 2. Manual Docker cleanup
docker ps -a | grep <domain>
docker rm -f <container_id>

# 3. Manual database cleanup
mysql -u root -p -e "DROP DATABASE IF EXISTS db_<sanitized_domain>;"

# 4. Manual file cleanup
rm -rf /opt/neokik/backend/uploads/extracted/<migration_id>
rm -rf /var/www/neokik/<domain>

# 5. Reset migration status
psql -U neokik_admin neokik_saas -c "UPDATE migrations SET status = 'ROLLED_BACK' WHERE id = '<migration_id>';"
```

### Scenario 3: Application Won't Start

```bash
# 1. Check PM2 logs
pm2 logs neokik-api --lines 50

# 2. Common causes:
#    - Missing environment variables → Check .env file
#    - Database unreachable → Check PostgreSQL: sudo systemctl status postgresql
#    - Port conflict → Check: sudo lsof -i :5000

# 3. If configValidator blocks startup, review the error output for missing variables
```

### Scenario 4: Disk Space Full

```bash
# 1. Check disk usage
df -h
du -sh /opt/neokik/backend/uploads/migrations/*

# 2. Clean completed migration uploads (keep last 5)
ls -t /opt/neokik/backend/uploads/migrations/*.tar.gz | tail -n +6 | xargs rm -f

# 3. Clean PM2 logs
pm2 flush

# 4. Clean old database backups
find /opt/neokik/backups/db -name "*.sql.gz" -mtime +3 -delete
```

---

## Monitoring Checklist

| Check                    | Command                                      | Frequency |
|--------------------------|----------------------------------------------|-----------|
| API health               | `curl localhost:5000/api/health`              | Every 5m  |
| PM2 process status       | `pm2 status`                                 | Hourly    |
| Disk space               | `df -h /`                                    | Daily     |
| Database backup exists   | `ls -la /opt/neokik/backups/db/`             | Daily     |
| PostgreSQL connectivity  | `pg_isready -U neokik_admin`                 | Every 5m  |
| Docker container status  | `docker ps --format "{{.Names}}: {{.Status}}"` | Hourly  |

---

## Emergency Contacts

| Role               | Action                                        |
|---------------------|----------------------------------------------|
| Backend failure     | Check PM2 logs, restart with `pm2 restart`   |
| Database failure    | Follow Scenario 1 recovery procedure         |
| Migration failure   | Follow Scenario 2 recovery procedure         |
| Full disk           | Follow Scenario 4 cleanup procedure          |
