class EventsV268 {
  constructor(){this.listeners=new Map();}
  on(name,fn){if(!this.listeners.has(name))this.listeners.set(name,new Set());this.listeners.get(name).add(fn);return this;}
  emit(name,...args){for(const fn of this.listeners.get(name)||[])fn(...args);}
}

export class PartnerSourceV268 extends EventsV268 {
  constructor({url,key,auth,fetchImpl=fetch,WebSocketImpl=globalThis.WebSocket}){
    super();const endpoint=new URL(url);
    if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||!key||!auth)throw new Error('Configuração de consulta indisponível.');
    this.url=endpoint.origin;this.key=key;this.auth=auth;this.fetchImpl=fetchImpl;this.WebSocketImpl=WebSocketImpl;
    this.inflight=new Map();this.stopped=true;this.retry=0;this.ref=0;this.realtimeConnected=false;
  }
  fetchReport(from,to){
    const key=`${from}|${to}`;
    if(this.inflight.has(key))return this.inflight.get(key);
    const request=this.fetchReportOnce(from,to).finally(()=>this.inflight.delete(key));
    this.inflight.set(key,request);return request;
  }
  async fetchReportOnce(from,to){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to)throw new Error('Período inválido.');
    const token=this.auth.accessToken();if(!token){const error=new Error('Sua sessão expirou.');error.status=401;throw error;}
    const response=await this.fetchImpl(`${this.url}/rest/v1/rpc/wisent_partner_report_v268`,{method:'POST',redirect:'error',cache:'no-store',headers:{apikey:this.key,Authorization:`Bearer ${token}`,'Content-Type':'application/json','Cache-Control':'no-cache'},body:JSON.stringify({p_from:from,p_to:to}),signal:AbortSignal.timeout(15000)});
    if(response.status===401||response.status===403){const error=new Error('Seu acesso não está ativo.');error.status=response.status;throw error;}
    if(!response.ok)throw new Error('Não foi possível confirmar o relatório agora.');
    const text=await response.text();if(text.length>5*1024*1024)throw new Error('Relatório excedeu o limite seguro.');
    const rows=JSON.parse(text);if(!Array.isArray(rows))throw new Error('Resposta oficial inválida.');return rows;
  }
  start(){this.close();this.stopped=false;this.retry=0;this.connect();}
  connect(){
    if(this.stopped||!this.WebSocketImpl)return;
    const token=this.auth.accessToken();if(!token)return;
    const url=new URL(this.url.replace(/^http/,'ws')+'/realtime/v1/websocket');url.searchParams.set('apikey',this.key);url.searchParams.set('vsn','1.0.0');
    let socket;try{socket=new this.WebSocketImpl(url);}catch{this.scheduleReconnect();return;}
    this.socket=socket;this.realtimeConnected=false;const topic='realtime:wisent-partner-events-v268',joinRef=String(++this.ref);let heartbeat='';
    const send=(event,payload={},ref=String(++this.ref),channel=topic)=>socket.readyState===1&&socket.send(JSON.stringify({topic:channel,event,payload,ref}));
    const fail=()=>{try{socket.close();}catch{}};
    socket.addEventListener('open',()=>{
      send('phx_join',{config:{broadcast:{self:false},presence:{key:''},postgres_changes:[{event:'*',schema:'public',table:'wisent_partner_events_v268'}]},access_token:token},joinRef);
      this.heartbeat=setInterval(()=>{if(heartbeat){fail();return;}heartbeat=String(++this.ref);send('heartbeat',{},heartbeat,'phoenix');},25000);
    });
    socket.addEventListener('message',event=>{
      if(this.socket!==socket||this.stopped)return;let message;try{message=JSON.parse(String(event.data));}catch{return;}
      if(message.event==='phx_reply'&&message.ref===heartbeat)heartbeat='';
      if(message.topic!==topic)return;
      if(message.event==='phx_reply'&&message.ref===joinRef){if(message.payload?.status!=='ok'){fail();return;}this.realtimeConnected=true;this.retry=0;this.emit('status');}
      if(message.event==='postgres_changes'){this.realtimeConnected=true;this.emit('change');}
      if(message.event==='phx_error'||message.event==='phx_close')fail();
    });
    socket.addEventListener('error',fail);
    socket.addEventListener('close',()=>{if(this.socket!==socket)return;clearInterval(this.heartbeat);this.socket=null;this.realtimeConnected=false;this.emit('status');this.scheduleReconnect();});
  }
  scheduleReconnect(){if(this.stopped)return;clearTimeout(this.reconnect);this.reconnect=setTimeout(()=>this.connect(),Math.min(30000,1000*2**Math.min(this.retry++,5)));}
  close(){this.stopped=true;clearTimeout(this.reconnect);clearInterval(this.heartbeat);const socket=this.socket;this.socket=null;this.realtimeConnected=false;try{socket?.close();}catch{}}
}
