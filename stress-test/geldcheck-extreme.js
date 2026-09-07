// regression: universal financial changes
"use strict";

let seed=20260907;
function rnd(){ seed=(seed*1664525+1013904223)>>>0; return seed/4294967296; }
function pick(a){ return a[Math.floor(rnd()*a.length)]; }
function ri(a,b){ return Math.floor(rnd()*(b-a+1))+a; }
function finite(x){ return Number.isFinite(x); }
function cut(age){ return finite(age)?Math.ceil(age-1e-9):Infinity; }

function mortgageInfo(p){
  const r=p.mortRate/12, pay=Math.max(0,p.mortPayment), interest=p.mortgage*r;
  const contractualEnd=(p.mortEndAge>0&&p.mortEndAge>=p.age)?p.mortEndAge:0;
  const monthsToEnd=contractualEnd?Math.max(0,Math.round((contractualEnd-p.age)*12)):Infinity;
  if(p.mortgage<=0)return {endAge:p.age,residual:0,interest:0,principal:0};
  const annuityBalance=(principal0,months,payment)=>{
    if(principal0<=0)return 0;if(months<=0)return principal0;
    if(r<=0)return Math.max(0,principal0-payment*months);
    const pow=Math.pow(1+r,months);
    return Math.max(0,principal0*pow-payment*((pow-1)/r));
  };
  if(p.mortType==="interestOnly")return {endAge:contractualEnd||Infinity,residual:p.mortgage,interest,principal:0};
  if(p.mortType==="linear"){
    const principal=Math.max(0,pay-interest);
    if(principal<=0)return {endAge:contractualEnd||Infinity,residual:p.mortgage,interest,principal:0};
    const naturalMonths=p.mortgage/principal, used=contractualEnd?monthsToEnd:naturalMonths;
    return {endAge:contractualEnd||p.age+naturalMonths/12,residual:Math.max(0,p.mortgage-principal*used),interest,principal};
  }
  if(p.mortType==="combination"){
    const ioPart=Math.max(0,Math.min(p.mortgage,p.mortResidual)), amortPart=Math.max(0,p.mortgage-ioPart);
    const amortPayment=Math.max(0,pay-ioPart*r), principal=Math.max(0,amortPayment-amortPart*r);
    if(contractualEnd)return {endAge:contractualEnd,residual:ioPart+annuityBalance(amortPart,monthsToEnd,amortPayment),interest,principal};
    if(amortPart<=0)return {endAge:Infinity,residual:ioPart,interest,principal:0};
    if(r>0&&amortPayment<=amortPart*r)return {endAge:Infinity,residual:p.mortgage,interest,principal:0};
    const months=r<=0?amortPart/Math.max(1,amortPayment):-Math.log(1-r*amortPart/amortPayment)/Math.log(1+r);
    return {endAge:p.age+months/12,residual:ioPart,interest,principal};
  }
  const principal=Math.max(0,pay-interest);
  if(contractualEnd)return {endAge:contractualEnd,residual:annuityBalance(p.mortgage,monthsToEnd,pay),interest,principal};
  if(pay<=0||(r>0&&pay<=interest))return {endAge:Infinity,residual:p.mortgage,interest,principal:0};
  const months=r<=0?p.mortgage/pay:-Math.log(1-r*p.mortgage/pay)/Math.log(1+r);
  return {endAge:p.age+months/12,residual:0,interest,principal};
}

