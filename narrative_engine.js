/* Geldcheck Narrative Intelligence v0.1
   Deterministic, grounded narrative layer.
   Engine owns facts; this layer only explains validated outputs.
*/
(function(global){
"use strict";

const euro=n=>"€"+Math.round(Number(n)||0).toLocaleString("nl-NL");
const futureItems=f=>[...((f&&f.assets)||[]),...((f&&f.events)||[])];

function classifyFuture(future){
  const items=futureItems(future);
  const uncertain=[],restricted=[],certain=[];
  items.forEach(x=>{
    const label=x.label||x.name||x.id||x.type||"toekomstig bedrag";
    if(x.certainty==="uncertain"||x.type==="uncertain_asset")uncertain.push(label);
    else if(x.restricted||x.liquidity==="restricted"||x.liquidity==="illiquid")restricted.push(label);
    else certain.push(label);
  });
  return {uncertain,restricted,certain};
}

function retirementFacts(raw,future){
  const live=GeldcheckEngine.analyze(raw);
  const r=GeldcheckAnswerEngine.retirement(raw,future||{});
  const c=r.conservative,b=r.base;
  const targetAge=Math.max(Number(raw.age)||0,Number(raw.retireAge)||0);
  const aowAge=Number(raw.aowStartAge)||null;
  const bridgeYears=aowAge!==null?Math.max(0,aowAge-targetAge):null;
  const fi=classifyFuture(future);
  const mainRisk = c.firstGapAge!==null
    ? "vermogen raakt in het conservatieve scenario op rond leeftijd "+c.firstGapAge
    : ((raw.cost||0)>(raw.aow||0)+(raw.pension||0)&&targetAge<(aowAge||targetAge)
      ? "de jaren vóór AOW en pensioen vragen relatief veel van je vermogen"
      : "geen dominante tekorttrigger in het conservatieve scenario");
  const strengths=[];
  if((raw.cash||0)+(raw.investments||0)>300000)strengths.push("je huidige vrije vermogen");
  if((raw.aow||0)+(raw.pension||0)>0)strengths.push("je latere AOW en pensioeninkomen");
  if(c.uninterruptedSuccess)strengths.push("het feit dat het conservatieve pad zonder tekort doorloopt");
  const warnings=[];
  if(c.firstGapAge!==null)warnings.push("eerste tekort rond "+c.firstGapAge);
  if(fi.uncertain.length)warnings.push("onzekere toekomstige bedragen zijn niet nodig voor een harde positieve conclusie");
  if(fi.restricted.length)warnings.push("restricted of illiquide vermogen is niet als vrij besteedbaar behandeld");
  return {
    kind:"retirement",
    verdict:r.answer,
    targetAge,
    bridgeYears,
    conservativeEndCapital:c.endCapital,
    baseEndCapital:b.endCapital,
    conservativeGap:c.fundingGap,
    firstGapAge:c.firstGapAge,
    monthlyCost:Number(raw.cost)||0,
    monthlyAow:Number(raw.aow)||0,
    monthlyPension:Number(raw.pension)||0,
    currentLiquid:(Number(raw.cash)||0)+(Number(raw.investments)||0),
    mainRisk,
    strengths,
    warnings,
    future:fi,
    liveMissing:live.missing||[]
  };
}

function liveFacts(raw){
  const a=GeldcheckEngine.analyze(raw);
  let verdict=a.decision&&a.decision.verdict?a.decision.verdict:(a.score&&a.score.value!==null?(a.score.value>=75?"STERK":a.score.value>=50?"REDELIJK":"KWETSBAAR"):"ONBEKEND");
  let mainRisk="geen dominante waarschuwing";
  if(a.topFindings&&a.topFindings.length)mainRisk=a.topFindings[0].title;
  return {
    kind:"live",
    verdict,
    monthlySurplus:a.case&&a.case.monthlySurplus,
    cashBufferMonths:a.case&&a.case.cashBufferMonths,
    score:a.score&&a.score.value,
    mainRisk,
    strengths:[],
    warnings:(a.topFindings||[]).slice(0,2).map(x=>x.title),
    liveMissing:a.missing||[],
    purchase:a.scenarios&&a.scenarios.purchase||null
  };
}

function facts(raw,future){
  return (raw.goal==="early"||raw.goal==="retirement")?retirementFacts(raw,future):liveFacts(raw);
}

function headline(f){
  if(f.liveMissing&&f.liveMissing.length)return "Ik mis nog informatie om hier een hard oordeel over te geven.";
  if(f.kind==="retirement"){
    if(f.verdict==="JA")return "Ja, stoppen op je "+f.targetAge+"e lijkt financieel haalbaar.";
    if(f.verdict==="MOGELIJK")return "Stoppen op je "+f.targetAge+"e kan, maar je plan heeft weinig foutmarge.";
    return "Nee, stoppen op je "+f.targetAge+"e is met deze uitgangspunten nog niet stevig genoeg.";
  }
  return "Je financiële positie is "+String(f.verdict).toLowerCase()+".";
}

function why(f){
  if(f.liveMissing&&f.liveMissing.length)return "Vooral "+f.liveMissing.slice(0,2).map(x=>x.label||x.key).join(" en ")+" ontbreken nog.";
  if(f.kind==="retirement"){
    let s="In het conservatieve scenario eindig je met "+euro(f.conservativeEndCapital)+".";
    if(f.conservativeGap>0)s+=" Het berekende tekort loopt op tot "+euro(f.conservativeGap)+".";
    else s+=" Er ontstaat daarin geen funding gap.";
    if(f.bridgeYears!==null&&f.bridgeYears>0)s+=" Je moet "+f.bridgeYears+" jaar overbruggen tot AOW.";
    return s;
  }
  if(f.purchase){
    return "Voor deze aankoop is ongeveer "+euro(f.purchase.monthlyReserve)+" per maand reservering nodig.";
  }
  if(typeof f.monthlySurplus==="number")return "Je maandelijkse vrije ruimte is "+euro(f.monthlySurplus)+".";
  return "De conclusie volgt uit de gevalideerde Geldcheck-cijfers.";
}

function story(raw,future){
  const f=facts(raw,future);
  const parts=[headline(f),why(f)];
  if(f.liveMissing&&f.liveMissing.length){
    parts.push("Vul die gegevens eerst aan; daarna kan Geldcheck het verhaal zonder aannames afmaken.");
  } else {
    if(f.kind==="retirement"){
      if(f.strengths.length)parts.push("Wat voor je werkt: "+f.strengths.slice(0,2).join(" en ")+".");
      parts.push("Het belangrijkste aandachtspunt is "+f.mainRisk+".");
      if(f.future.uncertain.length)parts.push("Ik reken "+f.future.uncertain.join(", ")+" niet als zeker beschikbaar geld.");
      if(f.future.restricted.length)parts.push("Ik behandel "+f.future.restricted.join(", ")+" niet als vrij besteedbaar vermogen.");
      if(f.verdict==="MOGELIJK")parts.push("Dit is daarom geen harde ja: een kleine verslechtering in uitgaven, rendement of timing kan de uitkomst veranderen.");
      if(f.verdict==="NEE")parts.push("De nuttigste knop om eerst te onderzoeken is later stoppen, lagere structurele uitgaven of meer vrij beschikbaar vermogen.");
    } else {
      parts.push("Het belangrijkste aandachtspunt is "+f.mainRisk+".");
    }
  }
  return {facts:f,headline:parts[0],paragraphs:parts,story:parts.join("\n\n")};
}

global.GeldcheckNarrative={facts,story};
})(window);
