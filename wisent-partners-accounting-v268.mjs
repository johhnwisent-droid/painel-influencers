// Accounting functions and relevant normalization copied from WISENT V266.
// See docs/accounting-provenance.json. Only an already scoped COPY is normalized.
export function computeSnapshot(state, influencerId, month) {
const today=()=>new Date().toISOString().slice(0,10);
const currentMonth=()=>today().slice(0,7);
const selectedMonth=()=>month;
const uid=()=>globalThis.crypto.randomUUID();
const reportRecordBelongsToInfluencerV217=(row,id)=>!!row && String(row.influencerId||"")===String(id);
function monthEndDate(month){
  if(!/^\d{4}-\d{2}$/.test(String(month||"")))return today();
  const [year,mo]=String(month).split("-").map(Number);
  const lastDay=new Date(year,mo,0).getDate();
  return `${String(year).padStart(4,"0")}-${String(mo).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;
}

function normalizeDateOnly(value){
  const s=String(value||"").trim();
  if(!s)return "";
  return s.slice(0,10);
}

function reportEventMonth(value){
  const date=normalizeDateOnly(value);
  return date?date.slice(0,7):"";
}

function validMonthValue(value){
  return /^\d{4}-\d{2}$/.test(String(value||""))?String(value):"";
}

function finiteNumber(value,fallback=0){
  const n=Number(value);
  return Number.isFinite(n)?n:Number(fallback||0);
}

function paidMethodNormalizeV231(value){
  const key=reportIdentityKeyV217(value);
  if(["cash","dinheiro","pago em dinheiro","pix"].includes(key))return "cash";
  if(["product","produto","pago em produto"].includes(key))return "product";
  return "";
}

function reportIdentityKeyV217(value){
  return String(value??"")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g,"")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,"");
}

function repairPaidAdjustments(){
  state.paidAdjustments=mergePaidAdjustmentsCollections(
    ensureArray(state.paidAdjustments)
  );
  return state.paidAdjustments;
}

function ensureArray(value){
  return Array.isArray(value)?value:[];
}

function mergePaidAdjustmentsCollections(...collections){
  const map=new Map();
  const history=[];

  collections.flat().forEach(raw=>{
    const item=normalizePaidAdjustmentRecord(raw);
    if(!item)return;

    const key=paidAdjustmentKey(item);
    const current=map.get(key);

    history.push(item);

    if(!current){
      map.set(key,item);
      return;
    }

    const itemTime=paidAdjustmentTime(item);
    const currentTime=paidAdjustmentTime(current);

    if(itemTime>=currentTime){
      map.set(key,item);
    }
  });

  const latestIds=new Set([...map.values()].map(item=>String(item.id)));

  /*
    V127:
    Mantém o histórico, mas garante que só o ajuste mais recente de cada
    influencer/mês seja considerado ativo. Assim uma informação antiga não
    volta para a tabela principal como se fosse atual.
  */
  return history.map(item=>{
    if(latestIds.has(String(item.id)))return item;

    if(item.status!=="Cancelado"){
      item.status="Cancelado";
      item.notes=item.notes
        ? `${item.notes} • Ajuste antigo preservado no histórico`
        : "Ajuste antigo preservado no histórico";
    }

    return item;
  }).sort((a,b)=>{
    const byTime=paidAdjustmentTime(b)-paidAdjustmentTime(a);
    if(byTime)return byTime;
    return String(b.id||"").localeCompare(String(a.id||""));
  });
}

function paidAdjustmentTime(row){
  const raw=row?.updatedAt||row?.createdAt||row?.date||"";
  const t=Date.parse(raw);
  return Number.isFinite(t)?t:0;
}

function paidAdjustmentKey(row){
  return `${row?.month||""}__${row?.influencerId||""}`;
}

function normalizePaidAdjustmentRecord(row){
  if(!row||typeof row!=="object")return null;

  const item=cloneSafe(row,{});
  item.id=item.id||uid();
  item.month=item.month||(item.date||today()).slice(0,7);
  item.date=item.date||today();
  item.influencerId=item.influencerId||"";
  item.paymentType=item.paymentType==="Produto"?"Produto":"Dinheiro";
  item.amount=Math.max(0,finiteNumber(item.amount,0));
  item.status=item.status||"Pago";
  item.notes=item.notes||"";
  item.createdAt=item.createdAt||item.updatedAt||new Date().toISOString();
  item.updatedAt=item.updatedAt||"";
  item.createdByName=item.createdByName||"Não registrado";
  item.updatedByName=item.updatedByName||"";

  return item.influencerId&&item.month?item:null;
}

function cloneSafe(value,fallback=null){
  try{return JSON.parse(JSON.stringify(value));}
  catch(e){return fallback;}
}

function reportCommissionSnapshot(infId,month=selectedMonth()){
  const range=reportMonthRange(month);
  const carry=reportAccumulationCarryV225(infId,range.month);
  const baseCoverage=reportCoverageRange(infId,range.month);
  const coverage={
    start:carry.active?carry.start:range.start,
    end:range.end,
    month:range.month,
    source:carry.active?"accumulation":"selected",
    previousEnd:"",
    historyRecord:null,
    accumulationCarry:carry.active,
    carryStart:carry.active?carry.start:""
  };

  const opening=carry.active
    ?{product:Math.max(0,Number(carry.product||0)),cash:Math.max(0,Number(carry.cash||0)),events:carry.opening?.events||[]}
    :{product:0,cash:0,events:[]};

  const periodEvents=reportCommissionLedgerEvents(infId,range.end)
    .filter(event=>event&&event.date&&event.date>=range.start&&event.date<=range.end);
  const applied=reportApplyBalanceEventsV229(opening,periodEvents);
  const closing={product:applied.product,cash:applied.cash,events:applied.events||[]};
  const coverageEvents=applied.events||[];

  const selectedGenerated=reportGeneratedForRange(infId,range.start,range.end);
  const selectedRows=reportUniqueLaunchRowsV225(selectedGenerated.rows||[]);
  const displayedRows=carry.active
    ?reportUniqueLaunchRowsV225([...(carry.priorRows||[]),...selectedRows])
    :selectedRows;
  const displayedGenerated=reportAggregateLaunchRowsV218(displayedRows);
  const coverageGenerated=displayedGenerated;

  const months=reportMonthSequence(coverage.start.slice(0,7),range.month).map(monthValue=>{
    const monthRange=reportMonthRange(monthValue);
    const generated=reportGeneratedForRange(infId,monthRange.start,monthRange.end);
    return {month:monthValue,range:monthRange,generated,deductedProduct:0,deductedCash:0,closing:{product:0,cash:0}};
  });

  const deductedProduct=coverageEvents.reduce((sum,event)=>sum+Number(event.productDeducted||0),0);
  const deductedCash=coverageEvents.reduce((sum,event)=>sum+Number(event.cashDeducted||0),0);
  const multiMonth=Boolean(carry.active&&coverage.start.slice(0,7)!==range.month);
  const sourceRows=(displayedGenerated.origins||[]).filter(row=>Number(row.sold||0)>0).map(row=>({origin:row.origin,count:row.count,sold:row.sold}));
  const accumulatedOriginRows=(displayedGenerated.accumulatedOrigins||[]).filter(row=>Number(row.product||0)!==0||Number(row.cash||0)!==0).map(row=>({origin:row.origin,product:row.product,cash:row.cash}));
  const hasAccumulation=Boolean(carry.active||displayedRows.some(row=>reportLaunchAccumulatesV229(row)));

  return {
    range,coverage,baseCoverage,opening,closing,multiMonth,carry,
    sold:Number(displayedGenerated.sold||0),
    earnedProduct:Math.max(0,Number(closing.product||0)),
    earnedCash:Math.max(0,Number(closing.cash||0)),
    coverageGenerated,selectedGenerated,displayedGenerated,
    accumulatedProduct:Number(displayedGenerated.accumulatedProduct||0),
    accumulatedCash:Number(displayedGenerated.accumulatedCash||0),
    deductedProduct,deductedCash,
    status:reportRedemptionStatus(infId,range.start,range.end,closing),
    months,sourceRows,accumulatedOriginRows,hasAccumulation,coverageEvents
  };
}

function reportRedemptionStatus(infId,start,end,closing){
  const candidates=[];
  (state.accumulationHistory||[]).forEach(row=>{
    const date=normalizeDateOnly(row.createdAt||row.date);
    if(!row||!reportRecordBelongsToInfluencerV217(row,infId)||!date||date<start||date>end)return;
    if(row.type==="product_choice_paid"||row.type==="product_paid")candidates.push({at:row.createdAt||date,type:"product",text:"Resgate em produto registrado — o saldo em dinheiro foi zerado conforme a regra."});
    if(row.type==="cash_paid")candidates.push({at:row.createdAt||date,type:"cash",text:"Resgate em dinheiro registrado — o saldo em produto foi zerado conforme a regra."});
  });
  (state.redemptions||[]).forEach(row=>{
    const date=normalizeDateOnly(row.date);
    if(row&&reportRecordBelongsToInfluencerV217(row,infId)&&date>=start&&date<=end&&isProductChoiceRedemption(row))candidates.push({at:`${date}T12:00:00`,type:"product",text:"Resgate em produto registrado — o saldo em dinheiro foi zerado conforme a regra."});
  });
  (state.cashPayments||[]).forEach(row=>{
    const date=normalizeDateOnly(row.date);
    if(row&&reportRecordBelongsToInfluencerV217(row,infId)&&row.status!=="Cancelado"&&!row.productRedemptionId&&date>=start&&date<=end)candidates.push({at:`${date}T13:00:00`,type:"cash",text:"Resgate em dinheiro registrado — o saldo em produto foi zerado conforme a regra."});
  });
  const latest=candidates.sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0];
  if(latest)return latest;
  if(Number(closing.product||0)>0||Number(closing.cash||0)>0)return {type:"neutral",text:"Status: acumulando saldo. O valor continuará disponível e será atualizado nos próximos relatórios."};
  return {type:"neutral",text:"Status: sem saldo acumulado disponível ao final do período."};
}

function isProductChoiceRedemption(row){
  if(!row||row.status==="Cancelado")return false;
  const status=String(row.status||"").trim();
  const name=String(row.name||"").trim();

  return (status==="Pago"||status==="Resgatado")&&
    name!=="Saldo em produtos zerado no pagamento";
}

function reportLaunchAccumulatesV229(row){
  return Boolean(row)&&reportBooleanV218(row.accumulate)&&!reportLaunchPaidFlagV229(row);
}

function reportLaunchPaidFlagV229(row){
  if(!row)return false;
  const status=reportIdentityKeyV217(row.status);
  return reportBooleanV218(row.paid)||status==="pago";
}

function reportBooleanV218(value){
  if(value===true||value===1)return true;
  if(value===false||value===0||value==null)return false;
  const normalized=reportIdentityKeyV217(value);
  return ["1","true","sim","yes","on","acumular","acumulando"].includes(normalized);
}

function reportGeneratedForRange(infId,start,end){
  return reportAggregateLaunchRowsV218(reportLaunchRowsForRangeV218(infId,start,end));
}

function reportLaunchRowsForRangeV218(infId,start,end){
  const startMonth=String(start||"").slice(0,7);
  const endMonth=String(end||"").slice(0,7);
  return (state.launches||[])
    .filter(row=>{
      const accountingMonth=launchRecordMonthV215(row);
      return row&&reportRecordBelongsToInfluencerV217(row,infId)&&row.status!=="Cancelado"&&accountingMonth&&accountingMonth>=startMonth&&accountingMonth<=endMonth;
    })
    .slice()
    .sort((a,b)=>{
      const am=launchRecordMonthV215(a)||"";
      const bm=launchRecordMonthV215(b)||"";
      if(am!==bm)return am.localeCompare(bm);
      const ad=reportLaunchEffectiveDateV217(a)||`${am}-01`;
      const bd=reportLaunchEffectiveDateV217(b)||`${bm}-01`;
      return ad.localeCompare(bd)||String(a.createdAt||a.updatedAt||a.id||"").localeCompare(String(b.createdAt||b.updatedAt||b.id||""));
    });
}

function reportLaunchEffectiveDateV217(row){
  const month=launchRecordMonthV215(row);
  const date=normalizeDateOnly(row?.date);
  if(row?.periodMode==="month")return month?`${month}-01`:(date||"");
  if(date&&(!month||date.slice(0,7)===month))return date;
  return month?`${month}-01`:(date||"");
}

function launchRecordMonthV215(row){
  const storedAccounting=validMonthValue(row?.accountingMonth);
  const explicitMonth=validMonthValue(row?.month);
  const normalizedDate=normalizeDateOnly(row?.date);
  const dateMonth=(normalizedDate||"").slice(0,7);

  /* V218: venda de dia específico pertence sempre ao mês da própria data.
     Isso impede um registro como 17/07 de ficar fora do relatório de julho
     por causa de um accountingMonth legado ou preenchido incorretamente. */
  if(row?.periodMode==="day")return dateMonth||storedAccounting||explicitMonth;
  if(row?.periodMode==="month")return storedAccounting||explicitMonth||dateMonth;

  /* Registros antigos sem periodMode: dia diferente de 01 é tratado como
     venda específica; data no primeiro dia mantém a competência gravada. */
  if(normalizedDate&&normalizedDate.slice(8,10)!=="01")return dateMonth||storedAccounting||explicitMonth;
  return storedAccounting||explicitMonth||dateMonth;
}

function reportAggregateLaunchRowsV218(rows=[]){
  const validRows=(Array.isArray(rows)?rows:[]).filter(Boolean);
  const accumulatedRows=validRows.filter(row=>reportLaunchAccumulatesV229(row));
  return {
    rows:validRows,
    accumulatedRows,
    sold:validRows.reduce((sum,row)=>sum+reportNumberV217(row.sold),0),
    product:validRows.reduce((sum,row)=>sum+reportNumberV217(row.productCommission),0),
    cash:validRows.reduce((sum,row)=>sum+reportNumberV217(row.cashCommission),0),
    accumulatedProduct:accumulatedRows.reduce((sum,row)=>sum+reportNumberV217(row.productCommission),0),
    accumulatedCash:accumulatedRows.reduce((sum,row)=>sum+reportNumberV217(row.cashCommission),0),
    origins:launchOriginSummaryV215(validRows),
    accumulatedOrigins:launchOriginSummaryV215(accumulatedRows)
  };
}

function launchOriginSummaryV215(rows=[]){
  const map=new Map();
  rows.forEach(row=>{
    const origin=reportOriginLabelV217(row?.origin);
    const key=reportOriginKeyV217(origin);
    const current=map.get(key)||{origin,count:0,sold:0,product:0,cash:0};
    current.count+=1;
    current.sold+=reportNumberV217(row?.sold);
    current.product+=reportNumberV217(row?.productCommission);
    current.cash+=reportNumberV217(row?.cashCommission);
    map.set(key,current);
  });
  return [...map.values()]
    .filter(row=>row.count>0&&(row.sold!==0||row.product!==0||row.cash!==0))
    .sort((a,b)=>b.sold-a.sold||a.origin.localeCompare(b.origin,"pt-BR"));
}

function reportNumberV217(value){
  if(typeof value==="number")return Number.isFinite(value)?value:0;
  let raw=String(value??"").trim();
  if(!raw)return 0;
  raw=raw.replace(/\s+/g,"").replace(/R\$/gi,"");
  if(raw.includes(",")&&raw.includes(".")){
    if(raw.lastIndexOf(",")>raw.lastIndexOf("."))raw=raw.replace(/\./g,"").replace(",",".");
    else raw=raw.replace(/,/g,"");
  }else if(raw.includes(",")){
    raw=raw.replace(/\./g,"").replace(",",".");
  }
  raw=raw.replace(/[^0-9+\-.]/g,"");
  const parsed=Number(raw);
  return Number.isFinite(parsed)?parsed:0;
}

function reportOriginKeyV217(value){
  return reportIdentityKeyV217(value)||"semorigem";
}

function reportOriginLabelV217(value){
  const raw=String(value||"").trim();
  if(!raw)return "Sem origem";
  const configured=(state.settings?.origins||[]).find(item=>reportOriginKeyV217(item)===reportOriginKeyV217(raw));
  return String(configured||raw);
}

function reportMonthRange(month=selectedMonth()){
  const normalized=/^\d{4}-\d{2}$/.test(String(month||""))?String(month):currentMonth();
  return {month:normalized,start:`${normalized}-01`,end:monthEndDate(normalized)};
}

function reportMonthSequence(startMonth,endMonth){
  const start=validMonthValue(startMonth);
  const end=validMonthValue(endMonth);
  if(!start||!end||start>end)return [];
  const rows=[];
  let cursor=new Date(`${start}-01T12:00:00`);
  const endDate=new Date(`${end}-01T12:00:00`);
  while(cursor<=endDate&&rows.length<240){
    rows.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,"0")}`);
    cursor.setMonth(cursor.getMonth()+1);
  }
  return rows;
}

