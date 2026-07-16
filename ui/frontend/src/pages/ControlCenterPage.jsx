import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL } from '../config'

// Control Center: data ingestion triggers, connection health, and the category
// catalog. Manages its own local state; shared job/warning state and the
// error/success banners are passed in from App.
function ControlCenterPage({
  error,
  success,
  loadingInitStatus,
  needsInitialization,
  handleTriggerInitialization,
  triggeringInit,
  handleTriggerIngestAndPredict,
  triggeringIngest,
  warnings,
  warningsError,
  loadingWarnings,
  fetchWarnings,
  onCategoriesChanged,
}) {
  const [connections, setConnections] = useState([])
  const [loadingConnections, setLoadingConnections] = useState(true)
  const [connectionsError, setConnectionsError] = useState(null)
  const [catalogCategories, setCatalogCategories] = useState([])
  const [loadingCatalogCategories, setLoadingCatalogCategories] = useState(true)
  const [catalogError, setCatalogError] = useState(null)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [updatingCategory, setUpdatingCategory] = useState(null)

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'Unknown time'
    try {
      // Dagster timestamps are in milliseconds as strings, convert to number
      const timestampNum = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp
      const date = new Date(timestampNum)

      // Check if date is valid
      if (isNaN(date.getTime())) {
        return 'Unknown time'
      }

      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return 'Unknown time'
    }
  }

  const formatDateOnly = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString.includes('T') ? dateString : `${dateString}T00:00:00`)
    if (isNaN(date.getTime())) return dateString
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const fetchConnections = async () => {
    try {
      setLoadingConnections(true)
      setConnectionsError(null)
      const response = await axios.get(`${API_BASE_URL}/api/control-center/connections`)
      setConnections(response.data.connections || [])
    } catch (err) {
      setConnectionsError(`Failed to load connections: ${err.message}`)
    } finally {
      setLoadingConnections(false)
    }
  }

  const fetchCatalogCategories = async () => {
    try {
      setLoadingCatalogCategories(true)
      setCatalogError(null)
      const response = await axios.get(`${API_BASE_URL}/api/categories`)
      setCatalogCategories(response.data || [])
    } catch (err) {
      setCatalogError(`Failed to load categories: ${err.message}`)
    } finally {
      setLoadingCatalogCategories(false)
    }
  }

  useEffect(() => {
    fetchConnections()
    fetchCatalogCategories()
  }, [])

  const handleAddCategory = async (e) => {
    e.preventDefault()
    const trimmed = newCategoryName.trim()
    if (!trimmed) return

    try {
      setAddingCategory(true)
      setCatalogError(null)
      await axios.post(`${API_BASE_URL}/api/categories`, { name: trimmed })
      setNewCategoryName('')
      await fetchCatalogCategories()
      await onCategoriesChanged()
    } catch (err) {
      setCatalogError(err.response?.data?.detail || err.message)
    } finally {
      setAddingCategory(false)
    }
  }

  const handleToggleCategoryActive = async (categoryName, isActive) => {
    try {
      setUpdatingCategory(categoryName)
      setCatalogError(null)
      const response = await axios.put(`${API_BASE_URL}/api/categories/${encodeURIComponent(categoryName)}/active`, {
        is_active: isActive,
      })
      setCatalogCategories((prev) =>
        prev.map((cat) => (cat.name === categoryName ? response.data : cat))
      )
      await onCategoriesChanged()
    } catch (err) {
      setCatalogError(err.response?.data?.detail || err.message)
    } finally {
      setUpdatingCategory(null)
    }
  }

  const getHealthBadgeStyle = (status) => {
    if (status === 'healthy') {
      return { backgroundColor: '#d4edda', color: '#155724', border: '1px solid #c3e6cb' }
    }
    if (status === 'warning') {
      return { backgroundColor: '#fff3cd', color: '#856404', border: '1px solid #ffeeba' }
    }
    return { backgroundColor: '#f8d7da', color: '#721c24', border: '1px solid #f5c6cb' }
  }

  const formatLoadCoverage = (conn) => {
    const parts = []
    if (conn.lookback_days != null) {
      parts.push(`~${conn.lookback_days}d window`)
    }
    if (conn.buffer_days != null && conn.buffer_days > 0) {
      parts.push(`${conn.buffer_days}d until history loss`)
    } else if (conn.buffer_days != null && conn.buffer_days <= 0) {
      parts.push(`${Math.abs(conn.buffer_days)}d past edge (stored)`)
    }
    return parts.length > 0 ? parts.join(' · ') : null
  }

  const cardStyle = {
    background: 'white',
    padding: '30px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
    marginBottom: '30px',
  }

  return (
    <div className="placeholder-page">
      <div className="header">
        <h1>Control Center</h1>
        <p>Manage data ingestion, connections, categories, and system status.</p>
      </div>

      {/* Initialization Section - Only shows when needed */}
      {!loadingInitStatus && needsInitialization && (
        <div style={{ 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', 
          padding: '30px', 
          borderRadius: '8px', 
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          marginBottom: '30px',
          color: 'white'
        }}>
          <h2 style={{ marginTop: 0, marginBottom: '15px', fontSize: '1.75rem', color: 'white' }}>
            🚀 Welcome! Let's Get Started
          </h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.95)', marginBottom: '20px', fontSize: '1.05rem', lineHeight: '1.6' }}>
            It looks like this is your first time using the app. Click the button below to initialize the pipeline. 
            This will set up all the necessary tables, run your dbt models, and prepare everything for transaction categorization.
          </p>
          <p style={{ color: 'rgba(255, 255, 255, 0.9)', marginBottom: '25px', fontSize: '0.95rem', fontStyle: 'italic' }}>
            This process may take several minutes depending on the amount of data. Please be patient.
          </p>
          
          {error && (
            <div className="error" style={{ marginBottom: '15px', backgroundColor: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)' }}>{error}</div>
          )}
          
          {success && (
            <div className="success" style={{ marginBottom: '15px', backgroundColor: 'rgba(255, 255, 255, 0.2)', border: '1px solid rgba(255, 255, 255, 0.3)' }}>{success}</div>
          )}

          <button
            className="btn btn-primary"
            onClick={handleTriggerInitialization}
            disabled={triggeringInit}
            style={{
              padding: '14px 32px',
              backgroundColor: 'white',
              color: '#667eea',
              border: 'none',
              borderRadius: '6px',
              cursor: triggeringInit ? 'not-allowed' : 'pointer',
              fontSize: '1.1rem',
              fontWeight: '600',
              opacity: triggeringInit ? 0.7 : 1,
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (!triggeringInit) {
                e.target.style.transform = 'translateY(-2px)'
                e.target.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)'
              }
            }}
            onMouseLeave={(e) => {
              if (!triggeringInit) {
                e.target.style.transform = 'translateY(0)'
                e.target.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)'
              }
            }}
          >
            {triggeringInit ? 'Initializing...' : 'Initialize Pipeline'}
          </button>
        </div>
      )}

      {/* Job Trigger Section */}
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: '15px', fontSize: '1.5rem' }}>Data Ingestion</h2>
        <p style={{ color: '#6c757d', marginBottom: '20px' }}>
          Trigger the ingest and predict job to fetch new transactions from SimpleFIN and generate category predictions.
        </p>
        
        {error && (
          <div className="error" style={{ marginBottom: '15px' }}>{error}</div>
        )}
        
        {success && (
          <div className="success" style={{ marginBottom: '15px' }}>{success}</div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleTriggerIngestAndPredict}
          disabled={triggeringIngest}
          style={{
            padding: '12px 24px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: triggeringIngest ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            fontWeight: '500',
            opacity: triggeringIngest ? 0.6 : 1
          }}
        >
          {triggeringIngest ? 'Triggering Job...' : 'Run Ingest & Predict Job'}
        </button>
      </div>

      {/* Connections Section */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.5rem' }}>Connections</h2>
          <button
            onClick={fetchConnections}
            disabled={loadingConnections}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loadingConnections ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              opacity: loadingConnections ? 0.6 : 1
            }}
          >
            {loadingConnections ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <p style={{ color: '#6c757d', marginBottom: '20px' }}>
          Health reflects how much history buffer remains before stored transactions hit each
          institution&apos;s rolling window (warning at 30 days, unhealthy at 14).
        </p>

        {connectionsError && (
          <div className="error" style={{ marginBottom: '15px' }}>{connectionsError}</div>
        )}

        {loadingConnections ? (
          <div className="loading" style={{ padding: '20px' }}>Loading connections...</div>
        ) : connections.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#6c757d', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            No connections found. Run ingest to load SimpleFIN data.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Institution</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Account</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Health</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Last Load</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Latest Transaction</th>
                </tr>
              </thead>
              <tbody>
                {connections.map((conn) => {
                  const coverage = formatLoadCoverage(conn)
                  return (
                  <tr key={`${conn.institution_name}-${conn.account_name}`} style={{ borderBottom: '1px solid #dee2e6' }}>
                    <td style={{ padding: '10px' }}>{conn.institution_name || '-'}</td>
                    <td style={{ padding: '10px' }}>{conn.account_name || conn.account_id || '-'}</td>
                    <td style={{ padding: '10px' }}>
                      <span
                        title={conn.health_message || ''}
                        style={{
                          ...getHealthBadgeStyle(conn.health_status),
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '0.8rem',
                          fontWeight: '600',
                          textTransform: 'capitalize',
                          display: 'inline-block',
                          cursor: conn.health_message ? 'help' : 'default',
                        }}
                      >
                        {conn.health_status || 'unknown'}
                      </span>
                    </td>
                    <td style={{ padding: '10px' }}>
                      {formatDateOnly(conn.last_successful_load)}
                      {conn.days_since_last_load != null && (
                        <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                          {conn.days_since_last_load} day{conn.days_since_last_load === 1 ? '' : 's'} ago
                        </div>
                      )}
                      {coverage && (
                        <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '2px' }}>
                          {coverage}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {formatDateOnly(conn.latest_transaction_date)}
                      {conn.days_since_latest_transaction != null && (
                        <div style={{ fontSize: '0.75rem', color: '#6c757d' }}>
                          {conn.days_since_latest_transaction} day{conn.days_since_latest_transaction === 1 ? '' : 's'} ago
                        </div>
                      )}
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Categories Section */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.5rem' }}>Categories</h2>
          <button
            onClick={fetchCatalogCategories}
            disabled={loadingCatalogCategories}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loadingCatalogCategories ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              opacity: loadingCatalogCategories ? 0.6 : 1
            }}
          >
            {loadingCatalogCategories ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <p style={{ color: '#6c757d', marginBottom: '20px' }}>
          Manage categories available in dropdowns. Deactivating hides a category from new assignments but leaves existing transactions unchanged.
        </p>

        {catalogError && (
          <div className="error" style={{ marginBottom: '15px' }}>{catalogError}</div>
        )}

        <form onSubmit={handleAddCategory} style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Add new category..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            style={{ padding: '8px 12px', border: '1px solid #ced4da', borderRadius: '4px', minWidth: '240px', flex: '1' }}
          />
          <button
            type="submit"
            className="btn btn-primary"
            disabled={addingCategory || !newCategoryName.trim()}
            style={{ padding: '8px 16px' }}
          >
            {addingCategory ? 'Adding...' : 'Add Category'}
          </button>
        </form>

        {loadingCatalogCategories ? (
          <div className="loading" style={{ padding: '20px' }}>Loading categories...</div>
        ) : (
          <div style={{ maxHeight: '360px', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8f9fa', borderBottom: '2px solid #dee2e6' }}>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Category</th>
                  <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
                  <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {catalogCategories.map((cat) => (
                  <tr key={cat.name} style={{ borderBottom: '1px solid #dee2e6', opacity: cat.is_active ? 1 : 0.65 }}>
                    <td style={{ padding: '10px' }}>{cat.name}</td>
                    <td style={{ padding: '10px' }}>
                      <span style={{ display: 'inline-flex', gap: '6px', flexWrap: 'wrap' }}>
                        {cat.is_default && (
                          <span style={{ backgroundColor: '#e7f3ff', color: '#004085', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>Default</span>
                        )}
                        {!cat.is_default && (
                          <span style={{ backgroundColor: '#f1f3f5', color: '#495057', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>Custom</span>
                        )}
                        {cat.in_use && (
                          <span style={{ backgroundColor: '#d4edda', color: '#155724', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>In use</span>
                        )}
                        {!cat.is_active && (
                          <span style={{ backgroundColor: '#f8d7da', color: '#721c24', padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem' }}>Inactive</span>
                        )}
                      </span>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {cat.is_active ? (
                        <button
                          type="button"
                          onClick={() => handleToggleCategoryActive(cat.name, false)}
                          disabled={updatingCategory === cat.name}
                          style={{ padding: '6px 12px', border: '1px solid #ced4da', borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '0.875rem' }}
                        >
                          {updatingCategory === cat.name ? 'Updating...' : 'Deactivate'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleToggleCategoryActive(cat.name, true)}
                          disabled={updatingCategory === cat.name}
                          style={{ padding: '6px 12px', border: '1px solid #28a745', borderRadius: '4px', background: '#28a745', color: 'white', cursor: 'pointer', fontSize: '0.875rem' }}
                        >
                          {updatingCategory === cat.name ? 'Updating...' : 'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Connection Error Instructions Section */}
      <div style={{ 
        background: 'white', 
        padding: '30px', 
        borderRadius: '8px', 
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        marginBottom: '30px'
      }}>
        <h2 style={{ marginTop: 0, fontSize: '1.5rem', marginBottom: '15px' }}>Connection Error Instructions</h2>
        <div style={{ 
          padding: '20px', 
          backgroundColor: '#f8f9fa', 
          borderRadius: '4px',
          border: '1px solid #dee2e6'
        }}>
          <p style={{ color: '#495057', margin: 0, lineHeight: '1.6' }}>
            If you see any Connection Errors - navigate to your SimpleFIN account page and reconnect to the accounts with errors: <a href="https://beta-bridge.simplefin.org/my-account" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff', textDecoration: 'underline' }}>https://beta-bridge.simplefin.org/my-account</a> and then rerun this job.
          </p>
        </div>
      </div>

      {/* Warnings Section */}
      <div style={{ 
        background: 'white', 
        padding: '30px', 
        borderRadius: '8px', 
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
        marginBottom: '30px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.5rem' }}>SimpleFIN Warnings</h2>
          <button
            onClick={fetchWarnings}
            disabled={loadingWarnings}
            style={{
              padding: '8px 16px',
              backgroundColor: '#6c757d',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loadingWarnings ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem',
              opacity: loadingWarnings ? 0.6 : 1
            }}
          >
            {loadingWarnings ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {warningsError && (
          <div className="error" style={{ marginBottom: '15px' }}>{warningsError}</div>
        )}

        {loadingWarnings ? (
          <div className="loading" style={{ padding: '20px' }}>Loading warnings...</div>
        ) : warnings.length === 0 ? (
          <div style={{ 
            padding: '20px', 
            textAlign: 'center', 
            color: '#6c757d',
            backgroundColor: '#f8f9fa',
            borderRadius: '4px'
          }}>
            <p style={{ margin: 0 }}>✅ No warnings found. All systems operational.</p>
          </div>
        ) : (
          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {warnings.map((warning, index) => (
              <div
                key={index}
                style={{
                  padding: '15px',
                  marginBottom: '10px',
                  backgroundColor: '#fff3cd',
                  border: '1px solid #ffc107',
                  borderRadius: '4px',
                  borderLeft: '4px solid #ffc107'
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start',
                  marginBottom: '8px'
                }}>
                  <div style={{ fontWeight: '500', color: '#856404' }}>
                    ⚠️ Warning
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#6c757d' }}>
                    {formatTimestamp(warning.timestamp)}
                  </div>
                </div>
                <div style={{ color: '#856404', fontSize: '0.95rem' }}>
                  {warning.message}
                </div>
                {warning.run_id && (
                  <div style={{ fontSize: '0.75rem', color: '#6c757d', marginTop: '8px' }}>
                    Run ID: {warning.run_id}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ControlCenterPage
