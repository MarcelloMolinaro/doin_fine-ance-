import React, { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import './index.css'
import { API_BASE_URL, PREDICTION_CONFIDENCE_THRESHOLD, LOW_CONFIDENCE_THRESHOLD } from './config'
import { getCategoryColor } from './utils/format.jsx'
import ControlCenterPage from './pages/ControlCenterPage.jsx'
import TransactionsPage from './pages/TransactionsPage.jsx'
import ModelDetailsPage from './pages/ModelDetailsPage.jsx'
import AllDataPage from './pages/AllDataPage.jsx'
import BackupPage from './pages/BackupPage.jsx'

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
  const [excludeFromForecast, setExcludeFromForecast] = useState({})
  const [selectedTransactions, setSelectedTransactions] = useState(new Set()) // New: selection state (separate from validation)
  const [activeTab, setActiveTab] = useState('control-center') // 'control-center', 'transactions', 'model-details', 'all-data', 'backup'
  const [viewMode, setViewMode] = useState('unvalidated_predicted') // 'unvalidated_predicted', 'unvalidated_unpredicted', 'validated'
  const [validatingAll, setValidatingAll] = useState(false)
  const [showNotes, setShowNotes] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(100) // Records per page
  const [descriptionFilter, setDescriptionFilter] = useState('') // Debounced value for API calls (input lives in TransactionsPage)
  const [totalCount, setTotalCount] = useState(0)
  // Persist TransactionsPage filter per viewMode across component recreations
  const transactionsPageFilterRef = useRef({})
  const [refreshingValidated, setRefreshingValidated] = useState(false)
  const [excludeLowConfidence, setExcludeLowConfidence] = useState(false)
  const [confidenceSort, setConfidenceSort] = useState('default') // 'default' | 'asc' | 'desc'
  const [triggeringIngest, setTriggeringIngest] = useState(false)
  const [warnings, setWarnings] = useState([])
  const [loadingWarnings, setLoadingWarnings] = useState(true)
  const [warningsError, setWarningsError] = useState(null)
  const [trainingStatus, setTrainingStatus] = useState(null)
  const [loadingTrainingStatus, setLoadingTrainingStatus] = useState(false)
  const [needsInitialization, setNeedsInitialization] = useState(false)
  const [loadingInitStatus, setLoadingInitStatus] = useState(true)
  const [triggeringInit, setTriggeringInit] = useState(false)

  useEffect(() => {
    setCurrentPage(1) // Reset to first page when view mode changes
    if (viewMode !== 'unvalidated_predicted') {
      setExcludeLowConfidence(false)
      setConfidenceSort('default')
    }
    // Note: descriptionFilter is now managed by TransactionsPage component
  }, [viewMode])

  useEffect(() => {
    fetchTransactions()
    fetchCategories()
    if (viewMode === 'unvalidated_predicted') {
      fetchTrainingStatus()
    }
  }, [viewMode, currentPage, descriptionFilter, excludeLowConfidence, confidenceSort])
  
  const fetchTrainingStatus = async () => {
    try {
      setLoadingTrainingStatus(true)
      const response = await axios.get(`${API_BASE_URL}/api/model/training-status`)
      setTrainingStatus(response.data)
    } catch (err) {
      console.error('Failed to load training status:', err)
      // Don't set error state - this is not critical
    } finally {
      setLoadingTrainingStatus(false)
    }
  }

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
      fetchInitializationStatus()
    }
  }, [activeTab])

  const fetchInitializationStatus = async () => {
    try {
      setLoadingInitStatus(true)
      const response = await axios.get(`${API_BASE_URL}/api/control-center/initialization-status`)
      setNeedsInitialization(response.data.needs_initialization || false)
    } catch (err) {
      console.error('Failed to load initialization status:', err)
      // Assume we need initialization if we can't check
      setNeedsInitialization(true)
    } finally {
      setLoadingInitStatus(false)
    }
  }

  const handleTriggerInitialization = async () => {
    try {
      setTriggeringInit(true)
      setError(null)
      setSuccess(null)

      const response = await axios.post(`${API_BASE_URL}/api/control-center/trigger-initialization`)
      
      if (response.data.success) {
        setSuccess(`Initialization job triggered successfully! Run ID: ${response.data.run_id}. This may take several minutes.`)
        // Refresh initialization status after a delay
        setTimeout(() => {
          fetchInitializationStatus()
        }, 5000)
      } else {
        setError(response.data.message || 'Failed to trigger initialization')
      }
    } catch (err) {
      setError(`Failed to trigger initialization: ${err.response?.data?.detail || err.message}`)
      console.error(err)
    } finally {
      setTriggeringInit(false)
    }
  }

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
      if (viewMode === 'unvalidated_predicted') {
        if (excludeLowConfidence) {
          params.exclude_low_confidence = true
        }
        if (confidenceSort !== 'default') {
          params.sort_by = 'prediction_confidence'
          params.sort_order = confidenceSort
        }
      }
      const response = await axios.get(`${API_BASE_URL}/api/transactions`, { params })
      const fetchedTransactions = response.data.transactions || response.data
      const count = response.data.total_count || fetchedTransactions.length
      setTransactions(fetchedTransactions)
      setTotalCount(count)
      
      // Initialize state from fetched transactions, but preserve existing user-assigned categories
      const initialNotes = {}
      const initialValidated = {}
      const initialExcludeFromForecast = {}
      const initialSelected = {}
      
      fetchedTransactions.forEach(t => {
        if (t.notes) initialNotes[t.transaction_id] = t.notes
        if (t.validated !== undefined) initialValidated[t.transaction_id] = t.validated
        if (t.exclude_from_forecast) initialExcludeFromForecast[t.transaction_id] = true
        // Only set selected category if user has assigned one (master_category from user_categories)
        // This represents validated categories from the database
        if (t.master_category) {
          initialSelected[t.transaction_id] = t.master_category
        }
      })
      
      setNotes(prevNotes => ({ ...prevNotes, ...initialNotes }))
      setValidated(prevValidated => ({ ...prevValidated, ...initialValidated }))
      setExcludeFromForecast(prev => ({ ...prev, ...initialExcludeFromForecast }))
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
            validated: currentValidated,
            exclude_from_forecast: excludeFromForecast[transactionId] || false,
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
              validated: true,
              exclude_from_forecast: excludeFromForecast[transactionId] || false,
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
              validated: false,
              exclude_from_forecast: excludeFromForecast[transactionId] || false,
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

  const handleExcludeFromForecastToggle = async (transactionId, newValue) => {
    setExcludeFromForecast(prev => ({ ...prev, [transactionId]: newValue }))

    const transaction = transactions.find(t => t.transaction_id === transactionId)
    if (transaction?.validated) {
      try {
        setError(null)
        await axios.put(
          `${API_BASE_URL}/api/transactions/${transactionId}/exclude-from-forecast`,
          { exclude_from_forecast: newValue }
        )
      } catch (err) {
        setExcludeFromForecast(prev => ({ ...prev, [transactionId]: !newValue }))
        setError(`Failed to update forecast exclusion: ${err.message}`)
      }
    }
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
                validated: true,
                exclude_from_forecast: excludeFromForecast[transaction.transaction_id] || false,
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
              validated: true,
              exclude_from_forecast: excludeFromForecast[transaction.transaction_id] || false,
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
              validated: true,
              exclude_from_forecast: excludeFromForecast[transaction.transaction_id] || false,
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
    // Confirmation popup with clear warning
    const confirmed = window.confirm(
      "Run Validated Transactions Pipeline\n\n" +
      "Note: This will commit validated transactions to the All Data tab, retrain the model on that data, and re-predict categories for uncategorized transactions.\n\n" +
      "Do you want to continue?"
    )
    
    if (!confirmed) {
      return
    }

    try {
      setRefreshingValidated(true)
      setError(null)
      setSuccess(null)

      const response = await axios.post(`${API_BASE_URL}/api/transactions/trigger-refresh-validated`)
      
      if (response.data.success) {
        setSuccess(`Refresh job triggered successfully! Run ID: ${response.data.run_id}. This may take several minutes to complete.`)
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

  const isLowConfidencePrediction = (transaction) => {
    if (!transaction.prediction_confidence || transaction.predicted_master_category === 'UNCERTAIN') {
      return false
    }
    const confidence = parseFloat(transaction.prediction_confidence)
    return confidence >= PREDICTION_CONFIDENCE_THRESHOLD && confidence < LOW_CONFIDENCE_THRESHOLD
  }

  const getLowConfidenceTag = (transaction) => {
    if (viewMode !== 'unvalidated_predicted' || !isLowConfidencePrediction(transaction)) {
      return null
    }
    return <span className="confidence-tag-low" title="Model confidence is below 35%">Low</span>
  }

  const getConfidenceDisplay = (transaction) => {
    if (transaction.prediction_confidence && transaction.predicted_master_category && transaction.predicted_master_category !== 'UNCERTAIN') {
      const confidence = (parseFloat(transaction.prediction_confidence) * 100).toFixed(0)
      const color = isLowConfidencePrediction(transaction) ? '#856404' : '#495057'
      return <span style={{ color, fontSize: '0.875rem' }}>{confidence}%</span>
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

  const renderTransactionDetailsCell = ({
    transactionId,
    noteValue,
    onNoteBlur,
    excludeValue,
    onExcludeChange,
    persistExcludeImmediately = false,
  }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '180px' }}>
      <input
        key={`notes-${transactionId}`}
        type="text"
        placeholder="Add note..."
        defaultValue={noteValue || ''}
        onBlur={onNoteBlur}
        className="notes-input"
        style={{ width: '100%', padding: '4px 8px', border: '1px solid #ced4da', borderRadius: '4px' }}
      />
      <label
        style={{
          fontSize: '0.8rem',
          color: '#6c757d',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '6px',
          lineHeight: 1.3,
          cursor: 'pointer',
        }}
        title="When checked, this transaction won't be used in future forecasting"
      >
        <input
          type="checkbox"
          checked={excludeValue || false}
          onChange={(e) => onExcludeChange(transactionId, e.target.checked)}
          style={{ width: '16px', height: '16px', marginTop: '2px', flexShrink: 0 }}
        />
        <span>Skip in forecasts{!persistExcludeImmediately ? ' (saved on validate)' : ''}</span>
      </label>
    </div>
  )

  const renderExcludedIndicator = (transactionId) => {
    if (!excludeFromForecast[transactionId]) return null
    return (
      <span
        title="Excluded from forecasting"
        style={{
          marginLeft: '6px',
          fontSize: '0.7rem',
          color: '#856404',
          backgroundColor: '#fff3cd',
          padding: '1px 6px',
          borderRadius: '8px',
          whiteSpace: 'nowrap',
        }}
      >
        no forecast
      </span>
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
        <button
          className={`tab-button ${activeTab === 'backup' ? 'active' : ''}`}
          onClick={() => setActiveTab('backup')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderBottom: activeTab === 'backup' ? '2px solid #007bff' : '2px solid transparent',
            background: 'none',
            cursor: 'pointer',
            color: activeTab === 'backup' ? '#007bff' : '#495057',
            fontWeight: activeTab === 'backup' ? '600' : '400',
            fontSize: '0.95rem',
            marginBottom: '-2px'
          }}
        >
          Backup
        </button>
      </div>
    )
  }


  return (
    <div className="container">
      {renderTabs()}
      
      {activeTab === 'control-center' && (
        <ControlCenterPage
          error={error}
          success={success}
          loadingInitStatus={loadingInitStatus}
          needsInitialization={needsInitialization}
          handleTriggerInitialization={handleTriggerInitialization}
          triggeringInit={triggeringInit}
          handleTriggerIngestAndPredict={handleTriggerIngestAndPredict}
          triggeringIngest={triggeringIngest}
          warnings={warnings}
          warningsError={warningsError}
          loadingWarnings={loadingWarnings}
          fetchWarnings={fetchWarnings}
          onCategoriesChanged={fetchCategories}
        />
      )}
      {activeTab === 'transactions' && (
        <TransactionsPage
          key="transactions-page"
          transactionsPageFilterRef={transactionsPageFilterRef}
          viewMode={viewMode}
          setViewMode={setViewMode}
          trainingStatus={trainingStatus}
          transactions={transactions}
          validated={validated}
          selectedCategory={selectedCategory}
          setSelectedCategory={setSelectedCategory}
          categories={categories}
          selectedTransactions={selectedTransactions}
          updatingId={updatingId}
          totalCount={totalCount}
          currentPage={currentPage}
          setCurrentPage={setCurrentPage}
          pageSize={pageSize}
          showNotes={showNotes}
          setShowNotes={setShowNotes}
          notes={notes}
          setNotes={setNotes}
          excludeFromForecast={excludeFromForecast}
          refreshingValidated={refreshingValidated}
          validatingAll={validatingAll}
          excludeLowConfidence={excludeLowConfidence}
          setExcludeLowConfidence={setExcludeLowConfidence}
          confidenceSort={confidenceSort}
          setConfidenceSort={setConfidenceSort}
          error={error}
          success={success}
          loading={loading}
          setDescriptionFilter={setDescriptionFilter}
          handleRefreshValidatedTrxns={handleRefreshValidatedTrxns}
          handleSelectAllPredicted={handleSelectAllPredicted}
          handleValidateAllReAssigned={handleValidateAllReAssigned}
          handleSelectAll={handleSelectAll}
          handleValidateAllAssigned={handleValidateAllAssigned}
          handleDeselectAll={handleDeselectAll}
          handleBulkAssignCategory={handleBulkAssignCategory}
          handleBulkValidate={handleBulkValidate}
          handleSelectTransaction={handleSelectTransaction}
          handleValidateToggle={handleValidateToggle}
          handleNotesUpdate={handleNotesUpdate}
          handleExcludeFromForecastToggle={handleExcludeFromForecastToggle}
          getLowConfidenceTag={getLowConfidenceTag}
          getPredictedCategoryDisplay={getPredictedCategoryDisplay}
          getAssignedCategoryDisplay={getAssignedCategoryDisplay}
          getConfidenceDisplay={getConfidenceDisplay}
          renderExcludedIndicator={renderExcludedIndicator}
          renderTransactionDetailsCell={renderTransactionDetailsCell}
        />
      )}
      {activeTab === 'model-details' && <ModelDetailsPage />}
      {activeTab === 'all-data' && (
        <AllDataPage
          renderExcludedIndicator={renderExcludedIndicator}
          renderTransactionDetailsCell={renderTransactionDetailsCell}
        />
      )}
      {activeTab === 'backup' && <BackupPage activeTab={activeTab} />}
    </div>
  )
}

export default App