function reportUniqueLaunchRowsV225(rows=[]){
  const byId=new Map();
  (Array.isArray(rows)?rows:[]).filter(Boolean).forEach((row,index)=>{
    const key=String(row.id||row.legacyId||`${launchRecordMonthV215(row)}|${reportLaunchEffectiveDateV217(row)}|${row.influencerId||""}|${index}`);
    if(!byId.has(key))byId.set(key,row);
  });
  return [...byId.values()].sort((a,b)=>{
    const am=launchRecordMonthV215(a)||"";
    const bm=launchRecordMonthV215(b)||"";
    if(am!==bm)return am.localeCompare(bm);
    return String(reportLaunchEffectiveDateV217(a)||"").localeCompare(String(reportLaunchEffectiveDateV217(b)||""));
  });
}

function reportApplyBalanceEventsV229(openingBalance,events=[]){
  let product=Math.max(0,Number(openingBalance?.product||0));
  let cash=Math.max(0,Number(openingBalance?.cash||0));
  const processed=[];

  (Array.isArray(events)?events:[]).forEach(event=>{
    const beforeProduct=Math.max(0,Number(product||0));
    const beforeCash=Math.max(0,Number(cash||0));

    if(event.kind==="commission_earned"){
      product+=Math.max(0,Number(event.product||0));
      cash+=Math.max(0,Number(event.cash||0));
    }else if(event.kind==="launch_settled"){
      /* PAGO é fechamento da competência: nada anterior pode migrar. */
      product=0;
      cash=0;
    }else if(event.kind==="product_used"){
      product=Math.max(0,product-Math.max(0,Number(event.amount||0)));
      if(event.closeCash)cash=0;
    }else if(event.kind==="cash_used"){
      cash=Math.max(0,cash-Math.max(0,Number(event.amount||0)));
      if(event.closeProduct)product=0;
    }else if(event.kind==="paid_adjustment"){
      const amount=Math.max(0,Number(event.amount||0));
      if(event.paymentType==="Produto"){
        product=Math.max(0,product-amount);
        cash=0;
      }else{
        cash=Math.max(0,cash-amount);
        product=0;
      }
    }else if(event.kind==="history_checkpoint"){
      const row=event.source||{};
      const productDelta=Math.max(0,Number(row.beforeProduct||0)-Number(row.afterProduct||0));
      const cashDelta=Math.max(0,Number(row.beforeCash||0)-Number(row.afterCash||0));
      if(row.type==="product_choice_paid"||row.type==="product_paid"){
        product=Math.max(0,product-productDelta);
        cash=0;
      }else if(row.type==="cash_paid"){
        cash=Math.max(0,cash-cashDelta);
        product=0;
      }else if(row.type==="product_zero_only"){
        product=0;
      }else if(row.type==="cash_zero_only"){
        cash=0;
      }else if(row.type==="manual_zero"){
        product=0;
        cash=0;
      }else{
        product=Math.max(0,product-productDelta);
        cash=Math.max(0,cash-cashDelta);
      }
    }

    product=Math.max(0,Number(product||0));
    cash=Math.max(0,Number(cash||0));
    processed.push({
      ...event,
      beforeProduct,beforeCash,
      afterProduct:product,afterCash:cash,
      productDeducted:Math.max(0,beforeProduct-product),
      cashDeducted:Math.max(0,beforeCash-cash)
    });
  });

  return {product,cash,events:processed};
}

