/* Geldcheck Future Retirement Bridge v0.41 candidate
   Isolated from validated v0.3. Adds recoverable future cashflows and exact net-flow handling.
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
function applyPositiveAmount(state,amt){
  if(!(amt>0))return;
  const repay=Math.min(state.fundingGap,amt);
  state.fundingGap-=repay; amt-=repay;
  if(amt>0) state.invested+=amt;
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
  let state={cash:Math.max(0,base.cash),invested:Math.max(0,base.investments),fundingGap:0};
  let age=base.age, firstGapAge=null, recoveredAge=null;
  const consumed=new Set(),ledger=[];

  while(age<retireAge){
    const all=fm.assets.concat(fm.events);
    let preIncome=0,preExpense=0;
    all.forEach(x=>{preIncome+=annualIncome(x,age,mode);preExpense+=annualExpense(x,age,mode);});
    const annualNet=(base.monthlySurplus||0)*12+preIncome-preExpense;
    state.invested*=1+realReturn;
    if(annualNet>=0) state.invested+=annualNet;
    else{
      let need=-annualNet;
      const useCash=Math.min(state.cash,need); state.cash-=useCash; need-=useCash;
      const useInv=Math.min(state.invested,need); state.invested-=useInv; need-=useInv;
      if(need>0){state.fundingGap+=need;if(firstGapAge===null)firstGapAge=age;}
    }
    age++;
  }
  if(opts.crashAtRetirement!==false&&mode==="conservative")state.invested*=.70;

  while(age<endAge){
    const all=fm.assets.concat(fm.events);
    let injected=0,extraIncome=0,extraExpense=0;
    const injectedItems=[];
    all.forEach(x=>{
      if(!consumed.has(x.id)&&canUseCapital(x,age,mode)){
        const amt=finite(x.netAmount)?x.netAmount:x.netCurrentValue;
        if(amt>0){
          applyPositiveAmount(state,amt);
          injected+=amt;
          injectedItems.push({id:x.id,amount:amt,availableFromAge:x.availableFromAge});
          consumed.add(x.id);
        }
      }
      extraIncome+=annualIncome(x,age,mode);
      extraExpense+=annualExpense(x,age,mode);
    });

    const aow=(finite(base.aowStartAge)&&age>=base.aowStartAge)?base.aow*12:0;
    const pension=(finite(base.pensionStartAge)&&age>=base.pensionStartAge)?base.pension*12:0;
    const annualNet=aow+pension+extraIncome-(base.cost*12+extraExpense);

    state.invested*=1+realReturn;
    if(annualNet>=0){
      let surplus=annualNet;
      const repay=Math.min(state.fundingGap,surplus); state.fundingGap-=repay; surplus-=repay;
      if(surplus>0)state.invested+=surplus;
    }else{
      let need=-annualNet;
      const useCash=Math.min(state.cash,need);state.cash-=useCash;need-=useCash;
      const useInv=Math.min(state.invested,need);state.invested-=useInv;need-=useInv;
      if(need>0){state.fundingGap+=need;if(firstGapAge===null)firstGapAge=age;}
    }
    if(firstGapAge!==null&&state.fundingGap===0&&recoveredAge===null)recoveredAge=age;
    const netPosition=state.cash+state.invested-state.fundingGap;
    ledger.push({age,cash:state.cash,invested:state.invested,fundingGap:state.fundingGap,netPosition,injected,injectedItems,extraIncome,extraExpense,annualNet});
    age++;
  }
  const endCapital=state.cash+state.invested-state.fundingGap;
  return {mode,retireAge,success:state.fundingGap===0,uninterruptedSuccess:firstGapAge===null,
    firstGapAge,recoveredAge,endCapital,grossCapital:state.cash+state.invested,fundingGap:state.fundingGap,
    cash:state.cash,invested:state.invested,ledger,consumed:[...consumed]};
}
function compare(raw,futureRaw){
  return {
    conservative:simulate(raw,futureRaw,{mode:"conservative",nominalReturn:.03,crashAtRetirement:true}),
    base:simulate(raw,futureRaw,{mode:"base",nominalReturn:.05,crashAtRetirement:false})
  };
}
global.GeldcheckFutureBridgeV04={simulate,compare};
})(window);