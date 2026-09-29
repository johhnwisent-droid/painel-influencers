import {connectionV268} from './wisent-partners-config-v268.mjs';

const SESSION_KEY='wisent_admin_auth_v268';

export class AdminAccessV268{
  constructor({url,key,adminEmail,fetchImpl=fetch,storage=sessionStorage}){
    const endpoint=new URL(url);
    if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||!key)throw new Error('Configuração administrativa indisponível.');
    this.url=endpoint.origin;this.key=key;this.adminEmail=String(adminEmail||'').trim().toLowerCase();this.fetchImpl=fetchImpl;this.storage=storage;
  }
  session(){try{const value=JSON.parse(this.storage.getItem(SESSION_KEY)||'null');return value?.accessToken?value:null;}catch{return null;}}
  accessToken(){return this.session()?.accessToken||'';}
  persist(value){
    if(!value){this.storage.removeItem(SESSION_KEY);return null;}
    const safe={accessToken:value.accessToken,refreshToken:value.refreshToken||'',expiresAt:Number(value.expiresAt||0),userId:String(value.userId||'')};
    this.storage.setItem(SESSION_KEY,JSON.stringify(safe));return safe;
  }
  async signIn(password){
    this.persist(null);
    if(!this.adminEmail||this.adminEmail==='admin_email_preencher')throw new Error('A configuração segura do ADMIN ainda não foi ativada.');
    try{
      const response=await this.fetchImpl(`${this.url}/auth/v1/token?grant_type=password`,{method:'POST',redirect:'error',cache:'no-store',headers:{apikey:this.key,'Content-Type':'application/json'},body:JSON.stringify({email:this.adminEmail,password:String(password||'')}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('denied');
      const data=await response.json();
      if(!data?.access_token||!data?.user?.id)throw new Error('denied');
      return this.persist({accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+Math.max(30,Number(data.expires_in||3600))*1000,userId:data.user.id});
    }catch(error){
      this.persist(null);
      const neutral=new Error('A validação segura do ADMIN não foi concluída.');neutral.status=401;throw neutral;
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
