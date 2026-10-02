import { calculateIncome, DEFAULT_RULES } from '../src/lib/income';
test('Estimated != Paid display separation',()=>{
  const est = calculateIncome(100000, DEFAULT_RULES, {type:'personal_commission'});
  expect(est).toBe(25000);
  // Disclaimer must be shown
  expect(require('../src/lib/income').INCOME_DISCLAIMER).toContain('ไม่ใช่การรับประกันรายได้');
});
test('Income rule versioned not hard-coded',()=>{
  const v1=[{type:'personal_commission',rate:0.2,base:'x'}];
  const v2=[{type:'personal_commission',rate:0.25,base:'x'}];
  expect(calculateIncome(10000,v1,{type:'personal_commission'})).toBe(2000);
  expect(calculateIncome(10000,v2,{type:'personal_commission'})).toBe(2500);
});
