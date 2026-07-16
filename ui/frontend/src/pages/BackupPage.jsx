import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL } from '../config'

// Backup: manual download, save-to-server, scheduling, and restore. Owns its own
// state; only needs the active tab to know when to (re)load its data.
function BackupPage({ activeTab }) {
  const [schedule, setSchedule] = useState({ enabled: false, cron: '0 2 * * *', retention_days: 7, next_run: null })
  const [backups, setBackups] = useState([])
  const [loadingSchedule, setLoadingSchedule] = useState(true)
  const [loadingBackups, setLoadingBackups] = useState(true)
  const [savingSchedule, setSavingSchedule] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [runningBackup, setRunningBackup] = useState(false)
  const [backupError, setBackupError] = useState(null)
  const [backupSuccess, setBackupSuccess] = useState(null)
  const [cronInput, setCronInput] = useState('0 2 * * *')
  const [restoring, setRestoring] = useState(false)
  const [restoreConfirm, setRestoreConfirm] = useState('')
  const [restoreTarget, setRestoreTarget] = useState('')

  const fetchSchedule = async () => {
    try {
      setLoadingSchedule(true)
      const res = await axios.get(`${API_BASE_URL}/api/backup/schedule`)
      setSchedule(res.data)
      setCronInput(res.data.cron || '0 2 * * *')
    } catch (err) {
      console.error('Failed to fetch schedule:', err)
    } finally {
      setLoadingSchedule(false)
    }
  }

  const fetchBackups = async () => {
    try {
      setLoadingBackups(true)
      const res = await axios.get(`${API_BASE_URL}/api/backup/list`)
      setBackups(res.data.backups || [])
    } catch (err) {
      console.error('Failed to fetch backups:', err)
    } finally {
      setLoadingBackups(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'backup') {
      fetchSchedule()
      fetchBackups()
    }
  }, [activeTab])

  const handleManualDownload = async () => {
    try {
      setDownloading(true)
      setBackupError(null)
      const res = await axios.get(`${API_BASE_URL}/api/backup/download`, { responseType: 'blob' })
      const blob = new Blob([res.data])
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ts = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').replace('T', '_')
      a.download = `dagster_backup_${ts}.dump`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      a.remove()
    } catch (err) {
      setBackupError(err.response?.data?.detail || err.message || 'Download failed')
    } finally {
      setDownloading(false)
    }
  }

  const handleRunServerBackup = async () => {
    try {
      setRunningBackup(true)
      setBackupError(null)
      setBackupSuccess(null)
      const res = await axios.post(`${API_BASE_URL}/api/backup/run`)
      setBackupSuccess(res.data.message)
      fetchBackups()
      fetchSchedule()
    } catch (err) {
      setBackupError(err.response?.data?.detail || err.message || 'Backup failed')
    } finally {
      setRunningBackup(false)
    }
  }

  const handleRestore = async () => {
    if (!restoreTarget || restoreConfirm !== 'RESTORE') return
    try {
      setRestoring(true)
      setBackupError(null)
      setBackupSuccess(null)
      await axios.post(`${API_BASE_URL}/api/backup/restore`, {
        filename: restoreTarget,
        confirm: 'RESTORE'
      })
      setBackupSuccess('Database restored successfully.')
      setRestoreConfirm('')
      setRestoreTarget('')
    } catch (err) {
      setBackupError(err.response?.data?.detail || err.message || 'Restore failed')
    } finally {
      setRestoring(false)
    }
  }

  const handleSaveSchedule = async () => {
    try {
      setSavingSchedule(true)
      setBackupError(null)
      await axios.post(`${API_BASE_URL}/api/backup/schedule`, {
        enabled: schedule.enabled,
        cron: cronInput.trim() || '0 2 * * *',
        retention_days: schedule.retention_days
      })
      fetchSchedule()
    } catch (err) {
      setBackupError(err.response?.data?.detail || err.message || 'Failed to save schedule')
    } finally {
      setSavingSchedule(false)
    }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  return (
    <div className="placeholder-page">
      <div className="header">
        <h1>Backup</h1>
        <p>Create manual backups or schedule automatic backups of your database.</p>
      </div>

      {backupError && (
        <div className="error" style={{ marginBottom: '20px' }}>{backupError}</div>
      )}
      {backupSuccess && (
        <div className="success" style={{ marginBottom: '20px' }}>{backupSuccess}</div>
      )}

      <div style={{ display: 'grid', gap: '30px' }}>
        {/* Manual Backup */}
        <div style={{ padding: '24px', border: '1px solid #dee2e6', borderRadius: '8px', backgroundColor: '#fff' }}>
          <h2 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.25rem' }}>Manual Backup</h2>
          <p style={{ color: '#6c757d', marginBottom: '16px', fontSize: '0.95rem' }}>
            Download a backup file directly to your browser. Uses pg_dump custom format (compressed).
          </p>
          <button
            className="btn btn-primary"
            onClick={handleManualDownload}
            disabled={downloading}
            style={{ marginRight: '12px' }}
          >
            {downloading ? 'Downloading...' : 'Download Backup'}
          </button>
        </div>

        {/* Run Backup to Server */}
        <div style={{ padding: '24px', border: '1px solid #dee2e6', borderRadius: '8px', backgroundColor: '#fff' }}>
          <h2 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.25rem' }}>Save to Server</h2>
          <p style={{ color: '#6c757d', marginBottom: '16px', fontSize: '0.95rem' }}>
            Create a backup and save it to local server storage ({'./backups'}). Retention rules apply.
          </p>
          <button
            className="btn btn-primary"
            onClick={handleRunServerBackup}
            disabled={runningBackup}
          >
            {runningBackup ? 'Creating Backup...' : 'Run Backup Now'}
          </button>
        </div>

        {/* Automatic Schedule */}
        <div style={{ padding: '24px', border: '1px solid #dee2e6', borderRadius: '8px', backgroundColor: '#fff' }}>
          <h2 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.25rem' }}>Automatic Backup Schedule</h2>
          <p style={{ color: '#6c757d', marginBottom: '16px', fontSize: '0.95rem' }}>
            Schedule backups to run automatically. Backups are saved to server storage.
          </p>
          {loadingSchedule ? (
            <div className="loading">Loading schedule...</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={schedule.enabled}
                  onChange={(e) => setSchedule({ ...schedule, enabled: e.target.checked })}
                />
                <span>Enable automatic backups</span>
              </label>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>Cron expression</label>
                <input
                  type="text"
                  value={cronInput}
                  onChange={(e) => setCronInput(e.target.value)}
                  placeholder="0 2 * * *"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', fontFamily: 'monospace' }}
                  title="minute hour day month weekday (e.g. 0 2 * * * = daily at 2am)"
                />
                <small style={{ color: '#6c757d', display: 'block', marginTop: '4px' }}>
                  Format: minute hour day month weekday. Example: 0 2 * * * = daily at 2:00 AM
                </small>
              </div>
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>Retention (days)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={schedule.retention_days}
                  onChange={(e) => setSchedule({ ...schedule, retention_days: parseInt(e.target.value, 10) || 7 })}
                  style={{ width: '120px', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px' }}
                />
                <small style={{ color: '#6c757d', display: 'block', marginTop: '4px' }}>
                  Delete backups older than this many days (1–90)
                </small>
              </div>
              {schedule.next_run && (
                <p style={{ margin: 0, color: '#495057', fontSize: '0.9rem' }}>
                  Next backup: {formatDate(schedule.next_run)}
                </p>
              )}
              <button
                className="btn btn-primary"
                onClick={handleSaveSchedule}
                disabled={savingSchedule}
              >
                {savingSchedule ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          )}
        </div>

        {/* Backups List */}
        <div style={{ padding: '24px', border: '1px solid #dee2e6', borderRadius: '8px', backgroundColor: '#fff' }}>
          <h2 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.25rem' }}>Server Backups</h2>
          <p style={{ color: '#6c757d', marginBottom: '16px', fontSize: '0.95rem' }}>
            Backups saved to local server storage.
          </p>
          {loadingBackups ? (
            <div className="loading">Loading backups...</div>
          ) : backups.length === 0 ? (
            <p style={{ color: '#6c757d', margin: 0 }}>No backups yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Filename</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px' }}>Size</th>
                  <th style={{ textAlign: 'left', padding: '10px 12px' }}>Created</th>
                  <th style={{ textAlign: 'right', padding: '10px 12px', width: '100px' }}></th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '0.9rem' }}>{b.filename}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>{formatSize(b.size_bytes)}</td>
                    <td style={{ padding: '10px 12px' }}>{formatDate(b.created)}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                      <button
                        className="btn"
                        onClick={() => setRestoreTarget(restoreTarget === b.filename ? '' : b.filename)}
                        style={{
                          padding: '4px 10px',
                          fontSize: '0.85rem',
                          backgroundColor: restoreTarget === b.filename ? '#0d6efd' : undefined,
                          color: restoreTarget === b.filename ? '#fff' : undefined
                        }}
                      >
                        {restoreTarget === b.filename ? 'Selected' : 'Restore'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Restore from Backup */}
        {backups.length > 0 && (
          <div style={{ padding: '24px', border: '1px solid #dee2e6', borderRadius: '8px', backgroundColor: '#fff', borderColor: '#dc3545' }}>
            <h2 style={{ marginTop: 0, marginBottom: '12px', fontSize: '1.25rem', color: '#dc3545' }}>Restore from Backup</h2>
            <p style={{ color: '#6c757d', marginBottom: '16px', fontSize: '0.95rem' }}>
              Restore overwrites the current database. Select a backup above, type RESTORE to confirm, then click Restore.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '400px' }}>
              {restoreTarget && (
                <p style={{ margin: 0, fontWeight: 500 }}>Selected: <code style={{ fontSize: '0.9rem' }}>{restoreTarget}</code></p>
              )}
              <div>
                <label style={{ display: 'block', marginBottom: '6px', fontWeight: 500 }}>Type RESTORE to confirm</label>
                <input
                  type="text"
                  value={restoreConfirm}
                  onChange={(e) => setRestoreConfirm(e.target.value)}
                  placeholder="RESTORE"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', fontFamily: 'monospace' }}
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={handleRestore}
                disabled={restoring || restoreConfirm !== 'RESTORE' || !restoreTarget}
                style={{ backgroundColor: restoreConfirm === 'RESTORE' ? '#dc3545' : undefined, maxWidth: '200px' }}
              >
                {restoring ? 'Restoring...' : 'Restore Database'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default BackupPage
