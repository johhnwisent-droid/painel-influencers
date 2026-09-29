import {computeSnapshot} from './wisent-partners-accounting-v268.mjs';

const modules={influencers:'influencers',product_redemptions:'redemptions',cash_payments:'cashPayments',paid_adjustments:'paidAdjustments',accumulation_history:'accumulationHistory',report_history:'reportHistory'};
const active=row=>row&&row.deleted!==true&&!row.deletedAt&&!row.deleted_at;
const amount=value=>Math.round((Number(value)||0)*100)/100;
const short=value=>String(value??'').slice(0,160);
export const validMonth=month=>typeof month==='string'&&/^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(month);

export function rowsToPartnerStateV268(rows){
  const state={settings:{origins:[]},launches:[],influencers:[],redemptions:[],cashPayments:[],paidAdjustments:[],accumulationHistory:[],reportHistory:[]};
  for(const row of Array.isArray(rows)?rows:[]){
    const payload=typeof row?.payload==='string'?JSON.parse(row.payload):structuredClone(row?.payload||{});
    payload.id=String(payload.id||row?.record_id||'');
    if(row?.source==='launch')state.launches.push(payload);
    else if(modules[row?.source])state[modules[row.source]].push(payload);
  }
  return state;
}

export function buildPartnerReportV268(rows,month){
  if(!validMonth(month))throw new Error('Competência inválida.');
  const state=rowsToPartnerStateV268(rows);const profiles=state.influencers.filter(active);
  if(profiles.length!==1)throw new Error(profiles.length>1?'Falha de isolamento entre parceiros.':'Vínculo do parceiro indisponível.');
  const influencerId=String(profiles[0].id||'');
  for(const key of ['launches','redemptions','cashPayments','paidAdjustments','accumulationHistory','reportHistory']){
    if(state[key].some(row=>active(row)&&String(row.influencerId||'')!==influencerId))throw new Error('Falha de isolamento entre parceiros.');
    state[key]=state[key].filter(row=>active(row)&&String(row.influencerId||'')===influencerId);
  }
  const snapshot=computeSnapshot(state,influencerId,month);const generated=snapshot.displayedGenerated?.rows||[];
  return {partner:{name:short(profiles[0].name),coupon:short(profiles[0].coupon)},month,coverageStart:snapshot.coverage.start,coverageEnd:snapshot.coverage.end,sold:amount(snapshot.sold),product:amount(snapshot.earnedProduct),cash:amount(snapshot.earnedCash),accumulatedProduct:amount(snapshot.accumulatedProduct),accumulatedCash:amount(snapshot.accumulatedCash),origins:(snapshot.sourceRows||[]).map(row=>({origin:short(row.origin),sold:amount(row.sold)})),launches:generated.map(row=>({date:short(row.date),origin:short(row.origin),sold:amount(row.sold),product:amount(row.productCommission),cash:amount(row.cashCommission),paid:row.paid===true||row.status==='Pago',accumulate:row.accumulate===true&&row.paid!==true&&row.status!=='Pago'})),status:short(snapshot.status?.text),checkedAt:new Date().toISOString()};
}