function reportCommissionLedgerEvents(infId,asOfDate){
  const end=normalizeDateOnly(asOfDate)||today();
  const events=[];
  const activeAdjustments=reportActivePaidAdjustmentsForInfluencer(infId,end);

  const historyRows=(state.accumulationHistory||[])
    .filter(row=>{
      const date=normalizeDateOnly(row.createdAt||row.date);
      return row&&row.influencerId===infId&&date&&date<=end&&accumulationHistoryTypesThatCloseBalance().has(row.type);
    });

  const historyRelatedIds=new Set(historyRows.map(row=>String(row.relatedId||"")).filter(Boolean));
  const historyKeys=new Set(historyRows.map(row=>`${normalizeDateOnly(row.createdAt||row.date)}|${row.type}`));

  (state.launches||[]).forEach(row=>{
    const date=reportLaunchEffectiveDateV217(row);
    if(!row||!reportRecordBelongsToInfluencerV217(row,infId)||row.status==="Cancelado"||!date||date>end)return;

    events.push({
      at:`${date}T09:00:00.000`,date,order:10,kind:"commission_earned",
      product:Number(row.productCommission||0),cash:Number(row.cashCommission||0),sold:Number(row.sold||0),source:row
    });

    if(!reportLaunchPaidFlagV229(row))return;
    const paidMonth=paidAccountingMonthV231(row);
    if(activeAdjustments.has(paidMonth))return;

    /* V231: paidAt guarda quando o usuário registrou a quitação.
       paidAccountingAt/paidMonth definem quando o saldo deixa de migrar. */
    const paidDate=paidAccountingDateV231(row);
    if(!paidDate||paidDate>end)return;

    events.push({
      at:`${paidDate}T23:20:00.000`,date:paidDate,order:60,kind:"launch_settled",
      product:Number(row.productCommission||0),cash:Number(row.cashCommission||0),
      paymentMethod:paidMethodNormalizeV231(row.paidMethod),source:row
    });
  });

  (state.redemptions||[]).forEach(row=>{
    const date=normalizeDateOnly(row.date);
    if(!row||row.influencerId!==infId||row.status==="Cancelado"||!date||date>end)return;
    const month=date.slice(0,7);
    if(activeAdjustments.has(month))return;

    const relatedId=`product-choice-${row.id}`;
    const matchedHistory=historyRelatedIds.has(relatedId)||
      historyKeys.has(`${date}|product_choice_paid`)||
      historyKeys.has(`${date}|product_paid`)||
      (String(row.name||"")==="Saldo em produtos zerado no pagamento"&&historyKeys.has(`${date}|cash_paid`));
    if(matchedHistory)return;

    events.push({
      at:`${date}T12:00:00.000`,date,order:20,kind:"product_used",
      amount:Number(row.used||0),closeCash:isProductChoiceRedemption(row),source:row
    });
  });

  (state.cashPayments||[]).forEach(row=>{
    const date=normalizeDateOnly(row.date);
    if(!row||row.influencerId!==infId||row.status==="Cancelado"||!date||date>end)return;
    const month=/^\d{4}-\d{2}$/.test(String(row.month||""))?String(row.month):date.slice(0,7);
    if(activeAdjustments.has(month))return;

    const relatedId=row.productRedemptionId?`product-choice-${row.productRedemptionId}`:"";
    const matchedHistory=(relatedId&&historyRelatedIds.has(relatedId))||
      (row.productRedemptionId&&historyKeys.has(`${date}|product_choice_paid`))||
      (!row.productRedemptionId&&historyKeys.has(`${date}|cash_paid`));
    if(matchedHistory)return;

    events.push({
      at:`${date}T13:00:00.000`,date,order:30,kind:"cash_used",
      amount:Number(row.cash||row.amount||0),closeProduct:!row.productRedemptionId,source:row
    });
  });

  historyRows.forEach(row=>{
    const date=normalizeDateOnly(row.createdAt||row.date);
    const month=date.slice(0,7);
    if(activeAdjustments.has(month)&&reportHistoryPaymentType(row.type))return;
    events.push({
      at:row.createdAt||`${date}T23:59:59.000`,date,order:90,kind:"history_checkpoint",source:row
    });
  });

  activeAdjustments.forEach((row,month)=>{
    let date=normalizeDateOnly(row.date);
    if(!date||date.slice(0,7)!==month)date=monthEndDate(month);
    if(!date||date>end)return;
    events.push({
      at:`${date}T23:30:00.000`,date,order:80,kind:"paid_adjustment",
      paymentType:String(row.paymentType||""),amount:Number(row.amount||0),source:row
    });
  });

  return events.sort((a,b)=>{
    const byTime=String(a.at||"").localeCompare(String(b.at||""));
    if(byTime)return byTime;
    return Number(a.order||0)-Number(b.order||0);
  });
}

