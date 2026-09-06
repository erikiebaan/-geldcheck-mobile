/* Geldcheck Future Retirement Bridge v0.2
   Test-only integration. Does not alter validated engine.js.
   Future assets/events affect retirement cashflow only when available, usable and certain enough.
*/
(function(global){
"use strict";
const finite=v=>typeof v==="number"&&Number.isFinite(v);

function certaintyAllowed(x,mode){
  if(mode==="conservative"||mode==="base") return x.certainty==="certain"||x.certainty==="contractual";
  return x.certainty!=="uncertain";
}
function canUseCapital(x,age,mode){
  if(!certaintyAllowed(x,mode))return false;
  if(x.restricted||x.usableForGoals===false)return false;
  if(x.liquidity==="illiquid"||x.liquidity==="restricted")return false;
  if(finite(x.availableFromAge)&&age<x.availableFromAge)return false;
  if(finite(x.endAge)&&age>x.endAge)return false;
  return !["temporary_income","lifetime_income","future_expense"].includes(x.type);
}
function annualIncome(x,age,mode){
  if(!certaintyAllowed(x,mode))return 0;
  if(!(x.type==="temporary_income"||x.type==="lifetime_income"))return 0;
  if(finite(x.availableFromAge)&&age<x.availableFromAge)return 0;
  if(finite(x.endAge)&&age>x.endAge)return 0;
  return (x.monthlyAmount||0)*12*(1-(x.taxRate||0));
}
function annualExpense(x,age,mode){
  if(!certaintyAllowed(x,mode))return 0;
  if(x.type!=="future_expense")return 0;
  if(finite(x.availableFromAge)&&age<x.availableFromAge)return 0;
  if(finite(x.endAge)&&age>x.endAge)return 0;
  if(finite(x.monthlyAmount))return x.monthlyAmount*12;
  return finite(x.netAmount)?x.netAmount:0;
}
function simulate(raw,futureRaw,opts){
  opts=opts||{};
  const base=GeldcheckEngine.normalize(raw||{});
  const fm=GeldcheckFutureLayer.normalize(Object.assign({currentAge:base.age},futureRaw||{}));
  const mode=opts.mode||"conservative";
  const nominalReturn=finite(opts.nominalReturn)?opts.nominalReturn:(mode==="conservative"?.03:.05);
  const inflation=GeldcheckEngine.ASSUMPTIONS.inflation;
  const realReturn=(1+nominalReturn)/(1+inflation)-1;
  const retireAge=Math.max(base.age,base.retireAge);
  const endAge=opts.endAge||95;
  let cash=Math.max(0,base.cash),invested=Math.max(0,base.investments),age=base.age;
  const consumed=new Set(),ledger=[];

  while(age<retireAge){
    const annualSave=Math.max(0,base.monthlySurplus||0)*12;
    invested=invested*(1+realReturn)+annualSave;
    age++;
  }
  if(opts.crashAtRetirement!==false&&mode==="conservative")invested*=.70;

  let failedAge=null;
  while(age<endAge){
    const all=fm.assets.concat(fm.events);
    let injected=0,extraIncome=0,extraExpense=0;
    all.forEach(x=>{
      if(!consumed.has(x.id)&&canUseCapital(x,age,mode)){
        const amt=finite(x.netAmount)?x.netAmount:x.netCurrentValue;
        if(amt>0){cash+=amt;injected+=amt;consumed.add(x.id);}
      }
      extraIncome+=annualIncome(x,age,mode);
      extraExpense+=annualExpense(x,age,mode);
    });

    const aow=(finite(base.aowStartAge)&&age>=base.aowStartAge)?base.aow*12:0;
    const pension=(finite(base.pensionStartAge)&&age>=base.pensionStartAge)?base.pension*12:0;
    const need=Math.max(0,base.cost*12+extraExpense-aow-pension-extraIncome);
    const useCash=Math.min(cash,need);cash-=useCash;
    const rem=need-useCash;
    invested=invested*(1+realReturn)-rem;
    if(invested<0){failedAge=age;invested=0;}
    ledger.push({age,cash,invested,injected,extraIncome,extraExpense,need});
    /* Keep projecting after depletion. This is essential: future income/assets/costs
       must remain observable even when the household fails before their start age. */
    age++;
  }
  return {mode,retireAge,success:failedAge===null,failedAge,endCapital:cash+invested,cash,invested,ledger,consumed:[...consumed]};
}
function compare(raw,futureRaw){
  return {
    conservative:simulate(raw,futureRaw,{mode:"conservative",nominalReturn:.03,crashAtRetirement:true}),
    base:simulate(raw,futureRaw,{mode:"base",nominalReturn:.05,crashAtRetirement:false})
  };
}
global.GeldcheckFutureBridge={simulate,compare};
})(window);
