export const PERMISSION_BY_PATH: Record<string, string> = {
  '/app/dashboard': 'dashboard.read',
  '/app/plataforma-clinica': 'dashboard.read',
  '/app/dashboard-gerencial': 'reports.read',
  '/app/pacientes': 'patients.read',
  '/app/recepcao': 'appointments.read',
  '/app/agenda-medica': 'appointments.read',
  '/app/disponibilidade': 'appointments.read',
  '/app/triagem': 'triage.read',
  '/app/fila-chamada': 'queue.call',
  '/app/consultas': 'consultations.read',
  '/app/transferencias': 'hospitalizations.write',
  '/app/mapa-leitos': 'beds.read',
  '/app/internacoes': 'hospitalizations.read',
  '/app/alta-hospitalar': 'hospitalizations.write',
  '/app/evolucao-medica': 'consultations.write',
  '/app/evolucao-enfermagem': 'internacoes.write',
  '/app/plano-cuidados': 'internacoes.write',
  '/app/sinais-vitais': 'triage.write',
  '/app/prescricao-eletronica-avancada': 'prescriptions.write',
  '/app/administracao-medicamentos': 'prescriptions.dispense',
  '/app/protocolos-clinicos': 'settings.manage',
  '/app/alergias': 'patients.write',
  '/app/exames-laboratoriais': 'exams.read',
  '/app/exames-imagem': 'exams.read',
  '/app/cardiologia': 'consultations.read',
  '/app/sentinela-ai': 'ai.read',
  '/app/farmacia': 'prescriptions.read',
  '/app/farmacia-clinica': 'prescriptions.validate',
  '/app/controlados': 'prescriptions.dispense',
  '/app/estoque': 'inventory.read',
  '/app/movimentacao-estoque': 'inventory.write',
  '/app/validade-perdas': 'inventory.write',
  '/app/solicitacao-compras': 'purchasing.read',
  '/app/faturamento-sus': 'reports.read',
  '/app/producao-sus': 'reports.read',
  '/app/faturamento-dashboard': 'reports.read',
  '/app/glosas': 'reports.read',
  '/app/relatorios-producao': 'reports.read',
  '/app/profissionais': 'professionals.read',
  '/app/escalas': 'professionals.read',
  '/app/troca-plantao': 'professionals.read',
  '/app/frequencia': 'professionals.read',
  '/app/incidentes': 'alerts.read',
  '/app/indicadores-qualidade': 'reports.read',
  '/app/ccih-infeccao': 'reports.read',
  '/app/lgpd-consentimentos': 'settings.manage',
  '/app/trilha-auditoria': 'audit.read',
  '/app/alertas': 'alerts.read',
  '/app/safety-engine': 'safety.configure',
  '/app/notificacoes': 'dashboard.read',
  '/app/comunicados': 'dashboard.read',
  '/app/encaminhamentos': 'consultations.write',
  '/app/portal-paciente': 'patients.read',
  '/app/gestao-usuarios': 'users.read',
  '/app/gestao-perfis': 'roles.read',
  '/app/unidades-setores': 'units.read',
  '/app/acesso-unidade': 'units.read',
  '/app/configuracao-protocolos': 'settings.manage',
  '/app/config-safety': 'safety.configure',
  '/app/parametros-unidade': 'settings.manage',
  '/app/modulos': 'modules.manage',
  '/app/relatorios': 'reports.read',
  '/app/configuracoes': 'settings.manage'
};

export function readPermissions(): string[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem('sentinelaPermissions') || '[]');
    return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : [];
  } catch {
    return [];
  }
}

export function canAccessPermission(permission?: string): boolean {
  // Unknown routes and missing mappings must fail closed.
  if (!permission) return false;
  const permissions = readPermissions();
  // A sessão do navegador é estado não confiável: wildcard nunca concede acesso.
  // A autorização real continua sendo revalidada pelo backend em cada endpoint.
  return permission !== '*' && permissions.includes(permission);
}
