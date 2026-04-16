// IRS 2026 Percentage Method Tables for Weekly payroll (Publication 15-T)
// Step 1: Adjust for standard deduction (weekly portion)
// Step 2: Apply marginal rates to adjusted wage
const WEEKLY_STANDARD_DEDUCTION = {
  single: 15000 / 52,            // ~$288.46/wk
  married_jointly: 30000 / 52,   // ~$576.92/wk
  married_separately: 15000 / 52,
  head_of_household: 22500 / 52, // ~$432.69/wk
};

// IRS 2026 percentage method — weekly bracket tables
// These are weekly amounts derived from the annual brackets
const WEEKLY_TAX_BRACKETS = {
  single: [
    { min: 0, max: 229.33, rate: 0.10 },          // 11925/52
    { min: 229.33, max: 932.21, rate: 0.12 },      // 48475/52
    { min: 932.21, max: 1987.50, rate: 0.22 },     // 103350/52
    { min: 1987.50, max: 3794.23, rate: 0.24 },    // 197300/52
    { min: 3794.23, max: 4817.79, rate: 0.32 },    // 250525/52
    { min: 4817.79, max: 12045.19, rate: 0.35 },   // 626350/52
    { min: 12045.19, max: Infinity, rate: 0.37 },
  ],
  married_jointly: [
    { min: 0, max: 458.65, rate: 0.10 },           // 23850/52
    { min: 458.65, max: 1864.42, rate: 0.12 },     // 96950/52
    { min: 1864.42, max: 3975.00, rate: 0.22 },    // 206700/52
    { min: 3975.00, max: 7588.46, rate: 0.24 },    // 394600/52
    { min: 7588.46, max: 9635.58, rate: 0.32 },    // 501050/52
    { min: 9635.58, max: 14476.92, rate: 0.35 },   // 752800/52
    { min: 14476.92, max: Infinity, rate: 0.37 },
  ],
  married_separately: [
    { min: 0, max: 229.33, rate: 0.10 },
    { min: 229.33, max: 932.21, rate: 0.12 },
    { min: 932.21, max: 1987.50, rate: 0.22 },
    { min: 1987.50, max: 3794.23, rate: 0.24 },
    { min: 3794.23, max: 4817.79, rate: 0.32 },
    { min: 4817.79, max: 7238.46, rate: 0.35 },    // 376400/52
    { min: 7238.46, max: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0, max: 326.92, rate: 0.10 },           // 17000/52
    { min: 326.92, max: 1247.12, rate: 0.12 },     // 64850/52
    { min: 1247.12, max: 1987.50, rate: 0.22 },    // 103350/52
    { min: 1987.50, max: 3794.23, rate: 0.24 },    // 197300/52
    { min: 3794.23, max: 4817.31, rate: 0.32 },    // 250500/52
    { min: 4817.31, max: 12045.19, rate: 0.35 },   // 626350/52
    { min: 12045.19, max: Infinity, rate: 0.37 },
  ],
};

const SOCIAL_SECURITY_RATE = 0.062;
const MEDICARE_RATE = 0.0145;

export function calculateWeeklyGross(hours, payRate, overtimeThreshold, overtimeMultiplier, additionalPay = {}) {
  const regularHours = Math.min(hours, overtimeThreshold);
  const overtimeHours = Math.max(0, hours - overtimeThreshold);
  const regularPay = regularHours * payRate;
  const overtimePay = overtimeHours * payRate * overtimeMultiplier;

  const holidayPay = additionalPay.holidayPay || 0;
  const ptoPay = additionalPay.ptoPay || 0;
  const travelPay = additionalPay.travelPay || 0;

  return {
    regularHours,
    overtimeHours,
    regularPay,
    overtimePay,
    holidayPay,
    ptoPay,
    travelPay,
    grossPay: regularPay + overtimePay + holidayPay + ptoPay + travelPay,
  };
}

// IRS percentage method: apply weekly brackets to (gross - pretax - standard deduction)
function estimateWeeklyFederalTax(weeklyTaxable, taxStatus) {
  const brackets = WEEKLY_TAX_BRACKETS[taxStatus] || WEEKLY_TAX_BRACKETS.single;
  const stdDeduction = WEEKLY_STANDARD_DEDUCTION[taxStatus] || WEEKLY_STANDARD_DEDUCTION.single;

  const adjusted = Math.max(0, weeklyTaxable - stdDeduction);

  let tax = 0;
  for (const bracket of brackets) {
    if (adjusted <= bracket.min) break;
    const taxable = Math.min(adjusted, bracket.max) - bracket.min;
    tax += taxable * bracket.rate;
  }
  return tax;
}

export function calculateDeductions(grossPay, taxStatus, deductions = [], w4Credits = 0) {
  // Calculate pre-tax deductions first (they reduce taxable income for FICA and federal)
  let preTaxTotal = 0;
  let postTaxTotal = 0;
  const customDeductionDetails = deductions.map((d) => {
    let amount;
    if (d.type === 'percentage') {
      amount = grossPay * (d.value / 100);
    } else {
      amount = d.value;
    }
    if (d.preTax) {
      preTaxTotal += amount;
    } else {
      postTaxTotal += amount;
    }
    return { name: d.name, amount, preTax: d.preTax };
  });

  // Taxable income after pre-tax deductions
  const taxableIncome = grossPay - preTaxTotal;

  // FICA on taxable income (after pre-tax deductions)
  const socialSecurity = taxableIncome * SOCIAL_SECURITY_RATE;
  const medicare = taxableIncome * MEDICARE_RATE;

  // Federal income tax using IRS percentage method (weekly)
  // W-4 Step 3 credits (annual amount for dependents) reduce withholding
  const weeklyCredit = w4Credits / 52;
  const federalTax = Math.max(0, estimateWeeklyFederalTax(taxableIncome, taxStatus) - weeklyCredit);

  const totalDeductions = federalTax + socialSecurity + medicare + preTaxTotal + postTaxTotal;
  const netPay = grossPay - totalDeductions;

  return {
    federalTax,
    socialSecurity,
    medicare,
    preTaxTotal,
    customDeductions: customDeductionDetails,
    totalDeductions,
    netPay,
  };
}
