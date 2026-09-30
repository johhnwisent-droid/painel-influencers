import {connectionV268} from './wisent-partners-config-v268.mjs';

const SESSION_KEY='wisent_admin_auth_v268';

export class AdminAccessV268{
  constructor({url,key,adminEmail,fetchImpl=fetch,storage=sessionStorage}){
    const endpoint=new URL(url);
    if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||!key)throw new Error('Configuração administrativa indisponível.');
    this.url=endpoint.origin;this.key=key;this.adminEmail=String(adminEmail||'').trim().toLowerCase();this.fetchImpl=fetchImpl;this.storage=storage;
  }
  session(){try{const value=JSON.parse(this.storage.getItem(SESSION_KEY)||'null');return value?.accessToken?value:null;}catch{return null;}}
  hasValidSession(now=Date.now()){
    const value=this.session();
    if(!value?.accessToken||Number(value.expiresAt||0)<=Number(now)+30000){
      if(value)this.persist(null);
      return false;
    }
    return true;
  }
  accessToken(){return this.hasValidSession()?this.session()?.accessToken||'':'';}
  persist(value){
    if(!value){this.storage.removeItem(SESSION_KEY);return null;}
    const safe={accessToken:value.accessToken,refreshToken:value.refreshToken||'',expiresAt:Number(value.expiresAt||0),userId:String(value.userId||'')};
    this.storage.setItem(SESSION_KEY,JSON.stringify(safe));return safe;
  }
  async authRequest(url,options){
    let lastError;
    for(let attempt=0;attempt<2;attempt++){
      const controller=typeof AbortController==='function'?new AbortController():null;
      const timeoutId=controller?setTimeout(()=>controller.abort(),30000):null;
      try{return await this.fetchImpl(url,{...options,...(controller?{signal:controller.signal}:{})});}
      catch(error){
        lastError=error;
        const transient=['AbortError','TimeoutError','TypeError'].includes(String(error?.name||''));
        if(attempt===0&&transient)continue;
        throw error;
      }finally{if(timeoutId!==null)clearTimeout(timeoutId);}
    }
    throw lastError;
  }
  async signIn(password){
    this.persist(null);
    if(!this.adminEmail||this.adminEmail==='admin_email_preencher')throw new Error('A configuração segura do ADMIN ainda não foi ativada.');
    try{
      const response=await this.authRequest(`${this.url}/auth/v1/token?grant_type=password`,{method:'POST',redirect:'error',cache:'no-store',headers:{apikey:this.key,'Content-Type':'application/json'},body:JSON.stringify({email:this.adminEmail,password:String(password||'')})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        const code=String(data?.code||data?.error_code||data?.error||'').toLowerCase();
        let message='A validação segura do ADMIN não foi concluída.';
        if(code==='invalid_credentials')message='A senha ADMIN não corresponde à conta Auth do Supabase.';
        if(code==='email_not_confirmed')message='O e-mail ADMIN ainda não está confirmado no Supabase.';
        const denied=new Error(message);denied.status=response.status;denied.code=code||'auth_failed';denied.safeAdminAuth=true;throw denied;
      }
      if(!data?.access_token||!data?.user?.id){const denied=new Error('A resposta de autenticação do ADMIN ficou incompleta.');denied.status=401;denied.safeAdminAuth=true;throw denied;}
      return this.persist({accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+Math.max(30,Number(data.expires_in||3600))*1000,userId:data.user.id});
    }catch(error){
      this.persist(null);
      if(error?.safeAdminAuth)throw error;
      const timeout=['AbortError','TimeoutError'].includes(String(error?.name||''));
      const neutral=new Error(timeout?'O Supabase demorou para responder mesmo após nova tentativa. Aguarde alguns segundos e tente novamente.':'Não foi possível conectar ao login seguro do Supabase. Verifique a conexão e tente novamente.');neutral.status=503;throw neutral;
    }
  }
  async invoke(action,payload={}){
    const token=this.accessToken();
    if(!token){const error=new Error('Entre novamente como ADMIN para gerenciar acessos.');error.status=401;throw error;}
    const response=await this.fetchImpl(`${this.url}/functions/v1/wisent-partner-admin`,{method:'POST',redirect:'error',cache:'no-store',headers:{apikey:this.key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({action,...payload}),signal:AbortSignal.timeout(20000)});
    let data={};try{data=await response.json();}catch{}
    if(!response.ok||data?.ok!==true){const error=new Error(data?.message||'Não foi possível concluir a operação.');error.status=response.status;error.code=data?.status||'operation_failed';throw error;}
    return data;
  }
  async signOut(){
    const token=this.accessToken();this.persist(null);
    if(token){try{await this.fetchImpl(`${this.url}/auth/v1/logout`,{method:'POST',headers:{apikey:this.key,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});}catch{}}
  }
}

if(typeof window!=='undefined'&&typeof sessionStorage!=='undefined'){
  const instance=new AdminAccessV268({...connectionV268});
  globalThis.WisentAdminAccessV268=instance;
  globalThis.dispatchEvent?.(new CustomEvent('wisent-admin-access-ready-v268'));
}
export {SESSION_KEY};
