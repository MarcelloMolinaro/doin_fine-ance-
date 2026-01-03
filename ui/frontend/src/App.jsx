import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
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
  // Persist TransactionsPage filter per viewMode across component recreations
  const transactionsPageFilterRef = useRef({})
  const [refreshingValidated, setRefreshingValidated] = useState(false)
  const [triggeringIngest, setTriggeringIngest] = useState(false)
  const [warnings, setWarnings] = useState([])
  const [loadingWarnings, setLoadingWarnings] = useState(true)
  const [warningsError, setWarningsError] = useState(null)

  useEffect(() => {
    setCurrentPage(1) // Reset to first page when view mode changes
    // Note: descriptionFilter is now managed by TransactionsPage component
  }, [viewMode])

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
      
      // Initialize state from fetched transactions, but preserve existing user-assigned categories
      const initialNotes = {}
      const initialValidated = {}
      const initialSelected = {}
      
      fetchedTransactions.forEach(t => {
        if (t.notes) initialNotes[t.transaction_id] = t.notes
        if (t.validated !== undefined) initialValidated[t.transaction_id] = t.validated
        // Only set selected category if user has assigned one (master_category from user_categories)
        // This represents validated categories from the database
        if (t.master_category) {
          initialSelected[t.transaction_id] = t.master_category
        }
      })
      
      setNotes(prevNotes => ({ ...prevNotes, ...initialNotes }))
      setValidated(prevValidated => ({ ...prevValidated, ...initialValidated }))
      // Merge with existing selectedCategory to preserve user assignments for transactions not in current view
      // Database values (initialSelected) will override local values for fetched transactions, which is correct
      // But local assignments for transactions not in current fetch will be preserved
      setSelectedCategory(prevSelected => ({ ...prevSelected, ...initialSelected }))
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
        // Priority: user-assigned category > existing master_category > predicted category
        const userAssignedCategory = selectedCategory[transaction.transaction_id]
        const existingMasterCategory = transaction.master_category
        const predictedCategory = transaction.predicted_master_category
        
        // Use user-assigned if exists, otherwise existing master_category (if non-empty), otherwise predicted (if not UNCERTAIN)
        const categoryToUse = userAssignedCategory || 
                              (existingMasterCategory && typeof existingMasterCategory === 'string' && existingMasterCategory.trim() !== '' ? existingMasterCategory : null) ||
                              (predictedCategory && predictedCategory !== 'UNCERTAIN' ? predictedCategory : null)
        
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
            if (err.response) {
              console.error(`Response status: ${err.response.status}, data:`, err.response.data)
            }
          }
        } else {
          console.warn(`Skipping transaction ${transaction.transaction_id} - no category available`)
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

  const handleValidateAllAssigned = async () => {
    try {
      setValidatingAll(true)
      setError(null)
      setSuccess(null)

      // Find all transactions with assigned categories
      const transactionsWithCategories = transactions.filter(t => {
        const assignedCategory = selectedCategory[t.transaction_id] || t.master_category
        return assignedCategory && !validated[t.transaction_id]
      })

      if (transactionsWithCategories.length === 0) {
        setError('No transactions with assigned categories to validate')
        setValidatingAll(false)
        return
      }

      let validatedCount = 0
      
      // Validate each transaction with an assigned category
      for (const transaction of transactionsWithCategories) {
        const assignedCategory = selectedCategory[transaction.transaction_id] || transaction.master_category
        
        try {
          await axios.post(
            `${API_BASE_URL}/api/transactions/${transaction.transaction_id}/categorize`,
            {
              master_category: assignedCategory,
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

      setSuccess(`Marked ${validatedCount} transactions as validated`)
      await fetchTransactions()
    } catch (err) {
      setError(`Failed to validate transactions: ${err.message}`)
      console.error(err)
    } finally {
      setValidatingAll(false)
    }
  }

  const handleValidateAllReAssigned = async () => {
    try {
      setValidatingAll(true)
      setError(null)
      setSuccess(null)

      // Find all transactions that have been re-assigned (assigned category differs from predicted)
      const reAssignedTransactions = transactions.filter(t => {
        const assignedCategory = selectedCategory[t.transaction_id] || t.master_category
        const predictedCategory = t.predicted_master_category
        return assignedCategory && 
               !validated[t.transaction_id] &&
               predictedCategory && 
               predictedCategory !== 'UNCERTAIN' &&
               assignedCategory !== predictedCategory
      })

      if (reAssignedTransactions.length === 0) {
        setError('No re-assigned transactions to validate')
        setValidatingAll(false)
        return
      }

      let validatedCount = 0
      
      // Validate each re-assigned transaction
      for (const transaction of reAssignedTransactions) {
        const assignedCategory = selectedCategory[transaction.transaction_id] || transaction.master_category
        
        try {
          await axios.post(
            `${API_BASE_URL}/api/transactions/${transaction.transaction_id}/categorize`,
            {
              master_category: assignedCategory,
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

      setSuccess(`Marked ${validatedCount} re-assigned transactions as validated`)
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
    // But if predicted and assigned are the same, only show predicted
    if (viewMode !== 'validated' && assignedCategory) {
      // If predicted and assigned categories are the same, only show predicted
      if (predictedCategory && 
          predictedCategory !== 'UNCERTAIN' && 
          predictedCategory === assignedCategory) {
        const categoryColor = getCategoryColor(predictedCategory)
        return (
          <span 
            className="category-badge category-predicted" 
            style={{
              backgroundColor: categoryColor,
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
        )
      }
      
      // Otherwise, show both predicted and assigned
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

  // Model Details Page Component
  const ModelDetailsPage = () => {
    const [metricsHistory, setMetricsHistory] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState(null)
    const [selectedMetric, setSelectedMetric] = useState('accuracy') // 'accuracy', 'f1', 'samples'

    useEffect(() => {
      fetchMetricsHistory()
    }, [])

    const fetchMetricsHistory = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await axios.get(`${API_BASE_URL}/api/model/metrics/history`)
        setMetricsHistory(response.data.metrics || [])
      } catch (err) {
        setError(`Failed to load model metrics: ${err.message}`)
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    const formatDate = (dateString) => {
      if (!dateString) return ''
      try {
        // Handle format like "2025-12-30 05:50:27" or ISO format
        const dateStr = dateString.includes('T') ? dateString : dateString.replace(' ', 'T')
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) {
          return dateString // Return original if parsing fails
        }
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        })
      } catch {
        return dateString
      }
    }

    const formatDateForChart = (dateString) => {
      if (!dateString) return ''
      try {
        // Handle format like "2025-12-30 05:50:27" or ISO format
        const dateStr = dateString.includes('T') ? dateString : dateString.replace(' ', 'T')
        const date = new Date(dateStr)
        if (isNaN(date.getTime())) {
          return dateString // Return original if parsing fails
        }
        // More compact format for chart: "Dec 8" or "Dec 8, 2025" if different year
        const now = new Date()
        const isCurrentYear = date.getFullYear() === now.getFullYear()
        if (isCurrentYear) {
          return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
          })
        } else {
          return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: '2-digit'
          })
        }
      } catch {
        return dateString
      }
    }

    // Prepare chart data
    const chartData = metricsHistory.map(metric => ({
      date: formatDateForChart(metric.training_date),
      dateFull: formatDate(metric.training_date),
      dateRaw: metric.training_date,
      accuracy: (metric.accuracy * 100).toFixed(2),
      macroF1: (metric.macro_f1 * 100).toFixed(2),
      weightedF1: (metric.weighted_f1 * 100).toFixed(2),
      macroPrecision: metric.macro_precision ? (metric.macro_precision * 100).toFixed(2) : null,
      macroRecall: metric.macro_recall ? (metric.macro_recall * 100).toFixed(2) : null,
      weightedPrecision: metric.weighted_precision ? (metric.weighted_precision * 100).toFixed(2) : null,
      weightedRecall: metric.weighted_recall ? (metric.weighted_recall * 100).toFixed(2) : null,
      trainSamples: metric.n_train_samples,
      testSamples: metric.n_test_samples,
      totalSamples: metric.n_train_samples + metric.n_test_samples,
      modelVersion: metric.model_version
    }))

    // Get latest metrics for summary cards
    const latestMetrics = metricsHistory.length > 0 ? metricsHistory[metricsHistory.length - 1] : null

    // Empty state
    if (!loading && metricsHistory.length === 0) {
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
            <p style={{ fontSize: '1.1rem', marginBottom: '10px' }}>📊 No Model Metrics Available</p>
            <p style={{ marginBottom: '20px' }}>
              No model training metrics have been recorded yet. Train a model to see performance metrics over time.
            </p>
            <p style={{ fontSize: '0.9rem', color: '#868e96' }}>
              Once you have transaction data and train your first model, metrics will appear here.
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="placeholder-page">
        <div className="header">
          <h1>Model Details</h1>
          <p>Model performance metrics and training history.</p>
        </div>

        {error && (
          <div className="error" style={{ marginBottom: '20px' }}>{error}</div>
        )}

        {loading ? (
          <div className="loading" style={{ padding: '40px', textAlign: 'center' }}>
            Loading model metrics...
          </div>
        ) : (
          <>
            {/* Summary Cards */}
            {latestMetrics && (
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
                gap: '15px', 
                marginBottom: '30px' 
              }}>
                <div style={{ 
                  background: 'white', 
                  padding: '15px', 
                  borderRadius: '8px', 
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' 
                }}>
                  <div style={{ color: '#6c757d', fontSize: '0.8rem', marginBottom: '6px' }}>Accuracy</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: '600', color: '#007bff' }}>
                    {(latestMetrics.accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                <div style={{ 
                  background: 'white', 
                  padding: '15px', 
                  borderRadius: '8px', 
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' 
                }}>
                  <div style={{ color: '#6c757d', fontSize: '0.8rem', marginBottom: '6px' }}>Macro F1</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: '600', color: '#28a745' }}>
                    {(latestMetrics.macro_f1 * 100).toFixed(1)}%
                  </div>
                </div>
                <div style={{ 
                  background: 'white', 
                  padding: '15px', 
                  borderRadius: '8px', 
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' 
                }}>
                  <div style={{ color: '#6c757d', fontSize: '0.8rem', marginBottom: '6px' }}>Weighted F1</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: '600', color: '#ff9800' }}>
                    {(latestMetrics.weighted_f1 * 100).toFixed(1)}%
                  </div>
                </div>
                {latestMetrics.macro_precision !== null && latestMetrics.macro_precision !== undefined && (
                  <div style={{ 
                    background: 'white', 
                    padding: '15px', 
                    borderRadius: '8px', 
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' 
                  }}>
                    <div style={{ color: '#6c757d', fontSize: '0.8rem', marginBottom: '6px' }}>Precision</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: '600', color: '#17a2b8' }}>
                      {(latestMetrics.macro_precision * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
                {latestMetrics.macro_recall !== null && latestMetrics.macro_recall !== undefined && (
                  <div style={{ 
                    background: 'white', 
                    padding: '15px', 
                    borderRadius: '8px', 
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' 
                  }}>
                    <div style={{ color: '#6c757d', fontSize: '0.8rem', marginBottom: '6px' }}>Recall</div>
                    <div style={{ fontSize: '1.75rem', fontWeight: '600', color: '#dc3545' }}>
                      {(latestMetrics.macro_recall * 100).toFixed(1)}%
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Metric Selector */}
            <div style={{ 
              background: 'white', 
              padding: '20px', 
              borderRadius: '8px', 
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{ fontWeight: '500' }}>View Metric:</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="metric"
                    value="accuracy"
                    checked={selectedMetric === 'accuracy'}
                    onChange={(e) => setSelectedMetric(e.target.value)}
                  />
                  <span>Accuracy</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="metric"
                    value="f1"
                    checked={selectedMetric === 'f1'}
                    onChange={(e) => setSelectedMetric(e.target.value)}
                  />
                  <span>F1 Scores</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="metric"
                    value="precision-recall"
                    checked={selectedMetric === 'precision-recall'}
                    onChange={(e) => setSelectedMetric(e.target.value)}
                  />
                  <span>Precision & Recall</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="metric"
                    value="samples"
                    checked={selectedMetric === 'samples'}
                    onChange={(e) => setSelectedMetric(e.target.value)}
                  />
                  <span>Training Samples</span>
                </label>
              </div>
            </div>

            {/* Performance Chart */}
            <div style={{ 
              background: 'white', 
              padding: '30px', 
              borderRadius: '8px', 
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
              marginBottom: '30px'
            }}>
              <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5rem' }}>
                Model Performance Over Time
              </h2>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="date" 
                      angle={-30}
                      textAnchor="end"
                      height={60}
                      interval={0}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis 
                      label={{ 
                        value: selectedMetric === 'samples' ? 'Number of Samples' : 'Percentage (%)', 
                        angle: -90, 
                        position: 'insideLeft' 
                      }}
                    />
                    <Tooltip 
                      formatter={(value, name) => {
                        if (selectedMetric === 'samples') {
                          return [value.toLocaleString(), name]
                        }
                        return [`${value}%`, name]
                      }}
                      labelFormatter={(label, payload) => {
                        // Use full date format in tooltip
                        if (payload && payload.length > 0 && payload[0].payload.dateFull) {
                          return `Date: ${payload[0].payload.dateFull}`
                        }
                        return `Date: ${label}`
                      }}
                    />
                    <Legend />
                    {selectedMetric === 'accuracy' && (
                      <Line 
                        type="monotone" 
                        dataKey="accuracy" 
                        stroke="#007bff" 
                        strokeWidth={2}
                        name="Accuracy (%)"
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                      />
                    )}
                    {selectedMetric === 'f1' && (
                      <>
                        <Line 
                          type="monotone" 
                          dataKey="macroF1" 
                          stroke="#28a745" 
                          strokeWidth={2}
                          name="Macro F1 (%)"
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="weightedF1" 
                          stroke="#ff9800" 
                          strokeWidth={2}
                          name="Weighted F1 (%)"
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </>
                    )}
                    {selectedMetric === 'precision-recall' && (
                      <>
                        <Line 
                          type="monotone" 
                          dataKey="macroPrecision" 
                          stroke="#17a2b8" 
                          strokeWidth={2}
                          name="Macro Precision (%)"
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                          connectNulls={false}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="macroRecall" 
                          stroke="#dc3545" 
                          strokeWidth={2}
                          name="Macro Recall (%)"
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                          connectNulls={false}
                        />
                        {chartData.some(d => d.weightedPrecision !== null) && (
                          <>
                            <Line 
                              type="monotone" 
                              dataKey="weightedPrecision" 
                              stroke="#0dcaf0" 
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              name="Weighted Precision (%)"
                              dot={{ r: 4 }}
                              activeDot={{ r: 6 }}
                              connectNulls={false}
                            />
                            <Line 
                              type="monotone" 
                              dataKey="weightedRecall" 
                              stroke="#e63946" 
                              strokeWidth={2}
                              strokeDasharray="5 5"
                              name="Weighted Recall (%)"
                              dot={{ r: 4 }}
                              activeDot={{ r: 6 }}
                              connectNulls={false}
                            />
                          </>
                        )}
                      </>
                    )}
                    {selectedMetric === 'samples' && (
                      <>
                        <Line 
                          type="monotone" 
                          dataKey="trainSamples" 
                          stroke="#007bff" 
                          strokeWidth={2}
                          name="Training Samples"
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="testSamples" 
                          stroke="#6c757d" 
                          strokeWidth={2}
                          name="Test Samples"
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6c757d' }}>
                  No chart data available
                </div>
              )}
            </div>

            {/* Metrics Table */}
            {metricsHistory.length > 0 && (
              <div style={{ 
                background: 'white', 
                padding: '30px', 
                borderRadius: '8px', 
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)'
              }}>
                <h2 style={{ marginTop: 0, marginBottom: '20px', fontSize: '1.5rem' }}>
                  Training History
                </h2>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #dee2e6' }}>
                        <th style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Training Date</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Accuracy</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Macro F1</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Weighted F1</th>
                        {metricsHistory.some(m => m.macro_precision !== null && m.macro_precision !== undefined) && (
                          <>
                            <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Macro Precision</th>
                            <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Macro Recall</th>
                          </>
                        )}
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Train Samples</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Test Samples</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Features</th>
                        <th style={{ padding: '12px', textAlign: 'right', fontWeight: '600' }}>Classes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metricsHistory.slice().reverse().map((metric, index) => (
                        <tr 
                          key={index} 
                          style={{ 
                            borderBottom: '1px solid #dee2e6',
                            backgroundColor: index === 0 ? '#f8f9fa' : 'transparent'
                          }}
                        >
                          <td style={{ padding: '12px' }}>{formatDate(metric.training_date)}</td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {(metric.accuracy * 100).toFixed(2)}%
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {(metric.macro_f1 * 100).toFixed(2)}%
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {(metric.weighted_f1 * 100).toFixed(2)}%
                          </td>
                          {metricsHistory.some(m => m.macro_precision !== null && m.macro_precision !== undefined) && (
                            <>
                              <td style={{ padding: '12px', textAlign: 'right' }}>
                                {metric.macro_precision !== null && metric.macro_precision !== undefined 
                                  ? `${(metric.macro_precision * 100).toFixed(2)}%` 
                                  : '-'}
                              </td>
                              <td style={{ padding: '12px', textAlign: 'right' }}>
                                {metric.macro_recall !== null && metric.macro_recall !== undefined 
                                  ? `${(metric.macro_recall * 100).toFixed(2)}%` 
                                  : '-'}
                              </td>
                            </>
                          )}
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {metric.n_train_samples.toLocaleString()}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {metric.n_test_samples.toLocaleString()}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {metric.n_features}
                          </td>
                          <td style={{ padding: '12px', textAlign: 'right' }}>
                            {metric.n_classes}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
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
    const [descriptionFilterInput, setDescriptionFilterInput] = useState('') // What user is typing
    const [descriptionFilter, setDescriptionFilter] = useState('') // Debounced value for API calls
    const [availableCategories, setAvailableCategories] = useState([])
    const [showNotes, setShowNotes] = useState(false)
    const [notes, setNotes] = useState({})
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
        transactions.forEach(t => {
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

  // Transaction Categorization Page (existing content)
  const TransactionsPage = () => {
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
            {localDescriptionFilter ? 'No transactions found matching your search.' : 'No transactions found for this view.'}
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
                {viewMode === 'unvalidated_predicted' && <th style={{ width: '80px' }}>Confidence %</th>}
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
      {activeTab === 'transactions' && <TransactionsPage key="transactions-page" />}
      {activeTab === 'model-details' && <ModelDetailsPage />}
      {activeTab === 'all-data' && <AllDataPage />}
    </div>
  )
}

export default App
