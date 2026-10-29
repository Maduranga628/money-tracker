// Loans are created and repaid from the Loans tab, which uses these categories.
// They are kept out of the normal transaction forms.
export const LOAN_CATEGORY_NAMES = ['Loan Given', 'Loan Received', 'Loan Repaid', 'Loan Paid']

export const isLoanCategory = (category) => LOAN_CATEGORY_NAMES.includes(category.name)
