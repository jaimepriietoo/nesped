export const USERS = [
  {
    email: "demo@nesped.com",
    password: "demo123",
    clientId: "demo",
    clientName: "NESPED Demo",
  },
  {
    email: "clinica@nesped.com",
    password: "clinica123",
    clientId: "clinica",
    clientName: "Clínica Dental",
  },
];

export function findUser(email, password) {
  return USERS.find(
    (user) => user.email === email && user.password === password
  );
}