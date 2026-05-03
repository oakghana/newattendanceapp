import "server-only"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { emailService } from "./email-service"

interface BackupConfig {
  frequency: "hourly" | "daily" | "weekly"
  retentionDays: number
  includeAuditLogs: boolean
  notifyOnCompletion: boolean
  adminEmails: string[]
}

interface BackupResult {
  success: boolean
  backupId: string
  timestamp: string
  size: number
  tables: string[]
  error?: string
}

const BACKUP_EMAIL_WATERMARK_TEXT = "QCC-LOANLEAVE-APP"

function buildBackupWatermarkLayer(): string {
  const line = Array.from({ length: 3 }).map(() => BACKUP_EMAIL_WATERMARK_TEXT).join("   ")
  return `
    <div style="position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:1;">
      <div style="position:absolute;left:-10%;top:12%;width:140%;transform:rotate(-24deg);color:rgba(44,98,22,0.13);font-size:24px;font-weight:700;letter-spacing:1px;white-space:nowrap;">${line}</div>
      <div style="position:absolute;left:-10%;top:44%;width:140%;transform:rotate(-24deg);color:rgba(44,98,22,0.13);font-size:24px;font-weight:700;letter-spacing:1px;white-space:nowrap;">${line}</div>
      <div style="position:absolute;left:-10%;top:76%;width:140%;transform:rotate(-24deg);color:rgba(44,98,22,0.13);font-size:24px;font-weight:700;letter-spacing:1px;white-space:nowrap;">${line}</div>
    </div>
  `
}