function reportHistoryPaymentType(type){
  return type==="cash_paid"||type==="product_paid"||type==="product_choice_paid";
}

function paidAccountingDateV231(row){
  const explicit=normalizeDateOnly(row?.paidAccountingAt);
  if(explicit)return explicit;
  const month=paidAccountingMonthV231(row);
  return monthEndDate(month)||normalizeDateOnly(row?.paidAt)||normalizeDateOnly(row?.date)||today();
}

function paidAccountingMonthV231(row){
  if(!row)return selectedMonth();
  /* A quitação pertence à competência do lançamento, mesmo quando o clique em
     PAGO acontece dias depois. paidAt continua guardando a data real do clique. */
  return validMonthValue(row.accountingMonth)||
    launchRecordMonthV215(row)||
    validMonthValue(row.month)||
    validMonthValue(row.paidMonth)||
    String(row.date||today()).slice(0,7);
}

function accumulationHistoryTypesThatCloseBalance(){
  return new Set(["product_choice_paid","cash_paid","product_paid","manual_zero","product_zero_only","cash_zero_only"]);
}

function reportActivePaidAdjustmentsForInfluencer(infId,asOfDate){
  const map=new Map();
  (state.paidAdjustments||[])
    .filter(row=>row&&row.influencerId===infId&&row.status!=="Cancelado")
    .sort((a,b)=>{
      const at=Date.parse(a.updatedAt||a.createdAt||a.date||"")||0;
      const bt=Date.parse(b.updatedAt||b.createdAt||b.date||"")||0;
      if(at!==bt)return at-bt;
      return String(a.id||"").localeCompare(String(b.id||""));
    })
    .forEach(row=>{
      const month=/^\d{4}-\d{2}$/.test(String(row.month||""))
        ? String(row.month)
        : reportEventMonth(row.date);
      if(!month||`${month}-01`>asOfDate)return;
      map.set(month,row);
    });
  return map;
}

