'use strict';
const express = require('express');
const crypto = require('node:crypto');

const RESOURCE_DEFS = Object.freeze({
 'soap-notes':{type:'soap',permission:'records.read',write:'records.write',professional:true,required:['patientCpf','subjective','objective','assessment','plan','diagnosisSystem','diagnosisCode'],allowed:['patientCpf','subjective','objective','assessment','plan','diagnosisSystem','diagnosisCode','diagnosisDescription','familyHistory','medicationsInUse','allergiesReviewed','recordedAt']},
 'vital-signs':{type:'vitals',permission:'records.read',write:'records.write',professional:true,required:['patientCpf','recordedAt'],allowed:['patientCpf','recordedAt','systolic','diastolic','temperatureC','heartRate','respiratoryRate','oxygenSaturation','glucose','weightKg','heightCm','notes']},
 diagnoses:{type:'diagnosis',permission:'records.read',write:'records.write',professional:true,required:['patientCpf','system','code','description'],allowed:['patientCpf','system','code','description','recordedAt']},
 prescriptions:{type:'prescription',permission:'prescriptions.read',write:'prescriptions.write',professional:true,required:['patientCpf','medicationCode','medicationName','dose','route','frequency','quantity'],allowed:['patientCpf','medicationCode','medicationName','dose','route','frequency','duration','quantity','instructions','diagnosisCode','catalogVersion']},
 'exam-orders':{type:'exam_order',permission:'exams.read',write:'exams.write',professional:true,required:['patientCpf','code','label','modality'],allowed:['patientCpf','code','label','modality','clinicalJustification','priority','requestedAt','catalogVersion']},
 documents:{type:'document',permission:'records.read',write:'records.write',professional:true,required:['patientCpf','documentType','content'],allowed:['patientCpf','documentType','content','cidCode','issuedAt','validUntil','notes']},
 hospitalizations:{type:'hospitalization',permission:'hospitalizations.read',write:'hospitalizations.write',professional:true,required:['patientCpf','bedCode','admissionReason'],allowed:['patientCpf','bedCode','admissionReason','attendingProfessional','admittedAt','diet','careNotes']},
 discharges:{type:'discharge',permission:'hospitalizations.read',write:'hospitalizations.write',professional:true,required:['patientCpf','hospitalizationId','summary','instructions'],allowed:['patientCpf','hospitalizationId','summary','medicationReconciliation','instructions','followUp','dischargedAt']},
 'maternal-child':{type:'maternal_child',permission:'maternal.read',write:'maternal.write',professional:true,required:['patientCpf','kind','recordedAt'],allowed:['patientCpf','kind','recordedAt','gestationalAgeWeeks','lastMenstrualPeriod','estimatedDueDate','prenatalVisit','fundalHeightCm','fetalHeartRate','weightKg','childAgeMonths','heightCm','headCircumferenceCm','developmentNotes']},
 'chronic-care':{type:'chronic_care',permission:'chronic.read',write:'chronic.write',professional:true,required:['patientCpf','condition','recordedAt'],allowed:['patientCpf','condition','recordedAt','measurements','medicationReview','carePlan','nextReviewAt']},
 immunizations:{type:'immunization',permission:'immunizations.read',write:'immunizations.write',professional:true,required:['patientCpf','vaccine','dose','lot','manufacturer','administeredAt'],allowed:['patientCpf','vaccine','dose','lot','manufacturer','administeredAt','site','vaccinator','nextDoseAt']},
 referrals:{type:'referral',permission:'referrals.read',write:'referrals.write',professional:true,required:['patientCpf','destination','specialty','reason','priority'],allowed:['patientCpf','destination','destinationCnes','specialty','reason','priority','requestedAt','clinicalSummary']},
 notifications:{type:'notification',permission:'records.read',write:'notifications.write',professional:true,required:['patientCpf','diseaseCode','caseDate'],allowed:['patientCpf','diseaseCode','caseDate','notificationType','epidemiologicalNotes','status']},
 billing:{type:'billing',permission:'billing.read',write:'billing.write',professional:false,required:['instrument','competence','sigtapCode','cboCode','cidCode'],allowed:['patientCpf','instrument','competence','sigtapCode','cboCode','cidCode','quantity','professionalCns','cnes','authorizationNumber']},
 'nursing-evolutions':{type:'nursing_evolution',permission:'records.read',write:'nursing.write',professional:true,required:['patientCpf','assessment','interventions','recordedAt'],allowed:['patientCpf','assessment','interventions','response','carePlan','recordedAt']},
 'exam-results':{type:'exam_result',permission:'exams.read',write:'exams.results.write',professional:true,required:['patientCpf','examRecordId','result','releasedAt'],allowed:['patientCpf','examRecordId','result','releasedAt','reportingProfessional']},
 'care-plans':{type:'care_plan',permission:'records.read',write:'careplans.write',professional:true,required:['patientCpf','goals','interventions','reviewAt'],allowed:['patientCpf','goals','interventions','reviewAt','responsibleTeam']}
});
const CPF_RE=/^\d{11}$/, CNS_RE=/^\d{15}$/, CBO_RE=/^\d{6}$/;
const DATE_RE=/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
function normalizeCpf(value){return String(value||'').replace(/\D/g,'');}
function validCpf(value){
 const cpf=normalizeCpf(value);if(!/^\d{11}$/.test(cpf)||/^([0-9])\1{10}$/.test(cpf))return false;
 const digit=(base)=>{let sum=0;for(let i=0;i<base.length;i++)sum+=Number(base[i])*(base.length+1-i);const mod=(sum*10)%11;return mod===10?0:mod;};
 return digit(cpf.slice(0,9))===Number(cpf[9])&&digit(cpf.slice(0,10))===Number(cpf[10]);
}
function validateResourcePayload(key,input){
 const def=RESOURCE_DEFS[key]; if(!def)return{ok:false,error:'Recurso não reconhecido.'};
 if(!input||typeof input!=='object'||Array.isArray(input))return{ok:false,error:'O corpo deve ser um objeto JSON.'};
 const data={}; for(const field of def.allowed)if(input[field]!==undefined&&input[field]!==null&&input[field]!=='')data[field]=input[field];
 const missing=def.required.filter(field=>data[field]===undefined||data[field]==='');
 if(missing.length)return{ok:false,error:'Campos obrigatórios ausentes: '+missing.join(', '),missing};
 if(data.patientCpf!==undefined){data.patientCpf=normalizeCpf(data.patientCpf);if(!CPF_RE.test(data.patientCpf))return{ok:false,error:'CPF deve conter 11 dígitos.'};}
 for(const k of ['diagnosisSystem','system'])if(data[k]&&!['CID-10','CIAP-2'].includes(String(data[k]).toUpperCase()))return{ok:false,error:'Sistema diagnóstico deve ser CID-10 ou CIAP-2.'};
 if(data.instrument&&!['BPA-C','BPA-I','AIH','APAC'].includes(data.instrument))return{ok:false,error:'Instrumento de faturamento inválido.'};
 if(data.competence&&!/^\d{6}$/.test(String(data.competence)))return{ok:false,error:'Competência deve estar no formato AAAAMM.'};
 if(data.priority&&!['routine','urgent','high','emergency'].includes(String(data.priority).toLowerCase()))return{ok:false,error:'Prioridade inválida.'};
 for(const k of ['recordedAt','administeredAt','caseDate','requestedAt','issuedAt','reviewAt','admittedAt','dischargedAt','lastMenstrualPeriod','estimatedDueDate','nextDoseAt'])if(data[k]&&!DATE_RE.test(String(data[k])))return{ok:false,error:'Data inválida em '+k+'.'};
 for(const k of ['systolic','diastolic','temperatureC','heartRate','respiratoryRate','oxygenSaturation','glucose','weightKg','heightCm','gestationalAgeWeeks','fetalHeartRate','childAgeMonths','headCircumferenceCm','quantity'])if(data[k]!==undefined&&(!Number.isFinite(Number(data[k]))||Number(data[k])<0))return{ok:false,error:'Valor numérico inválido em '+k+'.'};
 if(data.oxygenSaturation!==undefined&&Number(data.oxygenSaturation)>100)return{ok:false,error:'Saturação deve estar entre 0 e 100.'};
 if(key==='prescriptions'&&Number(data.quantity)<=0)return{ok:false,error:'Quantidade prescrita deve ser maior que zero.'};
 if(key==='vital-signs'&&!['systolic','diastolic','temperatureC','heartRate','respiratoryRate','oxygenSaturation','glucose','weightKg','heightCm'].some(k=>data[k]!==undefined))return{ok:false,error:'Informe ao menos uma medida observada.'};
 if(data.kind&&!['prenatal','puericulture'].includes(data.kind))return{ok:false,error:'Tipo deve ser prenatal ou puericulture.'};
 for(const k of ['diagnosisSystem','system'])if(data[k])data[k]=String(data[k]).toUpperCase();
 return{ok:true,data};
}
function createClinicalPlatformRouter({requirePermission,getPool,usingPostgres}){
 const router=express.Router();
 const unitOf=req=>String(req.user?.unit||req.user?.unidade||'').trim();
 const actorOf=req=>({username:String(req.user?.usuario||req.user?.username||'unknown'),role:String(req.user?.role||req.user?.tipo||'unknown'),unit:unitOf(req)});
 function ensureUnit(req,res){if(!unitOf(req)){res.status(403).json({erro:'Conta sem unidade vinculada. Vincule a conta a uma unidade antes de acessar dados clínicos.',codigo:'UNIT_SCOPE_REQUIRED'});return false;}return true;}
 function unavailable(res){return res.status(503).json({erro:'A plataforma clínica exige PostgreSQL e a migração 20261112_clinical_platform.sql.',codigo:'CLINICAL_PLATFORM_SCHEMA_UNAVAILABLE'});}
 async function audit(req,client,action,type,id,cpf,metadata={}){
  const a=actorOf(req), auditUnit=a.unit||'platform', hash=cpf?crypto.createHash('sha256').update(String(cpf)).digest('hex'):null;
  await client.query('INSERT INTO clinical_audit_events(actor_username,actor_role,unit_id,action,resource_type,resource_id,patient_ref_hash,request_id,ip_address,user_agent,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
   [a.username,a.role,auditUnit,action,type,id||null,hash,req.get('x-request-id')||null,req.ip||null,String(req.get('user-agent')||'').slice(0,300),JSON.stringify(metadata)]);
 }
 async function officialCodeState(client,catalog,code){
  const count=await client.query('SELECT COUNT(*)::int AS count FROM official_catalog_entries WHERE catalog=$1',[catalog]);
  if(!count.rows[0].count)return{loaded:false,valid:false};
  const match=await client.query('SELECT 1 FROM official_catalog_entries WHERE catalog=$1 AND code=$2 AND (effective_from IS NULL OR effective_from<=CURRENT_DATE) AND (effective_to IS NULL OR effective_to>=CURRENT_DATE) LIMIT 1',[catalog,String(code)]);
  return{loaded:true,valid:!!match.rowCount};
 }
 async function requireProfessional(req,client){
  const a=actorOf(req),r=await client.query('SELECT pr.id,pr.cns,pr.cbo,pr.unit_id FROM users u JOIN professional_registry pr ON pr.user_id=u.id WHERE u.username=$1 AND pr.active=TRUE AND pr.unit_id=$2',[a.username,a.unit]);
  return r.rows[0]||null;
 }
 router.get('/api/v1/health',(req,res)=>res.json({api:'v1',status:'ok',storage:usingPostgres()?'postgresql':'not-configured'}));
 router.get('/api/v1/patients',requirePermission('patients.read'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const limit=Math.min(100,Math.max(1,Number.parseInt(req.query.limit,10)||50));
  try{const r=await getPool().query('SELECT id,name,cpf,cns,birth_date,status,created_at FROM patients WHERE unit_id=$1 ORDER BY id DESC LIMIT $2',[unitOf(req),limit]);return res.json({items:r.rows});}
  catch(e){return next(e);}
 });
 router.post('/api/v1/patients',requirePermission('patients.write'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);const b=req.body||{};
  const cpf=normalizeCpf(b.cpf),cns=String(b.cns||'').replace(/\D/g,'');
  if(!String(b.name||'').trim()||!validCpf(cpf)||(cns&&!CNS_RE.test(cns)))return res.status(400).json({erro:'Nome, CPF válido e CNS com 15 dígitos (quando disponível) são obrigatórios.'});
  if(b.birthDate&&!/^\d{4}-\d{2}-\d{2}$/.test(String(b.birthDate)))return res.status(400).json({erro:'Data de nascimento inválida.'});
  try{const r=await getPool().query('INSERT INTO patients(name,cpf,cns,birth_date,sex_at_birth,gender_identity,race_color,mother_name,municipality_code,cnes_origin,unit_id,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,name,cpf,cns,birth_date,status,created_at',
   [String(b.name).trim(),cpf,cns||null,b.birthDate||null,b.sexAtBirth||null,b.genderIdentity||null,b.raceColor||null,b.motherName||null,b.municipalityCode||null,b.cnesOrigin||null,unitOf(req),'triagem']);
   const client=await getPool().connect();try{await audit(req,client,'create','patient_identity',r.rows[0].id,cpf,{source:'patient-registration'});}finally{client.release();}
   return res.status(201).json({patient:r.rows[0]});
  }catch(e){if(e.code==='23505')return res.status(409).json({erro:'CPF ou CNS já cadastrado.',codigo:'PATIENT_IDENTIFIER_CONFLICT'});return next(e);}
 });
 router.get('/api/v1/catalogs/:catalog',requirePermission('clinical.catalogs.read'),async(req,res,next)=>{
  const catalog=String(req.params.catalog||'').toUpperCase();if(!['CID10','CIAP2','SIGTAP','RENAME','CBO','CNES'].includes(catalog))return res.status(400).json({erro:'Catálogo inválido.'});
  if(!usingPostgres())return unavailable(res);
  try{const r=await getPool().query('SELECT code,label,source_version,effective_from,effective_to,metadata FROM official_catalog_entries WHERE catalog=$1 AND (effective_from IS NULL OR effective_from<=CURRENT_DATE) AND (effective_to IS NULL OR effective_to>=CURRENT_DATE) ORDER BY code LIMIT 500',[catalog]);
   if(!r.rowCount)return res.status(503).json({erro:'Catálogo oficial ainda não foi importado. Nenhum código foi presumido.',codigo:'OFFICIAL_CATALOG_NOT_LOADED',catalog});
   return res.json({catalog,count:r.rowCount,items:r.rows});
  }catch(e){return next(e);}
 });
 router.get('/api/v1/integrations/status',requirePermission('integration.manage'),async(req,res,next)=>{
  if(!usingPostgres())return unavailable(res);
  try{const r=await getPool().query('SELECT provider,enabled,endpoint_configured,credentials_configured,homologated,last_verified_at FROM external_integration_registry ORDER BY provider');return res.json({integrations:r.rows});}
  catch(e){return next(e);}
 });
 router.get('/api/v1/patient-identities',requirePermission('patients.identity.read'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const cpf=normalizeCpf(req.query.identifier||''),cns=String(req.query.cns||'').replace(/\D/g,'');
  if(!cpf&&!cns)return res.status(400).json({erro:'Informe CPF ou CNS para a busca.'});
  if(cpf&&!CPF_RE.test(cpf))return res.status(400).json({erro:'CPF inválido.'});
  if(cns&&!CNS_RE.test(cns))return res.status(400).json({erro:'CNS deve conter 15 dígitos.'});
  const client=await getPool().connect();
  try{const r=await client.query('SELECT id,name,cpf,cns,birth_date,sex_at_birth,gender_identity,race_color,mother_name,municipality_code,cnes_origin FROM patients WHERE unit_id=$3 AND (($1::text IS NOT NULL AND cpf=$1) OR ($2::text IS NOT NULL AND cns=$2)) LIMIT 2',[cpf||null,cns||null,unitOf(req)]);
   for(const patient of r.rows)await audit(req,client,'read','patient_identity',patient.id,patient.cpf,{source:'patient-identity-search'});
   return res.json({patients:r.rows});
  }catch(e){return next(e);}finally{client.release();}
});
router.post('/api/v1/patient-identities',requirePermission('patients.identity.write'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const cpf=normalizeCpf(req.body?.cpf),cns=String(req.body?.cns||'').replace(/\D/g,'');
  if(!validCpf(cpf)||(cns&&!CNS_RE.test(cns)))return res.status(400).json({erro:'CPF ou CNS em formato inválido.'});
  const b=req.body||{};if(b.birthDate&&!/^\d{4}-\d{2}-\d{2}$/.test(String(b.birthDate)))return res.status(400).json({erro:'Data de nascimento inválida.'});
  const client=await getPool().connect();
  try{await client.query('BEGIN');
   const r=await client.query("UPDATE patients SET name=COALESCE($2,name),cns=COALESCE(NULLIF($3,''),cns),birth_date=COALESCE($4::date,birth_date),sex_at_birth=COALESCE($5,sex_at_birth),gender_identity=COALESCE($6,gender_identity),race_color=COALESCE($7,race_color),mother_name=COALESCE($8,mother_name),municipality_code=COALESCE($9,municipality_code),cnes_origin=COALESCE($10,cnes_origin),updated_at=NOW() WHERE cpf=$1 AND unit_id=$11 RETURNING id,name,cpf,cns,birth_date",
    [cpf,b.name||null,cns||null,b.birthDate||null,b.sexAtBirth||null,b.genderIdentity||null,b.raceColor||null,b.motherName||null,b.municipalityCode||null,b.cnesOrigin||null,unitOf(req)]);
   if(!r.rowCount){await client.query('ROLLBACK');return res.status(404).json({erro:'Paciente não encontrado. Cadastre o paciente pela recepção antes de completar a identidade.'});}
   await audit(req,client,'create','patient_identity',r.rows[0].id,cpf,{fields:['name','cns','birthDate','sexAtBirth','genderIdentity','raceColor','motherName','municipalityCode','cnesOrigin'].filter(k=>b[k]!==undefined)});
   await client.query('COMMIT');return res.status(201).json({patient:r.rows[0]});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({erro:'CPF ou CNS já vinculado a outro cadastro.',codigo:'IDENTIFIER_CONFLICT'});return next(e);}
  finally{client.release();}
 });
 router.post('/api/v1/professional-registry',requirePermission('professionals.registry.write'),async(req,res,next)=>{
  if(!usingPostgres())return unavailable(res);const b=req.body||{};
  if(!Number.isInteger(Number(b.userId))||Number(b.userId)<1||!CNS_RE.test(String(b.cns||''))||!CBO_RE.test(String(b.cbo||''))||!String(b.unitId||'').trim())return res.status(400).json({erro:'Informe usuário, CNS de 15 dígitos, CBO de 6 dígitos e unidade.'});
  const client=await getPool().connect();
  try{await client.query('BEGIN');
   const cboState=await officialCodeState(client,'CBO',String(b.cbo));
   if(!cboState.loaded){await client.query('ROLLBACK');return res.status(503).json({erro:'Catálogo CBO oficial ainda não foi importado.',codigo:'OFFICIAL_CATALOG_NOT_LOADED',catalog:'CBO'});}
   if(!cboState.valid){await client.query('ROLLBACK');return res.status(400).json({erro:'CBO não encontrado no catálogo oficial vigente.'});}
   const r=await client.query('INSERT INTO professional_registry(user_id,cns,cbo,unit_id,council_type,council_number,council_state,cnes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id) DO UPDATE SET cns=EXCLUDED.cns,cbo=EXCLUDED.cbo,unit_id=EXCLUDED.unit_id,council_type=EXCLUDED.council_type,council_number=EXCLUDED.council_number,council_state=EXCLUDED.council_state,cnes=EXCLUDED.cnes,active=TRUE,updated_at=NOW() RETURNING id,user_id,cns,cbo,unit_id,active',
    [Number(b.userId),String(b.cns),String(b.cbo),String(b.unitId).trim(),b.councilType||null,b.councilNumber||null,b.councilState||null,b.cnes||null]);
   await audit(req,client,'create','professional_registry',r.rows[0].id,null,{userId:Number(b.userId),unitId:String(b.unitId),cbo:String(b.cbo)});
   await client.query('COMMIT');return res.status(201).json({professional:r.rows[0]});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
});
router.get('/api/v1/appointments',requirePermission('appointments.read'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const client=await getPool().connect();
  try{const r=await client.query('SELECT a.id,a.patient_cpf,p.name AS patient_name,a.appointment_type,a.scheduled_at,a.professional,a.specialty,a.status,a.appointment_mode,a.created_at FROM appointments a JOIN patients p ON p.cpf=a.patient_cpf WHERE a.unit_id=$1 ORDER BY a.scheduled_at DESC NULLS LAST,a.id DESC LIMIT 100',[unitOf(req)]);
   for(const item of r.rows)await audit(req,client,'read','appointment',item.id,item.patient_cpf,{status:item.status});
   return res.json({items:r.rows});
  }catch(e){return next(e);}finally{client.release();}
});
router.post('/api/v1/appointments',requirePermission('appointments.manage'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const b=req.body||{},cpf=normalizeCpf(b.patientCpf);
  if(!CPF_RE.test(cpf)||!String(b.appointmentType||'').trim()||!DATE_RE.test(String(b.scheduledAt||'')))return res.status(400).json({erro:'Paciente, tipo de atendimento e data/hora válidos são obrigatórios.'});
  try{const patient=await getPool().query('SELECT name FROM patients WHERE cpf=$1 AND unit_id=$2',[cpf,unitOf(req)]);if(!patient.rowCount)return res.status(404).json({erro:'Paciente não encontrado nesta unidade.'});
   const r=await getPool().query('INSERT INTO appointments(patient_cpf,patient_name,appointment_type,scheduled_at,professional,specialty,status,appointment_mode,created_by,unit_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id,patient_cpf,patient_name,appointment_type,scheduled_at,professional,specialty,status,appointment_mode,created_at',
    [cpf,patient.rows[0].name,String(b.appointmentType).slice(0,120),b.scheduledAt,b.professional||null,b.specialty||null,'scheduled',b.appointmentMode||'in_person',actorOf(req).username,unitOf(req)]);
   const client=await getPool().connect();try{await audit(req,client,'create','appointment',r.rows[0].id,cpf,{status:'scheduled'});}finally{client.release();}
   return res.status(201).json({appointment:r.rows[0]});
  }catch(e){return next(e);}
});
router.post('/api/v1/appointments/:id/status',requirePermission('appointments.manage'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const id=Number(req.params.id),status=String(req.body?.status||'');
  if(!Number.isSafeInteger(id)||id<1||!['scheduled','confirmed','checked_in','in_progress','completed','cancelled','no_show'].includes(status))return res.status(400).json({erro:'ID ou status de agendamento inválido.'});
  const client=await getPool().connect();
  try{await client.query('BEGIN');
   const old=await client.query('SELECT id,patient_cpf,status FROM appointments WHERE id=$1 AND unit_id=$2 FOR UPDATE',[id,unitOf(req)]);
   if(!old.rowCount){await client.query('ROLLBACK');return res.status(404).json({erro:'Agendamento não encontrado nesta unidade.'});}
   const transitions={scheduled:['confirmed','checked_in','cancelled','no_show'],confirmed:['checked_in','cancelled','no_show'],checked_in:['in_progress','cancelled'],in_progress:['completed'],completed:[],cancelled:[],no_show:[]};
   if(!(transitions[old.rows[0].status]||[]).includes(status)){await client.query('ROLLBACK');return res.status(409).json({erro:'Transição de estado não permitida.',codigo:'INVALID_APPOINTMENT_TRANSITION'});}
   const r=await client.query('UPDATE appointments SET status=$1 WHERE id=$2 RETURNING id,status',[status,id]);
   await audit(req,client,'update','appointment_status',id,old.rows[0].patient_cpf,{previous:old.rows[0].status,next:status});
   await client.query('COMMIT');return res.json({appointment:r.rows[0]});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
});
router.get('/api/v1/bed-map',requirePermission('beds.read'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const client=await getPool().connect();
  try{const r=await client.query('SELECT b.id,b.code,b.status,b.patient_cpf,b.patient_name,b.occupied_since,w.name AS ward FROM beds b LEFT JOIN wards w ON w.id=b.ward_id WHERE b.unit_id=$1 ORDER BY w.name,b.code',[unitOf(req)]);
   for(const item of r.rows)if(item.patient_cpf)await audit(req,client,'read','bed_map',item.id,item.patient_cpf,{code:item.code});
   return res.json({items:r.rows});
  }catch(e){return next(e);}finally{client.release();}
});
router.post('/api/v1/beds',requirePermission('beds.manage'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const code=String(req.body?.code||'').trim(),ward=String(req.body?.ward||'').trim();
  if(!code||!ward)return res.status(400).json({erro:'Código do leito e ala são obrigatórios.'});
  const client=await getPool().connect();
  try{await client.query('BEGIN');
   const w=await client.query('INSERT INTO wards(name,unit_id) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET unit_id=COALESCE(wards.unit_id,EXCLUDED.unit_id) RETURNING id,unit_id',[ward,unitOf(req)]);
   if(w.rows[0].unit_id!==unitOf(req)){await client.query('ROLLBACK');return res.status(409).json({erro:'Ala vinculada a outra unidade.'});}
    const r=await client.query('INSERT INTO beds(code,ward_id,status,unit_id) VALUES($1,$2,$3,$4) RETURNING id,code,status,unit_id',[code,w.rows[0].id,'free',unitOf(req)]);
   await audit(req,client,'create','bed',r.rows[0].id,null,{code,ward});await client.query('COMMIT');return res.status(201).json({bed:r.rows[0]});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});if(e.code==='23505')return res.status(409).json({erro:'Código de leito já cadastrado.'});return next(e);}
  finally{client.release();}
 });
 router.get('/api/v1/hospitalizations',requirePermission('hospitalizations.read'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const client=await getPool().connect();
  try{const r=await client.query('SELECT id,patient_cpf,patient_name,bed_code,reason,doctor,admitted_at,discharged_at FROM hospitalizations WHERE unit_id=$1 ORDER BY admitted_at DESC LIMIT 100',[unitOf(req)]);
   for(const item of r.rows)await audit(req,client,'read','hospitalization',item.id,item.patient_cpf,{discharged:!!item.discharged_at});
   return res.json({items:r.rows});
  }catch(e){return next(e);}finally{client.release();}
});
router.post('/api/v1/hospitalizations',requirePermission('hospitalizations.write'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const v=validateResourcePayload('hospitalizations',req.body);if(!v.ok)return res.status(400).json({erro:v.error,campos:v.missing||[]});
  const data=v.data,actor=actorOf(req),client=await getPool().connect();
  try{await client.query('BEGIN');
   const patient=await client.query('SELECT cpf,name FROM patients WHERE cpf=$1 AND unit_id=$2',[data.patientCpf,unitOf(req)]);
   if(!patient.rowCount){await client.query('ROLLBACK');return res.status(404).json({erro:'Paciente não encontrado nesta unidade.'});}
   if(!await requireProfessional(req,client)){await client.query('ROLLBACK');return res.status(409).json({erro:'Vínculo profissional CNS/CBO obrigatório.',codigo:'PROFESSIONAL_REGISTRATION_REQUIRED'});}
   const bed=await client.query('SELECT id,code,status FROM beds WHERE code=$1 AND unit_id=$2 FOR UPDATE',[data.bedCode,unitOf(req)]);
   if(!bed.rowCount||!['free','livre'].includes(String(bed.rows[0].status).toLowerCase())){await client.query('ROLLBACK');return res.status(409).json({erro:'Leito inexistente ou indisponível nesta unidade.',codigo:'BED_NOT_AVAILABLE'});}
   const admission=await client.query('INSERT INTO hospitalizations(patient_cpf,patient_name,bed_code,reason,doctor,admitted_at,unit_id) VALUES($1,$2,$3,$4,$5,COALESCE($6::timestamptz,NOW()),$7) RETURNING id,patient_cpf,patient_name,bed_code,reason,admitted_at',
    [data.patientCpf,patient.rows[0].name,data.bedCode,data.admissionReason,data.attendingProfessional||actor.username,data.admittedAt||null,unitOf(req)]);
    await client.query('UPDATE beds SET status=$1,patient_cpf=NULL,patient_name=NULL,occupied_since=NULL WHERE code=$2 AND unit_id=$3',['free',h.rows[0].bed_code,unitOf(req)]);
   const record=await client.query('INSERT INTO clinical_records(resource_type,patient_cpf,unit_id,status,data,created_by,created_by_role) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at',
    ['hospitalization',data.patientCpf,unitOf(req),'admitted',JSON.stringify({...data,hospitalizationId:admission.rows[0].id}),actor.username,actor.role]);
   await audit(req,client,'create','hospitalization',record.rows[0].id,data.patientCpf,{hospitalizationId:admission.rows[0].id,bedCode:data.bedCode});
   await client.query('COMMIT');return res.status(201).json({hospitalization:admission.rows[0],record:record.rows[0]});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
 });
 router.post('/api/v1/discharges',requirePermission('hospitalizations.write'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const v=validateResourcePayload('discharges',req.body);if(!v.ok)return res.status(400).json({erro:v.error,campos:v.missing||[]});
   const data=v.data,actor=actorOf(req);
   if(!Number.isSafeInteger(Number(data.hospitalizationId))||Number(data.hospitalizationId)<1)return res.status(400).json({erro:'ID da internação inválido.'});
   const client=await getPool().connect();
  try{await client.query('BEGIN');
   const h=await client.query('SELECT id,patient_cpf,bed_code FROM hospitalizations WHERE id=$1 AND patient_cpf=$2 AND unit_id=$3 AND discharged_at IS NULL FOR UPDATE',[Number(data.hospitalizationId),data.patientCpf,unitOf(req)]);
   if(!h.rowCount){await client.query('ROLLBACK');return res.status(404).json({erro:'Internação ativa não encontrada nesta unidade.'});}
   if(!await requireProfessional(req,client)){await client.query('ROLLBACK');return res.status(409).json({erro:'Vínculo profissional CNS/CBO obrigatório.',codigo:'PROFESSIONAL_REGISTRATION_REQUIRED'});}
   await client.query('UPDATE hospitalizations SET discharged_at=COALESCE($1::timestamptz,NOW()) WHERE id=$2',[data.dischargedAt||null,h.rows[0].id]);
    await client.query('UPDATE beds SET status=$1,patient_cpf=NULL,patient_name=NULL,occupied_since=NULL WHERE code=$2 AND unit_id=$3',['free',h.rows[0].bed_code,unitOf(req)]);
   const r=await client.query('INSERT INTO clinical_records(resource_type,patient_cpf,unit_id,status,data,created_by,created_by_role) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at',
    ['discharge',data.patientCpf,unitOf(req),'discharged',JSON.stringify(data),actor.username,actor.role]);
   await audit(req,client,'create','discharge',r.rows[0].id,data.patientCpf,{hospitalizationId:h.rows[0].id,bedCode:h.rows[0].bed_code});
   await client.query('COMMIT');return res.status(201).json({discharge:r.rows[0]});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
 });
 router.get('/api/v1/patient-consents',requirePermission('patients.identity.read'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const cpf=normalizeCpf(req.query.cpf||'');if(!validCpf(cpf))return res.status(400).json({erro:'Informe CPF válido.'});
  const client=await getPool().connect();
  try{const r=await client.query('SELECT id,patient_cpf,purpose,legal_basis,status,recorded_by,recorded_at,expires_at,evidence_ref FROM patient_consents WHERE patient_cpf=$1 AND unit_id=$2 ORDER BY recorded_at DESC LIMIT 100',[cpf,unitOf(req)]);
   await audit(req,client,'read','patient_consent',null,cpf,{count:r.rowCount});
   return res.json({items:r.rows,appendOnly:true});
  }catch(e){return next(e);}finally{client.release();}
});
router.post('/api/v1/patient-consents',requirePermission('patients.identity.write'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const b=req.body||{},cpf=normalizeCpf(b.patientCpf);
  if(!validCpf(cpf)||!String(b.purpose||'').trim()||!String(b.legalBasis||'').trim()||!['granted','revoked','expired'].includes(b.status))return res.status(400).json({erro:'Paciente, finalidade, base legal e status válidos são obrigatórios.'});
  const client=await getPool().connect();
  try{await client.query('BEGIN');
   const patient=await client.query('SELECT id FROM patients WHERE cpf=$1 AND unit_id=$2',[cpf,unitOf(req)]);
   if(!patient.rowCount){await client.query('ROLLBACK');return res.status(404).json({erro:'Paciente não encontrado nesta unidade.'});}
   const r=await client.query('INSERT INTO patient_consents(patient_cpf,unit_id,purpose,legal_basis,status,recorded_by,expires_at,evidence_ref) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,patient_cpf,purpose,legal_basis,status,recorded_at',
    [cpf,unitOf(req),String(b.purpose).slice(0,300),String(b.legalBasis).slice(0,100),b.status,actorOf(req).username,b.expiresAt||null,b.evidenceRef||null]);
   await audit(req,client,'create','patient_consent',r.rows[0].id,cpf,{status:b.status,purpose:String(b.purpose).slice(0,100)});
   await client.query('COMMIT');return res.status(201).json({consent:r.rows[0],appendOnly:true});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
});
router.post('/api/v1/catalogs/:catalog/import',requirePermission('integration.manage'),async(req,res,next)=>{
  if(!usingPostgres())return unavailable(res);
  const catalog=String(req.params.catalog||'').toUpperCase(),b=req.body||{};
  if(!['CID10','CIAP2','SIGTAP','RENAME','CBO','CNES'].includes(catalog)||!String(b.sourceVersion||'').trim()||!Array.isArray(b.entries)||b.entries.length<1||b.entries.length>5000)return res.status(400).json({erro:'Catálogo, versão da fonte e lista de 1 a 5000 entradas são obrigatórios.'});
  for(const entry of b.entries)if(!String(entry.code||'').trim()||!String(entry.label||'').trim())return res.status(400).json({erro:'Cada entrada precisa de código e descrição.'});
  const client=await getPool().connect();
  try{await client.query('BEGIN');let count=0;
   for(const entry of b.entries){await client.query('INSERT INTO official_catalog_entries(catalog,code,label,source_version,effective_from,effective_to,metadata) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(catalog,code,source_version) DO UPDATE SET label=EXCLUDED.label,effective_from=EXCLUDED.effective_from,effective_to=EXCLUDED.effective_to,metadata=EXCLUDED.metadata',
    [catalog,String(entry.code).trim(),String(entry.label).trim(),String(b.sourceVersion).trim(),entry.effectiveFrom||null,entry.effectiveTo||null,JSON.stringify(entry.metadata||{})]);count++;}
   await audit(req,client,'create','catalog_'+catalog,null,null,{sourceVersion:b.sourceVersion,count});
   await client.query('COMMIT');return res.status(201).json({catalog,sourceVersion:b.sourceVersion,imported:count});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
 });
 router.get('/api/v1/medication-interactions',requirePermission('prescriptions.read'),async(req,res,next)=>{
  if(!usingPostgres())return unavailable(res);
  const codes=Array.isArray(req.query.codes)?req.query.codes:String(req.query.codes||'').split(',').filter(Boolean);
  if(codes.length<2||codes.length>20)return res.status(400).json({erro:'Informe de 2 a 20 códigos de medicamentos.'});
  try{const loaded=await getPool().query('SELECT COUNT(*)::int AS count FROM medication_interaction_catalog');
   if(!loaded.rows[0].count)return res.status(503).json({erro:'Base oficial de interações ainda não foi carregada; não é possível concluir que não existam interações.',codigo:'INTERACTION_CATALOG_NOT_LOADED'});
   const r=await getPool().query('SELECT medication_code_a,medication_code_b,severity,description,source_version FROM medication_interaction_catalog WHERE medication_code_a=ANY($1::text[]) OR medication_code_b=ANY($1::text[]) ORDER BY severity',[codes]);
   return res.json({items:r.rows,sourceValidated:true});
  }catch(e){return next(e);}
 });
 router.get('/api/v1/billing-batches',requirePermission('billing.read'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  try{const r=await getPool().query('SELECT id,instrument,competence,status,record_ids,layout_version,created_by,created_at FROM billing_batches WHERE unit_id=$1 ORDER BY id DESC LIMIT 100',[unitOf(req)]);return res.json({items:r.rows});}
  catch(e){return next(e);}
 });
 router.post('/api/v1/billing-batches',requirePermission('billing.write'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const b=req.body||{};if(!['BPA-C','BPA-I','AIH','APAC'].includes(b.instrument)||!/^\d{6}$/.test(String(b.competence||''))||!Array.isArray(b.recordIds)||!b.recordIds.length||b.recordIds.length>500)return res.status(400).json({erro:'Instrumento, competência AAAAMM e lista de até 500 registros são obrigatórios.'});
  const client=await getPool().connect();
  try{await client.query('BEGIN');
   const records=await client.query('SELECT id FROM clinical_records WHERE id=ANY($1::bigint[]) AND unit_id=$2',[b.recordIds.map(Number),unitOf(req)]);
   if(records.rowCount!==b.recordIds.length){await client.query('ROLLBACK');return res.status(400).json({erro:'Um ou mais registros não pertencem à unidade ou não existem.'});}
   const a=actorOf(req),r=await client.query('INSERT INTO billing_batches(unit_id,instrument,competence,status,record_ids,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,instrument,competence,status,record_ids,created_at',
    [unitOf(req),b.instrument,String(b.competence),'pending_validation',b.recordIds.map(Number),a.username]);
   await audit(req,client,'create','billing_batch',r.rows[0].id,null,{instrument:b.instrument,recordCount:b.recordIds.length});
   await client.query('COMMIT');return res.status(201).json({batch:r.rows[0],exportEnabled:false});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
 });
 router.post('/api/v1/signatures/request',requirePermission('records.sign'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const provider=req.body?.provider,recordId=Number(req.body?.clinicalRecordId);
  if(!Number.isSafeInteger(recordId)||recordId<1)return res.status(400).json({erro:'Informe o identificador do documento clínico.'});
  try{const record=await getPool().query('SELECT id FROM clinical_records WHERE id=$1 AND unit_id=$2 AND resource_type IN (\'soap\',\'prescription\',\'document\',\'discharge\')',[recordId,unitOf(req)]);if(!record.rowCount)return res.status(404).json({erro:'Documento clínico não encontrado nesta unidade.'});}catch(e){return next(e);}
  if(!['GOVBR','ICP_BRASIL'].includes(provider))return res.status(400).json({erro:'Provedor deve ser GOVBR ou ICP_BRASIL.'});
  try{const r=await getPool().query('SELECT enabled,endpoint_configured,credentials_configured,homologated FROM external_integration_registry WHERE provider=$1',[provider]);
   if(!r.rowCount||!r.rows[0].enabled||!r.rows[0].endpoint_configured||!r.rows[0].credentials_configured||!r.rows[0].homologated)return res.status(503).json({erro:'Provedor de assinatura não está configurado e homologado. Nenhum documento foi assinado.',codigo:'SIGNATURE_PROVIDER_NOT_READY'});
   return res.status(501).json({erro:'O provedor está marcado como homologado, mas o adaptador de assinatura ainda não foi implementado. Nenhuma assinatura foi criada.',codigo:'SIGNATURE_ADAPTER_NOT_IMPLEMENTED'});
  }catch(e){return next(e);}
 });

 router.get('/api/v1/patient-summary/:cpf',requirePermission('records.read'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const cpf=normalizeCpf(req.params.cpf);if(!validCpf(cpf))return res.status(400).json({erro:'CPF inválido.'});
  const client=await getPool().connect();
  try{
   const patient=await client.query('SELECT id,name,cpf,cns,birth_date,sex_at_birth,gender_identity,race_color,mother_name FROM patients WHERE cpf=$1 AND unit_id=$2',[cpf,unitOf(req)]);
   if(!patient.rowCount)return res.status(404).json({erro:'Paciente não encontrado nesta unidade.'});
   const [allergies,conditions,records,alerts]=await Promise.all([
    client.query('SELECT allergy,created_at FROM patient_allergies WHERE patient_cpf=$1 ORDER BY created_at DESC',[cpf]),
    client.query('SELECT condition,created_at FROM patient_conditions WHERE patient_cpf=$1 ORDER BY created_at DESC',[cpf]),
    client.query("SELECT id,resource_type,status,data,created_at FROM clinical_records WHERE patient_cpf=$1 AND unit_id=$2 AND resource_type IN ('soap','vitals','diagnosis','prescription','exam_order','maternal_child','chronic_care','immunization') ORDER BY id DESC LIMIT 30",[cpf,unitOf(req)]),
    client.query('SELECT id,level,rule,message,details,happened_at FROM alerts WHERE patient_cpf=$1 AND resolved=FALSE ORDER BY happened_at DESC LIMIT 20',[cpf])
   ]);
   await audit(req,client,'read','patient_summary',patient.rows[0].id,cpf,{recordCount:records.rowCount});
   const latestSoap=records.rows.find(row=>row.resource_type==='soap');
   const medications=records.rows.filter(row=>row.resource_type==='prescription');
   return res.json({patient:patient.rows[0],allergies:allergies.rows,activeConditions:conditions.rows,medications,familyHistory:latestSoap?.data?.familyHistory||null,activeAlerts:alerts.rows,recentClinicalRecords:records.rows});
  }catch(e){return next(e);}finally{client.release();}
});
router.get('/api/v1/:resource',async(req,res,next)=>{
  const def=RESOURCE_DEFS[req.params.resource];if(!def)return next();
  return requirePermission(def.permission)(req,res,async error=>{
   if(error)return next(error);if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
   const limit=Math.min(100,Math.max(1,Number.parseInt(req.query.limit,10)||25)),cursor=req.query.cursor?Number(req.query.cursor):null;
   if(cursor!==null&&(!Number.isSafeInteger(cursor)||cursor<1))return res.status(400).json({erro:'Cursor inválido.'});
   const client=await getPool().connect();
   try{const r=await client.query('SELECT id,resource_type,patient_cpf,status,data,created_by,created_by_role,created_at,supersedes_id FROM clinical_records WHERE resource_type=$1 AND unit_id=$2 AND ($3::bigint IS NULL OR id<$3) ORDER BY id DESC LIMIT $4',[def.type,unitOf(req),cursor,limit]);
    for(const item of r.rows)await audit(req,client,'read',def.type,item.id,item.patient_cpf,{});
    return res.json({items:r.rows,nextCursor:r.rows.length===limit?String(r.rows[r.rows.length-1].id):null});
   }catch(e){return next(e);}finally{client.release();}
  });
 });
 router.get('/api/v1/:resource/:id',async(req,res,next)=>{
  const def=RESOURCE_DEFS[req.params.resource];if(!def)return next();
  return requirePermission(def.permission)(req,res,async error=>{
   if(error)return next(error);if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
   const id=Number(req.params.id);if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({erro:'Identificador inválido.'});
   const client=await getPool().connect();
   try{const r=await client.query('SELECT id,resource_type,patient_cpf,status,data,created_by,created_by_role,created_at,supersedes_id FROM clinical_records WHERE id=$1 AND resource_type=$2 AND unit_id=$3',[id,def.type,unitOf(req)]);
    if(!r.rowCount)return res.status(404).json({erro:'Registro não encontrado.'});
    await audit(req,client,'read',def.type,id,r.rows[0].patient_cpf,{});return res.json({item:r.rows[0]});
   }catch(e){return next(e);}finally{client.release();}
  });
 });
 router.post('/api/v1/:resource/:id/corrections',async(req,res,next)=>{
  const def=RESOURCE_DEFS[req.params.resource];if(!def)return next();
  return requirePermission(def.write)(req,res,async error=>{
   if(error)return next(error);if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
   const id=Number(req.params.id),v=validateResourcePayload(req.params.resource,req.body);
   if(!Number.isSafeInteger(id)||id<1)return res.status(400).json({erro:'Identificador original inválido.'});
   if(!v.ok)return res.status(400).json({erro:v.error,campos:v.missing||[]});
   const data=v.data,actor=actorOf(req),client=await getPool().connect();
   try{await client.query('BEGIN');
    const original=await client.query('SELECT id,patient_cpf FROM clinical_records WHERE id=$1 AND resource_type=$2 AND unit_id=$3 FOR SHARE',[id,def.type,unitOf(req)]);
    if(!original.rowCount){await client.query('ROLLBACK');return res.status(404).json({erro:'Registro original não encontrado nesta unidade.'});}
    if((data.patientCpf||null)!==(original.rows[0].patient_cpf||null)){await client.query('ROLLBACK');return res.status(409).json({erro:'Uma correção não pode alterar o vínculo do paciente.',codigo:'CORRECTION_PATIENT_MISMATCH'});}
    const catalogChecks=[];
    if(def.type==='soap')catalogChecks.push([data.diagnosisSystem==='CID-10'?'CID10':'CIAP2',data.diagnosisCode]);
    if(def.type==='diagnosis')catalogChecks.push([data.system==='CID-10'?'CID10':'CIAP2',data.code]);
    if(def.type==='prescription')catalogChecks.push(['RENAME',data.medicationCode]);
    if(def.type==='exam_order')catalogChecks.push(['SIGTAP',data.code]);
    if(def.type==='billing')catalogChecks.push(['SIGTAP',data.sigtapCode],['CBO',data.cboCode],['CID10',data.cidCode]);
    for(const [catalog,code] of catalogChecks){
     const state=await officialCodeState(client,catalog,code);
     if(!state.loaded){await client.query('ROLLBACK');return res.status(503).json({erro:'O catálogo oficial '+catalog+' ainda não foi importado. O registro foi bloqueado.',codigo:'OFFICIAL_CATALOG_NOT_LOADED',catalog});}
     if(!state.valid){await client.query('ROLLBACK');return res.status(400).json({erro:'Código não encontrado no catálogo oficial vigente: '+catalog+'.',codigo:'OFFICIAL_CODE_NOT_FOUND',catalog,code});}
    }
    if(def.professional&&!await requireProfessional(req,client)){await client.query('ROLLBACK');return res.status(409).json({erro:'Vínculo profissional CNS/CBO obrigatório.',codigo:'PROFESSIONAL_REGISTRATION_REQUIRED'});}
    const r=await client.query('INSERT INTO clinical_records(resource_type,patient_cpf,unit_id,status,data,created_by,created_by_role,supersedes_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,resource_type,patient_cpf,status,data,created_at,supersedes_id',
     [def.type,original.rows[0].patient_cpf,unitOf(req),'correction',JSON.stringify(data),actor.username,actor.role,id]);
    await audit(req,client,'update',def.type,r.rows[0].id,original.rows[0].patient_cpf,{supersedesId:id});
    await client.query('COMMIT');return res.status(201).json({item:r.rows[0],immutableOriginal:true});
   }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
  });
});
router.post('/api/v1/:resource',async(req,res,next)=>{
  const def=RESOURCE_DEFS[req.params.resource];if(!def)return next();
  return requirePermission(def.write)(req,res,async error=>{
   if(error)return next(error);if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
   const v=validateResourcePayload(req.params.resource,req.body);if(!v.ok)return res.status(400).json({erro:v.error,campos:v.missing||[]});
   const data=v.data;
   if(def.type==='vitals' && data.weightKg!==undefined && data.heightCm!==undefined && Number(data.heightCm)>0){
    const heightMeters=Number(data.heightCm)/100;data.bmi=Number((Number(data.weightKg)/(heightMeters*heightMeters)).toFixed(1));
   }
   if(def.type==='maternal_child' && data.kind==='prenatal' && data.lastMenstrualPeriod){
    const lmp=new Date(String(data.lastMenstrualPeriod)+'T00:00:00Z'),today=new Date();
    const days=Math.floor((Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate())-lmp.getTime())/86400000);
    if(!Number.isFinite(days)||days<0||days>300)return res.status(400).json({erro:'Data da última menstruação fora do intervalo aceito para cálculo gestacional.'});
    const due=new Date(lmp.getTime());due.setUTCDate(due.getUTCDate()+280);
    data.gestationalAgeDays=days;data.gestationalAgeWeeks=Math.floor(days/7);data.estimatedDueDate=due.toISOString().slice(0,10);
   }
   const actor=actorOf(req),client=await getPool().connect();
   try{await client.query('BEGIN');
    if(data.patientCpf){const p=await client.query('SELECT cpf FROM patients WHERE cpf=$1 AND unit_id=$2',[data.patientCpf,unitOf(req)]);if(!p.rowCount){await client.query('ROLLBACK');return res.status(404).json({erro:'Paciente não encontrado.'});}}
    if(def.type==='exam_result'){
     const exam=await client.query("SELECT id,patient_cpf FROM clinical_records WHERE id=$1 AND resource_type='exam_order' AND unit_id=$2 FOR SHARE",[Number(data.examRecordId),unitOf(req)]);
     if(!exam.rowCount||exam.rows[0].patient_cpf!==data.patientCpf){await client.query('ROLLBACK');return res.status(404).json({erro:'Solicitação de exame não encontrada para este paciente e unidade.'});}
    }
    if(def.professional&&!await requireProfessional(req,client)){await client.query('ROLLBACK');return res.status(409).json({erro:'Profissional sem vínculo CNS/CBO ativo na unidade. Cadastre o vínculo profissional antes de registrar este evento.',codigo:'PROFESSIONAL_REGISTRATION_REQUIRED'});}
    let status='recorded';if(def.type==='prescription')status='pending_professional_validation';if(def.type==='document')status='draft_pending_signature';if(def.type==='billing')status='pending_catalog_validation';if(def.type==='notification')status='draft_pending_external_submission';
    const r=await client.query('INSERT INTO clinical_records(resource_type,patient_cpf,unit_id,sector_id,status,data,created_by,created_by_role) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,resource_type,patient_cpf,unit_id,status,data,created_by,created_by_role,created_at',
     [def.type,data.patientCpf||null,actor.unit,req.user?.sector||null,status,JSON.stringify(data),actor.username,actor.role]);
    await audit(req,client,'create',def.type,r.rows[0].id,data.patientCpf,{status});await client.query('COMMIT');
    return res.status(201).json({item:r.rows[0],validation:'schema-validated',externalIntegration:'not-performed'});
   }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
  });
 });
 router.post('/api/v1/prescriptions/:id/validation',requirePermission('prescriptions.validate'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  const id=Number(req.params.id),decision=req.body?.decision;if(!Number.isSafeInteger(id)||id<1||!['approved','rejected'].includes(decision))return res.status(400).json({erro:'Informe prescrição válida e decisão approved/rejected.'});
  const client=await getPool().connect();
  try{await client.query('BEGIN');
   const original=await client.query("SELECT id,patient_cpf FROM clinical_records WHERE id=$1 AND resource_type='prescription' AND unit_id=$2 FOR SHARE",[id,unitOf(req)]);
   if(!original.rowCount){await client.query('ROLLBACK');return res.status(404).json({erro:'Prescrição não encontrada.'});}
   if(!await requireProfessional(req,client)){await client.query('ROLLBACK');return res.status(409).json({erro:'Vínculo profissional CNS/CBO obrigatório.',codigo:'PROFESSIONAL_REGISTRATION_REQUIRED'});}
   const a=actorOf(req),r=await client.query("INSERT INTO clinical_records(resource_type,patient_cpf,unit_id,status,data,created_by,created_by_role,supersedes_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status,data,created_at',
    ['prescription_validation',original.rows[0].patient_cpf,unitOf(req),decision,JSON.stringify({prescriptionRecordId:id,decision,reason:String(req.body.reason||'').slice(0,1000)}),a.username,a.role,id]);
   await audit(req,client,'create','prescription_validation',r.rows[0].id,original.rows[0].patient_cpf,{prescriptionRecordId:id,decision});await client.query('COMMIT');return res.status(201).json({validation:r.rows[0]});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
 });
 router.get('/api/v1/medication-lots',requirePermission('inventory.read'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);
  try{const r=await getPool().query('SELECT id,medication_code,medication_name,batch_number,manufacturer,expires_on,quantity_available FROM medication_lots WHERE unit_id=$1 ORDER BY expires_on ASC,id ASC LIMIT 200',[unitOf(req)]);return res.json({items:r.rows});}catch(e){return next(e);}
 });
 router.post('/api/v1/medication-lots',requirePermission('inventory.write'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);const b=req.body||{};
  if(!String(b.medicationCode||'').trim()||!String(b.medicationName||'').trim()||!String(b.batchNumber||'').trim()||!DATE_RE.test(String(b.expiresOn||''))||!Number.isFinite(Number(b.quantity))||Number(b.quantity)<=0)return res.status(400).json({erro:'Medicamento, lote, validade e quantidade positiva são obrigatórios.'});
  try{const state=await officialCodeState(getPool(),'RENAME',String(b.medicationCode));if(!state.loaded)return res.status(503).json({erro:'Catálogo RENAME oficial ainda não foi importado.',codigo:'OFFICIAL_CATALOG_NOT_LOADED',catalog:'RENAME'});if(!state.valid)return res.status(400).json({erro:'Código de medicamento não encontrado na RENAME vigente.'});const r=await getPool().query('INSERT INTO medication_lots(medication_code,medication_name,batch_number,manufacturer,expires_on,quantity_available,unit_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,medication_name,batch_number,expires_on,quantity_available',[b.medicationCode||null,String(b.medicationName).trim(),String(b.batchNumber).trim(),b.manufacturer||null,String(b.expiresOn).slice(0,10),Number(b.quantity),unitOf(req)]);return res.status(201).json({lot:r.rows[0]});}
  catch(e){if(e.code==='23505')return res.status(409).json({erro:'Lote já cadastrado nesta unidade.'});return next(e);}
 });
 router.post('/api/v1/prescriptions/:id/dispense',requirePermission('prescriptions.dispense'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);const id=Number(req.params.id),quantity=Number(req.body?.quantity);
  if(!Number.isSafeInteger(id)||!Number.isFinite(quantity)||quantity<=0)return res.status(400).json({erro:'Prescrição e quantidade válida são obrigatórias.'});
  const client=await getPool().connect();
  try{await client.query('BEGIN');
   const p=await client.query("SELECT id,patient_cpf,data FROM clinical_records WHERE id=$1 AND resource_type='prescription' AND unit_id=$2 FOR UPDATE",[id,unitOf(req)]);
   if(!p.rowCount){await client.query('ROLLBACK');return res.status(404).json({erro:'Prescrição não encontrada.'});}
   const approved=await client.query("SELECT id,status FROM clinical_records WHERE resource_type='prescription_validation' AND supersedes_id=$1 ORDER BY id DESC LIMIT 1",[id]);
   if(!approved.rowCount||approved.rows[0].status!=='approved'){await client.query('ROLLBACK');return res.status(409).json({erro:'A última decisão profissional não autoriza a dispensação.',codigo:'PRESCRIPTION_NOT_VALIDATED'});}
   const prescribed=Number(p.rows[0].data.quantity||0);
   const prior=await client.query('SELECT COALESCE(SUM(quantity),0) AS dispensed FROM medication_dispensing_events WHERE prescription_record_id=$1',[id]);
   const already=Number(prior.rows[0].dispensed||0);
   if(prescribed>0&&already+quantity>prescribed){await client.query('ROLLBACK');return res.status(409).json({erro:'Quantidade solicitada excede o saldo da prescrição.',codigo:'PRESCRIPTION_QUANTITY_EXCEEDED'});}
   const medCode=String(p.rows[0].data.medicationCode||'').trim();
   const lots=await client.query('SELECT id,batch_number,expires_on,quantity_available FROM medication_lots WHERE unit_id=$1 AND medication_code=$2 AND expires_on>=CURRENT_DATE AND quantity_available>0 ORDER BY expires_on ASC,id ASC FOR UPDATE',[unitOf(req),medCode]);
   const total=lots.rows.reduce((sum,row)=>sum+Number(row.quantity_available),0);if(total<quantity){await client.query('ROLLBACK');return res.status(409).json({erro:'Estoque válido insuficiente para dispensação.',codigo:'INSUFFICIENT_VALID_STOCK'});}
   let remaining=quantity;const allocations=[];
   for(const lot of lots.rows){if(remaining<=0)break;const qty=Math.min(remaining,Number(lot.quantity_available));
    await client.query('UPDATE medication_lots SET quantity_available=quantity_available-$1 WHERE id=$2',[qty,lot.id]);
    await client.query('INSERT INTO medication_dispensing_events(prescription_record_id,lot_id,quantity,dispensed_by,unit_id) VALUES($1,$2,$3,$4,$5)',[id,lot.id,qty,actorOf(req).username,unitOf(req)]);
    allocations.push({lotId:lot.id,batch:lot.batch_number,quantity:qty,expiresOn:lot.expires_on});remaining-=qty;
   }
   const a=actorOf(req),event=await client.query("INSERT INTO clinical_records(resource_type,patient_cpf,unit_id,status,data,created_by,created_by_role,supersedes_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,created_at',['dispensation',p.rows[0].patient_cpf,unitOf(req),'dispensed',JSON.stringify({prescriptionRecordId:id,quantity,allocations}),a.username,a.role,id]);
   await audit(req,client,'create','dispensation',event.rows[0].id,p.rows[0].patient_cpf,{prescriptionRecordId:id,quantity,lotCount:allocations.length});
   await client.query('COMMIT');return res.status(201).json({dispensation:event.rows[0],allocations,fefo:true});
  }catch(e){await client.query('ROLLBACK').catch(()=>{});return next(e);}finally{client.release();}
 });
 router.get('/api/v1/clinical-audit',requirePermission('clinical.audit.read'),async(req,res,next)=>{
  if(!ensureUnit(req,res))return;if(!usingPostgres())return unavailable(res);const limit=Math.min(100,Math.max(1,Number.parseInt(req.query.limit,10)||50));
  try{const r=await getPool().query('SELECT id,actor_username,actor_role,action,resource_type,resource_id,patient_ref_hash,request_id,happened_at,metadata FROM clinical_audit_events WHERE unit_id=$1 ORDER BY id DESC LIMIT $2',[unitOf(req),limit]);return res.json({items:r.rows,appendOnly:true});}catch(e){return next(e);}
 });
 return router;
}
module.exports={createClinicalPlatformRouter,RESOURCE_DEFS,validateResourcePayload,normalizeCpf};
