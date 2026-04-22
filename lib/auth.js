export const USERS = [
  {
    email: "admin@nesped.com",
    password: "nesped123",
    clientId: "demo",
    clientName: "NESPED Demo",
    role: "admin",
  },
  {
    email: "demo@nesped.com",
    password: "demo123",
    clientId: "demo",
    clientName: "NESPED Demo",
    role: "client",
  },
  {
    email: "clinica@nesped.com",
    password: "clinica123",
    clientId: "clinica",
    clientName: "Clínica Dental",
    role: "client",
  },

  {
  email: "inmobiliaria@nesped.com",
  password: "inmo123",
  clientId: "inmobiliaria",
  clientName: "Inmobiliaria Pérez",
  role: "client",
}
];

export function findUser(email, password) {
  return USERS.find(
    (user) => user.email === email && user.password === password
  );
}

export function findUserByEmail(email) {
  return USERS.find((user) => user.email === email) || null;
}

export function findUserByEmailAndClient(email, clientId) {
  return (
    USERS.find(
      (user) => user.email === email && user.clientId === clientId
    ) || null
  );
}