function reportCoverageRange(infId,month=selectedMonth()){
  const selected=reportMonthRange(month);
  const currentHistory=reportHistoryForInfluencer(infId)
    .filter(row=>row.reportMonth===selected.month)
    .sort((a,b)=>String(b.sentAt||"").localeCompare(String(a.sentAt||"")))[0];
  if(currentHistory?.coverageStart&&currentHistory?.coverageEnd){
    return {
      start:normalizeDateOnly(currentHistory.coverageStart)||selected.start,
      end:normalizeDateOnly(currentHistory.coverageEnd)||selected.end,
      month:selected.month,
      source:"history",
      previousEnd:"",
      historyRecord:currentHistory
    };
  }

  const previous=reportHistoryForInfluencer(infId)
    .filter(row=>normalizeDateOnly(row.coverageEnd)&&normalizeDateOnly(row.coverageEnd)<selected.start)
    .sort((a,b)=>String(b.coverageEnd||"").localeCompare(String(a.coverageEnd||"")))[0];
  const previousEnd=normalizeDateOnly(previous?.coverageEnd)||reportLegacyLastSentEnd(infId,selected.start);
  let start=previousEnd?reportDateAfter(previousEnd):selected.start;

  const unsentDates=(state.launches||[])
    .map(row=>({row,date:reportLaunchEffectiveDateV217(row),month:launchRecordMonthV215(row)}))
    .filter(item=>item.row&&reportRecordBelongsToInfluencerV217(item.row,infId)&&item.row.status!=="Cancelado"&&!reportBooleanV218(item.row.pdfSent)&&item.date&&item.month&&item.month<=selected.month)
    .map(item=>item.date)
    .sort();
  if(unsentDates.length&&unsentDates[0]<start)start=`${unsentDates[0].slice(0,7)}-01`;
  if(!previousEnd&&unsentDates.length)start=`${unsentDates[0].slice(0,7)}-01`;
  if(start>selected.end)start=selected.start;

  return {start,end:selected.end,month:selected.month,source:previousEnd?"after-last-sent":"selected",previousEnd,historyRecord:null};
}

