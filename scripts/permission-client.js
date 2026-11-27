import assert from 'node:assert/strict';

export function permissionClient(send,base,passwords){
  const request=(path,options={})=>send(new Request(base+path,options));
  async function signIn(username){
    const response=await request('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password:passwords[username]})});
    assert.equal(response.status,200,'login '+username);
    const cookie=response.headers.get('set-cookie').split(';')[0];
    return async (path,method='GET',data)=>{
      const headers={Cookie:cookie};let body;
      if(data instanceof FormData)body=data;
      else if(data){headers['Content-Type']='application/json';body=JSON.stringify(data);}
      return request('/api/'+path,{method,headers,body});
    };
  }
  return {request,signIn};
}
