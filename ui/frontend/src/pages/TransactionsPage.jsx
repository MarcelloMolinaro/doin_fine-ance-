import React, { useState, useEffect } from 'react'
import { formatDate, formatAmount } from '../utils/format.jsx'

// Transaction Categorization: the primary review/validate table. This page is
// tightly coupled to App's shared transaction state, so those values and
// handlers are passed in as props (destructured below) to keep behavior
// identical while living in its own file.
function TransactionsPage({
  transactionsPageFilterRef,
  viewMode,
  setViewMode,
  trainingStatus,
  transactions,
  validated,
  selectedCategory,
  setSelectedCategory,
  categories,
  selectedTransactions,
  updatingId,
  totalCount,
  currentPage,
  setCurrentPage,
  pageSize,
  showNotes,
  setShowNotes,
  notes,
  setNotes,
  excludeFromForecast,
  refreshingValidated,
  validatingAll,
  excludeLowConfidence,
  setExcludeLowConfidence,
  confidenceSort,
  setConfidenceSort,
  error,
  success,
  loading,
  setDescriptionFilter,
  handleRefreshValidatedTrxns,
  handleSelectAllPredicted,
  handleValidateAllReAssigned,
  handleSelectAll,
  handleValidateAllAssigned,
  handleDeselectAll,
  handleBulkAssignCategory,
  handleBulkValidate,
  handleSelectTransaction,
  handleValidateToggle,
  handleNotesUpdate,
  handleExcludeFromForecastToggle,
  getLowConfidenceTag,
  getPredictedCategoryDisplay,
  getAssignedCategoryDisplay,
  getConfidenceDisplay,
  renderExcludedIndicator,
  renderTransactionDetailsCell,
}) {
  // Initialize filter state from persistent ref for current viewMode
  if (!transactionsPageFilterRef.current[viewMode]) {
    transactionsPageFilterRef.current[viewMode] = { input: '', filter: '' }
  }
  
  const [localDescriptionFilterInput, setLocalDescriptionFilterInput] = useState(
    transactionsPageFilterRef.current[viewMode].input
  )
  const [localDescriptionFilter, setLocalDescriptionFilter] = useState(
    transactionsPageFilterRef.current[viewMode].filter
  )
  
  // Reset filter when viewMode changes
  useEffect(() => {
    if (!transactionsPageFilterRef.current[viewMode]) {
      transactionsPageFilterRef.current[viewMode] = { input: '', filter: '' }
    }
    const filter = transactionsPageFilterRef.current[viewMode]
    setLocalDescriptionFilterInput(filter.input)
    setLocalDescriptionFilter(filter.filter)
  }, [viewMode])
  
  // Persist filter values in App-level ref for current viewMode
  useEffect(() => {
    if (transactionsPageFilterRef.current[viewMode]) {
      transactionsPageFilterRef.current[viewMode].input = localDescriptionFilterInput
    }
  }, [localDescriptionFilterInput, viewMode])
  
  useEffect(() => {
    if (transactionsPageFilterRef.current[viewMode]) {
      transactionsPageFilterRef.current[viewMode].filter = localDescriptionFilter
    }
  }, [localDescriptionFilter, viewMode])
  
  // Debounce local input to local filter (matches AllDataPage timing)
  useEffect(() => {
    if (localDescriptionFilterInput === '') {
      // If clearing the filter, update immediately
      setLocalDescriptionFilter('')
      return
    }
    
    const timer = setTimeout(() => {
      setLocalDescriptionFilter(localDescriptionFilterInput)
      // Reset to first page when filter changes
      if (localDescriptionFilterInput !== localDescriptionFilter) {
        setCurrentPage(1)
      }
    }, 1000) // Wait 1000ms after user stops typing (same as AllDataPage)
    
    return () => clearTimeout(timer)
  }, [localDescriptionFilterInput, localDescriptionFilter])
  
  // Sync local filter to global filter to trigger fetchTransactions
  useEffect(() => {
    setDescriptionFilter(localDescriptionFilter)
  }, [localDescriptionFilter])
  
  return (
    <>
      <div className="header">
        <div style={{ marginBottom: '15px' }}>
          <h1>Transaction Categorization</h1>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center', marginTop: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="viewMode"
                value="unvalidated_predicted"
                checked={viewMode === 'unvalidated_predicted'}
                onChange={(e) => setViewMode(e.target.value)}
              />
              <span>Unvalidated - Predicted</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="viewMode"
                value="unvalidated_unpredicted"
                checked={viewMode === 'unvalidated_unpredicted'}
                onChange={(e) => setViewMode(e.target.value)}
              />
              <span>Unvalidated - Unpredicted</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="radio"
                name="viewMode"
                value="validated"
                checked={viewMode === 'validated'}
                onChange={(e) => setViewMode(e.target.value)}
              />
              <span>Validated</span>
            </label>
          </div>
        </div>

        {/* Training Status Message - Show in Unvalidated - Predicted tab if training was skipped */}
        {viewMode === 'unvalidated_predicted' && trainingStatus && trainingStatus.status === 'skipped' && (
          <div style={{
            marginTop: '15px',
            padding: '15px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffc107',
            borderRadius: '4px',
            color: '#856404'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px' }}>
              ⚠️ Predict Categories Not Available
            </div>
            <div style={{ fontSize: '0.9rem', lineHeight: '1.5' }}>
              {trainingStatus.n_available !== undefined && trainingStatus.n_required !== undefined && (
                <span style={{ display: 'block', marginTop: '6px' }}>
                  You currently have <strong>{trainingStatus.n_available}</strong> validated transaction{trainingStatus.n_available !== 1 ? 's' : ''}. 
                  You need <strong>{trainingStatus.n_required}</strong> to train the model.
                </span>
              )}
              <span style={{ display: 'block', marginTop: '8px', fontSize: '0.85rem', fontStyle: 'italic' }}>
                Categorize then Validate more transactions to enable predictions.
              </span>
            </div>
          </div>
        )}

        {/* Search and Filter Section */}
        <div style={{ marginTop: '15px', marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontWeight: '500', whiteSpace: 'nowrap' }}>Search Description:</label>
            <input
              type="text"
              placeholder="Filter by description..."
              value={localDescriptionFilterInput}
              onChange={(e) => setLocalDescriptionFilterInput(e.target.value)}
              style={{
                padding: '6px 12px',
                border: '1px solid #ced4da',
                borderRadius: '4px',
                minWidth: '200px',
                fontSize: '0.875rem'
              }}
            />
            {localDescriptionFilterInput && (
              <button
                onClick={() => {
                  // Clear the ref first to prevent it from restoring the value
                  if (transactionsPageFilterRef.current[viewMode]) {
                    transactionsPageFilterRef.current[viewMode].input = ''
                    transactionsPageFilterRef.current[viewMode].filter = ''
                  }
                  setLocalDescriptionFilterInput('')
                  setLocalDescriptionFilter('')
                  setDescriptionFilter('')
                  setCurrentPage(1)
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Clear
              </button>
            )}
          </div>
          {viewMode === 'validated' && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px',
              padding: '10px 12px',
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              marginBottom: '10px'
            }}>
              <button
                className="btn btn-primary"
                onClick={handleRefreshValidatedTrxns}
                disabled={refreshingValidated}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#ff9800',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: refreshingValidated ? 'not-allowed' : 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  opacity: refreshingValidated ? 0.6 : 1,
                  transition: 'all 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.12)'
                }}
                onMouseEnter={(e) => {
                  if (!refreshingValidated) {
                    e.target.style.backgroundColor = '#f57c00'
                    e.target.style.boxShadow = '0 2px 4px rgba(0,0,0,0.16)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!refreshingValidated) {
                    e.target.style.backgroundColor = '#ff9800'
                    e.target.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)'
                  }
                }}
              >
                {refreshingValidated ? 'Refreshing...' : 'Refresh Validated Transactions'}
              </button>
              <span style={{ 
                color: '#856404', 
                fontSize: '0.8rem', 
                lineHeight: '1.4',
                flex: 1
              }}>
                ⚠️ This will rerun the validation pipeline. The process may take a few minutes. Refresh the page manually.
              </span>
            </div>
          )}
          {viewMode === 'unvalidated_predicted' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setExcludeLowConfidence(prev => !prev)
                  setCurrentPage(1)
                }}
                style={{
                  padding: '6px 12px',
                  border: excludeLowConfidence ? '1px solid #28a745' : '1px solid #ced4da',
                  borderRadius: '4px',
                  background: excludeLowConfidence ? '#d4edda' : 'white',
                  color: excludeLowConfidence ? '#155724' : '#495057',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: excludeLowConfidence ? '600' : '400',
                }}
              >
                {excludeLowConfidence ? '✓ Hiding low confidence' : 'Hide low confidence'}
              </button>
              <button
                onClick={() => {
                  setConfidenceSort(prev => {
                    if (prev === 'default') return 'asc'
                    if (prev === 'asc') return 'desc'
                    return 'default'
                  })
                  setCurrentPage(1)
                }}
                style={{
                  padding: '6px 12px',
                  border: confidenceSort !== 'default' ? '1px solid #007bff' : '1px solid #ced4da',
                  borderRadius: '4px',
                  background: confidenceSort !== 'default' ? '#e7f3ff' : 'white',
                  color: '#495057',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Sort by confidence
                {confidenceSort === 'asc' ? ' ↑' : confidenceSort === 'desc' ? ' ↓' : ''}
              </button>
            </div>
          )}
          {totalCount > 0 && (
            <span style={{ color: '#495057', fontSize: '0.875rem' }}>
              Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, totalCount)} of {totalCount} transactions
            </span>
          )}
        </div>

        {(viewMode === 'unvalidated_predicted' || viewMode === 'unvalidated_unpredicted') && transactions.length > 0 && (
          <div className="bulk-actions" style={{ marginTop: '15px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {viewMode === 'unvalidated_predicted' ? (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={handleSelectAllPredicted}
                    style={{ backgroundColor: '#6c757d', color: 'white' }}
                  >
                    Select All Predicted ({transactions.filter(t => t.predicted_master_category && t.predicted_master_category !== 'UNCERTAIN' && !validated[t.transaction_id]).length})
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleValidateAllReAssigned}
                    disabled={validatingAll || transactions.filter(t => {
                      const assignedCategory = selectedCategory[t.transaction_id] || t.master_category
                      const predictedCategory = t.predicted_master_category
                      return assignedCategory && 
                             !validated[t.transaction_id] &&
                             predictedCategory && 
                             predictedCategory !== 'UNCERTAIN' &&
                             assignedCategory !== predictedCategory
                    }).length === 0}
                    style={{ backgroundColor: '#28a745', color: 'white' }}
                  >
                    {validatingAll ? 'Validating...' : `Validate All re-Assigned (${transactions.filter(t => {
                      const assignedCategory = selectedCategory[t.transaction_id] || t.master_category
                      const predictedCategory = t.predicted_master_category
                      return assignedCategory && 
                             !validated[t.transaction_id] &&
                             predictedCategory && 
                             predictedCategory !== 'UNCERTAIN' &&
                             assignedCategory !== predictedCategory
                    }).length})`}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={handleSelectAll}
                    style={{ backgroundColor: '#6c757d', color: 'white' }}
                  >
                    Select All ({transactions.filter(t => !validated[t.transaction_id]).length})
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleValidateAllAssigned}
                    disabled={validatingAll || transactions.filter(t => {
                      const assignedCategory = selectedCategory[t.transaction_id] || t.master_category
                      return assignedCategory && !validated[t.transaction_id]
                    }).length === 0}
                    style={{ backgroundColor: '#28a745', color: 'white' }}
                  >
                    {validatingAll ? 'Validating...' : `Validate All Assigned (${transactions.filter(t => {
                      const assignedCategory = selectedCategory[t.transaction_id] || t.master_category
                      return assignedCategory && !validated[t.transaction_id]
                    }).length})`}
                  </button>
                </>
              )}
              {selectedTransactions.size > 0 && (
                <>
                  <button
                    className="btn btn-secondary"
                    onClick={handleDeselectAll}
                    style={{ backgroundColor: '#6c757d', color: 'white' }}
                  >
                    Deselect All
                  </button>
                  <span style={{ color: '#495057', fontWeight: '500' }}>
                    {selectedTransactions.size} selected
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontWeight: '500', whiteSpace: 'nowrap' }}>Assign Category:</label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleBulkAssignCategory(e.target.value)
                          e.target.value = '' // Reset dropdown after selection
                        }
                      }}
                      style={{
                        padding: '6px 12px',
                        border: '1px solid #ced4da',
                        borderRadius: '4px',
                        backgroundColor: 'white',
                        cursor: 'pointer',
                        fontSize: '0.875rem',
                        minWidth: '180px'
                      }}
                    >
                      <option value="">Select category...</option>
                      {categories.length > 0 ? (
                        categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))
                      ) : (
                        <option disabled>No categories available</option>
                      )}
                    </select>
                  </div>
                </>
              )}
              <button
                className="btn btn-primary"
                onClick={handleBulkValidate}
                disabled={validatingAll}
              >
                {validatingAll ? 'Validating...' : selectedTransactions.size > 0 
                  ? `Validate Selected (${selectedTransactions.size})` 
                  : `Mark All (${transactions.length}) as Validated`}
              </button>
            </div>
          </div>
        )}
      </div>
      
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

    {error && (
      <div className="error">
        {error}
      </div>
    )}

    {success && (
      <div className="success">
        {success}
      </div>
    )}

    {/* Pagination Controls - Top */}
    {totalCount > pageSize && (
      <div style={{ marginTop: '15px', marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
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

    <div className="transactions-table">
      {loading && transactions.length === 0 ? (
        <div className="loading" style={{ padding: '40px' }}>
          Loading transactions...
        </div>
      ) : transactions.length === 0 ? (
        <div className="loading" style={{ padding: '40px' }}>
          {localDescriptionFilter ? 'No transactions found matching your search.' : 'No transactions found for this view.'}
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: '40px' }}>Select</th>
              <th style={{ width: '40px' }}>✓</th>
              <th style={{ width: '120px' }}>Date</th>
              {viewMode === 'unvalidated_predicted' && <th style={{ width: '56px' }}></th>}
              <th>Description</th>
              <th>Predicted Category</th>
              <th>Amount</th>
              <th>{viewMode === 'validated' ? 'Assigned Category' : 'Assign Category'}</th>
              <th style={{ width: '200px' }}>Account</th>
              {viewMode === 'unvalidated_predicted' && (
                <th
                  style={{ width: '80px', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => {
                    setConfidenceSort(prev => {
                      if (prev === 'default') return 'asc'
                      if (prev === 'asc') return 'desc'
                      return 'default'
                    })
                    setCurrentPage(1)
                  }}
                  title="Click to sort by confidence"
                >
                  Confidence %
                  {confidenceSort === 'asc' ? ' ↑' : confidenceSort === 'desc' ? ' ↓' : ''}
                </th>
              )}
              {showNotes && <th style={{ width: '200px' }}>Details</th>}
              {!showNotes && (
                <th style={{ width: '40px', textAlign: 'center' }}>
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
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {transactions.map((transaction) => (
              <tr key={transaction.transaction_id} style={{ backgroundColor: selectedTransactions.has(transaction.transaction_id) ? '#e7f3ff' : 'transparent' }}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedTransactions.has(transaction.transaction_id)}
                    onChange={(e) => {
                      // Only handle if not already handled by mousedown
                      if (!e.target.dataset.handled) {
                        handleSelectTransaction(transaction.transaction_id, e.target.checked)
                      }
                      delete e.target.dataset.handled
                    }}
                    onMouseDown={(e) => {
                      // Prevent focus to avoid scroll when clicking
                      if (!e.target.disabled) {
                        e.preventDefault()
                        // Manually toggle since we prevented default
                        const newChecked = !e.target.checked
                        e.target.dataset.handled = 'true'
                        handleSelectTransaction(transaction.transaction_id, newChecked)
                      }
                    }}
                    disabled={updatingId === transaction.transaction_id}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    title="Select transaction"
                  />
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={validated[transaction.transaction_id] || false}
                    onChange={(e) => {
                      // Only handle if not already handled by mousedown
                      if (!e.target.dataset.handled) {
                        handleValidateToggle(transaction.transaction_id, e.target.checked)
                      }
                      delete e.target.dataset.handled
                    }}
                    onMouseDown={(e) => {
                      // Prevent focus to avoid scroll when clicking
                      if (!e.target.disabled) {
                        e.preventDefault()
                        // Manually toggle since we prevented default
                        const newChecked = !e.target.checked
                        e.target.dataset.handled = 'true'
                        handleValidateToggle(transaction.transaction_id, newChecked)
                      }
                    }}
                    disabled={updatingId === transaction.transaction_id}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    title="Mark as validated"
                  />
                </td>
                <td>{formatDate(transaction.transacted_date)}</td>
                {viewMode === 'unvalidated_predicted' && (
                  <td style={{ textAlign: 'center' }}>{getLowConfidenceTag(transaction)}</td>
                )}
                <td>
                  {transaction.description || '-'}
                  {renderExcludedIndicator(transaction.transaction_id)}
                </td>
                <td>{getPredictedCategoryDisplay(transaction)}</td>
                <td>{formatAmount(transaction.amount)}</td>
                <td>
                  {viewMode === 'validated' ? (
                    // On validated tab, just show the badge (read-only)
                    <div>
                      {getAssignedCategoryDisplay(transaction) || (
                        <span style={{ color: '#6c757d', fontStyle: 'italic' }}>No category</span>
                      )}
                    </div>
                  ) : (
                    // On other tabs, show only dropdown (badge is in Predicted Category column)
                    <select
                      className="category-select"
                      value={selectedCategory[transaction.transaction_id] !== undefined 
                        ? selectedCategory[transaction.transaction_id] 
                        : (transaction.master_category || '')}
                      onChange={(e) => {
                        const category = e.target.value
                        // Store scroll position before state update
                        const scrollY = window.scrollY
                        const scrollX = window.scrollX
                        
                        // Blur immediately to prevent focus-related scroll
                        e.target.blur()
                        
                        // Just update local state - don't save to DB until validated
                        setSelectedCategory({
                          ...selectedCategory,
                          [transaction.transaction_id]: category
                        })
                        
                        // Restore scroll position after React render completes
                        requestAnimationFrame(() => {
                          requestAnimationFrame(() => {
                            window.scrollTo(scrollX, scrollY)
                          })
                        })
                      }}
                      disabled={updatingId === transaction.transaction_id}
                      style={{ 
                        width: '100%', 
                        minWidth: '180px',
                        border: (() => {
                          const assignedCategory = selectedCategory[transaction.transaction_id] !== undefined 
                            ? selectedCategory[transaction.transaction_id] 
                            : (transaction.master_category || '')
                          
                          // If category is assigned, use green border
                          if (assignedCategory) {
                            return '2px solid #28a745'
                          }
                          // Default border
                          return '1px solid #ced4da'
                        })(),
                        borderRadius: '4px',
                        padding: '4px 8px'
                      }}
                    >
                      <option value="">Select category...</option>
                      {categories.length > 0 ? (
                        categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))
                      ) : (
                        <option disabled>No categories available</option>
                      )}
                    </select>
                  )}
                </td>
                <td>{transaction.account_name || '-'}</td>
                {viewMode === 'unvalidated_predicted' && <td>{getConfidenceDisplay(transaction)}</td>}
                {showNotes && (
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
                      onExcludeChange: handleExcludeFromForecastToggle,
                      persistExcludeImmediately: false,
                    })}
                  </td>
                )}
                {!showNotes && <td></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>

    {/* Pagination Controls - Bottom */}
    {totalCount > pageSize && (
      <div style={{ marginTop: '15px', display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'center' }}>
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
    </>
  )
}

export default TransactionsPage
