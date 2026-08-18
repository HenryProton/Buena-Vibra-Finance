import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

function sixDigits() { return crypto.randomInt(100000, 1000000).toString(); }
function maskEmail(email:string){const [u,d]=email.split('@');return u&&d?`${u.slice(0,2)}${'•'.repeat(Math.max(2,u.length-2))}@${d}`:'•••';}
function maskPhone(phone:string){const clean=phone.replace(/\s+/g,'');return `${'•'.repeat(Math.max(0,clean.length-4))}${clean.slice(-4)}`;}
function isPlaceholderEmail(email:string){return /@(app\.local|socio\.local|temp\.local)$/i.test(email);}

async function sendWhatsapp(to:string,body:string):Promise<boolean>{
  const accountSid=process.env.TWILIO_ACCOUNT_SID;
  const authToken=process.env.TWILIO_AUTH_TOKEN;
  const from=process.env.TWILIO_WHATSAPP_FROM;
  if(!accountSid||!authToken||!from)return false;
  const basic=Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const res=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({To:to.startsWith('whatsapp:')?to:`whatsapp:${to}`,From:from.startsWith('whatsapp:')?from:`whatsapp:${from}`,Body:body})});
  return res.ok;
}

export const requestRecoveryCode=createServerFn({method:'POST'}).inputValidator((input:{identifier:string})=>{const identifier=(input.identifier??'').trim();if(identifier.length<3||identifier.length>120)throw new Error('Dato inválido');return{identifier};}).handler(async({data})=>{
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const raw=data.identifier; let userId:string|null=null,email:string|null=null,phone:string|null=null,fullName:string|null=null;
  if(raw.includes('@')){const {data:list}=await supabaseAdmin.auth.admin.listUsers({page:1,perPage:1000});const found=list?.users.find(u=>(u.email??'').toLowerCase()===raw.toLowerCase());if(found){userId=found.id;email=found.email??null;}}
  else {const digits=raw.replace(/\D/g,'');if(digits.length>=5){const {data:profs}=await supabaseAdmin.from('profiles').select('id,full_name,phone,cedula').or(`phone.ilike.%${digits}%,cedula.ilike.%${digits}%`).limit(2);const prof=profs?.[0];if(prof){userId=prof.id;phone=prof.phone;fullName=prof.full_name;const {data:u}=await supabaseAdmin.auth.admin.getUserById(prof.id);email=u.user?.email??null;}}}
  // Do not reveal whether an account exists to unauthenticated callers.
  if(!userId)return{ok:true,found:true,channel:'email',hint:'',message:'Si los datos corresponden a una cuenta, recibirás instrucciones para recuperar el acceso.'};
  if(!fullName){const {data:prof}=await supabaseAdmin.from('profiles').select('full_name,phone').eq('id',userId).maybeSingle();fullName=prof?.full_name??null;phone=phone??prof?.phone??null;}
  const realEmail=email&&!isPlaceholderEmail(email)?email:null;const channel: 'email'|'whatsapp' = realEmail?'email':'whatsapp';const destination=realEmail??phone;
  if(!destination)return{ok:true,found:true,channel:'email',hint:'',message:'Si los datos corresponden a una cuenta, recibirás instrucciones para recuperar el acceso.'};
  const code=sixDigits();
  await supabaseAdmin.from('recovery_requests' as never).insert({user_id:userId,identifier:raw,channel,code,full_name:fullName,destination,delivered:false} as never);
  let delivered=false;
  if(channel==='whatsapp')delivered=await sendWhatsapp(destination,`Buena Vibra Finance: tu código de recuperación es ${code}. Vence en 20 minutos. Si no lo solicitaste, ignora este mensaje.`);
  else {const site=process.env.SITE_URL;if(site){const {error}=await supabaseAdmin.auth.resetPasswordForEmail(destination,{redirectTo:`${site}/reset-password`});delivered=!error;}}
  if(delivered)await supabaseAdmin.from('recovery_requests' as never).update({delivered:true} as never).eq('code',code).eq('user_id',userId);
  return{ok:true,found:true,channel,hint:channel==='email'?maskEmail(destination):maskPhone(destination),message:channel==='email'?'Te enviamos un enlace seguro al correo registrado.':delivered?'Te enviamos un código por WhatsApp.':'No fue posible enviar el código automáticamente. Contacta al administrador.'};
});

export const verifyRecoveryCode=createServerFn({method:'POST'}).inputValidator((input:{identifier:string;code:string;new_password:string})=>{const identifier=(input.identifier??'').trim(),code=(input.code??'').trim(),new_password=input.new_password??'';if(!identifier||!/^[0-9]{6}$/.test(code)||new_password.length<6||new_password.length>72)throw new Error('Datos de recuperación inválidos');return{identifier,code,new_password};}).handler(async({data})=>{
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {data:reqs}=await supabaseAdmin.from('recovery_requests' as never).select('id,user_id,code,expires_at,attempts').eq('identifier',data.identifier).is('used_at',null).order('created_at',{ascending:false}).limit(1);
  const req=(reqs??[])[0] as any;if(!req)throw new Error('Solicitud no encontrada. Pide un código nuevo.');if(req.attempts>=5)throw new Error('Demasiados intentos. Pide un código nuevo.');if(new Date(req.expires_at).getTime()<Date.now())throw new Error('El código venció. Pide uno nuevo.');
  if(req.code!==data.code){await supabaseAdmin.from('recovery_requests' as never).update({attempts:req.attempts+1} as never).eq('id',req.id);throw new Error('Código incorrecto');}
  const {error}=await supabaseAdmin.auth.admin.updateUserById(req.user_id,{password:data.new_password});if(error)throw new Error(error.message);
  await supabaseAdmin.from('recovery_requests' as never).update({used_at:new Date().toISOString()} as never).eq('id',req.id);
  const {data:u}=await supabaseAdmin.auth.admin.getUserById(req.user_id);const {data:prof}=await supabaseAdmin.from('profiles').select('full_name').eq('id',req.user_id).maybeSingle();
  return{ok:true,email:u.user?.email??'',full_name:prof?.full_name??null,placeholder:!!u.user?.email&&isPlaceholderEmail(u.user.email)};
});

export const adminListRecoveryRequests=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).handler(async({context})=>{
  const {data:isAdmin}=await context.supabase.rpc('has_role',{_user_id:context.userId,_role:'admin'});if(!isAdmin)throw new Error('Solo el Administrador Principal');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');const {data,error}=await supabaseAdmin.from('recovery_requests' as never).select('id,identifier,channel,code,full_name,destination,delivered,used_at,expires_at,created_at').is('used_at',null).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(30);if(error)throw new Error(error.message);return data??[];
});