function wrapBackupEmail(content: string): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; background: #ffffff;">
      <div style="position: relative; background: #f0f7ec; padding: 20px 22px;">
        ${buildBackupWatermarkLayer()}
        <div style="position: relative; z-index: 2;">
          ${content}
        </div>
      </div>
    </div>
  `
}

class BackupService {
  private static instance: BackupService
  private isRunning = false

  static getInstance(): BackupService {
    if (!BackupService.instance) {
      BackupService.instance = new BackupService()
    }
    return BackupService.instance
  }

  async createBackup(config: BackupConfig): Promise<BackupResult> {
    if (this.isRunning) {
      throw new Error("Backup already in progress")
    }

    this.isRunning = true
    const backupId = `backup_${Date.now()}`
    const timestamp = new Date().toISOString()

    try {
      console.log(`[BackupService] Starting backup: ${backupId}`)
      const supabase = await createAdminClient()

      // Define tables to backup.  We avoid querying pg_catalog via PostgREST
      // because the schema cache often doesn't expose system catalogs, leading
      // to errors such as "Could not find the table 'public.pg_catalog.pg_tables'".
      // Instead we maintain a hard-coded list of core tables.  New tables should
      // be added here or can be discovered by a separate migration script.
      const tables: string[] = [
        "user_profiles",
        "departments",
        "geofence_locations",
        "districts",
        "attendance_records",
        "schedules",
        "settings",
      ]

      // include audit_logs if requested; only added later when verifying
      if (config.includeAuditLogs) {
        tables.push("audit_logs")
      }

      // remove any tables that actually don't exist by probing with a simple select
      const verified: string[] = []
      for (const t of tables) {
        try {
          const { error: headErr } = await supabase.from(t).select("1").limit(1)
          if (headErr && headErr.code === "PGRST205") {
            console.warn(`[BackupService] Removing missing table ${t} from backup list`) 
            continue
          }
        } catch {
          // ignore other failures and assume table exists
        }
        verified.push(t)
      }
      tables.splice(0, tables.length, ...verified)

      if (!config.includeAuditLogs) {
        // remove audit_logs if the caller explicitly doesn't want it
        const idx = tables.indexOf("audit_logs")
        if (idx !== -1) tables.splice(idx, 1)
      }

      const backupData: Record<string, any[]> = {}
      let totalSize = 0

      // Backup each table (skip missing ones)
      const PAGE_SIZE = 1000
      for (const table of tables) {
        try {
          const rows: any[] = []
          let from = 0
          while (true) {
            const to = from + PAGE_SIZE - 1
            const { data, error } = await supabase.from(table).select("*").range(from, to)

            if (error) {
              if (error.code === "PGRST205" || error.message?.includes("Could not find the table")) {
                console.warn(`[BackupService] Table ${table} does not exist, skipping.`)
                break
              }
              console.error(`[BackupService] Error backing up table ${table} (range ${from}-${to}):`, error)
              break
            }

            if (data && data.length > 0) {
              rows.push(...data)
            }

            // If fewer than PAGE_SIZE rows returned, we've fetched all rows
            if (!data || data.length < PAGE_SIZE) {
              break
            }

            from += PAGE_SIZE
          }

          backupData[table] = rows
          totalSize += JSON.stringify(rows).length
          console.log(`[BackupService] Backed up ${rows.length} records from ${table}`)
        } catch (tableError: any) {
          if (tableError?.code === "PGRST205" || tableError?.message?.includes("Could not find the table")) {
            console.warn(`[BackupService] Table ${table} does not exist (exception), skipping.`)
            continue
          }
          console.error(`[BackupService] Failed to backup table ${table}:`, tableError)
        }
      }

      // Store backup metadata
      const backupMetadata = {
        id: backupId,
        timestamp,
        tables: Object.keys(backupData),
        record_counts: Object.fromEntries(
          Object.entries(backupData).map(([table, records]) => [table, records.length]),
        ),
        size_bytes: totalSize,
        config,
      }

      // Save backup to storage.  In the current implementation we persist the
      // entire payload (metadata + data) in the metadata column so that restore
      // can later pull the records directly.  In a production system this would
      // be stored in external cloud storage and only a reference kept here.
      await this.saveBackupToStorage(backupId, {
        metadata: backupMetadata,
        data: backupData,
      })

      // Clean up old backups
      await this.cleanupOldBackups(config.retentionDays)

      // Log backup completion
      await supabase.from("audit_logs").insert({
        user_id: null,
        action: "system_backup_completed",
        table_name: "system",
        details: { backup_id: backupId, tables: Object.keys(backupData) },
      })

      // Send notification if configured
      if (config.notifyOnCompletion && config.adminEmails.length > 0) {
        await this.notifyBackupCompletion(backupId, backupMetadata, config.adminEmails)
      }

      console.log(`[BackupService] Backup completed successfully: ${backupId}`)

      return {
        success: true,
        backupId,
        timestamp,
        size: totalSize,
        tables: Object.keys(backupData),
      }
    } catch (error) {
      console.error(`[BackupService] Backup failed:`, error)

      return {
        success: false,
        backupId,
        timestamp,
        size: 0,
        tables: [],
        error: error.message,
      }
    } finally {
      this.isRunning = false
    }
  }

  private async saveBackupToStorage(backupId: string, backupContent: any) {
    // In a real implementation, this would save to cloud storage (AWS S3, Google Cloud Storage, etc.)
    // For now, we'll simulate storage by logging the backup size
    const backupSize = JSON.stringify(backupContent).length
    console.log(`[BackupService] Backup ${backupId} saved to storage (${backupSize} bytes)`)

    // Store backup reference in database.  We keep the whole payload inside
    // metadata so that restores can access the data; the table already has a
    // JSONB metadata field and RLS policy restricting access to admins.
      const supabase = await createAdminClient()
    await supabase.from("system_backups").upsert({
      id: backupId,
      created_at: new Date().toISOString(),
      size_bytes: backupSize,
      status: "completed",
      metadata: backupContent, // contains both metadata and data
    })
  }

  private async cleanupOldBackups(retentionDays: number) {
    try {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays)

      const supabase = await createAdminClient()
      const { data: oldBackups } = await supabase
        .from("system_backups")
        .select("id")
        .lt("created_at", cutoffDate.toISOString())

      if (oldBackups && oldBackups.length > 0) {
        // Delete old backup records
        await supabase.from("system_backups").delete().lt("created_at", cutoffDate.toISOString())

        console.log(`[BackupService] Cleaned up ${oldBackups.length} old backups`)
      }
    } catch (error) {
      console.error("[BackupService] Failed to cleanup old backups:", error)
    }
  }

  private async notifyBackupCompletion(backupId: string, metadata: any, adminEmails: string[]) {
    const template = {
      subject: "QCC Attendance - Backup Completed Successfully",
      html: wrapBackupEmail(`
          <h2 style="color: #d97706;">System Backup Completed</h2>
          <p>A scheduled backup has been completed successfully.</p>
          <h3>Backup Details:</h3>
          <ul>
            <li><strong>Backup ID:</strong> {{backupId}}</li>
            <li><strong>Timestamp:</strong> {{timestamp}}</li>
            <li><strong>Size:</strong> {{sizeKB}} KB</li>
            <li><strong>Tables:</strong> {{tableCount}} tables backed up</li>
          </ul>
          <h3>Table Summary:</h3>
          <ul>
            {{tableSummary}}
          </ul>
          <hr style="margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">This is an automated notification from QCC Attendance System.</p>
      `),
      text: "System backup completed successfully. Backup ID: {{backupId}}, Size: {{sizeKB}} KB, Tables: {{tableCount}}",
    }

    const templateData = {
      backupId,
      timestamp: new Date(metadata.timestamp).toLocaleString(),
      sizeKB: Math.round(metadata.size_bytes / 1024),
      tableCount: metadata.tables.length,
      tableSummary: metadata.tables
        .map((table) => `<li>${table}: ${metadata.record_counts[table]} records</li>`)
        .join(""),
    }

    for (const email of adminEmails) {
      await emailService.sendEmail(email, template, templateData)
    }
  }

  async scheduleBackup(config: BackupConfig) {
    // In a real implementation, this would use a job scheduler like node-cron
    console.log(`[BackupService] Backup scheduled with frequency: ${config.frequency}`)

    // For demonstration, we'll create a backup immediately
    return await this.createBackup(config)
  }

  async getBackupHistory(limit = 10) {
    try {
      const supabase = await createAdminClient()
      const { data: backups } = await supabase
        .from("system_backups")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit)

      return backups || []
    } catch (error) {
      console.error("[BackupService] Failed to get backup history:", error)
      return []
    }
  }

  async restoreBackup(backupId: string): Promise<BackupResult> {
    const restoreStart = performance.now()
    const timestamp = new Date().toISOString()

    try {
      console.log(`[BackupService] Starting restore: ${backupId}`)
      const supabase = await createAdminClient()

      // Get backup data from storage (in real implementation, this would fetch from cloud storage)
      const { data: backupRecord, error: fetchError } = await supabase
        .from("system_backups")
        .select("metadata")
        .eq("id", backupId)
        .single()

      if (fetchError || !backupRecord) {
        throw new Error(`Backup ${backupId} not found`)
      }

      // We stored the full payload in the metadata column when creating the
      // backup, so extract it here.  For a real cloud‑storage solution you
      // would instead download the JSON from S3/Blob storage.
      const stored = backupRecord.metadata || {}
      const backupData = stored.data || {}

      // Restore all tables present in the backup payload.  We loop over the
      // keys rather than a fixed list so that new tables are automatically
      // handled.  The order here is not guaranteed; if you have strong
      // foreign‑key dependencies you may want to disable constraints or load
      // parent tables first.  For a simple restore this approach works.
      const tables = Object.keys(backupData)

      let totalRecords = 0

      // Restore each table
      for (const table of tables) {
        try {
          const records = backupData[table]
          if (records && Array.isArray(records)) {
            // Clear existing data; exclude placeholder rows if present
            await supabase.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000")

            // Insert backup data
            const { error: insertError } = await supabase
              .from(table)
              .insert(records)

            if (insertError) {
              console.error(`[BackupService] Error restoring table ${table}:`, insertError)
              continue
            }

            totalRecords += records.length
            console.log(`[BackupService] Restored ${records.length} records to ${table}`)
          }
        } catch (tableError) {
          console.error(`[BackupService] Failed to restore table ${table}:`, tableError)
        }
      }

      // Log restore completion
      await supabase.from("audit_logs").insert({
        user_id: null,
        action: "system_restore_completed",
        table_name: "system",
        details: { backup_id: backupId, records_restored: totalRecords },
      })

      console.log(`[BackupService] Restore completed successfully: ${backupId}`)

      return {
        success: true,
        backupId,
        timestamp,
        size: totalRecords, // Using record count as size indicator
        tables: tables.filter(table => backupData[table]),
      }
    } catch (error) {
      console.error(`[BackupService] Restore failed:`, error)

      return {
        success: false,
        backupId,
        timestamp,
        size: 0,
        tables: [],
        error: error.message,
      }
    }
  }
}

export const backupService = BackupService.getInstance()
export { BackupService }
