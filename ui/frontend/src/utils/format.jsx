// Pure presentation helpers shared across pages. These depend only on their
// arguments (no component state), so they live outside the components.

// Distinct pastel color mapping - each category gets a unique, easily
// distinguishable color. Colors are evenly spaced across the spectrum for
// maximum visual distinction.
const CATEGORY_COLOR_MAP = {
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

export function getCategoryColor(category) {
  return CATEGORY_COLOR_MAP[category] || '#e0e0e0' // Default light grey for unknown categories
}

export function formatDate(dateString) {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatAmount(amount) {
  if (!amount) return '-'
  const numAmount = parseFloat(amount)
  const formatted = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Math.abs(numAmount))

  return (
    <span className={`amount ${numAmount < 0 ? 'amount-negative' : 'amount-positive'}`}>
      {numAmount < 0 ? '-' : '+'}{formatted}
    </span>
  )
}
