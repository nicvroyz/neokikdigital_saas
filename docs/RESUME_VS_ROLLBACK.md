# Migration Recovery Policy — Resume vs. Rollback (SaaS v1.0)

This document describes how the Neokik Digital SaaS handles interruptions (such as backend server crashes, power cuts, or manual restarts) during each step of a migration transaction.

---

## Overview

When the backend restarts, the background job processor (`workerProcessor.ts`) automatically invokes the crash recovery check (`recoverCrashedJobs()`).

```
Server Boot
    │
    ▼
recoverCrashedJobs()
    │
    ▼
Find jobs in 'PROCESSING' status
    │
    ├─────────────────────────────┐
    ▼                             ▼
Set Job to 'FAILED'          Execute Rollback for Job Reference
(Server crash reason)        (Cleans up unfinished infrastructure)
```

The system takes a **safe transactional rollback** approach: rather than resuming a partially completed step from the middle (which could leave state inconsistencies), the recovery engine marks the job as **FAILED** and executes **rollback** up to the last successful checkpoint. This guarantees that no orphaned databases, Docker containers, or temporary files remain on the host VPS.

---

## Step-by-Step Recovery Actions

| Step | Operation | Risk | Recovery Policy | Automatic Rollback Actions |
|---|---|---|---|---|
| **Step 1** | **Backup Extraction** (`backup:extracting`) | Partially extracted `.tar.gz` files on disk. | **Rollback** | Deletes the extracted temporary directory `/opt/neokik/backend/uploads/extracted/<migration_id>` completely. |
| **Step 2** | **MySQL Import** (`database:restoring`) | Partial SQL database tables or incomplete schema. | **Rollback** | Drops the partial database `db_<domain>` and the associated MySQL user. Cleans up temporary files. |
| **Step 3** | **Docker Web Container** (`container:creating`) | Contenedor web created but not fully configured. | **Rollback** | Stops and removes the Docker container. Drops the MySQL database. Cleans up extracted files. |
| **Step 4** | **Caddy Reverse Proxy & SSL** (`ssl:generating`) | Caddy reload interrupted. | **Rollback** | Restores Caddy configurations. Stops and removes the Docker container. Drops the MySQL database. Cleans up files. |
| **Step 5** | **Mailbox Creation & Copy** (`mailcow:restoring`) | Mailbox created in Mailcow, but message copy interrupted (partial emails). | **Rollback** | Removes created mailboxes and domain via Mailcow API. Restores Caddy. Removes web container. Drops database. Cleans files. |
| **Step 6** | **Health Checks & Finish** (`health_check`) | Web app is up, but checks not fully validated. | **Rollback** | Runs full rollback back to clean state. |

---

## Why Resume is Not Recommended for Incomplete Steps

1. **MySQL Database State Consistency**: Re-running a SQL dump import over a partially imported database will fail with `Table already exists` or insert duplicate rows unless complex table drop checks are written. Dropping the database and re-creating it is faster and 100% reliable.
2. **Docker Port / Label Collisions**: If a container run command was interrupted, the container might remain in a `stopped` or `dead` state. Running it again under the same name causes a name collision error in Docker. The rollback safely removes the existing container name first.
3. **Mailcow Mailbox State**: Incomplete `docker cp` file copies leave Maildirs in a corrupted state, causing Dovecot index mismatches. Deleting the mailbox and recreation ensures no corrupted mailboxes go live.

---

## How to Resume a Failed Migration

Since the system guarantees a clean rollback to a 100% clean state, the user can safely re-trigger the migration:

1. Go to the **Migrations** panel in the administrative dashboard.
2. Select the failed migration (which will be marked as `FAILED` or `ROLLED_BACK`).
3. Click **Retry Migration** to restart the process from Step 1.
