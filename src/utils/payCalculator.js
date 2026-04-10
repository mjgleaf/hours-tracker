// Federal tax brackets for 2026 (approximate)
const FEDERAL_BRACKETS = {
  single: [
    { min: 0, max: 11925, rate: 0.10 },
    { min: 11925, max: 48475, rate: 0.12 },
    { min: 48475, max: 103350, rate: 0.22 },
    { min: 103350, max: 197300, rate: 0.24 },
    { min: 197300, max: 250525, rate: 0.32 },
    { min: 250525, max: 626350, rate: 0.35 },
    { min: 626350, max: Infinity, rate: 0.37 },
  ],
  married_jointly: [
    { min: 0, max: 23850, rate: 0.10 },
    { min: 23850, max: 96950, rate: 0.12 },
    { min: 96950, max: 206700, rate: 0.22 },
    { min: 206700, max: 394600, rate: 0.24 },
    { min: 394600, max: 501050, rate: 0.32 },
    { min: 501050, max: 752800, rate: 0.35 },
    { min: 752800, max: Infinity, rate: 0.37 },
  ],
  married_separately: [
    { min: 0, max: 11925, rate: 0.10 },
    { min: 11925, max: 48475, rate: 0.12 },
    { min: 48475, max: 103350, rate: 0.22 },
    { min: 103350, max: 197300, rate: 0.24 },
    { min: 197300, max: 250525, rate: 0.32 },
    { min: 250525, max: 376400, rate: 0.35 },
    { min: 376400, max: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { min: 0, max: 17000, rate: 0.10 },
    { min: 17000, max: 64850, rate: 0.12 },
    { min: 64850, max: 103350, rate: 0.22 },
    { min: 103350, max: 197300, rate: 0.24 },
    { min: 197300, max: 250500, rate: 0.32 },
    { min: 250500, max: 626350, rate: 0.35 },
    { min: 626350, max: Infinity, rate: 0.37 },
  ],
};

const SOCIAL_SECURITY_RATE = 0.062;
const MEDICARE_RATE = 0.0145;

export function calculateWeeklyGross(hours, payRate, overtimeThreshold, overtimeMultiplier) {
  const regularHours = Math.min(hours, overtimeThreshold);
  const overtimeHours = Math.max(0, hours - overtimeThreshold);
  const regularPay = regularHours * payRate;
  const overtimePay = overtimeHours * payRate * overtimeMultiplier;
  return {
    regularHours,
    overtimeHours,
    regularPay,
    overtimePay,
    grossPay: regularPay + overtimePay,
  };
}

export function estimateFederalTax(annualTaxable, taxStatus) {
  const brackets = FEDERAL_BRACKETS[taxStatus] || FEDERAL_BRACKETS.single;
  let tax = 0;
  for (const bracket of brackets) {
    if (annualTaxable <= bracket.min) break;
    const taxable = Math.min(annualTaxable, bracket.max) - bracket.min;
    tax += taxable * bracket.rate;
  }
  return tax;
}

export function calculateDeductions(grossPay, taxStatus, deductions = []) {
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

  // Federal income tax (weekly portion of annual estimate)
  const annualTaxable = taxableIncome * 52;
  const annualFederalTax = estimateFederalTax(annualTaxable, taxStatus);
  const federalTax = annualFederalTax / 52;

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
