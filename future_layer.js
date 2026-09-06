/* Geldcheck Future Assets & Events Layer v0.1
   Separate from validated engine.js. It models ownership, liquidity, timing,
   certainty and restrictions without changing current Geldcheck conclusions.
*/
(function(global){
  "use strict";

  const TYPES = {
    liquid_cash:"Vrij liquide vermogen",
    liquid_investment:"Vrij belegbaar vermogen",
    illiquid_property:"Illiquide vermogen / vastgoed",
    blocked_asset:"Geblokkeerd vermogen",
    business_interest:"Onderneming / BV-belang",
    future_lump_sum:"Toekomstige eenmalige ontvangst",
    temporary_income:"Tijdelijke inkomstenstroom",
    lifetime_income:"Levenslange inkomstenstroom",
    future_expense:"Toekomstige verplichting / uitgave",
    uncertain_asset:"Voorwaardelijk of onzeker vermogen"
  };

  const CERTAINTY = {certain:1,contractual:.95,probable:.6,uncertain:.25};
  const LIQUIDITY = {immediate:1,days:.95,months:.8,restricted:.35,illiquid:.1};

  const finite=v=>typeof v==="number"&&Number.isFinite(v);
  const num=v=>{if(v===null||v===undefined||v==="")return null;const n=Number(String(v).replace(",","."));return Number.isFinite(n)?n:null};
  const arr=v=>Array.isArray(v)?v:[];

  function normalizeItem(raw){
    const x={
      id:raw.id||("item_"+Math.random().toString(36).slice(2)),
      name:raw.name||"Onbenoemd",
      type:raw.type||"future_lump_sum",
      owner:raw.owner||"household",
      currentValue:num(raw.currentValue)||0,
      amount:num(raw.amount),
      monthlyAmount:num(raw.monthlyAmount),
      availableFromAge:num(raw.availableFromAge),
      availableFromDate:raw.availableFromDate||null,
      endAge:num(raw.endAge),
      certainty:raw.certainty||"certain",
      liquidity:raw.liquidity||"immediate",
      taxable:raw.taxable===true,
      taxRate:num(raw.taxRate)||0,
      restricted:raw.restricted===true,
      restriction:raw.restriction||"",
      usableForGoals:raw.usableForGoals!==false,
      notes:raw.notes||""
    };
    x.certaintyWeight=CERTAINTY[x.certainty]??0.25;
    x.liquidityWeight=LIQUIDITY[x.liquidity]??0.1;
    x.netAmount=finite(x.amount)?x.amount*(1-x.taxRate):null;
    x.netCurrentValue=x.currentValue*(1-x.taxRate);
    return x;
  }

  function normalize(raw){
    return {
      currentAge:num(raw.currentAge),
      assets:arr(raw.assets).map(normalizeItem),
      events:arr(raw.events).map(normalizeItem)
    };
  }

  function isAvailableAt(x,age){
    if(!finite(age))return false;
    if(finite(x.availableFromAge)&&age<x.availableFromAge)return false;
    if(finite(x.endAge)&&age>x.endAge)return false;
    return true;
  }

  function classifyAt(model,age){
    const all=model.assets.concat(model.events);
    const out={availableNow:0,availableCertain:0,availableWeighted:0,illiquid:0,blocked:0,futureCertain:0,futureWeighted:0,monthlyIncome:0,monthlyExpense:0,items:[]};
    all.forEach(x=>{
      const available=isAvailableAt(x,age);
      const base=finite(x.netAmount)?x.netAmount:x.netCurrentValue;
      const weighted=base*x.certaintyWeight*x.liquidityWeight;
      const record={id:x.id,name:x.name,type:x.type,available,certainty:x.certainty,liquidity:x.liquidity,base,weighted,restricted:x.restricted,usableForGoals:x.usableForGoals};

      if(x.type==="temporary_income"||x.type==="lifetime_income"){
        if(available && finite(x.monthlyAmount)){
          out.monthlyIncome += x.monthlyAmount*(1-x.taxRate)*x.certaintyWeight;
        }
      } else if(x.type==="future_expense"){
        if(available && finite(x.monthlyAmount)) out.monthlyExpense += x.monthlyAmount*x.certaintyWeight;
        else if(available && finite(x.netAmount)) out.monthlyExpense += x.netAmount/12*x.certaintyWeight;
      } else if(available){
        if(x.liquidity==="illiquid")out.illiquid+=base;
        if(x.liquidity==="restricted"||x.restricted)out.blocked+=base;
        if(!x.restricted&&x.usableForGoals&&x.liquidity!=="illiquid"){
          out.availableWeighted+=weighted;
          if(x.certainty==="certain"||x.certainty==="contractual")out.availableCertain+=base*x.liquidityWeight;
          if(x.liquidity==="immediate"||x.liquidity==="days")out.availableNow+=base;
        }
      } else {
        if(x.certainty==="certain"||x.certainty==="contractual")out.futureCertain+=base;
        out.futureWeighted+=base*x.certaintyWeight;
      }
      out.items.push(record);
    });
    return out;
  }

  function timeline(raw,ages){
    const m=normalize(raw);
    const list=Array.isArray(ages)&&ages.length?ages:[m.currentAge];
    return list.map(age=>({age,...classifyAt(m,age)}));
  }

  function warnings(raw){
    const m=normalize(raw), now=classifyAt(m,m.currentAge), w=[];
    m.assets.concat(m.events).forEach(x=>{
      if(x.certainty==="uncertain"||x.certainty==="probable") w.push({kind:"uncertainty",item:x.name,text:"Niet als zeker vermogen behandelen."});
      if(x.restricted||x.liquidity==="restricted") w.push({kind:"restriction",item:x.name,text:"Niet als vrij beschikbaar geld behandelen."});
      if(x.liquidity==="illiquid") w.push({kind:"liquidity",item:x.name,text:"Waarde is niet direct inzetbaar voor lopende uitgaven."});
      if(finite(x.availableFromAge)&&finite(m.currentAge)&&x.availableFromAge>m.currentAge) w.push({kind:"timing",item:x.name,text:"Mag niet vóór leeftijd "+x.availableFromAge+" worden gebruikt."});
    });
    if(now.illiquid>0&&now.availableNow<now.illiquid*.1) w.push({kind:"structure",item:"huishouden",text:"Vermogen is sterk geconcentreerd in illiquide bezittingen."});
    return w;
  }

  function examples(){
    return [
      {name:"Banksparen",type:"blocked_asset",currentValue:300000,availableFromAge:65,certainty:"contractual",liquidity:"restricted",restricted:true,restriction:"fiscaal geblokkeerd / uitkeringsvoorwaarden"},
      {name:"Verwachte erfenis",type:"uncertain_asset",amount:400000,availableFromAge:70,certainty:"uncertain",liquidity:"months"},
      {name:"Overwaarde woning",type:"illiquid_property",currentValue:800000,certainty:"certain",liquidity:"illiquid"},
      {name:"Verkoop onderneming",type:"future_lump_sum",amount:1200000,availableFromAge:60,certainty:"probable",liquidity:"months",taxable:true,taxRate:.25},
      {name:"Lijfrente-uitkering",type:"temporary_income",monthlyAmount:2200,availableFromAge:65,endAge:85,certainty:"contractual",liquidity:"immediate",taxable:true,taxRate:.20}
    ];
  }

  global.GeldcheckFutureLayer={TYPES,CERTAINTY,LIQUIDITY,normalize,classifyAt,timeline,warnings,examples};
})(window);