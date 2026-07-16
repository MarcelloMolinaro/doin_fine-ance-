import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { API_BASE_URL } from '../config'

// Model Details: training-metrics history charts and table. Fully self-contained
// (owns its data fetching and local state).
function ModelDetailsPage() {
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

export default ModelDetailsPage
