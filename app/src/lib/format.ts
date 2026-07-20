const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 })
export const fmtINR = (value: number) => inr.format(value)

export function today() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export const sectorLabels: Record<string, string> = {
  dairy: 'Dairy', poultry: 'Poultry', food_processing: 'Food processing',
  handicrafts: 'Handicrafts', rural_retail: 'Rural retail',
}
