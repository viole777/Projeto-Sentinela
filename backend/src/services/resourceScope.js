'use strict';

async function assertCareTeamAccess(client, {
  username,
  role,
  unitId,
  sectorId,
  patientCpf,
  permission
}) {
  const hasScopedGrant = await client.query(
    `SELECT 1
       FROM patient_resource_access
      WHERE patient_cpf = $1
        AND username = $2
        AND permission = $3
        AND unit_id = $4
        AND (sector_id IS NULL OR sector_id = $5)
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [patientCpf, username, permission, unitId, sectorId || null]
  );
  if (hasScopedGrant.rowCount) return true;

  const team = await client.query(
    `SELECT 1
       FROM care_team_assignments
      WHERE patient_cpf = $1
        AND username = $2
        AND unit_id = $3
        AND active = TRUE
        AND (ended_at IS NULL OR ended_at > NOW())
      LIMIT 1`,
    [patientCpf, username, unitId]
  );
  if (team.rowCount) return true;

  return false;
}

function minimizePatientFields(role, patient) {
  const basic = {
    id: patient.id,
    name: patient.name,
    status: patient.status,
    created_at: patient.created_at
  };
  if (['medico', 'cardiologist', 'enfermagem', 'recepcao', 'triagem', 'direcao'].includes(role)) {
    return {
      ...basic,
      cpf: patient.cpf ? String(patient.cpf).replace(/^(\d{3})(\d+)(\d{2})$/, '$1***.***-$3') : null
    };
  }
  return basic;
}

module.exports = { assertCareTeamAccess, minimizePatientFields };