function debtInfo(p){
  const debt=Math.max(0,p.otherDebt),r=Math.max(0,p.otherDebtRate)/12,pay=Math.max(0,p.otherDebtPayment);
  if(debt<=0)return {endAge:p.age,residual:0};
  const contractualEnd=(p.otherDebtEndAge>0&&p.otherDebtEndAge>=p.age)?p.otherDebtEndAge:0;
  const balanceAfter=months=>{
    if(months<=0)return debt;if(pay<=0)return debt*Math.pow(1+r,months);
    if(r<=0)return Math.max(0,debt-pay*months);
    const pow=Math.pow(1+r,months);return Math.max(0,debt*pow-pay*((pow-1)/r));
  };
  let naturalMonths=Infinity;
  if(pay>0){ if(r<=0)naturalMonths=debt/pay; else if(pay>debt*r)naturalMonths=-Math.log(1-r*debt/pay)/Math.log(1+r); }
  if(contractualEnd)return {endAge:contractualEnd,residual:balanceAfter(Math.max(0,Math.round((contractualEnd-p.age)*12)))};
  return {endAge:finite(naturalMonths)?p.age+naturalMonths/12:Infinity,residual:0};
}
function debtBalanceAtAge(p,age,di){
  const d=Math.max(0,p.otherDebt),r=Math.max(0,p.otherDebtRate)/12,pay=Math.max(0,p.otherDebtPayment);
  if(d<=0)return 0;
  const n=Math.max(0,Math.round((Math.min(age,di.endAge)-p.age)*12));
  let bal;
  if(pay<=0)bal=d*Math.pow(1+r,n);
  else if(r<=0)bal=Math.max(0,d-pay*n);
  else { const pow=Math.pow(1+r,n); bal=Math.max(0,d*pow-pay*((pow-1)/r)); }
  if(age>=cut(di.endAge))return 0;
  return bal;
}
function annualSpendAt(p,age,mi,di){
  let spend=Math.max(0,p.spend*12);
  if(age>=cut(mi.endAge))spend=Math.max(0,spend-p.mortPayment*12);
  if(age>=cut(di.endAge))spend=Math.max(0,spend-p.otherDebtPayment*12);
  return spend;
}
function settle(state,net){
  if(net>=0){
    let surplus=net;
    if(state.deficit>0){
      const repair=Math.min(state.deficit,surplus);
      state.deficit-=repair;surplus-=repair;
    }
    state.cash+=surplus;
  }else{
    let need=-net;
    const fromCash=Math.min(state.cash,need);state.cash-=fromCash;need-=fromCash;
    const fromInv=Math.min(state.inv,need);state.inv-=fromInv;need-=fromInv;
    if(need>0)state.deficit+=need;
  }
  state.cash=Math.max(0,state.cash);state.inv=Math.max(0,state.inv);
  if(state.cash>state.cashTarget){state.inv+=state.cash-state.cashTarget;state.cash=state.cashTarget;}
}
function simulate(p,nominal){
  const mi=mortgageInfo(p),di=debtInfo(p);
  let state={cash:Math.max(0,p.cash),inv:Math.max(0,p.capital),deficit:0,cashTarget:Math.max(0,p.cash)};
  const rr=(1+nominal)/(1+p.inflation)-1,cr=(1+p.cashRate)/(1+p.inflation)-1;
  let min=state.cash+state.inv-state.deficit-p.otherDebt,end=min,depletionAge=null;
  const path=[min];
  for(let age=p.age;age<p.endAge;age++){
    state.inv=Math.max(0,state.inv)*(1+rr);state.cash*=1+cr;
    let income=age<p.stopAge?p.income*(1-p.workReduction):0;
    if(age>=p.aowAge)income+=p.aow;
    if(age>=p.pensionAge)income+=p.pension;
    let spend=annualSpendAt(p,age,mi,di),oneOff=0;
    if(finite(mi.endAge)&&age===cut(mi.endAge)&&mi.residual>0)oneOff+=mi.residual;
    if(finite(di.endAge)&&age===cut(di.endAge)&&di.residual>0)oneOff+=di.residual;
    settle(state,income*12-spend-oneOff);
    end=state.cash+state.inv-state.deficit-debtBalanceAtAge(p,age+1,di);
    min=Math.min(min,end); if(end<0&&depletionAge===null)depletionAge=age+1;path.push(end);
  }
  return {end,min,depletionAge,path,mi,di};
}
function requiredNominal(p){
  const survives=n=>{const s=simulate(p,n);return s.end>=p.endBuffer&&s.min>=p.endBuffer};
  if(survives(0))return 0;
  if(!survives(.30))return Infinity;
  let lo=0,hi=.30;
  for(let i=0;i<90;i++){const m=(lo+hi)/2;if(survives(m))hi=m;else lo=m;}
  return hi;
}
function scenario(i){
  const age=ri(18,88),end=ri(age+1,110);
  const mortEnd=pick([0,age,Math.min(end,age+1),Math.min(end,age+10),Math.min(end,age+30)]);
  const debtEnd=pick([0,age,Math.min(end,age+1),Math.min(end,age+15)]);
  return {
    id:i,age,endAge:end,stopAge:ri(age,end),
    income:pick([0,500,1800,3000,10000,100000]),spend:pick([0,500,2100,10000,100000]),
    cash:pick([0,1000,50000,1e6,50e6]),cashRate:pick([0,.01,.03,.10]),
    capital:pick([0,1000,250000,1e6,80e6]),inflation:pick([0,.02,.05,.10]),
    endBuffer:pick([0,50000,250000,1e6]),workReduction:pick([0,.4,1,1.2]),
    aowAge:pick([age,67,end+5]),aow:pick([0,1500,5000]),
    pensionAge:pick([age,67,end+5]),pension:pick([0,1000,10000]),
    mortgage:pick([0,245000,1e6]),mortRate:pick([0,.035,.10,.25]),mortPayment:pick([0,500,1100,10000]),
    mortType:pick(["annuity","linear","interestOnly","combination"]),mortEndAge:mortEnd,mortResidual:pick([0,100000,500000,2e6]),
    otherDebt:pick([0,1000,100000,1e6,10e6]),otherDebtRate:pick([0,.03,.10,.50]),otherDebtPayment:pick([0,100,1000,10000]),
    otherDebtEndAge:debtEnd
  };
}

