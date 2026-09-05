/* Geldcheck Generic Financial Reasoning Engine v1.0
   Goal: consistent reasoning across many household configurations.
   No customer-specific hardcoding. All thresholds are transparent heuristics.
*/
(function(global){
  "use strict";

  const ASSUMPTIONS = {
    inflation: 0.02,
    returnScenarios: [0.03,0.05,0.07],
    withdrawalRefs: [0.03,0.04],
    bufferMonths: {minimum:3, solid:6, strong:12},
    highInterestDebt: 0.06,
    materialSavingsGapPct: 0.20
  };

  const finite = v => typeof v === "number" && Number.isFinite(v);
  const num = v => {
    if(v===null || v===undefined || v==="") return null;
    const n = Number(String(v).replace(",","."));
    return Number.isFinite(n) ? n : null;
  };
  const clamp = (x,a,b) => Math.max(a,Math.min(b,x));
  const months = (capital, monthlyCost) => finite(capital)&&finite(monthlyCost)&&monthlyCost>0 ? capital/monthlyCost : null;
  const fv = (pv,r,y) => finite(pv)&&finite(r)&&finite(y)&&y>=0 ? pv*Math.pow(1+r,y) : null;
  const real = (nominal,infl,y) => finite(nominal)&&finite(infl)&&finite(y) ? nominal/Math.pow(1+infl,y) : null;

  function normalize(raw){
    const c = {
      age:num(raw.age), household:raw.household||"", kids:num(raw.kids)||0, goal:raw.goal||"health",
      income:num(raw.income), otherIncome:num(raw.otherIncome)||0, cost:num(raw.cost),
      annualIncluded:raw.annualIncluded===true||raw.annualIncluded==="yes",
      savingGrowth:num(raw.savingGrowth),
      housing:raw.housing||"", mortgage:num(raw.mortgage), mortgageRate:num(raw.mortgageRate),
      mortgageEndAge:num(raw.mortgageEndAge), mortgagePayment:num(raw.mortgagePayment), rent:num(raw.rent),
      cash:num(raw.cash)||0, investments:num(raw.investments)||0, debt:num(raw.debt)||0,
      debtRate:num(raw.debtRate), debtPayment:num(raw.debtPayment),
      retireAge:num(raw.retireAge), aow:num(raw.aow)||0, pension:num(raw.pension)||0,
      change:raw.change||"", purchaseAmount:num(raw.purchaseAmount), purchaseMonths:num(raw.purchaseMonths)
    };
    c.totalIncome = (c.income||0)+(c.otherIncome||0);
    c.netFinancialAssets = c.cash+c.investments-c.debt;
    c.monthlySurplus = finite(c.cost) ? c.totalIncome-c.cost : null;
    c.savingsRate = finite(c.monthlySurplus)&&c.totalIncome>0 ? c.monthlySurplus/c.totalIncome : null;
    c.cashBufferMonths = months(c.cash,c.cost);
    c.financialRunwayMonths = months(Math.max(0,c.netFinancialAssets),c.cost);
    c.retirementHorizon = finite(c.age)&&finite(c.retireAge) ? c.retireAge-c.age : null;
    return c;
  }

  function requiredEvidence(c){
    const req = [
      ["age","leeftijd",finite(c.age)],
      ["income","netto inkomen",c.totalIncome>0],
      ["cost","maanduitgaven",finite(c.cost)&&c.cost>=0]
    ];
    if(c.goal==="retirement"||c.goal==="early"){
      req.push(["retireAge","gewenste pensioenleeftijd",finite(c.retireAge)]);
      req.push(["assets","spaargeld of beleggingen",c.cash>0||c.investments>0]);
    }
    if(c.goal==="purchase"){
      req.push(["purchaseAmount","bedrag van de grote uitgave",finite(c.purchaseAmount)&&c.purchaseAmount>0]);
      req.push(["purchaseMonths","termijn van de grote uitgave",finite(c.purchaseMonths)&&c.purchaseMonths>0]);
    }
    if(c.housing==="mortgage"){
      req.push(["mortgage","hypotheekschuld",finite(c.mortgage)&&c.mortgage>=0]);
    }
    return req.filter(x=>!x[2]).map(x=>({key:x[0],label:x[1]}));
  }

  function dimensions(c){
    const d = {};

    d.cashflow = {
      surplus:c.monthlySurplus,
      savingsRate:c.savingsRate,
      status: !finite(c.monthlySurplus) ? "unknown" :
              c.monthlySurplus<0 ? "weak" :
              c.savingsRate!==null && c.savingsRate>=0.20 ? "strong" :
              c.savingsRate!==null && c.savingsRate>=0.05 ? "ok" : "thin"
    };

    d.liquidity = {
      cash:c.cash,
      bufferMonths:c.cashBufferMonths,
      status: !finite(c.cashBufferMonths) ? "unknown" :
              c.cashBufferMonths>=ASSUMPTIONS.bufferMonths.strong ? "strong" :
              c.cashBufferMonths>=ASSUMPTIONS.bufferMonths.solid ? "solid" :
              c.cashBufferMonths>=ASSUMPTIONS.bufferMonths.minimum ? "thin" : "weak"
    };

    d.wealth = {
      cash:c.cash, investments:c.investments, debt:c.debt, net:c.netFinancialAssets,
      runwayMonths:c.financialRunwayMonths,
      investShare:(c.cash+c.investments)>0 ? c.investments/(c.cash+c.investments) : null
    };

    const annualIncome = c.totalIncome*12;
    d.debt = {
      nonMortgage:c.debt,
      nonMortgageRate:c.debtRate,
      mortgage:c.mortgage,
      mortgageRate:c.mortgageRate,
      debtToIncome:annualIncome>0 ? c.debt/annualIncome : null,
      mortgageToIncome:annualIncome>0&&finite(c.mortgage) ? c.mortgage/annualIncome : null,
      highInterest: c.debt>0 && finite(c.debtRate) && c.debtRate>=ASSUMPTIONS.highInterestDebt
    };

    d.housing = {
      type:c.housing,
      monthlyKnown: c.housing==="rent" ? c.rent : c.mortgagePayment,
      mortgageEndsAfterRetirement: c.housing==="mortgage"&&finite(c.mortgageEndAge)&&finite(c.retireAge) ? c.mortgageEndAge>c.retireAge : null
    };

    d.lifeStage = {
      age:c.age, household:c.household, kids:c.kids,
      horizonToRetirement:c.retirementHorizon,
      retirementRelevant: c.goal==="retirement"||c.goal==="early"||(finite(c.age)&&c.age>=50)
    };

    return d;
  }

  function scenarios(c){
    const s = {investment:[], retirement:null, purchase:null, reconciliation:null};

    if(c.investments>0){
      let horizon = null;
      if(finite(c.retirementHorizon)&&c.retirementHorizon>=0) horizon=c.retirementHorizon;
      else if(finite(c.age)) horizon = Math.max(5,Math.min(30,65-c.age));
      if(finite(horizon)&&horizon>=0){
        s.investment = ASSUMPTIONS.returnScenarios.map(r=>{
          const nominal=fv(c.investments,r,horizon);
          return {return:r,horizon,nominal,real:real(nominal,ASSUMPTIONS.inflation,horizon)};
        });
      }
    }

    if((c.goal==="retirement"||c.goal==="early"||(finite(c.age)&&c.age>=50)) && finite(c.retirementHorizon) && c.retirementHorizon>=0){
      const monthlyPensionIncome=c.aow+c.pension;
      const currentEuroGap=finite(c.cost)?Math.max(0,c.cost-monthlyPensionIncome):null;
      const targetMid=s.investment.find(x=>Math.abs(x.return-0.05)<0.0001);
      const projected=targetMid?targetMid.nominal:null;
      const annualGap=finite(currentEuroGap)?currentEuroGap*12:null;
      const gapPct=finite(projected)&&projected>0&&finite(annualGap)?annualGap/projected:null;
      s.retirement={monthlyPensionIncome,currentEuroGap,projectedCapitalAt5:projected,gapWithdrawalPct:gapPct,
        mortgageAfterRetirement: c.housing==="mortgage"&&finite(c.mortgageEndAge)&&finite(c.retireAge)?c.mortgageEndAge>c.retireAge:null};
    }

    if(c.goal==="purchase"&&finite(c.purchaseAmount)&&finite(c.purchaseMonths)&&c.purchaseMonths>0){
      const monthlyReserve=c.purchaseAmount/c.purchaseMonths;
      const cashAfter=c.cash-c.purchaseAmount;
      s.purchase={monthlyReserve, fitsMonthly:finite(c.monthlySurplus)?c.monthlySurplus>=monthlyReserve:null,
        cashAfter, bufferMonthsAfter:finite(c.cost)&&c.cost>0?cashAfter/c.cost:null};
    }

    if(c.goal==="cashflow"&&finite(c.monthlySurplus)&&finite(c.savingGrowth)){
      const gap=c.monthlySurplus-c.savingGrowth;
      s.reconciliation={paperSurplus:c.monthlySurplus,actualSaving:c.savingGrowth,gap,
        material:Math.abs(gap)>Math.max(100,Math.abs(c.monthlySurplus)*ASSUMPTIONS.materialSavingsGapPct)};
    }
    return s;
  }

  function findings(c,d,s){
    const arr=[];
    const add=(kind,priority,title,text,dimension)=>arr.push({kind,priority,title,text,dimension});

    if(finite(c.monthlySurplus)){
      if(c.monthlySurplus<0) add("risk",100,"Je maandbasis is negatief.","Op basis van de bevestigde bedragen gaat er meer uit dan er binnenkomt.","cashflow");
      else if(c.monthlySurplus>0) add("strength",55,"Je maandbasis is positief.","De theoretische ruimte is "+Math.round(c.monthlySurplus)+" per maand, vóór controle op jaar- en incidentele uitgaven.","cashflow");
    }
    if(!c.annualIncluded&&finite(c.cost)) add("uncertainty",75,"Je echte vrije ruimte kan lager zijn.","Niet alle jaar- en incidentele uitgaven zijn bevestigd in het maandbedrag.","cashflow");

    if(finite(c.cashBufferMonths)){
      if(c.cashBufferMonths<3) add("risk",90,"Je liquide buffer is kwetsbaar.","Spaargeld dekt minder dan drie maanden van de huidige uitgaven.","liquidity");
      else if(c.cashBufferMonths>=12) add("strength",45,"Je liquide buffer is ruim.","Spaargeld dekt meer dan twaalf maanden van de huidige uitgaven.","liquidity");
      else if(c.cashBufferMonths>=6) add("strength",40,"Je liquide buffer is solide.","Spaargeld dekt minstens zes maanden van de huidige uitgaven.","liquidity");
    }

    if(d.debt.highInterest) add("risk",85,"Je dure schuld verdient prioriteit.","De opgegeven rente op andere schuld is relatief hoog; vergelijk zeker aflossen met andere bestedingen.","debt");

    if(s.reconciliation&&s.reconciliation.material){
      add("insight",95,"Je geldbeeld sluit niet aan op je rekening.","De papieren maandruimte wijkt ongeveer "+Math.round(s.reconciliation.gap)+" per maand af van de werkelijke spaargroei. Zoek eerst de ontbrekende uitgaven.","cashflow");
    }

    if(d.housing.mortgageEndsAfterRetirement===true){
      add("risk",70,"Je hypotheek loopt door na je gewenste pensioen.","De woonlast hoort daarom expliciet in de pensioenfase en niet alleen in je huidige budget.","housing");
    }

    if(s.retirement){
      if(finite(s.retirement.currentEuroGap)&&s.retirement.currentEuroGap>0){
        add("insight",72,"Je pensioeninkomen dekt niet alle huidige uitgaven.","In euro's van vandaag resteert circa "+Math.round(s.retirement.currentEuroGap)+" per maand dat uit vermogen of ander inkomen moet komen.","retirement");
      }
      if(finite(s.retirement.gapWithdrawalPct)){
        if(s.retirement.gapWithdrawalPct>0.05) add("risk",88,"De benodigde onttrekking is hoog in het 5%-groeiscenario.","De eerste berekening vraagt om een strengere stress- en sequence-risk analyse.","retirement");
        else if(s.retirement.gapWithdrawalPct<0.03) add("strength",50,"De benodigde onttrekking oogt beperkt tegenover het geprojecteerde vermogen.","Dit blijft gevoelig voor rendement, inflatie en marktvolgorde.","retirement");
      }
    }

    if(s.purchase){
      if(s.purchase.fitsMonthly===false) add("risk",90,"De geplande uitgave past niet uit de huidige maandruimte.","De benodigde reservering per maand ligt boven de berekende vrije ruimte.","goal");
      if(finite(s.purchase.bufferMonthsAfter)&&s.purchase.bufferMonthsAfter<3) add("risk",92,"De uitgave zou je buffer te ver verlagen.","Na betaling resteert minder dan drie maanden huidige uitgaven als cashbuffer.","goal");
      if(s.purchase.fitsMonthly===true&&finite(s.purchase.bufferMonthsAfter)&&s.purchase.bufferMonthsAfter>=6) add("strength",60,"De grote uitgave lijkt vanuit cashflow en buffer haalbaar.","Dit is nog vóór belasting, toekomstdoelen en overige onzekerheden.","goal");
    }

    if(c.investments>0&&finite(c.age)){
      const ratio=finite(c.cost)&&c.cost>0 ? c.investments/(c.cost*12) : null;
      if(finite(ratio)&&ratio>=20) add("strength",38,"Je belegd vermogen is groot ten opzichte van je huidige uitgaven.","Dat geeft flexibiliteit, maar maakt vermogensrisico en fiscale context belangrijker.","wealth");
    }

    return arr.sort((a,b)=>b.priority-a.priority);
  }

  function score(c,d,missing,finds){
    if(missing.length>=3) return {value:null,label:"onvoldoende informatie"};
    let x=50;
    if(d.cashflow.status==="strong")x+=15; else if(d.cashflow.status==="ok")x+=8; else if(d.cashflow.status==="thin")x+=2; else if(d.cashflow.status==="weak")x-=20;
    if(d.liquidity.status==="strong")x+=15; else if(d.liquidity.status==="solid")x+=10; else if(d.liquidity.status==="thin")x+=2; else if(d.liquidity.status==="weak")x-=15;
    if(d.debt.highInterest)x-=12;
    finds.filter(f=>f.kind==="risk"&&f.priority>=85).forEach(()=>x-=6);
    x=clamp(Math.round(x),0,100);
    const label=x>=80?"zeer stevig":x>=65?"stevig":x>=50?"redelijk":x>=35?"kwetsbaar":"aandacht nodig";
    return {value:x,label};
  }

  function nextQuestions(c,missing,d,s){
    const qs=missing.map(m=>({priority:100,title:"Vul "+m.label+" in",why:"Zonder dit gegeven kan de hoofdvraag materieel anders uitvallen."}));
    if(!c.annualIncluded&&finite(c.cost))qs.push({priority:82,title:"Zijn vakantie, auto, onderhoud en andere jaarposten echt meegenomen?",why:"Anders overschatten we de vrije maandruimte."});
    if(c.housing==="mortgage"&&finite(c.mortgage)&&!finite(c.mortgageEndAge))qs.push({priority:78,title:"Wanneer eindigt je hypotheek?",why:"Dat bepaalt de woonlast in latere levensfasen."});
    if(c.debt>0&&!finite(c.debtRate))qs.push({priority:76,title:"Welke rente betaal je op de andere schuld?",why:"Dure schuld kan belangrijker zijn dan sparen of beleggen."});
    if(c.goal==="cashflow"&&!finite(c.savingGrowth))qs.push({priority:85,title:"Hoeveel groeit je spaargeld werkelijk per maand?",why:"Daarmee kunnen we papieren ruimte en echte ruimte reconciliëren."});
    return qs.sort((a,b)=>b.priority-a.priority).slice(0,3);
  }

  function analyze(raw){
    const c=normalize(raw||{});
    const missing=requiredEvidence(c);
    const d=dimensions(c);
    const s=scenarios(c);
    const f=findings(c,d,s);
    const sc=score(c,d,missing,f);
    const questions=nextQuestions(c,missing,d,s);
    const top=f.slice(0,3);
    return {case:c,assumptions:ASSUMPTIONS,missing,dimensions:d,scenarios:s,findings:f,topFindings:top,score:sc,nextQuestions:questions};
  }

  global.GeldcheckEngine={analyze,normalize,ASSUMPTIONS};
})(window);
