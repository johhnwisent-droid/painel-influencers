const SESSION_KEY='wisent_partner_auth_v268';

export class PartnerAuthV268 {
  constructor({url,key,fetchImpl=fetch,storage=sessionStorage}){
    const endpoint=new URL(url);
    if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||!key)throw new Error('Configuração de acesso indisponível.');
    this.url=endpoint.origin;this.key=key;this.fetchImpl=fetchImpl;this.storage=storage;
  }
  session(){
    try{const value=JSON.parse(this.storage.getItem(SESSION_KEY)||'null');return value?.accessToken?value:null;}catch{return null;}
  }
  accessToken(){return this.session()?.accessToken||'';}
  persist(value){
    if(!value){this.storage.removeItem(SESSION_KEY);return null;}
    const safe={accessToken:value.accessToken,refreshToken:value.refreshToken||'',expiresAt:Number(value.expiresAt||0),user:{id:String(value.user?.id||''),email:String(value.user?.email||'')}};
    this.storage.setItem(SESSION_KEY,JSON.stringify(safe));return safe;
  }
  async signIn(email,password){
    this.persist(null);
    try{
      const response=await this.fetchImpl(`${this.url}/auth/v1/token?grant_type=password`,{method:'POST',redirect:'error',cache:'no-store',headers:{apikey:this.key,'Content-Type':'application/json'},body:JSON.stringify({email:String(email||'').trim().toLowerCase(),password:String(password||'')}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw new Error('denied');
      const data=await response.json();
      if(!data?.access_token||!data?.user?.id)throw new Error('denied');
      return this.persist({accessToken:data.access_token,refreshToken:data.refresh_token,expiresAt:Date.now()+Math.max(30,Number(data.expires_in||3600))*1000,user:data.user});
    }catch(error){
      this.persist(null);
      const neutral=new Error('E-mail ou senha inválidos, ou acesso indisponível.');neutral.status=401;throw neutral;
    }
  }
  async signOut(){
    const token=this.accessToken();this.persist(null);
    if(token){try{await this.fetchImpl(`${this.url}/auth/v1/logout`,{method:'POST',headers:{apikey:this.key,Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(8000)});}catch{}}
  }
}

export {SESSION_KEY};
