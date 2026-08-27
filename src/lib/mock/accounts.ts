export type MockAccount = {
  emailAddress: string;
  label: string;
};

export const MOCK_ACCOUNTS: MockAccount[] = [
  { emailAddress: "alejandro@empresa.com", label: "Trabajo" },
  { emailAddress: "alejandro@consejoasesor.com", label: "Consejo" },
  { emailAddress: "acortes@personal.com", label: "Personal" },
];
