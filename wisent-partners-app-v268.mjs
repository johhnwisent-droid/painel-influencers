import {connectionV268} from './wisent-partners-config-v268.mjs';
import {PartnerAuthV268} from './wisent-partners-auth-v268.mjs';
import {PartnerSourceV268} from './wisent-partners-source-v268.mjs';
import {buildPartnerReportV268,validMonth} from './wisent-partners-report-v268.mjs';

const $=id=>document.getElementById(id);const auth=new PartnerAuthV268({...connectionV268});const source=new PartnerSourceV268({...connectionV268,auth});
const money=value=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(value)||0);
const localMonth=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(new Date());
const range=month=>{const [year,number]=month.split('-').map(Number);return {from:`${month}-01`,to:`${year}-${String(number).padStart(2,'0')}-${String(new Date(year,number,0).getDate()).padStart(2,'0')}`};};
let epoch=0,loading=false,refreshTimer=null,lastRows=[];

function clearReport(){lastRows=[];$('partner-name').textContent='';$('partner-coupon').textContent='';$('partner-launches').replaceChildren();for(const id of ['partner-sold','partner-product','partner-cash','partner-product-balance','partner-cash-balance'])$(id).textContent=money(0);$('partner-status').textContent='';$('partner-checked').textContent='';}
function showLogin(message=''){
  epoch++;clearTimeout(refreshTimer);source.close();clearReport();$('partner-report').hidden=true;$('partner-login').hidden=false;$('partner-login-error').textContent=message;$('partner-password').value='';
}
function showPortal(){$('partner-login').hidden=true;$('partner-report').hidden=false;if(!validMonth($('partner-month').value))$('partner-month').value=localMonth();}
function appendLaunch(row){const tr=document.createElement('tr');for(const value of [String(row.date||'').split('-').reverse().join('/'),row.origin,money(row.sold),money(row.product),money(row.cash),row.paid?'Pago':row.accumulate?'Acumulando':'Em aberto']){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('partner-launches').append(tr);}
function render(report){$('partner-name').textContent=report.partner.name;$('partner-coupon').textContent=`Cupom: ${report.partner.coupon||'-'}`;$('partner-sold').textContent=money(report.sold);$('partner-product').textContent=money(report.product);$('partner-cash').textContent=money(report.cash);$('partner-product-balance').textContent=money(report.accumulatedProduct);$('partner-cash-balance').textContent=money(report.accumulatedCash);$('partner-status').textContent=report.status||'Saldo atualizado com os registros confirmados.';$('partner-checked').textContent=`Atualizado em ${new Date(report.checkedAt).toLocaleString('pt-BR')}`;$('partner-launches').replaceChildren();if(report.launches.length)report.launches.forEach(appendLaunch);else{const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=6;td.className='empty';td.textContent='Nenhuma venda encontrada nesta competência.';tr.append(td);$('partner-launches').append(tr);}}
async function loadReport(){
  if(loading||!auth.session())return;const own=epoch,month=$('partner-month').value;if(!validMonth(month))return;
  loading=true;$('partner-refresh').disabled=true;$('partner-report-error').textContent='';$('partner-sync').textContent='Conferindo dados oficiais…';
  try{const dates=range(month);const rows=await source.fetchReport(dates.from,dates.to);if(own!==epoch)return;lastRows=rows;render(buildPartnerReportV268(rows,month));$('partner-sync').textContent=source.realtimeConnected?'Atualização em tempo real conectada':'Dados confirmados · reconexão automática ativa';}
  catch(error){if(own!==epoch)return;if(error.status===401||error.status===403){await auth.signOut();showLogin('Seu acesso expirou ou está inativo.');return;}$('partner-report-error').textContent=error.message||'Não foi possível atualizar agora.';$('partner-sync').textContent='Última atualização preservada';}
  finally{if(own===epoch){loading=false;$('partner-refresh').disabled=false;}}
}
function scheduleRefresh(){clearTimeout(refreshTimer);refreshTimer=setTimeout(loadReport,350);}

$('partner-login-form').addEventListener('submit',async event=>{event.preventDefault();const own=++epoch;$('partner-login-submit').disabled=true;$('partner-login-error').textContent='';try{await auth.signIn($('partner-email').value,$('partner-password').value);if(own!==epoch)return;showPortal();source.start();await loadReport();}catch(error){if(own===epoch)showLogin(error.message);}finally{$('partner-login-submit').disabled=false;}});
$('partner-logout').addEventListener('click',async()=>{showLogin('Você saiu da sua conta.');await auth.signOut();});
$('partner-refresh').addEventListener('click',loadReport);$('partner-month').addEventListener('change',()=>{clearReport();loadReport();});$('partner-print').addEventListener('click',()=>window.print());
source.on('change',scheduleRefresh);source.on('status',()=>{$('partner-sync').textContent=source.realtimeConnected?'Atualização em tempo real conectada':'Reconectando atualização em tempo real…';});
window.addEventListener('online',()=>{if(auth.session()){source.start();loadReport();}});window.addEventListener('offline',()=>{$('partner-sync').textContent='Sem conexão · dados atuais preservados';});window.addEventListener('pagehide',()=>{epoch++;clearTimeout(refreshTimer);source.close();clearReport();});
if(auth.session()){showPortal();source.start();loadReport();}else showLogin();