function reportDateAfter(date){
  const normalized=normalizeDateOnly(date);
  if(!normalized)return "";
  const value=new Date(`${normalized}T12:00:00`);
  value.setDate(value.getDate()+1);
  return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
}

function reportLegacyLastSentEnd(infId,beforeDate){
  const before=normalizeDateOnly(beforeDate)||"9999-12-31";
  const byMonth=new Map();
  (state.launches||[]).forEach(row=>{
    const month=launchRecordMonthV215(row);
    const date=reportLaunchEffectiveDateV217(row);
    if(!row||!reportRecordBelongsToInfluencerV217(row,infId)||row.status==="Cancelado"||!month||!date||date>=before)return;
    if(!byMonth.has(month))byMonth.set(month,[]);
    byMonth.get(month).push(row);
  });
  return [...byMonth.entries()]
    .filter(([,rows])=>rows.length&&rows.every(row=>row.pdfSent===true))
    .map(([month])=>monthEndDate(month))
    .sort()
    .pop()||"";
}

function reportHistoryForInfluencer(infId){
  return (state.reportHistory||[])
    .filter(row=>row&&reportRecordBelongsToInfluencerV217(row,infId)&&row.status!=="Cancelado")
    .slice()
    .sort((a,b)=>String(a.coverageEnd||a.sentAt||"").localeCompare(String(b.coverageEnd||b.sentAt||"")));
}

function reportAccumulationCarryV225(infId,month=selectedMonth()){
  const selected=reportMonthRange(month);
  const beforeSelected=reportDateBefore(selected.start);
  const empty={
    active:false,start:selected.start,end:beforeSelected||selected.start,
    opening:{product:0,cash:0,events:[]},priorRows:[],months:[],product:0,cash:0
  };
  if(!beforeSelected)return empty;

  const priorRows=reportUniqueLaunchRowsV225(
    reportLaunchRowsForRangeV218(infId,"1900-01-01",beforeSelected)
      .filter(row=>row&&row.status!=="Cancelado"&&reportLaunchAccumulatesV229(row))
  );
  if(!priorRows.length)return empty;

  const opening=reportAccumulationTimeline(infId,beforeSelected);
  const product=Math.max(0,Number(opening.product||0));
  const cash=Math.max(0,Number(opening.cash||0));
  if(product<0.005&&cash<0.005)return {...empty,opening,product,cash};

  const events=(opening.events||[]).filter(event=>event&&event.date&&event.date<selected.start);
  let lastFullClose=-1;
  events.forEach((event,index)=>{
    const afterProduct=Math.max(0,Number(event.afterProduct||0));
    const afterCash=Math.max(0,Number(event.afterCash||0));
    if(event.kind!=="launch"&&afterProduct<0.005&&afterCash<0.005)lastFullClose=index;
  });
  const activeEvents=events.slice(lastFullClose+1);
  const activeIds=new Set(activeEvents
    .filter(event=>event.kind==="launch"&&event.source&&reportLaunchAccumulatesV229(event.source))
    .map(event=>String(event.source.id||event.source.legacyId||""))
    .filter(Boolean));

  let activeRows=priorRows.filter(row=>{
    const id=String(row.id||row.legacyId||"");
    return !activeIds.size||!id||activeIds.has(id);
  });
  activeRows=reportUniqueLaunchRowsV225(activeRows);
  if(!activeRows.length)return {...empty,opening,product,cash};

  const months=[...new Set(activeRows.map(row=>launchRecordMonthV215(row)).filter(Boolean))].sort();
  const firstMonth=months[0]||selected.month;
  return {active:true,start:`${firstMonth}-01`,end:beforeSelected,opening,priorRows:activeRows,months,product,cash};
}