function normalizePlan(p){
  const q={...p};
  q.workReduction=Math.min(1,Math.max(0,q.workReduction));
  q.mortResidual=Math.min(Math.max(0,q.mortResidual),Math.max(0,q.mortgage));
  q.income=Math.max(0,q.income);q.spend=Math.max(0,q.spend);
  q.cash=Math.max(0,q.cash);q.capital=Math.max(0,q.capital);
  q.otherDebt=Math.max(0,q.otherDebt);q.otherDebtRate=Math.max(0,q.otherDebtRate);q.otherDebtPayment=Math.max(0,q.otherDebtPayment);
  q.mortgage=Math.max(0,q.mortgage);q.mortRate=Math.max(0,q.mortRate);q.mortPayment=Math.max(0,q.mortPayment);
  return q;
}

const findings=[];
function add(id,sev,code,detail){findings.push({id,sev,code,detail});}
for(let i=1;i<=1000;i++){
  const raw=scenario(i); const p=normalizePlan(raw);
  try{
    const s0=simulate(p,0),s3=simulate(p,.03),s5=simulate(p,.05);
    for(const [tag,s] of [["0",s0],["3",s3],["5",s5]]){
      if(![s.end,s.min,...s.path].every(Number.isFinite)) add(i,"CRITICAL","NON_FINITE_"+tag,"NaN/Infinity in simulation");
      if(s.path.length!==p.endAge-p.age+1) add(i,"CRITICAL","BAD_PATH_LENGTH","path length mismatch");
    }
    // monotonicity: higher nominal return should not lower terminal assets in this deterministic model
    if(s5.end+1e-6<s3.end||s3.end+1e-6<s0.end) add(i,"CRITICAL","RETURN_MONOTONICITY","higher return produced lower terminal wealth");
    // spend should never go negative
    const mi=mortgageInfo(p),di=debtInfo(p);
    for(let a=p.age;a<p.endAge;a++) if(annualSpendAt(p,a,mi,di)<-1e-9)add(i,"CRITICAL","NEGATIVE_SPEND","annual spend below zero");
    // validation holes that create nonsensical economics
    if(p.workReduction<0||p.workReduction>1)add(i,"CRITICAL","WORK_REDUCTION_NOT_CLAMPED","work reduction escaped clamp");
    if(p.mortgage>0&&raw.mortEndAge===raw.age&&mortgageInfo(p).endAge!==p.age)add(i,"CRITICAL","MORT_END_NOW_FAIL","mortgage ending now was not immediate");
    if(p.otherDebt>0&&raw.otherDebtEndAge===raw.age&&debtInfo(p).endAge!==p.age)add(i,"CRITICAL","DEBT_END_NOW_FAIL","other debt ending now was not immediate");
    if(p.otherDebt>0&&p.otherDebtPayment===0&&p.otherDebtEndAge===0&&p.otherDebtRate>0){const di=debtInfo(p),b0=debtBalanceAtAge(p,p.age,di),b1=debtBalanceAtAge(p,p.age+1,di);if(!(b1>=b0))add(i,"CRITICAL","UNMANAGED_DEBT_NOT_TRACKED","unmanaged debt did not remain/grow");}
    if(p.mortType==="combination"&&p.mortResidual>p.mortgage)add(i,"CRITICAL","COMBO_RESIDUAL_NOT_CLAMPED","combination residual exceeds mortgage after normalize");
    if(p.endBuffer>p.cash+p.capital-p.otherDebt && requiredNominal(p)===0)add(i,"CRITICAL","IMPOSSIBLE_ZERO_RETURN","0% declared enough despite starting net assets below buffer");
    // required return consistency
    const req=requiredNominal(p);
    if(finite(req)){
      const sr=simulate(p,req);
      if(sr.min+1e-4<p.endBuffer||sr.end+1e-4<p.endBuffer)add(i,"CRITICAL","REQUIRED_RETURN_FAILS","solver result does not satisfy buffer");
      if(req>1e-6){
        const below=simulate(p,Math.max(0,req-.001));
        if(below.min>=p.endBuffer&&below.end>=p.endBuffer)add(i,"MEDIUM","SOLVER_NOT_TIGHT","0.1pp lower return also passes");
      }
    }
  }catch(e){add(i,"CRITICAL","EXCEPTION",String(e&&e.stack||e));}
}

const counts={};for(const f of findings){const k=f.sev+" | "+f.code;counts[k]=(counts[k]||0)+1;}
console.log("GELDCHECK EXTREME STRESS TEST — 1000 SCENARIOS");
console.log("seed:",seed);
console.log("findings:",findings.length,"affected scenarios:",new Set(findings.map(x=>x.id)).size);
for(const [k,v] of Object.entries(counts).sort((a,b)=>b[1]-a[1]))console.log(String(v).padStart(4),k);
console.log("\nSAMPLE FINDINGS");
for(const f of findings.slice(0,40))console.log(JSON.stringify(f));
const critical=findings.filter(x=>x.sev==="CRITICAL").length;
console.log("\nCRITICAL:",critical);
if(critical>0)process.exitCode=1;
