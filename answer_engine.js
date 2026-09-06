/* Geldcheck Answer Engine v0.1
   Converts existing engine + Future Bridge v0.4 into end-user answers.
*/
(function(global){
"use strict";
function retirement(raw,future){
  const c=GeldcheckFutureBridgeV04.simulate(raw,future||{},{mode:"conservative",nominalReturn:.03,crashAtRetirement:true,endAge:95});
  const b=GeldcheckFutureBridgeV04.simulate(raw,future||{},{mode:"base",nominalReturn:.05,crashAtRetirement:false,endAge:95});
  let answer="NEE";
  if(c.uninterruptedSuccess)answer="JA";
  else if(c.success||b.success)answer="MOGELIJK";
  return {answer,conservative:c,base:b};
}
function purchase(raw,amount,months){
  const c=GeldcheckEngine.normalize(Object.assign({},raw,{goal:"purchase",purchaseAmount:amount,purchaseMonths:months}));
  if(!(amount>0&&months>0))return {answer:"ONBEKEND"};
  const monthlyReserve=amount/months;
  const fitsMonthly=typeof c.monthlySurplus==="number"&&c.monthlySurplus>=monthlyReserve;
  const bufferMonths=typeof c.cashBufferMonths==="number"?c.cashBufferMonths:null;
  const bufferOK=bufferMonths===null||bufferMonths>=3;
  return {answer:(fitsMonthly&&bufferOK)?"JA":"NEE",monthlyReserve,fitsMonthly,bufferMonths,bufferOK};
}
function shock(raw,future){
  const r=GeldcheckFutureBridgeV04.simulate(raw,future||{},{mode:"conservative",nominalReturn:.03,crashAtRetirement:true,endAge:95});
  return {answer:r.success?"HOUDT STAND":"KWETSBAAR",raw:r};
}
global.GeldcheckAnswerEngine={retirement,purchase,shock};
})(window);