function reportAccumulationTimeline(infId,asOfDate){
  const end=normalizeDateOnly(asOfDate)||today();
  let product=0;
  let cash=0;
  const processed=[];
  accumulationLedgerEventsForInfluencer(infId,end).forEach(event=>{
    const beforeProduct=Math.max(0,Number(product||0));
    const beforeCash=Math.max(0,Number(cash||0));
    let earnedProduct=0;
    let earnedCash=0;

    if(event.kind==="launch"){
      earnedProduct=Math.max(0,Number(event.product||0));
      earnedCash=Math.max(0,Number(event.cash||0));
      product+=earnedProduct;
      cash+=earnedCash;
    }else if(event.kind==="paid_close"){
      product=0;
      cash=0;
    }else if(event.kind==="product_redemption"){
      product=Math.max(0,product-Math.max(0,Number(event.productUsed||0)));
      if(event.cashToZero)cash=0;
    }else if(event.kind==="cash_zero_by_product"){
      cash=Math.max(0,cash-Math.max(0,Number(event.amount||0)));
    }else if(event.kind==="cash_payment"){
      cash=Math.max(0,cash-Math.max(0,Number(event.amount||0)));
      if(event.productToZero)product=0;
    }else if(event.kind==="history_checkpoint"){
      product=Math.max(0,Number(event.productAfter||0));
      cash=Math.max(0,Number(event.cashAfter||0));
    }

    product=Math.max(0,Number(product||0));
    cash=Math.max(0,Number(cash||0));
    processed.push({
      ...event,
      date:normalizeDateOnly(event.at),
      beforeProduct,beforeCash,afterProduct:product,afterCash:cash,
      earnedProduct,earnedCash,
      productDeducted:Math.max(0,beforeProduct+earnedProduct-product),
      cashDeducted:Math.max(0,beforeCash+earnedCash-cash)
    });
  });
  return {product,cash,events:processed};
}

function accumulationLedgerEventsForInfluencer(infId,asOfDate=today()){
  const events=[];

  (state.launches||[]).forEach(l=>{
    const date=reportLaunchEffectiveDateV217(l);
    if(l.status==="Cancelado"||!reportLaunchAccumulatesV229(l)||!reportRecordBelongsToInfluencerV217(l,infId)||!date||date>asOfDate)return;

    events.push({
      at:date+"T00:00:00.000",
      order:10,
      kind:"launch",
      product:reportNumberV217(l.productCommission),
      cash:reportNumberV217(l.cashCommission),
      source:l
    });
  });

  /* V231: o checkbox PAGO encerra contabilmente todo o ciclo acumulado
     daquela competência. A data real do clique continua em paidAt; para os
     relatórios seguintes, o fechamento vale no fim da competência paga. */
  (state.launches||[]).forEach(l=>{
    if(!l||l.status==="Cancelado"||!reportLaunchPaidFlagV229(l)||!reportRecordBelongsToInfluencerV217(l,infId))return;
    const accountingDate=paidAccountingDateV231(l);
    if(!accountingDate||accountingDate>asOfDate)return;
    events.push({
      at:accountingDate+"T23:15:00.000",
      order:80,
      kind:"paid_close",
      paymentMethod:paidMethodNormalizeV231(l.paidMethod),
      source:l
    });
  });

  (state.redemptions||[]).forEach(r=>{
    const date=normalizeDateOnly(r.date);
    if(!reportRecordBelongsToInfluencerV217(r,infId)||r.status==="Cancelado"||!date||date>asOfDate)return;

    events.push({
      at:date+"T12:00:00.000",
      order:20,
      kind:"product_redemption",
      productUsed:reportNumberV217(r.used),
      cashToZero:isProductChoiceRedemption(r),
      source:r
    });
  });

  (state.cashPayments||[]).forEach(p=>{
    const date=normalizeDateOnly(p.date);
    if(!reportRecordBelongsToInfluencerV217(p,infId)||p.status==="Cancelado"||!date||date>asOfDate)return;

    events.push({
      at:date+"T13:00:00.000",
      order:30,
      kind:p.productRedemptionId?"cash_zero_by_product":"cash_payment",
      amount:reportNumberV217(p.cash||p.amount),
      productToZero:!p.productRedemptionId,
      source:p
    });
  });

  (state.accumulationHistory||[]).forEach(h=>{
    const date=normalizeDateOnly(h.createdAt||h.date);
    if(!reportRecordBelongsToInfluencerV217(h,infId)||!date||date>asOfDate)return;
    if(!accumulationHistoryTypesThatCloseBalance().has(h.type))return;

    events.push({
      at:h.createdAt||date+"T23:59:59.000",
      order:90,
      kind:"history_checkpoint",
      productAfter:Math.max(0,reportNumberV217(h.afterProduct)),
      cashAfter:Math.max(0,reportNumberV217(h.afterCash)),
      productBefore:Math.max(0,reportNumberV217(h.beforeProduct)),
      cashBefore:Math.max(0,reportNumberV217(h.beforeCash)),
      source:h
    });
  });

  return events.sort((a,b)=>{
    const at=String(a.at||"").localeCompare(String(b.at||""));
    if(at)return at;
    return Number(a.order||0)-Number(b.order||0);
  });
}

