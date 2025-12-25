export interface LetterMetadata {
  title: string;
  date: string;
  description?: string;
  type: "love" | "christmas" | "anniversary" | "birthday";
  slug: string;
  hidden?: boolean;
}

export interface Letter {
  metadata: LetterMetadata;
  content: string;
  slug: string;
}

export interface LetterPassword {
  slug: string;
  hashedPassword: string;
}

export interface LetterPasswordStore {
  letters: LetterPassword[];
  adminPassword: string; // hashed
}
