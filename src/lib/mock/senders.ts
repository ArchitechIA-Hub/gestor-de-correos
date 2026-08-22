export type MockSender = {
  email: string;
  name: string;
  isVip: boolean;
  vipReason?: string;
  organization?: string;
};

export const MOCK_SENDERS: MockSender[] = [
  // VIP — su correo siempre se prioriza sobre el orden cronológico normal.
  {
    email: "marta.ibanez@consejoasesor.com",
    name: "Marta Ibáñez",
    isVip: true,
    vipReason: "Presidenta del Consejo",
    organization: "Consejo Asesor",
  },
  {
    email: "javier.roldan@gruposolvento.com",
    name: "Javier Roldán",
    isVip: true,
    vipReason: "Cliente estratégico",
    organization: "Grupo Solvento",
  },
  {
    email: "elena.duarte@meridiancapital.com",
    name: "Elena Duarte",
    isVip: true,
    vipReason: "Socia inversora",
    organization: "Meridian Capital",
  },
  {
    email: "ricardo.paz@nortiaindustrial.com",
    name: "Ricardo Paz",
    isVip: true,
    vipReason: "Cliente clave (cuenta top 3)",
    organization: "Nortia Industrial",
  },
  {
    email: "sofia.wen@boardpartners.com",
    name: "Sofía Wen",
    isVip: true,
    vipReason: "Miembro del Consejo",
    organization: "Board Partners",
  },
  // No VIP — colegas internos, proveedores, y correspondencia habitual.
  { email: "carlos.mora@empresa.com", name: "Carlos Mora", isVip: false, organization: "Finanzas" },
  { email: "lucia.fernandez@empresa.com", name: "Lucía Fernández", isVip: false, organization: "Legal" },
  { email: "andres.gimenez@empresa.com", name: "Andrés Giménez", isVip: false, organization: "Recursos Humanos" },
  { email: "paula.rios@empresa.com", name: "Paula Ríos", isVip: false, organization: "Tecnología" },
  { email: "diego.salas@empresa.com", name: "Diego Salas", isVip: false, organization: "Operaciones" },
  { email: "natalia.cruz@empresa.com", name: "Natalia Cruz", isVip: false, organization: "Marketing" },
  { email: "victor.leiva@proveedorlogistico.com", name: "Víctor Leiva", isVip: false, organization: "Proveedor Logístico SA" },
  { email: "camila.ortiz@estudiojuridico.com", name: "Camila Ortiz", isVip: false, organization: "Estudio Jurídico Ortiz" },
  { email: "martin.suarez@reclutamientopro.com", name: "Martín Suárez", isVip: false, organization: "Reclutamiento Pro" },
  { email: "isabel.novoa@prensaeconomica.com", name: "Isabel Novoa", isVip: false, organization: "Prensa Económica" },
  { email: "notificaciones@bancoempresarial.com", name: "Banco Empresarial", isVip: false, organization: "Banco Empresarial" },
  { email: "soporte@herramientasaas.com", name: "Soporte HerramientaSaaS", isVip: false, organization: "HerramientaSaaS" },
  { email: "eventos@camaracomercio.com", name: "Cámara de Comercio", isVip: false, organization: "Cámara de Comercio" },
  { email: "newsletter@industryinsights.com", name: "Industry Insights", isVip: false, organization: "Industry Insights" },
  { email: "roberto.paez@empresa.com", name: "Roberto Páez", isVip: false, organization: "Ventas" },
];