function reportDateBefore(date){
  const normalized=normalizeDateOnly(date);
  if(!normalized)return "";
  const value=new Date(`${normalized}T12:00:00`);
  value.setDate(value.getDate()-1);
  const y=value.getFullYear();
  const m=String(value.getMonth()+1).padStart(2,"0");
  const d=String(value.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function normalizeReportInputsV267(){
state.launches.forEach(l=>{
    l.id=l.id||uid();
    l.date=l.date||today();
    l.month=l.month||(l.date||today()).slice(0,7);
    l.periodMode=l.periodMode==="month"?"month":"day";
    if(l.periodMode==="month"&&!/^\d{4}-\d{2}$/.test(String(l.month||""))){
      l.month=(l.date||today()).slice(0,7);
    }
    l.influencerId=l.influencerId||"";
    l.origin=l.origin||"Site";
    l.sold=Math.max(0,finiteNumber(l.sold,0));
    l.productCommission=Math.max(0,finiteNumber(l.productCommission,0));
    l.cashCommission=Math.max(0,finiteNumber(l.cashCommission,0));
    l.status=l.status||"Pendente";
    l.notes=l.notes||"";
    l.accumulate=!!l.accumulate;
    l.pdfSent=!!l.pdfSent;
    l.paid=!!l.paid;
    l.createdByName=l.createdByName||"Não registrado";
    l.createdByUsername=l.createdByUsername||"";
    l.createdById=l.createdById||"";
    l.createdAt=l.createdAt||"";
    l.updatedByName=l.updatedByName||"";
    l.updatedByUsername=l.updatedByUsername||"";
    l.updatedAt=l.updatedAt||"";

    if(l.paid){
      l.paidAt=l.paidAt||today();
      l.paidMonth=validMonthValue(l.paidMonth)||validMonthValue(l.accountingMonth)||validMonthValue(l.month)||(l.date||today()).slice(0,7);
      l.paidMethod=paidMethodNormalizeV231(l.paidMethod);
      l.paidAccountingAt=normalizeDateOnly(l.paidAccountingAt)||monthEndDate(l.paidMonth)||normalizeDateOnly(l.date)||today();
    }else{
      l.paidMethod="";
      l.paidAccountingAt="";
    }

    if(l.accumulate){
      l.paid=false;
      l.paidAt="";
      l.paidMonth="";
      l.paidMethod="";
      l.paidAccountingAt="";
    }
  });

state.redemptions.forEach(r=>{
    r.id=r.id||uid();
    r.date=r.date||today();
    r.month=r.month||(r.date||today()).slice(0,7);
    r.influencerId=r.influencerId||"";
    r.name=r.name||"Produto";
    r.value=Math.max(0,finiteNumber(r.value,0));
    r.used=Math.max(0,finiteNumber(r.used,0));
    r.difference=Math.max(0,finiteNumber(r.difference,r.value-r.used));
    r.status=r.status||"Pendente";
    r.notes=r.notes||"";
    r.createdByName=r.createdByName||"Não registrado";
    r.createdByUsername=r.createdByUsername||"";
    r.createdById=r.createdById||"";
    r.createdAt=r.createdAt||"";
    r.updatedByName=r.updatedByName||"";
    r.updatedByUsername=r.updatedByUsername||"";
    r.updatedById=r.updatedById||"";
    r.updatedAt=r.updatedAt||"";
  });

state.accumulationHistory.forEach(h=>{
    h.id=h.id||uid();
    h.date=h.date||today();
    h.createdAt=h.createdAt||h.date||today();
    h.influencerId=h.influencerId||"";
    h.type=h.type||"manual_zero";
    h.label=h.label||"Alteração no acúmulo";
    h.reason=h.reason||"Sem motivo informado";
    h.beforeProduct=Number(h.beforeProduct||0);
    h.afterProduct=Number(h.afterProduct||0);
    h.beforeCash=Number(h.beforeCash||0);
    h.afterCash=Number(h.afterCash||0);
    h.createdByName=h.createdByName||"Não registrado";
    h.relatedId=h.relatedId||"";
  });

state.reportHistory.forEach(row=>{
    row.id=row.id||`report-${row.influencerId||"unknown"}-${row.reportMonth||currentMonth()}`;
    row.influencerId=row.influencerId||"";
    row.reportMonth=validMonthValue(row.reportMonth)||reportEventMonth(row.coverageEnd)||currentMonth();
    row.coverageStart=normalizeDateOnly(row.coverageStart)||`${row.reportMonth}-01`;
    row.coverageEnd=normalizeDateOnly(row.coverageEnd)||monthEndDate(row.reportMonth);
    row.status=row.status||"Enviado";
    row.sentAt=row.sentAt||row.updatedAt||new Date().toISOString();
    row.sentByName=row.sentByName||row.updatedByName||"Não registrado";
  });

state.cashPayments.forEach(p=>{
    p.id=p.id||uid();
    p.date=p.date||today();
    p.month=p.month||(p.date||today()).slice(0,7);
    p.amount=Number(p.amount||p.cash||0);
    p.cash=Number(p.cash||p.amount||0);
  });

repairPaidAdjustments();
}
normalizeReportInputsV267();
return reportCommissionSnapshot(influencerId,month);
}
