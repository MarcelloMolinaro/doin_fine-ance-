import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import axios from 'axios'
import './index.css'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

function App() {
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [updatingId, setUpdatingId] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState({})
  const [notes, setNotes] = useState({})
  const [validated, setValidated] = useState({})
  const [selectedTransactions, setSelectedTransactions] = useState(new Set()) // New: selection state (separate from validation)
  const [activeTab, setActiveTab] = useState('control-center') // 'control-center', 'transactions', 'model-details', 'all-data'
  const [viewMode, setViewMode] = useState('unvalidated_predicted') // 'unvalidated_predicted', 'unvalidated_unpredicted', 'validated'
  const [validatingAll, setValidatingAll] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(100) // Records per page
  const [descriptionFilterInput, setDescriptionFilterInput] = useState('') // What user is typing
  const [descriptionFilter, setDescriptionFilter] = useState('') // Debounced value for API calls
  const [totalCount, setTotalCount] = useState(0)
  const descriptionInputRef = useRef(null)
  const shouldRestoreFocusRef = useRef(false)
  const [refreshingValidated, setRefreshingValidated] = useState(false)
  const [triggeringIngest, setTriggeringIngest] = useState(false)
  const [warnings, setWarnings] = useState([])
  const [loadingWarnings, setLoadingWarnings] = useState(true)
  const [warningsError, setWarningsError] = useState(null)

  useEffect(() => {
    setCurrentPage(1) // Reset to first page when view mode changes
    setDescriptionFilterInput('') // Reset filter input when view mode changes
    setDescriptionFilter('') // Reset debounced filter when view mode changes
  }, [viewMode])

  // Debounce the description filter input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDescriptionFilter(descriptionFilterInput)
      // Only reset page if filter actually changed (not on initial mount)
      if (descriptionFilterInput !== descriptionFilter) {
        setCurrentPage(1)
      }
    }, 300) // Wait 300ms after user stops typing

    return () => clearTimeout(timer)
  }, [descriptionFilterInput, descriptionFilter])

  useEffect(() => {
    fetchTransactions()
    fetchCategories()
  }, [viewMode, currentPage, descriptionFilter])

  const fetchWarnings = async () => {
    try {
      setLoadingWarnings(true)
      setWarningsError(null)
      const response = await axios.get(`${API_BASE_URL}/api/control-center/simplefin-warnings`)
      setWarnings(response.data.warnings || [])
    } catch (err) {
      setWarningsError(`Failed to load warnings: ${err.message}`)
      console.error(err)
    } finally {
      setLoadingWarnings(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'control-center') {
      fetchWarnings()
    }
  }, [activeTab])

  const fetchTransactions = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = { 
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        view_mode: viewMode
      }
      if (descriptionFilter.trim()) {
        params.description_search = descriptionFilter.trim()
      }
      const response = await axios.get(`${API_BASE_URL}/api/transactions`, { params })
      const fetchedTransactions = response.data.transactions || response.data
      const count = response.data.total_count || fetchedTransactions.length
      setTransactions(fetchedTransactions)
      setTotalCount(count)
      
      // Initialize state from fetched transactions
      const initialNotes = {}
      const initialValidated = {}
      const initialSelected = {}
      
      fetchedTransactions.forEach(t => {
        if (t.notes) initialNotes[t.transaction_id] = t.notes
        if (t.validated !== undefined) initialValidated[t.transaction_id] = t.validated
        // Only set selected category if user has assigned one (master_category from user_categories)
        if (t.master_category) {
          initialSelected[t.transaction_id] = t.master_category
        }
      })
      
      setNotes(initialNotes)
      setValidated(initialValidated)
      setSelectedCategory(initialSelected)
      // Reset selection when transactions change (new view mode, etc.)
      setSelectedTransactions(new Set())
    } catch (err) {
      setError(`Failed to load transactions: ${err.message}`)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/transactions/categories/list`)
      setCategories(response.data || [])
    } catch (err) {
      console.error('Failed to load categories:', err)
      setError(`Failed to load categories: ${err.message}`)
    }
  }

  const handleCategorize = async (transactionId, masterCategory, note = null, isValidated = false) => {
    try {
      setUpdatingId(transactionId)
      setError(null)
      setSuccess(null)

      const currentNote = note !== null ? note : (notes[transactionId] || null)
      const currentValidated = isValidated !== undefined ? isValidated : (validated[transactionId] || false)

      // Only save to database if validated
      if (currentValidated) {
        await axios.post(
          `${API_BASE_URL}/api/transactions/${transactionId}/categorize`,
          {
            master_category: masterCategory,
            source_category: null,
            notes: currentNote,
            validated: currentValidated
          }
        )

        setSuccess(`Transaction categorized and validated!`)
        
        // Refresh the list to show updated state
        await fetchTransactions()
      } else {
        // Just update local state - don't save to DB yet
        setSelectedCategory({ ...selectedCategory, [transactionId]: masterCategory })
        if (currentNote !== null) {
          setNotes({ ...notes, [transactionId]: currentNote })
        }
      }
    } catch (err) {
      setError(`Failed to categorize transaction: ${err.message}`)
      console.error(err)
    } finally {
      setUpdatingId(null)
    }
  }

  const handleValidateToggle = async (transactionId, newValidated) => {
    try {
      setError(null)
      
      // Get user-assigned category (if any) or use predicted category
      const transaction = transactions.find(t => t.transaction_id === transactionId)
      const assignedCategory = selectedCategory[transactionId] || transaction?.master_category
      const predictedCategory = transaction?.predicted_master_category
      
      // Use assigned category if exists, otherwise use predicted category
      const categoryToUse = assignedCategory || (predictedCategory && predictedCategory !== 'UNCERTAIN' ? predictedCategory : null)
      
      if (!categoryToUse && newValidated) {
        setError('Please assign a category before validating')
        return
      }

      setUpdatingId(transactionId)
      try {
        if (newValidated) {
          // Validating - save to database
          await axios.post(
            `${API_BASE_URL}/api/transactions/${transactionId}/categorize`,
            {
              master_category: categoryToUse,
              source_category: null,
              notes: notes[transactionId] || null,
              validated: true
            }
          )
          
          setValidated({ ...validated, [transactionId]: true })
          setSuccess(`Transaction validated successfully!`)
        } else {
          // Unvalidating - update database to set validated to false
          await axios.post(
            `${API_BASE_URL}/api/transactions/${transactionId}/categorize`,
            {
              master_category: categoryToUse || transaction?.master_category,
              source_category: null,
              notes: notes[transactionId] || null,
              validated: false
            }
          )
          
          setValidated({ ...validated, [transactionId]: false })
          setSuccess(`Transaction unvalidated successfully!`)
          
          // Switch to appropriate tab based on prediction
          if (predictedCategory && predictedCategory !== 'UNCERTAIN') {
            setViewMode('unvalidated_predicted')
          } else {
            setViewMode('unvalidated_unpredicted')
          }
        }
        
        // Refresh to show updated state
        await fetchTransactions()
      } finally {
        setUpdatingId(null)
      }
    } catch (err) {
      setError(`Failed to update validation: ${err.message}`)
      console.error(err)
    }
  }

  const handleNotesUpdate = async (transactionId, newNotes) => {
    // Always update local state
    setNotes({ ...notes, [transactionId]: newNotes || null })
    
    // Only save notes to DB if transaction is validated
    const transaction = transactions.find(t => t.transaction_id === transactionId)
    if (transaction?.validated) {
      try {
        setError(null)
        await axios.put(
          `${API_BASE_URL}/api/transactions/${transactionId}/notes`,
          { notes: newNotes || null }
        )
      } catch (err) {
        // Silently fail - notes update is non-critical
      }
    }
    // Otherwise notes are stored in local state only and will be saved when validated
  }

  const handleBulkValidate = async () => {
    try {
      setValidatingAll(true)
      setError(null)
      setSuccess(null)

      // Use selected transactions if any are selected, otherwise validate all
      const transactionsToValidate = selectedTransactions.size > 0
        ? transactions.filter(t => selectedTransactions.has(t.transaction_id))
        : transactions

      if (transactionsToValidate.length === 0) {
        setError('No transactions selected to validate')
        setValidatingAll(false)
        return
      }

      let validatedCount = 0
      
      // Validate each selected transaction, using selected category or predicted category
      for (const transaction of transactionsToValidate) {
        const assignedCategory = selectedCategory[transaction.transaction_id] || transaction.master_category
        const predictedCategory = transaction.predicted_master_category
        const categoryToUse = assignedCategory || (predictedCategory && predictedCategory !== 'UNCERTAIN' ? predictedCategory : null)
        
        if (categoryToUse) {
          try {
            await axios.post(
              `${API_BASE_URL}/api/transactions/${transaction.transaction_id}/categorize`,
              {
                master_category: categoryToUse,
                source_category: null,
                notes: notes[transaction.transaction_id] || null,
                validated: true
              }
            )
            validatedCount++
          } catch (err) {
            console.error(`Failed to validate transaction ${transaction.transaction_id}:`, err)
          }
        }
      }

      setSuccess(`Marked ${validatedCount} transactions as validated`)
      setSelectedTransactions(new Set()) // Clear selection after validation
      await fetchTransactions()
    } catch (err) {
      setError(`Failed to validate transactions: ${err.message}`)
      console.error(err)
    } finally {
      setValidatingAll(false)
    }
  }

  const handleSelectTransaction = (transactionId, isSelected) => {
    const newSelected = new Set(selectedTransactions)
    if (isSelected) {
      newSelected.add(transactionId)
    } else {
      newSelected.delete(transactionId)
    }
    setSelectedTransactions(newSelected)
  }

  const handleSelectAllPredicted = () => {
    const predictedTransactions = transactions.filter(t => 
      t.predicted_master_category && 
      t.predicted_master_category !== 'UNCERTAIN' &&
      !validated[t.transaction_id]
    )
    const newSelected = new Set(selectedTransactions)
    predictedTransactions.forEach(t => newSelected.add(t.transaction_id))
    setSelectedTransactions(newSelected)
  }

  const handleSelectAll = () => {
    // Select all transactions on the current page (excluding already validated ones)
    const unvalidatedTransactions = transactions.filter(t => !validated[t.transaction_id])
    const newSelected = new Set(selectedTransactions)
    unvalidatedTransactions.forEach(t => newSelected.add(t.transaction_id))
    setSelectedTransactions(newSelected)
  }

  const handleDeselectAll = () => {
    setSelectedTransactions(new Set())
  }

  const handleBulkAssignCategory = (category) => {
    if (!category || selectedTransactions.size === 0) {
      return
    }

    // Update selectedCategory state for all selected transactions
    const updatedSelectedCategory = { ...selectedCategory }
    selectedTransactions.forEach(transactionId => {
      updatedSelectedCategory[transactionId] = category
    })
    setSelectedCategory(updatedSelectedCategory)
    setSuccess(`Assigned "${category}" to ${selectedTransactions.size} transaction(s)`)
  }

  const handleRefreshValidatedTrxns = async () => {
    // Confirmation popup
    if (!window.confirm("You Sure Dawg?")) {
      return
    }

    try {
      setRefreshingValidated(true)
      setError(null)
      setSuccess(null)

      const response = await axios.post(`${API_BASE_URL}/api/transactions/trigger-refresh-validated`)
      
      if (response.data.success) {
        setSuccess(`Dagster job triggered successfully! Run ID: ${response.data.run_id}`)
      } else {
        setError(response.data.message || 'Failed to trigger refresh')
      }
    } catch (err) {
      setError(`Failed to trigger refresh: ${err.response?.data?.detail || err.message}`)
      console.error(err)
    } finally {
      setRefreshingValidated(false)
    }
  }

  const handleTriggerIngestAndPredict = async () => {
    if (!window.confirm("Trigger ingest and predict job? This will fetch new transactions and generate predictions.")) {
      return
    }

    try {
      setTriggeringIngest(true)
      setError(null)
      setSuccess(null)

      const response = await axios.post(`${API_BASE_URL}/api/control-center/trigger-ingest-and-predict`)
      
      if (response.data.success) {
        setSuccess(`Dagster job triggered successfully! Run ID: ${response.data.run_id}`)
        // Refresh warnings after a short delay to see new run
        setTimeout(() => {
          fetchWarnings()
        }, 2000)
      } else {
        setError(response.data.message || 'Failed to trigger job')
      }
    } catch (err) {
      setError(`Failed to trigger job: ${err.response?.data?.detail || err.message}`)
      console.error(err)
    } finally {
      setTriggeringIngest(false)
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

  const getCategoryColor = (category) => {
    // Distinct pastel color mapping - each category gets a unique, easily distinguishable color
    // Colors are evenly spaced across the color spectrum for maximum visual distinction
    const colorMap = {
      // Food & Dining - Distinct warm tones
      'Dining out': '#ffb3ba',        // Pastel red
      'Bars & Restaurants': '#ff9a9e', // Coral
      'Groceries': '#a8e6cf',         // Mint green
      'Coffee Shops': '#ffd3a5',      // Peach
      'Restaurants': '#ff8c94',       // Rose pink (more distinct from coral)
      
      // Transportation - Distinct cool tones
      'Transportation': '#a8d8ea',    // Sky blue
      'Gas': '#6bb6ff',               // Bright blue (more distinct)
      'Auto & Transport': '#b8e0d2',  // Seafoam green
      
      // Housing - Distinct purples
      'Rent': '#d4a5f5',              // Lavender
      'Home': '#ba8fc8',              // Deeper purple (more distinct from lavender)
      
      // Income & Finance - Distinct greens
      'Income': '#b5e5cf',            // Pastel green
      'Interest': '#7dd3a0',          // Emerald green (more distinct)
      'Credit fee': '#ff6b9d',        // Pink-red
      
      // Utilities & Bills - Distinct yellows/oranges
      'Utilities': '#ffe4b5',         // Pastel yellow
      'Bills & Utilities': '#ffd89b', // Light orange
      'Insurance': '#87ceeb',          // Sky blue (moved from Travel)
      
      // Shopping & Entertainment - Distinct pinks/magentas
      'Shopping': '#ffc1cc',          // Pastel pink
      'Entertainment': '#ffa8d5',      // Magenta pink (more distinct)
      'Fun!™': '#ff9ec5',              // Hot pink
      
      // Other - Distinct colors
      'Travel': '#b0e0e6',             // Powder blue (moved from Insurance)
      'Lodging': '#e1bee7',            // Light purple
      'Donation': '#d2b48c',           // Tan/brown
      'Transfers': '#d3d3d3',           // Light grey
    }
    
    return colorMap[category] || '#e0e0e0' // Default light grey for unknown categories
  }

  const getPredictedCategoryDisplay = (transaction) => {
    const predictedCategory = transaction.predicted_master_category
    const assignedCategory = selectedCategory[transaction.transaction_id] !== undefined 
      ? selectedCategory[transaction.transaction_id] 
      : (transaction.master_category || '')
    
    // For unvalidated transactions, show both predicted and assigned (if assigned)
    if (viewMode !== 'validated' && assignedCategory) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Show predicted category */}
          {predictedCategory && predictedCategory !== 'UNCERTAIN' ? (
            <span 
              className="category-badge category-predicted" 
              style={{
                backgroundColor: getCategoryColor(predictedCategory),
                color: '#2c3e50',
                padding: '4px 8px',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontWeight: '500',
                display: 'inline-block'
              }}
            >
              {predictedCategory}
            </span>
          ) : (
            <span style={{ color: '#6c757d', fontStyle: 'italic', fontSize: '0.875rem' }}>No prediction</span>
          )}
          {/* Show assigned category badge */}
          {getAssignedCategoryDisplay(transaction)}
        </div>
      )
    }
    
    // For validated tab or when no assigned category, show just predicted
    if (predictedCategory && predictedCategory !== 'UNCERTAIN') {
      const categoryColor = getCategoryColor(predictedCategory)
      return (
        <span 
          className="category-badge category-predicted" 
          style={{
            backgroundColor: categoryColor,
            color: '#2c3e50', // Dark text on pastel background
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '0.875rem',
            fontWeight: '500',
            display: 'inline-block'
          }}
        >
          {predictedCategory}
        </span>
      )
    }
    // No category or UNCERTAIN
    return <span style={{ color: '#6c757d', fontStyle: 'italic' }}>No prediction</span>
  }

  const getAssignedCategoryDisplay = (transaction) => {
    // Get the assigned category (user-selected or existing master_category)
    const assignedCategory = selectedCategory[transaction.transaction_id] !== undefined 
      ? selectedCategory[transaction.transaction_id] 
      : (transaction.master_category || '')
    
    if (assignedCategory) {
      const categoryColor = getCategoryColor(assignedCategory)
      const isValidated = validated[transaction.transaction_id] || transaction.validated
      const predictedCategory = transaction.predicted_master_category
      const matchesPredicted = predictedCategory && 
                                predictedCategory !== 'UNCERTAIN' && 
                                predictedCategory === assignedCategory
      
      // If validated and matches predicted category, show simple badge (no special styling)
      if (isValidated && matchesPredicted) {
        return (
          <span 
            className="category-badge category-assigned" 
            style={{
              backgroundColor: categoryColor,
              color: '#2c3e50', // Dark text on pastel background
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '0.875rem',
              fontWeight: '500',
              display: 'inline-block'
            }}
          >
            {assignedCategory}
          </span>
        )
      }
      
      // Otherwise, show with special styling to indicate it's user-assigned
      return (
        <span 
          className="category-badge category-assigned" 
          style={{
            backgroundColor: categoryColor,
            color: '#2c3e50', // Dark text on pastel background
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '0.875rem',
            fontWeight: '600', // Slightly bolder to distinguish from predicted
            display: 'inline-block',
            border: '2px solid #007bff', // Blue border to indicate it's assigned
            boxShadow: '0 1px 3px rgba(0, 123, 255, 0.3)' // Subtle shadow for emphasis
          }}
        >
          {assignedCategory}
        </span>
      )
    }
    return null
  }

  const getConfidenceDisplay = (transaction) => {
    if (transaction.prediction_confidence && transaction.predicted_master_category && transaction.predicted_master_category !== 'UNCERTAIN') {
      const confidence = (parseFloat(transaction.prediction_confidence) * 100).toFixed(0)
      return <span style={{ color: '#495057', fontSize: '0.875rem' }}>{confidence}%</span>
    }
    return <span style={{ color: '#6c757d', fontStyle: 'italic' }}>-</span>
  }

  if (loading && transactions.length === 0) {
    return (
      <div className="container">
        <div className="loading">Loading transactions...</div>
      </div>
    )
  }

  // Tab navigation
  const renderTabs = () => {
    return (
      <div className="tabs" style={{ display: 'flex', gap: '0', borderBottom: '2px solid #dee2e6', marginBottom: '20px' }}>
        <button
          className={`tab-button ${activeTab === 'control-center' ? 'active' : ''}`}
          onClick={() => setActiveTab('control-center')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderBottom: activeTab === 'control-center' ? '2px solid #007bff' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'control-center' ? '#007bff' : '#495057',
            fontWeight: activeTab === 'control-center' ? '600' : '400',
            fontSize: '0.95rem',
            marginBottom: '-2px'
          }}
        >
          Control Center
        </button>
        <button
          className={`tab-button ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderBottom: activeTab === 'transactions' ? '2px solid #007bff' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'transactions' ? '#007bff' : '#495057',
            fontWeight: activeTab === 'transactions' ? '600' : '400',
            fontSize: '0.95rem',
            marginBottom: '-2px'
          }}
        >
          Transaction Categorization
        </button>
        <button
          className={`tab-button ${activeTab === 'model-details' ? 'active' : ''}`}
          onClick={() => setActiveTab('model-details')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderBottom: activeTab === 'model-details' ? '2px solid #007bff' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'model-details' ? '#007bff' : '#495057',
            fontWeight: activeTab === 'model-details' ? '600' : '400',
            fontSize: '0.95rem',
            marginBottom: '-2px'
          }}
        >
          Model Details
        </button>
        <button
          className={`tab-button ${activeTab === 'all-data' ? 'active' : ''}`}
          onClick={() => setActiveTab('all-data')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderBottom: activeTab === 'all-data' ? '2px solid #007bff' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'all-data' ? '#007bff' : '#495057',
            fontWeight: activeTab === 'all-data' ? '600' : '400',
            fontSize: '0.95rem',
            marginBottom: '-2px'
          }}
        >
          All Data
        </button>
      </div>
    )
  }

  // Control Center Page Component
  const ControlCenterPage = () => {

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

    return (
      <div className="placeholder-page">
        <div className="header">
          <h1>Control Center</h1>
          <p>Manage data ingestion and monitor system status.</p>
        </div>

        {/* Job Trigger Section */}
        <div style={{ 
          background: 'white', 
          padding: '30px', 
          borderRadius: '8px', 
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          marginBottom: '30px'
        }}>
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

  // Placeholder component for Model Details
  const ModelDetailsPage = () => {
    return (
      <div className="placeholder-page">
        <div className="header">
          <h1>Model Details</h1>
          <p>Model performance metrics and details will be displayed here.</p>
        </div>
        <div style={{ 
          background: 'white', 
          padding: '40px', 
          borderRadius: '8px', 
          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
          textAlign: 'center',
          color: '#6c757d'
        }}>
          <p style={{ fontSize: '1.1rem', marginBottom: '10px' }}>🚧 Coming Soon</p>
          <p>Model details, training metrics, accuracy scores, and other model information will be available here.</p>
        </div>
      </div>
    )
  }

  // All Data page component
  const AllDataPage = () => {
    const [validatedTransactions, setValidatedTransactions] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [sortBy, setSortBy] = useState('transacted_date')
    const [sortOrder, setSortOrder] = useState('desc')
    const [categoryFilter, setCategoryFilter] = useState('')
    const [accountFilterInput, setAccountFilterInput] = useState('') // What user is typing
    const [accountFilter, setAccountFilter] = useState('') // Debounced value for API calls
    const [availableCategories, setAvailableCategories] = useState([])
    const [showNotes, setShowNotes] = useState(false)
    const [notes, setNotes] = useState({})

    // Debounce the account filter input
    useEffect(() => {
      const timer = setTimeout(() => {
        setAccountFilter(accountFilterInput)
      }, 300) // Wait 300ms after user stops typing

      return () => clearTimeout(timer)
    }, [accountFilterInput])

    useEffect(() => {
      fetchValidatedTransactions()
      fetchCategories()
    }, [sortBy, sortOrder, categoryFilter, accountFilter])

    const fetchValidatedTransactions = async () => {
      try {
        setLoading(true)
        setError(null)
        const params = {
          limit: 500,
          sort_by: sortBy,
          sort_order: sortOrder
        }
        if (categoryFilter) params.category = categoryFilter
        if (accountFilter) params.account_name_filter = accountFilter
        
        const response = await axios.get(`${API_BASE_URL}/api/validated-transactions`, { params })
        setValidatedTransactions(response.data)
        
        // Initialize notes state from fetched transactions
        const initialNotes = {}
        response.data.forEach(t => {
          if (t.user_notes) initialNotes[t.transaction_id] = t.user_notes
        })
        setNotes(initialNotes)
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
        <div className="header">
          <h1>All Data</h1>
          <p>View and explore validated transaction data.</p>
        </div>

        {error && (
          <div className="error">{error}</div>
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
              Hide Notes Column
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
          {(categoryFilter || accountFilterInput) && (
            <button
              className="btn btn-primary"
              onClick={() => {
                setCategoryFilter('')
                setAccountFilterInput('')
                setAccountFilter('')
              }}
              style={{ marginLeft: '10px' }}
            >
              Clear Filters
            </button>
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
                  {showNotes && <th style={{ width: '150px' }}>Notes</th>}
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
                        title="Show notes column"
                      >
                        + Notes
                      </button>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {validatedTransactions.map((transaction) => (
                  <tr key={transaction.transaction_id}>
                    <td>{formatDate(transaction.transacted_date)}</td>
                    <td>{transaction.description || '-'}</td>
                    <td>{transaction.account_name || '-'}</td>
                    <td>{formatAmount(transaction.amount)}</td>
                    <td>
                      {transaction.master_category ? (
                        <span 
                          className="category-badge category-confident"
                          style={{
                            backgroundColor: getCategoryColor(transaction.master_category),
                            color: '#2c3e50', // Dark text on pastel background
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
                    {showNotes && (
                      <td>
                        <input
                          type="text"
                          placeholder="Add note..."
                          value={notes[transaction.transaction_id] || ''}
                          onChange={(e) => {
                            const newNotes = { ...notes, [transaction.transaction_id]: e.target.value }
                            setNotes(newNotes)
                          }}
                          onBlur={(e) => {
                            handleNotesUpdate(transaction.transaction_id, e.target.value)
                          }}
                          className="notes-input"
                          style={{ width: '100%', padding: '4px 8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                        />
                      </td>
                    )}
                    {!showNotes && <td></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    )
  }

  // Transaction Categorization Page (existing content)
  const TransactionsPage = () => {
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

          {/* Search and Filter Section */}
          <div style={{ marginTop: '15px', marginBottom: '15px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontWeight: '500', whiteSpace: 'nowrap' }}>Search Description:</label>
              <input
                ref={descriptionInputRef}
                type="text"
                placeholder="Filter by description..."
                value={descriptionFilterInput}
                onChange={(e) => {
                  const cursorPosition = e.target.selectionStart
                  const wasFocused = document.activeElement === e.target
                  shouldRestoreFocusRef.current = wasFocused
                  setDescriptionFilterInput(e.target.value)
                  // Use requestAnimationFrame to restore focus after React's render
                  requestAnimationFrame(() => {
                    if (descriptionInputRef.current && shouldRestoreFocusRef.current) {
                      descriptionInputRef.current.focus()
                      // Restore cursor position
                      const newPosition = Math.min(cursorPosition, descriptionInputRef.current.value.length)
                      descriptionInputRef.current.setSelectionRange(newPosition, newPosition)
                      shouldRestoreFocusRef.current = false
                    }
                  })
                }}
                style={{
                  padding: '6px 12px',
                  border: '1px solid #ced4da',
                  borderRadius: '4px',
                  minWidth: '200px',
                  fontSize: '0.875rem'
                }}
              />
              {descriptionFilterInput && (
                <button
                  onClick={() => {
                    setDescriptionFilterInput('')
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
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleRefreshValidatedTrxns}
                  disabled={refreshingValidated}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: refreshingValidated ? 'not-allowed' : 'pointer',
                    fontSize: '0.875rem',
                    fontWeight: '500',
                    opacity: refreshingValidated ? 0.6 : 1
                  }}
                >
                  {refreshingValidated ? 'Refreshing...' : 'Refresh Validated'}
                </button>
                <span style={{ color: '#dc3545', fontSize: '0.75rem', fontWeight: '500' }}>
                  ⚠️ NOT reversible
                </span>
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
                  <button
                    className="btn btn-secondary"
                    onClick={handleSelectAllPredicted}
                    style={{ backgroundColor: '#6c757d', color: 'white' }}
                  >
                    Select All Predicted ({transactions.filter(t => t.predicted_master_category && t.predicted_master_category !== 'UNCERTAIN' && !validated[t.transaction_id]).length})
                  </button>
                ) : (
                  <button
                    className="btn btn-secondary"
                    onClick={handleSelectAll}
                    style={{ backgroundColor: '#6c757d', color: 'white' }}
                  >
                    Select All ({transactions.filter(t => !validated[t.transaction_id]).length})
                  </button>
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
              Hide Notes Column
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
            {descriptionFilter ? 'No transactions found matching your search.' : 'No transactions found for this view.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>Select</th>
                <th style={{ width: '40px' }}>✓</th>
                <th style={{ width: '120px' }}>Date</th>
                <th>Description</th>
                <th>Predicted Category</th>
                <th>Amount</th>
                <th>{viewMode === 'validated' ? 'Assigned Category' : 'Assign Category'}</th>
                <th style={{ width: '200px' }}>Account</th>
                <th style={{ width: '80px' }}>Confidence %</th>
                {showNotes && <th style={{ width: '150px' }}>Notes</th>}
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
                      title="Show notes column"
                    >
                      + Notes
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
                      onChange={(e) => handleSelectTransaction(transaction.transaction_id, e.target.checked)}
                      disabled={updatingId === transaction.transaction_id}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      title="Select transaction"
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={validated[transaction.transaction_id] || false}
                      onChange={(e) => handleValidateToggle(transaction.transaction_id, e.target.checked)}
                      disabled={updatingId === transaction.transaction_id}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      title="Mark as validated"
                    />
                  </td>
                  <td>{formatDate(transaction.transacted_date)}</td>
                  <td>{transaction.description || '-'}</td>
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
                          // Just update local state - don't save to DB until validated
                          setSelectedCategory({
                            ...selectedCategory,
                            [transaction.transaction_id]: category
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
                  <td>{getConfidenceDisplay(transaction)}</td>
                  {showNotes && (
                    <td>
                      <input
                        type="text"
                        placeholder="Add note..."
                        value={notes[transaction.transaction_id] || ''}
                        onChange={(e) => {
                          const newNotes = { ...notes, [transaction.transaction_id]: e.target.value }
                          setNotes(newNotes)
                        }}
                      onBlur={(e) => {
                        // Notes are stored in local state only until transaction is validated
                        // The handleNotesUpdate function will check if validated before saving to DB
                        handleNotesUpdate(transaction.transaction_id, e.target.value)
                      }}
                        className="notes-input"
                        style={{ width: '100%', padding: '4px 8px', border: '1px solid #ced4da', borderRadius: '4px' }}
                      />
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

  return (
    <div className="container">
      {renderTabs()}
      
      {activeTab === 'control-center' && <ControlCenterPage />}
      {activeTab === 'transactions' && <TransactionsPage />}
      {activeTab === 'model-details' && <ModelDetailsPage />}
      {activeTab === 'all-data' && <AllDataPage />}
    </div>
  )
}

export default App
