import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { API_BASE_URL } from '../config'
import { getCategoryColor } from '../utils/format.jsx'

// All Data: browse validated transactions with an inline category editor.
// Owns its own data/filter/editor state; the two shared render helpers
// (excluded indicator + details cell) are passed in from App so behavior and
// styling stay identical to the other table.
function AllDataPage({ renderExcludedIndicator, renderTransactionDetailsCell }) {
  const [validatedTransactions, setValidatedTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [editorMode, setEditorMode] = useState(false)
  const [editorCategories, setEditorCategories] = useState([])
  const [pendingCategoryEdits, setPendingCategoryEdits] = useState({})
  const [savingEditorChanges, setSavingEditorChanges] = useState(false)
  const [sortBy, setSortBy] = useState('transacted_date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [accountFilterInput, setAccountFilterInput] = useState('') // What user is typing
  const [accountFilter, setAccountFilter] = useState('') // Debounced value for API calls
  const [descriptionFilterInput, setDescriptionFilterInput] = useState('') // What user is typing
  const [descriptionFilter, setDescriptionFilter] = useState('') // Debounced value for API calls
  const [availableCategories, setAvailableCategories] = useState([])
  const [showNotes, setShowNotes] = useState(false)
  const [notes, setNotes] = useState({})
  const [excludeFromForecast, setExcludeFromForecast] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(100) // Records per page
  const [totalCount, setTotalCount] = useState(0)

  // Debounce the account filter input
  useEffect(() => {
    const timer = setTimeout(() => {
      setAccountFilter(accountFilterInput)
    }, 300) // Wait 300ms after user stops typing

    return () => clearTimeout(timer)
  }, [accountFilterInput])

  // Debounce the description filter input
  useEffect(() => {
    if (descriptionFilterInput === '') {
      // If clearing the filter, update immediately
      setDescriptionFilter('')
      return
    }
    
    const timer = setTimeout(() => {
      setDescriptionFilter(descriptionFilterInput)
      // Reset to first page when filter changes
      if (descriptionFilterInput !== descriptionFilter) {
        setCurrentPage(1)
      }
    }, 1000) // Wait 1000ms after user stops typing

    return () => clearTimeout(timer)
  }, [descriptionFilterInput, descriptionFilter])

  useEffect(() => {
    setCurrentPage(1) // Reset to first page when filters change
  }, [categoryFilter, accountFilter, descriptionFilter, sortBy, sortOrder])

  useEffect(() => {
    fetchValidatedTransactions()
    fetchCategories()
  }, [sortBy, sortOrder, categoryFilter, accountFilter, descriptionFilter, currentPage])

  useEffect(() => {
    if (editorMode) {
      fetchEditorCategories()
    }
  }, [editorMode])

  const fetchValidatedTransactions = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = {
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        sort_by: sortBy,
        sort_order: sortOrder
      }
      if (categoryFilter) params.category = categoryFilter
      if (accountFilter) params.account_name_filter = accountFilter
      if (descriptionFilter.trim()) params.description_search = descriptionFilter.trim()
      
      const response = await axios.get(`${API_BASE_URL}/api/validated-transactions`, { params })
      const transactions = response.data.transactions || []
      const count = response.data.total_count || 0
      
      setValidatedTransactions(transactions)
      setTotalCount(count)
      
      // Initialize notes state from fetched transactions
      const initialNotes = {}
      const initialExcludeFromForecast = {}
      transactions.forEach(t => {
        if (t.user_notes) initialNotes[t.transaction_id] = t.user_notes
        if (t.exclude_from_forecast) initialExcludeFromForecast[t.transaction_id] = true
      })
      setNotes(initialNotes)
      setExcludeFromForecast(initialExcludeFromForecast)
    } catch (err) {
      setError(`Failed to load validated transactions: ${err.message}`)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/validated-transactions/categories/list`)
      setAvailableCategories(response.data || [])
    } catch (err) {
      console.error('Failed to load categories:', err)
    }
  }

  const fetchEditorCategories = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/validated-transactions/categories/all`)
      setEditorCategories(response.data || [])
    } catch (err) {
      console.error('Failed to load editor categories:', err)
      setEditorCategories(availableCategories)
    }
  }

  const handleEnterEditorMode = () => {
    const confirmed = window.confirm(
      'Enter Editor Mode?\n\n' +
      'You can search and change categories for validated transactions. ' +
      'Changes are staged until you click Save. Saving runs a full refresh of training data plus retrain (~45s after save).\n\n' +
      'Only category fields are editable. Continue?'
    )
    if (confirmed) {
      setEditorMode(true)
      setPendingCategoryEdits({})
      setSuccess(null)
      setError(null)
    }
  }

  const pendingEditCount = Object.keys(pendingCategoryEdits).length

  const handleCancelEditorMode = () => {
    if (pendingEditCount > 0) {
      const confirmed = window.confirm(
        `Discard ${pendingEditCount} unsaved category change${pendingEditCount !== 1 ? 's' : ''}?`
      )
      if (!confirmed) return
    }
    setEditorMode(false)
    setPendingCategoryEdits({})
  }

  const handleCategoryChange = (transactionId, newCategory, savedCategory) => {
    if (!newCategory) return

    if (newCategory === savedCategory) {
      setPendingCategoryEdits(prev => {
        const next = { ...prev }
        delete next[transactionId]
        return next
      })
      return
    }

    setPendingCategoryEdits(prev => ({
      ...prev,
      [transactionId]: {
        original: savedCategory,
        new: newCategory,
      },
    }))
  }

  const handleSaveEditorChanges = async () => {
    if (pendingEditCount === 0) {
      setEditorMode(false)
      return
    }

    const confirmed = window.confirm(
      `Save ${pendingEditCount} category change${pendingEditCount !== 1 ? 's' : ''}?\n\n` +
      'This updates the database and schedules a full refresh + retrain (~45s after save).'
    )
    if (!confirmed) return

    try {
      setSavingEditorChanges(true)
      setError(null)

      const edits = Object.entries(pendingCategoryEdits)
      let savedCount = 0

      for (const [transactionId, edit] of edits) {
        await axios.put(
          `${API_BASE_URL}/api/validated-transactions/${transactionId}/category`,
          { master_category: edit.new }
        )
        savedCount++
      }

      setPendingCategoryEdits({})
      setEditorMode(false)
      setSuccess(
        `Saved ${savedCount} category change${savedCount !== 1 ? 's' : ''}. ` +
        'Full refresh + retrain scheduled (~45s).'
      )
      await fetchValidatedTransactions()
    } catch (err) {
      setError(`Failed to save changes: ${err.response?.data?.detail || err.message}`)
    } finally {
      setSavingEditorChanges(false)
    }
  }

  const getEditorCategoryValue = (transaction) => {
    if (pendingCategoryEdits[transaction.transaction_id]) {
      return pendingCategoryEdits[transaction.transaction_id].new
    }
    return transaction.master_category || ''
  }

  const handleExcludeFromForecastAllData = async (transactionId, newValue) => {
    setExcludeFromForecast(prev => ({ ...prev, [transactionId]: newValue }))
    try {
      setError(null)
      await axios.put(
        `${API_BASE_URL}/api/transactions/${transactionId}/exclude-from-forecast`,
        { exclude_from_forecast: newValue }
      )
    } catch (err) {
      setExcludeFromForecast(prev => ({ ...prev, [transactionId]: !newValue }))
      setError(`Failed to update forecast exclusion: ${err.response?.data?.detail || err.message}`)
    }
  }

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(column)
      setSortOrder('desc')
    }
  }

  const formatAmount = (amount) => {
    if (!amount) return '-'
    const numAmount = parseFloat(amount)
    const formatted = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(Math.abs(numAmount))
    
    return (
      <span className={`amount ${numAmount < 0 ? 'amount-negative' : 'amount-positive'}`}>
        {numAmount < 0 ? '-' : '+'}{formatted}
      </span>
    )
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const getSortIcon = (column) => {
    if (sortBy !== column) return '↕️'
    return sortOrder === 'asc' ? '↑' : '↓'
  }

  const handleNotesUpdate = async (transactionId, newNotes) => {
    // Always update local state
    setNotes({ ...notes, [transactionId]: newNotes || null })
    
    // Since these are validated transactions, save to DB immediately
    try {
      setError(null)
      await axios.put(
        `${API_BASE_URL}/api/transactions/${transactionId}/notes`,
        { notes: newNotes || null }
      )
    } catch (err) {
      setError(`Failed to update notes: ${err.message}`)
    }
  }

  return (
    <div className="placeholder-page">
      <div className="header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1>All Data</h1>
          <p>View and explore validated transaction data{editorMode ? ' (Editor Mode)' : ''}.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {editorMode ? (
            <>
              <button
                className="btn btn-save"
                onClick={handleSaveEditorChanges}
                disabled={savingEditorChanges}
              >
                {savingEditorChanges
                  ? 'Saving...'
                  : pendingEditCount > 0
                    ? `Save Changes (${pendingEditCount})`
                    : 'Save & Exit'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleCancelEditorMode}
                disabled={savingEditorChanges}
              >
                Cancel
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={handleEnterEditorMode}>
              Enter Editor Mode
            </button>
          )}
        </div>
      </div>

      {editorMode && (
        <div className="editor-toolbar-sticky">
          <div className="editor-toolbar-content">
            <span>
              <strong>Editor Mode</strong> — {pendingEditCount} unsaved change{pendingEditCount !== 1 ? 's' : ''}
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn btn-save"
                onClick={handleSaveEditorChanges}
                disabled={savingEditorChanges}
              >
                {savingEditorChanges
                  ? 'Saving...'
                  : pendingEditCount > 0
                    ? `Save Changes (${pendingEditCount})`
                    : 'Save & Exit'}
              </button>
              <button
                className="btn btn-secondary"
                onClick={handleCancelEditorMode}
                disabled={savingEditorChanges}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {editorMode && (
        <div className="editor-mode-banner">
          <strong>Editor Mode</strong> — Search below, then change categories from the dropdown.
          Changes are staged until you click Save.
        </div>
      )}

      {error && (
        <div className="error">{error}</div>
      )}

      {success && (
        <div className="success">{success}</div>
      )}

      {showNotes && (
        <div style={{ marginTop: '10px', marginBottom: '10px' }}>
          <button
            onClick={() => setShowNotes(false)}
            style={{
              background: 'none',
              border: '1px solid #ced4da',
              color: '#495057',
              cursor: 'pointer',
              fontSize: '0.875rem',
              padding: '6px 12px',
              borderRadius: '4px'
            }}
          >
            Hide Details Column
          </button>
        </div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Category:</label>
          <select
            className="category-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            style={{ minWidth: '150px' }}
          >
            <option value="">All Categories</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Account:</label>
          <input
            type="text"
            placeholder="Filter by account name..."
            value={accountFilterInput}
            onChange={(e) => setAccountFilterInput(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #ced4da', borderRadius: '4px', minWidth: '200px' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontWeight: '500' }}>Description:</label>
          <input
            type="text"
            placeholder="Filter by description..."
            value={descriptionFilterInput}
            onChange={(e) => setDescriptionFilterInput(e.target.value)}
            style={{ padding: '6px 12px', border: '1px solid #ced4da', borderRadius: '4px', minWidth: '200px' }}
          />
        </div>
        {(categoryFilter || accountFilterInput || descriptionFilterInput) && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setCategoryFilter('')
              setAccountFilterInput('')
              setAccountFilter('')
              setDescriptionFilterInput('')
              setDescriptionFilter('')
            }}
            style={{ marginLeft: '10px' }}
          >
            Clear Filters
          </button>
        )}
        {totalCount > 0 && (
          <span style={{ color: '#495057', fontSize: '0.875rem', marginLeft: 'auto' }}>
            Total: {totalCount.toLocaleString()} transactions
          </span>
        )}
      </div>

      <div className="transactions-table">
        {loading ? (
          <div className="loading" style={{ padding: '40px' }}>Loading validated transactions...</div>
        ) : validatedTransactions.length === 0 ? (
          <div className="loading" style={{ padding: '40px' }}>No validated transactions found.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th 
                  style={{ cursor: 'pointer', userSelect: 'none', width: '150px' }}
                  onClick={() => handleSort('transacted_date')}
                >
                  Date {getSortIcon('transacted_date')}
                </th>
                <th 
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('description')}
                >
                  Description {getSortIcon('description')}
                </th>
                <th 
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('account_name')}
                >
                  Account {getSortIcon('account_name')}
                </th>
                <th 
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('amount')}
                >
                  Amount {getSortIcon('amount')}
                </th>
                <th 
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('master_category')}
                >
                  Category {getSortIcon('master_category')}
                </th>
                <th style={{ width: '40px', textAlign: 'center' }} title="Notes and forecast options">
                  {!editorMode && !showNotes && (
                    <button
                      onClick={() => setShowNotes(true)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6c757d',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        padding: '4px 8px'
                      }}
                      title="Show notes and forecast options"
                    >
                      + Details
                    </button>
                  )}
                  {!editorMode && showNotes && 'Details'}
                </th>
              </tr>
            </thead>
            <tbody>
              {validatedTransactions.map((transaction) => {
                const hasPendingEdit = Boolean(pendingCategoryEdits[transaction.transaction_id])
                return (
                <tr
                  key={transaction.transaction_id}
                  style={hasPendingEdit ? { backgroundColor: '#fff8e1' } : undefined}
                >
                  <td>{formatDate(transaction.transacted_date)}</td>
                  <td>
                    {transaction.description || '-'}
                    {renderExcludedIndicator(transaction.transaction_id)}
                  </td>
                  <td>{transaction.account_name || '-'}</td>
                  <td>{formatAmount(transaction.amount)}</td>
                  <td>
                    {editorMode ? (
                      <select
                        className="category-select"
                        value={getEditorCategoryValue(transaction)}
                        onChange={(e) => {
                          handleCategoryChange(
                            transaction.transaction_id,
                            e.target.value,
                            transaction.master_category
                          )
                        }}
                        disabled={savingEditorChanges}
                        style={{
                          width: '100%',
                          minWidth: '180px',
                          border: hasPendingEdit ? '2px solid #ffc107' : undefined,
                        }}
                      >
                        <option value="">Select category...</option>
                        {(editorCategories.length > 0 ? editorCategories : availableCategories).map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    ) : transaction.master_category ? (
                      <span 
                        className="category-badge category-confident"
                        style={{
                          backgroundColor: getCategoryColor(transaction.master_category),
                          color: '#2c3e50',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          display: 'inline-block'
                        }}
                      >
                        {transaction.master_category}
                      </span>
                    ) : (
                      <span style={{ color: '#6c757d' }}>-</span>
                    )}
                  </td>
                  {!editorMode && showNotes && (
                    <td>
                      {renderTransactionDetailsCell({
                        transactionId: transaction.transaction_id,
                        noteValue: notes[transaction.transaction_id],
                        onNoteBlur: (e) => {
                          const newValue = e.target.value
                          setNotes(prevNotes => ({
                            ...prevNotes,
                            [transaction.transaction_id]: newValue
                          }))
                          handleNotesUpdate(transaction.transaction_id, newValue)
                        },
                        excludeValue: excludeFromForecast[transaction.transaction_id],
                        onExcludeChange: handleExcludeFromForecastAllData,
                        persistExcludeImmediately: true,
                      })}
                    </td>
                  )}
                  {!editorMode && !showNotes && <td></td>}
                </tr>
              )})}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Controls */}
      {totalCount > pageSize && (
        <div style={{ marginTop: '20px', display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
            style={{
              padding: '6px 12px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              background: currentPage === 1 ? '#e9ecef' : 'white',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Previous
          </button>
          <span style={{ color: '#495057', fontSize: '0.875rem' }}>
            Page {currentPage} of {Math.ceil(totalCount / pageSize)}
          </span>
          <button
            onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalCount / pageSize), prev + 1))}
            disabled={currentPage >= Math.ceil(totalCount / pageSize)}
            style={{
              padding: '6px 12px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              background: currentPage >= Math.ceil(totalCount / pageSize) ? '#e9ecef' : 'white',
              cursor: currentPage >= Math.ceil(totalCount / pageSize) ? 'not-allowed' : 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

export default AllDataPage
